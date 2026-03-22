'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  async function handle(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) { setError(error.message); setLoading(false) }
    else setDone(true)
  }

  return (
    <div style={{ width: '100%', maxWidth: 420 }}>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,.6)' }}>
        <div className="win-bar">
          <span className="dot dot-r" /><span className="dot dot-y" /><span className="dot dot-g" />
          <span className="win-title">ase.app · Reset Password</span>
        </div>
        <div style={{ padding: '2rem' }}>
          {done ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📬</div>
              <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.3rem', fontWeight: 800, marginBottom: '.5rem' }}>Check your email</h2>
              <p style={{ color: 'var(--muted)', fontSize: '.9rem', marginBottom: '1.5rem' }}>We sent a reset link to {email}</p>
              <Link href="/login" className="btn-secondary" style={{ justifyContent: 'center', display: 'flex' }}>Back to Login</Link>
            </div>
          ) : (
            <>
              <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '1.4rem', fontWeight: 800, marginBottom: '.35rem' }}>Forgot password?</h1>
              <p style={{ fontSize: '.88rem', color: 'var(--muted)', marginBottom: '1.75rem' }}>Enter your email to receive a reset link</p>
              <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" className="input-base" />
                {error && <div style={{ color: 'var(--red)', fontSize: '.85rem' }}>{error}</div>}
                <button type="submit" disabled={loading} className="btn-primary" style={{ justifyContent: 'center' }}>
                  {loading ? <><span className="spinner" />Sending...</> : 'Send Reset Link →'}
                </button>
              </form>
              <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                <Link href="/login" style={{ fontFamily: 'var(--font-mono)', fontSize: '.68rem', color: 'var(--faint)' }}>← Back to login</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
