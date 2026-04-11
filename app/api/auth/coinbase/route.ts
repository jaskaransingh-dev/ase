import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const clientId = process.env.COINBASE_CLIENT_ID
  const clientSecret = process.env.COINBASE_CLIENT_SECRET

  // If OAuth not configured, fail gracefully
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Coinbase OAuth not configured. Please contact support.' },
      { status: 503 }
    )
  }

  const url = new URL(request.url)
  // Preserve the redirect destination through the OAuth round-trip
  const redirectAfter = url.searchParams.get('redirect') ?? '/dashboard'
  const safeRedirect = redirectAfter.startsWith('/') && !redirectAfter.startsWith('//') ? redirectAfter : '/dashboard'

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || url.origin).replace(/\/+$/, '')
  const redirectUri = `${baseUrl}/api/auth/coinbase/callback`

  const state = crypto.randomUUID()

  const authUrl = new URL('https://login.coinbase.com/oauth2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'wallet:user:read wallet:user:email')
  authUrl.searchParams.set('state', state)

  const response = NextResponse.redirect(authUrl.toString())
  response.cookies.set('coinbase_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300,
    path: '/',
  })
  // Preserve post-login redirect destination
  response.cookies.set('coinbase_oauth_redirect', safeRedirect, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300,
    path: '/',
  })
  return response
}
