'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sheet from '../../_components/Sheet'
import { ChevronLeft } from '../../_components/icons'
import { fmtCents, fmtPct, relTime } from '../../_components/format'

type Holding = {
  id: string
  agent_id: string
  agent_name: string
  agent_slug: string | null
  agent_ticker: string | null
  primary_symbol: string | null
  agent_status: string
  shares: number
  invested_cents: number
  current_value_cents: number
  pnl_cents: number
  last_run_at: string | null
  is_idle: boolean
  is_orphaned: boolean
}

export default function HoldingClient({ holdingId }: { holdingId: string }) {
  const router = useRouter()
  const [holding, setHolding] = useState<Holding | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const [sellOpen, setSellOpen] = useState(false)
  const [selling, setSelling] = useState(false)
  const [sellErr, setSellErr] = useState('')
  const [sellDone, setSellDone] = useState<{ pnl_cents: number; returned_cents: number } | null>(null)

  const load = useCallback(async () => {
    setErr('')
    try {
      const res = await fetch('/api/holdings/active', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load holding')
      const d = await res.json()
      const found = (d.holdings as Holding[]).find(h => h.id === holdingId)
      if (!found) throw new Error('Holding not found')
      setHolding(found)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [holdingId])

  useEffect(() => { void load() }, [load])

  async function handleSell() {
    if (!holding) return
    setSelling(true)
    setSellErr('')
    try {
      const res = await fetch('/api/holdings/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holding_id: holding.id }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Sell failed')
      setSellDone({ pnl_cents: d.pnl_cents ?? 0, returned_cents: d.returned_cents ?? 0 })
    } catch (e) {
      setSellErr(e instanceof Error ? e.message : 'Sell failed')
    } finally {
      setSelling(false)
    }
  }

  if (loading) {
    return (
      <div className="m-page m-page-noTab">
        <div className="m-nav">
          <button className="m-nav-back" onClick={() => router.back()}><ChevronLeft /> Back</button>
        </div>
        <div className="m-loading"><div className="m-spin" /></div>
      </div>
    )
  }

  if (err || !holding) {
    return (
      <div className="m-page m-page-noTab">
        <div className="m-nav">
          <button className="m-nav-back" onClick={() => router.back()}><ChevronLeft /> Back</button>
        </div>
        <div className="m-section"><div className="m-error">{err || 'Holding not found'}</div></div>
      </div>
    )
  }

  const pnl = holding.pnl_cents
  const pnlPct = holding.invested_cents > 0 ? (pnl / holding.invested_cents) * 100 : 0
  const positive = pnl >= 0

  return (
    <div className="m-page" style={{ paddingBottom: 'calc(var(--m-safe-bottom) + 90px)' }}>
      <div className="m-nav">
        <button className="m-nav-back" onClick={() => router.back()}><ChevronLeft /> Back</button>
      </div>

      <div style={{ padding: '6px 20px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          {holding.is_orphaned && <span className="m-pill m-pill-muted">Subscription cancelled</span>}
          {holding.is_idle && <span className="m-pill m-pill-amber"><span className="m-dot" />Idle</span>}
          {!holding.is_idle && !holding.is_orphaned && <span className="m-pill m-pill-mint"><span className="m-dot" />Active</span>}
          {holding.primary_symbol && <span className="m-pill m-pill-blue">{holding.primary_symbol}</span>}
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>{holding.agent_name}</div>
        <div style={{ color: 'var(--m-muted)', fontSize: 13, marginTop: 4 }}>
          Last run {relTime(holding.last_run_at)}
        </div>
      </div>

      <div className="m-balance" style={{ paddingTop: 8, paddingBottom: 18 }}>
        <div className="m-balance-label">Position value</div>
        <div className="m-balance-amt">{fmtCents(holding.current_value_cents)}</div>
        <div className={`m-balance-sub ${positive ? 'm-pos' : 'm-neg'}`}>
          {fmtCents(pnl, { sign: true })} ({fmtPct(pnlPct, { sign: true })})
        </div>
      </div>

      <div className="m-section">
        <div className="m-stats">
          <div className="m-stat">
            <div className="m-stat-l">Invested</div>
            <div className="m-stat-v">{fmtCents(holding.invested_cents)}</div>
          </div>
          <div className="m-stat">
            <div className="m-stat-l">Shares</div>
            <div className="m-stat-v">{holding.shares.toFixed(4)}</div>
          </div>
        </div>
      </div>

      {holding.agent_slug && (
        <div className="m-section">
          <Link href={`/m/agent/${holding.agent_slug}`} className="m-list">
            <div className="m-list-row">
              <div className="m-list-row-main">
                <div className="m-list-row-title">View agent</div>
                <div className="m-list-row-sub">Stats, strategy, performance</div>
              </div>
              <span className="m-list-row-chev">›</span>
            </div>
          </Link>
        </div>
      )}

      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0,
        padding: 'calc(12px + var(--m-safe-bottom)) 20px 16px',
        background: 'linear-gradient(0deg, var(--m-bg) 70%, transparent)',
        zIndex: 10,
        display: 'flex', gap: 10,
      }}>
        {holding.agent_slug && (
          <Link href={`/m/agent/${holding.agent_slug}`} className="m-btn m-btn-ghost" style={{ flex: 1 }}>
            Add more
          </Link>
        )}
        <button className="m-btn m-btn-danger" style={{ flex: 1 }} onClick={() => { setSellErr(''); setSellDone(null); setSellOpen(true) }}>
          Withdraw
        </button>
      </div>

      <Sheet
        open={sellOpen}
        onClose={() => { setSellOpen(false); if (sellDone) router.push('/m/portfolio') }}
        title={sellDone ? 'Withdrawal complete' : 'Withdraw all funds?'}
      >
        {sellDone ? (
          <div>
            <div className="m-empty" style={{ padding: '8px 0 16px' }}>
              <div className="m-empty-emoji">💸</div>
              <div className="m-empty-title">{fmtCents(sellDone.returned_cents)} returned to cash</div>
              <div className="m-empty-sub">{sellDone.pnl_cents >= 0 ? 'Profit' : 'Loss'}: {fmtCents(sellDone.pnl_cents, { sign: true })}</div>
            </div>
            <button className="m-btn m-btn-primary" onClick={() => { setSellOpen(false); router.push('/m/portfolio') }}>
              Back to portfolio
            </button>
          </div>
        ) : (
          <div>
            <div style={{ color: 'var(--m-text-2)', fontSize: 15, marginBottom: 16, lineHeight: 1.45 }}>
              Sell <strong>{holding.shares.toFixed(4)}</strong> shares of {holding.agent_name} at the current bid.
              You&apos;ll receive about <strong>{fmtCents(holding.current_value_cents)}</strong> back into your cash balance.
            </div>
            {sellErr && <div className="m-error" style={{ marginBottom: 12 }}>{sellErr}</div>}
            <button className="m-btn m-btn-danger" onClick={handleSell} disabled={selling}>
              {selling ? <span className="m-spin" /> : 'Confirm withdrawal'}
            </button>
            <button className="m-btn m-btn-ghost" onClick={() => setSellOpen(false)} style={{ marginTop: 8 }}>
              Cancel
            </button>
          </div>
        )}
      </Sheet>
    </div>
  )
}
