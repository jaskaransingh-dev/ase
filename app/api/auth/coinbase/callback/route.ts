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

  const loginError = (msg: string) =>
    NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, request.url))

  if (error) return loginError('coinbase_oauth_denied')

  // CSRF check
  const storedState = request.cookies.get('coinbase_oauth_state')?.value
  if (!state || !storedState || state !== storedState) {
    return loginError('oauth_state_mismatch')
  }

  if (!code) return loginError('oauth_no_code')

  const clientId = process.env.COINBASE_CLIENT_ID
  const clientSecret = process.env.COINBASE_CLIENT_SECRET
  if (!clientId || !clientSecret) return loginError('oauth_not_configured')

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/+$/, '')
  const redirectUri = `${baseUrl}/api/auth/coinbase/callback`

  // Exchange code for access token
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

  if (!tokenRes.ok) return loginError('coinbase_token_failed')

  const { access_token } = await tokenRes.json()

  // Fetch Coinbase user info
  const userRes = await fetch('https://api.coinbase.com/v2/user', {
    headers: { Authorization: `Bearer ${access_token}` },
  })

  if (!userRes.ok) return loginError('coinbase_user_failed')

  const { data: cbUser } = await userRes.json()
  const email: string | undefined = cbUser?.email

  if (!email) return loginError('coinbase_no_email')

  // Upsert user in Supabase via admin client
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // createUser is idempotent-ish; ignore "already exists" errors
  await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      full_name: cbUser.name ?? '',
      avatar_url: cbUser.avatar_url ?? '',
      coinbase_id: cbUser.id ?? '',
    },
  })

  // Generate a magic-link OTP server-side
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })

  if (linkError || !linkData) return loginError('auth_link_failed')

  const emailOtp = linkData.properties.email_otp

  // Exchange the OTP for a real session using the SSR client (sets cookies)
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
          } catch {
            // Safe to ignore in middleware context
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

  if (verifyError) return loginError('session_create_failed')

  const response = NextResponse.redirect(new URL('/dashboard', request.url))
  response.cookies.delete('coinbase_oauth_state')
  return response
}
