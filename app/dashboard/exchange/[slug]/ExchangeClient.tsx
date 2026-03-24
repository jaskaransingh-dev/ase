'use client'
import { useState } from 'react'
import Link from 'next/link'
import { fmtUSD, fmtPct, fmtDateTime } from '@/lib/utils'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface Agent {
  id: string
  slug: string
  name: string
  description: string | null
  strategy_type: string
  status: string
  total_aum_cents: number
}

interface AgentStats {
  id: string
  nav_cents: number
  total_return_pct: number
  sharpe_ratio: number
  max_drawdown_pct: number
  win_rate_pct: number
  total_trades: number
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
}

interface Holding {
  id: string
  shares: number
  entry_nav_cents: number
  invested_cents: number
  current_value_cents: number | null
}

interface Props {
  agent: Agent
  statsHistory: AgentStats[]
  trades: AgentTrade[]
  userHolding: Holding | null
  walletBalance: number
  userName: string
}

export default function ExchangeClient({
  agent,
  statsHistory,
  trades,
  userHolding,
  walletBalance,
  userName,
}: Props) {
  const [tab, setTab] = useState<'overview' | 'strategy' | 'ledger'>('overview')
  const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState(100)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const latestStats = statsHistory.length > 0 ? statsHistory[statsHistory.length - 1] : null
  const nav = latestStats?.nav_cents ?? 10000
  const totalReturn = latestStats?.total_return_pct ?? 0
  const sharpe = latestStats?.sharpe_ratio ?? 0
  const maxDD = latestStats?.max_drawdown_pct ?? 0
  const winRate = latestStats?.win_rate_pct ?? 0
  const totalTrades = latestStats?.total_trades ?? 0

  const currentValue = userHolding ? (userHolding.current_value_cents ?? userHolding.invested_cents) : 0
  const returnValue = currentValue - (userHolding?.invested_cents ?? 0)
  const returnPct = userHolding && userHolding.invested_cents > 0 ? (returnValue / userHolding.invested_cents) * 100 : 0

  const strategyLabels: Record<string, string> = {
    momentum: 'Momentum',
    mean_reversion: 'Mean Reversion',
    trend_following: 'Trend Following',
    crypto_momentum: 'Crypto Momentum',
    crypto_mean_reversion: 'Crypto Mean Reversion',
  }

  const chartData = statsHistory.map(s => ({
    time: new Date(s.snapshot_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    nav: s.nav_cents / 100,
    timestamp: new Date(s.snapshot_at).getTime(),
  }))

  const amountCents = Math.round(amount * 100)
  const sharesToGet = amountCents / nav
  const spreadPct = 0.15 // Assume 15 bps spread

  async function handleInvest() {
    if (amountCents > walletBalance) {
      setError('Insufficient credits')
      return
    }
    if (amountCents < 1000) {
      setError('Minimum investment is $10')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/holdings/invest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agent.id,
          amount_cents: amountCents,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Investment failed')

      setSuccess(true)
      setTimeout(() => {
        window.location.href = '/dashboard'
      }, 2000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Investment failed')
    }
    setLoading(false)
  }

  async function handleSell() {
    if (!userHolding) {
      setError('No holding to sell')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/holdings/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holding_id: userHolding.id,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sale failed')

      setSuccess(true)
      setTimeout(() => {
        window.location.href = '/dashboard'
      }, 2000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sale failed')
    }
    setLoading(false)
  }

  return (
    <div style={{ padding: '2rem 2.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <Link
          href="/dashboard/exchange"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '.8rem',
            color: 'var(--muted)',
            textDecoration: 'none',
            marginBottom: '1rem',
            display: 'inline-block',
            transition: 'all .15s'
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLAnchorElement).style.color = 'var(--white)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLAnchorElement).style.color = 'var(--muted)'
          }}
        >
          ← Back to Exchange
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '2rem', fontWeight: 800, marginBottom: '.35rem' }}>
              {agent.name}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className="pill pill-gold" style={{ fontSize: '.65rem' }}>
                VERIFIED
              </span>
              <span className="tag" style={{ fontSize: '.7rem' }}>
                {strategyLabels[agent.strategy_type] || agent.strategy_type}
              </span>
            </div>
          </div>
          {userHolding && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.8rem', color: 'var(--faint)', marginBottom: '.35rem' }}>YOUR POSITION</div>
              <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.5rem', fontWeight: 800, marginBottom: '.15rem' }}>
                {fmtUSD(currentValue)}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.75rem', color: returnValue >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                {returnValue >= 0 ? '+' : ''}{fmtUSD(returnValue)} ({fmtPct(returnPct)})
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem', alignItems: 'start' }}>
        {/* Left: Chart + KPIs + Tabs */}
        <div>
          {/* Price Section */}
          <div style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            padding: '2rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.75rem', letterSpacing: '.1em', color: 'var(--faint)', marginBottom: '.5rem' }}>
                  CURRENT NAV
                </div>
                <div style={{ fontFamily: 'var(--font-head)', fontSize: '2.2rem', fontWeight: 800, marginBottom: '.35rem' }}>
                  {fmtUSD(nav)}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.8rem', color: totalReturn >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                  {totalReturn >= 0 ? '+' : ''}{fmtPct(totalReturn)} total return
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: 'var(--faint)', marginBottom: '.5rem' }}>BID/ASK SPREAD</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--muted)' }}>
                  {spreadPct.toFixed(2)}%
                </div>
              </div>
            </div>

            {/* Chart */}
            {chartData.length > 1 && (
              <div style={{ height: 240, marginTop: '2rem' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.08)" />
                    <XAxis
                      dataKey="time"
                      stroke="rgba(255,255,255,.3)"
                      style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}
                    />
                    <YAxis
                      stroke="rgba(255,255,255,.3)"
                      style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.8rem'
                      }}
                      formatter={(v: any) => v ? `${fmtUSD(v * 100)}` : 'N/A'}
                    />
                    <Line
                      type="monotone"
                      dataKey="nav"
                      stroke="var(--gold)"
                      dot={false}
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* KPI Strip */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '0.75rem',
            marginBottom: '1.5rem'
          }}>
            {[
              { label: 'SHARPE RATIO', value: sharpe.toFixed(2) },
              { label: 'MAX DRAWDOWN', value: fmtPct(-maxDD, 1) },
              { label: 'WIN RATE', value: winRate.toFixed(0) + '%' },
              { label: 'TOTAL TRADES', value: totalTrades.toString() },
              { label: 'AUM', value: fmtUSD(agent.total_aum_cents) },
              { label: 'STATUS', value: 'LIVE' },
            ].map(({ label, value }) => (
              <div
                key={label}
                style={{
                  background: 'rgba(255,255,255,.02)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '.75rem'
                }}
              >
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '.6rem',
                  letterSpacing: '.08em',
                  color: 'var(--faint)',
                  marginBottom: '.35rem'
                }}>
                  {label}
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '.9rem',
                  fontWeight: 800
                }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem' }}>
              {(['overview', 'strategy', 'ledger'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: '0.75rem 1.25rem',
                    background: 'transparent',
                    border: 'none',
                    fontFamily: tab === t ? 'var(--font-head)' : 'inherit',
                    fontSize: '0.9rem',
                    fontWeight: tab === t ? 700 : 600,
                    color: tab === t ? 'var(--white)' : 'var(--muted)',
                    borderBottom: tab === t ? '2px solid var(--gold)' : '2px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={e => {
                    if (tab !== t) {
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--white)'
                    }
                  }}
                  onMouseLeave={e => {
                    if (tab !== t) {
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted)'
                    }
                  }}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {tab === 'overview' && (
              <div>
                {agent.description && (
                  <div style={{
                    background: 'rgba(255,255,255,.02)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: '1.25rem',
                    lineHeight: 1.7,
                    color: 'var(--white)'
                  }}>
                    {agent.description}
                  </div>
                )}
              </div>
            )}

            {tab === 'strategy' && (
              <div style={{
                background: 'rgba(255,255,255,.02)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '1.25rem',
                fontSize: '.9rem',
                lineHeight: 1.7,
                color: 'var(--muted)'
              }}>
                <p>{strategyLabels[agent.strategy_type] || 'Unknown'} strategy - This agent automatically rebalances holdings based on market conditions. Performance data shown is from paper trading.</p>
              </div>
            )}

            {tab === 'ledger' && (
              <div style={{
                background: 'var(--bg2)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                overflow: 'hidden'
              }}>
                {trades.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)' }}>No trades yet</div>
                ) : (
                  <div>
                    {trades.map((trade, i) => (
                      <div
                        key={trade.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.9rem 1.1rem',
                          borderBottom: i < trades.length - 1 ? '1px solid var(--border)' : 'none',
                          fontSize: '.85rem'
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '.25rem' }}>
                            <span style={{
                              fontWeight: 700,
                              color: trade.side === 'buy' ? 'var(--green)' : 'var(--red)'
                            }}>
                              {trade.side === 'buy' ? '↓' : '↑'} {trade.side.toUpperCase()}
                            </span>
                            <span style={{ color: 'var(--muted)' }}>{trade.symbol}</span>
                          </div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: 'var(--faint)' }}>
                            {trade.filled_at ? fmtDateTime(trade.filled_at) : 'Pending'}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 700 }}>{trade.qty.toFixed(4)} @ {fmtUSD(Math.round(trade.fill_price * 100))}</div>
                          {trade.pnl_cents !== null && (
                            <div style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '.7rem',
                              color: trade.pnl_cents >= 0 ? 'var(--green)' : 'var(--red)'
                            }}>
                              {trade.pnl_cents >= 0 ? '+' : ''}{fmtUSD(trade.pnl_cents)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Trade Panel */}
        <div style={{
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '1.5rem',
          height: 'fit-content',
          position: 'sticky',
          top: 80
        }}>
          {success ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '1rem', color: 'var(--green)' }}>✓</div>
              <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 800, marginBottom: '.5rem' }}>
                {tradeMode === 'buy' ? 'Investment Confirmed' : 'Position Sold'}
              </h3>
              <p style={{ color: 'var(--muted)', fontSize: '.85rem' }}>
                {tradeMode === 'buy' ? `You invested ${fmtUSD(amountCents)}` : `Your position has been liquidated`}
              </p>
            </div>
          ) : (
            <>
              {/* Mode Toggle */}
              <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1.5rem' }}>
                <button
                  onClick={() => setTradeMode('buy')}
                  style={{
                    flex: 1,
                    padding: '.65rem',
                    borderRadius: 10,
                    border: tradeMode === 'buy' ? '1px solid var(--green)' : '1px solid var(--border)',
                    background: tradeMode === 'buy' ? 'rgba(14,173,110,.12)' : 'transparent',
                    color: tradeMode === 'buy' ? 'var(--green)' : 'var(--muted)',
                    fontWeight: 700,
                    fontSize: '.9rem',
                    cursor: 'pointer',
                    transition: 'all .15s'
                  }}
                >
                  BUY
                </button>
                <button
                  onClick={() => setTradeMode('sell')}
                  disabled={!userHolding}
                  style={{
                    flex: 1,
                    padding: '.65rem',
                    borderRadius: 10,
                    border: tradeMode === 'sell' ? '1px solid var(--red)' : '1px solid var(--border)',
                    background: tradeMode === 'sell' ? 'rgba(232,64,64,.12)' : 'transparent',
                    color: tradeMode === 'sell' ? 'var(--red)' : 'var(--muted)',
                    fontWeight: 700,
                    fontSize: '.9rem',
                    cursor: userHolding ? 'pointer' : 'not-allowed',
                    opacity: userHolding ? 1 : 0.5,
                    transition: 'all .15s'
                  }}
                >
                  SELL
                </button>
              </div>

              {tradeMode === 'buy' ? (
                <>
                  {/* Amount Input */}
                  <div style={{ marginBottom: '1.25rem' }}>
                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '.65rem',
                      letterSpacing: '.08em',
                      color: 'var(--faint)',
                      marginBottom: '.5rem'
                    }}>
                      AMOUNT
                    </div>
                    <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.75rem' }}>
                      <input
                        type="number"
                        value={amount}
                        onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                        className="input-base"
                        style={{ flex: 1 }}
                      />
                      <button
                        onClick={() => setAmount(walletBalance / 100)}
                        style={{
                          padding: '.65rem .85rem',
                          borderRadius: 10,
                          border: '1px solid var(--border2)',
                          background: 'transparent',
                          color: 'var(--muted)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '.8rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all .15s'
                        }}
                        className="max-button"
                      >
                        MAX
                      </button>
                    </div>
                  </div>

                  {/* Summary */}
                  <div style={{
                    background: 'rgba(232,172,32,.05)',
                    border: '1px solid rgba(232,172,32,.12)',
                    borderRadius: 12,
                    padding: '1rem',
                    marginBottom: '1.25rem',
                    fontSize: '.85rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.5rem' }}>
                      <span style={{ color: 'var(--muted)' }}>Shares you'll get</span>
                      <span style={{ fontWeight: 700 }}>{sharesToGet.toFixed(4)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.5rem' }}>
                      <span style={{ color: 'var(--muted)' }}>Price per share</span>
                      <span style={{ fontWeight: 700 }}>{fmtUSD(nav)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '.5rem', borderTop: '1px solid rgba(232,172,32,.12)' }}>
                      <span style={{ color: 'var(--muted)' }}>Bid/Ask spread</span>
                      <span style={{ fontWeight: 700, color: 'var(--gold)' }}>{spreadPct.toFixed(2)}%</span>
                    </div>
                  </div>

                  {/* Available Credits */}
                  <div style={{
                    marginBottom: '1.25rem',
                    padding: '.75rem 1rem',
                    background: 'rgba(255,255,255,.02)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    fontFamily: 'var(--font-mono)',
                    fontSize: '.8rem'
                  }}>
                    <div style={{ color: 'var(--faint)', marginBottom: '.25rem' }}>Available Credits</div>
                    <div style={{ fontWeight: 700, fontSize: '1rem' }}>{fmtUSD(walletBalance)}</div>
                  </div>

                  {error && (
                    <div style={{
                      padding: '.75rem 1rem',
                      background: 'rgba(232,64,64,.08)',
                      border: '1px solid rgba(232,64,64,.2)',
                      borderRadius: 10,
                      fontSize: '.8rem',
                      color: 'var(--red)',
                      marginBottom: '1rem'
                    }}>
                      {error}
                    </div>
                  )}

                  <button
                    onClick={handleInvest}
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '.75rem',
                      borderRadius: 12,
                      border: 'none',
                      background: 'var(--green)',
                      color: 'var(--bg)',
                      fontFamily: 'var(--font-head)',
                      fontWeight: 800,
                      fontSize: '0.95rem',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.7 : 1,
                      transition: 'all .15s'
                    }}
                    onMouseEnter={e => {
                      if (!loading) {
                        (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'
                      }
                    }}
                    onMouseLeave={e => {
                      if (!loading) {
                        (e.currentTarget as HTMLButtonElement).style.opacity = '1'
                      }
                    }}
                  >
                    {loading ? (
                      <>
                        <span className="spinner" />
                        Processing...
                      </>
                    ) : (
                      `Invest ${fmtUSD(amountCents)} →`
                    )}
                  </button>
                </>
              ) : (
                <>
                  {userHolding && (
                    <>
                      <div style={{
                        background: 'rgba(14,173,110,.05)',
                        border: '1px solid rgba(14,173,110,.12)',
                        borderRadius: 12,
                        padding: '1rem',
                        marginBottom: '1.25rem'
                      }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: 'var(--faint)', marginBottom: '.5rem' }}>
                          YOUR HOLDING
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.5rem' }}>
                          <span style={{ color: 'var(--muted)' }}>Shares</span>
                          <span style={{ fontWeight: 700 }}>{userHolding.shares.toFixed(4)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.5rem' }}>
                          <span style={{ color: 'var(--muted)' }}>Cost basis</span>
                          <span style={{ fontWeight: 700 }}>{fmtUSD(userHolding.invested_cents)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '.5rem', borderTop: '1px solid rgba(14,173,110,.12)' }}>
                          <span style={{ color: 'var(--muted)' }}>Current value</span>
                          <span style={{ fontWeight: 700, color: 'var(--green)' }}>{fmtUSD(currentValue)}</span>
                        </div>
                      </div>

                      {error && (
                        <div style={{
                          padding: '.75rem 1rem',
                          background: 'rgba(232,64,64,.08)',
                          border: '1px solid rgba(232,64,64,.2)',
                          borderRadius: 10,
                          fontSize: '.8rem',
                          color: 'var(--red)',
                          marginBottom: '1rem'
                        }}>
                          {error}
                        </div>
                      )}

                      <button
                        onClick={handleSell}
                        disabled={loading}
                        style={{
                          width: '100%',
                          padding: '.75rem',
                          borderRadius: 12,
                          border: 'none',
                          background: 'var(--red)',
                          color: 'var(--bg)',
                          fontFamily: 'var(--font-head)',
                          fontWeight: 800,
                          fontSize: '0.95rem',
                          cursor: loading ? 'not-allowed' : 'pointer',
                          opacity: loading ? 0.7 : 1,
                          transition: 'all .15s'
                        }}
                        onMouseEnter={e => {
                          if (!loading) {
                            (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'
                          }
                        }}
                        onMouseLeave={e => {
                          if (!loading) {
                            (e.currentTarget as HTMLButtonElement).style.opacity = '1'
                          }
                        }}
                      >
                        {loading ? (
                          <>
                            <span className="spinner" />
                            Processing...
                          </>
                        ) : (
                          `Sell Position →`
                        )}
                      </button>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        .max-button:hover {
          color: #E8AC20 !important;
          border-color: rgba(232,172,32,.2) !important;
        }
        @media(max-width:1100px){
          [style*="grid-template-columns: 1fr 380px"] {
            grid-template-columns: 1fr !important;
          }
          [style*="position: sticky"] {
            position: relative !important;
            top: auto !important;
          }
        }
      `}</style>
    </div>
  )
}
