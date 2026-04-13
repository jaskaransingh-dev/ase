import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code       = requestUrl.searchParams.get('code')
  const tokenHash  = requestUrl.searchParams.get('token_hash')
  const type       = requestUrl.searchParams.get('type')
  const next       = requestUrl.searchParams.get('next')
  
  console.log('[Auth Callback] Full URL:', request.url)
  console.log('[Auth Callback] params - code:', !!code, 'tokenHash:', !!tokenHash, 'type:', type, 'next:', next)

  // For password recovery, redirect to reset-password page
  let redirectTo = next || '/dashboard'
  if (type === 'recovery') {
    redirectTo = '/reset-password'
  }
  
  // Validate next to prevent open redirect
  const safeNext = redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/dashboard'
  console.log('[Auth Callback] Redirecting to:', safeNext)

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
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

  // ── PKCE flow (OAuth, magic-link with code_verifier) ─────────────────────
  if (code) {
    console.log('[Auth Callback] Exchanging code for session')
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(safeNext, request.url))

    console.log('[Auth Callback] Code exchange error:', error?.message)
    const errorUrl = new URL('/login', request.url)
    errorUrl.searchParams.set('error', 'Link expired or already used. Please try again.')
    return NextResponse.redirect(errorUrl)
  }

  // ── OTP / token_hash flow (email confirm, password recovery) ──
  if (tokenHash && type) {
    console.log('[Auth Callback] Verifying OTP with type:', type)
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as 'signup' | 'recovery' | 'email' | 'invite' | 'magiclink',
    })
    if (!error) {
      console.log('[Auth Callback] OTP verified successfully')
      return NextResponse.redirect(new URL(safeNext, request.url))
    }
    console.log('[Auth Callback] OTP verify error:', error?.message)
  }

  console.log('[Auth Callback] No valid auth, redirecting to login')
  const errorUrl = new URL('/login', request.url)
  errorUrl.searchParams.set('error', 'Link expired or already used.')
  return NextResponse.redirect(errorUrl)
}