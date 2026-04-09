'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { useWallet } from '@/components/WalletProvider'
import { fmtUSD, fmtPct, fmtDateTime } from '@/lib/utils'

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
  return s === 'BUYING' ? '#6EE7B7' : s === 'SELLING' ? '#FB7185' : s === 'SCANNING' ? '#FDBA74' : '#6B7280'
}

function triggerHaptic(ms = 8) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(ms)
}

export default function DashboardPage() {
  const supabase = createClient()
  const router = useRouter()
  const { wallet, shortAddress, openModal } = useWallet()

  const [loading, setLoading] = useState(true)
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [agentActivity, setAgentActivity] = useState<AgentActivity[]>([])

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
        // Fetch agent_stats separately to avoid FK join issues
        supabase
          .from('agent_stats')
          .select('agent_id, total_return_pct, sharpe_ratio, max_drawdown_pct, win_rate_pct, nav_cents, snapshot_at')
          .order('snapshot_at', { ascending: false }),
      ])

      // Build stats lookup map keyed by agent_id (one row per agent, most recent)
      const statsMap: Record<string, { total_return_pct: number; sharpe_ratio: number; max_drawdown_pct: number; win_rate_pct: number; nav_cents: number; snapshot_at: string }> = {}
      for (const s of (statsRes.data ?? [])) {
        if (!statsMap[s.agent_id]) statsMap[s.agent_id] = s
      }

      // Merge stats into subscriptions
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
    <div style={{ padding: '2rem 2.5rem', maxWidth: 1440, margin: '0 auto' }}>

      {/* Top strip */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: '.3rem' }}>OVERVIEW</div>
          <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '1.7rem', fontWeight: 800 }}>Your Dashboard</h1>
        </div>
        <Link href="/agents" className="btn-primary" style={{ fontSize: '.82rem', padding: '.55rem 1.1rem' }} onClick={() => triggerHaptic()}>
          Browse Agents →
        </Link>
      </div>

      {/* Wallet banner */}
      {!wallet.connected && (
        <div style={{ background: 'rgba(155,140,255,.06)', border: '1px solid rgba(155,140,255,.2)', borderRadius: 14, padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: '.2rem' }}>Connect your wallet</div>
            <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>Required to subscribe to agents and for future on-chain settlement.</div>
          </div>
          <button onClick={openModal} className="btn-primary" style={{ fontSize: '.8rem', padding: '.5rem 1rem' }}>
            Connect Wallet →
          </button>
        </div>
      )}

      {wallet.connected && (
        <div style={{ background: 'rgba(110,231,183,.05)', border: '1px solid rgba(110,231,183,.15)', borderRadius: 14, padding: '.75rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '.75rem' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6EE7B7', display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', color: '#6EE7B7' }}>Wallet connected: {shortAddress}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--faint)', marginLeft: 'auto' }}>
            {wallet.chainId ?? 'Unknown chain'}
          </span>
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '.7rem', marginBottom: '1.75rem' }} className="dash-stats-strip">
        {[
          { label: 'Subscriptions', value: subscriptions.length.toString(), color: 'var(--white)' },
          { label: 'Avg Return', value: fmtPct(totalReturnAvg, 1), color: totalReturnAvg >= 0 ? 'var(--green)' : 'var(--red)' },
          { label: 'Active Agents', value: `${subscribedActivity.filter(a => a.status !== 'OFFLINE').length}/${subscribedActivity.length}`, color: '#8BE9FF' },
          { label: 'Recent Trades', value: recentTrades.length.toString(), color: 'var(--gold)' },
        ].map(item => (
          <div key={item.label} style={{ borderRadius: 12, border: '1px solid rgba(148,163,184,.2)', background: 'rgba(9,14,28,.72)', padding: '.8rem 1rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: '#8CA0C4', letterSpacing: '.08em', marginBottom: '.25rem' }}>{item.label.toUpperCase()}</div>
            <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.3rem', color: item.color }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.25rem', alignItems: 'start' }} className="dash-main-grid">

        {/* Left: subscriptions */}
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.75rem' }}>
            ACTIVE SUBSCRIPTIONS
          </div>

          {subscriptions.length === 0 ? (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '3rem 2rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '.75rem' }}>⬡</div>
              <div style={{ fontFamily: 'var(--font-head)', fontSize: '1rem', fontWeight: 800, marginBottom: '.4rem' }}>No subscriptions yet</div>
              <div style={{ fontSize: '.85rem', color: 'var(--muted)', marginBottom: '1.25rem' }}>Browse verified agents and subscribe to start tracking their trades.</div>
              <Link href="/agents" className="btn-primary" style={{ fontSize: '.82rem' }}>Browse Agents →</Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
              {subscriptions.map(sub => {
                const stats = Array.isArray(sub.agents?.agent_stats) ? sub.agents.agent_stats[0] : null
                const ret = stats?.total_return_pct ?? 0
                const sharpe = stats?.sharpe_ratio ?? 0
                const winRate = stats?.win_rate_pct ?? 0
                const pos = ret >= 0
                const activity = agentActivity.find(a => a.agent_id === sub.agent_id)

                return (
                  <div key={sub.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.2rem 1.4rem' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '.75rem' }}>
                      <div>
                        <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', marginBottom: '.15rem' }}>
                          {sub.agents?.name}
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)' }}>
                          {sub.agents?.primary_symbol ?? 'MULTI'} · subscribed {getRelativeTime(sub.created_at)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                        {activity && (
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', fontWeight: 700, padding: '.2rem .55rem', borderRadius: 6, background: `${statusColor(activity.status)}18`, border: `1px solid ${statusColor(activity.status)}30`, color: statusColor(activity.status) }}>
                            {activity.status}
                          </span>
                        )}
                        <Link href={`/agents/${sub.agents?.slug}`} style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--gold)', textDecoration: 'none' }}>
                          View →
                        </Link>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '.4rem' }}>
                      {[
                        { k: 'RETURN', v: fmtPct(ret), c: pos ? 'var(--green)' : 'var(--red)' },
                        { k: 'SHARPE', v: sharpe.toFixed(2), c: 'var(--white)' },
                        { k: 'WIN %', v: winRate.toFixed(0) + '%', c: 'var(--white)' },
                        { k: 'SIGNAL', v: activity?.symbol !== '--' ? activity?.symbol ?? '—' : 'IDLE', c: 'var(--faint)' },
                      ].map(({ k, v, c }) => (
                        <div key={k} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 9, padding: '.4rem .55rem' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: 'var(--faint)', letterSpacing: '.08em' }}>{k}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.75rem', fontWeight: 800, color: c, marginTop: '.1rem' }}>{v}</div>
                        </div>
                      ))}
                    </div>

                    {activity?.signal_summary && (
                      <div style={{ marginTop: '.7rem', fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: '.6rem' }}>
                        {activity.signal_summary}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Recent trades from subscribed agents */}
          {recentTrades.length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.75rem' }}>
                RECENT TRADES (YOUR AGENTS)
              </div>
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: '.7rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['Agent', 'Symbol', 'Side', 'Qty', 'Fill', 'P&L', 'Time'].map(h => (
                          <th key={h} style={{ padding: '.55rem .75rem', textAlign: 'left', color: 'var(--faint)', fontWeight: 600, fontSize: '.58rem', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recentTrades.map(t => {
                        const pnl = t.pnl_cents ?? 0
                        return (
                          <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                            <td style={{ padding: '.4rem .75rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{t.agents?.name ?? '—'}</td>
                            <td style={{ padding: '.4rem .75rem', fontWeight: 700 }}>{t.symbol}</td>
                            <td style={{ padding: '.4rem .75rem', color: t.side === 'buy' ? '#6EE7B7' : '#FB7185', textTransform: 'uppercase', fontWeight: 700 }}>{t.side}</td>
                            <td style={{ padding: '.4rem .75rem', color: 'var(--muted)' }}>{t.qty}</td>
                            <td style={{ padding: '.4rem .75rem', color: 'var(--muted)' }}>${t.fill_price.toFixed(2)}</td>
                            <td style={{ padding: '.4rem .75rem', color: pnl > 0 ? '#6EE7B7' : pnl < 0 ? '#FB7185' : 'var(--faint)' }}>
                              {pnl !== 0 ? `${pnl > 0 ? '+' : ''}$${(pnl / 100).toFixed(2)}` : '—'}
                            </td>
                            <td style={{ padding: '.4rem .75rem', color: 'var(--faint)', whiteSpace: 'nowrap' }}>{getRelativeTime(t.filled_at)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: agent activity sidebar */}
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.75rem' }}>
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
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor(a.status), flexShrink: 0, marginTop: '.2rem', boxShadow: a.status !== 'OFFLINE' ? `0 0 6px ${statusColor(a.status)}80` : 'none' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginBottom: '.1rem' }}>
                        <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.agent_name}</span>
                        {subscribed && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: '#6EE7B7', background: 'rgba(110,231,183,.1)', border: '1px solid rgba(110,231,183,.2)', borderRadius: 4, padding: '.1rem .3rem', flexShrink: 0 }}>MINE</span>}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)' }}>
                        {a.symbol !== '--' ? a.symbol : 'idle'} · {a.last_trade_at ? getRelativeTime(a.last_trade_at) : 'no trades'}
                      </div>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', fontWeight: 700, color: statusColor(a.status), flexShrink: 0 }}>{a.status}</span>
                  </div>
                )
              })
            )}
          </div>

          {/* Quick actions */}
          <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
            <Link href="/agents" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '.75rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '.72rem', color: 'var(--white)', textDecoration: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'border-color .14s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(155,140,255,.4)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}>
              Browse All Agents <span style={{ color: 'var(--gold)' }}>→</span>
            </Link>
            <Link href="/dashboard/backtest" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '.75rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '.72rem', color: 'var(--white)', textDecoration: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'border-color .14s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(155,140,255,.4)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}>
              Algo Lab / Backtest <span style={{ color: 'var(--gold)' }}>→</span>
            </Link>
            <Link href="/builders/submit" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '.75rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '.72rem', color: 'var(--white)', textDecoration: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'border-color .14s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(155,140,255,.4)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}>
              Submit Your Agent <span style={{ color: 'var(--gold)' }}>→</span>
            </Link>
          </div>
        </div>
      </div>

      <style>{`
        @media(max-width:1024px){.dash-main-grid{grid-template-columns:1fr!important}}
        @media(max-width:700px){.dash-stats-strip{grid-template-columns:repeat(2,1fr)!important}}
      `}</style>
    </div>
  )
}
