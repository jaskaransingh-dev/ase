'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const rawRedirect = params.get('redirect') || '/dashboard'
  const redirect = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/dashboard'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(params.get('error') || '')
  const [loading, setLoading] = useState(false)
  const [showResendVerification, setShowResendVerification] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      supabaseRef.current = createClient()
    }
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setShowResendVerification(false)

    const supabase = supabaseRef.current
    if (!supabase) {
      setError('Application error: Supabase not ready')
      setLoading(false)
      return
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      if (signInError.message.includes('Email not confirmed') || signInError.message.includes('email_not_confirmed')) {
        setError('Please verify your email before signing in.')
        setShowResendVerification(true)
      } else if (
        signInError.message.includes('Invalid login credentials') ||
        signInError.message.includes('Invalid email or password')
      ) {
        setError('Invalid email or password.')
      } else if (signInError.message.includes('User not found')) {
        setError('No account found with this email. Create an account to get started.')
      } else {
        setError('Failed to sign in. Please try again.')
      }
      setLoading(false)
    } else {
      // After login, redirect to Kraken connect if user hasn't connected yet
      try {
        const status = await fetch('/api/auth/kraken/keys').then(r => r.json())
        if (!status?.connected) {
          router.push(`/dashboard/connect/kraken?next=${encodeURIComponent(redirect)}`)
        } else {
          router.push(redirect)
        }
      } catch {
        router.push(redirect)
      }
      router.refresh()
    }
  }

  async function handleResendVerification() {
    if (!email) {
      setError('Please enter your email address')
      return
    }
    setResendLoading(true)
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (res.ok) {
        setError('Verification email sent! Check your inbox.')
        setShowResendVerification(false)
      } else {
        setError('Failed to resend verification email. Please try again.')
      }
    } catch (err) {
      console.error('Resend verification error:', err)
      setError('Failed to resend verification email. Please try again.')
    } finally {
      setResendLoading(false)
    }
  }

  return (
    <div style={{ width: '100%', maxWidth: 440, animation: 'fadeUp 0.5s ease forwards' }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .spinner { width: 14px; height: 14px; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .win-bar { display: flex; align-items: center; gap: 5px; padding: 8px 12px; border-bottom: 1px solid var(--border); background: rgba(6,17,31,0.5); }
        .dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
        .dot-r { background: #E45867; } .dot-y { background: #F5B942; } .dot-g { background: #16C784; }
        .win-title { margin-left: 8px; font-family: var(--font-mono); font-size: 0.6rem; color: var(--faint); }
      `}</style>

      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,.6)' }}>
        <div className="win-bar">
          <span className="dot dot-r" /><span className="dot dot-y" /><span className="dot dot-g" />
          <span className="win-title">ase.app · sign in</span>
        </div>

        <div style={{ padding: '1.85rem 1.85rem 1.65rem' }}>
          <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '1.55rem', fontWeight: 800, marginBottom: '.35rem', color: 'var(--white)' }}>
            Welcome back
          </h1>
          <p style={{ fontSize: '.85rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>
            Sign in, then connect your Kraken account to start trading.
          </p>

          {/* Kraken-connect callout */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.7rem 0.9rem', background: 'rgba(88,65,212,0.08)', border: '1px solid rgba(88,65,212,0.25)', borderRadius: 10, marginBottom: '1.25rem' }}>
            <div style={{ width: 26, height: 26, borderRadius: 6, background: '#5841d4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 11, fontFamily: 'var(--font-mono)' }}>K</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--white)' }}>Kraken-only execution</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: 1 }}>Trades run on your Kraken account via API keys you control.</div>
            </div>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.3rem' }}>EMAIL</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={loading}
                autoComplete="email"
                style={{ width: '100%', padding: '0.72rem 0.85rem', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--white)', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                onFocus={e => e.currentTarget.style.borderColor = 'rgba(79,140,255,0.5)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
              />
            </div>
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.3rem', display: 'flex', justifyContent: 'space-between' }}>
                <span>PASSWORD</span>
                <Link href="/forgot-password" style={{ color: 'var(--blue2)', fontSize: '0.55rem', textDecoration: 'none' }}>Forgot?</Link>
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={loading}
                autoComplete="current-password"
                style={{ width: '100%', padding: '0.72rem 0.85rem', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--white)', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                onFocus={e => e.currentTarget.style.borderColor = 'rgba(79,140,255,0.5)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
              />
            </div>

            {error && (
              <div style={{ padding: '0.55rem 0.8rem', background: 'rgba(228,88,103,0.08)', border: '1px solid rgba(228,88,103,0.25)', borderRadius: 8, color: 'var(--red)', fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>
                {error}
                {showResendVerification && (
                  <button type="button" onClick={handleResendVerification} disabled={resendLoading} style={{ marginLeft: 8, color: 'var(--blue2)', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>
                    {resendLoading ? 'Sending…' : 'Resend'}
                  </button>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              style={{
                marginTop: '0.4rem',
                padding: '0.85rem',
                background: loading || !email || !password ? 'var(--bg3)' : 'linear-gradient(135deg, #3566E9, #4F8CFF)',
                color: '#fff', border: 'none', borderRadius: 10,
                fontWeight: 700, fontSize: '0.9rem',
                cursor: loading || !email || !password ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {loading ? <span className="spinner" /> : null}
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <div style={{ marginTop: '1.25rem', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--muted)' }}>
            Don&apos;t have an account?{' '}
            <Link href="/signup" style={{ color: 'var(--blue2)', textDecoration: 'none', fontWeight: 600 }}>Create one →</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
