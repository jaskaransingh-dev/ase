'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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
  const [mounted, setMounted] = useState(false)
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)

  useEffect(() => {
    setMounted(true)
    if (typeof window !== 'undefined') {
      supabaseRef.current = createClient()
    }
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = supabaseRef.current
    if (!supabase) {
      setError('Supabase not ready')
      setLoading(false)
      return
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push(redirect)
      router.refresh()
    }
  }

  if (!mounted) return null

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
