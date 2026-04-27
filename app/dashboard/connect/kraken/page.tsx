'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

interface ConnectionStatus {
  connected: boolean
  key_label: string | null
  status: string | null
  verified_at: string | null
  last_balance_usd: number | null
  scopes: string[]
  connected_at: string | null
}

const STEPS = [
  {
    n: 1,
    title: 'Open Kraken API settings',
    body: (
      <>
        Sign in to your Kraken account, then visit{' '}
        <a href="https://www.kraken.com/u/security/api" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue2)', textDecoration: 'underline' }}>
          kraken.com/u/security/api
        </a>
        . If you don't yet have a Kraken account, create one first — you'll need to complete identity verification before API trading is enabled.
      </>
    ),
  },
  {
    n: 2,
    title: 'Click "Add key"',
    body: 'In the API section, click the "Add key" button. You\'ll see a form with a list of permissions (scopes).',
  },
  {
    n: 3,
    title: 'Set the required permissions',
    body: (
      <>
        ASE needs the following scopes to run agents on your account.
        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {[
            { label: 'Query Funds',         req: true,  reason: 'Read your USD + crypto balances to compute NAV' },
            { label: 'Query Open Orders & Trades', req: true,  reason: 'Reconcile fills back to the ledger' },
            { label: 'Query Closed Orders & Trades', req: true,  reason: 'Show your trade history' },
            { label: 'Create & Modify Orders', req: true,  reason: 'Place buy/sell orders for active strategies' },
            { label: 'Cancel/Close Orders',  req: true,  reason: 'Stop loss + emergency pause' },
            { label: 'Withdraw Funds',       req: false, reason: 'NEVER enable this. ASE never withdraws.' },
            { label: 'Deposit Funds',        req: false, reason: 'Not required.' },
          ].map(p => (
            <div key={p.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '0.5rem 0.7rem', background: p.req ? 'rgba(22,199,132,0.06)' : 'rgba(228,88,103,0.05)', border: `1px solid ${p.req ? 'rgba(22,199,132,0.25)' : 'rgba(228,88,103,0.25)'}`, borderRadius: 7 }}>
              <span style={{
                width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                background: p.req ? 'rgba(22,199,132,0.18)' : 'rgba(228,88,103,0.18)',
                color: p.req ? 'var(--mint)' : 'var(--red)',
                fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1,
              }}>{p.req ? '✓' : '✕'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--white)', fontWeight: 600 }}>{p.label}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 1 }}>{p.reason}</div>
              </div>
            </div>
          ))}
        </div>
      </>
    ),
  },
  {
    n: 4,
    title: 'Optional: restrict by IP',
    body: 'For maximum safety, paste this IP into the "Key Description" → "IP Address Restrictions" field. This means only ASE can use the key. (Skip if you don\'t know the platform IP yet — you can add it later.)',
  },
  {
    n: 5,
    title: 'Generate the key',
    body: 'Click "Generate key". Kraken will show you the API Key (public) and Private Key (secret). The secret is shown ONCE — copy both immediately to a secure place.',
  },
  {
    n: 6,
    title: 'Paste below',
    body: 'Paste the API Key and Private Key into the form on the right. We\'ll test them against Kraken, then encrypt them at rest. Your secret never leaves our servers in plaintext.',
  },
]

