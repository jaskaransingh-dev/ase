'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export const dynamic = 'force-dynamic'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      supabaseRef.current = createClient()
    }
  }, [])

  async function handle(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = supabaseRef.current
    if (!supabase) {
      setError('Supabase not ready')
      setLoading(false)
      return
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/api/auth/callback?next=/reset-password`,
    })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setDone(true)
    }
  }

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
      `}</style>

      <div
        style={{
          background: 'var(--bg2)',
          border: '1px solid var(--border2)',
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 40px 100px rgba(0,0,0,.6)',
        }}
      >
        <div className="win-bar">
          <span className="dot dot-r" />
          <span className="dot dot-y" />
          <span className="dot dot-g" />
          <span className="win-title">ase.app · Reset Password</span>
        </div>

        <div style={{ padding: '2rem' }}>
          {done ? (
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontSize: '2.5rem',
                  marginBottom: '1rem',
                  color: 'var(--gold)',
                }}
              >
                ✉
              </div>
              <h2
                style={{
                  fontFamily: 'var(--font-head)',
                  fontSize: '1.3rem',
                  fontWeight: 800,
                  marginBottom: '.5rem',
                }}
              >
                Check your email
              </h2>
              <p
                style={{
                  color: 'var(--muted)',
                  fontSize: '.9rem',
                  marginBottom: '1.5rem',
                  lineHeight: 1.6,
                }}
              >
                We sent a password reset link to{' '}
                <strong style={{ color: 'var(--white)' }}>{email}</strong>.
                Click it to set a new password.
              </p>
              <Link
                href="/login"
                className="btn-secondary"
                style={{
                  justifyContent: 'center',
                  display: 'flex',
                }}
              >
                Back to Login
              </Link>
            </div>
          ) : (
            <>
              <h1
                style={{
                  fontFamily: 'var(--font-head)',
                  fontSize: '1.4rem',
                  fontWeight: 800,
                  marginBottom: '.35rem',
                }}
              >
                Forgot password?
              </h1>
              <p
                style={{
                  fontSize: '.88rem',
                  color: 'var(--muted)',
                  marginBottom: '1.75rem',
                }}
              >
                Enter your email to receive a reset link
              </p>

              <form
                onSubmit={handle}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '.65rem',
                      letterSpacing: '.08em',
                      color: 'var(--faint)',
                      marginBottom: '.45rem',
                    }}
                  >
                    EMAIL ADDRESS
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    className="input-base"
                  />
                </div>

                {error && (
                  <div
                    style={{
                      padding: '.75rem 1rem',
                      background: 'rgba(232,64,64,.08)',
                      border: '1px solid rgba(232,64,64,.2)',
                      borderRadius: 10,
                      fontSize: '.85rem',
                      color: 'var(--red)',
                    }}
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary"
                  style={{
                    justifyContent: 'center',
                    width: '100%',
                  }}
                >
                  {loading ? (
                    <>
                      <span className="spinner" />
                      Sending...
                    </>
                  ) : (
                    'Send Reset Link →'
                  )}
                </button>
              </form>

              <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                <Link
                  href="/login"
                  className="auth-back-link"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '.68rem',
                    color: 'var(--faint)',
                    transition: 'color 0.2s ease',
                  }}
                >
                  ← Back to login
                </Link>
                <style>{`.auth-back-link:hover{color:var(--gold)!important}`}</style>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
