import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const clientId = process.env.ALPACA_CLIENT_ID
  const clientSecret = process.env.ALPACA_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Alpaca OAuth client not configured. Set ALPACA_CLIENT_ID and ALPACA_CLIENT_SECRET in environment.' },
      { status: 503 }
    )
  }

  const url = new URL(request.url)
  const redirectAfter = url.searchParams.get('redirect') ?? '/dashboard'
  const safeRedirect = redirectAfter.startsWith('/') && !redirectAfter.startsWith('//') ? redirectAfter : '/dashboard'

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || url.origin).replace(/\/+$/, '')
  const redirectUri = `${baseUrl}/api/auth/alpaca/callback`

  const state = crypto.randomUUID()

  // Use sandbox OAuth
  const authUrl = new URL('https://app.alpaca.markets/oauth/authorize')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'account:write trading:read trading:write')
  authUrl.searchParams.set('state', state)

  const response = NextResponse.redirect(authUrl.toString())
  response.cookies.set('alpaca_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  response.cookies.set('alpaca_oauth_redirect', safeRedirect, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  return response
}