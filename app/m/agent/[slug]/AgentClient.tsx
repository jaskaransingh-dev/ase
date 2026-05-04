'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sheet from '../../_components/Sheet'
import { ChevronLeft } from '../../_components/icons'
import { fmtCents, fmtPct } from '../../_components/format'

type Stats = {
  nav_cents?: number
  total_return_pct?: number
  sharpe_ratio?: number
  max_drawdown_pct?: number
  win_rate_pct?: number
  total_trades?: number
}

type Agent = {
  id: string
  name: string
  slug: string
  ticker?: string
  description?: string | null
  strategy_type?: string
  primary_symbol?: string | null
  status: string
  share_price_cents?: number | null
  subscriber_count?: number | null
  total_aum_cents?: number | null
  agent_stats?: Stats | Stats[] | null
}

const QUICK_AMOUNTS = [10, 25, 50, 100]

function pickStats(s: Agent['agent_stats']): Stats | null {
  if (!s) return null
  if (Array.isArray(s)) return s[0] ?? null
  return s
}

export default function AgentClient({ slug }: { slug: string }) {
  const router = useRouter()
  const [agent, setAgent] = useState<Agent | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const [investOpen, setInvestOpen] = useState(false)
  const [amountStr, setAmountStr] = useState('25')
  const [investing, setInvesting] = useState(false)
  const [investErr, setInvestErr] = useState('')
  const [investDone, setInvestDone] = useState<{ shares: number; ask: number } | null>(null)

  const [balanceCents, setBalanceCents] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(slug)}?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Failed to load agent')
      }
      const d = await res.json()
      setAgent(d.agent)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => { void load() }, [load])

  const fetchBalance = useCallback(async () => {
    try {
      const res = await fetch('/api/account/balance', { cache: 'no-store' })
      if (!res.ok) return
      const d = await res.json()
      setBalanceCents(d.cash_cents ?? 0)
    } catch {}
  }, [])

  function openInvest() {
    setInvestErr('')
    setInvestDone(null)
    setInvestOpen(true)
    void fetchBalance()
  }

  async function handleInvest() {
    if (!agent) return
    const dollars = parseFloat(amountStr || '0')
    if (!Number.isFinite(dollars) || dollars < 10) {
      setInvestErr('Minimum investment is $10')
      return
    }
    const amount_cents = Math.round(dollars * 100)
    setInvesting(true)
    setInvestErr('')
    try {
      const res = await fetch('/api/holdings/invest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agent.id, amount_cents }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Investment failed')
      setInvestDone({ shares: d.shares, ask: d.ask_cents ?? d.entry_price_cents ?? 0 })
    } catch (e) {
      setInvestErr(e instanceof Error ? e.message : 'Investment failed')
    } finally {
      setInvesting(false)
    }
  }

  function closeAndReturn() {
    setInvestOpen(false)
    if (investDone) router.push('/m/portfolio')
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

  if (err || !agent) {
    return (
      <div className="m-page m-page-noTab">
        <div className="m-nav">
          <button className="m-nav-back" onClick={() => router.back()}><ChevronLeft /> Back</button>
        </div>
        <div className="m-section">
          <div className="m-error">{err || 'Agent not found'}</div>
        </div>
      </div>
    )
  }

  const stats = pickStats(agent.agent_stats)
  const ret = stats?.total_return_pct ?? null
  const navCents = stats?.nav_cents ?? agent.share_price_cents ?? 10000
  const subscribers = agent.subscriber_count ?? 0

  return (
    <div className="m-page" style={{ paddingBottom: 'calc(var(--m-safe-bottom) + 90px)' }}>
      <div className="m-nav">
        <button className="m-nav-back" onClick={() => router.back()}><ChevronLeft /> Back</button>
      </div>

      <div style={{ padding: '6px 20px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span className={`m-pill ${agent.status === 'active' ? 'm-pill-mint' : 'm-pill-muted'}`}>
            <span className="m-dot" />
            {agent.status === 'active' ? 'Live' : agent.status}
          </span>
          {agent.primary_symbol && (
            <span className="m-pill m-pill-blue">{agent.primary_symbol}</span>
          )}
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.6 }}>{agent.name}</div>
        {agent.description && (
          <div style={{ color: 'var(--m-text-2)', fontSize: 15, marginTop: 6, lineHeight: 1.45 }}>
            {agent.description}
          </div>
        )}
      </div>

      <div className="m-section">
        <div className="m-stats">
          <div className="m-stat">
            <div className="m-stat-l">30d return</div>
            <div className={`m-stat-v ${ret != null && ret >= 0 ? 'm-pos' : ret != null && ret < 0 ? 'm-neg' : ''}`}>
              {ret != null ? fmtPct(ret, { sign: true }) : '—'}
            </div>
          </div>
          <div className="m-stat">
            <div className="m-stat-l">Sharpe</div>
            <div className="m-stat-v">{stats?.sharpe_ratio != null ? stats.sharpe_ratio.toFixed(2) : '—'}</div>
          </div>
          <div className="m-stat">
            <div className="m-stat-l">Max drawdown</div>
            <div className="m-stat-v">{stats?.max_drawdown_pct != null ? `${stats.max_drawdown_pct.toFixed(1)}%` : '—'}</div>
          </div>
          <div className="m-stat">
            <div className="m-stat-l">Win rate</div>
            <div className="m-stat-v">{stats?.win_rate_pct != null ? `${stats.win_rate_pct.toFixed(0)}%` : '—'}</div>
          </div>
        </div>
      </div>

      <div className="m-section">
        <div className="m-card">
          <div className="m-card-row">
            <div>
              <div style={{ color: 'var(--m-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.04, fontWeight: 700 }}>Share price</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{fmtCents(navCents)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: 'var(--m-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.04, fontWeight: 700 }}>Investors</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{subscribers}</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{
        position: 'fixed', left: 0, right: 0,
        bottom: 0,
        padding: 'calc(12px + var(--m-safe-bottom)) 20px 16px',
        background: 'linear-gradient(0deg, var(--m-bg) 70%, transparent)',
        zIndex: 10,
      }}>
        <button className="m-btn m-btn-primary" onClick={openInvest} disabled={agent.status !== 'active'}>
          {agent.status === 'active' ? 'Invest' : 'Not available'}
        </button>
      </div>

      <Sheet open={investOpen} onClose={closeAndReturn} title={investDone ? 'Investment placed' : `Invest in ${agent.name}`}>
        {investDone ? (
          <div>
            <div className="m-empty" style={{ padding: '16px 0 8px' }}>
              <div className="m-empty-emoji">✅</div>
              <div className="m-empty-title">You bought {investDone.shares.toFixed(4)} shares</div>
              <div className="m-empty-sub">at {fmtCents(investDone.ask)} per share</div>
            </div>
            <button className="m-btn m-btn-primary" onClick={() => { setInvestOpen(false); router.push('/m/portfolio') }}>
              View portfolio
            </button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 32, fontWeight: 800 }}>$</span>
              <input
                className="m-input"
                inputMode="decimal"
                pattern="[0-9]*\.?[0-9]*"
                value={amountStr}
                onChange={e => setAmountStr(e.target.value.replace(/[^0-9.]/g, ''))}
                style={{ fontSize: 32, fontWeight: 800, padding: '8px 12px', textAlign: 'left' }}
                aria-label="Investment amount"
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {QUICK_AMOUNTS.map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmountStr(String(v))}
                  className="m-btn m-btn-ghost m-btn-sm"
                  style={{ flex: 1 }}
                >
                  ${v}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 13, color: 'var(--m-muted)', marginBottom: 14 }}>
              {balanceCents != null
                ? <>Available cash: <strong style={{ color: 'var(--m-text)' }}>{fmtCents(balanceCents)}</strong></>
                : 'Checking balance…'}
              <br />Minimum $10. Withdraw anytime from your portfolio.
            </div>
            {investErr && <div className="m-error" style={{ marginBottom: 12 }}>{investErr}</div>}
            <button
              className="m-btn m-btn-primary"
              onClick={handleInvest}
              disabled={investing || !amountStr || parseFloat(amountStr) < 10}
            >
              {investing ? <span className="m-spin" /> : `Confirm $${amountStr || '0'} investment`}
            </button>
          </div>
        )}
      </Sheet>
    </div>
  )
}
