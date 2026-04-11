/**
 * POST /api/auth/coinbase-accounts
 *
 * OAuth callback to connect user's Coinbase account.
 * Stores encrypted Coinbase API credentials for future balance/transaction queries.
 *
 * This is different from Coinbase OAuth (which is for login).
 * This is for account-linking to access their wallet balance and execute transfers.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encryptAES } from '@/lib/crypto/encryption'
import { validateCoinbaseCredentials, fetchCoinbaseUSDBalance } from '@/lib/coinbase/api'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { code } = await req.json()
    if (!code) {
      return NextResponse.json({ error: 'OAuth code required' }, { status: 400 })
    }

    // TODO: Exchange OAuth code for Coinbase API credentials
    // This would call Coinbase's token exchange endpoint
    // Then store encrypted in database

    // For MVP: Accept API credentials directly
    const { api_key, api_secret, api_passphrase } = await req.json()

    if (!api_key || !api_secret || !api_passphrase) {
      return NextResponse.json({
        error: 'API credentials required (key, secret, passphrase)',
      }, { status: 400 })
    }

    const admin = createAdminClient()

    // Validate credentials before storing
    const isValid = await validateCoinbaseCredentials({
      key: api_key,
      secret: api_secret,
      passphrase: api_passphrase,
    })

    if (!isValid) {
      return NextResponse.json({
        error: 'Invalid Coinbase credentials. Please check your API key, secret, and passphrase.',
      }, { status: 400 })
    }

    // Store encrypted credentials
    const { data: existing } = await admin
      .from('coinbase_connections')
      .select('id')
      .eq('user_id', user.id)
      .single()

    // Encrypt credentials before storage
    const encryptedKey = encryptAES(api_key)
    const encryptedSecret = encryptAES(api_secret)
    const encryptedPassphrase = encryptAES(api_passphrase)

    if (existing) {
      // Update existing connection
      await admin
        .from('coinbase_connections')
        .update({
          encrypted_key: encryptedKey,
          encrypted_secret: encryptedSecret,
          encrypted_passphrase: encryptedPassphrase,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
    } else {
      // Create new connection
      await admin.from('coinbase_connections').insert({
        user_id: user.id,
        account_type: 'individual',
        encrypted_key: encryptedKey,
        encrypted_secret: encryptedSecret,
        encrypted_passphrase: encryptedPassphrase,
        connected_at: new Date().toISOString(),
      })
    }

    // Fetch Coinbase balance and sync to wallet
    const balanceCents = await fetchCoinbaseUSDBalance({
      key: api_key,
      secret: api_secret,
      passphrase: api_passphrase,
    })

    // Ensure wallet exists and update balance
    const { data: existingWallet } = await admin
      .from('wallets')
      .select('id, balance_cents')
      .eq('user_id', user.id)
      .single()

    if (!existingWallet) {
      // Create wallet with Coinbase balance
      await admin.from('wallets').insert({
        user_id: user.id,
        balance_cents: balanceCents,
        last_synced_at: new Date().toISOString(),
      })
    } else {
      // Update existing wallet with Coinbase balance
      await admin
        .from('wallets')
        .update({
          balance_cents: balanceCents,
          last_synced_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
    }

    return NextResponse.json({
      ok: true,
      message: 'Coinbase account connected successfully',
      usd_balance_cents: balanceCents,
    })
  } catch (err: unknown) {
    console.error('coinbase-accounts error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
