import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const clientId = process.env.KRAKEN_CLIENT_ID
  const clientSecret = process.env.KRAKEN_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Kraken OAuth not configured. Set KRAKEN_CLIENT_ID and KRAKEN_CLIENT_SECRET.' },
      { status: 503 }
    )
  }

  const url = new URL(request.url)
  const redirectAfter = url.searchParams.get('redirect') ?? '/dashboard'
  const safeRedirect = redirectAfter.startsWith('/') && !redirectAfter.startsWith('//') ? redirectAfter : '/dashboard'

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || url.origin).replace(/\/+$/, '')
  const redirectUri = `${baseUrl}/api/auth/kraken/callback`

  const state = crypto.randomUUID()

  // Kraken OAuth URL
  const authUrl = new URL('https://auth.kraken.com/oauth/authorize')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'read,write,exec')
  authUrl.searchParams.set('state', state)

  const response = NextResponse.redirect(authUrl.toString())
  response.cookies.set('kraken_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  response.cookies.set('kraken_oauth_redirect', safeRedirect, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  return response
}