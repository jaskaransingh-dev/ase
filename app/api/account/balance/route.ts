/**
 * GET /api/account/balance
 *
 * Returns user's Kraken trading account balance
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const client = await krakenClientForUser(user.id)
    if (!client) {
      return NextResponse.json({
        equity_cents: 0,
        cash_cents: 0,
        buying_power_cents: 0,
        status: 'not_connected',
        provider: 'kraken',
        account_id: null,
        message: 'Connect your Kraken account to see your balance',
      })
    }

    const balance = await client.getBalance()

    return NextResponse.json({
      equity_cents: Math.round(balance.cashUsd * 100),
      cash_cents: Math.round(balance.cashUsd * 100),
      buying_power_cents: Math.round(balance.freeUsd * 100),
      cash: balance.cashUsd.toFixed(2),
      portfolio_value: balance.cashUsd.toFixed(2),
      status: 'connected',
      provider: 'kraken',
      account_id: 'kraken',
    })
  } catch (err: unknown) {
    console.error('account balance error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}