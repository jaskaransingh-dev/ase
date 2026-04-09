import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const loginError = (msg: string, details?: string) => {
    console.error(`[Coinbase OAuth Error] ${msg}`, details)
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, request.url))
  }

  if (error) return loginError('coinbase_oauth_denied', error)

  // CSRF check
  const storedState = request.cookies.get('coinbase_oauth_state')?.value
  if (!state || !storedState || state !== storedState) {
    return loginError('oauth_state_mismatch', `state=${state}, stored=${storedState}`)
  }

  if (!code) return loginError('oauth_no_code')

  const clientId = process.env.COINBASE_CLIENT_ID
  const clientSecret = process.env.COINBASE_CLIENT_SECRET
  if (!clientId || !clientSecret) return loginError('oauth_not_configured')

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/+$/, '')
  const redirectUri = `${baseUrl}/api/auth/coinbase/callback`

  try {
    // Exchange code for access token
    console.log('[Coinbase OAuth] Exchanging code for token...')
    const tokenRes = await fetch('https://api.coinbase.com/oauth2/token', {
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
      return loginError('coinbase_token_failed', `${tokenRes.status}: ${errorData}`)
    }

    const { access_token } = await tokenRes.json()
    console.log('[Coinbase OAuth] Token received')

    // Fetch Coinbase user info
    console.log('[Coinbase OAuth] Fetching user info...')
    const userRes = await fetch('https://api.coinbase.com/v2/user', {
      headers: { Authorization: `Bearer ${access_token}` },
    })

    if (!userRes.ok) {
      const errorData = await userRes.text()
      return loginError('coinbase_user_failed', `${userRes.status}: ${errorData}`)
    }

    const { data: cbUser } = await userRes.json()
    const email: string | undefined = cbUser?.email

    if (!email) return loginError('coinbase_no_email', `User: ${JSON.stringify(cbUser)}`)
    console.log('[Coinbase OAuth] User email:', email)

    // Upsert user in Supabase via admin client
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // createUser may fail if user exists - that's ok
    console.log('[Coinbase OAuth] Creating/updating Supabase user...')
    try {
      await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          full_name: cbUser.name ?? '',
          avatar_url: cbUser.avatar_url ?? '',
          coinbase_id: cbUser.id ?? '',
        },
      })
      console.log('[Coinbase OAuth] Supabase user created')
    } catch (createErr: any) {
      if (createErr?.status === 422) {
        console.log('[Coinbase OAuth] User already exists (expected)')
      } else {
        throw createErr
      }
    }

    // Generate a magic-link OTP server-side
    console.log('[Coinbase OAuth] Generating magic link OTP...')
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })

    if (linkError || !linkData) {
      return loginError('auth_link_failed', linkError?.message)
    }

    const emailOtp = linkData.properties.email_otp
    console.log('[Coinbase OAuth] OTP generated')

    // Exchange the OTP for a real session using the SSR client (sets cookies)
    console.log('[Coinbase OAuth] Verifying OTP and creating session...')
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
              console.error('[Coinbase OAuth] Error setting cookies:', err)
            }
          },
        },
      }
    )

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: emailOtp,
      type: 'magiclink',
    })

    if (verifyError) {
      return loginError('session_create_failed', verifyError.message)
    }

    console.log('[Coinbase OAuth] Session created successfully')
    const response = NextResponse.redirect(new URL('/dashboard', request.url))
    response.cookies.delete('coinbase_oauth_state')
    return response
  } catch (err: any) {
    console.error('[Coinbase OAuth] Unexpected error:', err)
    return loginError('unexpected_error', err?.message)
  }
}
