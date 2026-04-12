import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { encryptAES } from '@/lib/crypto/encryption'

export const dynamic = 'force-dynamic'

interface AlpacaTokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  scope: string
}

interface AlpacaAccount {
  id: string
  account_number: string
  status: string
  currency: string
  cash: number
  portfolio_value: string
  buying_power: string
  daytrade_count_limit: number
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const loginError = (msg: string, details?: string) => {
    console.error(`[Alpaca OAuth Error] ${msg}`, details)
    return NextResponse.redirect(new URL(`/dashboard?error=${encodeURIComponent(msg)}`, request.url))
  }

  if (error) return loginError('alpaca_oauth_denied', error)

  const storedState = request.cookies.get('alpaca_oauth_state')?.value
  if (!state || !storedState || state !== storedState) {
    return loginError('oauth_state_mismatch', `state=${state}, stored=${storedState}`)
  }

  if (!code) return loginError('oauth_no_code')

  const clientId = process.env.ALPACA_CLIENT_ID
  const clientSecret = process.env.ALPACA_CLIENT_SECRET
  if (!clientId || !clientSecret) return loginError('oauth_not_configured')

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/+$/, '')
  const redirectUri = `${baseUrl}/api/auth/alpaca/callback`

  try {
    console.log('[Alpaca OAuth] Exchanging code for token...')
    const tokenRes = await fetch(process.env.ALPACA_TOKEN_URL || 'https://api.alpaca.markets/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenRes.ok) {
      const errorData = await tokenRes.text()
      return loginError('alpaca_token_failed', `${tokenRes.status}: ${errorData}`)
    }

    const tokenData: AlpacaTokenResponse = await tokenRes.json()
    const { access_token, refresh_token } = tokenData
    console.log('[Alpaca OAuth] Token received')

    console.log('[Alpaca OAuth] Fetching account info...')
    const accountRes = await fetch('https://paper-api.alpaca.markets/v2/account', {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'APCA-API-KEY-ID': clientId,
        'APCA-API-SECRET-KEY': access_token,
      },
    })

    if (!accountRes.ok) {
      const errorData = await accountRes.text()
      console.log('[Alpaca OAuth] Account fetch failed:', errorData)
    }

    let accountId = ''
    let accountNumber = ''
    if (accountRes.ok) {
      const accountData: AlpacaAccount = await accountRes.json()
      accountId = accountData.id
      accountNumber = accountData.account_number
      console.log('[Alpaca OAuth] Account:', accountId)
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

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
              console.error('[Alpaca OAuth] Error setting cookies:', err)
            }
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return loginError('not_authenticated', 'User must be logged in to connect account')
    }

    const encryptedAccessToken = encryptAES(access_token)
    const encryptedRefreshToken = refresh_token ? encryptAES(refresh_token) : null

    const { error: upsertError } = await supabaseAdmin.from('connected_accounts').upsert({
      user_id: user.id,
      provider: 'alpaca',
      access_token: encryptedAccessToken,
      refresh_token: encryptedRefreshToken,
      account_id: accountId,
      account_number: accountNumber,
      status: 'active',
    }, {
      onConflict: 'user_id,provider',
    })

    if (upsertError) {
      console.error('[Alpaca OAuth] Failed to store account:', upsertError)
      return loginError('storage_failed', upsertError.message)
    }

    const cash = accountRes.ok ? (await accountRes.json()).cash : '0'
    const portfolioValue = accountRes.ok ? (await accountRes.json()).portfolio_value : '0'
    const buyingPower = accountRes.ok ? (await accountRes.json()).buying_power : '0'

    await supabaseAdmin.from('account_balances').upsert({
      user_id: user.id,
      provider: 'alpaca',
      equity_cents: Math.round(parseFloat(portfolioValue) * 100),
      cash_cents: Math.round(parseFloat(cash) * 100),
      buying_power_cents: Math.round(parseFloat(buyingPower) * 100),
      portfolio_value_cents: Math.round(parseFloat(portfolioValue) * 100),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,provider',
    })

    console.log('[Alpaca OAuth] Account connected successfully')

    const storedRedirect = request.cookies.get('alpaca_oauth_redirect')?.value
    const safeRedirect = storedRedirect?.startsWith('/') && !storedRedirect.startsWith('//')
      ? storedRedirect
      : '/dashboard'

    const response = NextResponse.redirect(new URL(safeRedirect, request.url))
    response.cookies.delete('alpaca_oauth_state')
    response.cookies.delete('alpaca_oauth_redirect')
    return response
  } catch (err: any) {
    console.error('[Alpaca OAuth] Unexpected error:', err)
    return loginError('unexpected_error', err?.message)
  }
}