'use client'
import { useState } from 'react'
import Link from 'next/link'

export default function AgentSubmitPage() {
  const [form, setForm] = useState({ name: '', email: '', strategy: '', github: '' })
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handle(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          name: form.name,
          github: form.github,
          strategy: form.strategy,
          type: 'developer'
        }),
      })
      if (!res.ok) throw new Error('Submission failed')
      setDone(true)
    } catch {
      alert('Submission failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '2rem 2.5rem', maxWidth: 640 }}>
      <Link href="/agents" style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: 'var(--faint)', display: 'inline-flex', alignItems: 'center', gap: '.35rem', marginBottom: '1.5rem' }}>← Back to Agents</Link>

      <div className="eyebrow" style={{ marginBottom: '.35rem' }}>BUILDER PROGRAM</div>
      <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '1.8rem', fontWeight: 800, marginBottom: '.5rem' }}>Submit Your Agent</h1>
      <p style={{ color: 'var(--muted)', fontSize: '.95rem', lineHeight: 1.75, marginBottom: '2rem' }}>
        Have a strategy that genuinely performs? Join the builder waitlist. We review all submissions manually and reach out to candidates who meet our verification criteria.
      </p>

      {done ? (
        <div style={{ background: 'var(--bg2)', border: '1px solid rgba(14,173,110,.25)', borderRadius: 20, padding: '2.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem', color: 'var(--gold)' }}>◆</div>
          <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.3rem', fontWeight: 800, marginBottom: '.5rem' }}>Application received</h2>
          <p style={{ color: 'var(--muted)', fontSize: '.9rem', marginBottom: '1.5rem' }}>We&apos;ll review your submission and reach out at the email you provided. We typically respond within 2 weeks.</p>
          <Link href="/agents" className="btn-secondary">Browse Agents</Link>
        </div>
      ) : (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,.5)' }}>
          <div className="win-bar">
            <span className="dot dot-r" /><span className="dot dot-y" /><span className="dot dot-g" />
            <span className="win-title">Agent Submission Form · Waitlist</span>
          </div>
          <div style={{ padding: '1.75rem' }}>
            <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              {[
                { key: 'name', label: 'YOUR NAME', type: 'text', placeholder: 'Alex Smith' },
                { key: 'email', label: 'EMAIL ADDRESS', type: 'email', placeholder: 'you@example.com' },
                { key: 'github', label: 'GITHUB / PORTFOLIO LINK', type: 'url', placeholder: 'https://github.com/yourhandle' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.65rem', letterSpacing: '.08em', color: 'var(--faint)', marginBottom: '.45rem' }}>{f.label}</label>
                  <input type={f.type} value={(form as Record<string, string>)[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} placeholder={f.placeholder} required className="input-base" />
                </div>
              ))}
              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.65rem', letterSpacing: '.08em', color: 'var(--faint)', marginBottom: '.45rem' }}>STRATEGY DESCRIPTION</label>
                <textarea value={form.strategy} onChange={e => setForm(prev => ({ ...prev, strategy: e.target.value }))} required placeholder="Describe your strategy, approach, markets traded, backtest methodology, and any live paper trading evidence..." rows={5} className="input-base" style={{ resize: 'vertical', lineHeight: 1.6 }} />
              </div>

              <div style={{ padding: '.9rem 1rem', background: 'rgba(232,172,32,.05)', border: '1px solid rgba(232,172,32,.12)', borderRadius: 12, fontSize: '.82rem', color: 'var(--muted)' }}>
                <strong style={{ color: 'var(--white)' }}>What we look for:</strong> Consistent methodology, reproducible backtest, 60+ days of paper trading evidence, clear risk controls, and a working API integration.
              </div>

              <button type="submit" disabled={loading} className="btn-primary" style={{ justifyContent: 'center' }}>
                {loading ? <><span className="spinner" />Submitting...</> : 'Submit Application →'}
              </button>
            </form>
          </div>
        </div>
      )}

      <div style={{ marginTop: '1.5rem', padding: '1rem 1.25rem', background: 'rgba(255,255,255,.02)', border: '1px solid var(--border)', borderRadius: 14 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', letterSpacing: '.08em', color: 'var(--faint)', marginBottom: '.35rem' }}>DIRECT CONTACT</div>
        <a href="mailto:builders@launchase.com" style={{ color: 'var(--gold)', fontSize: '.88rem' }}>builders@launchase.com</a>
        <p style={{ color: 'var(--muted)', fontSize: '.82rem', marginTop: '.2rem' }}>Include strategy description, backtest methodology, and live paper trading evidence.</p>
      </div>
    </div>
  )
}
