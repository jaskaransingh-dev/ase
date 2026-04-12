/**
 * POST /api/auth/alpaca/direct
 *
 * Connect Alpaca account directly with API key and secret.
 * For development/testing - in production, use OAuth flow.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { encryptAES } from '@/lib/crypto/encryption'

export const dynamic = 'force-dynamic'

interface AlpacaAccount {
  id: string
  account_number: string
  status: string
  currency: string
  cash: string
  portfolio_value: string
  buying_power: string
}

export async function POST(request: NextRequest) {
  try {
    const { api_key, api_secret } = await request.json()

    if (!api_key || !api_secret) {
      return NextResponse.json(
        { error: 'API key and secret are required' },
        { status: 400 }
      )
    }

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch (err) {
              console.error('[Alpaca Direct] Error setting cookies:', err)
            }
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    console.log('[Alpaca Direct] Fetching account info with provided credentials...')
    const accountRes = await fetch('https://paper-api.alpaca.markets/v2/account', {
      headers: {
        'APCA-API-KEY-ID': api_key,
        'APCA-API-SECRET-KEY': api_secret,
      },
    })

    if (!accountRes.ok) {
      const errorData = await accountRes.text()
      console.log('[Alpaca Direct] Account fetch failed:', errorData)
      return NextResponse.json(
        { error: 'Invalid API credentials' },
        { status: 401 }
      )
    }

    const accountData: AlpacaAccount = await accountRes.json()
    console.log('[Alpaca Direct] Account:', accountData.id)

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const encryptedAccessToken = encryptAES(api_secret)
    const encryptedApiSecret = encryptAES(api_secret)

    const { error: upsertError } = await admin.from('connected_accounts').upsert({
      user_id: user.id,
      provider: 'alpaca',
      access_token: encryptedAccessToken,
      refresh_token: null,
      api_key: api_key,
      api_secret: encryptedApiSecret,
      account_id: accountData.id,
      account_number: accountData.account_number,
      status: 'active',
    }, {
      onConflict: 'user_id,provider',
    })

    if (upsertError) {
      console.error('[Alpaca Direct] Failed to store account:', upsertError)
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }

    await admin.from('account_balances').upsert({
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

    console.log('[Alpaca Direct] Account connected successfully')

    return NextResponse.json({
      success: true,
      account_id: accountData.id,
      account_number: accountData.account_number,
      cash: accountData.cash,
      portfolio_value: accountData.portfolio_value,
    })
  } catch (err: unknown) {
    console.error('alpaca direct connect error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}