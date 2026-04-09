'use client'
import React, { useState, useMemo, useCallback } from 'react'
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
interface Props {
  agent: Agent
  statsHistory: Stats[]
  latestStats: Stats | null
  trades: Trade[]
  isLoggedIn: boolean
  isSubscribed: boolean
  cachedBacktestStats: CachedBacktestStats | null
}

const TABS = ['Overview', 'Performance', 'Trades', 'Strategy', 'Backtest', 'Monte Carlo'] as const
type Tab = typeof TABS[number]

const strategyDescriptions: Record<string, string> = {
  momentum: 'Weekly rebalance targeting highest-momentum assets. Position-size capped per holding.',
  mean_reversion: 'Enters when RSI drops below oversold levels on large-cap assets. Exits on RSI recovery or profit target.',
  trend_following: 'Classic EMA crossover system. Long when fast EMA crosses above slow EMA, flat otherwise.',
  crypto_momentum: 'BTC/ETH momentum with EMA crossovers, MACD confirmation, and RSI filters.',
  crypto_mean_reversion: 'Statistical arbitrage using Bollinger Band and Z-score mean reversion.',
}

const strategyColor: Record<string, string> = {
  momentum: '#3b7eff',
  mean_reversion: '#16c784',
  trend_following: '#7c5cff',
  crypto_momentum: '#f59e0b',
  crypto_mean_reversion: '#06b6d4',
}

function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 9, padding: '.7rem .9rem' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '.25rem' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.95rem', fontWeight: 700, color: color ?? 'var(--white)', letterSpacing: '-.01em' }}>{value}</div>
    </div>
  )
}

