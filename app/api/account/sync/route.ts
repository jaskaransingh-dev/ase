/**
 * POST /api/account/sync
 *
 * Sync user's Kraken account balances.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { krakenClientForUser } from '@/lib/kraken-client'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const client = await krakenClientForUser(user.id)
    if (!client) {
      return NextResponse.json({ error: 'No connected Kraken account' }, { status: 404 })
    }

    const balance = await client.getBalance()
    const admin = createAdminClient()

    await admin.from('account_balances').upsert({
      user_id: user.id,
      provider: 'kraken',
      equity_cents: Math.round(balance.cashUsd * 100),
      cash_cents: Math.round(balance.cashUsd * 100),
      buying_power_cents: Math.round(balance.freeUsd * 100),
      portfolio_value_cents: Math.round(balance.cashUsd * 100),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,provider',
    })

    return NextResponse.json({
      success: true,
      equity_cents: Math.round(balance.cashUsd * 100),
      cash_cents: Math.round(balance.cashUsd * 100),
      buying_power_cents: Math.round(balance.freeUsd * 100),
    })
  } catch (err: unknown) {
    console.error('account sync error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}