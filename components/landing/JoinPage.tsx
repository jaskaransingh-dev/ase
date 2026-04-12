'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

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
      // Backup API write
      await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, type: 'investor' }),
      }).catch(() => {})
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,107,0,.04)',
    border: '1px solid rgba(255,107,0,.15)',
    borderRadius: 10,
    padding: '.75rem 1rem',
    color: 'var(--white)',
    fontSize: '.95rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    transition: 'border-color .2s',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--white)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 1.5rem', position: 'relative', overflow: 'hidden' }}>
      {/* Floating boxes */}
      <div style={{ position: 'fixed', top: '12%', left: '6%', width: 110, height: 110, borderRadius: 18, border: '1px solid rgba(255,107,0,.1)', animation: 'floatBox 9s ease-in-out infinite', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '18%', right: '5%', width: 72, height: 72, borderRadius: 12, border: '1px solid rgba(255,170,0,.08)', animation: 'floatBox 12s ease-in-out infinite reverse', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', top: '55%', right: '8%', width: 88, height: 88, borderRadius: 14, border: '1px solid rgba(255,107,0,.07)', animation: 'floatBox 11s ease-in-out infinite 2s', pointerEvents: 'none' }} />

      {/* Back nav */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 56, display: 'flex', alignItems: 'center', padding: '0 1.5rem', borderBottom: '1px solid var(--border)', background: 'rgba(6,3,0,.9)', backdropFilter: 'blur(14px)', zIndex: 100 }}>
        <Link href="/" style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.1rem' }}>
          AS<span style={{ color: 'var(--gold)' }}>E</span>
        </Link>
        <Link href="/" style={{ marginLeft: 'auto', fontSize: '.85rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
          ← Back
        </Link>
      </div>

      <div style={{ maxWidth: 520, width: '100%', marginTop: '3rem' }}>
        {status === 'success' ? (
          <div style={{ textAlign: 'center', padding: '3rem 2rem', background: 'var(--bg2)', border: '1px solid rgba(255,107,0,.15)', borderRadius: 20 }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem', color: 'var(--mint)' }}>+</div>
            <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.6rem', marginBottom: '.75rem' }}>You&apos;re on the list</h2>
            <p style={{ color: 'var(--muted)', lineHeight: 1.7, marginBottom: '2rem' }}>
              We&apos;ll reach out with cohort access details and strategy performance updates. First cohort is limited — early spots fill fast.
            </p>
            <Link href="/" className="btn-primary" style={{ display: 'inline-block' }}>Back to ASE</Link>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem', fontFamily: 'var(--font-mono)', fontSize: '.62rem', letterSpacing: '.1em', color: 'var(--green)', border: '1px solid rgba(14,173,110,.2)', background: 'rgba(14,173,110,.06)', padding: '.35rem .85rem', borderRadius: 999, marginBottom: '1.25rem' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', animation: 'dotBlink 1.8s infinite', display: 'inline-block' }} />
                INVESTOR COHORT · EARLY ACCESS
              </div>
              <h1 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 'clamp(1.8rem,4vw,2.5rem)', letterSpacing: '-.02em', lineHeight: 1.2, marginBottom: '.75rem' }}>
                Join the first investor cohort
              </h1>
              <p style={{ color: 'var(--muted)', fontSize: '1rem', lineHeight: 1.7, maxWidth: 420, margin: '0 auto' }}>
                Allocate into live trading agents. Own a piece of each strategy, track every trade in real-time, and let NAV reflect actual performance.
              </p>
            </div>

            {/* Form */}
            <div style={{ background: 'var(--bg2)', border: '1px solid rgba(255,107,0,.12)', borderRadius: 20, padding: '2.5rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, var(--green), transparent)' }} />

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '.78rem', color: 'var(--muted)', display: 'block', marginBottom: '.35rem', fontWeight: 600 }}>Full name *</label>
                  <input
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '.78rem', color: 'var(--muted)', display: 'block', marginBottom: '.35rem', fontWeight: 600 }}>Email *</label>
                  <input
                    type="email"
                    placeholder="you@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '.78rem', color: 'var(--muted)', display: 'block', marginBottom: '.35rem', fontWeight: 600 }}>Target allocation</label>
                  <select
                    value={investmentRange}
                    onChange={e => setInvestmentRange(e.target.value)}
                    style={{ ...inputStyle, appearance: 'none' }}
                  >
                    <option value="">Select range</option>
                    <option value="$1k-$5k">$1k – $5k</option>
                    <option value="$5k-$25k">$5k – $25k</option>
                    <option value="$25k-$100k">$25k – $100k</option>
                    <option value="$100k+">$100k+</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '.78rem', color: 'var(--muted)', display: 'block', marginBottom: '.35rem', fontWeight: 600 }}>How did you hear about ASE?</label>
                  <select
                    value={source}
                    onChange={e => setSource(e.target.value)}
                    style={{ ...inputStyle, appearance: 'none' }}
                  >
                    <option value="">Select source</option>
                    <option value="Friend or founder">Friend or founder</option>
                    <option value="Crypto community">Crypto community</option>
                    <option value="Press / podcast">Press / podcast</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '.78rem', color: 'var(--muted)', display: 'block', marginBottom: '.35rem', fontWeight: 600 }}>What strategies interest you most? <span style={{ color: 'var(--faint)' }}>(optional)</span></label>
                  <textarea
                    placeholder="e.g. BTC trend following, market-neutral, high-frequency crypto..."
                    value={extra}
                    onChange={e => setExtra(e.target.value)}
                    rows={3}
                    style={{ ...inputStyle, resize: 'none' }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="btn-primary"
                  style={{ width: '100%', textAlign: 'center', opacity: status === 'loading' ? 0.6 : 1, marginTop: '.5rem', padding: '.9rem', fontSize: '1rem', borderRadius: 12 }}
                >
                  {status === 'loading' ? 'Submitting...' : 'Join Investor Cohort'}
                </button>

                {status === 'error' && (
                  <div style={{ color: 'var(--red)', fontSize: '.85rem', textAlign: 'center' }}>
                    Something went wrong. Please try again.
                  </div>
                )}
              </form>
            </div>

            {/* Footer note */}
            <p style={{ textAlign: 'center', fontSize: '.78rem', color: 'var(--faint)', marginTop: '1.25rem', lineHeight: 1.6 }}>
              Paper trading only · Not financial advice · Early cohort access is limited
            </p>
          </>
        )}
      </div>

      <style>{`
        @keyframes floatBox {
          0%,100% { transform: translateY(0px) rotate(0deg); opacity: .6; }
          50% { transform: translateY(-14px) rotate(1deg); opacity: .9; }
        }
      `}</style>
    </div>
  )
}
