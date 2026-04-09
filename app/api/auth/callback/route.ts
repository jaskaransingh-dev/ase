import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code       = requestUrl.searchParams.get('code')
  const tokenHash  = requestUrl.searchParams.get('token_hash')
  const type       = requestUrl.searchParams.get('type')
  const next       = requestUrl.searchParams.get('next') || '/dashboard'

  // Validate next to prevent open redirect
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'

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
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(safeNext, request.url))

    const errorUrl = new URL('/login', request.url)
    errorUrl.searchParams.set('error', 'Link expired or already used. Please try again.')
    return NextResponse.redirect(errorUrl)
  }

  // ── OTP / token_hash flow (email confirm, password recovery, magic-link) ──
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as 'signup' | 'recovery' | 'email' | 'invite' | 'magiclink' | 'email_change',
    })
    if (!error) return NextResponse.redirect(new URL(safeNext, request.url))

    const errorUrl = new URL('/login', request.url)
    errorUrl.searchParams.set('error', 'Verification link expired or already used.')
    return NextResponse.redirect(errorUrl)
  }

  return NextResponse.redirect(new URL('/login', request.url))
}
