/**
 * POST /api/broker/fund-paper
 * 
 * Add virtual funds to paper trading account
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

    if (!amount_cents || amount_cents < 1000) {
      return NextResponse.json({ error: 'Minimum $10' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Get user's broker account
    const { data: brokerAccount } = await admin
      .from('broker_accounts')
      .select('alpaca_account_id, status')
      .eq('user_id', user.id)
      .single()

    if (!brokerAccount || brokerAccount.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'No active account' }, { status: 400 })
    }

    // Record the deposit in ledger
    await admin.from('ledger_entries').insert({
      user_id: user.id,
      type: 'deposit',
      amount_cents,
      reference_type: 'paper_funding',
      reference_id: `paper-${Date.now()}`,
      running_balance_cents: amount_cents,
      note: 'Paper trading deposit',
    })

    console.log('[Paper Funding] Added:', amount_cents)

    return NextResponse.json({
      success: true,
      amount_added_cents: amount_cents,
      message: `Added $${(amount_cents / 100).toFixed(2)}`,
    })
  } catch (err: unknown) {
    console.error('[Paper Funding] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}