export default function AgentDetailClient({ agent, statsHistory, latestStats, trades, isLoggedIn, isSubscribed: initialIsSubscribed, cachedBacktestStats }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('Overview')
  const [isSubscribed, setIsSubscribed] = useState(initialIsSubscribed)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  // Backtest state
  const [btResult, setBtResult] = useState<BacktestResult | null>(() => {
    if (!cachedBacktestStats) return null
    const c = cachedBacktestStats
    return { stats: c.stats, bars: c.equityCurve, buyHold: c.buyHoldCurve, symbol: c.symbol, period: c.period }
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
  const [mcWindow, setMcWindow] = useState(180)

  // Live perf state
  const [livePerformance, setLivePerformance] = useState<Record<string, BacktestResult | null>>({})
  const [liveLoading, setLiveLoading] = useState<Record<string, boolean>>({})
  const [liveErrors, setLiveErrors] = useState<Record<string, string>>({})

  const loadLivePerformance = useCallback(async (period: string) => {
    if (!agent.id) return
    setLiveLoading(prev => ({ ...prev, [period]: true }))
    setLiveErrors(prev => ({ ...prev, [period]: '' }))
    try {
      const res = await fetch(`/api/agent-backtest-history?agent_id=${agent.id}&period=${period}`)
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? 'Fetch failed')
      if (data.data && data.data.length > 0) {
        const h = data.data[0]
        setLivePerformance(prev => ({ ...prev, [period]: { symbol: h.symbol, period: h.period, stats: h.stats, bars: h.equityCurve || [], buyHold: h.buyHoldCurve || [] } }))
      } else if (agent.primary_symbol && agent.backtest_strategy) {
        const fallback = await fetch('/api/backtest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: agent.primary_symbol, strategy: agent.backtest_strategy, period }) })
        const fb = await fallback.json()
        if (!fallback.ok || fb.error) throw new Error(fb.error ?? 'Fetch failed')
        setLivePerformance(prev => ({ ...prev, [period]: fb as BacktestResult }))
      }
    } catch (e) {
      setLiveErrors(prev => ({ ...prev, [period]: e instanceof Error ? e.message : 'Error' }))
    } finally {
      setLiveLoading(prev => ({ ...prev, [period]: false }))
    }
  }, [agent.id, agent.primary_symbol, agent.backtest_strategy])

  React.useEffect(() => {
    if (agent.id) ['5y', '2y', '1y'].forEach(p => loadLivePerformance(p))
  }, [agent.id, loadLivePerformance])

  async function loadBacktest(period = btPeriod) {
    if (!agent.primary_symbol || !agent.backtest_strategy) { setBtError('No backtest configuration.'); return }
    setBtLoading(true); setBtError('')
    try {
      const res = await fetch('/api/backtest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: agent.primary_symbol, strategy: agent.backtest_strategy, period }) })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? 'Backtest failed')
      setBtResult(data as BacktestResult)
    } catch (e) { setBtError(e instanceof Error ? e.message : 'Error') }
    finally { setBtLoading(false) }
  }

  async function loadMonteCarlo() {
    if (!agent.primary_symbol || !agent.backtest_strategy) { setMcError('No backtest config.'); return }
    setMcLoading(true); setMcError('')
    try {
      const res = await fetch('/api/backtest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: agent.primary_symbol, strategy: agent.backtest_strategy, period: '10y', monteCarlo: true, nTrials: mcTrials, windowDays: mcWindow, seed: 42 }) })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? 'MC failed')
      setMcResult(data.monteCarlo as MCSummary)
    } catch (e) { setMcError(e instanceof Error ? e.message : 'Error') }
    finally { setMcLoading(false) }
  }

  async function refreshBacktestStats() {
    setBtRefreshing(true)
    try {
      await fetch('/api/cron/run-backtests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_id: agent.id }) })
      router.refresh()
    } finally { setBtRefreshing(false) }
  }

  function handleTabChange(t: Tab) {
    setTab(t)
    if (t === 'Backtest' && !btResult && !btLoading) loadBacktest()
    if (t === 'Monte Carlo' && !mcResult && !mcLoading) loadMonteCarlo()
  }

  async function handleSubscribe() {
    if (!isLoggedIn) { router.push('/login'); return }
    setLoading(true); setMsg('')
    try {
      const res = await fetch('/api/subscriptions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_id: agent.id }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setIsSubscribed(true); setMsg('Subscribed successfully.')
      router.refresh()
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : 'Failed') }
    setLoading(false)
  }

  async function handleUnsubscribe() {
    setLoading(true); setMsg('')
    try {
      const res = await fetch('/api/subscriptions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_id: agent.id }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setIsSubscribed(false); setMsg('Unsubscribed.')
      router.refresh()
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : 'Error') }
    setLoading(false)
  }

  const bt = cachedBacktestStats?.stats
  const ret = latestStats?.total_return_pct ?? bt?.totalReturnPct ?? 0
  const sharpe = latestStats?.sharpe_ratio ?? bt?.sharpeRatio ?? 0
  const maxDD = latestStats?.max_drawdown_pct ?? bt?.maxDrawdownPct ?? 0
  const winRate = latestStats?.win_rate_pct ?? bt?.winRate ?? 0
  const totalTrades = latestStats?.total_trades ?? bt?.totalTrades ?? 0
  const pos = ret >= 0
  const hasBacktestData = !!cachedBacktestStats
  const monthlyFee = agent.monthly_fee_cents ?? 0
  const subscribers = agent.subscriber_count ?? 0
  const sColor = strategyColor[agent.strategy_type] ?? 'var(--muted)'

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

  // Chart data from backtest (cached) or live stats
  const perfChartData = useMemo(() => {
    if (cachedBacktestStats?.equityCurve?.length) {
      const step = Math.max(1, Math.floor(cachedBacktestStats.equityCurve.length / 200))
      return cachedBacktestStats.equityCurve
        .filter((_, i) => i % step === 0)
        .map(p => ({ date: p.date.slice(5), value: p.equity, bh: 0 }))
    }
    return statsHistory.map(s => ({ date: fmtDate(s.snapshot_at), value: s.nav_cents / 100, bh: 0 }))
  }, [cachedBacktestStats, statsHistory])

  const chartColor = pos ? '#16c784' : '#f23645'

  const fP = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
  const col = (v: number) => v >= 0 ? 'var(--green)' : 'var(--red)'

  return (
    <div style={{ padding: '1.75rem 2rem', maxWidth: 1300, margin: '0 auto' }}>

      {/* Back */}
      <Link href="/agents" style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--faint)', display: 'inline-flex', alignItems: 'center', gap: '.3rem', marginBottom: '1.25rem', letterSpacing: '.04em' }}>
        &larr; AGENTS
      </Link>

      {/* Alerts */}
      {agent.alert_level === 'yellow' && (
        <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 10, padding: '.7rem 1rem', marginBottom: '1rem', color: 'var(--amber)', fontSize: '.82rem', fontFamily: 'var(--font-mono)' }}>
          WARNING: Agent is {agent.drawdown_pct?.toFixed(1)}% below peak NAV. Monitor closely.
        </div>
      )}
      {agent.alert_level === 'hard' && (
        <div style={{ background: 'rgba(242,54,69,.08)', border: '1px solid rgba(242,54,69,.25)', borderRadius: 10, padding: '.7rem 1rem', marginBottom: '1rem', color: 'var(--red)', fontSize: '.82rem', fontFamily: 'var(--font-mono)' }}>
          HARD ALERT: 40%+ drawdown. Agent under review. Subscriptions paused.
        </div>
      )}

      {/* Header: two-column */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1.5rem', alignItems: 'start', marginBottom: '1.25rem' }} className="detail-header-grid">

        {/* Left: Agent info */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.65rem', flexWrap: 'wrap', marginBottom: '.6rem' }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: `${sColor}14`, border: `1px solid ${sColor}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', fontWeight: 700, color: sColor }}>
                {(agent.primary_symbol ?? 'XX').split('-')[0].slice(0, 3)}
              </span>
            </div>
            <div>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-.025em', lineHeight: 1.1 }}>{agent.name}</h1>
              <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', marginTop: '.25rem', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--faint)', letterSpacing: '.04em' }}>
                  {agent.primary_symbol ?? 'MULTI'}
                </span>
                <span style={{ color: 'var(--faint)', fontSize: '.55rem' }}>·</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', letterSpacing: '.06em', padding: '.12rem .45rem', borderRadius: 4, background: `${sColor}12`, color: sColor, border: `1px solid ${sColor}25` }}>
                  {agent.strategy_type.replace(/_/g, ' ').toUpperCase()}
                </span>
                <span style={{ color: 'var(--faint)', fontSize: '.55rem' }}>·</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--green)', letterSpacing: '.06em', padding: '.12rem .45rem', borderRadius: 4, background: 'rgba(22,199,132,.08)', border: '1px solid rgba(22,199,132,.2)' }}>
                  VERIFIED
                </span>
              </div>
            </div>
          </div>
          <p style={{ fontSize: '.85rem', color: 'var(--muted)', lineHeight: 1.65, maxWidth: 580, marginBottom: '.75rem' }}>{agent.description}</p>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: 'var(--faint)' }}>
            {subscribers} subscribers&nbsp;&nbsp;·&nbsp;&nbsp;{monthlyFee === 0 ? 'Free during beta' : `$${(monthlyFee / 100).toFixed(0)}/mo`}
          </div>
        </div>

        {/* Right: Subscribe panel */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem', position: 'sticky', top: 72 }}>
          {/* Return display */}
          <div style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.25rem' }}>
              {hasBacktestData && !latestStats ? `${cachedBacktestStats!.period.toUpperCase()} BACKTEST RETURN` : 'TOTAL RETURN'}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.75rem', fontWeight: 700, color: pos ? 'var(--green)' : 'var(--red)', letterSpacing: '-.02em' }}>
              {fP(ret)}
            </div>
            {hasBacktestData && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', marginTop: '.15rem' }}>
                {cachedBacktestStats!.symbol} · computed {new Date(cachedBacktestStats!.computed_at).toLocaleDateString()}
              </div>
            )}
          </div>

          {/* Quick stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem', marginBottom: '1rem' }}>
            {[
              { k: 'Sharpe', v: sharpe.toFixed(2) },
              { k: 'Max DD', v: fP(-maxDD) },
              { k: 'Win %', v: winRate.toFixed(0) + '%' },
              { k: 'Trades', v: totalTrades.toString() },
            ].map(({ k, v }) => (
              <div key={k} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 7, padding: '.45rem .6rem' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.1rem' }}>{k.toUpperCase()}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.78rem', fontWeight: 700 }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Subscribe CTA */}
          {isSubscribed ? (
            <div>
              <div style={{ background: 'rgba(22,199,132,.08)', border: '1px solid rgba(22,199,132,.2)', borderRadius: 9, padding: '.55rem .75rem', marginBottom: '.65rem', fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--green)', textAlign: 'center', letterSpacing: '.04em' }}>
                SUBSCRIBED
              </div>
              <button onClick={handleUnsubscribe} disabled={loading} style={{ width: '100%', padding: '.6rem', borderRadius: 9, border: '1px solid rgba(242,54,69,.25)', background: 'rgba(242,54,69,.06)', color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: '.68rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '.04em' }}>
                {loading ? 'PROCESSING' : 'UNSUBSCRIBE'}
              </button>
            </div>
          ) : (
            <div>
              {!isLoggedIn && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', marginBottom: '.6rem', textAlign: 'center' }}>
                  Sign in to subscribe
                </div>
              )}
              <button onClick={handleSubscribe} disabled={loading || agent.alert_level === 'hard'} style={{ width: '100%', padding: '.7rem', borderRadius: 9, border: 0, background: 'var(--blue)', color: '#fff', fontFamily: 'var(--font-head)', fontSize: '.85rem', fontWeight: 600, cursor: loading || agent.alert_level === 'hard' ? 'not-allowed' : 'pointer', opacity: agent.alert_level === 'hard' ? .4 : 1, transition: 'all .18s', letterSpacing: '-.01em' }}
                onMouseEnter={e => { if (!loading && agent.alert_level !== 'hard') (e.currentTarget as HTMLButtonElement).style.background = 'var(--blue2)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--blue)' }}
              >
                {loading ? 'Processing...' : monthlyFee === 0 ? 'Subscribe Free' : `Subscribe — $${(monthlyFee / 100).toFixed(0)}/mo`}
              </button>
            </div>
          )}

          {msg && (
            <div style={{ marginTop: '.55rem', fontFamily: 'var(--font-mono)', fontSize: '.62rem', textAlign: 'center', color: msg.toLowerCase().includes('failed') || msg.toLowerCase().includes('error') ? 'var(--red)' : 'var(--green)' }}>
              {msg}
            </div>
          )}

          {agent.signal_summary && (
            <div style={{ marginTop: '.85rem', paddingTop: '.85rem', borderTop: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--muted)', lineHeight: 1.5 }}>
              {agent.signal_summary}
            </div>
          )}
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: '.5rem', marginBottom: '1.25rem' }} className="kpi-strip">
        <StatCell label="Total Return" value={fP(ret)} color={pos ? 'var(--green)' : 'var(--red)'} />
        <StatCell label="Sharpe Ratio" value={sharpe.toFixed(2)} color={sharpe >= 1 ? 'var(--green)' : sharpe >= 0.5 ? 'var(--amber)' : 'var(--red)'} />
        <StatCell label="Max Drawdown" value={fP(-maxDD)} color="var(--red)" />
        <StatCell label="Win Rate" value={winRate.toFixed(1) + '%'} color={winRate >= 55 ? 'var(--green)' : winRate >= 45 ? 'var(--amber)' : 'var(--red)'} />
        <StatCell label="Total Trades" value={totalTrades.toString()} />
        <StatCell label="Ann. Volatility" value={annualizedVolPct !== null ? annualizedVolPct.toFixed(1) + '%' : 'N/A'} />
      </div>

      {/* Performance chart */}
      {perfChartData.length > 1 && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.1rem 1.25rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', gap: '.75rem', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '.88rem' }}>Performance</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--faint)', marginTop: '.12rem', letterSpacing: '.06em' }}>
                {hasBacktestData ? `BACKTEST · ${cachedBacktestStats!.symbol} · ${cachedBacktestStats!.period.toUpperCase()}` : 'LIVE NAV HISTORY'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
              <div style={{ width: 10, height: 2, background: chartColor, borderRadius: 2 }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', letterSpacing: '.08em' }}>STRATEGY</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={perfChartData} margin={{ top: 4, right: 8, bottom: 4, left: -12 }}>
              <defs>
                <linearGradient id="perfGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColor} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fill: 'var(--faint)', fontSize: 9, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: 'var(--faint)', fontSize: 9, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 9, fontFamily: 'var(--font-mono)', fontSize: 10 }} labelStyle={{ color: 'var(--faint)' }} formatter={(v: unknown) => [`$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, 'Value']} />
              <Area type="monotone" dataKey="value" stroke={chartColor} strokeWidth={1.8} fill="url(#perfGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabs */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        {/* Tab bar */}
        <div style={{ display: 'flex', gap: '.15rem', padding: '.5rem .65rem', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,.15)', overflowX: 'auto' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => handleTabChange(t)} style={{
              fontFamily: 'var(--font-mono)', fontSize: '.62rem', fontWeight: 600, letterSpacing: '.05em',
              padding: '.4rem .8rem', borderRadius: 7, whiteSpace: 'nowrap',
              border: `1px solid ${tab === t ? 'rgba(59,127,255,.3)' : 'transparent'}`,
              color: tab === t ? 'var(--blue2)' : 'var(--faint)',
              background: tab === t ? 'rgba(59,127,255,.08)' : 'transparent',
              cursor: 'pointer', transition: 'all .14s',
            }}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        <div style={{ padding: '1.25rem' }}>

          {/* -- OVERVIEW -- */}
          {tab === 'Overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }} className="tab-grid">
              {[
                { title: 'Strategy', body: agent.strategy_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) + ' — ' + (strategyDescriptions[agent.strategy_type] || 'Systematic algorithmic strategy.') },
                { title: 'Verification', body: 'Methodology disclosure submitted, ledger format validated, out-of-sample test passed. Real-time execution on paper trading infrastructure.' },
                { title: 'Execution', body: 'Trades execute on Alpaca paper trading. Position signals delivered in real-time to subscribers. P&L tracked per account.' },
                { title: 'Subscription Terms', body: monthlyFee === 0 ? 'Free during beta. Connect wallet for future on-chain settlement. Cancel anytime.' : `$${(monthlyFee / 100).toFixed(2)}/month. Cancel anytime. Wallet optional.` },
              ].map(({ title, body }) => (
                <div key={title} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '1rem 1.1rem' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', fontWeight: 600, letterSpacing: '.1em', color: 'var(--blue2)', marginBottom: '.45rem', textTransform: 'uppercase' }}>{title}</div>
                  <p style={{ fontSize: '.82rem', color: 'var(--muted)', lineHeight: 1.65 }}>{body}</p>
                </div>
              ))}
            </div>
          )}

          {/* -- PERFORMANCE -- */}
          {tab === 'Performance' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '.6rem', marginBottom: '1.25rem' }} className="perf-grid">
                {[
                  { label: 'Total Return', value: fP(ret), color: col(ret) },
                  { label: 'Sharpe Ratio', value: sharpe.toFixed(2), color: sharpe >= 1 ? 'var(--green)' : sharpe >= 0.5 ? 'var(--amber)' : 'var(--red)' },
                  { label: 'Max Drawdown', value: fP(-maxDD), color: 'var(--red)' },
                  { label: 'Win Rate', value: winRate.toFixed(1) + '%', color: winRate >= 55 ? 'var(--green)' : 'var(--red)' },
                  { label: 'Total Trades', value: totalTrades.toString(), color: 'var(--white)' },
                  { label: 'Ann. Volatility', value: annualizedVolPct !== null ? annualizedVolPct.toFixed(1) + '%' : 'N/A', color: 'var(--white)' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '.8rem 1rem' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.2rem' }}>{label.toUpperCase()}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.05rem', fontWeight: 700, color }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Period breakdown */}
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.6rem', textTransform: 'uppercase' }}>Backtested Period Breakdown</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '.6rem' }}>
                {['5y', '2y', '1y'].map(period => {
                  const perf = livePerformance[period]
                  const isLoading = liveLoading[period]
                  return (
                    <div key={period} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '.85rem 1rem' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.35rem' }}>
                        {period === '5y' ? '5 YEARS' : period === '2y' ? '2 YEARS' : '1 YEAR'}
                      </div>
                      {isLoading ? (
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', color: 'var(--faint)' }}>Loading...</div>
                      ) : perf ? (
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 700, color: perf.stats.totalReturnPct >= 0 ? 'var(--green)' : 'var(--red)', marginBottom: '.3rem' }}>
                            {fP(perf.stats.totalReturnPct)}
                          </div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: 'var(--muted)', lineHeight: 1.55 }}>
                            Sharpe {perf.stats.sharpeRatio.toFixed(2)} · DD {fP(-perf.stats.maxDrawdownPct)} · W {perf.stats.winRate.toFixed(0)}%
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', color: 'var(--faint)' }}>No data</div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* -- TRADES -- */}
          {tab === 'Trades' && (
            <div>
              {trades.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.68rem', letterSpacing: '.08em' }}>
                  NO TRADES RECORDED
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: '.72rem' }}>
                    <thead>
                      <tr>
                        {['Symbol', 'Side', 'Qty', 'Fill Price', 'P&L', 'Date'].map(h => (
                          <th key={h} style={{ padding: '.5rem .75rem', textAlign: 'left', color: 'var(--faint)', fontWeight: 600, fontSize: '.58rem', letterSpacing: '.08em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h.toUpperCase()}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map((t, i) => {
                        const pnl = t.pnl_cents ?? 0
                        return (
                          <tr key={t.id} style={{ borderBottom: i < trades.length - 1 ? '1px solid rgba(30,55,100,.2)' : 'none' }}>
                            <td style={{ padding: '.5rem .75rem', fontWeight: 700, color: 'var(--white)' }}>{t.symbol}</td>
                            <td style={{ padding: '.5rem .75rem', color: t.side === 'buy' ? 'var(--green)' : 'var(--red)', fontWeight: 700, textTransform: 'uppercase' }}>{t.side}</td>
                            <td style={{ padding: '.5rem .75rem', color: 'var(--muted)' }}>{t.qty}</td>
                            <td style={{ padding: '.5rem .75rem', color: 'var(--muted)' }}>${t.fill_price.toFixed(2)}</td>
                            <td style={{ padding: '.5rem .75rem', color: pnl > 0 ? 'var(--green)' : pnl < 0 ? 'var(--red)' : 'var(--faint)' }}>
                              {pnl !== 0 ? `${pnl > 0 ? '+' : ''}$${(pnl / 100).toFixed(2)}` : '—'}
                            </td>
                            <td style={{ padding: '.5rem .75rem', color: 'var(--faint)', whiteSpace: 'nowrap' }}>{new Date(t.filled_at).toLocaleDateString()}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* -- STRATEGY -- */}
          {tab === 'Strategy' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }} className="tab-grid">
              {[
                { title: 'Logic', body: strategyDescriptions[agent.strategy_type] || 'Systematic strategy with defined entry and exit signals based on technical indicators.' },
                { title: 'Execution Infrastructure', body: 'Trades execute on Alpaca paper trading. Signals delivered in real-time. Live crypto execution available on supported pairs.' },
                { title: 'Risk Management', body: 'Max drawdown circuit breaker at 40%. Position sizing enforced per signal. Verified via out-of-sample testing and Deflated Sharpe Ratio analysis.' },
                { title: 'On-Chain Settlement (Planned)', body: 'ERC-3643 tokenized shares, Chainlink price feeds, and on-chain settlement planned for Phase 2. Current subscriptions tracked off-chain.' },
              ].map(({ title, body }) => (
                <div key={title} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '1rem 1.1rem' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', fontWeight: 600, letterSpacing: '.1em', color: 'var(--blue2)', marginBottom: '.45rem', textTransform: 'uppercase' }}>{title}</div>
                  <p style={{ fontSize: '.82rem', color: 'var(--muted)', lineHeight: 1.65 }}>{body}</p>
                </div>
              ))}
            </div>
          )}

          {/* -- BACKTEST -- */}
          {tab === 'Backtest' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '.5rem' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: 'var(--faint)', letterSpacing: '.06em' }}>
                  {agent.primary_symbol ?? '—'} · {agent.backtest_strategy?.replace(/_/g, ' ') ?? '—'}
                </div>
                <div style={{ display: 'flex', gap: '.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button onClick={refreshBacktestStats} disabled={btRefreshing} style={{ padding: '.3rem .65rem', borderRadius: 7, fontSize: '.62rem', fontFamily: 'var(--font-mono)', border: '1px solid rgba(22,199,132,.2)', background: 'rgba(22,199,132,.06)', color: btRefreshing ? 'var(--faint)' : 'var(--green)', cursor: btRefreshing ? 'default' : 'pointer', letterSpacing: '.04em' }}>
                    {btRefreshing ? 'UPDATING' : 'REFRESH'}
                  </button>
                  {(['1y', '2y', '5y'] as const).map(p => (
                    <button key={p} onClick={() => { setBtPeriod(p); setBtResult(null); loadBacktest(p) }} style={{ padding: '.3rem .65rem', borderRadius: 7, fontSize: '.65rem', fontFamily: 'var(--font-mono)', border: `1px solid ${btPeriod === p ? 'rgba(59,127,255,.35)' : 'var(--border)'}`, background: btPeriod === p ? 'rgba(59,127,255,.08)' : 'transparent', color: btPeriod === p ? 'var(--blue2)' : 'var(--faint)', cursor: 'pointer' }}>
                      {p.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {btLoading && <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.68rem', letterSpacing: '.08em' }}>RUNNING BACKTEST</div>}
              {btError && !btLoading && <div style={{ padding: '.75rem 1rem', background: 'rgba(242,54,69,.08)', border: '1px solid rgba(242,54,69,.2)', borderRadius: 10, color: 'var(--red)', fontSize: '.82rem', fontFamily: 'var(--font-mono)' }}>{btError}</div>}

              {btResult && !btLoading && (() => {
                const bs = btResult.stats
                const step = Math.max(1, Math.floor(btResult.bars.length / 250))
                const cd = btResult.bars.filter((_, i) => i % step === 0).map((b, i) => ({ date: b.date.slice(5), strategy: Math.round(b.equity), buyHold: Math.round(btResult.buyHold[Math.min(i * step, btResult.buyHold.length - 1)]?.equity ?? 0) }))
                return (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: '.5rem', marginBottom: '1.1rem' }}>
                      {[
                        { label: 'Total Return', value: fP(bs.totalReturnPct), color: col(bs.totalReturnPct) },
                        { label: 'Ann. Return', value: fP(bs.annualizedReturnPct), color: col(bs.annualizedReturnPct) },
                        { label: 'Sharpe', value: bs.sharpeRatio.toFixed(2), color: bs.sharpeRatio >= 1 ? 'var(--green)' : bs.sharpeRatio >= 0 ? 'var(--amber)' : 'var(--red)' },
                        { label: 'Max DD', value: `-${bs.maxDrawdownPct.toFixed(2)}%`, color: 'var(--red)' },
                        { label: 'Win Rate', value: bs.winRate.toFixed(1) + '%', color: bs.winRate >= 50 ? 'var(--green)' : 'var(--red)' },
                        { label: 'Trades', value: String(bs.totalTrades), color: 'var(--white)' },
                        { label: 'Best Trade', value: fP(bs.bestTradePct), color: 'var(--green)' },
                        { label: 'Worst Trade', value: fP(bs.worstTradePct), color: 'var(--red)' },
                        { label: 'Calmar', value: bs.calmarRatio.toFixed(2), color: col(bs.calmarRatio) },
                      ].map(({ label, value, color }) => (
                        <div key={label} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 9, padding: '.65rem .8rem' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.2rem' }}>{label.toUpperCase()}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.9rem', fontWeight: 700, color }}>{value}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.5rem' }}>
                      EQUITY CURVE · $100K INITIAL · {btResult.symbol} · {btResult.period.toUpperCase()}
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={cd} margin={{ top: 4, right: 8, bottom: 4, left: -12 }}>
                        <defs>
                          <linearGradient id="btStratGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--blue)" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="var(--blue)" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="btBhGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--muted)" stopOpacity={0.12} />
                            <stop offset="95%" stopColor="var(--muted)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" tick={{ fill: 'var(--faint)', fontSize: 9, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                        <YAxis tick={{ fill: 'var(--faint)', fontSize: 9, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                        <Tooltip contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 9, fontFamily: 'var(--font-mono)', fontSize: 10 }} formatter={(v: unknown, name: unknown) => [`$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, name === 'strategy' ? 'Strategy' : 'Buy & Hold']} />
                        <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--faint)' }} />
                        <Area type="monotone" dataKey="buyHold" stroke="var(--muted)" strokeWidth={1} fill="url(#btBhGrad)" dot={false} name="buyHold" />
                        <Area type="monotone" dataKey="strategy" stroke="var(--blue)" strokeWidth={1.8} fill="url(#btStratGrad)" dot={false} name="strategy" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </>
                )
              })()}
            </div>
          )}

          {/* -- MONTE CARLO -- */}
          {tab === 'Monte Carlo' && (
            <div>
              <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.3rem' }}>TRIALS</div>
                  <input type="number" value={mcTrials} onChange={e => setMcTrials(Number(e.target.value))} min={10} max={500} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 7, padding: '.4rem .65rem', color: 'var(--white)', fontFamily: 'var(--font-mono)', fontSize: '.78rem', width: 80, outline: 'none' }} />
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.3rem' }}>WINDOW (DAYS)</div>
                  <input type="number" value={mcWindow} onChange={e => setMcWindow(Number(e.target.value))} min={60} max={365} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 7, padding: '.4rem .65rem', color: 'var(--white)', fontFamily: 'var(--font-mono)', fontSize: '.78rem', width: 90, outline: 'none' }} />
                </div>
                <button onClick={loadMonteCarlo} disabled={mcLoading} style={{ padding: '.5rem 1.1rem', borderRadius: 9, background: 'var(--blue)', color: '#fff', border: 0, fontFamily: 'var(--font-head)', fontSize: '.8rem', fontWeight: 600, cursor: mcLoading ? 'not-allowed' : 'pointer', opacity: mcLoading ? .6 : 1 }}>
                  {mcLoading ? 'Running...' : 'Run Monte Carlo'}
                </button>
              </div>

              {mcError && <div style={{ padding: '.75rem 1rem', background: 'rgba(242,54,69,.08)', border: '1px solid rgba(242,54,69,.2)', borderRadius: 10, color: 'var(--red)', fontSize: '.82rem', fontFamily: 'var(--font-mono)', marginBottom: '1rem' }}>{mcError}</div>}

              {mcResult && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: '.5rem', marginBottom: '1.1rem' }}>
                    {[
                      { label: 'Trials Run', value: mcResult.nTrials.toString(), color: 'var(--white)' },
                      { label: 'Median Return', value: fP(mcResult.medianReturn), color: col(mcResult.medianReturn) },
                      { label: 'Median Excess', value: fP(mcResult.medianExcess), color: col(mcResult.medianExcess) },
                      { label: 'Beat Market', value: (mcResult.beatRate * 100).toFixed(0) + '%', color: mcResult.beatRate >= 0.5 ? 'var(--green)' : 'var(--red)' },
                      { label: 'Median Sharpe', value: mcResult.medianSharpe.toFixed(2), color: mcResult.medianSharpe >= 1 ? 'var(--green)' : 'var(--muted)' },
                      { label: 'P10 Return', value: fP(mcResult.p10Return), color: col(mcResult.p10Return) },
                      { label: 'P90 Return', value: fP(mcResult.p90Return), color: col(mcResult.p90Return) },
                      { label: 'Median DD', value: fP(-mcResult.medianDrawdown), color: 'var(--red)' },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 9, padding: '.65rem .8rem' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.2rem' }}>{label.toUpperCase()}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.9rem', fontWeight: 700, color }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.5rem' }}>
                    TRIAL RETURNS DISTRIBUTION ({mcResult.nTrials} windows of {mcResult.windowDays}d)
                  </div>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={mcResult.results.sort((a, b) => a.strategyReturn - b.strategyReturn).map((r, i) => ({ i, strategy: +r.strategyReturn.toFixed(2), market: +r.marketReturn.toFixed(2) }))} margin={{ top: 4, right: 8, bottom: 4, left: -12 }}>
                      <XAxis dataKey="i" tick={false} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'var(--faint)', fontSize: 9, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                      <Tooltip contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 9, fontFamily: 'var(--font-mono)', fontSize: 10 }} formatter={(v: unknown, n: unknown) => [`${Number(v).toFixed(2)}%`, n === 'strategy' ? 'Strategy' : 'Market']} />
                      <Area type="monotone" dataKey="market" stroke="var(--muted)" strokeWidth={1} fill="rgba(120,140,180,.08)" dot={false} name="market" />
                      <Area type="monotone" dataKey="strategy" stroke="var(--blue)" strokeWidth={1.5} fill="rgba(59,127,255,.1)" dot={false} name="strategy" />
                    </AreaChart>
                  </ResponsiveContainer>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 820px) {
          .detail-header-grid { grid-template-columns: 1fr !important; }
          .kpi-strip { grid-template-columns: repeat(3,1fr) !important; }
          .tab-grid { grid-template-columns: 1fr !important; }
          .perf-grid { grid-template-columns: repeat(2,1fr) !important; }
        }
        @media (max-width: 520px) {
          .kpi-strip { grid-template-columns: repeat(2,1fr) !important; }
        }
      `}</style>
    </div>
  )
}
