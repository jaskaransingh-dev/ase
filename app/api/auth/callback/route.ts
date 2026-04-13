import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const params = requestUrl.searchParams
  
  const type = params.get('type')
  let next = params.get('next') || '/dashboard'
  
  // For password recovery flow
  if (type === 'recovery' || next?.includes('reset-password')) {
    next = '/reset-password'
  }
  
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
            // Safe to ignore
          }
        },
      },
    }
  )

  // Check for existing session - when user clicks email link, session is set
  const { data: { session } } = await supabase.auth.getSession()
  
  if (session || type === 'recovery') {
    console.log('[Auth Callback] Session OK, redirecting to:', safeNext)
    return NextResponse.redirect(new URL(safeNext, request.url))
  }

  console.log('[Auth Callback] No session')
  return NextResponse.redirect(new URL('/login?error=Link expired', request.url))
}