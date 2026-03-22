'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const redirect = params.get('redirect') || '/dashboard'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push(redirect)
      router.refresh()
    }
  }

  return (
    <div style={{ width: '100%', maxWidth: 420 }}>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,.6)' }}>
        <div className="win-bar">
          <span className="dot dot-r" /><span className="dot dot-y" /><span className="dot dot-g" />
          <span className="win-title">ase.app · Sign In</span>
        </div>
        <div style={{ padding: '2rem' }}>
          <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '1.5rem', fontWeight: 800, marginBottom: '.35rem' }}>Welcome back</h1>
          <p style={{ fontSize: '.88rem', color: 'var(--muted)', marginBottom: '1.75rem' }}>Sign in to your ASE account</p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.65rem', letterSpacing: '.08em', color: 'var(--faint)', marginBottom: '.45rem' }}>EMAIL</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="founders@launchase.com" className="input-base" />
            </div>
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.65rem', letterSpacing: '.08em', color: 'var(--faint)', marginBottom: '.45rem' }}>PASSWORD</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" className="input-base" />
            </div>

            {error && (
              <div style={{ padding: '.75rem 1rem', background: 'rgba(232,64,64,.08)', border: '1px solid rgba(232,64,64,.2)', borderRadius: 10, fontSize: '.85rem', color: 'var(--red)' }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '.25rem' }}>
              {loading ? <><span className="spinner" />Signing in...</> : 'Sign In →'}
            </button>
          </form>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.25rem', flexWrap: 'wrap', gap: '.5rem' }}>
            <Link href="/forgot-password" style={{ fontFamily: 'var(--font-mono)', fontSize: '.68rem', color: 'var(--faint)' }}>Forgot password?</Link>
            <Link href="/signup" style={{ fontFamily: 'var(--font-mono)', fontSize: '.68rem', color: 'var(--gold)' }}>Create account →</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
