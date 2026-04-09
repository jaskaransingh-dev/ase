'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function BuildersPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [githubUrl, setGithubUrl] = useState('')
  const [strategyType, setStrategyType] = useState('')
  const [backtestingPlatform, setBacktestingPlatform] = useState('')
  const [extra, setExtra] = useState('')
  const [liveTrackRecord, setLiveTrackRecord] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !name || !githubUrl) return
    setStatus('loading')
    try {
      const supabase = createClient()
      const { error } = await supabase.from('waitlist_builders').insert({
        email,
        name,
        github_url: githubUrl,
        strategy_type: strategyType || null,
        strategy_description: extra || null,
        backtesting_platform: backtestingPlatform || null,
        live_track_record: liveTrackRecord,
      })
      if (error) throw error
      await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, type: 'developer' }),
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
      <div style={{ position: 'fixed', top: '10%', right: '7%', width: 100, height: 100, borderRadius: 18, border: '1px solid rgba(255,107,0,.1)', animation: 'floatBox 9s ease-in-out infinite 1s', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '20%', left: '5%', width: 68, height: 68, borderRadius: 12, border: '1px solid rgba(255,170,0,.08)', animation: 'floatBox 12s ease-in-out infinite reverse', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', top: '50%', left: '7%', width: 80, height: 80, borderRadius: 14, border: '1px solid rgba(255,107,0,.07)', animation: 'floatBox 10s ease-in-out infinite 3s', pointerEvents: 'none' }} />

      {/* Back nav */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 56, display: 'flex', alignItems: 'center', padding: '0 1.5rem', borderBottom: '1px solid var(--border)', background: 'rgba(6,3,0,.9)', backdropFilter: 'blur(14px)', zIndex: 100 }}>
        <Link href="/" style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.1rem' }}>
          AS<span style={{ color: 'var(--gold)' }}>E</span>
        </Link>
        <Link href="/" style={{ marginLeft: 'auto', fontSize: '.85rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
          ← Back
        </Link>
      </div>

      <div style={{ maxWidth: 560, width: '100%', marginTop: '3rem' }}>
        {status === 'success' ? (
          <div style={{ textAlign: 'center', padding: '3rem 2rem', background: 'var(--bg2)', border: '1px solid rgba(255,107,0,.15)', borderRadius: 20 }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(255,107,0,.1)', border: '1px solid rgba(255,107,0,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <svg width="26" height="26" viewBox="0 0 26 26" fill="none"><path d="M13 3C13 3 7 8 7 14a6 6 0 0012 0c0-6-6-11-6-11z" stroke="#FFB347" strokeWidth="1.8" strokeLinejoin="round"/><path d="M13 17v3M10 20h6" stroke="#FFB347" strokeWidth="1.8" strokeLinecap="round"/></svg>
            </div>
            <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.6rem', marginBottom: '.75rem' }}>Application received</h2>
            <p style={{ color: 'var(--muted)', lineHeight: 1.7, marginBottom: '2rem' }}>
              We&apos;ll review your strategy, repo, and track record for the next cohort. Expect to hear from us within a week.
            </p>
            <Link href="/" className="btn-primary" style={{ display: 'inline-block' }}>Back to ASE</Link>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem', fontFamily: 'var(--font-mono)', fontSize: '.62rem', letterSpacing: '.1em', color: 'var(--gold)', border: '1px solid rgba(255,107,0,.25)', background: 'rgba(255,107,0,.07)', padding: '.35rem .85rem', borderRadius: 999, marginBottom: '1.25rem' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', animation: 'dotBlink 1.8s infinite', display: 'inline-block' }} />
                BUILDER APPLICATIONS · OPEN
              </div>
              <h1 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 'clamp(1.8rem,4vw,2.5rem)', letterSpacing: '-.02em', lineHeight: 1.2, marginBottom: '.75rem' }}>
                Launch your strategy on ASE
              </h1>
              <p style={{ color: 'var(--muted)', fontSize: '1rem', lineHeight: 1.7, maxWidth: 440, margin: '0 auto' }}>
                Submit your repo, track record, and stack. We handle the storefront, investor funnel, and operational infrastructure once you clear diligence.
              </p>
            </div>

            {/* Feature bullets */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '2rem' }}>
              {([
                { icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M7.5 1v2M7.5 12v2M1 7.5h2M12 7.5h2M3.2 3.2l1.4 1.4M10.4 10.4l1.4 1.4M3.2 11.8l1.4-1.4M10.4 4.6l1.4-1.4" stroke="#FFB347" strokeWidth="1.4" strokeLinecap="round"/></svg>, text: 'Infrastructure & hosting' },
                { icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="2" y="4" width="11" height="8" rx="1.5" stroke="#FFB347" strokeWidth="1.4"/><path d="M5 4V3a2 2 0 014 0v1" stroke="#FFB347" strokeWidth="1.4"/><circle cx="7.5" cy="8" r="1.2" fill="#FFB347"/></svg>, text: 'Investor capital formation' },
                { icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><polyline points="2,11 5,7 8,9 13,3" stroke="#FFB347" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>, text: 'Live performance tracking' },
                { icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M5 6V4a2.5 2.5 0 015 0v2" stroke="#FFB347" strokeWidth="1.4"/><rect x="2.5" y="6" width="10" height="7" rx="1.5" stroke="#FFB347" strokeWidth="1.4"/></svg>, text: 'Strategy IP protection' },
              ] as Array<{ icon: React.ReactNode; text: string }>).map(f => (
                <div key={f.text} style={{ background: 'rgba(255,107,0,.04)', border: '1px solid rgba(255,107,0,.1)', borderRadius: 10, padding: '.75rem 1rem', display: 'flex', alignItems: 'center', gap: '.6rem', fontSize: '.88rem', color: 'var(--muted)' }}>
                  {f.icon} {f.text}
                </div>
              ))}
            </div>

            {/* Form */}
            <div style={{ background: 'var(--bg2)', border: '1px solid rgba(255,107,0,.12)', borderRadius: 20, padding: '2.5rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, var(--gold), transparent)' }} />

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '.78rem', color: 'var(--muted)', display: 'block', marginBottom: '.35rem', fontWeight: 600 }}>Name *</label>
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
                </div>

                <div>
                  <label style={{ fontSize: '.78rem', color: 'var(--muted)', display: 'block', marginBottom: '.35rem', fontWeight: 600 }}>GitHub repo or profile *</label>
                  <input
                    type="url"
                    placeholder="https://github.com/you/strategy"
                    required
                    value={githubUrl}
                    onChange={e => setGithubUrl(e.target.value)}
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '.78rem', color: 'var(--muted)', display: 'block', marginBottom: '.35rem', fontWeight: 600 }}>Strategy type</label>
                    <select
                      value={strategyType}
                      onChange={e => setStrategyType(e.target.value)}
                      style={{ ...inputStyle, appearance: 'none' }}
                    >
                      <option value="">Select type</option>
                      <option value="momentum">Momentum</option>
                      <option value="mean-reversion">Mean Reversion</option>
                      <option value="trend-following">Trend Following</option>
                      <option value="ml-driven">ML Driven</option>
                      <option value="arbitrage">Arbitrage</option>
                      <option value="market-making">Market Making</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '.78rem', color: 'var(--muted)', display: 'block', marginBottom: '.35rem', fontWeight: 600 }}>Backtesting stack</label>
                    <input
                      type="text"
                      placeholder="QuantConnect, custom..."
                      value={backtestingPlatform}
                      onChange={e => setBacktestingPlatform(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '.78rem', color: 'var(--muted)', display: 'block', marginBottom: '.35rem', fontWeight: 600 }}>Strategy overview *</label>
                  <textarea
                    placeholder="Describe your edge, risk controls, key indicators, and any live or paper track record..."
                    value={extra}
                    onChange={e => setExtra(e.target.value)}
                    rows={4}
                    required
                    style={{ ...inputStyle, resize: 'none' }}
                  />
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '.75rem', fontSize: '.88rem', color: 'var(--muted)', cursor: 'pointer', padding: '.75rem', background: 'rgba(255,107,0,.03)', border: '1px solid rgba(255,107,0,.08)', borderRadius: 8 }}>
                  <input
                    type="checkbox"
                    checked={liveTrackRecord}
                    onChange={e => setLiveTrackRecord(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: 'var(--gold)' }}
                  />
                  I have a live or paper track record I can share during diligence
                </label>

                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="btn-primary"
                  style={{ width: '100%', textAlign: 'center', opacity: status === 'loading' ? 0.6 : 1, marginTop: '.5rem', padding: '.9rem', fontSize: '1rem', borderRadius: 12 }}
                >
                  {status === 'loading' ? 'Submitting...' : 'Apply to Launch on ASE'}
                </button>

                {status === 'error' && (
                  <div style={{ color: 'var(--red)', fontSize: '.85rem', textAlign: 'center' }}>
                    Something went wrong. Please try again.
                  </div>
                )}
              </form>
            </div>

            <p style={{ textAlign: 'center', fontSize: '.78rem', color: 'var(--faint)', marginTop: '1.25rem', lineHeight: 1.6 }}>
              We review every application manually · Cohort size is limited
            </p>
          </>
        )}
      </div>

      <style>{`
        @keyframes floatBox {
          0%,100% { transform: translateY(0px) rotate(0deg); opacity: .6; }
          50% { transform: translateY(-14px) rotate(1deg); opacity: .9; }
        }
        @media(max-width:600px){
          .form-two-col { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
