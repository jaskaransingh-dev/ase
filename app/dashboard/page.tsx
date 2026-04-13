'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts'
import { createClient } from '@/lib/supabase/client'

import { fmtPct, fmtDateTime } from '@/lib/utils'
import FundingModal from '@/components/FundingModal'
import AccountModal from '@/components/AccountModal'
import AlpacaApplicationStatus from '@/components/AlpacaApplicationStatus'

export const dynamic = 'force-dynamic'

type Agent = { id: string; name: string; slug: string; signal_summary?: string; primary_symbol?: string; strategy_type?: string }
type Subscription = {
  id: string
  agent_id: string
  created_at: string
  agents: Agent & {
    agent_stats?: { total_return_pct: number; sharpe_ratio: number; max_drawdown_pct: number; win_rate_pct: number; nav_cents: number; snapshot_at: string }[]
  }
}
type Trade = {
  id: string
  agent_id: string
  symbol: string
  side: string
  qty: number
  fill_price: number
  filled_at: string
  pnl_cents: number | null
  agents?: { name: string; slug: string }
}
type AgentActivity = {
  agent_id: string
  agent_name: string
  slug: string
  status: 'BUYING' | 'SELLING' | 'SCANNING' | 'OFFLINE'
  symbol: string
  last_trade_at: string
  signal_summary?: string
}

type BrokerAccount = {
  has_account: boolean
  account_id: string | null
  account_number: string | null
  status: string | null
  trading_enabled: boolean
  cash?: string
  portfolio_value?: string
}

function getRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

function statusColor(s: AgentActivity['status']) {
  return s === 'BUYING' ? '#00E599' : s === 'SELLING' ? '#FF5A5F' : s === 'SCANNING' ? '#8E8E93' : '#5A5A5F'
}

function StatusPulse({ status }: { status: AgentActivity['status'] }) {
  const pulseClass = status === 'BUYING' || status === 'SELLING' ? 'agent-pulse' : status === 'OFFLINE' ? 'agent-pulse error' : 'agent-pulse idle'
  return <span className={pulseClass} style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(status), display: 'inline-block' }} />
}

function generateEquityCurve() {
  const data = []
  let value = 10000
  for (let i = 30; i >= 0; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    value = value * (1 + (Math.random() - 0.48) * 0.04)
    data.push({ date: date.toISOString().split('T')[0], value })
  }
  return data
}

