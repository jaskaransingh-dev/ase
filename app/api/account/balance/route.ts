/**
 * GET /api/account/balance
 *
 * Returns user's trading account balance from broker_accounts table
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createBrokerAPI } from '@/lib/broker'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()

    // Get broker account
    const { data: brokerAccount } = await admin
      .from('broker_accounts')
      .select('alpaca_account_id, status, trading_enabled')
      .eq('user_id', user.id)
      .single()

    if (!brokerAccount || brokerAccount.status !== 'ACTIVE') {
      return NextResponse.json({
        equity_cents: 0,
        cash_cents: 0,
        buying_power_cents: 0,
        status: 'not_connected',
        provider: null,
        account_id: null,
        message: 'Connect your trading account to see your balance',
      })
    }

    // Try to get live balance from Alpaca
    let cashCents = 0
    let equityCents = 0

    try {
      const broker = createBrokerAPI()
      const balances = await broker.getBalances(brokerAccount.alpaca_account_id)
      cashCents = Math.round(parseFloat(balances.cash || '0') * 100)
      equityCents = Math.round(parseFloat(balances.portfolio_value || '0') * 100)
    } catch (e) {
      console.log('[Balance] Could not fetch live balance:', e)
    }

    return NextResponse.json({
      equity_cents: equityCents,
      cash_cents: cashCents,
      cash: (cashCents / 100).toFixed(2),
      portfolio_value: (equityCents / 100).toFixed(2),
      status: 'connected',
      provider: 'alpaca',
      account_id: brokerAccount.alpaca_account_id,
    })
  } catch (err: unknown) {
    console.error('account balance error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}