/**
 * POST /api/broker/fund-paper
 *
 * Add virtual funds to a sandbox Alpaca Broker account.
 *
 * Correct Broker API flow:
 * 1) Look up the user's Alpaca account_id
 * 2) Ensure there is an APPROVED ACH relationship for that account
 * 3) POST /v1/accounts/{account_id}/transfers with:
 *    - transfer_type: "ach"
 *    - relationship_id
 *    - direction: "INCOMING"
 *    - timing: "immediate"
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createBrokerAPI } from '@/lib/broker'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const amount_cents = Number(body?.amount_cents ?? 0)
    const amountDollars = amount_cents / 100

    if (!Number.isFinite(amount_cents) || amount_cents < 100) {
      return NextResponse.json({ error: 'Minimum $1.00' }, { status: 400 })
    }

    if (amountDollars > 1_000_000) {
      return NextResponse.json(
        { error: 'Maximum $1,000,000 per deposit' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    const { data: brokerAccount, error: brokerAccountError } = await admin
      .from('broker_accounts')
      .select('alpaca_account_id, account_number, status')
      .eq('user_id', user.id)
      .maybeSingle()

    if (brokerAccountError) {
      console.error('[Paper Funding] DB error loading broker account:', brokerAccountError)
      return NextResponse.json(
        { error: 'Failed to load broker account' },
        { status: 500 }
      )
    }

    if (!brokerAccount?.alpaca_account_id) {
      return NextResponse.json(
        { error: 'No Alpaca account found. Create an account first.' },
        { status: 400 }
      )
    }

    const broker = createBrokerAPI()
    const alpacaAccountId = brokerAccount.alpaca_account_id

    // Confirm the account exists in Alpaca and is usable
    let tradingAccount: {
      id: string
      account_number: string
      cash?: string
      status?: string
    }
    try {
      tradingAccount = await broker.getTradingAccount(alpacaAccountId)
      console.log('[Paper Funding] Trading account from Alpaca:', {
        id: tradingAccount.id,
        accountNumber: tradingAccount.account_number,
        cash: tradingAccount.cash,
        status: tradingAccount.status,
      })
    } catch (e) {
      console.error('[Paper Funding] Could not get trading account:', e)
      return NextResponse.json(
        {
          error: 'Could not retrieve your Alpaca trading account.',
          details: e instanceof Error ? e.message : 'Unknown error',
        },
        { status: 400 }
      )
    }

    if (!tradingAccount?.id) {
      return NextResponse.json(
        { error: 'Invalid Alpaca account returned from API.' },
        { status: 400 }
      )
    }

    if (
      tradingAccount.status &&
      tradingAccount.status !== 'ACTIVE' &&
      tradingAccount.status !== 'APPROVED'
    ) {
      return NextResponse.json(
        {
          error: `Account is not fundable yet. Current Alpaca status: ${tradingAccount.status}`,
        },
        { status: 400 }
      )
    }

    // Ensure we have an APPROVED ACH relationship
    let relationshipId: string
    try {
      relationshipId = await broker.ensureSandboxAchRelationship({
        accountId: alpacaAccountId,
        accountOwnerName: user.email ?? 'Sandbox User',
      })
      console.log('[Paper Funding] Using ACH relationship:', relationshipId)
    } catch (e) {
      console.error('[Paper Funding] Failed to ensure ACH relationship:', e)
      return NextResponse.json(
        {
          error: 'Could not create or retrieve ACH relationship for sandbox funding.',
          details: e instanceof Error ? e.message : 'Unknown error',
        },
        { status: 400 }
      )
    }

    // Create the incoming ACH transfer
    let fundResult: { id?: string; status?: string } = {}
    try {
      fundResult = await broker.fundSandboxAccount({
        accountId: alpacaAccountId,
        relationshipId,
        amount: amountDollars.toFixed(2),
      })
      console.log('[Paper Funding] Transfer created:', fundResult)
    } catch (e) {
      console.error('[Paper Funding] Transfer error:', e)
      const errorMsg = e instanceof Error ? e.message : 'Unknown error'

      if (errorMsg.includes('maximum number of ACH transfers allowed')) {
        return NextResponse.json(
          {
            error: 'Daily ACH funding limit reached.',
            details:
              'Alpaca allows only one ACH transfer per trading day in each direction for this account. Please wait until the next trading day, or check whether today\'s deposit is still queued.',
            code: 'DAILY_ACH_LIMIT_REACHED',
          },
          { status: 400 }
        )
      }

      if (errorMsg.includes('401') || errorMsg.includes('403')) {
        return NextResponse.json(
          {
            error: 'Authentication failed. Check Alpaca Broker sandbox credentials.',
            details: errorMsg,
          },
          { status: 400 }
        )
      }

      return NextResponse.json(
        {
          error: 'Failed to add funds to paper account.',
          details: errorMsg,
        },
        { status: 400 }
      )
    }

    // Fetch updated balance
    let newCashCents = 0
    try {
      const updatedAccount = await broker.getTradingAccount(alpacaAccountId)
      newCashCents = Math.round(parseFloat(updatedAccount.cash || '0') * 100)
      console.log('[Paper Funding] Updated cash from Alpaca:', newCashCents, 'cents')
    } catch (e) {
      console.warn('[Paper Funding] Could not fetch updated trading account:', e)
      try {
        const balances = await broker.getBalances(alpacaAccountId)
        newCashCents = Math.round(parseFloat(balances.cash || '0') * 100)
        console.log('[Paper Funding] Updated cash from balances:', newCashCents, 'cents')
      } catch (balanceErr) {
        console.warn('[Paper Funding] Could not fetch balances either:', balanceErr)
      }
    }

    // Best-effort ledger write
    try {
      await admin.from('ledger_entries').insert({
        user_id: user.id,
        type: 'deposit',
        amount_cents,
        reference_type: 'paper_funding',
        reference_id: fundResult?.id || `paper-${Date.now()}`,
        running_balance_cents: newCashCents,
        note: `Paper deposit: $${amountDollars.toFixed(2)}`,
      })
    } catch (ledgerErr) {
      console.warn('[Paper Funding] ledger_entries insert skipped/failed:', ledgerErr)
    }

    return NextResponse.json({
      success: true,
      amount_added_cents: amount_cents,
      new_balance_cents: newCashCents,
      transfer_id: fundResult?.id,
      transfer_status: fundResult?.status ?? 'UNKNOWN',
      message: fundResult?.status === 'APPROVED' || fundResult?.status === 'COMPLETE'
        ? `Added $${amountDollars.toFixed(2)} to your paper account`
        : `Transfer queued (${{ amount: amountDollars.toFixed(2) }}). Status: ${fundResult?.status ?? 'UNKNOWN'}. Funds will appear when transfer completes (10-30 min in sandbox).`,
    })
  } catch (err: unknown) {
    console.error('[Paper Funding] Fatal error:', err)
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Failed to add funds',
      },
      { status: 500 }
    )
  }
}