export default function DashboardPage() {
  const supabase = createClient()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [agentActivity, setAgentActivity] = useState<AgentActivity[]>([])
  const [brokerAccount, setBrokerAccount] = useState<BrokerAccount | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [showFunding, setShowFunding] = useState(false)
  const [showAccount, setShowAccount] = useState(false)
  const [equityData] = useState(generateEquityCurve)
  const [watchlist, setWatchlist] = useState<{id: string; agent_id: string; agents: {id: string; name: string; slug: string; primary_symbol: string}}[]>([])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [subsRes, tradesRes, agentsRes, statsRes] = await Promise.all([
        supabase
          .from('subscriptions')
          .select('id, agent_id, created_at, agents(id, name, slug, signal_summary, primary_symbol, strategy_type)')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false }),
        supabase
          .from('agent_trades')
          .select('*, agents(name, slug)')
          .order('filled_at', { ascending: false })
          .limit(30),
        supabase
          .from('agents')
          .select('id, name, slug, signal_summary, status')
          .eq('status', 'active'),
        supabase
          .from('agent_stats')
          .select('agent_id, total_return_pct, sharpe_ratio, max_drawdown_pct, win_rate_pct, nav_cents, snapshot_at')
          .order('snapshot_at', { ascending: false }),
      ])

      // Check broker account status
      const accountRes = await fetch('/api/broker/account').then(r => r.json()).catch(() => null)
      if (accountRes) {
        setBrokerAccount(accountRes as BrokerAccount)
      }

      // Load watchlist
      const watchlistRes = await fetch('/api/watchlist').catch(() => null)
      if (watchlistRes) {
        const data = await watchlistRes.json()
        setWatchlist(data.watchlist || [])
      }

      const statsMap: Record<string, { total_return_pct: number; sharpe_ratio: number; max_drawdown_pct: number; win_rate_pct: number; nav_cents: number; snapshot_at: string }> = {}
      for (const s of (statsRes.data ?? [])) {
        if (!statsMap[s.agent_id]) statsMap[s.agent_id] = s
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const subsWithStats = ((subsRes.data ?? []) as any[]).map((sub: any) => ({
        ...sub,
        agents: sub.agents ? {
          ...sub.agents,
          agent_stats: statsMap[sub.agent_id] ? [statsMap[sub.agent_id]] : [],
        } : sub.agents,
      }))

      setSubscriptions(subsWithStats as Subscription[])
      setTrades((tradesRes.data ?? []) as Trade[])

      const brokerRes = await fetch('/api/broker/create-account')
      setBrokerAccount(await brokerRes.json())

      if (agentsRes.data && tradesRes.data) {
        const tenMinAgo = Date.now() - 10 * 60000

        const activityMap: Record<string, AgentActivity> = {}
        for (const agent of agentsRes.data) {
          activityMap[agent.id] = {
            agent_id: agent.id,
            agent_name: agent.name,
            slug: agent.slug,
            status: 'SCANNING',
            symbol: '--',
            last_trade_at: '',
            signal_summary: agent.signal_summary ?? '',
          }
        }
        const tradesByAgent: Record<string, Trade> = {}
        for (const t of tradesRes.data as Trade[]) {
          if (!tradesByAgent[t.agent_id]) tradesByAgent[t.agent_id] = t
        }
        for (const [agentId, trade] of Object.entries(tradesByAgent)) {
          if (!activityMap[agentId]) continue
          const tradeTime = new Date(trade.filled_at).getTime()
          if (tradeTime >= tenMinAgo) {
            activityMap[agentId].status = trade.side === 'buy' ? 'BUYING' : 'SELLING'
          }
          activityMap[agentId].symbol = trade.symbol
          activityMap[agentId].last_trade_at = trade.filled_at
        }
        setAgentActivity(Object.values(activityMap))
      }

      setLoading(false)
    }
    void load()
  }, [router, supabase])

  const subscribedAgentIds = new Set(subscriptions.map(s => s.agent_id))
  const subscribedActivity = agentActivity.filter(a => subscribedAgentIds.has(a.agent_id))
  const recentTrades = trades.filter(t => subscribedAgentIds.has(t.agent_id)).slice(0, 10)

  const totalReturnAvg = subscriptions.length > 0
    ? subscriptions.reduce((sum, s) => {
        const stats = Array.isArray(s.agents?.agent_stats) ? s.agents.agent_stats[0] : null
        return sum + (stats?.total_return_pct ?? 0)
      }, 0) / subscriptions.length
    : 0

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.75rem', letterSpacing: '.08em' }}>
        Loading…
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Top strip */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: '.3rem' }}>COMMAND CENTER</div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.02em' }}>Your Portfolio</h1>
        </div>
        <Link href="/agents" className="btn-primary" style={{ fontSize: '.82rem', padding: '.6rem 1.4rem', borderRadius: 100 }}>
          Browse Agents →
        </Link>
      </div>

      {/* Brokerage Account Status with Visual */}
      <AlpacaApplicationStatus 
        onCreateAccount={() => setShowAccount(true)}
        onAddFunds={() => setShowFunding(true)}
        onLinkBank={() => setShowAccount(true)}
      />

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginBottom: '2rem' }} className="dash-stats-strip">
        {[
          { label: 'Subscriptions', value: subscriptions.length.toString(), color: 'var(--white)' },
          { label: 'Avg Return', value: fmtPct(totalReturnAvg, 1), color: totalReturnAvg >= 0 ? 'var(--mint)' : 'var(--red)' },
          { label: 'Active Agents', value: `${subscribedActivity.filter(a => a.status !== 'OFFLINE').length}/${subscribedActivity.length}`, color: 'var(--ivory)' },
          { label: 'Recent Trades', value: recentTrades.length.toString(), color: 'var(--ivory)' },
        ].map(item => (
          <div key={item.label} className="glass-card-v2" style={{ borderRadius: 12, padding: '1rem 1.25rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--muted)', letterSpacing: '.1em', marginBottom: '.35rem' }}>{item.label.toUpperCase()}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.4rem', color: item.color }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem', alignItems: 'start' }} className="dash-main-grid">

        {/* Left: Subscription Health Grid - Pulse Cards */}
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--muted)', letterSpacing: '.1em', marginBottom: '1rem' }}>
            SUBSCRIPTION HEALTH
          </div>

          {subscriptions.length === 0 ? (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '3rem 2rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '.75rem' }}>◇</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: '1.1rem', fontWeight: 600, marginBottom: '.4rem' }}>No allocations yet</div>
              <div style={{ fontSize: '.85rem', color: 'var(--muted)', marginBottom: '1.25rem' }}>Browse verified agents and allocate funds to start trading.</div>
              <Link href="/agents" className="btn-primary" style={{ fontSize: '.82rem', borderRadius: 100 }}>Browse Agents →</Link>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '1rem' }}>
              {subscriptions.map(sub => {
                const stats = Array.isArray(sub.agents?.agent_stats) ? sub.agents.agent_stats[0] : null
                const ret = stats?.total_return_pct ?? 0
                const sharpe = stats?.sharpe_ratio ?? 0
                const pos = ret >= 0
                const activity = agentActivity.find(a => a.agent_id === sub.agent_id)

                return (
                  <Link 
                    key={sub.id} 
                    href={`/agents/${sub.agents?.slug}`}
                    className="glass-card-v2"
                    style={{ 
                      padding: '1.25rem', 
                      borderRadius: 16, 
                      textDecoration: 'none',
                      display: 'flex', 
                      flexDirection: 'column',
                      gap: '0.75rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <StatusPulse status={activity?.status ?? 'SCANNING'} />
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--muted)' }}>{sub.agents?.primary_symbol ?? 'MULTI'}</div>
                          <div style={{ fontWeight: 600, fontSize: '.9rem', color: 'var(--white)' }}>{sub.agents?.name}</div>
                        </div>
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', fontWeight: 700, color: pos ? 'var(--mint)' : 'var(--red)' }}>
                        {fmtPct(ret)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)' }}>
                      <span>Sharpe: {sharpe.toFixed(2)}</span>
                      <span>{activity?.symbol !== '--' ? activity?.symbol : 'IDLE'}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}

          {/* Watchlist */}
          {watchlist.length > 0 && (
            <div style={{ marginTop: '2rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--muted)', letterSpacing: '.1em', marginBottom: '1rem' }}>
                WATCHLIST
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '.75rem' }}>
                {watchlist.map(w => (
                  <Link 
                    key={w.id} 
                    href={`/agents/${w.agents?.slug}`}
                    style={{ 
                      padding: '1rem', 
                      borderRadius: 12, 
                      border: '1px solid var(--border)',
                      background: 'var(--bg2)',
                      textDecoration: 'none',
                      display: 'flex', 
                      flexDirection: 'column',
                      gap: '0.25rem'
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '.85rem', color: 'var(--white)' }}>{w.agents?.name}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)' }}>{w.agents?.primary_symbol}</div>
                  </Link>
                ))}
                <Link 
                  href="/agents"
                  style={{ 
                    padding: '1rem', 
                    borderRadius: 12, 
                    border: '1px dashed var(--border)',
                    background: 'transparent',
                    textDecoration: 'none',
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    color: 'var(--faint)',
                    fontSize: '.85rem'
                  }}
                >
                  + Add agent
                </Link>
              </div>
            </div>
          )}

          {/* Recent Trades Table */}
          {recentTrades.length > 0 && (
            <div style={{ marginTop: '2rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--muted)', letterSpacing: '.1em', marginBottom: '1rem' }}>
                RECENT TRADES
              </div>
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: '.68rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Agent', 'Symbol', 'Side', 'Qty', 'Fill', 'P&L', 'Time'].map(h => (
                        <th key={h} style={{ padding: '.6rem .75rem', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, fontSize: '.55rem', letterSpacing: '.08em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentTrades.map(t => {
                      const pnl = t.pnl_cents ?? 0
                      return (
                        <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '.5rem .75rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{t.agents?.name ?? '—'}</td>
                          <td style={{ padding: '.5rem .75rem', fontWeight: 600 }}>{t.symbol}</td>
                          <td style={{ padding: '.5rem .75rem', color: t.side === 'buy' ? 'var(--mint)' : 'var(--red)', textTransform: 'uppercase', fontWeight: 700 }}>{t.side}</td>
                          <td style={{ padding: '.5rem .75rem', color: 'var(--muted)' }}>{t.qty}</td>
                          <td style={{ padding: '.5rem .75rem', color: 'var(--muted)' }}>${t.fill_price.toFixed(2)}</td>
                          <td style={{ padding: '.5rem .75rem', color: pnl > 0 ? 'var(--mint)' : pnl < 0 ? 'var(--red)' : 'var(--faint)' }}>
                            {pnl !== 0 ? `${pnl > 0 ? '+' : ''}$${(pnl / 100).toFixed(2)}` : '—'}
                          </td>
                          <td style={{ padding: '.5rem .75rem', color: 'var(--faint)', whiteSpace: 'nowrap' }}>{getRelativeTime(t.filled_at)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right: All Agent Activity */}
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--muted)', letterSpacing: '.1em', marginBottom: '1rem' }}>
            ALL AGENT ACTIVITY
          </div>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
            {agentActivity.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.7rem' }}>No agents running</div>
            ) : (
              agentActivity.map((a, i) => {
                const subscribed = subscribedAgentIds.has(a.agent_id)
                return (
                  <div key={a.agent_id} style={{ padding: '.85rem 1rem', borderBottom: i < agentActivity.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'flex-start', gap: '.75rem' }}>
                    <StatusPulse status={a.status} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginBottom: '.1rem' }}>
                        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '.8rem', color: 'var(--white)' }}>{a.agent_name}</span>
                        {subscribed && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.45rem', color: 'var(--mint)', background: 'var(--mint-dim)', border: '1px solid var(--mint-border)', borderRadius: 4, padding: '.1rem .3rem', flexShrink: 0 }}>MINE</span>}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--faint)' }}>
                        {a.symbol !== '--' ? a.symbol : 'idle'} · {a.last_trade_at ? getRelativeTime(a.last_trade_at) : 'no trades'}
                      </div>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', fontWeight: 700, color: statusColor(a.status), flexShrink: 0 }}>{a.status}</span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      <style>{`
        @media(max-width:1024px){.dash-main-grid{grid-template-columns:1fr!important}}
        @media(max-width:700px){.dash-stats-strip{grid-template-columns:repeat(2,1fr)!important}}
      `}</style>

      {showFunding && <FundingModal onClose={() => setShowFunding(false)} />}
      {showAccount && <AccountModal onClose={() => setShowAccount(false)} onSuccess={() => { setShowAccount(false); router.refresh() }} />}
    </div>
  )
}