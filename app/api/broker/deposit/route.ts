/**
 * POST /api/broker/deposit
 * 
 * Initiate a deposit to user's brokerage account
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
    const { amount_cents, bank_link_id } = body

    if (!amount_cents || amount_cents < 1000) {  // Minimum $10
      return NextResponse.json({ error: 'Minimum deposit is $10' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Get user's broker account
    const { data: brokerAccount } = await admin
      .from('broker_accounts')
      .select('alpaca_account_id, status')
      .eq('user_id', user.id)
      .single()

    if (!brokerAccount) {
      return NextResponse.json({ error: 'No brokerage account. Open an account first.' }, { status: 400 })
    }

    if (brokerAccount.status !== 'ACTIVE') {
      return NextResponse.json({ error: `Account status is ${brokerAccount.status}. Must be ACTIVE to deposit.` }, { status: 400 })
    }

    // Get bank link
    let linkId = bank_link_id
    if (!linkId) {
      const { data: primaryLink } = await admin
        .from('bank_links')
        .select('id, alpaca_relationship_id, status')
        .eq('user_id', user.id)
        .eq('is_primary', true)
        .single()
      
      if (!primaryLink || primaryLink.status !== 'ACTIVE') {
        return NextResponse.json({ error: 'No active bank link. Please link a bank account first.' }, { status: 400 })
      }
      linkId = primaryLink.alpaca_relationship_id
    }

    // Calculate amount in dollars
    const amount = (amount_cents / 100).toFixed(2)

    // Create transfer via Broker API
    const broker = createBrokerAPI()
    const transfer = await broker.createTransfer(brokerAccount.alpaca_account_id, {
      transfer_type: 'ach',
      relationship_id: linkId,
      amount,
      direction: 'INCOMING',
    })

    // Store in database
    await admin.from('broker_transfers').insert({
      user_id: user.id,
      alpaca_transfer_id: transfer.id,
      bank_link_id: bank_link_id,
      type: 'deposit',
      direction: 'INCOMING',
      amount_cents,
      status: transfer.status,
    })

    console.log('[Broker Deposit] Initiated:', transfer.id, 'Amount:', amount)

    return NextResponse.json({
      transfer_id: transfer.id,
      amount: amount,
      status: transfer.status,
      message: 'Deposit initiated. Funds will arrive in 2-5 business days.',
    })
  } catch (err: unknown) {
    console.error('[Broker Deposit] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Deposit failed' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/broker/deposit
 * 
 * Get deposit history and bank links
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()

    // Get bank links
    const { data: bankLinks } = await admin
      .from('bank_links')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    // Get transfers
    const { data: transfers } = await admin
      .from('broker_transfers')
      .select('*')
      .eq('user_id', user.id)
      .eq('type', 'deposit')
      .order('created_at', { ascending: false })
      .limit(20)

    // Get balances if account exists
    let balances = null
    const { data: brokerAccount } = await admin
      .from('broker_accounts')
      .select('alpaca_account_id, status')
      .eq('user_id', user.id)
      .single()

    if (brokerAccount?.status === 'ACTIVE') {
      try {
        const broker = createBrokerAPI()
        balances = await broker.getBalances(brokerAccount.alpaca_account_id)
      } catch (e) {
        console.log('[Broker] Could not get balances:', e)
      }
    }

    return NextResponse.json({
      bank_links: bankLinks || [],
      transfers: transfers || [],
      balances,
    })
  } catch (err: unknown) {
    console.error('[Broker Deposit] GET Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to get deposit info' },
      { status: 500 }
    )
  }
}