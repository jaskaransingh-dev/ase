'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { fmtUSD, fmtPct, fmtDate, fmtDateTime } from '@/lib/utils'
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Agent {
  id: string
  slug: string
  name: string
  description: string | null
  strategy_type: string
  status: string
  total_aum_cents: number
  signal_summary: string | null
  last_run_at: string | null
}

interface AgentStats {
  id: string
  nav_cents: number
  bid_cents?: number
  ask_cents?: number
  total_return_pct: number
  sharpe_ratio: number
  max_drawdown_pct: number
  win_rate_pct: number
  total_trades: number
  daily_return_pct: number
  snapshot_at: string
}

interface AgentTrade {
  id: string
  symbol: string
  side: 'buy' | 'sell'
  qty: number
  fill_price: number
  filled_at: string | null
  pnl_cents: number | null
  exit_reason: string | null
}

interface Holding {
  id: string
  shares: number
  entry_nav_cents: number
  invested_cents: number
  current_value_cents: number | null
  created_at: string
}

interface Props {
  agent: Agent
  statsHistory: AgentStats[]
  trades: AgentTrade[]
  userHolding: Holding | null
  walletBalance: number
  userName: string
}

// ─── Analytics helpers ────────────────────────────────────────────────────────

function calcVolatility(history: AgentStats[]) {
  if (history.length <= 1) return 0
  const returns = history.slice(1).map((s, i) =>
    (s.nav_cents - history[i].nav_cents) / Math.max(1, history[i].nav_cents)
  )
  const variance = returns.reduce((s, r) => s + r * r, 0) / Math.max(1, returns.length)
  return Math.sqrt(variance) * Math.sqrt(365) * 100
}

function calcSortino(history: AgentStats[]) {
  if (history.length <= 1) return 0
  const returns = history.slice(1).map((s, i) =>
    (s.nav_cents - history[i].nav_cents) / Math.max(1, history[i].nav_cents)
  )
  const mean = returns.reduce((s, r) => s + r, 0) / Math.max(1, returns.length)
  const neg = returns.filter(r => r < 0)
  const downDev = Math.sqrt(neg.reduce((s, r) => s + r * r, 0) / Math.max(1, neg.length))
  return downDev > 0 ? (mean / downDev) * Math.sqrt(365) : 0
}

function calcCalmar(history: AgentStats[]) {
  if (history.length === 0) return 0
  const first = history[0].nav_cents
  const last = history[history.length - 1].nav_cents
  const annRet = ((last - first) / Math.max(1, first)) * 100
  const maxDD = Math.abs(Math.min(...history.map(s => s.max_drawdown_pct)))
  return maxDD > 0 ? annRet / maxDD : 0
}

function calcProfitFactor(trades: AgentTrade[]) {
  const wins = trades.filter(t => (t.pnl_cents ?? 0) > 0).reduce((s, t) => s + (t.pnl_cents ?? 0), 0)
  const losses = Math.abs(trades.filter(t => (t.pnl_cents ?? 0) < 0).reduce((s, t) => s + (t.pnl_cents ?? 0), 0))
  return losses > 0 ? wins / losses : wins > 0 ? 99 : 0
}

function calcAvgHoldHours(trades: AgentTrade[]) {
  const buys = trades.filter(t => t.side === 'buy' && t.filled_at)
  const sells = trades.filter(t => t.side === 'sell' && t.filled_at)
  if (!buys.length || !sells.length) return 0
  let total = 0, count = 0
  for (const b of buys) {
    const match = sells.find(s => new Date(s.filled_at!).getTime() > new Date(b.filled_at!).getTime())
    if (match) { total += (new Date(match.filled_at!).getTime() - new Date(b.filled_at!).getTime()); count++ }
  }
  return count > 0 ? Math.floor(total / count / 3_600_000) : 0
}

function calcStreaks(trades: AgentTrade[]) {
  const closed = [...trades].filter(t => t.pnl_cents !== null)
    .sort((a, b) => new Date(a.filled_at!).getTime() - new Date(b.filled_at!).getTime())
  let maxW = 0, maxL = 0, curW = 0, curL = 0
  for (const t of closed) {
    if ((t.pnl_cents ?? 0) > 0) { curW++; curL = 0; maxW = Math.max(maxW, curW) }
    else if ((t.pnl_cents ?? 0) < 0) { curL++; curW = 0; maxL = Math.max(maxL, curL) }
  }
  return { wins: maxW, losses: maxL }
}

function formatTooltipValue(value: unknown, suffix = ''): string {
  if (typeof value === 'number') return `${value.toFixed(2)}${suffix}`
  if (Array.isArray(value)) return value.map(item => formatTooltipValue(item, suffix)).join(', ')
  return String(value ?? '')
}

const STRATEGY_LABELS: Record<string, string> = {
  momentum: 'Momentum',
  mean_reversion: 'Mean Reversion',
  trend_following: 'Trend Following',
  crypto_momentum: 'Crypto Momentum',
  crypto_mean_reversion: 'Crypto Mean Reversion',
  btc_momentum: 'BTC Momentum',
  eth_mean_reversion: 'ETH Mean Reversion',
  sol_breakout: 'SOL Breakout',
  defi_basket: 'DeFi Basket',
}

const TABS = ['Overview', 'Performance', 'Risk', 'Trades'] as const
type Tab = typeof TABS[number]

// ─── Signal parser ────────────────────────────────────────────────────────────

