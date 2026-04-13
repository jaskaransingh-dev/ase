/**
 * POST /api/broker/withdraw
 * 
 * Initiate a withdrawal from brokerage account
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

    if (!amount_cents || amount_cents < 1000) {
      return NextResponse.json({ error: 'Minimum withdrawal is $10' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: brokerAccount } = await admin
      .from('broker_accounts')
      .select('alpaca_account_id, status')
      .eq('user_id', user.id)
      .single()

    if (!brokerAccount) {
      return NextResponse.json({ error: 'No brokerage account' }, { status: 400 })
    }

    if (brokerAccount.status !== 'ACTIVE') {
      return NextResponse.json({ error: `Account status is ${brokerAccount.status}. Must be ACTIVE to withdraw.` }, { status: 400 })
    }

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

    const amount = (amount_cents / 100).toFixed(2)

    const broker = createBrokerAPI()
    const transfer = await broker.createTransfer(brokerAccount.alpaca_account_id, {
      transfer_type: 'ach',
      relationship_id: linkId,
      amount,
      direction: 'OUTGOING',
    })

    await admin.from('broker_transfers').insert({
      user_id: user.id,
      alpaca_transfer_id: transfer.id,
      bank_link_id: bank_link_id,
      type: 'withdrawal',
      direction: 'OUTGOING',
      amount_cents,
      status: transfer.status,
    })

    console.log('[Broker Withdraw] Initiated:', transfer.id, 'Amount:', amount)

    return NextResponse.json({
      transfer_id: transfer.id,
      amount: amount,
      status: transfer.status,
      message: 'Withdrawal initiated. Funds will arrive in 2-5 business days.',
    })
  } catch (err: unknown) {
    console.error('[Broker Withdraw] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Withdrawal failed' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()

    const { data: transfers } = await admin
      .from('broker_transfers')
      .select('*')
      .eq('user_id', user.id)
      .eq('type', 'withdrawal')
      .order('created_at', { ascending: false })
      .limit(20)

    return NextResponse.json({ withdrawals: transfers || [] })
  } catch (err: unknown) {
    console.error('[Broker Withdraw] GET Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to get withdrawals' },
      { status: 500 }
    )
  }
}