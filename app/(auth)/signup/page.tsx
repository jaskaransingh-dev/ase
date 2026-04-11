'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export const dynamic = 'force-dynamic'

function calculatePasswordStrength(password: string): number {
  let strength = 0
  if (password.length >= 8) strength += 25
  if (password.length >= 12) strength += 25
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength += 25
  if (/\d/.test(password)) strength += 12.5
  if (/[^a-zA-Z\d]/.test(password)) strength += 12.5
  return Math.min(strength, 100)
}

export default function SignupPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [passwordStrength, setPasswordStrength] = useState(0)
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      supabaseRef.current = createClient()
    }
  }, [])

  useEffect(() => {
    setPasswordStrength(calculatePasswordStrength(password))
  }, [password])

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()

    // Validate inputs
    if (!name.trim()) {
      setError('Please enter your display name')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Check if email already exists
      const checkRes = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const checkData = await checkRes.json()

      if (checkData.exists) {
        setError('An account with this email already exists. Try logging in instead.')
        setLoading(false)
        return
      }

      const supabase = supabaseRef.current
      if (!supabase) {
        setError('Application error: Supabase not ready')
        setLoading(false)
        return
      }

      const { data, error: signupError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: name },
          emailRedirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/verify-email`,
        },
      })

      if (signupError) {
        if (
          signupError.message.includes('already registered') ||
          signupError.message.includes('already exists') ||
          signupError.status === 422
        ) {
          setError('An account with this email already exists. Try logging in instead.')
        } else if (signupError.message.includes('weak')) {
          setError('Password is too weak. Use a mix of uppercase, lowercase, numbers, and symbols.')
        } else if (signupError.message.includes('invalid email')) {
          setError('Please enter a valid email address')
        } else {
          setError('Failed to create account. Please try again.')
        }
        setLoading(false)
        return
      }

      // Check if identities array is empty (edge case where user exists but signup returned success)
      if (data.user && (!data.user.identities || data.user.identities.length === 0)) {
        setError('An account with this email already exists. Try logging in instead.')
        setLoading(false)
        return
      }

      // Send welcome email
      try {
        await fetch('/api/auth/send-welcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, name }),
        })
      } catch (emailError) {
        console.error('Failed to send welcome email:', emailError)
        // Don't fail signup if email fails
      }

      setDone(true)
    } catch (error) {
      console.error('Signup error:', error)
      setError('An unexpected error occurred. Please try again.')
      setLoading(false)
    }
  }

  if (done) {
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
            border: '1px solid rgba(14,173,110,.25)',
            borderRadius: 20,
            overflow: 'hidden',
            boxShadow: '0 40px 100px rgba(0,0,0,.6)',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: '2rem',
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
            }}
          >
            Check your email
          </h2>
          <p
            style={{
              color: 'var(--muted)',
              fontSize: '.9rem',
              lineHeight: 1.7,
              marginBottom: '1.5rem',
            }}
          >
            We sent a verification link to{' '}
            <strong style={{ color: 'var(--white)' }}>{email}</strong>. Click it
            to activate your account and start trading with your Coinbase USD balance.
          </p>
          <div
            style={{
              display: 'flex',
              gap: '1rem',
              justifyContent: 'center',
            }}
          >
            <Link
              href="/login"
              className="btn-primary"
              style={{
                justifyContent: 'center',
                display: 'flex',
              }}
            >
              Go to Login →
            </Link>
          </div>
        </div>
      </div>
    )
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
          <span className="win-title">ase.app · Create Account</span>
        </div>

        <div style={{ padding: '2rem' }}>
          <h1
            style={{
              fontFamily: 'var(--font-head)',
              fontSize: '1.5rem',
              fontWeight: 800,
              marginBottom: '.35rem',
            }}
          >
            Create your account
          </h1>
          <p
            style={{
              fontSize: '.88rem',
              color: 'var(--muted)',
              marginBottom: '1.75rem',
            }}
          >
            Start investing in AI agents — connect your Coinbase account
          </p>

          <form
            onSubmit={handleSignup}
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
                DISPLAY NAME
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Alex Smith"
                className="input-base"
              />
            </div>

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
                EMAIL
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
                PASSWORD (8+ characters)
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="••••••••"
                className="input-base"
              />
              {password && (
                <div style={{ marginTop: '.5rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      gap: '.35rem',
                      alignItems: 'center',
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        height: '4px',
                        background: 'rgba(255,255,255,.1)',
                        borderRadius: '2px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          background:
                            passwordStrength < 33
                              ? 'var(--red)'
                              : passwordStrength < 66
                              ? '#FFA500'
                              : 'var(--green)',
                          width: `${passwordStrength}%`,
                          transition: 'width 0.2s ease, background 0.2s ease',
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: '.65rem',
                        fontFamily: 'var(--font-mono)',
                        color:
                          passwordStrength < 33
                            ? 'var(--red)'
                            : passwordStrength < 66
                            ? '#FFA500'
                            : 'var(--green)',
                        letterSpacing: '.04em',
                      }}
                    >
                      {passwordStrength < 33
                        ? 'Weak'
                        : passwordStrength < 66
                        ? 'Medium'
                        : 'Strong'}
                    </span>
                  </div>
                </div>
              )}
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

            <div
              style={{
                padding: '.75rem 1rem',
                background: 'rgba(14,173,110,.06)',
                border: '1px solid rgba(14,173,110,.15)',
                borderRadius: 10,
                fontSize: '.82rem',
                color: 'var(--muted)',
              }}
            >
              Connect your Coinbase account to invest real USD into AI trading agents.
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{
                width: '100%',
                justifyContent: 'center',
                marginTop: '.25rem',
              }}
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  Creating account...
                </>
              ) : (
                'Create Account →'
              )}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
            <Link
              href="/login"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '.68rem',
                color: 'var(--faint)',
              }}
            >
              Already have an account?{' '}
              <span style={{ color: 'var(--gold)' }}>Sign in →</span>
            </Link>
          </div>

          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '.58rem',
              color: 'var(--faint)',
              marginTop: '1rem',
              lineHeight: 1.6,
            }}
          >
            By signing up, you agree to ASE's terms of service. Real USD from your Coinbase account is used for trading.
          </p>
        </div>

        {/* Divider */}
        <div style={{ 
          display: 'flex', alignItems: 'center', gap: '1rem', 
          padding: '0 2rem 1.5rem',
        }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: '.6rem', color: 'var(--faint)', fontFamily: 'var(--font-mono)' }}>OR</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        {/* Coinbase Signup */}
        <div style={{ padding: '0 2rem 2rem' }}>
          <Link
            href="/api/auth/coinbase"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              padding: '0.85rem 1.5rem',
              background: '#0052FF',
              borderRadius: 12,
              color: 'white',
              fontWeight: 600,
              fontSize: '.9rem',
              textDecoration: 'none',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#0044CC'
              e.currentTarget.style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = '#0052FF'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
            </svg>
            Continue with Coinbase
          </Link>
          <p style={{ 
            fontSize: '.6rem', color: 'var(--faint)', fontFamily: 'var(--font-mono)',
            textAlign: 'center', marginTop: '0.75rem', lineHeight: 1.5,
          }}>
            Fast signup • Connect USD balance directly • Instant trading
          </p>
        </div>
      </div>
    </div>
  )
}
