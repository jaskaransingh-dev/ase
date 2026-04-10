/**
 * POST /api/coinbase/sync-balance
 *
 * Fetch user's Coinbase USD balance and sync to ASE wallet.
 *
 * This endpoint:
 * 1. Gets user's stored Coinbase API credentials
 * 2. Calls Coinbase API to get account balance
 * 3. Updates wallet.balance_cents with current balance
 * 4. Returns synced balance
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptAES } from '@/lib/crypto/encryption'
import { fetchCoinbaseUSDBalance } from '@/lib/coinbase/api'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()

    // Get user's Coinbase connection
    const { data: connection } = await admin
      .from('coinbase_connections')
      .select('encrypted_key, encrypted_secret, encrypted_passphrase')
      .eq('user_id', user.id)
      .single()

    if (!connection) {
      return NextResponse.json({
        error: 'Coinbase account not connected. Connect your account first.',
      }, { status: 404 })
    }

    // Decrypt credentials
    const key = decryptAES(connection.encrypted_key)
    const secret = decryptAES(connection.encrypted_secret)
    const passphrase = decryptAES(connection.encrypted_passphrase)

    // Fetch balance from Coinbase API
    const balanceCents = await fetchCoinbaseUSDBalance({
      key,
      secret,
      passphrase,
    })

    // Update wallet
    await admin
      .from('wallets')
      .update({
        balance_cents: balanceCents,
        last_synced_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)

    console.log(`[sync-balance] User ${user.id}: $${(balanceCents / 100).toFixed(2)}`)

    return NextResponse.json({
      ok: true,
      usd_balance_cents: balanceCents,
      synced_at: new Date().toISOString(),
    })
  } catch (err: unknown) {
    console.error('sync-balance error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to sync balance' },
      { status: 500 }
    )
  }
}
