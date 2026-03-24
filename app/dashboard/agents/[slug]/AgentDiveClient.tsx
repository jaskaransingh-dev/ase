'use client'
import { useState } from 'react'
import Link from 'next/link'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'
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

  // Prepare chart data
  const chartData = statsHistory.map(s => ({
    date: fmtDate(s.snapshot_at),
    nav: s.nav_cents / 100,
    ret: s.total_return_pct,
    dd: Math.min(s.max_drawdown_pct, 0),
  }))

  const sortedTrades = [...trades].sort((a, b) => new Date(b.filled_at).getTime() - new Date(a.filled_at).getTime())

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
        </div>
      )}

      {tab === 'Risk' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
          {/* Auth data cards */}
          {[
            { label: 'PBO SCORE', value: '0.22', status: 'below_threshold', threshold: '0.40', color: '#E84040' },
            { label: 'DSR SCORE', value: '1.85', status: 'above_threshold', threshold: '1.25', color: '#0EAD6E' },
            { label: 'OOS PERFORMANCE', value: '+12.4%', status: 'passed', color: '#0EAD6E' },
            { label: 'PAPER TRACK', value: '87/90', status: 'in_progress', color: '#E8AC20' },
          ].map((item, i) => (
            <div key={i} style={{ background: '#0D1018', border: '1px solid #1a1f2e', borderRadius: '12px', padding: '1.5rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', letterSpacing: '.12em', color: '#666', marginBottom: '.5rem', textTransform: 'uppercase' }}>
                {item.label}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 700, color: item.color, marginBottom: '.75rem' }}>
                {item.value}
              </div>
              <div style={{ fontSize: '.75rem', color: '#999' }}>
                {item.status === 'below_threshold' && `Below threshold (${item.threshold})`}
                {item.status === 'above_threshold' && `Above threshold (${item.threshold})`}
                {item.status === 'passed' && 'Out-of-sample passed'}
                {item.status === 'in_progress' && `Days complete`}
              </div>
              <div style={{ marginTop: '1rem', height: '4px', background: '#1a1f2e', borderRadius: '2px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    background: item.color,
                    width: item.status === 'below_threshold' ? '55%' : item.status === 'above_threshold' ? '76%' : item.status === 'passed' ? '100%' : '97%',
                    transition: 'width .3s',
                  }}
                />
              </div>
            </div>
          ))}

          {/* Volatility card */}
          <div style={{ background: '#0D1018', border: '1px solid #1a1f2e', borderRadius: '12px', padding: '1.5rem', gridColumn: '1 / -1' }}>
            <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1rem', fontWeight: 700, marginBottom: '1.5rem' }}>Capacity & Status</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: '#666', marginBottom: '.5rem' }}>TOTAL AUM</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, color: '#E8AC20' }}>
                  {fmtUSD(agent.total_aum_cents)}
                </div>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: '#666', marginBottom: '.5rem' }}>STATUS</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                  <div style={{ width: '8px', height: '8px', background: '#0EAD6E', borderRadius: '50%' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 700, color: '#0EAD6E' }}>
                    {agent.status === 'active' ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </div>
              </div>
            </div>
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
          {[
            { label: 'PBO SCORE', value: '0.22', threshold: '0.40', color: '#E84040', description: 'Portfolio Beta Optimization score below threshold' },
            { label: 'DSR SCORE', value: '1.85', threshold: '1.25', color: '#0EAD6E', description: 'Drawdown Severity Ratio above threshold (safer)' },
            { label: 'OOS PERFORMANCE', value: '+12.4%', color: '#0EAD6E', description: 'Out-of-sample test returned 12.4% positive' },
            { label: 'PAPER TRACK', value: '87/90', color: '#E8AC20', description: '87 days of 90 complete in paper trading' },
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
              {item.threshold && (
                <div style={{ marginTop: '.75rem', fontSize: '.7rem', color: '#666' }}>
                  Threshold: {item.threshold}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
