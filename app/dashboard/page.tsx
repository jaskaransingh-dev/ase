'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { fmtDateTime, fmtPct, fmtUSD } from '@/lib/utils'

export const dynamic = 'force-dynamic'

type Wallet = { balance_cents: number }
type Agent = { id: string; name: string; slug: string; ticker: string }
type Holding = {
  id: string
  agent_id: string
  shares: number
  invested_cents: number
  current_value_cents: number
  status: string
  agents: Agent
}
type AgentTrade = {
  id: string
  agent_id: string
  symbol: string
  side: string
  qty: number
  fill_price: number
  filled_at: string
  pnl_cents: number | null
  agents: Agent
}
type Transaction = { id: string; type: string; amount_cents: number; created_at: string }
type AgentActivity = {
  agent_id: string
  agent_name: string
  agent_ticker: string
  status: 'BUYING' | 'SELLING' | 'SCANNING' | 'OFFLINE'
  symbol: string
  last_trade_at: string
  side?: string
  signal_summary?: string
}

type ChartPoint = { label: string; value: number }
type Timeframe = '1D' | '1W' | '1M' | 'ALL'

const COLORS = ['#35C2A0', '#4E7FFF', '#FDAA5F', '#FF7A7A', '#B08CFF', '#6FD7F8']
const TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', 'ALL']

function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

function triggerHaptic(ms = 8) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(ms)
  }
}

function getStatusColor(status: AgentActivity['status']) {
  switch (status) {
    case 'BUYING':
      return '#35C2A0'
    case 'SELLING':
      return '#FF7A7A'
    case 'SCANNING':
      return '#FDBA4A'
    default:
      return '#707C97'
  }
}

