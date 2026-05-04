'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import TabBar from '../_components/TabBar'
import { ChevronRight } from '../_components/icons'
import { fmtCents, fmtPct } from '../_components/format'

type Balance = {
  cash_cents?: number
  invested_cents?: number
  equity_cents?: number
  available_cents?: number
  status?: string
}

type Holding = {
  id: string
  agent_id: string
  agent_name: string
  agent_slug: string | null
  invested_cents: number
  current_value_cents: number
  pnl_cents: number
  is_orphaned?: boolean
  is_idle?: boolean
}

export default function PortfolioClient({ userEmail }: { userEmail: string }) {
  const [balance, setBalance] = useState<Balance | null>(null)
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setErr('')
    try {
      const [bRes, hRes] = await Promise.all([
        fetch('/api/account/balance', { cache: 'no-store' }),
        fetch('/api/holdings/active', { cache: 'no-store' }),
      ])
      if (bRes.ok) setBalance(await bRes.json())
      if (hRes.ok) {
        const d = await hRes.json()
        setHoldings(d.holdings ?? [])
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const id = setInterval(() => void load(), 30_000)
    return () => clearInterval(id)
  }, [load])

  const totalInvested = holdings.reduce((s, h) => s + (h.invested_cents || 0), 0)
  const totalValue = holdings.reduce((s, h) => s + (h.current_value_cents || 0), 0)
  const totalPnL = totalValue - totalInvested
  const pnlPct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0
  const cash = balance?.cash_cents ?? 0
  const equity = totalValue + cash

  return (
    <div className="m-page">
      <div className="m-nav">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--m-muted)', fontSize: 13 }}>{userEmail}</span>
          <Link href="/m/discover" className="m-btn m-btn-ghost m-btn-sm">+ Invest</Link>
        </div>
      </div>

      <div className="m-balance">
        <div className="m-balance-label">Portfolio value</div>
        <div className="m-balance-amt">{fmtCents(equity)}</div>
        <div className={`m-balance-sub ${totalPnL >= 0 ? 'm-pos' : 'm-neg'}`}>
          {fmtCents(totalPnL, { sign: true })} ({fmtPct(pnlPct, { sign: true })})
        </div>
      </div>

      <div className="m-section">
        <div className="m-stats">
          <div className="m-stat">
            <div className="m-stat-l">Available cash</div>
            <div className="m-stat-v">{fmtCents(cash)}</div>
            <div className="m-stat-s">{balance?.status === 'connected' ? 'Kraken connected' : 'Not connected'}</div>
          </div>
          <div className="m-stat">
            <div className="m-stat-l">Invested</div>
            <div className="m-stat-v">{fmtCents(totalInvested)}</div>
            <div className="m-stat-s">{holdings.length} agent{holdings.length === 1 ? '' : 's'}</div>
          </div>
        </div>
      </div>

      <div className="m-section">
        <div className="m-section-h">Your agents</div>
        {loading ? (
          <div className="m-loading"><div className="m-spin" /></div>
        ) : holdings.length === 0 ? (
          <div className="m-card m-empty" style={{ background: 'var(--m-card)', borderRadius: 'var(--m-radius)' }}>
            <div className="m-empty-emoji">📈</div>
            <div className="m-empty-title">No active investments</div>
            <div className="m-empty-sub">Browse agents and invest from $10.</div>
            <Link href="/m/discover" className="m-btn m-btn-primary" style={{ marginTop: 16 }}>Browse agents</Link>
          </div>
        ) : (
          <div className="m-list">
            {holdings.map(h => {
              const pnl = h.pnl_cents || 0
              const pct = h.invested_cents > 0 ? (pnl / h.invested_cents) * 100 : 0
              return (
                <Link key={h.id} href={`/m/holding/${h.id}`} className="m-list-row">
                  <div className="m-list-row-main">
                    <div className="m-list-row-title">{h.agent_name}</div>
                    <div className="m-list-row-sub">
                      {fmtCents(h.invested_cents)} invested
                      {h.is_idle && <span className="m-pill m-pill-amber" style={{ marginLeft: 8 }}>Idle</span>}
                      {h.is_orphaned && <span className="m-pill m-pill-muted" style={{ marginLeft: 8 }}>Orphaned</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtCents(h.current_value_cents)}</div>
                    <div className={pnl >= 0 ? 'm-pos' : 'm-neg'} style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtCents(pnl, { sign: true })} ({fmtPct(pct, { sign: true })})
                    </div>
                  </div>
                  <ChevronRight className="m-list-row-chev" />
                </Link>
              )
            })}
          </div>
        )}
        {err && <div className="m-error" style={{ marginTop: 12 }}>{err}</div>}
      </div>

      <TabBar />
    </div>
  )
}
