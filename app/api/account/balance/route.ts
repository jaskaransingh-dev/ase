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
    const { data: brokerAccount, error: accError } = await admin
      .from('broker_accounts')
      .select('alpaca_account_id, status, trading_enabled')
      .eq('user_id', user.id)
      .single()

    if (accError) {
      console.log('[Balance] No broker account found for user, error:', accError.message)
    }

    if (!brokerAccount || !brokerAccount.alpaca_account_id) {
      console.log('[Balance] User has no alpaca_account_id')
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

    // Accept any account status - even onboarding accounts should show balance
    console.log('[Balance] Broker account status:', brokerAccount.status, 'account:', brokerAccount.alpaca_account_id)

    // Try to get live balance from Alpaca (use trading account endpoint which works better)
    let cashCents = 0
    let equityCents = 0
    let buyingPowerCents = 0
    let cryptoStatus = 'INACTIVE'

    try {
      const broker = createBrokerAPI()
      const trading = await broker.getTradingAccount(brokerAccount.alpaca_account_id)
      cashCents = Math.round(parseFloat(trading.cash || '0') * 100)
      equityCents = Math.round(parseFloat(trading.equity || '0') * 100)
      buyingPowerCents = Math.round(parseFloat(trading.buying_power || '0') * 100)
      cryptoStatus = trading.crypto_status || 'INACTIVE'
      console.log('[Balance] Got trading account data:', trading)
    } catch (e) {
      console.log('[Balance] Could not fetch trading account:', e)
    }

    return NextResponse.json({
      equity_cents: equityCents,
      cash_cents: cashCents,
      buying_power_cents: buyingPowerCents,
      cash: (cashCents / 100).toFixed(2),
      portfolio_value: (equityCents / 100).toFixed(2),
      status: equityCents > 0 ? 'connected' : 'no_funds',
      crypto_status: cryptoStatus,
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