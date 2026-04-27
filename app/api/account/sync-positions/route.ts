/**
 * POST /api/account/sync-positions
 *
 * Sync user's Kraken positions and update holdings to reflect real state.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncKrakenBalance } from '@/lib/user-trading'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()

    const { data: krakenKeys } = await admin
      .from('user_kraken_keys')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!krakenKeys) {
      return NextResponse.json({
        message: 'No Kraken account connected',
        synced: 0,
      })
    }

    const balance = await syncKrakenBalance(admin, user.id)

    return NextResponse.json({
      success: true,
      synapse: 1,
      balance: {
        cash_cents: balance.cash,
        equity_cents: balance.equity,
      },
      message: 'Synced Kraken balance',
    })
  } catch (err: unknown) {
    console.error('sync-positions error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return POST()
}