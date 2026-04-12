/**
 * POST /api/account/sync
 *
 * Sync user's Alpaca account balances.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptAES } from '@/lib/crypto/encryption'

interface AlpacaAccount {
  id: string
  account_number: string
  status: string
  currency: string
  cash: string
  portfolio_value: string
  buying_power: string
}

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()

    const { data: connection } = await admin
      .from('connected_accounts')
      .select('id, access_token, refresh_token, api_key, api_secret')
      .eq('user_id', user.id)
      .eq('provider', 'alpaca')
      .single()

    if (!connection) {
      return NextResponse.json({ error: 'No connected account' }, { status: 404 })
    }

    let apiKey = connection.api_key
    let apiSecret = connection.api_secret ? decryptAES(connection.api_secret) : null

    if (!apiSecret) {
      apiSecret = connection.access_token ? decryptAES(connection.access_token) : null
    }

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 })
    }

    const accountRes = await fetch('https://paper-api.alpaca.markets/v2/account', {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret,
      },
    })

    if (!accountRes.ok) {
      const error = await accountRes.text()
      console.error('[Account Sync] Failed to fetch account:', error)

      await admin.from('connected_accounts').update({
        status: 'error',
      }).eq('id', connection.id)

      return NextResponse.json({ error: 'Failed to sync account' }, { status: 500 })
    }

    const accountData: AlpacaAccount = await accountRes.json()

    const { error: updateError } = await admin.from('account_balances').upsert({
      user_id: user.id,
      provider: 'alpaca',
      equity_cents: Math.round(parseFloat(accountData.portfolio_value) * 100),
      cash_cents: Math.round(parseFloat(accountData.cash) * 100),
      buying_power_cents: Math.round(parseFloat(accountData.buying_power) * 100),
      portfolio_value_cents: Math.round(parseFloat(accountData.portfolio_value) * 100),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,provider',
    })

    if (updateError) {
      console.error('[Account Sync] Failed to update balance:', updateError)
    }

    await admin.from('connected_accounts').update({
      last_synced_at: new Date().toISOString(),
      status: 'active',
    }).eq('id', connection.id)

    return NextResponse.json({
      success: true,
      equity_cents: Math.round(parseFloat(accountData.portfolio_value) * 100),
      cash_cents: Math.round(parseFloat(accountData.cash) * 100),
      buying_power_cents: Math.round(parseFloat(accountData.buying_power) * 100),
    })
  } catch (err: unknown) {
    console.error('account sync error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}