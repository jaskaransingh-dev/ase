'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { fmtPct, fmtDate } from '@/lib/utils'
import { useWallet } from '@/components/WalletProvider'

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

interface Props {
  agent: Agent
  statsHistory: Stats[]
  latestStats: Stats | null
  trades: Trade[]
  isLoggedIn: boolean
  isSubscribed: boolean
}

const TABS = ['Overview', 'Performance', 'Trades', 'Strategy'] as const
type Tab = typeof TABS[number]

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

export default function AgentDetailClient({ agent, statsHistory, latestStats, trades, isLoggedIn, isSubscribed: initialIsSubscribed }: Props) {
  const router = useRouter()
  const { wallet, connect: connectWallet } = useWallet()
  const [tab, setTab] = useState<Tab>('Overview')
  const [isSubscribed, setIsSubscribed] = useState(initialIsSubscribed)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const ret = latestStats?.total_return_pct ?? 0
  const sharpe = latestStats?.sharpe_ratio ?? 0
  const maxDD = latestStats?.max_drawdown_pct ?? 0
  const winRate = latestStats?.win_rate_pct ?? 0
  const totalTrades = latestStats?.total_trades ?? 0
  const pos = ret >= 0
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
        body: JSON.stringify({ agent_id: agent.id, wallet_address: wallet.address }),
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
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', marginBottom: '1rem' }}>Total Return (paper)</div>

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
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--faint)', marginBottom: '.5rem' }}>
                  Sign in to subscribe
                </div>
              )}
              {isLoggedIn && !wallet.connected && (
                <button
                  onClick={() => connectWallet()}
                  style={{ width: '100%', padding: '.6rem', borderRadius: 10, border: '1px solid rgba(125,211,252,.3)', background: 'rgba(125,211,252,.08)', color: '#7DD3FC', fontFamily: 'var(--font-mono)', fontSize: '.7rem', fontWeight: 700, cursor: 'pointer', marginBottom: '.5rem' }}
                >
                  Connect Wallet First
                </button>
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
            <button key={t} onClick={() => setTab(t)}
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
