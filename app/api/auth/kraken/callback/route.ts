import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encryptAES } from '@/lib/crypto/encryption'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const cookieHeader = request.headers.get('cookie') ?? ''
  const stateCookie = cookieHeader.split(';').find(c => c.trim().startsWith('kraken_oauth_state='))
  const storedState = stateCookie?.split('=')[1]
  const redirectCookie = cookieHeader.split(';').find(c => c.trim().startsWith('kraken_oauth_redirect='))
  const redirectAfter = redirectCookie?.split('=')[1] ?? '/dashboard'

  if (error) {
    console.error('[Kraken] OAuth error:', error)
    return NextResponse.redirect(`${redirectAfter}?error=kraken_auth_failed`)
  }

  if (!code || !state || !storedState || state !== storedState) {
    console.error('[Kraken] Invalid state or code')
    return NextResponse.redirect(`${redirectAfter}?error=invalid_state`)
  }

  const clientId = process.env.KRAKEN_CLIENT_ID
  const clientSecret = process.env.KRAKEN_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${redirectAfter}?error=kraken_not_configured`)
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://auth.kraken.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })

    if (!tokenRes.ok) {
      const errText = await tokenRes.text()
      console.error('[Kraken] Token exchange failed:', errText)
      return NextResponse.redirect(`${redirectAfter}?error=token_exchange_failed`)
    }

    const tokens = await tokenRes.json()
    const { access_token, refresh_token, expires_in } = tokens

    // Get user info
    const userRes = await fetch('https://api.kraken.com/0/private/AddOrder', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    // Get account ID from balance
    const balanceRes = await fetch('https://api.kraken.com/0/private/Balance', {
      headers: { 'Authorization': `Bearer ${access_token}` },
    })
    const balanceData = await balanceRes.json()
    const accountId = balanceData.error ? 'kraken-main' : 'kraken-' + Date.now()

    // Encrypt tokens
    const encryptedAccess = encryptAES(access_token)
    const encryptedRefresh = encryptAES(refresh_token || '')

    // For demo, use a demo user - in production, get from session
    const demoUserId = '00000000-0000-0000-0000-000000000001'

    const admin = createAdminClient()
    const { data: existing } = await admin
      .from('connected_accounts')
      .select('id')
      .eq('user_id', demoUserId)
      .eq('provider', 'kraken')
      .single()

    if (existing) {
      await admin
        .from('connected_accounts')
        .update({
          access_token: encryptedAccess,
          refresh_token: encryptedRefresh,
          account_id: accountId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
    } else {
      await admin
        .from('connected_accounts')
        .insert({
          user_id: demoUserId,
          provider: 'kraken',
          access_token: encryptedAccess,
          refresh_token: encryptedRefresh,
          account_id: accountId,
        })
    }

    return NextResponse.redirect(`${redirectAfter}?connected=kraken`)
  } catch (err) {
    console.error('[Kraken] Callback error:', err)
    return NextResponse.redirect(`${redirectAfter}?error=unknown`)
  }
}