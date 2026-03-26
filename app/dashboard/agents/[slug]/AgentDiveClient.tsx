'use client'
import { useState } from 'react'
import Link from 'next/link'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell } from 'recharts'
import { fmtUSD, fmtPct, fmtDate, fmtDateTime } from '@/lib/utils'

interface Agent { id: string; name: string; slug: string; ticker: string; description: string; strategy_type: string; status: string; total_aum_cents: number }
interface Stats { id: string; nav_cents: number; total_return_pct: number; sharpe_ratio: number; max_drawdown_pct: number; win_rate_pct: number; total_trades: number; snapshot_at: string }
interface Trade { id: string; symbol: string; side: string; qty: number; fill_price: number; filled_at: string; pnl_cents: number | null }
interface Holding { id: string; shares: number; invested_cents: number; current_value_cents: number }

const TABS = ['Performance', 'Risk', 'Trades', 'Auth'] as const
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

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto', minHeight: '100vh', fontFamily: 'var(--font-body)', color: '#E0E0E0' }}>
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
            {fmtUSD(nav * 100)}
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
          {/* NAV Chart */}
          {chartData.length > 1 && (
            <div style={{ background: '#0D1018', border: '1px solid #1a1f2e', borderRadius: '12px', padding: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1rem', fontWeight: 700, marginBottom: '1.5rem' }}>NAV Over Time</h2>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData}>
                  <XAxis dataKey="date" stroke="#666" style={{ fontSize: '.75rem' }} />
                  <YAxis stroke="#666" style={{ fontSize: '.75rem' }} />
                  <Tooltip contentStyle={{ background: '#0D1018', border: '1px solid #1a1f2e', borderRadius: '8px' }} />
                  <Area type="monotone" dataKey="nav" stroke="#E8AC20" fill="#E8AC20" fillOpacity={0.1} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Metrics grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
            {[
              { label: 'TOTAL RETURN', value: fmtPct(totalReturn), color: totalReturn >= 0 ? '#0EAD6E' : '#E84040' },
              { label: 'SHARPE RATIO', value: sharpe.toFixed(2), color: '#4A90E2' },
              { label: 'MAX DRAWDOWN', value: `-${maxDD.toFixed(1)}%`, color: '#E84040' },
              { label: 'WIN RATE', value: `${winRate.toFixed(1)}%`, color: '#0EAD6E' },
            ].map((m, i) => (
              <div key={i} style={{ background: '#0D1018', border: '1px solid #1a1f2e', borderRadius: '12px', padding: '1.5rem' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', letterSpacing: '.12em', color: '#666', marginBottom: '.75rem', textTransform: 'uppercase' }}>
                  {m.label}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, color: m.color }}>
                  {m.value}
                </div>
              </div>
            ))}
          </div>

          <div style={{ background: '#0D1018', border: '1px solid #1a1f2e', borderRadius: '12px', padding: '1.5rem' }}>
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1rem', fontWeight: 700, marginBottom: '1.5rem' }}>Statistics</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '2rem', fontFamily: 'var(--font-mono)', fontSize: '.9rem' }}>
              <div>
                <div style={{ color: '#666', marginBottom: '.5rem' }}>Total Trades</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{totalTrades}</div>
              </div>
              <div>
                <div style={{ color: '#666', marginBottom: '.5rem' }}>Total AUM</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{fmtUSD(agent.total_aum_cents)}</div>
              </div>
              <div>
                <div style={{ color: '#666', marginBottom: '.5rem' }}>Strategy</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{agent.strategy_type.replace('_', ' ').toUpperCase()}</div>
              </div>
              <div>
                <div style={{ color: '#666', marginBottom: '.5rem' }}>Status</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700, color: agent.status === 'active' ? '#0EAD6E' : '#E84040' }}>
                  {agent.status.toUpperCase()}
                </div>
              </div>
            </div>
          </div>

          {/* Return Distribution */}
          <div style={{ background: '#0D1018', border: '1px solid #1a1f2e', borderRadius: '12px', padding: '1.5rem' }}>
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1rem', fontWeight: 700, marginBottom: '1.5rem' }}>P&L Summary</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '2rem' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: '#666', marginBottom: '.5rem' }}>REALIZED P&L</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, color: totalRealizedPnL >= 0 ? '#0EAD6E' : '#E84040' }}>
                  {totalRealizedPnL >= 0 ? '+' : ''}{fmtUSD(totalRealizedPnL)}
                </div>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: '#666', marginBottom: '.5rem' }}>UNREALIZED P&L</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, color: totalUnrealizedPnL >= 0 ? '#0EAD6E' : '#E84040' }}>
                  {totalUnrealizedPnL >= 0 ? '+' : ''}{fmtUSD(totalUnrealizedPnL)}
                </div>
              </div>
            </div>
            {pnlDistribution.wins !== undefined || pnlDistribution.losses !== undefined ? (
              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontFamily: 'var(--font-mono)', fontSize: '.85rem' }}>
                  <div style={{ width: '12px', height: '12px', background: '#0EAD6E', borderRadius: '2px' }} />
                  <span>Winning Trades: {pnlDistribution.wins || 0}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontFamily: 'var(--font-mono)', fontSize: '.85rem' }}>
                  <div style={{ width: '12px', height: '12px', background: '#E84040', borderRadius: '2px' }} />
                  <span>Losing Trades: {pnlDistribution.losses || 0}</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {tab === 'Risk' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
          {/* Real Risk Metrics */}
          {[
            { label: 'VOLATILITY', value: volatility.toFixed(2), unit: '%', color: '#E8AC20' },
            { label: 'SORTINO RATIO', value: sortinoRatio.toFixed(2), color: '#4A90E2' },
            { label: 'CALMAR RATIO', value: calmarRatio.toFixed(2), color: '#0EAD6E' },
            { label: 'AVG TRADE P&L', value: fmtUSD(avgTradePnL), color: avgTradePnL >= 0 ? '#0EAD6E' : '#E84040' },
            { label: 'PROFIT FACTOR', value: profitFactor === Infinity ? '∞' : profitFactor.toFixed(2), color: profitFactor > 1 ? '#0EAD6E' : '#E84040' },
            { label: 'EXPOSURE', value: exposure.toFixed(1), unit: '%', color: '#4A90E2' },
          ].map((item, i) => (
            <div key={i} style={{ background: '#0D1018', border: '1px solid #1a1f2e', borderRadius: '12px', padding: '1.5rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', letterSpacing: '.12em', color: '#666', marginBottom: '.5rem', textTransform: 'uppercase' }}>
                {item.label}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 700, color: item.color, marginBottom: '.75rem' }}>
                {item.value}{item.unit || ''}
              </div>
            </div>
          ))}

          {/* Drawdown Chart */}
          <div style={{ background: '#0D1018', border: '1px solid #1a1f2e', borderRadius: '12px', padding: '1.5rem', gridColumn: '1 / -1' }}>
            <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1rem', fontWeight: 700, marginBottom: '1.5rem' }}>Drawdown Over Time</h3>
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={chartData}>
                  <XAxis dataKey="date" stroke="#666" style={{ fontSize: '.75rem' }} />
                  <YAxis stroke="#666" style={{ fontSize: '.75rem' }} />
                  <Tooltip contentStyle={{ background: '#0D1018', border: '1px solid #1a1f2e', borderRadius: '8px' }} />
                  <Area type="monotone" dataKey="dd" stroke="#E84040" fill="#E84040" fillOpacity={0.1} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Insufficient data</div>
            )}
          </div>
        </div>
      )}

      {tab === 'Trades' && (
        <div style={{ background: '#0D1018', border: '1px solid #1a1f2e', borderRadius: '12px', overflow: 'hidden' }}>
          {sortedTrades.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>No trades recorded</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: '.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1a1f2e', background: '#07090F' }}>
                  <th style={{ padding: '1rem', textAlign: 'left', color: '#666', fontWeight: 600, fontSize: '.7rem', letterSpacing: '.1em' }}>DATE</th>
                  <th style={{ padding: '1rem', textAlign: 'left', color: '#666', fontWeight: 600, fontSize: '.7rem', letterSpacing: '.1em' }}>SYMBOL</th>
                  <th style={{ padding: '1rem', textAlign: 'center', color: '#666', fontWeight: 600, fontSize: '.7rem', letterSpacing: '.1em' }}>SIDE</th>
                  <th style={{ padding: '1rem', textAlign: 'right', color: '#666', fontWeight: 600, fontSize: '.7rem', letterSpacing: '.1em' }}>QTY</th>
                  <th style={{ padding: '1rem', textAlign: 'right', color: '#666', fontWeight: 600, fontSize: '.7rem', letterSpacing: '.1em' }}>PRICE</th>
                  <th style={{ padding: '1rem', textAlign: 'right', color: '#666', fontWeight: 600, fontSize: '.7rem', letterSpacing: '.1em' }}>PNL</th>
                </tr>
              </thead>
              <tbody>
                {sortedTrades.map((t, i) => (
                  <tr key={t.id} style={{ borderBottom: i < sortedTrades.length - 1 ? '1px solid #1a1f2e' : 'none', background: i % 2 === 0 ? 'transparent' : '#0A0D14' }}>
                    <td style={{ padding: '1rem', color: '#999' }}>{fmtDateTime(t.filled_at)}</td>
                    <td style={{ padding: '1rem', color: '#E0E0E0', fontWeight: 600 }}>{t.symbol}</td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <span style={{ padding: '.25rem .6rem', background: t.side === 'buy' ? '#0EAD6E' : '#E84040', color: '#000', borderRadius: '4px', fontSize: '.7rem', fontWeight: 700 }}>
                        {t.side.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right', color: '#E0E0E0' }}>{t.qty.toFixed(4)}</td>
                    <td style={{ padding: '1rem', textAlign: 'right', color: '#E0E0E0' }}>{fmtUSD(t.fill_price * 100)}</td>
                    <td style={{ padding: '1rem', textAlign: 'right', color: t.pnl_cents === null ? '#999' : t.pnl_cents >= 0 ? '#0EAD6E' : '#E84040', fontWeight: 600 }}>
                      {t.pnl_cents === null ? '—' : (t.pnl_cents >= 0 ? '+' : '') + fmtUSD(t.pnl_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'Auth' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
          {/* Real Verification Metrics */}
          {[
            { label: 'TOTAL TRADES', value: trades.length.toString(), color: '#4A90E2', description: 'Total number of executed trades' },
            { label: 'DAYS ACTIVE', value: daysActive.toString(), color: '#E8AC20', description: 'Days between first and last trade' },
            { label: 'BEST TRADE', value: trades.length > 0 ? fmtUSD(Math.max(0, ...trades.map(t => t.pnl_cents || 0))) : '$0', color: '#0EAD6E', description: 'Maximum single trade profit' },
            { label: 'WORST TRADE', value: trades.length > 0 ? fmtUSD(Math.min(0, ...trades.map(t => t.pnl_cents || 0))) : '$0', color: '#E84040', description: 'Maximum single trade loss' },
            { label: 'AVG HOLD TIME', value: avgHoldTime > 0 ? `${avgHoldTime}h` : 'N/A', color: '#4A90E2', description: 'Average time holding a position' },
            { label: 'CONSECUTIVE WINS', value: consecutiveMetrics.wins.toString(), color: '#0EAD6E', description: `Max winning streak: ${consecutiveMetrics.wins} trades` },
          ].map((item, i) => (
            <div key={i} style={{ background: '#0D1018', border: '1px solid #1a1f2e', borderRadius: '12px', padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', letterSpacing: '.12em', color: '#666', textTransform: 'uppercase' }}>
                  {item.label}
                </div>
                <div style={{ width: '24px', height: '24px', background: item.color, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#000', fontSize: '.7rem' }}>
                  ✓
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, color: item.color, marginBottom: '.75rem' }}>
                {item.value}
              </div>
              <div style={{ fontSize: '.8rem', color: '#999', lineHeight: '1.4' }}>
                {item.description}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