function parseSignal(signal: string | null): {
  badge: { label: string; color: string; bg: string }
  waitFor: string | null
  detail: string
} {
  if (!signal) return {
    badge: { label: '● SCANNING', color: '#888', bg: 'rgba(136,136,136,.1)' },
    waitFor: null,
    detail: 'Waiting for signal data…'
  }
  const s = signal.toUpperCase()
  let badge = { label: '● SCANNING', color: '#aaa', bg: 'rgba(170,170,170,.1)' }

  if (s.startsWith('BUY')) badge = { label: '▲ BUYING', color: '#0EAD6E', bg: 'rgba(14,173,110,.14)' }
  else if (s.startsWith('SELL')) badge = { label: '▼ SELLING', color: '#E84040', bg: 'rgba(232,64,64,.14)' }
  else if (s.startsWith('HOLD')) badge = { label: '◆ HOLDING', color: '#E8AC20', bg: 'rgba(74,144,226,.14)' }
  else if (s.startsWith('SCAN')) badge = { label: '● SCANNING', color: '#E8AC20', bg: 'rgba(232,172,32,.14)' }
  else if (s.startsWith('TREND') || s.startsWith('BREAKOUT')) badge = { label: '▲ TRADING', color: '#0EAD6E', bg: 'rgba(14,173,110,.14)' }

  const waitMatch = signal.match(/Waiting[:\s]+(.+?)(?:\s*·|$)/i)
  const waitFor = waitMatch ? waitMatch[1].trim() : null
  return { badge, waitFor, detail: signal }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExchangeClient({
  agent, statsHistory, trades, userHolding, walletBalance,
}: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('Overview')
  const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState(100)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)
  const prevNavRef = useRef<number | null>(null)

  // Auto-refresh every 30s to get updated NAV
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 30_000)
    return () => clearInterval(id)
  }, [router])

  // Flash animation when NAV changes
  const latest = statsHistory.length > 0 ? statsHistory[statsHistory.length - 1] : null
  const nav = latest?.nav_cents ?? 10_000

  useEffect(() => {
    const prev = prevNavRef.current
    if (prev !== null && prev !== nav) {
      setFlash(nav > prev ? 'up' : 'down')
      const t = setTimeout(() => setFlash(null), 1200)
      return () => clearTimeout(t)
    }
    prevNavRef.current = nav
  }, [nav])

  // ── Core metrics ──────────────────────────────────────────────────────────
  const totalReturn = latest?.total_return_pct ?? 0
  const sharpe = latest?.sharpe_ratio ?? 0
  const maxDD = Math.abs(latest?.max_drawdown_pct ?? 0)
  const winRate = latest?.win_rate_pct ?? 0
  const totalTrades = latest?.total_trades ?? 0

  // User position
  const positionValue = userHolding ? (userHolding.current_value_cents ?? userHolding.invested_cents) : 0
  const positionPnL = positionValue - (userHolding?.invested_cents ?? 0)
  const positionPct = userHolding && userHolding.invested_cents > 0
    ? (positionPnL / userHolding.invested_cents) * 100 : 0

  // Chart
  const chartData = statsHistory.map(s => ({
    date: fmtDate(s.snapshot_at),
    nav: parseFloat((s.nav_cents / 100).toFixed(2)),
    ret: parseFloat(s.total_return_pct.toFixed(2)),
    dd: parseFloat(Math.min(s.max_drawdown_pct, 0).toFixed(2)),
  }))

  // Advanced metrics (computed once)
  const volatility = calcVolatility(statsHistory)
  const sortino = calcSortino(statsHistory)
  const calmar = calcCalmar(statsHistory)
  const profitFactor = calcProfitFactor(trades)
  const avgHoldHours = calcAvgHoldHours(trades)
  const streaks = calcStreaks(trades)
  const realizedPnL = trades.filter(t => t.pnl_cents !== null).reduce((s, t) => s + (t.pnl_cents ?? 0), 0)
  const avgTradePnL = trades.filter(t => t.pnl_cents !== null).length > 0
    ? realizedPnL / trades.filter(t => t.pnl_cents !== null).length : 0
  const winCount = trades.filter(t => (t.pnl_cents ?? 0) > 0).length
  const lossCount = trades.filter(t => (t.pnl_cents ?? 0) < 0).length
  const openTrades = trades.filter(t => t.side === 'buy' && t.pnl_cents === null)
  const sortedTrades = [...trades].sort((a, b) =>
    new Date(b.filled_at ?? 0).getTime() - new Date(a.filled_at ?? 0).getTime()
  )

  const amountCents = Math.round(amount * 100)
  const bidCents = latest?.bid_cents ?? Math.round(nav * 0.9985)
  const askCents = latest?.ask_cents ?? Math.round(nav * 1.0015)
  const sharesToGet = amountCents / askCents

  // ── Trade handlers ────────────────────────────────────────────────────────
  async function handleInvest() {
    if (amountCents > walletBalance) { setError('Insufficient credits'); return }
    if (amountCents < 1000) { setError('Minimum investment is $10'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/holdings/invest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agent.id, amount_cents: amountCents }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Investment failed')
      setSuccess(true)
      setTimeout(() => { window.location.href = '/dashboard' }, 2000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Investment failed')
    }
    setLoading(false)
  }

  async function handleSell() {
    if (!userHolding) { setError('No holding to sell'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/holdings/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holding_id: userHolding.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sale failed')
      setSuccess(true)
      setTimeout(() => { window.location.href = '/dashboard' }, 2000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sale failed')
    }
    setLoading(false)
  }

  // ── Shared styles ─────────────────────────────────────────────────────────
  const card = {
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '1.25rem',
  } as const

  const mono = { fontFamily: 'var(--font-mono)' } as const

  function Metric({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
    return (
      <div style={{ ...card }}>
        <div style={{ ...mono, fontSize: '.6rem', letterSpacing: '.1em', color: 'var(--faint)', marginBottom: '.5rem' }}>
          {label}
        </div>
        <div style={{ ...mono, fontSize: '1.1rem', fontWeight: 800, color: color ?? 'var(--white)', marginBottom: sub ? '.2rem' : 0 }}>
          {value}
        </div>
        {sub && <div style={{ ...mono, fontSize: '.7rem', color: 'var(--faint)' }}>{sub}</div>}
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '2rem 2.5rem', maxWidth: '1460px', margin: '0 auto' }}>

      {/* ── Back link ── */}
      <Link href="/dashboard/exchange" style={{
        ...mono, fontSize: '.8rem', color: 'var(--muted)', textDecoration: 'none',
        marginBottom: '1.25rem', display: 'inline-block',
      }}>
        ← Exchange
      </Link>

      {/* ── Header row ── */}
      {(() => {
        const sig = parseSignal(agent.signal_summary)
        return (
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '2rem', fontWeight: 900, marginBottom: '.4rem' }}>
            {agent.name}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
            <span className="pill pill-gold" style={{ fontSize: '.65rem' }}>VERIFIED</span>
            <span className="tag" style={{ fontSize: '.7rem' }}>
              {STRATEGY_LABELS[agent.strategy_type] ?? agent.strategy_type}
            </span>
            <span style={{
              ...mono, fontSize: '.65rem', fontWeight: 700,
              color: agent.status === 'active' ? 'var(--green)' : 'var(--muted)',
            }}>
              ● {agent.status.toUpperCase()}
            </span>
            {/* Live status badge */}
            <span style={{
              ...mono, fontSize: '.7rem', fontWeight: 800,
              padding: '.2rem .65rem', borderRadius: 20,
              color: sig.badge.color, background: sig.badge.bg,
              border: `1px solid ${sig.badge.color}44`,
            }}>
              {sig.badge.label}
            </span>
            {/* Live pulse */}
            <span className="live-pulse" style={{ display: 'flex', alignItems: 'center', gap: '.3rem', ...mono, fontSize: '.65rem', color: 'var(--green)' }}>
              <span className="pulse-dot" />LIVE
            </span>
          </div>
        </div>
        {userHolding && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ ...mono, fontSize: '.7rem', color: 'var(--faint)', marginBottom: '.3rem' }}>YOUR POSITION</div>
            <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.6rem', fontWeight: 900 }}>{fmtUSD(positionValue)}</div>
            <div style={{ ...mono, fontSize: '.75rem', fontWeight: 700, color: positionPnL >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {positionPnL >= 0 ? '+' : ''}{fmtUSD(positionPnL)} ({positionPct >= 0 ? '+' : ''}{positionPct.toFixed(2)}%)
            </div>
          </div>
        )}
      </div>
        )
      })()}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '.7rem', marginBottom: '1rem' }} className="agent-exchange-top-strip">
        {[
          { label: 'Sharpe', value: sharpe.toFixed(2), color: sharpe >= 1 ? 'var(--green)' : '#8CA0C4' },
          { label: 'Win Rate', value: `${winRate.toFixed(0)}%`, color: winRate >= 50 ? 'var(--green)' : 'var(--red)' },
          { label: 'Spread', value: '0.30%', color: '#8BE9FF' },
          { label: 'Open Trades', value: String(openTrades.length), color: 'var(--white)' },
        ].map((item) => (
          <div key={item.label} style={{ borderRadius: 12, border: '1px solid rgba(148,163,184,.24)', background: 'rgba(9,14,28,.72)', padding: '.7rem .8rem' }}>
            <div style={{ ...mono, fontSize: '.58rem', color: '#8CA0C4', letterSpacing: '.08em', marginBottom: '.2rem' }}>{item.label.toUpperCase()}</div>
            <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, color: item.color }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* ── Main 2-col grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '1.5rem', alignItems: 'start' }}>

        {/* LEFT */}
        <div>

          {/* ── Price + chart card ── */}
          <div style={{ ...card, padding: '1.75rem', marginBottom: '1.25rem',
            boxShadow: flash === 'up' ? '0 0 0 2px rgba(14,173,110,.5), 0 0 24px rgba(14,173,110,.2)' :
                       flash === 'down' ? '0 0 0 2px rgba(232,64,64,.5), 0 0 24px rgba(232,64,64,.2)' :
                       'none',
            transition: 'box-shadow .4s ease',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div style={{ ...mono, fontSize: '.65rem', letterSpacing: '.1em', color: 'var(--faint)', marginBottom: '.4rem' }}>
                  CURRENT NAV
                  <span style={{ marginLeft: '.6rem', color: 'var(--green)', fontSize: '.6rem' }} className="pulse-text">● LIVE</span>
                </div>
                <div className={flash ? `price-flash-${flash}` : ''} style={{
                  fontFamily: 'var(--font-head)', fontSize: '2.6rem', fontWeight: 900, marginBottom: '.3rem',
                  color: flash === 'up' ? 'var(--green)' : flash === 'down' ? 'var(--red)' : 'var(--white)',
                  transition: 'color .4s ease',
                }}>
                  {fmtUSD(nav)}
                </div>
                <div style={{ ...mono, fontSize: '.8rem', fontWeight: 700, color: totalReturn >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {totalReturn >= 0 ? '+' : ''}{fmtPct(totalReturn)} all-time
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1.5rem' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ ...mono, fontSize: '.6rem', color: 'var(--faint)', marginBottom: '.3rem' }}>BID</div>
                  <div style={{ ...mono, fontSize: '.9rem', fontWeight: 700, color: 'var(--red)' }}>{fmtUSD(bidCents)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ ...mono, fontSize: '.6rem', color: 'var(--faint)', marginBottom: '.3rem' }}>ASK</div>
                  <div style={{ ...mono, fontSize: '.9rem', fontWeight: 700, color: 'var(--green)' }}>{fmtUSD(askCents)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ ...mono, fontSize: '.6rem', color: 'var(--faint)', marginBottom: '.3rem' }}>SPREAD</div>
                  <div style={{ ...mono, fontSize: '.9rem', fontWeight: 700 }}>0.30%</div>
                </div>
              </div>
            </div>

            {chartData.length > 1 ? (
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="navGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#E8AC20" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#E8AC20" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
                    <XAxis dataKey="date" stroke="rgba(255,255,255,.25)"
                      style={{ ...mono, fontSize: '.65rem' }} tick={{ fill: 'rgba(255,255,255,.4)' }} />
                    <YAxis stroke="rgba(255,255,255,.25)"
                      style={{ ...mono, fontSize: '.65rem' }} tick={{ fill: 'rgba(255,255,255,.4)' }}
                      tickFormatter={(v) => `$${v}`} />
                    <Tooltip
                      contentStyle={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, ...mono, fontSize: '.8rem' }}
                      formatter={(v: unknown) => `$${formatTooltipValue(v)}`}
                    />
                    <Area type="monotone" dataKey="nav" stroke="#E8AC20" strokeWidth={2}
                      fill="url(#navGrad)" dot={false} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--faint)', ...mono, fontSize: '.8rem' }}>
                Collecting data from live agent snapshots
              </div>
            )}
          </div>

          {/* ── KPI strip ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '.75rem', marginBottom: '1.25rem' }}>
            <Metric label="SHARPE RATIO" value={sharpe.toFixed(2)} color="#E8AC20" />
            <Metric label="MAX DRAWDOWN" value={`-${maxDD.toFixed(1)}%`} color="var(--red)" />
            <Metric label="WIN RATE" value={`${winRate.toFixed(0)}%`} color="var(--green)" />
            <Metric label="TOTAL TRADES" value={totalTrades.toString()} />
            <Metric label="CAPITAL" value={fmtUSD(agent.total_aum_cents)} color="var(--gold)" />
            <Metric label="REALIZED P&L" value={realizedPnL >= 0 ? `+${fmtUSD(realizedPnL)}` : fmtUSD(realizedPnL)}
              color={realizedPnL >= 0 ? 'var(--green)' : 'var(--red)'} />
          </div>

          {/* ── Tabs ── */}
          <div>
            <div style={{ display: 'flex', gap: '.25rem', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem' }}>
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding: '.7rem 1.1rem',
                  background: 'transparent',
                  border: 'none',
                  fontFamily: tab === t ? 'var(--font-head)' : 'inherit',
                  fontSize: '.85rem',
                  fontWeight: 700,
                  color: tab === t ? 'var(--white)' : 'var(--muted)',
                  borderBottom: tab === t ? '2px solid var(--gold)' : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'color .15s',
                }}>
                  {t}
                </button>
              ))}
            </div>

            {/* ── OVERVIEW tab ── */}
            {tab === 'Overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {agent.description && (
                  <div style={{ ...card, lineHeight: 1.75, color: 'var(--muted)', fontSize: '.9rem' }}>
                    {agent.description}
                  </div>
                )}

                {agent.signal_summary && (() => {
                  const sig = parseSignal(agent.signal_summary)
                  return (
                  <div style={{ ...card, borderColor: 'rgba(232,172,32,.2)', background: 'rgba(232,172,32,.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.6rem' }}>
                      <div style={{ ...mono, fontSize: '.65rem', letterSpacing: '.1em', color: 'var(--gold)' }}>LATEST SIGNAL</div>
                      <span style={{ ...mono, fontSize: '.65rem', fontWeight: 800, padding: '.15rem .5rem', borderRadius: 20,
                        color: sig.badge.color, background: sig.badge.bg, border: `1px solid ${sig.badge.color}33` }}>
                        {sig.badge.label}
                      </span>
                    </div>
                    <div style={{ fontSize: '.88rem', lineHeight: 1.65, color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginBottom: sig.waitFor ? '.75rem' : 0 }}>
                      {agent.signal_summary}
                    </div>
                    {sig.waitFor && (
                      <div style={{
                        marginTop: '.5rem', padding: '.65rem .9rem',
                        background: 'rgba(232,172,32,.06)', border: '1px solid rgba(232,172,32,.18)',
                        borderRadius: 10, display: 'flex', alignItems: 'flex-start', gap: '.5rem',
                      }}>
                        <span style={{ ...mono, fontSize: '.6rem', fontWeight: 800, color: 'var(--gold)', letterSpacing: '.08em', minWidth: 80 }}>
                          WAITING FOR
                        </span>
                        <span style={{ ...mono, fontSize: '.82rem', color: 'var(--white)', lineHeight: 1.5 }}>
                          {sig.waitFor}
                        </span>
                      </div>
                    )}
                    {agent.last_run_at && (
                      <div style={{ ...mono, fontSize: '.7rem', color: 'var(--faint)', marginTop: '.75rem' }}>
                        Last run: {fmtDateTime(agent.last_run_at)}
                        <span style={{ marginLeft: '.75rem', color: 'var(--green)', fontSize: '.65rem' }}>● Auto-refreshes every 30s</span>
                      </div>
                    )}
                  </div>
                  )
                })()}

                {/* Open positions */}
                {openTrades.length > 0 && (
                  <div style={{ ...card }}>
                    <div style={{ ...mono, fontSize: '.65rem', letterSpacing: '.1em', color: 'var(--faint)', marginBottom: '1rem' }}>
                      OPEN POSITIONS ({openTrades.length})
                    </div>
                    {openTrades.map((t, i) => (
                      <div key={t.id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '.65rem 0',
                        borderBottom: i < openTrades.length - 1 ? '1px solid var(--border)' : 'none',
                        fontSize: '.85rem',
                      }}>
                        <div>
                          <div style={{ fontWeight: 700, marginBottom: '.2rem' }}>{t.symbol}</div>
                          <div style={{ ...mono, fontSize: '.7rem', color: 'var(--faint)' }}>
                            {t.qty.toFixed(6)} @ {fmtUSD(Math.round(t.fill_price * 100))}
                          </div>
                        </div>
                        <div style={{ ...mono, fontSize: '.75rem', color: 'var(--gold)', fontWeight: 700 }}>
                          OPEN
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                  <div style={{ ...card }}>
                    <div style={{ ...mono, fontSize: '.65rem', color: 'var(--faint)', marginBottom: '.5rem' }}>STRATEGY TYPE</div>
                    <div style={{ fontWeight: 700, fontSize: '.95rem' }}>{STRATEGY_LABELS[agent.strategy_type] ?? agent.strategy_type}</div>
                  </div>
                  <div style={{ ...card }}>
                    <div style={{ ...mono, fontSize: '.65rem', color: 'var(--faint)', marginBottom: '.5rem' }}>LAST UPDATED</div>
                    <div style={{ fontWeight: 700, fontSize: '.95rem', ...mono }}>
                      {agent.last_run_at ? fmtDateTime(agent.last_run_at) : '—'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── PERFORMANCE tab ── */}
            {tab === 'Performance' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '.75rem' }}>
                  <Metric label="TOTAL RETURN" value={`${totalReturn >= 0 ? '+' : ''}${fmtPct(totalReturn)}`}
                    color={totalReturn >= 0 ? 'var(--green)' : 'var(--red)'} />
                  <Metric label="VOLATILITY (ANN)" value={`${volatility.toFixed(1)}%`} color="#E8AC20" />
                  <Metric label="SORTINO RATIO" value={sortino.toFixed(2)} color="#E8AC20" />
                  <Metric label="CALMAR RATIO" value={calmar.toFixed(2)} color="#9B59B6" />
                  <Metric label="PROFIT FACTOR" value={profitFactor >= 99 ? '∞' : profitFactor.toFixed(2)}
                    color={profitFactor >= 1 ? 'var(--green)' : 'var(--red)'}
                    sub={profitFactor >= 1 ? 'Profitable' : 'Unprofitable'} />
                  <Metric label="AVG TRADE P&L" value={`${avgTradePnL >= 0 ? '+' : ''}${fmtUSD(avgTradePnL)}`}
                    color={avgTradePnL >= 0 ? 'var(--green)' : 'var(--red)'} />
                  <Metric label="AVG HOLD TIME" value={avgHoldHours > 0 ? `${avgHoldHours}h` : '—'} />
                  <Metric label="MAX WIN STREAK" value={streaks.wins.toString()} color="var(--green)"
                    sub={`Max loss streak: ${streaks.losses}`} />
                </div>

                <div style={{ ...card }}>
                  <div style={{ ...mono, fontSize: '.65rem', color: 'var(--faint)', marginBottom: '1rem' }}>RETURNS OVER TIME</div>
                  {chartData.length > 1 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
                        <XAxis dataKey="date" stroke="rgba(255,255,255,.25)"
                          tick={{ fill: 'rgba(255,255,255,.4)', fontSize: 10, fontFamily: 'var(--font-mono)' }} />
                        <YAxis stroke="rgba(255,255,255,.25)"
                          tick={{ fill: 'rgba(255,255,255,.4)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                          tickFormatter={(v) => `${v}%`} />
                        <Tooltip contentStyle={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8 }}
                          formatter={(v: unknown) => formatTooltipValue(v, '%')} />
                        <Line type="monotone" dataKey="ret" stroke="#E8AC20" strokeWidth={2}
                          dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--faint)', ...mono, fontSize: '.8rem' }}>
                      No data yet
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                  <div style={{ ...card }}>
                    <div style={{ ...mono, fontSize: '.65rem', color: 'var(--faint)', marginBottom: '.5rem' }}>WINNING TRADES</div>
                    <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.5rem', fontWeight: 900, color: 'var(--green)' }}>{winCount}</div>
                    <div style={{ ...mono, fontSize: '.7rem', color: 'var(--faint)', marginTop: '.25rem' }}>
                      {winCount + lossCount > 0 ? ((winCount / (winCount + lossCount)) * 100).toFixed(1) : '0'}% of closed
                    </div>
                  </div>
                  <div style={{ ...card }}>
                    <div style={{ ...mono, fontSize: '.65rem', color: 'var(--faint)', marginBottom: '.5rem' }}>LOSING TRADES</div>
                    <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.5rem', fontWeight: 900, color: 'var(--red)' }}>{lossCount}</div>
                  </div>
                  <div style={{ ...card }}>
                    <div style={{ ...mono, fontSize: '.65rem', color: 'var(--faint)', marginBottom: '.5rem' }}>REALIZED P&L</div>
                    <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.3rem', fontWeight: 900, color: realizedPnL >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {realizedPnL >= 0 ? '+' : ''}{fmtUSD(realizedPnL)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── RISK tab ── */}
            {tab === 'Risk' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '.75rem' }}>
                  <Metric label="SHARPE RATIO" value={sharpe.toFixed(2)} color="#E8AC20"
                    sub={sharpe > 1 ? 'Good' : sharpe > 0 ? 'Acceptable' : 'Poor'} />
                  <Metric label="SORTINO RATIO" value={sortino.toFixed(2)} color="#9B59B6"
                    sub="Downside-adjusted" />
                  <Metric label="CALMAR RATIO" value={calmar.toFixed(2)} color="#1ABC9C"
                    sub="Return / MaxDD" />
                  <Metric label="VOLATILITY" value={`${volatility.toFixed(1)}%`} color="#E8AC20"
                    sub="Annualized" />
                  <Metric label="MAX DRAWDOWN" value={`-${maxDD.toFixed(1)}%`} color="var(--red)"
                    sub="Peak-to-trough" />
                  <Metric label="PROFIT FACTOR" value={profitFactor >= 99 ? '∞' : profitFactor.toFixed(2)}
                    color={profitFactor >= 1 ? 'var(--green)' : 'var(--red)'}
                    sub="Gross wins / Gross losses" />
                </div>

                <div style={{ ...card }}>
                  <div style={{ ...mono, fontSize: '.65rem', color: 'var(--faint)', marginBottom: '1rem' }}>DRAWDOWN OVER TIME</div>
                  {chartData.length > 1 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#E84040" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#E84040" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
                        <XAxis dataKey="date" stroke="rgba(255,255,255,.25)"
                          tick={{ fill: 'rgba(255,255,255,.4)', fontSize: 10, fontFamily: 'var(--font-mono)' }} />
                        <YAxis stroke="rgba(255,255,255,.25)"
                          tick={{ fill: 'rgba(255,255,255,.4)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                          tickFormatter={(v) => `${v}%`} />
                        <Tooltip contentStyle={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8 }}
                          formatter={(v: unknown) => formatTooltipValue(v, '%')} />
                        <Area type="monotone" dataKey="dd" stroke="#E84040" strokeWidth={2}
                          fill="url(#ddGrad)" dot={false} isAnimationActive={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--faint)', ...mono, fontSize: '.8rem' }}>
                      No data yet
                    </div>
                  )}
                </div>

                <div style={{ ...card, background: 'rgba(232,64,64,.03)', borderColor: 'rgba(232,64,64,.15)' }}>
                  <div style={{ ...mono, fontSize: '.65rem', color: 'var(--red)', letterSpacing: '.1em', marginBottom: '1rem' }}>
                    ACTIVE RISK CONTROLS
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '.75rem', fontSize: '.85rem' }}>
                    {[
                      ['Stop Loss', '-3.0% from entry'],
                      ['Take Profit', '+8.0% from entry'],
                      ['Trailing Stop', '-2.5% from peak'],
                      ['Circuit Breaker', '-12% portfolio drawdown'],
                      ['Time Stop', '120h max hold'],
                      ['Min Signal', '≥60/100 conviction'],
                    ].map(([label, val]) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '.6rem .75rem', background: 'rgba(255,255,255,.02)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--muted)', ...mono, fontSize: '.75rem' }}>{label}</span>
                        <span style={{ fontWeight: 700, ...mono, fontSize: '.8rem', color: 'var(--red)' }}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── TRADES tab ── */}
            {tab === 'Trades' && (
              <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                {sortedTrades.length === 0 ? (
                  <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--faint)', ...mono, fontSize: '.85rem' }}>
                    No trades recorded yet — check back after the next cron run.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', ...mono, fontSize: '.82rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,.02)' }}>
                        {['DATE', 'SYMBOL', 'SIDE', 'QTY', 'PRICE', 'P&L', 'EXIT'].map(h => (
                          <th key={h} style={{ padding: '.8rem 1rem', textAlign: h === 'SIDE' ? 'center' : h === 'QTY' || h === 'PRICE' || h === 'P&L' ? 'right' : 'left',
                            color: 'var(--faint)', fontWeight: 600, fontSize: '.65rem', letterSpacing: '.1em', whiteSpace: 'nowrap' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTrades.map((t, i) => (
                        <tr key={t.id} style={{
                          borderBottom: i < sortedTrades.length - 1 ? '1px solid rgba(255,255,255,.04)' : 'none',
                          background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.01)',
                        }}>
                          <td style={{ padding: '.75rem 1rem', color: 'var(--faint)', whiteSpace: 'nowrap' }}>
                            {t.filled_at ? fmtDateTime(t.filled_at) : '—'}
                          </td>
                          <td style={{ padding: '.75rem 1rem', fontWeight: 700, color: 'var(--white)' }}>{t.symbol}</td>
                          <td style={{ padding: '.75rem 1rem', textAlign: 'center' }}>
                            <span style={{
                              padding: '.2rem .55rem', borderRadius: 4, fontSize: '.7rem', fontWeight: 700,
                              background: t.side === 'buy' ? 'rgba(14,173,110,.18)' : 'rgba(232,64,64,.18)',
                              color: t.side === 'buy' ? 'var(--green)' : 'var(--red)',
                            }}>
                              {t.side.toUpperCase()}
                            </span>
                          </td>
                          <td style={{ padding: '.75rem 1rem', textAlign: 'right', color: 'var(--muted)' }}>
                            {t.qty.toFixed(5)}
                          </td>
                          <td style={{ padding: '.75rem 1rem', textAlign: 'right', color: 'var(--muted)' }}>
                            {fmtUSD(Math.round(t.fill_price * 100))}
                          </td>
                          <td style={{ padding: '.75rem 1rem', textAlign: 'right', fontWeight: 700,
                            color: t.pnl_cents === null ? 'var(--faint)' : (t.pnl_cents ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {t.pnl_cents === null ? '—' : `${(t.pnl_cents ?? 0) >= 0 ? '+' : ''}${fmtUSD(t.pnl_cents!)}`}
                          </td>
                          <td style={{ padding: '.75rem 1rem', color: 'var(--faint)', fontSize: '.72rem', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.exit_reason ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT – Trade panel */}
        <div style={{
          ...card,
          height: 'fit-content',
          position: 'sticky',
          top: 80,
          padding: '1.5rem',
        }}>
          {/* Mini price ticker */}
          <div style={{
            background: 'rgba(255,255,255,.02)', borderRadius: 10, padding: '.65rem .9rem',
            marginBottom: '1.25rem', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ ...mono, fontSize: '.58rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.2rem' }}>NAV / SHARE</div>
              <div style={{
                fontFamily: 'var(--font-head)', fontSize: '1.35rem', fontWeight: 900,
                color: flash === 'up' ? 'var(--green)' : flash === 'down' ? 'var(--red)' : 'var(--white)',
                transition: 'color .4s ease',
              }}>
                {fmtUSD(nav)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...mono, fontSize: '.58rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.2rem' }}>ALL-TIME</div>
              <div style={{ ...mono, fontSize: '.88rem', fontWeight: 800, color: totalReturn >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {totalReturn >= 0 ? '+' : ''}{fmtPct(totalReturn)}
              </div>
            </div>
          </div>

          {/* Sparkline from last 20 NAV points */}
          {statsHistory.length > 2 && (() => {
            const pts = statsHistory.slice(-20).map(s => s.nav_cents)
            const mn = Math.min(...pts), mx = Math.max(...pts)
            const range = mx - mn || 1
            const w = 100, h = 32
            const xs = pts.map((_, i) => (i / (pts.length - 1)) * w)
            const ys = pts.map(v => h - ((v - mn) / range) * (h - 4) - 2)
            const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
            const lastDir = pts[pts.length - 1] >= pts[0] ? '#0EAD6E' : '#E84040'
            const fill = `${d} L${w},${h} L0,${h} Z`
            return (
              <div style={{ marginBottom: '1.25rem' }}>
                <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="spkGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={lastDir} stopOpacity={.2} />
                      <stop offset="100%" stopColor={lastDir} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <path d={fill} fill="url(#spkGrad)" />
                  <path d={d} stroke={lastDir} strokeWidth="1.5" fill="none" />
                  <circle cx={xs[xs.length-1].toFixed(1)} cy={ys[ys.length-1].toFixed(1)} r="2.5" fill={lastDir} />
                </svg>
              </div>
            )
          })()}

          {success ? (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <div style={{ fontSize: '2.5rem', color: 'var(--green)', marginBottom: '1rem' }}>✓</div>
              <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 800, marginBottom: '.5rem' }}>
                {tradeMode === 'buy' ? 'Investment Confirmed' : 'Position Closed'}
              </h3>
              <p style={{ color: 'var(--muted)', fontSize: '.85rem' }}>Redirecting to dashboard…</p>
            </div>
          ) : (
            <>
              {/* BUY / SELL toggle */}
              <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1.5rem' }}>
                <button onClick={() => setTradeMode('buy')} style={{
                  flex: 1, padding: '.65rem', borderRadius: 10, cursor: 'pointer', transition: 'all .15s', fontWeight: 700, fontSize: '.9rem',
                  border: tradeMode === 'buy' ? '1px solid var(--green)' : '1px solid var(--border)',
                  background: tradeMode === 'buy' ? 'rgba(14,173,110,.12)' : 'transparent',
                  color: tradeMode === 'buy' ? 'var(--green)' : 'var(--muted)',
                }}>BUY</button>
                <button onClick={() => setTradeMode('sell')} disabled={!userHolding} style={{
                  flex: 1, padding: '.65rem', borderRadius: 10, transition: 'all .15s', fontWeight: 700, fontSize: '.9rem',
                  cursor: userHolding ? 'pointer' : 'not-allowed', opacity: userHolding ? 1 : 0.45,
                  border: tradeMode === 'sell' ? '1px solid var(--red)' : '1px solid var(--border)',
                  background: tradeMode === 'sell' ? 'rgba(232,64,64,.12)' : 'transparent',
                  color: tradeMode === 'sell' ? 'var(--red)' : 'var(--muted)',
                }}>SELL</button>
              </div>

              {/* BUY form */}
              {tradeMode === 'buy' && (
                <>
                  <div style={{ ...mono, fontSize: '.65rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.5rem' }}>AMOUNT (USD)</div>
                  <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem' }}>
                    <input type="number" value={amount} onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                      className="input-base" style={{ flex: 1 }} />
                    <button onClick={() => setAmount(walletBalance / 100)} style={{
                      padding: '.65rem .85rem', borderRadius: 10, border: '1px solid var(--border2)',
                      background: 'transparent', color: 'var(--muted)', ...mono, fontSize: '.8rem', fontWeight: 700, cursor: 'pointer',
                    }} className="max-button">MAX</button>
                  </div>

                  <div style={{
                    background: 'rgba(232,172,32,.04)', border: '1px solid rgba(232,172,32,.12)',
                    borderRadius: 12, padding: '.9rem 1rem', marginBottom: '1rem', fontSize: '.82rem',
                  }}>
                    {[
                      ['Shares', sharesToGet.toFixed(5)],
                      ['Ask price', fmtUSD(askCents)],
                      ['Spread', '0.30%'],
                    ].map(([l, v]) => (
                      <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.4rem' }}>
                        <span style={{ color: 'var(--muted)' }}>{l}</span>
                        <span style={{ fontWeight: 700 }}>{v}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ ...mono, fontSize: '.75rem', padding: '.65rem .9rem', background: 'rgba(255,255,255,.025)',
                    border: '1px solid var(--border)', borderRadius: 10, marginBottom: '1rem' }}>
                    <span style={{ color: 'var(--faint)' }}>Available: </span>
                    <span style={{ fontWeight: 700 }}>{fmtUSD(walletBalance)}</span>
                  </div>

                  {error && (
                    <div style={{ padding: '.7rem .9rem', background: 'rgba(232,64,64,.08)', border: '1px solid rgba(232,64,64,.2)',
                      borderRadius: 10, fontSize: '.8rem', color: 'var(--red)', marginBottom: '1rem' }}>{error}</div>
                  )}

                  <button onClick={handleInvest} disabled={loading} style={{
                    width: '100%', padding: '.75rem', borderRadius: 12, border: 'none',
                    background: 'var(--green)', color: 'var(--bg)', fontFamily: 'var(--font-head)',
                    fontWeight: 800, fontSize: '.95rem', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'opacity .15s',
                  }}>
                    {loading ? 'Processing…' : `Invest ${fmtUSD(amountCents)} →`}
                  </button>
                </>
              )}

              {/* SELL form */}
              {tradeMode === 'sell' && userHolding && (
                <>
                  <div style={{
                    background: 'rgba(14,173,110,.04)', border: '1px solid rgba(14,173,110,.15)',
                    borderRadius: 12, padding: '.9rem 1rem', marginBottom: '1rem', fontSize: '.82rem',
                  }}>
                    <div style={{ ...mono, fontSize: '.65rem', color: 'var(--faint)', marginBottom: '.75rem' }}>YOUR HOLDING</div>
                    {[
                      ['Shares', userHolding.shares.toFixed(5)],
                      ['Cost basis', fmtUSD(userHolding.invested_cents)],
                      ['Current value', fmtUSD(positionValue)],
                      ['Bid price', fmtUSD(bidCents)],
                    ].map(([l, v], i) => (
                      <div key={l} style={{ display: 'flex', justifyContent: 'space-between',
                        paddingTop: i > 0 ? '.4rem' : 0,
                        borderTop: i === 3 ? '1px solid rgba(14,173,110,.12)' : 'none',
                        marginTop: i === 3 ? '.4rem' : 0 }}>
                        <span style={{ color: 'var(--muted)' }}>{l}</span>
                        <span style={{ fontWeight: 700, color: i === 3 ? 'var(--green)' : 'inherit' }}>{v}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '.4rem', paddingTop: '.4rem',
                      borderTop: '1px solid rgba(14,173,110,.12)' }}>
                      <span style={{ color: 'var(--muted)' }}>Unrealized P&L</span>
                      <span style={{ fontWeight: 700, color: positionPnL >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {positionPnL >= 0 ? '+' : ''}{fmtUSD(positionPnL)}
                      </span>
                    </div>
                  </div>

                  {error && (
                    <div style={{ padding: '.7rem .9rem', background: 'rgba(232,64,64,.08)', border: '1px solid rgba(232,64,64,.2)',
                      borderRadius: 10, fontSize: '.8rem', color: 'var(--red)', marginBottom: '1rem' }}>{error}</div>
                  )}

                  <button onClick={handleSell} disabled={loading} style={{
                    width: '100%', padding: '.75rem', borderRadius: 12, border: 'none',
                    background: 'var(--red)', color: 'var(--bg)', fontFamily: 'var(--font-head)',
                    fontWeight: 800, fontSize: '.95rem', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'opacity .15s',
                  }}>
                    {loading ? 'Processing…' : 'Close Position →'}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        .max-button:hover { color: #E8AC20 !important; border-color: rgba(232,172,32,.25) !important; }

        @keyframes priceBgUp {
          0% { background: transparent; }
          20% { background: rgba(14,173,110,.18); }
          100% { background: transparent; }
        }
        @keyframes priceBgDown {
          0% { background: transparent; }
          20% { background: rgba(232,64,64,.18); }
          100% { background: transparent; }
        }
        .price-flash-up { animation: priceBgUp 1.2s ease-out forwards; border-radius: 6px; }
        .price-flash-down { animation: priceBgDown 1.2s ease-out forwards; border-radius: 6px; }

        @keyframes pulseOpacity {
          0%, 100% { opacity: 1; }
          50% { opacity: .35; }
        }
        .pulse-dot {
          display: inline-block; width: 7px; height: 7px; border-radius: 50%;
          background: #0EAD6E; animation: pulseOpacity 1.8s ease-in-out infinite;
        }
        .pulse-text { animation: pulseOpacity 2s ease-in-out infinite; }

        @keyframes tickerScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }

        @media(max-width:1100px){
          [style*="grid-template-columns: 1fr 360px"] { grid-template-columns: 1fr !important; }
          [style*="position: sticky"][style*="top: 80"] { position: relative !important; top: auto !important; }
          [style*="repeat(4, 1fr)"] { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media(max-width:640px){
          [style*="repeat(3, 1fr)"] { grid-template-columns: repeat(2, 1fr) !important; }
          [style*="repeat(4, 1fr)"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
