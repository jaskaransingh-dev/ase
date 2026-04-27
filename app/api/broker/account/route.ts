/**
 * GET /api/broker/account
 *
 * Returns user's Kraken trading account status for dashboard display.
 * Replaces the old Alpaca broker/account endpoint.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { krakenClientForUser } from '@/lib/kraken-client'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ has_account: false, account_id: null, account_number: null, status: 'not_connected', trading_enabled: false })
    }

    const client = await krakenClientForUser(user.id)
    if (!client) {
      return NextResponse.json({
        has_account: false,
        account_id: null,
        account_number: null,
        status: 'not_connected',
        trading_enabled: false,
        cash: '0',
        portfolio_value: '0',
        message: 'Connect your Kraken API keys to enable live trading',
      })
    }

    const balance = await client.getBalance()

    return NextResponse.json({
      has_account: true,
      account_id: 'kraken',
      account_number: 'kraken',
      status: 'ACTIVE',
      trading_enabled: true,
      cash: balance.freeUsd.toFixed(2),
      portfolio_value: balance.cashUsd.toFixed(2),
      equity_cents: Math.round(balance.cashUsd * 100),
      cash_cents: Math.round(balance.freeUsd * 100),
      provider: 'kraken',
      positions: balance.positions.map(p => ({
        symbol: p.asset,
        qty: p.qty,
        market_value: p.usdValue.toFixed(2),
      })),
    })
  } catch (err: unknown) {
    console.error('[broker/account] Error:', err)
    return NextResponse.json({
      has_account: false,
      account_id: null,
      account_number: null,
      status: 'error',
      trading_enabled: false,
      cash: '0',
      portfolio_value: '0',
    })
  }
}
