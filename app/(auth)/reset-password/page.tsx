'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  async function handle(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setLoading(false) }
    else router.push('/dashboard')
  }

  return (
    <div style={{ width: '100%', maxWidth: 420 }}>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,.6)' }}>
        <div className="win-bar">
          <span className="dot dot-r" /><span className="dot dot-y" /><span className="dot dot-g" />
          <span className="win-title">ase.app · New Password</span>
        </div>
        <div style={{ padding: '2rem' }}>
          <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '1.4rem', fontWeight: 800, marginBottom: '.35rem' }}>Set new password</h1>
          <p style={{ fontSize: '.88rem', color: 'var(--muted)', marginBottom: '1.75rem' }}>Choose a strong password for your account</p>
          <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} placeholder="New password (8+ chars)" className="input-base" />
            {error && <div style={{ color: 'var(--red)', fontSize: '.85rem' }}>{error}</div>}
            <button type="submit" disabled={loading} className="btn-primary" style={{ justifyContent: 'center' }}>
              {loading ? <><span className="spinner" />Updating...</> : 'Update Password →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
