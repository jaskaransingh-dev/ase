'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Apple, Globe } from 'lucide-react'

export default function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  // Validate redirect to prevent open redirect attacks — only allow relative paths
  const rawRedirect = params.get('redirect') || '/dashboard'
  const redirect = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/dashboard'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(params.get('error') || '')
  const [loading, setLoading] = useState(false)
  const [showResendVerification, setShowResendVerification] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null)
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
      // Check if error is due to unconfirmed email
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
      router.push(redirect)
      router.refresh()
    }
  }

  async function handleOAuth(provider: 'google' | 'apple') {
    setOauthLoading(provider)
    setError('')

    const supabase = supabaseRef.current
    if (!supabase) {
      setError('Application error: Supabase not ready')
      setOauthLoading(null)
      return
    }

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}${redirect}`,
      },
    })

    if (oauthError) {
      setError(`Failed to continue with ${provider === 'google' ? 'Google' : 'Apple'}.`)
      setOauthLoading(null)
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
          transition: 'border-color 0.2s ease, transform 0.2s ease',
        }}
      >
        <div className="win-bar">
          <span className="dot dot-r" />
          <span className="dot dot-y" />
          <span className="dot dot-g" />
          <span className="win-title">ase.app · Sign In</span>
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
            Welcome back
          </h1>
          <p
            style={{
              fontSize: '.88rem',
              color: 'var(--muted)',
              marginBottom: '1.75rem',
            }}
          >
            Sign in to your ASE account
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem', marginBottom: '1rem' }}>
            <button
              type="button"
              onClick={() => handleOAuth('google')}
              disabled={!!oauthLoading || loading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '.5rem',
                padding: '.72rem .9rem',
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--bg3)',
                color: 'var(--white)',
                fontSize: '.85rem',
                fontWeight: 600,
                cursor: oauthLoading || loading ? 'not-allowed' : 'pointer',
                opacity: oauthLoading === 'google' ? 0.75 : 1,
              }}
            >
              {oauthLoading === 'google' ? <span className="spinner" /> : <Globe size={16} />}
              Google
            </button>
            <button
              type="button"
              onClick={() => handleOAuth('apple')}
              disabled={!!oauthLoading || loading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '.5rem',
                padding: '.72rem .9rem',
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--bg3)',
                color: 'var(--white)',
                fontSize: '.85rem',
                fontWeight: 600,
                cursor: oauthLoading || loading ? 'not-allowed' : 'pointer',
                opacity: oauthLoading === 'apple' ? 0.75 : 1,
              }}
            >
              {oauthLoading === 'apple' ? <span className="spinner" /> : <Apple size={16} />}
              Apple
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '.7rem', margin: '1rem 0 1.15rem' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', letterSpacing: '.1em' }}>OR USE EMAIL</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          <form
            onSubmit={handleLogin}
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
                EMAIL
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="founders@launchase.com"
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
                PASSWORD
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="input-base"
              />
            </div>

            {error && (
              <div
                style={{
                  padding: '.75rem 1rem',
                  background:
                    error.toLowerCase().includes('verify') || error.toLowerCase().includes('sent')
                      ? 'rgba(14,173,110,.08)'
                      : 'rgba(232,64,64,.08)',
                  border:
                    error.toLowerCase().includes('verify') || error.toLowerCase().includes('sent')
                      ? '1px solid rgba(14,173,110,.2)'
                      : '1px solid rgba(232,64,64,.2)',
                  borderRadius: 10,
                  fontSize: '.85rem',
                  color:
                    error.toLowerCase().includes('verify') || error.toLowerCase().includes('sent')
                      ? 'var(--green)'
                      : 'var(--red)',
                }}
              >
                {error}
              </div>
            )}

            {showResendVerification && (
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={resendLoading}
                style={{
                  width: '100%',
                  padding: '.75rem 1rem',
                  background: 'transparent',
                  border: '1px solid rgba(14,173,110,.3)',
                  borderRadius: 10,
                  color: 'var(--green)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '.85rem',
                  fontWeight: 600,
                  cursor: resendLoading ? 'not-allowed' : 'pointer',
                  opacity: resendLoading ? 0.6 : 1,
                  transition: 'all 0.2s ease',
                }}
              >
                {resendLoading ? (
                  <>
                    <span className="spinner" style={{ marginRight: '.5rem' }} />
                    Sending...
                  </>
                ) : (
                  '↻ Resend Verification Email'
                )}
              </button>
            )}

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
                  Signing in...
                </>
              ) : (
                'Sign In →'
              )}
            </button>
          </form>

          <style>{`
            .login-link-muted:hover { color: var(--gold) !important; }
            .login-link-gold:hover { opacity: 0.8; }
          `}</style>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: '1.25rem',
              flexWrap: 'wrap',
              gap: '.5rem',
            }}
          >
            <Link
              href="/forgot-password"
              className="login-link-muted"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '.68rem',
                color: 'var(--faint)',
                transition: 'color 0.2s ease',
              }}
            >
              Forgot password?
            </Link>
            <Link
              href="/signup"
              className="login-link-gold"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '.68rem',
                color: 'var(--gold)',
                transition: 'opacity 0.2s ease',
              }}
            >
              Create account →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
