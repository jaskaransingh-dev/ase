'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function VerifyEmailPage() {
  const router = useRouter()
  const params = useSearchParams()
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    async function verify() {
      const supabase = createClient()

      // ── PKCE code flow ───────────────────────────────────────────────────
      const code = params.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) { setStatus('success'); setTimeout(() => router.replace('/dashboard'), 1800); return }
        setStatus('error'); setErrorMsg('Verification link expired or already used.')
        return
      }

      // ── OTP token_hash flow ──────────────────────────────────────────────
      const tokenHash = params.get('token_hash')
      const type = params.get('type') || 'signup'
      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as 'signup' | 'email' | 'magiclink',
        })
        if (!error) { setStatus('success'); setTimeout(() => router.replace('/dashboard'), 1800); return }
        setStatus('error'); setErrorMsg('Verification link expired or already used.')
        return
      }

      // ── Already logged in? ───────────────────────────────────────────────
      const { data: { session } } = await supabase.auth.getSession()
      if (session) { setStatus('success'); setTimeout(() => router.replace('/dashboard'), 1800); return }

      // ── No params at all — came here directly ────────────────────────────
      setStatus('error')
      setErrorMsg('No verification token found. Please check your email for the link.')
    }

    verify()
  }, [params, router])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{
          background: 'var(--bg2)',
          border: `1px solid ${status === 'error' ? 'rgba(232,64,64,.25)' : status === 'success' ? 'rgba(14,173,110,.25)' : 'var(--border2)'}`,
          borderRadius: 20,
          padding: '2.5rem 2rem',
          textAlign: 'center',
          boxShadow: '0 40px 100px rgba(0,0,0,.6)',
        }}>
          {status === 'verifying' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}>
                <span className="spinner" style={{ width: 28, height: 28 }} />
              </div>
              <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.3rem', fontWeight: 800, marginBottom: '.5rem' }}>
                Verifying your email...
              </h2>
              <p style={{ color: 'var(--muted)', fontSize: '.88rem' }}>Just a moment.</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(14,173,110,.1)', border: '1px solid rgba(14,173,110,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <path d="M5 11l4 4 8-8" stroke="#0EAD6E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.3rem', fontWeight: 800, marginBottom: '.5rem', color: 'var(--green)' }}>
                Email verified!
              </h2>
              <p style={{ color: 'var(--muted)', fontSize: '.88rem', marginBottom: '.5rem' }}>
                Your account is confirmed. Redirecting to your dashboard...
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
                <span className="spinner" />
              </div>
            </>
          )}

          {status === 'error' && (
            <>
              <div style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(232,64,64,.1)', border: '1px solid rgba(232,64,64,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M6 6l8 8M14 6l-8 8" stroke="#E84040" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.3rem', fontWeight: 800, marginBottom: '.5rem', color: 'var(--red)' }}>
                Verification failed
              </h2>
              <p style={{ color: 'var(--muted)', fontSize: '.88rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                {errorMsg}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
                <Link href="/login" className="btn-primary" style={{ display: 'flex', justifyContent: 'center' }}>
                  Go to Login →
                </Link>
                <Link href="/signup" style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', color: 'var(--faint)', textAlign: 'center' }}>
                  Need a new account?
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
