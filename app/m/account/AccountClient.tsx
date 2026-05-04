'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import TabBar from '../_components/TabBar'
import Sheet from '../_components/Sheet'
import { ChevronRight } from '../_components/icons'
import { fmtCents } from '../_components/format'
import { createClient } from '@/lib/supabase/client'

type KrakenStatus = { connected?: boolean; balance_usd?: number; updated_at?: string }
type Balance = { cash_cents?: number; status?: string; balance_source?: string }

export default function AccountClient({ userEmail }: { userEmail: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [krakenStatus, setKrakenStatus] = useState<KrakenStatus | null>(null)
  const [balance, setBalance] = useState<Balance | null>(null)
  const [loading, setLoading] = useState(true)

  const [connectOpen, setConnectOpen] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const [kr, br] = await Promise.all([
        fetch('/api/auth/kraken/keys').then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/account/balance', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
      ])
      setKrakenStatus(kr)
      setBalance(br)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function handleConnect(e: React.FormEvent) {
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
        setMsg({ ok: false, text: d.error || 'Failed to verify keys.' })
      } else {
        setMsg({ ok: true, text: `Connected. Balance $${(d.balance_usd ?? 0).toFixed(2)}.` })
        setApiKey(''); setApiSecret('')
        await load()
        setTimeout(() => setConnectOpen(false), 1200)
      }
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Network error.' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.replace('/m/login')
  }

  const krakenConnected = !!krakenStatus?.connected

  return (
    <div className="m-page">
      <div className="m-title">Account</div>
      <div className="m-subtitle">{userEmail}</div>

      <div className="m-section">
        <div className="m-card">
          <div className="m-card-row">
            <div>
              <div style={{ color: 'var(--m-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.04, fontWeight: 700 }}>Cash balance</div>
              <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                {loading ? '—' : fmtCents(balance?.cash_cents ?? 0)}
              </div>
              <div style={{ color: 'var(--m-muted)', fontSize: 12, marginTop: 4 }}>
                {balance?.status === 'connected' ? `Live · ${balance.balance_source ?? 'kraken'}` : 'Not connected'}
              </div>
            </div>
            <button className="m-btn m-btn-primary m-btn-sm" onClick={() => setConnectOpen(true)}>
              {krakenConnected ? 'Update' : 'Connect'}
            </button>
          </div>
        </div>
      </div>

      <div className="m-section">
        <div className="m-section-h">Funding</div>
        <div className="m-list">
          <div className="m-list-row" style={{ display: 'block' }}>
            <div className="m-list-row-title">How to add funds</div>
            <div className="m-list-row-sub" style={{ marginTop: 6, lineHeight: 1.5 }}>
              ASE invests directly with your own Kraken account. To add cash:
              <ol style={{ paddingLeft: 18, marginTop: 8, color: 'var(--m-text-2)' }}>
                <li>Open the Kraken app or kraken.com.</li>
                <li>Deposit USD via ACH, wire, or stablecoin.</li>
                <li>Return here — your cash balance updates within ~1 minute.</li>
              </ol>
            </div>
          </div>
          <a href="https://www.kraken.com/sign-in" target="_blank" rel="noopener noreferrer" className="m-list-row">
            <div className="m-list-row-main">
              <div className="m-list-row-title">Open Kraken</div>
              <div className="m-list-row-sub">Sign in to deposit funds</div>
            </div>
            <ChevronRight className="m-list-row-chev" />
          </a>
        </div>
      </div>

      <div className="m-section">
        <div className="m-section-h">Account</div>
        <div className="m-list">
          <Link href="/m/portfolio" className="m-list-row">
            <div className="m-list-row-main">
              <div className="m-list-row-title">Portfolio</div>
              <div className="m-list-row-sub">View all holdings</div>
            </div>
            <ChevronRight className="m-list-row-chev" />
          </Link>
          <Link href="/m/discover" className="m-list-row">
            <div className="m-list-row-main">
              <div className="m-list-row-title">Browse agents</div>
              <div className="m-list-row-sub">Discover new strategies</div>
            </div>
            <ChevronRight className="m-list-row-chev" />
          </Link>
        </div>
      </div>

      <div className="m-section">
        <button className="m-btn m-btn-ghost" onClick={handleSignOut}>Sign out</button>
      </div>

      <div style={{ textAlign: 'center', color: 'var(--m-faint)', fontSize: 11, padding: '16px 24px 8px' }}>
        ASE Mobile · iOS
      </div>

      <TabBar />

      <Sheet
        open={connectOpen}
        onClose={() => { setConnectOpen(false); setMsg(null) }}
        title={krakenConnected ? 'Update Kraken keys' : 'Connect Kraken'}
      >
        <form onSubmit={handleConnect} style={{ display: 'grid', gap: 12 }}>
          <div style={{ color: 'var(--m-text-2)', fontSize: 14, lineHeight: 1.45 }}>
            Generate read &amp; trade-permission API keys at{' '}
            <a href="https://www.kraken.com/u/security/api" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--m-blue)' }}>
              kraken.com/u/security/api
            </a>. ASE never sees your password.
          </div>
          <div>
            <div className="m-label">API key</div>
            <input
              className="m-input"
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              required
            />
          </div>
          <div>
            <div className="m-label">API secret</div>
            <input
              className="m-input"
              type="password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={apiSecret}
              onChange={e => setApiSecret(e.target.value)}
              required
            />
          </div>
          {msg && (
            <div className={msg.ok ? '' : 'm-error'} style={msg.ok ? { background: 'rgba(22,199,132,0.12)', border: '1px solid rgba(22,199,132,0.3)', color: 'var(--m-mint)', padding: '12px 14px', borderRadius: 12, fontSize: 14 } : undefined}>
              {msg.text}
            </div>
          )}
          <button type="submit" className="m-btn m-btn-primary" disabled={submitting || !apiKey || !apiSecret}>
            {submitting ? <span className="m-spin" /> : krakenConnected ? 'Replace key' : 'Connect Kraken'}
          </button>
        </form>
      </Sheet>
    </div>
  )
}