export default function DashboardPage() {
  const supabase = createClient()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [trades, setTrades] = useState<AgentTrade[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [agentActivity, setAgentActivity] = useState<AgentActivity[]>([])
  const [timeframe, setTimeframe] = useState<Timeframe>('1W')

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      const [walletRes, holdingsRes, tradesRes, txnsRes, agentsRes] = await Promise.all([
        supabase.from('wallets').select('balance_cents').eq('user_id', user.id).single(),
        supabase.from('holdings').select('*, agents(id, name, slug, ticker)').eq('user_id', user.id).eq('status', 'active'),
        supabase.from('agent_trades').select('*, agents(id, name, slug, ticker)').order('filled_at', { ascending: false }).limit(35),
        supabase.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(12),
        supabase.from('agents').select('id, name, ticker, signal_summary, last_run_at').eq('status', 'active'),
      ])

      setWallet(walletRes.data)
      setHoldings(holdingsRes.data ?? [])
      setTrades(tradesRes.data ?? [])
      setTransactions(txnsRes.data ?? [])

      if (agentsRes.data && tradesRes.data) {
        const now = new Date()
        const tenMinutesAgo = new Date(now.getTime() - 10 * 60000)
        const staleCutoff = new Date(now.getTime() - 25 * 60000)

        const activityMap: Record<string, AgentActivity> = {}

        for (const agent of agentsRes.data) {
          const lastRun = agent.last_run_at ? new Date(agent.last_run_at) : null
          const isStale = !lastRun || lastRun < staleCutoff

          activityMap[agent.id] = {
            agent_id: agent.id,
            agent_name: agent.name,
            agent_ticker: agent.ticker,
            status: isStale ? 'OFFLINE' : 'SCANNING',
            symbol: '--',
            last_trade_at: '',
            signal_summary: agent.signal_summary ?? '',
          }
        }

        const tradesByAgent: Record<string, AgentTrade> = {}
        for (const trade of tradesRes.data) {
          if (!tradesByAgent[trade.agent_id]) {
            tradesByAgent[trade.agent_id] = trade
          }
        }

        for (const [agentId, trade] of Object.entries(tradesByAgent)) {
          if (!activityMap[agentId]) continue

          const tradeTime = new Date(trade.filled_at)
          if (tradeTime >= tenMinutesAgo) {
            activityMap[agentId].status = trade.side === 'buy' ? 'BUYING' : 'SELLING'
          }
          activityMap[agentId].symbol = trade.symbol
          activityMap[agentId].last_trade_at = trade.filled_at
          activityMap[agentId].side = trade.side
        }

        setAgentActivity(Object.values(activityMap))
      }

      setLoading(false)
    }

    void load()
  }, [router, supabase])

  const balance = wallet?.balance_cents ?? 0
  const activeHoldings = holdings
  const totalInvested = activeHoldings.reduce((sum, h) => sum + h.invested_cents, 0)
  const totalCurrentValue = activeHoldings.reduce((sum, h) => sum + (h.current_value_cents ?? h.invested_cents), 0)
  const totalReturn = totalCurrentValue - totalInvested
  const totalReturnPct = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0
  const totalNav = balance + totalCurrentValue

  const pnlTrades = useMemo(() => {
    return [...trades]
      .filter((trade) => trade.pnl_cents !== null)
      .sort((a, b) => new Date(a.filled_at).getTime() - new Date(b.filled_at).getTime())
  }, [trades])

  const fullSeries = useMemo<ChartPoint[]>(() => {
    if (pnlTrades.length > 1) {
      const totalPnl = pnlTrades.reduce((sum, trade) => sum + (trade.pnl_cents ?? 0), 0)
      const baseValue = totalNav - totalPnl
      let running = baseValue

      return pnlTrades.map((trade) => {
        running += trade.pnl_cents ?? 0
        return {
          label: new Date(trade.filled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          value: Math.max(running / 100, 0),
        }
      })
    }

    const points = 10
    return Array.from({ length: points }, (_, i) => {
      const drift = totalNav / 100 > 0 ? totalNav / 100 : 100
      const wiggle = Math.sin(i / 1.6) * drift * 0.015
      return {
        label: `T${i + 1}`,
        value: drift + wiggle,
      }
    })
  }, [pnlTrades, totalNav])

  const navSeries = useMemo(() => {
    const size =
      timeframe === '1D'
        ? 6
        : timeframe === '1W'
          ? 10
          : timeframe === '1M'
            ? 16
            : fullSeries.length

    return fullSeries.slice(-size)
  }, [fullSeries, timeframe])

  const chartData = activeHoldings.map((holding) => ({
    name: holding.agents?.name || 'Unknown',
    value: holding.current_value_cents ?? holding.invested_cents,
  }))

  const topHolding = useMemo(() => {
    if (!activeHoldings.length) return null
    return [...activeHoldings].sort(
      (a, b) => (b.current_value_cents ?? b.invested_cents) - (a.current_value_cents ?? a.invested_cents)
    )[0]
  }, [activeHoldings])

  const worstHolding = useMemo(() => {
    if (!activeHoldings.length) return null
    return [...activeHoldings]
      .map((holding) => {
        const current = holding.current_value_cents ?? holding.invested_cents
        const retPct = holding.invested_cents > 0 ? ((current - holding.invested_cents) / holding.invested_cents) * 100 : 0
        return { holding, retPct }
      })
      .sort((a, b) => a.retPct - b.retPct)[0]
  }, [activeHoldings])

  const liveStatuses = {
    buying: agentActivity.filter((agent) => agent.status === 'BUYING').length,
    selling: agentActivity.filter((agent) => agent.status === 'SELLING').length,
    scanning: agentActivity.filter((agent) => agent.status === 'SCANNING').length,
    offline: agentActivity.filter((agent) => agent.status === 'OFFLINE').length,
  }

  const buyTrades = trades.filter((trade) => trade.side === 'buy').length
  const sellTrades = trades.filter((trade) => trade.side === 'sell').length
  const buyPressure = buyTrades + sellTrades > 0 ? (buyTrades / (buyTrades + sellTrades)) * 100 : 50

  const avgPnlPct = pnlTrades.length
    ? pnlTrades.reduce((sum, trade) => sum + ((trade.pnl_cents ?? 0) >= 0 ? 1 : 0), 0) / pnlTrades.length
    : 0

  const concentrationPct = topHolding
    ? (((topHolding.current_value_cents ?? topHolding.invested_cents) / Math.max(totalCurrentValue, 1)) * 100)
    : 0

  const marketPulse = [
    { label: 'ASE Composite', value: fmtPct(totalReturnPct, 2), pos: totalReturn >= 0, detail: 'Portfolio-weighted performance' },
    { label: 'Buy Pressure', value: `${buyPressure.toFixed(0)}%`, pos: buyPressure >= 50, detail: `${buyTrades} buys vs ${sellTrades} sells` },
    {
      label: 'Live Agents',
      value: `${agentActivity.length - liveStatuses.offline}/${agentActivity.length || 1}`,
      pos: liveStatuses.offline === 0,
      detail: `${liveStatuses.scanning} scanning right now`,
    },
    {
      label: 'Execution Hit Rate',
      value: `${(avgPnlPct * 100).toFixed(0)}%`,
      pos: avgPnlPct >= 0.5,
      detail: 'Recent profitable trade ratio',
    },
  ]

  if (loading) {
    return (
      <div className="dashboard-v2 page-slide-in">
        <div className="dashboard-skeleton-grid">
          <div className="skeleton dashboard-skeleton-title" />
          <div className="dashboard-skeleton-stats">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="skeleton dashboard-skeleton-card" />
            ))}
          </div>
          <div className="skeleton dashboard-skeleton-main" />
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-v2 page-slide-in">
      <section className="market-strip-card">
        <div className="market-strip-head">
          <div>
            <div className="dashboard-chip">Market Pulse</div>
            <h1 className="dashboard-title">Trading Dashboard</h1>
          </div>
          <div className="dashboard-live-indicator">
            <span className="dashboard-live-dot" />
            LIVE FEED
          </div>
        </div>

        <div className="market-pulse-grid">
          {marketPulse.map((item) => (
            <div key={item.label} className="market-pulse-tile">
              <div className="market-pulse-label">{item.label}</div>
              <div className={`market-pulse-value ${item.pos ? 'is-pos' : 'is-neg'}`}>{item.value}</div>
              <div className="market-pulse-detail">{item.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="hero-nav-panel">
        <div>
          <div className="dashboard-chip">Portfolio NAV</div>
          <div className="hero-nav-value">{fmtUSD(totalNav)}</div>
          <div className={`hero-nav-change ${totalReturn >= 0 ? 'is-pos' : 'is-neg'}`}>
            {fmtPct(totalReturnPct, 2)} ({totalReturn >= 0 ? '+' : '-'}{fmtUSD(Math.abs(totalReturn))})
          </div>
        </div>

        <div className="hero-nav-right">
          <div className="timeframe-pills" role="tablist" aria-label="Chart timeframe">
            {TIMEFRAMES.map((option) => (
              <button
                key={option}
                className={`timeframe-pill ${timeframe === option ? 'is-active' : ''}`}
                onClick={() => {
                  triggerHaptic(10)
                  setTimeframe(option)
                }}
              >
                {option}
              </button>
            ))}
          </div>

          <div className="hero-action-row">
            <Link href="/dashboard/exchange" className="action-button-primary" onClick={() => triggerHaptic(12)}>
              Trade Agents
            </Link>
            <Link href="/dashboard/deposit" className="action-button-secondary" onClick={() => triggerHaptic(12)}>
              Add Funds
            </Link>
          </div>
        </div>
      </section>

      <section className="dashboard-main-grid">
        <div className="dashboard-left-column">
          <div className="exchange-card nav-chart-card">
            <div className="section-head">
              <h2>Portfolio Curve</h2>
              <span className="section-subtle">Derived from realized trade activity</span>
            </div>
            <div className="nav-chart-wrap">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={navSeries}>
                  <defs>
                    <linearGradient id="navArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#35C2A0" stopOpacity={0.38} />
                      <stop offset="95%" stopColor="#35C2A0" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    formatter={(value) => {
                      const numericValue = typeof value === 'number' ? value : Number(value ?? 0)
                      return [`$${numericValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'NAV']
                    }}
                    labelFormatter={(label) => `Time: ${label}`}
                    contentStyle={{
                      background: 'rgba(9, 14, 28, 0.95)',
                      border: '1px solid rgba(148, 163, 184, 0.35)',
                      borderRadius: '12px',
                      color: '#E6EEFF',
                      fontSize: '12px',
                    }}
                  />
                  <Area type="monotone" dataKey="value" stroke="#35C2A0" strokeWidth={2.2} fill="url(#navArea)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="exchange-card">
            <div className="section-head">
              <h2>Positions</h2>
              <span className="section-subtle">Modeled after pro watchlist tables</span>
            </div>

            {activeHoldings.length === 0 ? (
              <div className="empty-state-panel">
                <div className="empty-state-title">No open positions yet</div>
                <p>Start with a funded wallet, then allocate into verified agent pools.</p>
                <Link href="/dashboard/exchange" className="action-button-primary" onClick={() => triggerHaptic(12)}>
                  Explore Exchange
                </Link>
              </div>
            ) : (
              <div className="positions-table-wrap">
                <table className="positions-table">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Shares</th>
                      <th>Entry</th>
                      <th>Current</th>
                      <th>P/L</th>
                      <th>P/L %</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {activeHoldings.map((holding) => {
                      const currentValue = holding.current_value_cents ?? holding.invested_cents
                      const entryPrice = holding.invested_cents / Math.max(holding.shares, 1)
                      const currentPrice = currentValue / Math.max(holding.shares, 1)
                      const pnl = currentValue - holding.invested_cents
                      const pnlPct = holding.invested_cents > 0 ? (pnl / holding.invested_cents) * 100 : 0

                      return (
                        <tr key={holding.id}>
                          <td>
                            <div className="table-agent-name">{holding.agents?.name}</div>
                            <div className="table-agent-ticker">{holding.agents?.ticker}</div>
                          </td>
                          <td>{holding.shares.toFixed(3)}</td>
                          <td>{fmtUSD(entryPrice)}</td>
                          <td>{fmtUSD(currentPrice)}</td>
                          <td className={pnl >= 0 ? 'is-pos' : 'is-neg'}>{pnl >= 0 ? '+' : '-'}{fmtUSD(Math.abs(pnl))}</td>
                          <td className={pnlPct >= 0 ? 'is-pos' : 'is-neg'}>{fmtPct(pnlPct, 2)}</td>
                          <td>
                            <Link href={`/dashboard/exchange/${holding.agents?.slug}`} className="table-view-link" onClick={() => triggerHaptic(8)}>
                              Open
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="exchange-card">
            <div className="section-head">
              <h2>Agent Activity Tape</h2>
              <span className="section-subtle">Execution and signal state feed</span>
            </div>

            <div className="activity-grid">
              {agentActivity.map((activity) => (
                <div key={activity.agent_id} className="activity-tile">
                  <div className="activity-top">
                    <div>
                      <div className="table-agent-name">{activity.agent_name}</div>
                      <div className="table-agent-ticker">{activity.symbol || activity.agent_ticker}</div>
                    </div>
                    <div className="activity-status" style={{ color: getStatusColor(activity.status) }}>
                      <span className="activity-status-dot" style={{ backgroundColor: getStatusColor(activity.status) }} />
                      {activity.status}
                    </div>
                  </div>

                  <div className="activity-bottom">
                    <span>{activity.last_trade_at ? getRelativeTime(activity.last_trade_at) : 'No recent fill'}</span>
                    <span>{activity.signal_summary || 'Monitoring setup and waiting for edge.'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="dashboard-right-column">
          <div className="exchange-card metrics-stack">
            <div className="section-head">
              <h3>Capital Snapshot</h3>
            </div>

            <div className="mini-metrics-grid">
              <div className="mini-metric">
                <span>Available Cash</span>
                <strong>{fmtUSD(balance)}</strong>
              </div>
              <div className="mini-metric">
                <span>Invested Capital</span>
                <strong>{fmtUSD(totalCurrentValue)}</strong>
              </div>
              <div className="mini-metric">
                <span>Top Position</span>
                <strong>{topHolding ? topHolding.agents?.ticker : '--'}</strong>
              </div>
              <div className="mini-metric">
                <span>Largest Drawdown Name</span>
                <strong>{worstHolding ? worstHolding.holding.agents?.ticker : '--'}</strong>
              </div>
            </div>
          </div>

          {chartData.length > 0 && (
            <div className="exchange-card">
              <div className="section-head">
                <h3>Allocation Mix</h3>
              </div>
              <div className="allocation-chart-wrap">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={chartData} cx="50%" cy="50%" innerRadius={52} outerRadius={80} dataKey="value" paddingAngle={2}>
                      {chartData.map((entry, index) => (
                        <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="legend-list">
                {chartData.map((item, index) => {
                  const pct = totalCurrentValue > 0 ? (item.value / totalCurrentValue) * 100 : 0
                  return (
                    <div key={item.name} className="legend-item">
                      <span className="legend-dot" style={{ background: COLORS[index % COLORS.length] }} />
                      <span>{item.name}</span>
                      <strong>{pct.toFixed(1)}%</strong>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="exchange-card">
            <div className="section-head">
              <h3>Risk & Execution</h3>
            </div>
            <div className="risk-lines">
              <div>
                <span>Concentration Risk</span>
                <strong>{concentrationPct.toFixed(1)}%</strong>
              </div>
              <div>
                <span>Cash Readiness</span>
                <strong>{totalNav > 0 ? ((balance / totalNav) * 100).toFixed(1) : '0.0'}%</strong>
              </div>
              <div>
                <span>Win/Loss Rhythm</span>
                <strong>{(avgPnlPct * 100).toFixed(0)}% wins</strong>
              </div>
              <div>
                <span>Buying / Selling</span>
                <strong>{buyTrades}/{sellTrades}</strong>
              </div>
            </div>
          </div>

          <div className="exchange-card scroll-card">
            <div className="section-head">
              <h3>Recent Fills</h3>
              <span className="section-subtle">{trades.length} records</span>
            </div>

            {trades.length === 0 ? (
              <div className="panel-empty">No fills yet.</div>
            ) : (
              <div className="list-panel">
                {trades.slice(0, 10).map((trade) => (
                  <div key={trade.id} className="list-row">
                    <div>
                      <div className={`trade-side ${trade.side === 'buy' ? 'is-pos' : 'is-neg'}`}>
                        {trade.side === 'buy' ? 'BUY' : 'SELL'} {trade.symbol}
                      </div>
                      <div className="list-sub">{trade.agents?.name}</div>
                    </div>
                    <div className="list-right">
                      <div>{trade.qty.toFixed(3)}</div>
                      <div className="list-sub">{getRelativeTime(trade.filled_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="exchange-card scroll-card">
            <div className="section-head">
              <h3>Cash Ledger</h3>
              <span className="section-subtle">Latest flows</span>
            </div>

            {transactions.length === 0 ? (
              <div className="panel-empty">No wallet transactions.</div>
            ) : (
              <div className="list-panel">
                {transactions.map((tx) => {
                  const incoming = ['deposit', 'divest', 'return'].includes(tx.type)
                  return (
                    <div key={tx.id} className="list-row">
                      <div>
                        <div className={incoming ? 'is-pos' : 'is-neg'}>{tx.type.toUpperCase()}</div>
                        <div className="list-sub">{fmtDateTime(tx.created_at)}</div>
                      </div>
                      <div className={`list-right ${incoming ? 'is-pos' : 'is-neg'}`}>
                        {incoming ? '+' : '-'}{fmtUSD(tx.amount_cents)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </aside>
      </section>
    </div>
  )
}
