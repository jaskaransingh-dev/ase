/**
 * POST /api/broker/fund-paper
 * 
 * Add virtual funds to paper trading account using Alpaca Demo Funding API
 * In sandbox, transfers are simulated and applied immediately
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptAES } from '@/lib/crypto/encryption'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { amount_cents } = body
    const amountDollars = amount_cents / 100

    if (!amount_cents || amount_cents < 100) {
      return NextResponse.json({ error: 'Minimum $1' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Get user's broker account (use maybeSingle to handle no row gracefully)
    const { data: brokerAccount } = await admin
      .from('broker_accounts')
      .select('alpaca_account_id, account_number, status')
      .eq('user_id', user.id)
      .maybeSingle()

    // Fall back to connected_accounts if no broker_accounts
    let alpacaAccountId = brokerAccount?.alpaca_account_id
    let alpacaAccountNumber = brokerAccount?.account_number
    
    if (!alpacaAccountId) {
      const { data: connection } = await admin
        .from('connected_accounts')
        .select('account_id')
        .eq('user_id', user.id)
        .eq('provider', 'alpaca')
        .maybeSingle()
      
      alpacaAccountId = connection?.account_id
    }

    if (!alpacaAccountId) {
      return NextResponse.json({ error: 'No Alpaca account found. Create account first.' }, { status: 400 })
    }

    if (!alpacaAccountNumber) {
      return NextResponse.json({ error: 'Account number not found. Create account first.' }, { status: 400 })
    }

    // Get sandbox broker credentials
    const brokerKey = process.env.ALPACA_BROKER_SANDBOX_KEY || process.env.BROKER_API_KEY_ID
    const brokerSecret = process.env.ALPACA_BROKER_SANDBOX_SECRET || process.env.BROKER_API_SECRET_KEY

    if (!brokerKey || !brokerSecret) {
      console.error('[Paper Funding] Missing broker credentials:', {
        hasSandboxKey: !!process.env.ALPACA_BROKER_SANDBOX_KEY,
        hasSandboxSecret: !!process.env.ALPACA_BROKER_SANDBOX_SECRET,
        hasBrokerKey: !!process.env.BROKER_API_KEY_ID,
        hasBrokerSecret: !!process.env.BROKER_API_SECRET_KEY,
      })
      return NextResponse.json({ 
        error: 'Broker not configured',
        details: 'Missing ALPACA_BROKER_SANDBOX_KEY and ALPACA_BROKER_SANDBOX_SECRET env vars'
      }, { status: 500 })
    }

    console.log('[Paper Funding] Using sandbox demo funding for account:', alpacaAccountNumber, 'amount:', amountDollars)
    console.log('[Paper Funding] Broker key:', brokerKey?.slice(0, 10) + '...')

    // Use demo funding endpoint with Basic Auth
    const demoFundingUrl = 'https://broker-api.sandbox.alpaca.markets/v1beta/demo/banking/funding'
    
    // Basic Auth credentials
    const credentials = Buffer.from(`${brokerKey}:${brokerSecret}`).toString('base64')
    
    const res = await fetch(demoFundingUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        receiver_account_number: alpacaAccountNumber,
        amount: String(amountDollars),
        currency: 'USD',
        direction: 'INCOMING',
      }),
    })

    const text = await res.text()
    let data: unknown = null
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }

    if (!res.ok) {
      console.error('[Paper Funding] Alpaca API error:', { status: res.status, body: data })
      return NextResponse.json({ 
        error: 'Failed to add funds to Alpaca',
        details: data
      }, { status: 400 })
    }

    console.log('[Paper Funding] Demo funding successful:', data)

    // Record in database
    await admin.from('ledger_entries').insert({
      user_id: user.id,
      type: 'deposit',
      amount_cents,
      reference_type: 'paper_funding',
      reference_id: (data as { id?: string })?.id || `paper-${Date.now()}`,
      running_balance_cents: amount_cents,
      note: 'Paper trading deposit',
    })

    // Get updated balance
    let newCashCents = amount_cents
    try {
      const accountRes = await fetch('https://paper-api.alpaca.markets/v2/account', {
        headers: {
          'APCA-API-KEY-ID': brokerKey,
          'APCA-API-SECRET-KEY': brokerSecret,
        },
      })
      if (accountRes.ok) {
        const accountData = await accountRes.json()
        newCashCents = Math.round(parseFloat(accountData.cash) * 100)
      }
    } catch (e) {
      console.log('[Paper Funding] Could not fetch updated balance:', e)
    }

    return NextResponse.json({
      success: true,
      amount_added_cents: amount_cents,
      new_balance_cents: newCashCents,
      transfer_id: (data as { id?: string })?.id,
      message: `Added $${amountDollars.toFixed(2)}`,
    })
  } catch (err: unknown) {
    console.error('[Paper Funding] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}