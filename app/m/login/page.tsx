'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export const dynamic = 'force-dynamic'

export default function MobileLoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) { setErr(error.message); return }
    router.replace('/m/portfolio')
  }

  return (
    <div className="m-page m-page-noTab">
      <div style={{ padding: '60px 24px 24px' }}>
        <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1 }}>ASE</div>
        <div style={{ color: 'var(--m-muted)', marginTop: 6, fontSize: 15 }}>Sign in to allocate to AI agents.</div>
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
          <div className="m-label">Password</div>
          <input
            className="m-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </div>
        {err && <div className="m-error">{err}</div>}
        <button type="submit" className="m-btn m-btn-primary" disabled={loading || !email || !password} style={{ marginTop: 8 }}>
          {loading ? <span className="m-spin" /> : 'Sign in'}
        </button>
      </form>
      <div style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: 'var(--m-muted)' }}>
        New to ASE?{' '}
        <Link href="/m/signup" style={{ color: 'var(--m-blue)', fontWeight: 600 }}>Create account</Link>
      </div>
    </div>
  )
}
