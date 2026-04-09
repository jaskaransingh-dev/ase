'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { fmtPct, fmtDate } from '@/lib/utils'

interface Agent {
  id: string
  name: string
  slug: string
  description: string
  strategy_type: string
  status: string
  alert_level?: string
  drawdown_pct?: number
  monthly_fee_cents?: number
  subscriber_count?: number
  primary_symbol?: string
  backtest_strategy?: string
  signal_summary?: string
}
interface Stats {
  id: string
  nav_cents: number
  total_return_pct: number
  sharpe_ratio: number
  max_drawdown_pct: number
  win_rate_pct: number
  total_trades: number
  snapshot_at: string
}
interface Trade {
  id: string
  symbol: string
  side: string
  qty: number
  fill_price: number
  filled_at: string
  pnl_cents: number
}

interface CachedBacktestStats {
  symbol: string
  strategy: string
  period: string
  computed_at: string
  stats: BacktestStats
  buyHold: { totalReturnPct: number }
  equityCurve: Array<{ date: string; equity: number }>
  buyHoldCurve: Array<{ date: string; equity: number }>
}

interface Props {
  agent: Agent
  statsHistory: Stats[]
  latestStats: Stats | null
  trades: Trade[]
  isLoggedIn: boolean
  isSubscribed: boolean
  cachedBacktestStats: CachedBacktestStats | null
}

const TABS = ['Overview', 'Performance', 'Trades', 'Strategy', 'Backtest'] as const
type Tab = typeof TABS[number]

interface BacktestStats {
  totalReturnPct: number; annualizedReturnPct: number; sharpeRatio: number
  maxDrawdownPct: number; winRate: number; totalTrades: number
  bestTradePct: number; worstTradePct: number; calmarRatio: number
}
interface BacktestBar { date: string; equity: number }
interface BacktestResult {
  stats: BacktestStats; bars: BacktestBar[]; buyHold: BacktestBar[]
  symbol: string; period: string
}

interface MCResult {
  start: string; end: string; bars: number
  strategyReturn: number; marketReturn: number; excessReturn: number
  sharpe: number; maxDrawdown: number; winRate: number; totalTrades: number
}
interface MCSummary {
  nTrials: number; windowDays: number
  medianReturn: number; meanReturn: number
  medianExcess: number; meanExcess: number; medianSharpe: number
  beatRate: number; medianDrawdown: number
  p10Return: number; p90Return: number
  results: MCResult[]
}

const strategyDescriptions: Record<string, string> = {
  momentum: 'Weekly rebalance targeting highest-momentum stocks from a curated watchlist. Position-size capped at 20% per holding.',
  mean_reversion: 'Enters when RSI drops below 30 on large-cap equities. Exits at RSI > 55 or +8% gain. Max 3 open positions.',
  trend_following: 'Classic 50/200 EMA crossover on SPY, QQQ, IWM. Long when 50-EMA is above 200-EMA, flat otherwise.',
  crypto_momentum: 'BTC/ETH momentum with EMA crossovers, MACD confirmation, and RSI filters. Multi-tier profit taking with ATR-based stops.',
  crypto_mean_reversion: 'Statistical arbitrage on ETH using Bollinger Band and Z-score mean reversion. Scales position size based on oversold magnitude.',
}

const strategyInfo: Record<string, { label: string; color: string }> = {
  momentum:              { label: 'Momentum',        color: 'var(--gold)' },
  mean_reversion:        { label: 'Mean Reversion',  color: 'var(--green)' },
  trend_following:       { label: 'Trend Following', color: '#7B9FFF' },
  crypto_momentum:       { label: 'Crypto Momentum', color: '#F7931A' },
  crypto_mean_reversion: { label: 'Crypto Arb',      color: '#0EAD6E' },
}

