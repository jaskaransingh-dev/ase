'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [mounted, setMounted] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    setMounted(true)
  }, [])

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    setError('')

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name },
        emailRedirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/verify-email`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      if (data.user) {
        try {
          await fetch('/api/create-wallet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: data.user.id }),
          })
        } catch {
          // Continue even if wallet creation fails
        }
      }

      try {
        await fetch('/api/send-verification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, name }),
        })
        setDone(true)
      } catch {
        setDone(true)
      }
    }
  }

  if (!mounted) return null

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
            to activate your account and get{' '}
            <strong style={{ color: 'var(--green)' }}>$100 in paper credits</strong>.
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
            Start investing in AI agents — free, paper trading only
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
              New accounts receive{' '}
              <strong style={{ color: 'var(--green)' }}>$100 in paper credits</strong>{' '}
              to start investing immediately.
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
            By signing up, you agree that ASE is a simulated paper trading
            platform. No real funds are invested.
          </p>
        </div>
      </div>
    </div>
  )
}
