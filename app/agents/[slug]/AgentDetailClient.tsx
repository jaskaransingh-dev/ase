'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { fmtUSD, fmtPct, fmtDateTime, fmtDate } from '@/lib/utils'
import RealtimePrice from '@/components/ui/realtime-price'
import OrderForm from '@/components/ui/order-form'

interface Agent { id: string; name: string; slug: string; ticker?: string; description: string; strategy_type: string; status: string; total_aum_cents: number }
interface Stats { id: string; nav_cents: number; bid_cents?: number; ask_cents?: number; total_return_pct: number; sharpe_ratio: number; max_drawdown_pct: number; win_rate_pct: number; total_trades: number; snapshot_at: string }
interface Trade { id: string; symbol: string; side: string; qty: number; fill_price: number; filled_at: string; pnl_cents: number }
interface Holding { id: string; shares: number; invested_cents: number; current_value_cents: number; entry_nav_cents: number }

interface Props {
  agent: Agent
  statsHistory: Stats[]
  latestStats: Stats | null
  trades: Trade[]
  userHolding: Holding | null
  walletBalance: number
  isLoggedIn: boolean
}

const TABS = ['Overview', 'Strategy', 'Risk', 'Ledger'] as const
type Tab = typeof TABS[number]

export default function AgentDetailClient({ agent, statsHistory, latestStats, trades, userHolding, walletBalance, isLoggedIn }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('Overview')
  const [showInvest, setShowInvest] = useState(false)
  const [showSell, setShowSell] = useState(false)
  const [investAmount, setInvestAmount] = useState('100')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const nav = latestStats?.nav_cents ?? 10000
  const ret = latestStats?.total_return_pct ?? 0
  const sharpe = latestStats?.sharpe_ratio ?? 0
  const maxDD = latestStats?.max_drawdown_pct ?? 0
  const winRate = latestStats?.win_rate_pct ?? 0
  const totalTrades = latestStats?.total_trades ?? 0
  const pos = ret >= 0

  const chartData = statsHistory.map(s => ({
    date: fmtDate(s.snapshot_at),
    nav: s.nav_cents / 100,
    ret: s.total_return_pct,
  }))

  // Only render the chart when there's real data — never show fake data
  const hasChartData = chartData.length > 1

  // Real annualized volatility from NAV history (std dev of daily returns × √365)
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

  async function handleInvest() {
    const cents = Math.round(parseFloat(investAmount) * 100)
    if (isNaN(cents) || cents < 1000) { setMsg('Minimum investment is $10'); return }
    if (cents > walletBalance) { setMsg('Insufficient credits'); return }
    setLoading(true)
    setMsg('')
    try {
      const res = await fetch('/api/holdings/invest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agent.id, amount_cents: cents }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMsg('Investment successful!')
      setShowInvest(false)
      setTimeout(() => router.refresh(), 1000)
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Error')
    }
    setLoading(false)
  }

  async function handleSell() {
    if (!userHolding) return
    setLoading(true)
    setMsg('')
    try {
      const res = await fetch('/api/holdings/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holding_id: userHolding.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMsg('Position closed. Credits returned.')
      setShowSell(false)
      setTimeout(() => router.refresh(), 1000)
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Error')
    }
    setLoading(false)
  }

  const strategyInfo: Record<string, string> = {
    momentum: 'Weekly rebalance targeting highest-momentum stocks from a curated watchlist. Position-size capped at 20% per holding.',
    mean_reversion: 'Enters when RSI drops below 30 on large-cap equities. Exits at RSI > 55 or +8% gain. Max 3 open positions.',
    trend_following: 'Classic 50/200 EMA crossover on SPY, QQQ, IWM. Long when 50-EMA is above 200-EMA, flat otherwise.',
  }

  return (
    <div style={{ padding: '2rem 2.5rem', maxWidth: 1100 }}>
      {/* Back */}
      <Link href="/agents" style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: 'var(--faint)', display: 'inline-flex', alignItems: 'center', gap: '.35rem', marginBottom: '1.5rem', transition: 'color .15s' }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--white)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--faint)'}>
        ← All Agents
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.5rem', flexWrap: 'wrap' }}>
            <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '1.8rem', fontWeight: 800 }}>{agent.name}</h1>
            <span className="pill pill-green">VERIFIED</span>
            <span className="tag">{agent.strategy_type.replace('_', ' ').toUpperCase()}</span>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '.9rem', lineHeight: 1.7, maxWidth: 560 }}>{agent.description}</p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <RealtimePrice agentId={agent.id} className="text-right" />
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.82rem', color: pos ? 'var(--green)' : 'var(--red)', marginTop: '.15rem' }}>{fmtPct(ret)} total return</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: 'var(--faint)', marginTop: '.2rem' }}>NAV per share (paper)</div>
        </div>
      </div>

      {/* KPI Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: '.6rem', marginBottom: '1.5rem' }} className="kpi-strip">
        {[
          { k: 'SHARPE', v: sharpe.toFixed(2) },
          { k: 'MAX DD', v: fmtPct(-maxDD, 1) },
          { k: 'WIN RATE', v: winRate.toFixed(0) + '%' },
          { k: 'TOTAL TRADES', v: totalTrades.toString() },
          { k: 'AUM', v: fmtUSD(agent.total_aum_cents) },
          { k: 'STATUS', v: agent.status.toUpperCase() },
        ].map(({ k, v }) => (
          <div key={k} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '.8rem 1rem', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', letterSpacing: '.08em', color: 'var(--faint)' }}>{k}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.9rem', fontWeight: 800, marginTop: '.3rem' }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '.5rem' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: '.95rem' }}>Performance (NAV/share)</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', marginTop: '.15rem' }}>PAPER TRADING · ILLUSTRATIVE DATA</div>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--muted)', display: 'flex', gap: '.75rem' }}>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: pos ? 'var(--green)' : 'var(--red)', marginRight: '.3rem' }} />Agent NAV</span>
          </div>
        </div>
        {hasChartData ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
              <XAxis dataKey="date" tick={{ fill: 'rgba(238,242,255,.28)', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: 'rgba(238,242,255,.28)', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
              <Tooltip contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 10, fontFamily: 'var(--font-mono)', fontSize: 11 }} labelStyle={{ color: 'var(--faint)' }} itemStyle={{ color: pos ? 'var(--green)' : 'var(--red)' }} formatter={(v: unknown) => [`$${Number(v).toFixed(2)}`, 'NAV']} />
              <Line type="monotone" dataKey="nav" stroke={pos ? '#0EAD6E' : '#E84040'} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--faint)', gap: '.5rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', letterSpacing: '.08em' }}>NO DATA YET</div>
            <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>NAV history will appear after the first cron run</div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '.25rem', padding: '.5rem .75rem', background: 'rgba(0,0,0,.2)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', fontWeight: 700, letterSpacing: '.04em', padding: '.45rem .75rem', borderRadius: 9, border: `1px solid ${tab === t ? 'rgba(232,172,32,.25)' : 'transparent'}`, color: tab === t ? 'var(--gold)' : 'var(--faint)', background: tab === t ? 'rgba(232,172,32,.08)' : 'transparent', cursor: 'pointer', transition: 'all .14s' }}>
              {t}
            </button>
          ))}
        </div>
        <div style={{ padding: '1.25rem' }}>
          {tab === 'Overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }} className="tab-grid">
              {[
                { title: 'Strategy Type', body: agent.strategy_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) },
                { title: 'Verified Status', body: 'Verified — methodology disclosure submitted, ledger format validated, and submission reviewed.' },
                { title: 'How It Works', body: strategyInfo[agent.strategy_type] || 'Systematic algorithmic strategy with defined entry and exit rules.' },
                { title: 'Performance Summary', body: `Sharpe: ${sharpe.toFixed(2)} · Max DD: ${fmtPct(-maxDD, 1)} · Win Rate: ${winRate.toFixed(0)}% · Total Trades: ${totalTrades}` },
              ].map(({ title, body }) => (
                <div key={title} style={{ background: 'rgba(255,255,255,.02)', border: '1px solid var(--border)', borderRadius: 12, padding: '.9rem 1rem' }}>
                  <h4 style={{ fontFamily: 'var(--font-head)', fontSize: '.9rem', fontWeight: 800, marginBottom: '.5rem' }}>{title}</h4>
                  <p style={{ fontSize: '.83rem', color: 'var(--muted)', lineHeight: 1.65 }}>{body}</p>
                </div>
              ))}
            </div>
          )}
          {tab === 'Strategy' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }} className="tab-grid">
              {[
                { title: 'Methodology', body: strategyInfo[agent.strategy_type] || 'Systematic strategy with defined rules.' },
                { title: 'Signal Sources', body: agent.strategy_type === 'momentum' ? '3-month return ranking · Volume filter · Equal-weight rebalancing' : agent.strategy_type === 'mean_reversion' ? 'RSI(14) oscillator · Price deviation from VWAP · Volume confirmation' : '50-day EMA · 200-day EMA · Daily price data' },
                { title: 'Risk Controls', body: 'Maximum 20-30% per position. Sell-lock during open orders. Daily position check. Stop-loss via close rules.' },
                { title: 'Edge Decay Risks', body: 'Structural market shifts, crowded factor exposure, regime changes, and execution constraints can erode historical edges.' },
              ].map(({ title, body }) => (
                <div key={title} style={{ background: 'rgba(255,255,255,.02)', border: '1px solid var(--border)', borderRadius: 12, padding: '.9rem 1rem' }}>
                  <h4 style={{ fontFamily: 'var(--font-head)', fontSize: '.9rem', fontWeight: 800, marginBottom: '.5rem' }}>{title}</h4>
                  <p style={{ fontSize: '.83rem', color: 'var(--muted)', lineHeight: 1.65 }}>{body}</p>
                </div>
              ))}
            </div>
          )}
          {tab === 'Risk' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '1rem' }} className="tab-grid">
                {[
                  {
                    title: 'Risk Snapshot',
                    body: annualizedVolPct != null
                      ? `Annualized Vol: ${annualizedVolPct.toFixed(1)}% · Max Drawdown: ${fmtPct(-maxDD, 1)} · Sharpe: ${sharpe.toFixed(2)}`
                      : statsHistory.length < 3
                        ? 'Insufficient history — volatility will be calculated once 3+ NAV snapshots exist.'
                        : `Max Drawdown: ${fmtPct(-maxDD, 1)} · Sharpe: ${sharpe.toFixed(2)}`,
                  },
                  { title: 'Liquidity Risk', body: 'Paper trading uses real bid/ask spreads from Alpaca. Execution may differ from simulation in live markets.' },
                ].map(({ title, body }) => (
                  <div key={title} style={{ background: 'rgba(255,255,255,.02)', border: '1px solid var(--border)', borderRadius: 12, padding: '.9rem 1rem' }}>
                    <h4 style={{ fontFamily: 'var(--font-head)', fontSize: '.9rem', fontWeight: 800, marginBottom: '.5rem' }}>{title}</h4>
                    <p style={{ fontSize: '.83rem', color: 'var(--muted)', lineHeight: 1.65 }}>{body}</p>
                  </div>
                ))}
              </div>
              <div style={{ background: 'rgba(255,255,255,.02)', border: '1px solid var(--border)', borderRadius: 12, padding: '.9rem 1rem' }}>
                <h4 style={{ fontFamily: 'var(--font-head)', fontSize: '.9rem', fontWeight: 800, marginBottom: '.75rem' }}>Strategy Characteristics</h4>
                {(() => {
                  const regimeMap: Record<string, { label: string; desc: string; color: string }[]> = {
                    crypto_momentum: [
                      { label: 'Strong trends', desc: 'Thrives when price makes sustained directional moves with volume confirmation', color: 'var(--green)' },
                      { label: 'Choppy / sideways', desc: 'Struggles — crossovers whipsaw and generate false signals', color: 'var(--red)' },
                      { label: 'High volatility', desc: 'Mixed — large moves can trigger entries but also stop-losses quickly', color: 'var(--gold)' },
                    ],
                    crypto_mean_reversion: [
                      { label: 'Sideways / ranging', desc: 'Ideal — oversold bounces happen frequently with clear reversion targets', color: 'var(--green)' },
                      { label: 'Strong uptrend', desc: 'Risky — RSI oversold may not lead to reversion, trend resumes', color: 'var(--red)' },
                      { label: 'High volatility', desc: 'Challenging — wide Bollinger bands delay %B entry signals', color: 'var(--gold)' },
                    ],
                    momentum: [
                      { label: 'Bull market', desc: 'Excellent — momentum factor historically strongest in rising markets', color: 'var(--green)' },
                      { label: 'Bear market', desc: 'Poor — all stocks fall together, momentum factor weakens', color: 'var(--red)' },
                      { label: 'Low volatility', desc: 'Good — steady rotations into leading names with minimal noise', color: 'var(--green)' },
                    ],
                    mean_reversion: [
                      { label: 'Ranging / sideways', desc: 'Best fit — RSI extremes reliably mark short-term turning points', color: 'var(--green)' },
                      { label: 'Trending market', desc: 'Difficult — RSI < 30 may keep falling in a momentum-driven selloff', color: 'var(--red)' },
                      { label: 'High volatility', desc: 'Mixed — larger swings create better entry points but wider stops', color: 'var(--gold)' },
                    ],
                    trend_following: [
                      { label: 'Strong trend', desc: 'Optimal — 50/200 EMA crossover captures sustained directional moves', color: 'var(--green)' },
                      { label: 'Choppy / sideways', desc: 'Poorly — frequent crossovers produce whipsaw losses', color: 'var(--red)' },
                      { label: 'Slow-moving market', desc: 'Neutral — remains positioned correctly but few signals fire', color: 'var(--gold)' },
                    ],
                  }
                  const regimes = regimeMap[agent.strategy_type] || [
                    { label: 'Trending markets', desc: 'Strategy is designed for directional price movement', color: 'var(--green)' },
                    { label: 'Range-bound markets', desc: 'May produce mixed results in sideways conditions', color: 'var(--gold)' },
                  ]
                  return regimes.map(({ label, desc, color }) => (
                    <div key={label} style={{ marginBottom: '.75rem', paddingBottom: '.75rem', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.2rem' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />
                        <span style={{ fontSize: '.82rem', fontWeight: 700 }}>{label}</span>
                      </div>
                      <p style={{ fontSize: '.78rem', color: 'var(--muted)', lineHeight: 1.5, paddingLeft: '1.2rem' }}>{desc}</p>
                    </div>
                  ))
                })()}
              </div>
            </div>
          )}
          {tab === 'Ledger' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.75rem', flexWrap: 'wrap', gap: '.5rem' }}>
                <div style={{ fontWeight: 800, fontSize: '.9rem' }}>Recent Trades ({agent.name})</div>
                <span className="pill" style={{ fontSize: '.58rem' }}>PAPER TRADING</span>
              </div>
              {trades.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: '.88rem', padding: '1.5rem', textAlign: 'center' }}>No trades recorded yet — agent may be waiting for market conditions.</div>
              ) : (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr .6fr 1fr 1fr .8fr', gap: '.5rem', padding: '.35rem .55rem', fontFamily: 'var(--font-mono)', fontSize: '.58rem', letterSpacing: '.08em', color: 'var(--faint)', borderBottom: '1px solid var(--border)' }}>
                    <span>DATE</span><span>SIDE</span><span>SYMBOL</span><span>FILL</span><span>P&L</span>
                  </div>
                  {trades.map(t => {
                    const pnlPos = (t.pnl_cents ?? 0) >= 0
                    return (
                      <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '1fr .6fr 1fr 1fr .8fr', gap: '.5rem', padding: '.45rem .55rem', fontFamily: 'var(--font-mono)', fontSize: '.7rem', background: 'rgba(0,0,0,.2)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: '.25rem' }}>
                        <span style={{ color: 'var(--muted)' }}>{fmtDateTime(t.filled_at)}</span>
                        <span style={{ color: t.side === 'buy' ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{t.side.toUpperCase()}</span>
                        <span style={{ fontWeight: 600 }}>{t.symbol}</span>
                        <span>{fmtUSD(Math.round(t.fill_price * 100))}</span>
                        <span style={{ color: pnlPos ? 'var(--green)' : 'var(--red)' }}>{t.pnl_cents != null ? fmtUSD(Math.abs(t.pnl_cents)) : '—'}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Invest / Sell panel */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 16, padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        {userHolding ? (
          <>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', letterSpacing: '.08em' }}>YOUR HOLDING</div>
              <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 800, marginTop: '.2rem' }}>{fmtUSD(userHolding.current_value_cents ?? userHolding.invested_cents)}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--muted)' }}>{userHolding.shares.toFixed(2)} shares</div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '.5rem' }}>
              <button onClick={() => setShowInvest(true)} className="btn-secondary" style={{ fontSize: '.85rem', padding: '.6rem 1rem' }}>Buy More</button>
              <button onClick={() => setShowSell(true)} className="btn-primary" style={{ fontSize: '.85rem', padding: '.6rem 1rem', background: 'var(--red)', color: '#fff' }}>Sell Position</button>
            </div>
          </>
        ) : (
          <>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', letterSpacing: '.08em' }}>CURRENT NAV</div>
              <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 800, marginTop: '.2rem' }}>{fmtUSD(nav)}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--muted)' }}>per share (paper)</div>
            </div>
            {isLoggedIn ? (
              <button onClick={() => setShowInvest(true)} className="btn-primary" style={{ marginLeft: 'auto', fontSize: '.88rem' }}>Invest →</button>
            ) : (
              <Link href="/signup" className="btn-primary" style={{ marginLeft: 'auto', fontSize: '.88rem' }}>Sign Up to Invest →</Link>
            )}
          </>
        )}
      </div>

      {msg && (
        <div style={{ marginTop: '.75rem', padding: '.75rem 1rem', background: msg.includes('successful') || msg.includes('closed') ? 'rgba(14,173,110,.08)' : 'rgba(232,64,64,.08)', border: `1px solid ${msg.includes('successful') || msg.includes('closed') ? 'rgba(14,173,110,.2)' : 'rgba(232,64,64,.2)'}`, borderRadius: 10, fontSize: '.88rem', color: msg.includes('successful') || msg.includes('closed') ? 'var(--green)' : 'var(--red)' }}>
          {msg}
        </div>
      )}

      {/* Invest Modal */}
      {showInvest && (
        <Modal title="Invest in Agent" onClose={() => setShowInvest(false)}>
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--faint)', marginBottom: '.45rem', letterSpacing: '.08em' }}>AVAILABLE CREDITS</div>
            <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.4rem', fontWeight: 800, color: 'var(--gold)' }}>{fmtUSD(walletBalance)}</div>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--faint)', marginBottom: '.45rem', letterSpacing: '.08em' }}>INVEST AMOUNT ($)</label>
            <input type="number" value={investAmount} onChange={e => setInvestAmount(e.target.value)} min="10" max={walletBalance / 100} step="any" className="input-base" />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--faint)', marginTop: '.35rem' }}>
              ≈ {(parseFloat(investAmount || '0') / (nav / 100)).toFixed(2)} shares at {fmtUSD(nav)}/share
            </div>
          </div>
          <div style={{ padding: '.75rem 1rem', background: 'rgba(232,172,32,.05)', border: '1px solid rgba(232,172,32,.12)', borderRadius: 10, fontSize: '.82rem', color: 'var(--muted)', marginBottom: '1.25rem' }}>
            Note: This is a paper trading simulation. No real funds are invested.
          </div>
          <button onClick={handleInvest} disabled={loading} className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
            {loading ? <><span className="spinner" />Investing...</> : `Invest $${investAmount} →`}
          </button>
        </Modal>
      )}

      {/* Sell Modal */}
      {showSell && userHolding && (
        <Modal title="Close Position" onClose={() => setShowSell(false)}>
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--faint)', marginBottom: '.45rem', letterSpacing: '.08em' }}>POSITION VALUE</div>
            <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.4rem', fontWeight: 800 }}>{fmtUSD(userHolding.current_value_cents ?? userHolding.invested_cents)}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--muted)', marginTop: '.25rem' }}>{userHolding.shares.toFixed(2)} shares · Cost basis {fmtUSD(userHolding.invested_cents)}</div>
          </div>
          <div style={{ padding: '.75rem 1rem', background: 'rgba(232,64,64,.05)', border: '1px solid rgba(232,64,64,.15)', borderRadius: 10, fontSize: '.82rem', color: 'var(--muted)', marginBottom: '1.25rem' }}>
            Credits will be returned to your wallet after the position closes.
          </div>
          <button onClick={handleSell} disabled={loading} style={{ width: '100%', justifyContent: 'center', background: 'var(--red)', color: '#fff', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '.92rem', padding: '.75rem', borderRadius: 12, border: 0, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? .5 : 1, display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            {loading ? <><span className="spinner" />Closing...</> : 'Close Position →'}
          </button>
        </Modal>
      )}

      {/* Order Form */}
      {isLoggedIn && (
        <div style={{ marginTop: '2rem' }}>
          <OrderForm 
            agent={{
              ...agent,
              ticker: agent.ticker || agent.slug.toUpperCase().replace('-', '').slice(0, 4)
            }} 
            currentPrice={latestStats ? {
              nav_cents: latestStats.nav_cents,
              bid_cents: latestStats.bid_cents || Math.round(latestStats.nav_cents * 0.9985),
              ask_cents: latestStats.ask_cents || Math.round(latestStats.nav_cents * 1.0015),
            } : null}
            onOrderPlaced={() => router.refresh()}
          />
        </div>
      )}

      <style>{`
        @media(max-width:768px){.kpi-strip{grid-template-columns:repeat(3,1fr)!important}.tab-grid{grid-template-columns:1fr!important}}
      `}</style>
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', backdropFilter: 'blur(6px)' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 20, padding: '2rem', maxWidth: 440, width: '100%', boxShadow: '0 40px 100px rgba(0,0,0,.8)', position: 'relative', animation: 'fadeUp .3s ease' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '1rem', right: '1rem', width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--surface)', color: 'var(--muted)', display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: '.75rem' }}>×</button>
        <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.2rem', fontWeight: 800, marginBottom: '1.5rem' }}>{title}</h2>
        {children}
      </div>
    </div>
  )
}
