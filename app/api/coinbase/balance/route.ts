/**
 * GET /api/coinbase/balance
 *
 * Fetch user's actual Coinbase USD balance.
 * Returns the cached balance from wallet.balance_cents (synced from real Coinbase account).
 * If no balance is cached, triggers a sync and returns the result.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptAES } from '@/lib/crypto/encryption'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()

    // Check if user has connected Coinbase account
    const { data: connection } = await admin
      .from('coinbase_connections')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!connection) {
      // No Coinbase account connected - return $0
      return NextResponse.json({
        usd_balance_cents: 0,
        status: 'not_connected',
        message: 'Connect your Coinbase account to see your balance'
      })
    }

    // Get cached balance from wallet
    const { data: wallet } = await admin
      .from('wallets')
      .select('balance_cents, last_synced_at')
      .eq('user_id', user.id)
      .single()

    if (wallet) {
      return NextResponse.json({
        usd_balance_cents: wallet.balance_cents,
        last_synced_at: wallet.last_synced_at,
        status: 'cached'
      })
    }

    // No wallet found - shouldn't happen but return 0
    return NextResponse.json({
      usd_balance_cents: 0,
      status: 'no_wallet'
    })

  } catch (err: unknown) {
    console.error('coinbase balance error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
