'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import PublicNav from '@/components/ui/PublicNav'

export default function JoinPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [investmentRange, setInvestmentRange] = useState('')
  const [source, setSource] = useState('')
  const [extra, setExtra] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !name) return
    setStatus('loading')
    try {
      const supabase = createClient()
      const { error } = await supabase.from('waitlist_investors').insert({
        email,
        name,
        investment_range: investmentRange || null,
        source: source || extra || null,
      })
      if (error) throw error
      await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, type: 'investor' }),
      }).catch(() => null)
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '.75rem 1rem',
    color: 'var(--white)',
    fontSize: '.95rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    transition: 'border-color .2s, box-shadow .2s',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--white)' }}>
      <PublicNav />

      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '8.5rem 1.5rem 4rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr .95fr', gap: '1.5rem', alignItems: 'center' }} className="hero-grid">
          <div>
            <div className="eyebrow" style={{ color: 'var(--blue)', marginBottom: '.75rem' }}>
              INVESTOR COHORT
            </div>
            <h1 style={{ fontFamily: 'var(--font-body)', fontSize: 'clamp(2.3rem, 4.4vw, 4rem)', lineHeight: 1.04, letterSpacing: '-.05em', margin: '0 0 1rem' }}>
              Join the first investor cohort.
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: '1rem', lineHeight: 1.7, maxWidth: 560 }}>
              Allocate into live trading agents, track every trade in real time, and stay in custody of your capital while ASE handles the execution layer.
            </p>
            <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
              <Link href="/agents" className="btn-secondary" style={{ padding: '.8rem 1rem' }}>Browse strategies</Link>
              <Link href="/signup" className="btn-primary" style={{ padding: '.8rem 1rem' }}>Create account</Link>
            </div>
          </div>

          <div className="card" style={{ padding: '1.25rem' }}>
            {status === 'success' ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                <div style={{ width: 54, height: 54, borderRadius: 16, background: 'rgba(22,199,132,.12)', border: '1px solid var(--mint-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', color: 'var(--mint)', fontSize: '1.4rem', fontWeight: 800 }}>
                  ✓
                </div>
                <h2 style={{ fontFamily: 'var(--font-body)', fontSize: '1.4rem', fontWeight: 800, marginBottom: '.5rem' }}>You’re on the list</h2>
                <p style={{ color: 'var(--muted)', lineHeight: 1.7, marginBottom: '1.25rem' }}>
                  We’ll reach out with cohort access details and strategy updates.
                </p>
                <Link href="/" className="btn-primary">Back to ASE</Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
                <div>
                  <div className="eyebrow" style={{ color: 'var(--mint)', marginBottom: '.35rem' }}>EARLY ACCESS</div>
                  <h2 style={{ fontFamily: 'var(--font-body)', fontSize: '1.45rem', fontWeight: 800, margin: 0 }}>Request cohort access</h2>
                </div>

                <div>
                  <label style={{ fontSize: '.78rem', color: 'var(--muted)', display: 'block', marginBottom: '.35rem', fontWeight: 600 }}>Full name *</label>
                  <input value={name} onChange={e => setName(e.target.value)} required style={inputStyle} placeholder="Your name" />
                </div>
                <div>
                  <label style={{ fontSize: '.78rem', color: 'var(--muted)', display: 'block', marginBottom: '.35rem', fontWeight: 600 }}>Email *</label>
                  <input value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} placeholder="you@email.com" />
                </div>
                <div>
                  <label style={{ fontSize: '.78rem', color: 'var(--muted)', display: 'block', marginBottom: '.35rem', fontWeight: 600 }}>Target allocation</label>
                  <select value={investmentRange} onChange={e => setInvestmentRange(e.target.value)} style={{ ...inputStyle, appearance: 'none' }}>
                    <option value="">Select range</option>
                    <option value="$1k-$5k">$1k - $5k</option>
                    <option value="$5k-$25k">$5k - $25k</option>
                    <option value="$25k-$100k">$25k - $100k</option>
                    <option value="$100k+">$100k+</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '.78rem', color: 'var(--muted)', display: 'block', marginBottom: '.35rem', fontWeight: 600 }}>How did you hear about ASE?</label>
                  <select value={source} onChange={e => setSource(e.target.value)} style={{ ...inputStyle, appearance: 'none' }}>
                    <option value="">Select source</option>
                    <option value="Friend or founder">Friend or founder</option>
                    <option value="Crypto community">Crypto community</option>
                    <option value="Press / podcast">Press / podcast</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '.78rem', color: 'var(--muted)', display: 'block', marginBottom: '.35rem', fontWeight: 600 }}>What strategies interest you most? <span style={{ color: 'var(--faint)' }}>(optional)</span></label>
                  <textarea value={extra} onChange={e => setExtra(e.target.value)} rows={3} placeholder="e.g. BTC trend following, market neutral, rotation..." style={{ ...inputStyle, resize: 'none' }} />
                </div>

                <button type="submit" disabled={status === 'loading'} className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '.25rem', padding: '.85rem 1rem' }}>
                  {status === 'loading' ? 'Submitting...' : 'Join Investor Cohort'}
                </button>

                {status === 'error' && <div style={{ color: 'var(--red)', fontSize: '.85rem', textAlign: 'center' }}>Something went wrong. Please try again.</div>}
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