export default function AgentDetailClient({ agent, statsHistory, latestStats, trades, isLoggedIn, isSubscribed: initialIsSubscribed, cachedBacktestStats }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('Overview')
  const [isSubscribed, setIsSubscribed] = useState(initialIsSubscribed)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  // Backtest state — pre-populate from cached DB result if available
  const [btResult, setBtResult] = useState<BacktestResult | null>(() => {
    if (!cachedBacktestStats) return null
    const c = cachedBacktestStats
    // Merge equityCurve + buyHoldCurve into the bars/buyHold shape the UI expects
    const bars = c.equityCurve.map(p => ({ date: p.date, equity: p.equity }))
    const buyHold = c.buyHoldCurve.map(p => ({ date: p.date, equity: p.equity }))
    return { stats: c.stats, bars, buyHold, symbol: c.symbol, period: c.period }
  })
  const [btLoading, setBtLoading] = useState(false)
  const [btError, setBtError] = useState('')
  const [btPeriod, setBtPeriod] = useState(cachedBacktestStats?.period ?? '2y')
  const [btRefreshing, setBtRefreshing] = useState(false)

  // Monte Carlo state
  const [mcResult, setMcResult] = useState<MCSummary | null>(null)
  const [mcLoading, setMcLoading] = useState(false)
  const [mcError, setMcError] = useState('')
  const [mcTrials, setMcTrials] = useState(80)
  const [mcWindow, setMcWindow] = useState(180) // days

  async function loadMonteCarlo() {
    if (!agent.primary_symbol || !agent.backtest_strategy) {
      setMcError('No backtest configuration for this agent.')
      return
    }
    setMcLoading(true)
    setMcError('')
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: agent.primary_symbol,
          strategy: agent.backtest_strategy,
          period: '10y',
          monteCarlo: true,
          nTrials: mcTrials,
          windowDays: mcWindow,
          seed: 42,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? 'Monte Carlo failed')
      setMcResult(data.monteCarlo as MCSummary)
    } catch (e) {
      setMcError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setMcLoading(false)
    }
  }

  async function loadBacktest(period = btPeriod) {
    if (!agent.primary_symbol || !agent.backtest_strategy) {
      setBtError('No backtest configuration for this agent.')
      return
    }
    setBtLoading(true)
    setBtError('')
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: agent.primary_symbol, strategy: agent.backtest_strategy, period }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? 'Backtest failed')
      setBtResult(data as BacktestResult)
    } catch (e) {
      setBtError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setBtLoading(false)
    }
  }

  async function refreshBacktestStats() {
    setBtRefreshing(true)
    try {
      await fetch('/api/cron/run-backtests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agent.id }),
      })
      router.refresh()
    } finally {
      setBtRefreshing(false)
    }
  }

  function handleTabChange(t: Tab) {
    setTab(t)
    if (t === 'Backtest' && !btResult && !btLoading) {
      loadBacktest()
    }
  }

  // Prefer backtest-derived stats from cachedBacktestStats if no live stats exist
  const bt = cachedBacktestStats?.stats
  const ret = latestStats?.total_return_pct ?? bt?.totalReturnPct ?? 0
  const sharpe = latestStats?.sharpe_ratio ?? bt?.sharpeRatio ?? 0
  const maxDD = latestStats?.max_drawdown_pct ?? bt?.maxDrawdownPct ?? 0
  const winRate = latestStats?.win_rate_pct ?? bt?.winRate ?? 0
  const totalTrades = latestStats?.total_trades ?? bt?.totalTrades ?? 0
  const pos = ret >= 0
  const hasBacktestData = !!cachedBacktestStats
  const info = strategyInfo[agent.strategy_type] || { label: agent.strategy_type, color: 'var(--white)' }

  const chartData = statsHistory.map(s => ({
    date: fmtDate(s.snapshot_at),
    nav: +(s.nav_cents / 100).toFixed(2),
    ret: +s.total_return_pct.toFixed(2),
  }))
  const hasChartData = chartData.length > 1

  const annualizedVolPct = useMemo(() => {
    if (statsHistory.length < 3) return null
    const navs = statsHistory.map(s => s.nav_cents)
    const returns: number[] = []
    for (let i = 1; i < navs.length; i++) {
      if (navs[i - 1] > 0) returns.push((navs[i] - navs[i - 1]) / navs[i - 1])
    }
    if (returns.length < 2) return null
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length
    return Math.sqrt(variance) * Math.sqrt(365) * 100
  }, [statsHistory])

  async function handleSubscribe() {
    if (!isLoggedIn) { router.push('/login'); return }
    setLoading(true)
    setMsg('')
    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agent.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setIsSubscribed(true)
      setMsg('Subscribed! The agent will now trade on your behalf.')
      router.refresh()
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Subscription failed')
    }
    setLoading(false)
  }

  async function handleUnsubscribe() {
    setLoading(true)
    setMsg('')
    try {
      const res = await fetch('/api/subscriptions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agent.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setIsSubscribed(false)
      setMsg('Unsubscribed.')
      router.refresh()
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Error')
    }
    setLoading(false)
  }

  const monthlyFee = agent.monthly_fee_cents ?? 0
  const subscribers = agent.subscriber_count ?? 0

  return (
    <div style={{ padding: '2rem 2.5rem', maxWidth: 1280, margin: '0 auto' }}>
      {/* Back */}
      <Link href="/agents" style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: 'var(--faint)', display: 'inline-flex', alignItems: 'center', gap: '.35rem', marginBottom: '1.5rem', textDecoration: 'none', transition: 'color .15s' }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--white)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--faint)'}>
        ← All Agents
      </Link>

      {/* Drawdown Alerts */}
      {agent.alert_level === 'yellow' && (
        <div style={{background:'rgba(232,172,32,.12)',border:'1px solid rgba(232,172,32,.3)',borderRadius:12,padding:'.75rem 1rem',marginBottom:'1rem',color:'#E8AC20',fontSize:'.85rem'}}>
          Warning: Agent is {agent.drawdown_pct?.toFixed(1)}% below peak NAV. Monitor closely.
        </div>
      )}
      {agent.alert_level === 'hard' && (
        <div style={{background:'rgba(232,64,64,.12)',border:'1px solid rgba(232,64,64,.4)',borderRadius:12,padding:'.75rem 1rem',marginBottom:'1rem',color:'#E84040',fontSize:'.85rem'}}>
          Hard Alert: 40%+ drawdown. Agent under review for delisting. Subscriptions paused.
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '2rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.5rem', flexWrap: 'wrap' }}>
            <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '1.8rem', fontWeight: 800 }}>{agent.name}</h1>
            <span className="pill pill-green">VERIFIED</span>
            <span className="tag" style={{ color: info.color, borderColor: `${info.color}30` }}>{info.label.toUpperCase()}</span>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '.9rem', lineHeight: 1.7, maxWidth: 560 }}>{agent.description}</p>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: 'var(--faint)' }}>
              {agent.primary_symbol ?? 'MULTI'} · {subscribers} subscribers · {monthlyFee === 0 ? 'Free beta' : `$${(monthlyFee / 100).toFixed(0)}/mo`}
            </span>
          </div>
        </div>

        {/* Subscribe CTA */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 18, padding: '1.25rem 1.5rem', minWidth: 220, flexShrink: 0, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.9rem', fontWeight: 800, color: pos ? 'var(--green)' : 'var(--red)', marginBottom: '.15rem' }}>
            {fmtPct(ret)}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', marginBottom: '1rem' }}>
            {hasBacktestData && !latestStats ? `Backtest Return · ${cachedBacktestStats!.symbol} · ${cachedBacktestStats!.period}` : 'Total Return (paper)'}
          </div>

          {isSubscribed ? (
            <>
              <div style={{ background: 'rgba(110,231,183,.1)', border: '1px solid rgba(110,231,183,.25)', borderRadius: 10, padding: '.5rem .75rem', marginBottom: '.75rem', fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: '#6EE7B7' }}>
                You are subscribed
              </div>
              <button
                onClick={handleUnsubscribe}
                disabled={loading}
                style={{ width: '100%', padding: '.6rem', borderRadius: 10, border: '1px solid rgba(251,113,133,.3)', background: 'rgba(251,113,133,.08)', color: '#FB7185', fontFamily: 'var(--font-mono)', fontSize: '.7rem', fontWeight: 700, cursor: 'pointer' }}
              >
                {loading ? 'Processing…' : 'Unsubscribe'}
              </button>
            </>
          ) : (
            <>
              {!isLoggedIn && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--faint)', marginBottom: '.75rem' }}>
                  Sign in to subscribe
                </div>
              )}
              <button
                onClick={handleSubscribe}
                disabled={loading || agent.alert_level === 'hard'}
                className="btn-primary"
                style={{ width: '100%', padding: '.65rem', borderRadius: 10, fontSize: '.8rem' }}
              >
                {loading ? 'Processing…' : monthlyFee === 0 ? 'Subscribe Free →' : `Subscribe $${(monthlyFee / 100).toFixed(0)}/mo →`}
              </button>
            </>
          )}

          {msg && (
            <div style={{ marginTop: '.6rem', fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: msg.includes('failed') || msg.includes('failed') ? '#FB7185' : '#6EE7B7' }}>
              {msg}
            </div>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: '.6rem', marginBottom: '1.5rem' }} className="kpi-strip">
        {[
          { k: 'SHARPE', v: sharpe.toFixed(2) },
          { k: 'MAX DD', v: fmtPct(-maxDD, 1) },
          { k: 'WIN RATE', v: winRate.toFixed(0) + '%' },
          { k: 'TOTAL TRADES', v: totalTrades.toString() },
          { k: 'ANN. VOL', v: annualizedVolPct !== null ? annualizedVolPct.toFixed(1) + '%' : 'N/A' },
          { k: 'STATUS', v: agent.status.toUpperCase() },
        ].map(({ k, v }) => (
          <div key={k} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '.8rem 1rem', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', letterSpacing: '.08em', color: 'var(--faint)' }}>{k}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.9rem', fontWeight: 800, marginTop: '.3rem' }}>{v}</div>
          </div>
        ))}
      </div>

      {/* NAV Chart */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '.5rem' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: '.95rem' }}>Live Performance (NAV)</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', marginTop: '.15rem' }}>PAPER TRADING · ALPACA EXECUTION</div>
          </div>
          {agent.signal_summary && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--muted)', background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 8, padding: '.3rem .7rem', maxWidth: 320 }}>
              {agent.signal_summary}
            </div>
          )}
        </div>
        {hasChartData ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
              <defs>
                <linearGradient id="navGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={pos ? '#6EE7B7' : '#FB7185'} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={pos ? '#6EE7B7' : '#FB7185'} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fill: 'rgba(238,242,255,.28)', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: 'rgba(238,242,255,.28)', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
              <Tooltip contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 10, fontFamily: 'var(--font-mono)', fontSize: 11 }} labelStyle={{ color: 'var(--faint)' }} itemStyle={{ color: pos ? 'var(--green)' : 'var(--red)' }} formatter={(v: unknown) => [`$${Number(v).toFixed(2)}`, 'NAV']} />
              <Area type="monotone" dataKey="nav" stroke={pos ? '#6EE7B7' : '#FB7185'} strokeWidth={2} fill="url(#navGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--faint)', gap: '.5rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', letterSpacing: '.08em' }}>NO DATA YET</div>
            <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>NAV history appears after first cron run</div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '.25rem', padding: '.5rem .75rem', background: 'rgba(0,0,0,.2)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => handleTabChange(t)}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', fontWeight: 700, letterSpacing: '.04em', padding: '.45rem .75rem', borderRadius: 9, border: `1px solid ${tab === t ? 'rgba(155,140,255,.25)' : 'transparent'}`, color: tab === t ? 'var(--gold)' : 'var(--faint)', background: tab === t ? 'rgba(155,140,255,.08)' : 'transparent', cursor: 'pointer', transition: 'all .14s' }}>
              {t}
            </button>
          ))}
        </div>
        <div style={{ padding: '1.25rem' }}>

          {tab === 'Overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }} className="tab-grid">
              {[
                { title: 'Strategy Type', body: agent.strategy_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) },
                { title: 'Verified Status', body: 'Verified — methodology disclosure submitted, ledger format validated, out-of-sample test passed.' },
                { title: 'How It Works', body: strategyDescriptions[agent.strategy_type] || 'Systematic algorithmic strategy with defined entry and exit rules.' },
                { title: 'Subscription', body: monthlyFee === 0 ? 'Free during beta. Signals are delivered in real-time. Wallet required for future on-chain settlement.' : `$${(monthlyFee / 100).toFixed(2)}/month. Cancel anytime. Wallet required.` },
              ].map(({ title, body }) => (
                <div key={title} style={{ background: 'rgba(255,255,255,.02)', border: '1px solid var(--border)', borderRadius: 12, padding: '.9rem 1rem' }}>
                  <h4 style={{ fontFamily: 'var(--font-head)', fontSize: '.9rem', fontWeight: 800, marginBottom: '.5rem' }}>{title}</h4>
                  <p style={{ fontSize: '.83rem', color: 'var(--muted)', lineHeight: 1.65 }}>{body}</p>
                </div>
              ))}
            </div>
          )}

          {tab === 'Performance' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '.7rem', marginBottom: '1rem' }} className="perf-grid">
                {[
                  { label: 'Total Return', value: fmtPct(ret), color: pos ? 'var(--green)' : 'var(--red)' },
                  { label: 'Sharpe Ratio', value: sharpe.toFixed(2), color: sharpe > 1 ? 'var(--green)' : sharpe > 0.5 ? 'var(--gold)' : '#FB7185' },
                  { label: 'Max Drawdown', value: fmtPct(-maxDD, 1), color: maxDD < 10 ? 'var(--green)' : maxDD < 25 ? 'var(--gold)' : '#FB7185' },
                  { label: 'Win Rate', value: winRate.toFixed(1) + '%', color: winRate > 55 ? 'var(--green)' : winRate > 45 ? 'var(--gold)' : '#FB7185' },
                  { label: 'Total Trades', value: totalTrades.toString(), color: 'var(--white)' },
                  { label: 'Annualized Vol', value: annualizedVolPct !== null ? annualizedVolPct.toFixed(1) + '%' : 'N/A', color: 'var(--white)' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: 'rgba(255,255,255,.02)', border: '1px solid var(--border)', borderRadius: 12, padding: '.9rem 1rem' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.3rem' }}>{label.toUpperCase()}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 800, color }}>{value}</div>
                  </div>
                ))}
              </div>
              {hasChartData && (
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.5rem' }}>RETURN % OVER TIME</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                      <XAxis dataKey="date" tick={{ fill: 'rgba(238,242,255,.28)', fontSize: 9, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: 'rgba(238,242,255,.28)', fontSize: 9, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                      <Tooltip contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 10 }} formatter={(v: unknown) => [`${Number(v).toFixed(2)}%`, 'Return']} />
                      <Line type="monotone" dataKey="ret" stroke="var(--gold)" strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {tab === 'Trades' && (
            <div>
              {trades.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.75rem' }}>No trades yet</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: '.72rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['Symbol', 'Side', 'Qty', 'Fill Price', 'P&L', 'Time'].map(h => (
                          <th key={h} style={{ padding: '.5rem .75rem', textAlign: 'left', color: 'var(--faint)', fontWeight: 600, fontSize: '.6rem', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map(t => {
                        const pnl = t.pnl_cents ?? 0
                        return (
                          <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                            <td style={{ padding: '.45rem .75rem', fontWeight: 700 }}>{t.symbol}</td>
                            <td style={{ padding: '.45rem .75rem', color: t.side === 'buy' ? '#6EE7B7' : '#FB7185', textTransform: 'uppercase', fontWeight: 700 }}>{t.side}</td>
                            <td style={{ padding: '.45rem .75rem', color: 'var(--muted)' }}>{t.qty}</td>
                            <td style={{ padding: '.45rem .75rem', color: 'var(--muted)' }}>${t.fill_price.toFixed(2)}</td>
                            <td style={{ padding: '.45rem .75rem', color: pnl > 0 ? '#6EE7B7' : pnl < 0 ? '#FB7185' : 'var(--faint)' }}>
                              {pnl !== 0 ? `${pnl > 0 ? '+' : ''}$${(pnl / 100).toFixed(2)}` : '—'}
                            </td>
                            <td style={{ padding: '.45rem .75rem', color: 'var(--faint)', whiteSpace: 'nowrap' }}>{new Date(t.filled_at).toLocaleDateString()}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'Strategy' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }} className="tab-grid">
              {[
                { title: 'Logic', body: strategyDescriptions[agent.strategy_type] || 'Systematic strategy with defined entry and exit signals.' },
                { title: 'Execution', body: 'Trades execute on Alpaca paper trading. Live crypto execution available. Real P&L tracked per subscriber wallet.' },
                { title: 'Risk Controls', body: `Max drawdown circuit breaker at 40%. Position sizing enforced. Verified via out-of-sample testing and Deflated Sharpe Ratio analysis.` },
                { title: 'On-Chain (Coming)', body: 'ERC-3643 tokenized shares, Chainlink price feeds, and on-chain settlement are planned for Phase 2. Current subscriptions are tracked off-chain.' },
              ].map(({ title, body }) => (
                <div key={title} style={{ background: 'rgba(255,255,255,.02)', border: '1px solid var(--border)', borderRadius: 12, padding: '.9rem 1rem' }}>
                  <h4 style={{ fontFamily: 'var(--font-head)', fontSize: '.9rem', fontWeight: 800, marginBottom: '.5rem' }}>{title}</h4>
                  <p style={{ fontSize: '.83rem', color: 'var(--muted)', lineHeight: 1.65 }}>{body}</p>
                </div>
              ))}
            </div>
          )}

          {tab === 'Backtest' && (
            <div>
              {/* Period selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                <div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--faint)', letterSpacing: '.08em' }}>
                    {agent.primary_symbol ?? '—'} · {agent.backtest_strategy?.replace(/_/g, ' ') ?? 'no strategy'}
                  </span>
                  {cachedBacktestStats && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--faint)', marginLeft: '.5rem' }}>
                      · cached {new Date(cachedBacktestStats.computed_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '.4rem', marginLeft: 'auto', alignItems: 'center' }}>
                  <button
                    onClick={refreshBacktestStats}
                    disabled={btRefreshing}
                    style={{ padding: '.3rem .7rem', borderRadius: 8, fontSize: '.68rem', fontFamily: 'var(--font-mono)', border: '1px solid rgba(110,231,183,.25)', background: 'rgba(110,231,183,.07)', color: btRefreshing ? 'var(--faint)' : '#6EE7B7', cursor: btRefreshing ? 'default' : 'pointer' }}
                  >
                    {btRefreshing ? 'Updating…' : '↻ Refresh'}
                  </button>
                  {(['1y', '2y', '5y'] as const).map(p => (
                    <button key={p}
                      onClick={() => { setBtPeriod(p); setBtResult(null); loadBacktest(p) }}
                      style={{
                        padding: '.3rem .7rem', borderRadius: 8, fontSize: '.72rem', fontFamily: 'var(--font-mono)',
                        border: `1px solid ${btPeriod === p ? 'rgba(155,140,255,.4)' : 'var(--border)'}`,
                        background: btPeriod === p ? 'rgba(155,140,255,.1)' : 'transparent',
                        color: btPeriod === p ? '#c8b8ff' : 'var(--faint)', cursor: 'pointer',
                      }}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {btLoading && (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.75rem' }}>
                  Running backtest…
                </div>
              )}

              {btError && !btLoading && (
                <div style={{ padding: '.75rem 1rem', background: 'rgba(232,64,64,.08)', border: '1px solid rgba(232,64,64,.2)', borderRadius: 12, color: '#FB7185', fontSize: '.85rem' }}>
                  {btError}
                </div>
              )}

              {btResult && !btLoading && (() => {
                const bs = btResult.stats
                const step = Math.max(1, Math.floor(btResult.bars.length / 300))
                const chartData = btResult.bars
                  .filter((_, i) => i % step === 0)
                  .map((b, i) => ({
                    date: b.date.slice(5),
                    strategy: Math.round(b.equity),
                    buyHold: Math.round(btResult.buyHold[Math.min(i * step, btResult.buyHold.length - 1)]?.equity ?? 0),
                  }))

                const fP = (v: number) => { const s = v >= 0 ? '+' : ''; return `${s}${v.toFixed(2)}%` }
                const fN = (v: number) => v.toFixed(2)
                const col = (v: number) => v >= 0 ? 'var(--green)' : 'var(--red)'

                return (
                  <>
                    {/* Stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: '.65rem', marginBottom: '1.25rem' }}>
                      {[
                        { label: 'Total Return', value: fP(bs.totalReturnPct), color: col(bs.totalReturnPct) },
                        { label: 'Ann. Return', value: fP(bs.annualizedReturnPct), color: col(bs.annualizedReturnPct) },
                        { label: 'Sharpe', value: fN(bs.sharpeRatio), color: bs.sharpeRatio >= 1 ? 'var(--green)' : bs.sharpeRatio >= 0 ? 'var(--gold)' : 'var(--red)' },
                        { label: 'Max Drawdown', value: `-${fN(bs.maxDrawdownPct)}%`, color: 'var(--red)' },
                        { label: 'Win Rate', value: `${fN(bs.winRate)}%`, color: bs.winRate >= 50 ? 'var(--green)' : 'var(--red)' },
                        { label: 'Total Trades', value: String(bs.totalTrades), color: 'var(--white)' },
                        { label: 'Best Trade', value: fP(bs.bestTradePct), color: 'var(--green)' },
                        { label: 'Worst Trade', value: fP(bs.worstTradePct), color: 'var(--red)' },
                        { label: 'Calmar', value: fN(bs.calmarRatio), color: col(bs.calmarRatio) },
                      ].map(({ label, value, color }) => (
                        <div key={label} style={{ background: 'rgba(255,255,255,.02)', border: '1px solid var(--border)', borderRadius: 12, padding: '.8rem 1rem' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.3rem' }}>{label.toUpperCase()}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 800, color }}>{value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Equity chart */}
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.5rem' }}>
                        EQUITY CURVE · $100K initial · {btResult.symbol} · {btResult.period}
                      </div>
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                          <defs>
                            <linearGradient id="btStratGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#9482ff" stopOpacity={0.35} />
                              <stop offset="95%" stopColor="#9482ff" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="btBhGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#6ee7b7" stopOpacity={0.2} />
                              <stop offset="95%" stopColor="#6ee7b7" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="date" tick={{ fill: 'rgba(238,242,255,.28)', fontSize: 9, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                          <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: 'rgba(238,242,255,.28)', fontSize: 9, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} width={48} />
                          <Tooltip
                            contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 10, fontFamily: 'var(--font-mono)', fontSize: 11 }}
                            formatter={(v: unknown) => [`$${Number(v).toLocaleString()}`, '']}
                          />
                          <Legend wrapperStyle={{ fontSize: 11, color: 'rgba(238,242,255,.5)', fontFamily: 'var(--font-mono)' }} />
                          <Area type="monotone" dataKey="buyHold" name="Buy & Hold" stroke="#6ee7b7" strokeWidth={1.5} fill="url(#btBhGrad)" dot={false} />
                          <Area type="monotone" dataKey="strategy" name="Agent Strategy" stroke="#9482ff" strokeWidth={2} fill="url(#btStratGrad)" dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', marginTop: '.5rem' }}>
                      Simulated backtest on historical data. Not a guarantee of future performance. Paper trading only.
                    </div>
                  </>
                )
              })()}

              {!btResult && !btLoading && !btError && (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.75rem' }}>
                  Loading historical backtest…
                </div>
              )}

              {/* ── Monte Carlo Blind Test ── */}
              <div style={{ marginTop: '2rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '.5rem' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '.9rem' }}>Blind Test (Monte Carlo)</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', marginTop: '.15rem' }}>
                      Run {mcTrials} random windows of {mcWindow} days across all available history
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <select value={mcTrials} onChange={e => setMcTrials(Number(e.target.value))}
                      style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', padding: '.3rem .5rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--white)', cursor: 'pointer' }}>
                      {[20, 50, 80, 100, 200].map(n => <option key={n} value={n}>{n} trials</option>)}
                    </select>
                    <select value={mcWindow} onChange={e => setMcWindow(Number(e.target.value))}
                      style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', padding: '.3rem .5rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--white)', cursor: 'pointer' }}>
                      {[
                        { v: 30, l: '1 month' }, { v: 60, l: '2 months' }, { v: 90, l: '3 months' },
                        { v: 180, l: '6 months' }, { v: 365, l: '1 year' },
                      ].map(({ v, l }) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <button onClick={loadMonteCarlo} disabled={mcLoading}
                      className="btn-primary"
                      style={{ fontSize: '.72rem', padding: '.35rem .85rem', borderRadius: 9 }}>
                      {mcLoading ? 'Running…' : 'Run Blind Test'}
                    </button>
                  </div>
                </div>

                {mcError && !mcLoading && (
                  <div style={{ padding: '.75rem 1rem', background: 'rgba(232,64,64,.08)', border: '1px solid rgba(232,64,64,.2)', borderRadius: 12, color: '#FB7185', fontSize: '.85rem', marginBottom: '1rem' }}>
                    {mcError}
                  </div>
                )}

                {mcLoading && (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.75rem' }}>
                    Running {mcTrials} random window tests…
                  </div>
                )}

                {mcResult && !mcLoading && (() => {
                  const m = mcResult
                  const fP = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
                  const col = (v: number) => v >= 0 ? 'var(--green)' : 'var(--red)'

                  // Grade the strategy
                  const grade = m.beatRate >= 0.60 && m.medianExcess > 0 && m.medianSharpe >= 1
                    ? { label: 'Strong', color: 'var(--green)', bg: 'rgba(110,231,183,.1)' }
                    : m.beatRate >= 0.50 && m.medianSharpe >= 0.5
                    ? { label: 'Mixed', color: 'var(--gold)', bg: 'rgba(251,191,36,.1)' }
                    : { label: 'Weak', color: '#FB7185', bg: 'rgba(251,113,133,.1)' }

                  return (
                    <>
                      {/* Grade badge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '1rem' }}>
                        <span style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 800, padding: '.4rem .9rem', borderRadius: 10, background: grade.bg, color: grade.color, border: `1px solid ${grade.color}30` }}>
                          {grade.label}
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: 'var(--muted)' }}>
                          across {m.nTrials} random {mcWindow}-day windows
                        </span>
                      </div>

                      {/* Summary stats */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: '.6rem', marginBottom: '1.25rem' }}>
                        {[
                          { label: 'Beat Rate', value: (m.beatRate * 100).toFixed(0) + '%', color: m.beatRate >= 0.5 ? 'var(--green)' : 'var(--red)' },
                          { label: 'Median Return', value: fP(m.medianReturn), color: col(m.medianReturn) },
                          { label: 'Mean Return', value: fP(m.meanReturn), color: col(m.meanReturn) },
                          { label: 'Median Excess', value: fP(m.medianExcess), color: col(m.medianExcess) },
                          { label: 'Median Sharpe', value: m.medianSharpe.toFixed(2), color: m.medianSharpe >= 1 ? 'var(--green)' : m.medianSharpe >= 0.5 ? 'var(--gold)' : 'var(--red)' },
                          { label: 'Median DD', value: `-${m.medianDrawdown.toFixed(1)}%`, color: 'var(--red)' },
                          { label: '10th %ile', value: fP(m.p10Return), color: col(m.p10Return) },
                          { label: '90th %ile', value: fP(m.p90Return), color: col(m.p90Return) },
                        ].map(({ label, value, color }) => (
                          <div key={label} style={{ background: 'rgba(255,255,255,.02)', border: '1px solid var(--border)', borderRadius: 12, padding: '.7rem .85rem' }}>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.25rem' }}>{label.toUpperCase()}</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.95rem', fontWeight: 800, color }}>{value}</div>
                          </div>
                        ))}
                      </div>

                      {/* Distribution chart — bar chart of returns */}
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.5rem' }}>
                        RETURN DISTRIBUTION · {m.nTrials} WINDOWS · {mcWindow} DAYS EACH
                      </div>
                      <ResponsiveContainer width="100%" height={180}>
                        <AreaChart data={
                          (() => {
                            // Build histogram from returns
                            const returns = m.results.map(r => r.strategyReturn)
                            const min = Math.floor(Math.min(...returns) / 5) * 5
                            const max = Math.ceil(Math.max(...returns) / 5) * 5
                            const bins: Array<{ range: string; count: number; pct: number }> = []
                            for (let b = min; b < max; b += 5) {
                              const count = returns.filter(r => r >= b && r < b + 5).length
                              bins.push({ range: `${b}%`, count, pct: (count / returns.length) * 100 })
                            }
                            return bins
                          })()
                        } margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                          <defs>
                            <linearGradient id="mcGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#9482ff" stopOpacity={0.4} />
                              <stop offset="95%" stopColor="#9482ff" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="range" tick={{ fill: 'rgba(238,242,255,.28)', fontSize: 9, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: 'rgba(238,242,255,.28)', fontSize: 9, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                          <Tooltip contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 10 }} formatter={(v: unknown) => [`${Number(v).toFixed(1)}%`, 'of trials']} />
                          <Area type="monotone" dataKey="pct" stroke="#9482ff" strokeWidth={2} fill="url(#mcGrad)" dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>

                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', marginTop: '.5rem' }}>
                        Each window is a random slice of history — not a single cherry-picked period. This is a more honest test of whether the strategy works reliably.
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media(max-width:900px){
          .kpi-strip{grid-template-columns:repeat(3,1fr)!important}
          .tab-grid{grid-template-columns:1fr!important}
          .perf-grid{grid-template-columns:repeat(2,1fr)!important}
        }
        @media(max-width:600px){
          .kpi-strip{grid-template-columns:repeat(2,1fr)!important}
        }
      `}</style>
    </div>
  )
}
