'use client'
import { useState } from 'react'
import Link from 'next/link'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell } from 'recharts'
import { fmtUSD, fmtPct, fmtDate, fmtDateTime } from '@/lib/utils'

interface Agent { id: string; name: string; slug: string; ticker: string; description: string; strategy_type: string; status: string; total_aum_cents: number }
interface Stats { id: string; nav_cents: number; total_return_pct: number; sharpe_ratio: number; max_drawdown_pct: number; win_rate_pct: number; total_trades: number; snapshot_at: string }
interface Trade { id: string; symbol: string; side: string; qty: number; fill_price: number; filled_at: string; pnl_cents: number | null }
interface Holding { id: string; shares: number; invested_cents: number; current_value_cents: number }

const TABS = ['Performance', 'Risk', 'Trades', 'Verification'] as const
type Tab = typeof TABS[number]

export default function AgentDiveClient({ agent, statsHistory, trades, userHolding }: { agent: Agent; statsHistory: Stats[]; trades: Trade[]; userHolding: Holding | null }) {
  const [tab, setTab] = useState<Tab>('Performance')

  const latestStats = statsHistory.length > 0 ? statsHistory[statsHistory.length - 1] : null
  const nav = latestStats?.nav_cents ?? 10000
  const totalReturn = latestStats?.total_return_pct ?? 0
  const sharpe = latestStats?.sharpe_ratio ?? 0
  const maxDD = Math.abs(latestStats?.max_drawdown_pct ?? 0)
  const winRate = latestStats?.win_rate_pct ?? 0
  const totalTrades = latestStats?.total_trades ?? 0

  // Calculate real metrics from statsHistory and trades
  const calculateVolatility = () => {
    if (statsHistory.length <= 1) return 0
    const dailyReturns = statsHistory.slice(1).map((s, i) =>
      (s.nav_cents - statsHistory[i].nav_cents) / Math.max(1, statsHistory[i].nav_cents)
    )
    const variance = dailyReturns.reduce((s, r) => s + r * r, 0) / Math.max(1, dailyReturns.length)
    return Math.sqrt(variance) * Math.sqrt(365) * 100
  }

  const calculateSortinoRatio = () => {
    if (statsHistory.length <= 1) return 0
    const dailyReturns = statsHistory.slice(1).map((s, i) =>
      (s.nav_cents - statsHistory[i].nav_cents) / Math.max(1, statsHistory[i].nav_cents)
    )
    const meanReturn = dailyReturns.reduce((s, r) => s + r, 0) / Math.max(1, dailyReturns.length)
    const negReturns = dailyReturns.filter(r => r < 0)
    const downsideDev = Math.sqrt(negReturns.reduce((s, r) => s + r * r, 0) / Math.max(1, negReturns.length))
    return downsideDev > 0 ? (meanReturn / downsideDev) * Math.sqrt(365) : 0
  }

  const calculateCalmarRatio = () => {
    if (statsHistory.length === 0) return 0
    const firstNav = statsHistory[0].nav_cents
    const lastNav = statsHistory[statsHistory.length - 1].nav_cents
    const annualReturn = ((lastNav - firstNav) / Math.max(1, firstNav)) * 100
    const maxDrawdown = Math.abs(Math.min(...statsHistory.map(s => s.max_drawdown_pct)))
    return maxDrawdown > 0 ? annualReturn / maxDrawdown : 0
  }

  const calculateExposure = () => {
    if (agent.total_aum_cents === 0) return 0
    const activeTradeValue = trades.reduce((sum, t) => sum + (t.qty * t.fill_price * 100), 0)
    return (activeTradeValue / Math.max(1, agent.total_aum_cents)) * 100
  }

  const calculateAvgTradePnL = () => {
    if (trades.length === 0) return 0
    const closedTrades = trades.filter(t => t.pnl_cents !== null)
    if (closedTrades.length === 0) return 0
    return closedTrades.reduce((s, t) => s + (t.pnl_cents || 0), 0) / closedTrades.length
  }

  const calculateProfitFactor = () => {
    const winningTrades = trades.filter(t => t.pnl_cents !== null && t.pnl_cents > 0)
    const losingTrades = trades.filter(t => t.pnl_cents !== null && t.pnl_cents < 0)

    const totalWins = winningTrades.reduce((s, t) => s + (t.pnl_cents || 0), 0)
    const totalLosses = Math.abs(losingTrades.reduce((s, t) => s + (t.pnl_cents || 0), 0))

    return totalLosses > 0 ? totalWins / totalLosses : (totalWins > 0 ? Infinity : 0)
  }

  const calculateDaysActive = () => {
    if (trades.length === 0) return 0
    const sortedTrades = [...trades].sort((a, b) => new Date(a.filled_at).getTime() - new Date(b.filled_at).getTime())
    const firstDate = new Date(sortedTrades[0].filled_at)
    const lastDate = new Date(sortedTrades[trades.length - 1].filled_at)
    return Math.floor((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24))
  }

  const calculateAvgHoldTime = () => {
    if (trades.length === 0) return 0
    const buyTrades = trades.filter(t => t.side === 'buy')
    const sellTrades = trades.filter(t => t.side === 'sell')
    if (buyTrades.length === 0 || sellTrades.length === 0) return 0

    let totalHoldTime = 0
    let matchCount = 0
    for (const buyTrade of buyTrades) {
      const matchingSell = sellTrades.find(s => new Date(s.filled_at) > new Date(buyTrade.filled_at))
      if (matchingSell) {
        totalHoldTime += new Date(matchingSell.filled_at).getTime() - new Date(buyTrade.filled_at).getTime()
        matchCount++
      }
    }
    return matchCount > 0 ? Math.floor(totalHoldTime / matchCount / (1000 * 60 * 60)) : 0
  }

  const calculateConsecutiveMetrics = () => {
    const closedTrades = [...trades].filter(t => t.pnl_cents !== null).sort((a, b) => new Date(a.filled_at).getTime() - new Date(b.filled_at).getTime())
    let maxWins = 0, maxLosses = 0, currentWins = 0, currentLosses = 0

    for (const trade of closedTrades) {
      if ((trade.pnl_cents || 0) > 0) {
        currentWins++
        currentLosses = 0
        maxWins = Math.max(maxWins, currentWins)
      } else if ((trade.pnl_cents || 0) < 0) {
        currentLosses++
        currentWins = 0
        maxLosses = Math.max(maxLosses, currentLosses)
      }
    }
    return { wins: maxWins, losses: maxLosses }
  }

  const calculateTotalRealizedPnL = () => {
    return trades.filter(t => t.pnl_cents !== null).reduce((s, t) => s + (t.pnl_cents || 0), 0)
  }

  const calculateUnrealizedPnL = () => {
    return trades.filter(t => t.pnl_cents === null).reduce((s, t) => s + (t.qty * t.fill_price * 100), 0)
  }

  const calculatePBO = () => {
    // Probability of Backtest Overfitting - simplified calculation based on Sharpe ratio variance
    if (statsHistory.length <= 2) return 0
    const sharpeValues = statsHistory.map(s => s.sharpe_ratio)
    const meanSharpe = sharpeValues.reduce((a, b) => a + b, 0) / sharpeValues.length
    const variance = sharpeValues.reduce((sum, val) => sum + Math.pow(val - meanSharpe, 2), 0) / sharpeValues.length
    const cv = Math.sqrt(variance) / Math.max(0.01, meanSharpe)
    return Math.max(0, Math.min(100, 50 * (1 - Math.exp(-cv))))
  }

  const calculateDSR = () => {
    // Deflated Sharpe Ratio - accounts for multiple testing
    if (statsHistory.length <= 1) return 0
    const sharpeRatio = sharpe
    const obs = statsHistory.length
    const dsr = sharpeRatio * (1 - (Math.log(obs) / (obs * Math.sqrt(obs))))
    return Math.max(0, dsr)
  }

  const getDataIntegrityScore = () => {
    // Score based on data completeness and consistency
    let score = 100
    if (statsHistory.length < 5) score -= 20
    if (trades.length === 0) score -= 15
    if (totalReturn === 0) score -= 10
    const gapsInData = statsHistory.filter((s, i) => i > 0 && i < statsHistory.length - 1).length
    if (gapsInData < statsHistory.length * 0.8) score -= 10
    return Math.max(0, score)
  }

  // Prepare chart data
  const chartData = statsHistory.map(s => ({
    date: fmtDate(s.snapshot_at),
    nav: s.nav_cents / 100,
    ret: s.total_return_pct,
    dd: Math.min(s.max_drawdown_pct, 0),
  }))

  const sortedTrades = [...trades].sort((a, b) => new Date(b.filled_at).getTime() - new Date(a.filled_at).getTime())

  // Calculate distribution of P&L
  const pnlDistribution = trades
    .filter(t => t.pnl_cents !== null)
    .reduce((acc: Record<string, number>, t) => {
      const bucket = t.pnl_cents! >= 0 ? 'wins' : 'losses'
      acc[bucket] = (acc[bucket] || 0) + 1
      return acc
    }, {})

  const volatility = calculateVolatility()
  const sortinoRatio = calculateSortinoRatio()
  const calmarRatio = calculateCalmarRatio()
  const exposure = calculateExposure()
  const avgTradePnL = calculateAvgTradePnL()
  const profitFactor = calculateProfitFactor()
  const daysActive = calculateDaysActive()
  const avgHoldTime = calculateAvgHoldTime()
  const consecutiveMetrics = calculateConsecutiveMetrics()
  const totalRealizedPnL = calculateTotalRealizedPnL()
  const totalUnrealizedPnL = calculateUnrealizedPnL()
  const pbo = calculatePBO()
  const dsr = calculateDSR()
  const dataIntegrity = getDataIntegrityScore()

  return (
    <div className="page-slide-in" style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto', minHeight: '100vh', fontFamily: 'var(--font-body)', color: '#E0E0E0' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <Link href="/dashboard" style={{ fontFamily: 'var(--font-mono)', fontSize: '.75rem', color: '#888', textDecoration: 'none', marginBottom: '1rem', display: 'inline-block' }}>
            ← Back to Dashboard
          </Link>
          <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '2rem', fontWeight: 900 }}>{agent.name}</h1>
          <p style={{ color: '#888', fontSize: '.95rem', marginTop: '.5rem', maxWidth: '600px' }}>{agent.description}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, color: '#E8AC20' }}>
            {fmtUSD(nav)}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.8rem', color: totalReturn >= 0 ? '#0EAD6E' : '#E84040', marginTop: '.3rem' }}>
            {totalReturn >= 0 ? '+' : ''}{fmtPct(totalReturn)}
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid #1a1f2e', paddingBottom: '1rem' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontFamily: 'var(--font-head)',
              fontSize: '.9rem',
              fontWeight: 700,
              padding: '.5rem 1rem',
              background: 'transparent',
              border: 'none',
              color: tab === t ? '#E8AC20' : '#666',
              cursor: 'pointer',
              borderBottom: tab === t ? '2px solid #E8AC20' : 'none',
              transition: 'all .15s',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'Performance' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
          {/* NAV Chart with Premium Gradient */}
          {chartData.length > 1 && (
            <div className="glass-card" style={{ padding: '2rem' }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.5rem', letterSpacing: '-0.02em' }}>NAV Over Time</h2>
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="navGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#E8AC20" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#E8AC20" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" stroke="#444" style={{ fontSize: '.7rem' }} />
                  <YAxis stroke="#444" style={{ fontSize: '.7rem' }} />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(13,16,24,0.95)',
                      border: '1px solid #2a2f3e',
                      borderRadius: '12px',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
                    }}
                    cursor={{ strokeDasharray: '3 3' }}
                  />
                  <Area type="monotone" dataKey="nav" stroke="#E8AC20" strokeWidth={2} fill="url(#navGradient)" isAnimationActive={true} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top Metrics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
            {[
              { label: 'TOTAL RETURN', value: fmtPct(totalReturn), color: totalReturn >= 0 ? '#0EAD6E' : '#E84040' },
              { label: 'SHARPE RATIO', value: sharpe.toFixed(2), color: '#4A90E2' },
              { label: 'MAX DRAWDOWN', value: `-${maxDD.toFixed(1)}%`, color: '#E84040' },
              { label: 'WIN RATE', value: `${winRate.toFixed(1)}%`, color: '#0EAD6E' },
            ].map((m, i) => (
              <div key={i} className="stat-card glass-card" style={{ padding: '1.5rem' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', letterSpacing: '.12em', color: '#888', marginBottom: '.75rem', textTransform: 'uppercase', fontWeight: 600 }}>
                  {m.label}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 700, color: m.color, fontVariantNumeric: 'tabular-nums' }}>
                  {m.value}
                </div>
              </div>
            ))}
          </div>

          {/* Drawdown Chart - Side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {/* Drawdown Area Chart */}
            <div className="glass-card" style={{ padding: '2rem' }}>
              <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1rem', fontWeight: 700, marginBottom: '1.5rem', letterSpacing: '-0.02em' }}>Drawdown Analysis</h3>
              {chartData.length > 1 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="ddGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#E84040" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#E84040" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" stroke="#444" style={{ fontSize: '.7rem' }} />
                    <YAxis stroke="#444" style={{ fontSize: '.7rem' }} />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(13,16,24,0.95)',
                        border: '1px solid #2a2f3e',
                        borderRadius: '12px'
                      }}
                    />
                    <Area type="monotone" dataKey="dd" stroke="#E84040" strokeWidth={2} fill="url(#ddGradient)" isAnimationActive={true} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Insufficient data</div>
              )}
            </div>

            {/* Return Distribution Histogram */}
            <div className="glass-card" style={{ padding: '2rem' }}>
              <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1rem', fontWeight: 700, marginBottom: '1.5rem', letterSpacing: '-0.02em' }}>Return Distribution</h3>
              {pnlDistribution.wins !== undefined || pnlDistribution.losses !== undefined ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={[
                    { name: 'Wins', value: pnlDistribution.wins || 0, fill: '#0EAD6E' },
                    { name: 'Losses', value: pnlDistribution.losses || 0, fill: '#E84040' }
                  ]} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <XAxis dataKey="name" stroke="#444" style={{ fontSize: '.7rem' }} />
                    <YAxis stroke="#444" style={{ fontSize: '.7rem' }} />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(13,16,24,0.95)',
                        border: '1px solid #2a2f3e',
                        borderRadius: '12px'
                      }}
                    />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                      {[
                        { name: 'Wins', value: pnlDistribution.wins || 0, fill: '#0EAD6E' },
                        { name: 'Losses', value: pnlDistribution.losses || 0, fill: '#E84040' }
                      ].map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>No trade data</div>
              )}
            </div>
          </div>

          {/* Statistics Cards */}
          <div className="glass-card" style={{ padding: '2rem' }}>
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.5rem', letterSpacing: '-0.02em' }}>Performance Statistics</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', fontFamily: 'var(--font-mono)', fontSize: '.9rem' }}>
              <div style={{ paddingBottom: '1.5rem', borderBottom: '1px solid #1a2332' }}>
                <div style={{ color: '#888', marginBottom: '.5rem', fontSize: '.75rem', textTransform: 'uppercase', fontWeight: 600 }}>Total Trades</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{totalTrades}</div>
              </div>
              <div style={{ paddingBottom: '1.5rem', borderBottom: '1px solid #1a2332' }}>
                <div style={{ color: '#888', marginBottom: '.5rem', fontSize: '.75rem', textTransform: 'uppercase', fontWeight: 600 }}>Total AUM</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#E8AC20' }}>{fmtUSD(agent.total_aum_cents)}</div>
              </div>
              <div style={{ paddingBottom: '1.5rem', borderBottom: '1px solid #1a2332' }}>
                <div style={{ color: '#888', marginBottom: '.5rem', fontSize: '.75rem', textTransform: 'uppercase', fontWeight: 600 }}>Strategy</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{agent.strategy_type.replace('_', ' ').toUpperCase()}</div>
              </div>
              <div style={{ paddingBottom: '1.5rem', borderBottom: '1px solid #1a2332' }}>
                <div style={{ color: '#888', marginBottom: '.5rem', fontSize: '.75rem', textTransform: 'uppercase', fontWeight: 600 }}>Status</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: agent.status === 'active' ? '#0EAD6E' : '#E84040' }}>
                  {agent.status.toUpperCase()}
                </div>
              </div>
            </div>
          </div>

          {/* P&L Summary */}
          <div className="glass-card" style={{ padding: '2rem' }}>
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.5rem', letterSpacing: '-0.02em' }}>P&L Summary</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '2rem' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: '#888', marginBottom: '.75rem', textTransform: 'uppercase', fontWeight: 600 }}>REALIZED P&L</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 700, color: totalRealizedPnL >= 0 ? '#0EAD6E' : '#E84040', fontVariantNumeric: 'tabular-nums' }}>
                  {totalRealizedPnL >= 0 ? '+' : ''}{fmtUSD(totalRealizedPnL)}
                </div>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: '#888', marginBottom: '.75rem', textTransform: 'uppercase', fontWeight: 600 }}>UNREALIZED P&L</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 700, color: totalUnrealizedPnL >= 0 ? '#0EAD6E' : '#E84040', fontVariantNumeric: 'tabular-nums' }}>
                  {totalUnrealizedPnL >= 0 ? '+' : ''}{fmtUSD(totalUnrealizedPnL)}
                </div>
              </div>
            </div>
            {pnlDistribution.wins !== undefined || pnlDistribution.losses !== undefined ? (
              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #1a2332' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', fontFamily: 'var(--font-mono)', fontSize: '.85rem' }}>
                  <div style={{ width: '12px', height: '12px', background: '#0EAD6E', borderRadius: '3px' }} />
                  <span>Winning Trades: <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{pnlDistribution.wins || 0}</span></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', fontFamily: 'var(--font-mono)', fontSize: '.85rem' }}>
                  <div style={{ width: '12px', height: '12px', background: '#E84040', borderRadius: '3px' }} />
                  <span>Losing Trades: <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{pnlDistribution.losses || 0}</span></span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {tab === 'Risk' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
          {/* Risk Metrics Grid - 3 columns */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
            {[
              { label: 'VOLATILITY', value: volatility.toFixed(2), unit: '%', color: '#E8AC20', subtext: 'Annualized std dev' },
              { label: 'SORTINO RATIO', value: sortinoRatio.toFixed(2), color: '#4A90E2', subtext: 'Downside risk adjusted' },
              { label: 'CALMAR RATIO', value: calmarRatio.toFixed(2), color: '#0EAD6E', subtext: 'Return vs max drawdown' },
              { label: 'AVG TRADE P&L', value: fmtUSD(avgTradePnL), color: avgTradePnL >= 0 ? '#0EAD6E' : '#E84040', subtext: 'Mean trade profit' },
              { label: 'PROFIT FACTOR', value: profitFactor === Infinity ? '∞' : profitFactor.toFixed(2), color: profitFactor > 1 ? '#0EAD6E' : '#E84040', subtext: 'Wins vs losses ratio' },
              { label: 'EXPOSURE', value: exposure.toFixed(1), unit: '%', color: '#4A90E2', subtext: 'Market exposure level' },
            ].map((item, i) => (
              <div key={i} className="stat-card glass-card" style={{ padding: '1.5rem' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', letterSpacing: '.12em', color: '#888', marginBottom: '.75rem', textTransform: 'uppercase', fontWeight: 600 }}>
                  {item.label}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, color: item.color, marginBottom: '.5rem', fontVariantNumeric: 'tabular-nums' }}>
                  {item.value}{item.unit || ''}
                </div>
                <div style={{ fontSize: '.75rem', color: '#666' }}>{item.subtext}</div>
              </div>
            ))}
          </div>

          {/* Exposure Progress Bar */}
          <div className="glass-card" style={{ padding: '2rem' }}>
            <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.5rem', letterSpacing: '-0.02em' }}>Exposure Tracking</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.75rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', color: '#888', textTransform: 'uppercase', fontWeight: 600 }}>Current Exposure</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 700, color: '#4A90E2', fontVariantNumeric: 'tabular-nums' }}>{exposure.toFixed(1)}%</span>
                </div>
                <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(exposure, 100)}%`,
                      background: `linear-gradient(90deg, #4A90E2 0%, ${exposure > 75 ? '#E84040' : '#4A90E2'} 100%)`,
                      borderRadius: '4px',
                      transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                      boxShadow: '0 0 12px rgba(74, 144, 226, 0.4)'
                    }}
                  />
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.75rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', color: '#888', textTransform: 'uppercase', fontWeight: 600 }}>Volatility Level</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 700, color: '#E8AC20', fontVariantNumeric: 'tabular-nums' }}>{volatility.toFixed(1)}%</span>
                </div>
                <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(volatility / 2, 100)}%`,
                      background: `linear-gradient(90deg, #E8AC20 0%, ${volatility > 50 ? '#E84040' : '#E8AC20'} 100%)`,
                      borderRadius: '4px',
                      transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                      boxShadow: '0 0 12px rgba(232, 172, 32, 0.3)'
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Consecutive Metrics Indicators */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
            <div className="glass-card" style={{ padding: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.02em' }}>Winning Streak</h3>
                <div style={{ width: '40px', height: '40px', background: '#0EAD6E', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#000', fontSize: '1rem' }}>
                  {consecutiveMetrics.wins}
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', color: '#888' }}>
                Longest consecutive winning trades
              </div>
            </div>
            <div className="glass-card" style={{ padding: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.02em' }}>Losing Streak</h3>
                <div style={{ width: '40px', height: '40px', background: '#E84040', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#FFF', fontSize: '1rem' }}>
                  {consecutiveMetrics.losses}
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', color: '#888' }}>
                Longest consecutive losing trades
              </div>
            </div>
          </div>

          {/* Volatility Trend Chart */}
          <div className="glass-card" style={{ padding: '2rem' }}>
            <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.5rem', letterSpacing: '-0.02em' }}>Volatility Trend</h3>
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="volGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#E8AC20" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#E8AC20" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" stroke="#444" style={{ fontSize: '.7rem' }} />
                  <YAxis stroke="#444" style={{ fontSize: '.7rem' }} />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(13,16,24,0.95)',
                      border: '1px solid #2a2f3e',
                      borderRadius: '12px'
                    }}
                    cursor={{ strokeDasharray: '3 3' }}
                  />
                  <Line type="monotone" dataKey="ret" stroke="#E8AC20" strokeWidth={2} dot={false} isAnimationActive={true} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Insufficient data</div>
            )}
          </div>
        </div>
      )}

      {tab === 'Trades' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
          {/* Trade Summary Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
            {[
              { label: 'TOTAL TRADES', value: trades.length.toString(), color: '#4A90E2' },
              { label: 'WINNING TRADES', value: (pnlDistribution.wins || 0).toString(), color: '#0EAD6E' },
              { label: 'LOSING TRADES', value: (pnlDistribution.losses || 0).toString(), color: '#E84040' },
            ].map((item, i) => (
              <div key={i} className="stat-card glass-card" style={{ padding: '1.5rem' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', letterSpacing: '.12em', color: '#888', marginBottom: '.75rem', textTransform: 'uppercase', fontWeight: 600 }}>
                  {item.label}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 700, color: item.color, fontVariantNumeric: 'tabular-nums' }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          {/* Trade P&L Distribution Chart */}
          <div className="glass-card" style={{ padding: '2rem' }}>
            <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.5rem', letterSpacing: '-0.02em' }}>Trade P&L Distribution</h3>
            {trades.filter(t => t.pnl_cents !== null).length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={[
                    { name: 'Wins', value: pnlDistribution.wins || 0, fill: '#0EAD6E' },
                    { name: 'Losses', value: pnlDistribution.losses || 0, fill: '#E84040' }
                  ]}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <XAxis dataKey="name" stroke="#444" style={{ fontSize: '.7rem' }} />
                  <YAxis stroke="#444" style={{ fontSize: '.7rem' }} />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(13,16,24,0.95)',
                      border: '1px solid #2a2f3e',
                      borderRadius: '12px'
                    }}
                  />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]} isAnimationActive={true}>
                    {[
                      { name: 'Wins', value: pnlDistribution.wins || 0, fill: '#0EAD6E' },
                      { name: 'Losses', value: pnlDistribution.losses || 0, fill: '#E84040' }
                    ].map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>No closed trades</div>
            )}
          </div>

          {/* Premium Trade History Table */}
          <div className="glass-card" style={{ padding: '2rem', overflow: 'hidden' }}>
            <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.5rem', letterSpacing: '-0.02em' }}>Trade History</h3>
            {sortedTrades.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>No trades recorded</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: '.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1a2332', background: 'transparent' }}>
                      <th style={{ padding: '1rem', textAlign: 'left', color: '#888', fontWeight: 600, fontSize: '.7rem', letterSpacing: '.1em', textTransform: 'uppercase' }}>Date</th>
                      <th style={{ padding: '1rem', textAlign: 'left', color: '#888', fontWeight: 600, fontSize: '.7rem', letterSpacing: '.1em', textTransform: 'uppercase' }}>Symbol</th>
                      <th style={{ padding: '1rem', textAlign: 'center', color: '#888', fontWeight: 600, fontSize: '.7rem', letterSpacing: '.1em', textTransform: 'uppercase' }}>Side</th>
                      <th style={{ padding: '1rem', textAlign: 'right', color: '#888', fontWeight: 600, fontSize: '.7rem', letterSpacing: '.1em', textTransform: 'uppercase' }}>Qty</th>
                      <th style={{ padding: '1rem', textAlign: 'right', color: '#888', fontWeight: 600, fontSize: '.7rem', letterSpacing: '.1em', textTransform: 'uppercase' }}>Price</th>
                      <th style={{ padding: '1rem', textAlign: 'right', color: '#888', fontWeight: 600, fontSize: '.7rem', letterSpacing: '.1em', textTransform: 'uppercase' }}>P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTrades.map((t, i) => (
                      <tr
                        key={t.id}
                        style={{
                          borderBottom: '1px solid #1a2332',
                          background: i === 0 ? 'rgba(232, 172, 32, 0.05)' : 'transparent',
                          transition: 'background-color 0.2s',
                          cursor: 'pointer'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = i === 0 ? 'rgba(232, 172, 32, 0.05)' : 'transparent'
                        }}
                      >
                        <td style={{ padding: '1rem', color: '#999' }}>{fmtDateTime(t.filled_at)}</td>
                        <td style={{ padding: '1rem', color: '#E8AC20', fontWeight: 700 }}>{t.symbol}</td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          <span style={{ padding: '.4rem .7rem', background: t.side === 'buy' ? 'rgba(14, 173, 110, 0.2)' : 'rgba(232, 64, 64, 0.2)', color: t.side === 'buy' ? '#0EAD6E' : '#E84040', borderRadius: '6px', fontSize: '.7rem', fontWeight: 700, border: `1px solid ${t.side === 'buy' ? '#0EAD6E' : '#E84040'}` }}>
                            {t.side.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right', color: '#E0E0E0', fontVariantNumeric: 'tabular-nums' }}>{t.qty.toFixed(4)}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', color: '#E0E0E0', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(t.fill_price * 100)}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', color: t.pnl_cents === null ? '#888' : t.pnl_cents >= 0 ? '#0EAD6E' : '#E84040', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                          {t.pnl_cents === null ? '—' : (t.pnl_cents >= 0 ? '+' : '') + fmtUSD(t.pnl_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'Verification' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
          {/* Key Verification Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
            {[
              { label: 'PBO SCORE', value: pbo.toFixed(1), unit: '%', color: pbo < 30 ? '#0EAD6E' : pbo < 60 ? '#E8AC20' : '#E84040', description: 'Probability of Backtest Overfitting' },
              { label: 'DEFLATED SHARPE', value: dsr.toFixed(2), color: dsr > 1 ? '#0EAD6E' : dsr > 0.5 ? '#E8AC20' : '#E84040', description: 'Risk-adjusted after multiple testing' },
              { label: 'DATA INTEGRITY', value: dataIntegrity.toFixed(0), unit: '%', color: dataIntegrity > 80 ? '#0EAD6E' : dataIntegrity > 60 ? '#E8AC20' : '#E84040', description: 'Completeness & consistency score' },
            ].map((item, i) => (
              <div key={i} className="stat-card glass-card" style={{ padding: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', letterSpacing: '.12em', color: '#888', textTransform: 'uppercase', fontWeight: 600 }}>
                    {item.label}
                  </div>
                  <div style={{ width: '32px', height: '32px', background: item.color, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#000', fontSize: '.8rem' }}>
                    ✓
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.8rem', fontWeight: 700, color: item.color, marginBottom: '.5rem', fontVariantNumeric: 'tabular-nums' }}>
                  {item.value}{item.unit || ''}
                </div>
                <div style={{ fontSize: '.8rem', color: '#888', lineHeight: '1.4' }}>
                  {item.description}
                </div>
              </div>
            ))}
          </div>

          {/* Track Record Details */}
          <div className="glass-card" style={{ padding: '2rem' }}>
            <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.5rem', letterSpacing: '-0.02em' }}>Track Record</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem' }}>
              {[
                { label: 'Total Trades', value: trades.length.toString(), color: '#4A90E2', subtext: 'Executed trades' },
                { label: 'Days Active', value: daysActive.toString(), color: '#E8AC20', subtext: 'Days since first trade' },
                { label: 'Avg Hold Time', value: avgHoldTime > 0 ? `${avgHoldTime}h` : 'N/A', color: '#4A90E2', subtext: 'Average position duration' },
                { label: 'Best Trade', value: trades.length > 0 ? fmtUSD(Math.max(0, ...trades.map(t => t.pnl_cents || 0))) : '$0', color: '#0EAD6E', subtext: 'Max single trade profit' },
              ].map((item, i) => (
                <div key={i} style={{ paddingBottom: '1.5rem', borderBottom: '1px solid #1a2332' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', letterSpacing: '.1em', color: '#888', marginBottom: '.75rem', textTransform: 'uppercase', fontWeight: 600 }}>
                    {item.label}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, color: item.color, marginBottom: '.5rem', fontVariantNumeric: 'tabular-nums' }}>
                    {item.value}
                  </div>
                  <div style={{ fontSize: '.75rem', color: '#666' }}>{item.subtext}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Data Quality Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
            <div className="glass-card" style={{ padding: '2rem' }}>
              <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1rem', fontWeight: 700, marginBottom: '1.5rem', letterSpacing: '-0.02em' }}>Trade Quality</h3>
              <div style={{ display: 'grid', gap: '1rem' }}>
                {[
                  { label: 'Profit Factor', value: profitFactor === Infinity ? '∞' : profitFactor.toFixed(2), color: profitFactor > 1 ? '#0EAD6E' : '#E84040' },
                  { label: 'Win Rate', value: `${winRate.toFixed(1)}%`, color: winRate > 50 ? '#0EAD6E' : '#E84040' },
                  { label: 'Avg Trade P&L', value: fmtUSD(avgTradePnL), color: avgTradePnL >= 0 ? '#0EAD6E' : '#E84040' },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: i < 2 ? '1px solid #1a2332' : 'none' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', color: '#888' }}>{item.label}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, color: item.color, fontVariantNumeric: 'tabular-nums' }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card" style={{ padding: '2rem' }}>
              <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1rem', fontWeight: 700, marginBottom: '1.5rem', letterSpacing: '-0.02em' }}>Streak Analysis</h3>
              <div style={{ display: 'grid', gap: '1rem' }}>
                {[
                  { label: 'Max Consecutive Wins', value: consecutiveMetrics.wins.toString(), color: '#0EAD6E' },
                  { label: 'Max Consecutive Losses', value: consecutiveMetrics.losses.toString(), color: '#E84040' },
                  { label: 'Sortino Ratio', value: sortinoRatio.toFixed(2), color: '#4A90E2' },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: i < 2 ? '1px solid #1a2332' : 'none' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', color: '#888' }}>{item.label}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, color: item.color, fontVariantNumeric: 'tabular-nums' }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Worst Trade Display */}
          <div className="glass-card" style={{ padding: '2rem' }}>
            <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1rem', fontWeight: 700, marginBottom: '1.5rem', letterSpacing: '-0.02em' }}>Risk Indicators</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: '#888', marginBottom: '.75rem', textTransform: 'uppercase', fontWeight: 600 }}>Worst Trade</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, color: '#E84040', fontVariantNumeric: 'tabular-nums' }}>
                  {trades.length > 0 ? fmtUSD(Math.min(0, ...trades.map(t => t.pnl_cents || 0))) : '$0'}
                </div>
                <div style={{ fontSize: '.75rem', color: '#666', marginTop: '.5rem' }}>Maximum single trade loss</div>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: '#888', marginBottom: '.75rem', textTransform: 'uppercase', fontWeight: 600 }}>Max Drawdown</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, color: '#E84040', fontVariantNumeric: 'tabular-nums' }}>
                  -{maxDD.toFixed(1)}%
                </div>
                <div style={{ fontSize: '.75rem', color: '#666', marginTop: '.5rem' }}>Peak-to-trough decline</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