export default function ConnectKrakenPage() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') ?? '/dashboard'

  const [status, setStatus] = useState<ConnectionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/kraken/keys')
      .then(r => r.json())
      .then(d => { if (!cancelled) setStatus(d) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  async function submitKeys(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setMsg(null)
    try {
      const res = await fetch('/api/auth/kraken/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, api_secret: apiSecret }),
      })
      const d = await res.json()
      if (!res.ok) {
        setMsg({ type: 'err', text: d.error ?? 'Failed to save keys.' })
      } else {
        setMsg({ type: 'ok', text: `Connected. Balance: $${(d.balance_usd ?? 0).toFixed(2)}` })
        setApiKey('')
        setApiSecret('')
        // Refresh status
        const updated = await fetch('/api/auth/kraken/keys').then(r => r.json())
        setStatus(updated)
        // Optionally bounce to original destination after a moment
        setTimeout(() => router.push(next), 1500)
      }
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Network error.' })
    } finally {
      setSubmitting(false)
    }
  }

  async function disconnect() {
    if (!confirm('Disconnect your Kraken account from ASE? Active agents will stop trading on your behalf.')) return
    setSubmitting(true)
    try {
      await fetch('/api/auth/kraken/keys', { method: 'DELETE' })
      const updated = await fetch('/api/auth/kraken/keys').then(r => r.json())
      setStatus(updated)
      setMsg({ type: 'ok', text: 'Kraken disconnected.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--blue2)', letterSpacing: '0.12em', marginBottom: '0.4rem' }}>CONNECT BROKER</div>
        <h1 style={{ fontFamily: 'var(--font-body)', fontSize: '1.7rem', fontWeight: 800, color: 'var(--white)', letterSpacing: '-0.04em', margin: 0 }}>
          Connect your Kraken account
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.92rem', marginTop: '0.5rem', maxWidth: 720, lineHeight: 1.65 }}>
          ASE places trades on your account using API credentials you generate on Kraken.
          Your funds stay in your Kraken wallet — we never have withdrawal access.
        </p>
      </div>

      {/* Connected banner */}
      {status?.connected && (
        <div style={{ background: 'rgba(22,199,132,0.07)', border: '1px solid rgba(22,199,132,0.25)', borderRadius: 12, padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(22,199,132,0.18)', border: '1px solid rgba(22,199,132,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mint)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--white)' }}>Kraken connected · key {status.key_label}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--muted)', marginTop: 2 }}>
              Last verified: {status.verified_at ? new Date(status.verified_at).toLocaleString() : 'never'}
              {status.last_balance_usd !== null && ` · Balance: $${Number(status.last_balance_usd).toFixed(2)}`}
            </div>
          </div>
          <Link href="/dashboard" style={{ padding: '0.5rem 1rem', background: 'rgba(22,199,132,0.1)', border: '1px solid rgba(22,199,132,0.3)', borderRadius: 8, color: 'var(--mint)', fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none' }}>Go to Dashboard →</Link>
          <button onClick={disconnect} disabled={submitting} style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--red)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>Disconnect</button>
        </div>
      )}

      {/* Two-column layout: tutorial | paste form */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1.25rem' }} className="kraken-grid">
        {/* Tutorial */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.25rem' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#5841d4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 14, fontFamily: 'var(--font-mono)' }}>K</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--white)' }}>How to create a Kraken API key</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--muted)', letterSpacing: '0.08em' }}>SIX STEPS · ABOUT 3 MINUTES</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            {STEPS.map(s => (
              <div key={s.n} style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(79,140,255,0.12)', border: '1px solid rgba(79,140,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, color: 'var(--blue2)' }}>{s.n}</div>
                <div style={{ flex: 1, paddingTop: 2 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--white)', marginBottom: '0.35rem' }}>{s.title}</div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem', lineHeight: 1.65 }}>{s.body}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '1.5rem', padding: '1rem 1.1rem', background: 'rgba(245,185,66,0.06)', border: '1px solid rgba(245,185,66,0.25)', borderRadius: 9 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.4rem' }}>
              <span style={{ fontSize: 14 }}>⚠</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, color: 'var(--orange)', letterSpacing: '0.06em' }}>SAFETY CHECKLIST</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--text)', fontSize: '0.82rem', lineHeight: 1.8 }}>
              <li><strong style={{ color: 'var(--white)' }}>Never enable "Withdraw Funds"</strong> — ASE never needs it.</li>
              <li>The Private Key is shown <strong style={{ color: 'var(--white)' }}>once</strong>. Lose it → generate a new key.</li>
              <li>You can revoke the key on Kraken at any time. ASE will stop trading immediately.</li>
              <li>Set a reasonable per-strategy capital cap in your agent settings.</li>
            </ul>
          </div>
        </div>

        {/* Paste form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <form onSubmit={submitKeys} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--white)', marginBottom: '0.25rem' }}>Paste your Kraken keys</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--muted)' }}>Both fields are encrypted with AES-256-GCM before being stored.</div>
            </div>

            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--faint)', letterSpacing: '0.08em', marginBottom: '0.35rem' }}>API KEY (PUBLIC)</label>
              <input
                type="text"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="paste your Kraken API Key…"
                disabled={submitting}
                spellCheck={false}
                autoComplete="off"
                style={{ width: '100%', padding: '0.65rem 0.85rem', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--white)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }}
                onFocus={e => e.currentTarget.style.borderColor = 'rgba(79,140,255,0.5)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--faint)', letterSpacing: '0.08em', marginBottom: '0.35rem' }}>PRIVATE KEY (SECRET)</label>
              <textarea
                value={apiSecret}
                onChange={e => setApiSecret(e.target.value)}
                placeholder="paste your Kraken Private Key…"
                disabled={submitting}
                spellCheck={false}
                autoComplete="off"
                rows={3}
                style={{ width: '100%', padding: '0.65rem 0.85rem', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--white)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}
                onFocus={e => e.currentTarget.style.borderColor = 'rgba(79,140,255,0.5)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
              />
            </div>

            {msg && (
              <div style={{ padding: '0.6rem 0.85rem', background: msg.type === 'ok' ? 'rgba(22,199,132,0.08)' : 'rgba(228,88,103,0.08)', border: `1px solid ${msg.type === 'ok' ? 'rgba(22,199,132,0.3)' : 'rgba(228,88,103,0.3)'}`, borderRadius: 8, color: msg.type === 'ok' ? 'var(--mint)' : 'var(--red)', fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}>
                {msg.text}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !apiKey.trim() || !apiSecret.trim()}
              style={{
                padding: '0.85rem',
                background: submitting || !apiKey || !apiSecret
                  ? 'var(--bg3)'
                  : 'linear-gradient(135deg, #3566E9, #4F8CFF)',
                color: '#fff',
                border: 'none',
                borderRadius: 9,
                fontWeight: 700,
                fontSize: '0.92rem',
                cursor: submitting || !apiKey || !apiSecret ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.7 : 1,
                transition: 'all 0.15s',
              }}
            >
              {submitting ? 'Verifying with Kraken…' : status?.connected ? 'Replace Connected Key' : 'Connect Kraken'}
            </button>
          </form>

          {/* What happens after */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 700, color: 'var(--mint)', letterSpacing: '0.1em', marginBottom: '0.6rem' }}>WHAT HAPPENS NEXT</div>
            <ol style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.55rem', color: 'var(--text)', fontSize: '0.82rem', lineHeight: 1.6 }}>
              <li>We test your keys with a read-only Balance call.</li>
              <li>Keys are encrypted and stored against your user account.</li>
              <li>You can subscribe to any agent on the Exchange.</li>
              <li>Each cron tick, that agent's signals execute on your Kraken account.</li>
              <li>Fills are posted to your activity ledger; NAV updates automatically.</li>
            </ol>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .kraken-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
