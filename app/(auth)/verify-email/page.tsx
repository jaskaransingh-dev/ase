'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export const dynamic = 'force-dynamic'

function VerifyEmailContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  // Guard against React Strict Mode double-invocation in dev — without
  // this, the second pass burns the (single-use) PKCE code and the user
  // sees a false "link expired" error.
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    const verifyAndLogin = async () => {
      const supabase = createClient()

      const redirectTo = () => {
        setStatus('success')
        setMessage('Email verified successfully!')
        setTimeout(() => router.push('/dashboard'), 1500)
      }
      const failWith = (msg: string) => {
        setStatus('error')
        setMessage(msg)
        setTimeout(() => router.push('/login'), 3000)
      }

      // 0. If the user is ALREADY logged in (e.g. they clicked the link
      //    twice, or an email pre-scanner already burned the token but
      //    Supabase set the cookie), short-circuit to the dashboard.
      const { data: { user: existing } } = await supabase.auth.getUser()
      if (existing) return redirectTo()

      // 1. PKCE flow — Supabase sends ?code=xxx (most common with SSR)
      const code = searchParams.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          // Re-check session: some flows (and email pre-scanners) can
          // still leave a valid cookie even when exchange fails.
          const { data: { user: after } } = await supabase.auth.getUser()
          if (after) return redirectTo()
          return failWith('Verification link expired or already used')
        }
        return redirectTo()
      }

      // 2. OTP flow — Supabase sends ?token_hash=xxx&type=signup
      const tokenHash = searchParams.get('token_hash')
      const type = searchParams.get('type')
      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as 'signup',
        })
        if (error) {
          const { data: { user: after } } = await supabase.auth.getUser()
          if (after) return redirectTo()
          return failWith('Verification link expired or already used')
        }
        return redirectTo()
      }

      // 3. Implicit flow — Supabase sends #access_token=xxx (legacy).
      //    Hash params aren't on searchParams, so read them from the URL.
      if (typeof window !== 'undefined' && window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.slice(1))
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (error) return failWith('Failed to verify email')
          return redirectTo()
        }
      }

      // Nothing matched
      failWith('Invalid verification link — please sign up again')
    }

    verifyAndLogin()
  }, [searchParams, router])

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 420,
        animation: 'fadeUp 0.5s ease forwards',
      }}
    >
      <style>{`
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>

      <div
        style={{
          background: 'var(--bg2)',
          border: '1px solid var(--border2)',
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 40px 100px rgba(0,0,0,.6)',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        {status === 'loading' && (
          <div style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>
            <div
              style={{
                fontSize: '2.5rem',
                marginBottom: '1rem',
                display: 'inline-block',
              }}
            >
              ⟳
            </div>
            <h2
              style={{
                fontFamily: 'var(--font-head)',
                fontSize: '1.4rem',
                fontWeight: 800,
                marginBottom: '.5rem',
              }}
            >
              Verifying your email
            </h2>
            <p
              style={{
                color: 'var(--muted)',
                fontSize: '.9rem',
                lineHeight: 1.7,
              }}
            >
              Please wait while we verify your email address...
            </p>
          </div>
        )}

        {status === 'success' && (
          <>
            <div
              style={{
                fontSize: '3rem',
                marginBottom: '1rem',
                color: 'var(--green)',
              }}
            >
              ✓
            </div>
            <h2
              style={{
                fontFamily: 'var(--font-head)',
                fontSize: '1.4rem',
                fontWeight: 800,
                marginBottom: '.5rem',
                color: 'var(--green)',
              }}
            >
              Email Verified
            </h2>
            <p
              style={{
                color: 'var(--muted)',
                fontSize: '.9rem',
                lineHeight: 1.7,
                marginBottom: '1.5rem',
              }}
            >
              {message}
            </p>
            <p
              style={{
                color: 'var(--faint)',
                fontSize: '.8rem',
                lineHeight: 1.6,
              }}
            >
              Redirecting to your dashboard in a moment...
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem' }}>
              <span className="spinner" />
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem', color: 'var(--red)' }}>
              ✕
            </div>
            <h2
              style={{
                fontFamily: 'var(--font-head)',
                fontSize: '1.4rem',
                fontWeight: 800,
                marginBottom: '.5rem',
                color: 'var(--red)',
              }}
            >
              Verification Failed
            </h2>
            <p
              style={{
                color: 'var(--muted)',
                fontSize: '.9rem',
                lineHeight: 1.7,
                marginBottom: '1.5rem',
              }}
            >
              {message}
            </p>
            <p
              style={{
                color: 'var(--faint)',
                fontSize: '.8rem',
                lineHeight: 1.6,
              }}
            >
              Redirecting to login...
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            width: '100%',
            maxWidth: 420,
            animation: 'fadeUp 0.5s ease forwards',
          }}
        >
          <style>{`
            @keyframes fadeUp {
              from {
                opacity: 0;
                transform: translateY(12px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
          `}</style>

          <div
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--border2)',
              borderRadius: 20,
              overflow: 'hidden',
              boxShadow: '0 40px 100px rgba(0,0,0,.6)',
              padding: '2rem',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⟳</div>
            <h2
              style={{
                fontFamily: 'var(--font-head)',
                fontSize: '1.4rem',
                fontWeight: 800,
                marginBottom: '.5rem',
              }}
            >
              Loading...
            </h2>
          </div>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  )
}
