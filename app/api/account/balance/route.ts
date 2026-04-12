/**
 * GET /api/account/balance
 *
 * Returns user's connected account balance from the new connected_accounts system.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()

    const { data: connection } = await admin
      .from('connected_accounts')
      .select('id, provider, status, account_id, account_number, created_at, last_synced_at')
      .eq('user_id', user.id)
      .eq('provider', 'alpaca')
      .single()

    if (!connection || connection.status !== 'active') {
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

    const { data: balance } = await admin
      .from('account_balances')
      .select('equity_cents, cash_cents, buying_power_cents, portfolio_value_cents, updated_at')
      .eq('user_id', user.id)
      .eq('provider', 'alpaca')
      .single()

    return NextResponse.json({
      equity_cents: balance?.equity_cents ?? 0,
      cash_cents: balance?.cash_cents ?? 0,
      buying_power_cents: balance?.buying_power_cents ?? 0,
      portfolio_value_cents: balance?.portfolio_value_cents ?? 0,
      status: 'connected',
      provider: 'alpaca',
      account_id: connection.account_id,
      account_number: connection.account_number,
      connected_at: connection.created_at,
      updated_at: balance?.updated_at,
    })
  } catch (err: unknown) {
    console.error('account balance error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}