'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export const dynamic = 'force-dynamic'

export default function MobileSignupPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [verifySent, setVerifySent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/m/login` : undefined },
    })
    setLoading(false)
    if (error) { setErr(error.message); return }
    if (data.session) {
      router.replace('/m/portfolio')
    } else {
      setVerifySent(true)
    }
  }

  if (verifySent) {
    return (
      <div className="m-page m-page-noTab">
        <div className="m-empty" style={{ paddingTop: '20vh' }}>
          <div className="m-empty-emoji">✉️</div>
          <div className="m-empty-title">Check your email</div>
          <div className="m-empty-sub">We sent a confirmation link to {email}.</div>
          <div style={{ marginTop: 24 }}>
            <Link href="/m/login" className="m-btn m-btn-ghost" style={{ display: 'inline-flex', width: 'auto', padding: '0 24px' }}>
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="m-page m-page-noTab">
      <div style={{ padding: '60px 24px 24px' }}>
        <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1 }}>Create account</div>
        <div style={{ color: 'var(--m-muted)', marginTop: 6, fontSize: 15 }}>Start with $10. Withdraw anytime.</div>
      </div>
      <form onSubmit={handleSubmit} style={{ padding: '0 20px', display: 'grid', gap: 12 }}>
        <div>
          <div className="m-label">Email</div>
          <input
            className="m-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <div className="m-label">Password (8+ chars)</div>
          <input
            className="m-input"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </div>
        {err && <div className="m-error">{err}</div>}
        <button type="submit" className="m-btn m-btn-primary" disabled={loading || !email || password.length < 8} style={{ marginTop: 8 }}>
          {loading ? <span className="m-spin" /> : 'Create account'}
        </button>
      </form>
      <div style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: 'var(--m-muted)' }}>
        Have an account?{' '}
        <Link href="/m/login" style={{ color: 'var(--m-blue)', fontWeight: 600 }}>Sign in</Link>
      </div>
    </div>
  )
}
