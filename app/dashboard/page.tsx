'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { fmtUSD, fmtPct, fmtDateTime } from '@/lib/utils'

export const dynamic = 'force-dynamic'

interface Wallet { balance_cents: number }
interface Agent { id: string; name: string; slug: string; ticker: string }
interface Holding { id: string; agent_id: string; shares: number; invested_cents: number; current_value_cents: number; status: string; agents: Agent }
interface AgentTrade { id: string; agent_id: string; symbol: string; side: string; qty: number; fill_price: number; filled_at: string; pnl_cents: number | null; agents: Agent }
interface Transaction { id: string; type: string; amount_cents: number; created_at: string }
interface AgentActivity { agent_id: string; agent_name: string; agent_ticker: string; status: 'BUYING' | 'SELLING' | 'SCANNING' | 'OFFLINE'; symbol: string; last_trade_at: string; side?: string; signal_summary?: string }

const COLORS = ['#E8AC20', '#0EAD6E', '#4A90E2', '#FF6B6B', '#9B59B6', '#F39C12']

// Relative time formatter
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

export default function DashboardPage() {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [trades, setTrades] = useState<AgentTrade[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [agentActivity, setAgentActivity] = useState<AgentActivity[]>([])
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    async function load() {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        router.push('/login')
        return
      }
      setUser(authUser)

      const [walletRes, holdingsRes, tradesRes, txnsRes, agentsRes] = await Promise.all([
        supabase.from('wallets').select('balance_cents').eq('user_id', authUser.id).single(),
        supabase.from('holdings').select('*, agents(id, name, slug, ticker)').eq('user_id', authUser.id).eq('status', 'active'),
        supabase.from('agent_trades').select('*, agents(id, name, slug, ticker)').order('filled_at', { ascending: false }).limit(20),
        supabase.from('transactions').select('*').eq('user_id', authUser.id).order('created_at', { ascending: false }).limit(10),
        supabase.from('agents').select('id, name, ticker, signal_summary, last_run_at').eq('status', 'active'),
      ])

      setWallet(walletRes.data)
      setHoldings(holdingsRes.data ?? [])
      setTrades(tradesRes.data ?? [])
      setTransactions(txnsRes.data ?? [])

      // Build agent activity
      if (agentsRes.data && tradesRes.data) {
        const now = new Date()
        const tenMinutesAgo = new Date(now.getTime() - 10 * 60000)

        const activityMap: Record<string, AgentActivity> = {}

        // Initialize all agents — use signal_summary from DB if available
        for (const agent of agentsRes.data) {
          const lastRun = agent.last_run_at ? new Date(agent.last_run_at) : null
          const isStale = !lastRun || lastRun < new Date(now.getTime() - 25 * 60000)
          activityMap[agent.id] = {
            agent_id: agent.id,
            agent_name: agent.name,
            agent_ticker: agent.ticker,
            status: isStale ? 'OFFLINE' : 'SCANNING',
            symbol: '',
            last_trade_at: '',
            signal_summary: agent.signal_summary ?? '',
          }
        }

        // Get the most recent trade per agent
        const tradesByAgent: Record<string, AgentTrade> = {}
        for (const trade of tradesRes.data) {
          if (!tradesByAgent[trade.agent_id]) {
            tradesByAgent[trade.agent_id] = trade
          }
        }

        // Override status if a trade happened recently
        for (const [agentId, trade] of Object.entries(tradesByAgent)) {
          if (activityMap[agentId]) {
            const tradeTime = new Date(trade.filled_at)
            if (tradeTime >= tenMinutesAgo) {
              activityMap[agentId].status = trade.side === 'buy' ? 'BUYING' : 'SELLING'
            }
            activityMap[agentId].symbol = trade.symbol
            activityMap[agentId].last_trade_at = trade.filled_at
            activityMap[agentId].side = trade.side
          }
        }

        setAgentActivity(Object.values(activityMap))
      }

      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div style={{ padding: '2rem', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <div className="skeleton" style={{ height: 14, width: 140, margin: '0 auto .5rem' }} />
        <div className="skeleton" style={{ height: 28, width: 280, margin: '0 auto' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginBottom: '2rem' }}>
        {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 90, borderRadius: 16 }} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '1.5rem' }}>
        <div>{[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 110, borderRadius: 16, marginBottom: '.75rem' }} />)}</div>
        <div><div className="skeleton" style={{ height: 300, borderRadius: 16 }} /></div>
      </div>
    </div>
  )

  const balance = wallet?.balance_cents ?? 0
  const activeHoldings = holdings
  const totalInvested = activeHoldings.reduce((s, h) => s + h.invested_cents, 0)
  const totalCurrentValue = activeHoldings.reduce((s, h) => s + (h.current_value_cents ?? h.invested_cents), 0)
  const totalReturn = totalCurrentValue - totalInvested
  const totalReturnPct = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0
  const totalNav = balance + totalCurrentValue

  // Allocation chart
  const chartData = activeHoldings.map((h) => ({
    name: h.agents?.name || 'Unknown',
    value: h.current_value_cents ?? h.invested_cents,
  }))

  const txTypeLabel: Record<string, string> = {
    deposit: 'Deposit',
    invest: 'Invested',
    divest: 'Divested',
    return: 'Return',
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'BUYING': return '#0EAD6E'
      case 'SELLING': return '#E84040'
      case 'SCANNING': return '#E8AC20'
      case 'OFFLINE': return '#555'
      default: return '#666'
    }
  }

  return (
    <div className="page-slide-in" style={{
      padding: '2rem',
      maxWidth: '1400px',
      margin: '0 auto',
      minHeight: '100vh',
      fontFamily: 'var(--font-body)',
      color: '#E0E0E0'
    }}>
      {/* Header with live indicator */}
      <div style={{ marginBottom: '2.5rem', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', letterSpacing: '.15em', color: '#888', marginBottom: '.5rem' }}>PORTFOLIO TERMINAL</div>
          <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '2.2rem', fontWeight: 900, marginBottom: '.25rem' }}>Dashboard</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: '#0EAD6E' }}>
          <div style={{ width: 6, height: 6, background: '#0EAD6E', borderRadius: '50%', animation: 'breathe 2.5s ease-in-out infinite' }} />
          LIVE DATA
        </div>
      </div>

      {/* Top metrics strip with glass morphism */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '2.5rem' }}>
        {[
          { label: 'TOTAL NAV', value: fmtUSD(totalNav), color: '#E8AC20', glowClass: 'glow-gold' },
          { label: 'AVAILABLE CREDITS', value: fmtUSD(balance), color: '#0EAD6E', glowClass: 'glow-green' },
          { label: 'INVESTED VALUE', value: fmtUSD(totalCurrentValue), color: '#4A90E2', glowClass: 'glow-gold' },
          { label: 'TOTAL RETURN', value: fmtPct(totalReturnPct), sub: fmtUSD(Math.abs(totalReturn)), color: totalReturn >= 0 ? '#0EAD6E' : '#E84040', glowClass: totalReturn >= 0 ? 'glow-green' : 'glow-red' },
        ].map((stat, i) => (
          <div key={i} className={`stat-card ${stat.glowClass}`} style={{ position: 'relative' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', letterSpacing: '.12em', color: '#666', marginBottom: '.75rem', textTransform: 'uppercase', fontWeight: 600 }}>
              {stat.label}
            </div>
            <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.8rem', fontWeight: 800, color: stat.color, marginBottom: stat.sub ? '.35rem' : 0, fontVariantNumeric: 'tabular-nums' }}>
              {stat.value}
            </div>
            {stat.sub && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: '#999', fontVariantNumeric: 'tabular-nums' }}>{stat.sub}</div>}
          </div>
        ))}
      </div>

      {/* Agent Activity Panel with Glass Morphism */}
      {agentActivity.length > 0 && (
        <div className="glass-card" style={{ padding: '1.75rem', marginBottom: '2.5rem' }}>
          <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.05rem', fontWeight: 800, marginBottom: '1.25rem', color: '#E0E0E0' }}>Agent Activity</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {agentActivity.map((activity) => {
              const statusColor = getStatusColor(activity.status)
              return (
                <div key={activity.agent_id} className="transition-premium" style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '.65rem',
                  padding: '1rem',
                  background: 'rgba(255,255,255,0.02)',
                  border: `1px solid rgba(255,255,255,0.05)`,
                  borderRadius: '14px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '.8rem',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease'
                }} onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => {
                  const el = e.currentTarget
                  el.style.setProperty('background', 'rgba(255,255,255,0.04)')
                  el.style.setProperty('border-color', 'rgba(232,172,32,0.15)')
                }} onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => {
                  const el = e.currentTarget
                  el.style.setProperty('background', 'rgba(255,255,255,0.02)')
                  el.style.setProperty('border-color', 'rgba(255,255,255,0.05)')
                }}>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: '.15rem', color: '#E0E0E0' }}>
                      {activity.agent_name}
                    </div>
                    <div style={{ color: '#666', fontSize: '.7rem' }}>
                      {activity.symbol || 'N/A'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', paddingTop: '.3rem', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="live-breathe" style={{
                      display: 'inline-block',
                      width: '6px',
                      height: '6px',
                      flexShrink: 0,
                      background: statusColor,
                      borderRadius: '50%',
                      color: statusColor
                    }} />
                    <span style={{ color: statusColor, fontWeight: 700, fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                      {activity.status}
                    </span>
                  </div>
                  {activity.signal_summary && activity.status !== 'OFFLINE' && (
                    <div style={{ color: '#888', fontSize: '.65rem', marginTop: '.15rem', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {activity.signal_summary}
                    </div>
                  )}
                  {activity.status === 'OFFLINE' && (
                    <div style={{ color: '#555', fontSize: '.65rem', marginTop: '.15rem', fontStyle: 'italic' }}>not deployed / no cron</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '2rem', alignItems: 'start' }}>
        {/* Holdings table with premium styling */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.2rem', fontWeight: 800 }}>Agent Holdings</h2>
            <Link href="/dashboard/exchange" className="haptic-press" style={{ fontFamily: 'var(--font-mono)', fontSize: '.75rem', padding: '.6rem 1.2rem', background: 'linear-gradient(135deg, #E8AC20, #F5C842)', border: 'none', borderRadius: '10px', color: '#000', textDecoration: 'none', cursor: 'pointer', transition: 'all .2s', fontWeight: 700, display: 'inline-block' }}>
              + Invest More
            </Link>
          </div>

          {activeHoldings.length === 0 ? (
            <div className="glass-card" style={{ padding: '3rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '1rem', opacity: 0.5 }}>⬡</div>
              <div style={{ fontWeight: 600, marginBottom: '.5rem', fontSize: '1rem' }}>No holdings yet</div>
              <div style={{ color: '#999', fontSize: '.9rem', marginBottom: '1.5rem' }}>Start investing in verified AI agents</div>
              <Link href="/dashboard/exchange" style={{ fontFamily: 'var(--font-mono)', fontSize: '.8rem', padding: '.7rem 1.3rem', background: '#E8AC20', color: '#000', borderRadius: '10px', textDecoration: 'none', fontWeight: 700, display: 'inline-block', transition: 'all .2s' }}>
                Explore Agents →
              </Link>
            </div>
          ) : (
            <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: '.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)' }}>
                    <th style={{ padding: '1.1rem', textAlign: 'left', color: '#888', fontWeight: 600, fontSize: '.68rem', letterSpacing: '.12em', textTransform: 'uppercase' }}>AGENT</th>
                    <th style={{ padding: '1.1rem', textAlign: 'right', color: '#888', fontWeight: 600, fontSize: '.68rem', letterSpacing: '.12em', textTransform: 'uppercase' }}>POSITION</th>
                    <th style={{ padding: '1.1rem', textAlign: 'right', color: '#888', fontWeight: 600, fontSize: '.68rem', letterSpacing: '.12em', textTransform: 'uppercase' }}>ENTRY/CURRENT</th>
                    <th style={{ padding: '1.1rem', textAlign: 'right', color: '#888', fontWeight: 600, fontSize: '.68rem', letterSpacing: '.12em', textTransform: 'uppercase' }}>P&L</th>
                    <th style={{ padding: '1.1rem', textAlign: 'right', color: '#888', fontWeight: 600, fontSize: '.68rem', letterSpacing: '.12em', textTransform: 'uppercase' }}>P&L %</th>
                    <th style={{ padding: '1.1rem', textAlign: 'center', color: '#888', fontWeight: 600, fontSize: '.68rem', letterSpacing: '.12em', textTransform: 'uppercase' }}>STATUS</th>
                    <th style={{ padding: '1.1rem', textAlign: 'right', color: '#888', fontWeight: 600, fontSize: '.68rem', letterSpacing: '.12em', textTransform: 'uppercase' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {activeHoldings.map((h, i) => {
                    const currentVal = h.current_value_cents ?? h.invested_cents
                    const ret = currentVal - h.invested_cents
                    const retPct = h.invested_cents > 0 ? (ret / h.invested_cents) * 100 : 0
                    const entryPrice = h.invested_cents / h.shares
                    const currentPrice = currentVal / h.shares
                    return (
                      <tr key={h.id} style={{
                        borderBottom: i < activeHoldings.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                        background: 'transparent',
                        transition: 'background .2s ease',
                        cursor: 'pointer'
                      }} onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.background = 'rgba(232,172,32,0.05)'
                      }} onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.background = 'transparent'
                      }}>
                        <td style={{ padding: '1.1rem', color: '#E0E0E0', fontWeight: 600 }}>
                          <div>{h.agents?.name}</div>
                          <div style={{ fontSize: '.68rem', color: '#888', marginTop: '.1rem', fontWeight: 400 }}>{h.agents?.ticker}</div>
                        </td>
                        <td style={{ padding: '1.1rem', textAlign: 'right', color: '#E0E0E0', fontVariantNumeric: 'tabular-nums' }}>
                          {h.shares.toFixed(3)} @ {fmtUSD(currentPrice)}
                        </td>
                        <td style={{ padding: '1.1rem', textAlign: 'right', color: '#999', fontSize: '.8rem', fontVariantNumeric: 'tabular-nums' }}>
                          {fmtUSD(entryPrice)} → {fmtUSD(currentPrice)}
                        </td>
                        <td style={{ padding: '1.1rem', textAlign: 'right', color: ret >= 0 ? '#0EAD6E' : '#E84040', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                          {ret >= 0 ? '+' : ''}{fmtUSD(ret)}
                        </td>
                        <td style={{ padding: '1.1rem', textAlign: 'right', color: retPct >= 0 ? '#0EAD6E' : '#E84040', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                          {retPct >= 0 ? '+' : ''}{fmtPct(retPct)}
                        </td>
                        <td style={{ padding: '1.1rem', textAlign: 'center' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', padding: '.4rem .7rem', background: 'rgba(14,173,110,0.15)', color: '#0EAD6E', border: '1px solid rgba(14,173,110,0.3)', borderRadius: '8px', fontWeight: 700, display: 'inline-block' }}>
                            ACTIVE
                          </span>
                        </td>
                        <td style={{ padding: '1.1rem', textAlign: 'right' }}>
                          <Link href={`/dashboard/exchange/${h.agents?.slug}`} style={{ color: '#666', textDecoration: 'none', fontSize: '.75rem', fontWeight: 600, transition: 'color .15s' }} onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#E8AC20'} onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#666'}>
                            View →
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

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          {/* Allocation chart */}
          {chartData.length > 0 && (
            <div className="glass-card" style={{ padding: '1.75rem' }}>
              <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem', color: '#E0E0E0' }}>Allocation</h3>
              <div className="chart-glow">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={chartData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2} dataKey="value">
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ marginTop: '1.25rem', fontSize: '.7rem', color: '#999', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                {chartData.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', transition: 'color .2s' }} onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#E0E0E0'} onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#999'}>
                    <div style={{ width: '10px', height: '10px', background: COLORS[i % COLORS.length], borderRadius: '3px' }} />
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent trades */}
          <div className="glass-card" style={{ padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1rem', fontWeight: 700, color: '#E0E0E0' }}>Live Trades</h3>
            </div>
            {trades.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#666', fontSize: '.85rem' }}>No trades yet</div>
            ) : (
              <div className="custom-scroll" style={{ maxHeight: '350px', overflowY: 'auto', flex: 1 }}>
                {trades.slice(0, 10).map((t, i) => (
                  <div key={t.id} className="transition-premium" style={{
                    padding: '1rem 1.25rem',
                    borderTop: i > 0 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                    display: 'flex',
                    gap: '.75rem',
                    fontSize: '.75rem',
                    fontFamily: 'var(--font-mono)',
                    transition: 'background .2s',
                    background: 'transparent',
                    cursor: 'pointer'
                  }} onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(232,172,32,0.05)'
                  }} onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = 'transparent'
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: t.side === 'buy' ? '#0EAD6E' : '#E84040', fontWeight: 700, marginBottom: '.2rem' }}>
                        {t.side === 'buy' ? '▼ BUY' : '▲ SELL'} {t.symbol}
                      </div>
                      <div style={{ color: '#888', fontSize: '.65rem', marginBottom: '.1rem' }}>{t.agents?.name}</div>
                      <div style={{ color: '#555', fontSize: '.6rem' }}>{getRelativeTime(t.filled_at)}</div>
                    </div>
                    <div style={{ textAlign: 'right', whiteSpace: 'nowrap', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                      <div style={{ color: '#E0E0E0', fontSize: '.75rem', fontWeight: 600 }}>{t.qty.toFixed(4)}</div>
                      {t.pnl_cents !== null && <div style={{ color: t.pnl_cents >= 0 ? '#0EAD6E' : '#E84040', fontSize: '.65rem', marginTop: '.05rem', fontWeight: 700 }}>
                        {t.pnl_cents >= 0 ? '+' : ''}{fmtUSD(t.pnl_cents)}
                      </div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent transactions */}
          <div className="glass-card" style={{ padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1rem', fontWeight: 700, color: '#E0E0E0' }}>Recent Transactions</h3>
            </div>
            {transactions.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#666', fontSize: '.85rem' }}>No transactions</div>
            ) : (
              <div className="custom-scroll" style={{ maxHeight: '350px', overflowY: 'auto', flex: 1 }}>
                {transactions.map((t, i) => {
                  const isIncoming = ['deposit', 'divest', 'return'].includes(t.type)
                  return (
                    <div key={t.id} className="transition-premium" style={{
                      padding: '1rem 1.25rem',
                      borderTop: i > 0 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'background .2s',
                      background: 'transparent',
                      cursor: 'pointer'
                    }} onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(232,172,32,0.05)'
                    }} onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background = 'transparent'
                    }}>
                      <div style={{ fontSize: '.8rem' }}>
                        <div style={{ fontWeight: 600, marginBottom: '.1rem', color: '#E0E0E0' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', padding: '.2rem .5rem', background: isIncoming ? 'rgba(14,173,110,0.12)' : 'rgba(232,64,64,0.12)', color: isIncoming ? '#0EAD6E' : '#E84040', borderRadius: '4px', marginRight: '.4rem' }}>
                            {isIncoming ? '+' : '−'}
                          </span>
                          {txTypeLabel[t.type] || t.type}
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: '#666' }}>{getRelativeTime(t.created_at)}</div>
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.8rem', fontWeight: 700, color: isIncoming ? '#0EAD6E' : '#E84040', fontVariantNumeric: 'tabular-nums' }}>
                        {isIncoming ? '+' : '−'}{fmtUSD(t.amount_cents)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @media(max-width:1100px){
          [style*="grid-template-columns: 1fr 340px"]{
            grid-template-columns: 1fr !important;
          }
        }
        @media(max-width:600px){
          [style*="grid-template-columns: repeat(auto-fill, minmax(280px"]{
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
