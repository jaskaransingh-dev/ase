'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

import FundingModal from '@/components/FundingModal'
import AccountModal from '@/components/AccountModal'
import AlpacaApplicationStatus from '@/components/AlpacaApplicationStatus'
import { useWallet } from '@/components/WalletProvider'

export const dynamic = 'force-dynamic'

type Agent = { id: string; name: string; slug: string; signal_summary?: string; primary_symbol?: string; strategy_type?: string; ticker?: string }
type Subscription = {
  id: string
  agent_id: string
  created_at: string
  agents: Agent & {
    agent_stats?: { total_return_pct: number; sharpe_ratio: number; max_drawdown_pct: number; win_rate_pct: number; nav_cents: number; snapshot_at: string }[]
  }
  holding?: { shares: number; invested_cents: number; current_value_cents: number; pnl_cents: number } | null
  has_investment: boolean
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

function fmt$(cents: number, decimals = 2): string {
  return `${cents >= 0 ? '+' : '-'}$${(Math.abs(cents) / 100).toFixed(decimals)}`
}
function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}
function getRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}
function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}
function statusColor(s: AgentActivity['status']): string {
  return s === 'BUYING' ? '#00E599' : s === 'SELLING' ? '#FF5A5F' : s === 'SCANNING' ? '#8E8E93' : '#5A5A5F'
}

// Simple SVG sparkline - SSR safe
function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => { setMounted(true) }, [])
  
  if (!mounted || data.length < 2) return <div style={{ height: 40, width: 80 }} />
  
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const w = 80, h = 40
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return `${x},${y}`
  })
  const color = positive ? '#00E599' : '#FF5A5F'
  const fillPts = `0,${h} ${pts.join(' ')} ${w},${h}`
  const gradientId = `sg_${data.length}_${positive}`
  
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={fillPts} fill={`url(#${gradientId})`} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export default function DashboardPage() {
  const supabase = createClient()
  const router = useRouter()
  const { shortAddress, openModal, wallet, disconnect } = useWallet()

  const [userName, setUserName] = useState('')
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [agentActivity, setAgentActivity] = useState<AgentActivity[]>([])
  const [brokerAccount, setBrokerAccount] = useState<BrokerAccount | null>(null)
  const [showFunding, setShowFunding] = useState(false)
  const [showAccount, setShowAccount] = useState(false)
  const [watchlist, setWatchlist] = useState<{id: string; agent_id: string; agents: {id: string; name: string; slug: string; primary_symbol: string}}[]>([])

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    // Get user profile
    const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).single()
    setUserName(profile?.display_name || user.email?.split('@')[0] || 'there')

    const [subsRes, tradesRes, agentsRes, statsRes] = await Promise.all([
      fetch('/api/subscriptions').then(async res => {
        const data = await res.json()
        return {
          data: res.ok ? data.subscriptions ?? [] : [],
          error: res.ok ? null : new Error(data.error || 'Failed to load subscriptions'),
        }
      }),
      supabase.from('agent_trades').select('*, agents(name,slug)').order('filled_at', { ascending: false }).limit(30),
      supabase.from('agents').select('id, name, slug, signal_summary, status').eq('status', 'active'),
      supabase.from('agent_stats').select('agent_id, total_return_pct, sharpe_ratio, max_drawdown_pct, win_rate_pct, nav_cents, snapshot_at').order('snapshot_at', { ascending: false }),
    ])

    // Watchlist
    const wlRes = await fetch('/api/watchlist').catch(() => null)
    if (wlRes) {
      const d = await wlRes.json()
      setWatchlist(d.watchlist || [])
    }

    // Broker
    const brokerRes = await fetch('/api/broker/account')
    const brokerData = await brokerRes.json()
    setBrokerAccount(brokerData as BrokerAccount)

    // Stats map
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const statsMap: Record<string, any> = {}
    for (const s of (statsRes.data ?? [])) {
      if (!statsMap[s.agent_id]) statsMap[s.agent_id] = s
    }

    // Merge stats into subs
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

    // Build activity
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
  }, [router, supabase])

  // The loader updates local UI state from server data after auth resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const subscribedAgentIds = new Set(subscriptions.map(s => s.agent_id))
  const subscribedActivity = agentActivity.filter(a => subscribedAgentIds.has(a.agent_id))

  // Portfolio totals
  const totalInvested = subscriptions.reduce((sum, s) => sum + (s.holding?.invested_cents || 0), 0)
  const totalValue = subscriptions.reduce((sum, s) => sum + (s.holding?.current_value_cents || 0), 0)
  const totalPnL = totalValue - totalInvested
  const portfolioReturnPct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0
  const todayPnl = trades.filter(t => {
    const tradeTime = new Date(t.filled_at).getTime()
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    return tradeTime >= todayStart.getTime() && subscribedAgentIds.has(t.agent_id)
  }).reduce((sum, t) => sum + (t.pnl_cents ?? 0), 0)

  // Equity curve data from trades
  const equityCurve = (() => {
    const myTrades = trades.filter(t => subscribedAgentIds.has(t.agent_id))
    if (myTrades.length === 0) return []
    const sorted = [...myTrades].sort((a, b) => new Date(a.filled_at).getTime() - new Date(b.filled_at).getTime())
    const base = totalInvested || 100000
    let equity = base
    const pts = [equity]
    for (const t of sorted) {
      equity += (t.pnl_cents ?? 0)
      pts.push(Math.max(0, equity))
    }
    return pts.slice(-30)
  })()

  // Live activity feed (trades + agent signals)
  const liveEvents = [
    ...trades.filter(t => subscribedAgentIds.has(t.agent_id)).slice(0, 8).map(t => ({
      id: t.id,
      time: t.filled_at,
      type: t.side === 'buy' ? 'trade-buy' : 'trade-sell',
      agent: t.agents?.name ?? 'Agent',
      symbol: t.symbol,
      detail: `${t.side === 'buy' ? 'Bought' : 'Sold'} ${t.qty.toFixed(4)} @ $${t.fill_price.toFixed(2)}`,
      pnl: t.pnl_cents,
    })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 10)

  // AI Briefing
  const topAgent = subscriptions.length > 0
    ? subscriptions.reduce((best, s) => {
      const stats = Array.isArray(s.agents?.agent_stats) ? s.agents.agent_stats[0] : null
      const ret = stats?.total_return_pct ?? -999
      const bestRet = best ? (Array.isArray(best.agents?.agent_stats) ? best.agents.agent_stats[0]?.total_return_pct ?? -999 : -999) : -999
      return ret > bestRet ? s : best
    }, null as Subscription | null)
    : null
  const topStats = topAgent ? (Array.isArray(topAgent.agents?.agent_stats) ? topAgent.agents.agent_stats[0] : null) : null

  const greeting = getGreeting()
  const activeCount = subscribedActivity.filter(a => a.status !== 'SCANNING').length

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>

      {/* ── HEADER ROW ─────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        {/* Greeting */}
        <div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-.02em', marginBottom: '.2rem' }}>
            {greeting}, {userName}
          </h1>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', letterSpacing: '.06em' }}>
            {subscriptions.length === 0
              ? 'No agents allocated yet — browse to get started'
              : `${activeCount} agent${activeCount !== 1 ? 's' : ''} active · ${subscriptions.length} total subscription${subscriptions.length !== 1 ? 's' : ''}`}
          </div>
        </div>
        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Wallet button */}
          {wallet.address ? (
            <button
              onClick={disconnect}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.45rem',
                padding: '.5rem 1rem', borderRadius: 100,
                border: '1px solid rgba(22,199,132,.28)', background: 'rgba(22,199,132,.07)',
                color: 'var(--mint)', fontSize: '.72rem', fontWeight: 700, cursor: 'pointer',
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--mint)', display: 'inline-block' }} />
              {shortAddress}
            </button>
          ) : (
            <button
              onClick={openModal}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '.5rem 1rem', borderRadius: 100,
                border: '1px solid rgba(79,140,255,.25)', background: 'rgba(79,140,255,.07)',
                color: 'var(--blue2)', fontSize: '.72rem', fontWeight: 700, cursor: 'pointer',
              }}
            >
              🦊 Connect Wallet
            </button>
          )}
          <button onClick={() => setShowFunding(true)} style={{ padding: '.5rem 1.1rem', borderRadius: 100, border: '1px solid rgba(59,127,255,.3)', background: 'rgba(59,127,255,.08)', color: 'var(--blue2)', fontSize: '.78rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '-.01em', transition: 'all .15s' }}>
            + Add Funds
          </button>
          <Link href="/agents" style={{ padding: '.5rem 1.1rem', borderRadius: 100, border: 0, background: 'var(--blue)', color: '#fff', fontSize: '.78rem', fontWeight: 700, textDecoration: 'none', letterSpacing: '-.01em', transition: 'all .15s' }}>
            Browse Agents →
          </Link>
        </div>
      </div>

      {/* ── HERO PORTFOLIO BLOCK ─────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1.5rem', marginBottom: '1.5rem', alignItems: 'center' }} className="hero-grid">
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', letterSpacing: '.12em', marginBottom: '.5rem' }}>TOTAL PORTFOLIO VALUE</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: '2.8rem', fontWeight: 700, letterSpacing: '-.03em', color: 'var(--white)', lineHeight: 1 }}>
            {brokerAccount?.portfolio_value ? `$${parseFloat(brokerAccount.portfolio_value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : totalValue > 0 ? `$${(totalValue / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginTop: '.75rem', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.15rem' }}>TODAY P&L</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, color: todayPnl >= 0 ? 'var(--mint)' : 'var(--red)' }}>
                {todayPnl !== 0 ? fmt$(todayPnl) : '$0.00'}
              </div>
            </div>
            <div style={{ width: 1, height: 28, background: 'var(--border)' }} />
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.15rem' }}>ALL-TIME RETURN</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, color: portfolioReturnPct >= 0 ? 'var(--mint)' : 'var(--red)' }}>
                {totalInvested > 0 ? fmtPct(portfolioReturnPct) : '—'}
              </div>
            </div>
            <div style={{ width: 1, height: 28, background: 'var(--border)' }} />
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.15rem' }}>TOTAL P&L</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, color: totalPnL >= 0 ? 'var(--mint)' : 'var(--red)' }}>
                {totalPnL !== 0 ? fmt$(totalPnL) : '—'}
              </div>
            </div>
          </div>
        </div>
        {/* Sparkline chart */}
        <div style={{ minWidth: 120 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.4rem', textAlign: 'right' }}>PERFORMANCE</div>
          <Sparkline data={equityCurve} positive={portfolioReturnPct >= 0} />
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', marginTop: '.3rem', textAlign: 'right' }}>
            {totalInvested > 0 ? fmtPct(portfolioReturnPct) : '—'}
          </div>
        </div>
      </div>

      {/* ── QUICK STATS ──────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginBottom: '1.5rem' }} className="dash-stats-strip">
        {[
          { label: 'Cash Available', value: brokerAccount?.cash ? `$${parseFloat(brokerAccount.cash).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—', sub: brokerAccount?.status ?? '', color: 'var(--white)', onClick: () => setShowFunding(true) },
          { label: 'Invested Capital', value: totalInvested > 0 ? `$${(totalInvested / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}` : '$0', sub: `${subscriptions.filter(s => s.has_investment).length} agents`, color: 'var(--white)', onClick: undefined },
          { label: 'Active Agents', value: `${subscriptions.length}`, sub: `${activeCount} running now`, color: activeCount > 0 ? 'var(--mint)' : 'var(--faint)', onClick: undefined },
          { label: 'Risk Score', value: totalPnL < -totalInvested * 0.1 ? 'HIGH' : totalPnL < 0 ? 'MED' : 'LOW', sub: totalInvested > 0 ? fmtPct(totalPnL / totalInvested * 100) : '', color: totalPnL < -totalInvested * 0.1 ? 'var(--red)' : totalPnL < 0 ? 'var(--yellow)' : 'var(--mint)', onClick: undefined },
        ].map(item => (
          <div
            key={item.label}
            onClick={item.onClick}
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.1rem 1.25rem', cursor: item.onClick ? 'pointer' : 'default', transition: 'border-color .15s' }}
          >
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.4rem' }}>{item.label.toUpperCase()}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.25rem', color: item.color, letterSpacing: '-.02em' }}>{item.value}</div>
            {item.sub && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', marginTop: '.2rem' }}>{item.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── BROKERAGE CTA ─────────────────────────────────── */}
      {!brokerAccount?.has_account && (
        <div style={{ marginBottom: '1.5rem' }}>
          <AlpacaApplicationStatus
            onCreateAccount={() => setShowAccount(true)}
            onAddFunds={() => setShowFunding(true)}
            onLinkBank={() => setShowAccount(true)}
          />
        </div>
      )}

      {/* ── MAIN GRID ────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem', alignItems: 'start' }} className="dash-main-grid">

        {/* Left column */}
        <div>
          {/* Allocations */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', letterSpacing: '.12em' }}>YOUR ALLOCATIONS</div>
              <Link href="/agents" style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--blue2)', textDecoration: 'none' }}>+ Allocate more</Link>
            </div>
            {subscriptions.length === 0 ? (
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '3rem 2rem', textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: '.75rem', opacity: 0.3 }}>🎯</div>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', fontWeight: 600, marginBottom: '.4rem' }}>No allocations yet</div>
                <div style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: '1.25rem' }}>Browse verified agents and allocate funds to start trading.</div>
                <Link href="/agents" style={{ padding: '.55rem 1.4rem', borderRadius: 100, border: 0, background: 'var(--blue)', color: '#fff', fontSize: '.82rem', fontWeight: 700, textDecoration: 'none' }}>Browse Agents →</Link>
              </div>
            ) : (
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['AGENT', 'ALLOCATED', 'VALUE', 'P&L', 'RETURN', 'STATUS'].map(h => (
                        <th key={h} style={{ padding: '.65rem 1rem', textAlign: 'left', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.55rem', fontWeight: 700, letterSpacing: '.1em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptions.map((sub, i) => {
                      const stats = Array.isArray(sub.agents?.agent_stats) ? sub.agents.agent_stats[0] : null
                      const ret = stats?.total_return_pct ?? 0
                      const invested = sub.holding?.invested_cents ?? 0
                      const value = sub.holding?.current_value_cents ?? 0
                      const pnl = sub.holding?.pnl_cents ?? 0
                      const activity = agentActivity.find(a => a.agent_id === sub.agent_id)
                      const pos = ret >= 0
                      const sparkData = equityCurve.length > 1 ? equityCurve : [0, ret]
                      return (
                        <tr key={sub.id} style={{ borderBottom: i < subscriptions.length - 1 ? '1px solid rgba(30,55,100,.2)' : 'none' }}>
                          <td style={{ padding: '.75rem 1rem' }}>
                            <Link href={`/agents/${sub.agents?.slug}`} style={{ display: 'flex', alignItems: 'center', gap: '.75rem', textDecoration: 'none' }}>
                              <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(59,127,255,.1)', border: '1px solid rgba(59,127,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', fontWeight: 700, color: 'var(--blue2)' }}>{(sub.agents?.ticker ?? 'XX').slice(0, 3)}</div>
                              </div>
                              <div>
                                <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '.82rem', color: 'var(--white)' }}>{sub.agents?.name ?? '—'}</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)' }}>{sub.agents?.primary_symbol ?? '—'}</div>
                              </div>
                            </Link>
                          </td>
                          <td style={{ padding: '.75rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '.78rem', color: 'var(--muted)' }}>
                            {invested > 0 ? `$${(invested / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}` : '—'}
                          </td>
                          <td style={{ padding: '.75rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '.78rem', fontWeight: 700, color: 'var(--white)' }}>
                            {value > 0 ? `$${(value / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}` : '—'}
                          </td>
                          <td style={{ padding: '.75rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '.78rem', fontWeight: 700, color: pnl >= 0 ? 'var(--mint)' : 'var(--red)' }}>
                            {pnl !== 0 ? fmt$(pnl) : '—'}
                          </td>
                          <td style={{ padding: '.75rem 1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.78rem', fontWeight: 700, color: pos ? 'var(--mint)' : 'var(--red)' }}>
                                {fmtPct(ret)}
                              </span>
                              <Sparkline data={sparkData} positive={pos} />
                            </div>
                          </td>
                          <td style={{ padding: '.75rem 1rem' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', fontFamily: 'var(--font-mono)', fontSize: '.55rem', fontWeight: 700, color: statusColor(activity?.status ?? 'SCANNING'), background: `${statusColor(activity?.status ?? 'SCANNING')}18`, border: `1px solid ${statusColor(activity?.status ?? 'SCANNING')}30`, borderRadius: 6, padding: '.2rem .5rem' }}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor(activity?.status ?? 'SCANNING'), display: 'inline-block' }} />
                              {activity?.status ?? 'SCANNING'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Watchlist */}
          {watchlist.length > 0 && (
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', letterSpacing: '.12em', marginBottom: '1rem' }}>WATCHLIST</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '.75rem' }}>
                {watchlist.map(w => (
                  <Link key={w.id} href={`/agents/${w.agents?.slug}`} style={{ padding: '1rem', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg2)', textDecoration: 'none' }}>
                    <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '.82rem', color: 'var(--white)', marginBottom: '.15rem' }}>{w.agents?.name ?? '—'}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)' }}>{w.agents?.primary_symbol}</div>
                  </Link>
                ))}
                <Link href="/agents" style={{ padding: '1rem', borderRadius: 12, border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: 'var(--faint)', fontSize: '.8rem' }}>+ Browse</Link>
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* AI Briefing */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '1rem' }}>
              <div style={{ width: 20, height: 20, borderRadius: 6, background: 'rgba(59,127,255,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.65rem' }}>💡</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', fontWeight: 700, color: 'var(--blue2)', letterSpacing: '.08em' }}>TODAY&apos;S BRIEFING</div>
            </div>
            {topAgent && topStats ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.85rem' }}>
                <div style={{ padding: '.75rem', background: 'var(--bg3)', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', marginBottom: '.25rem' }}>TOP PERFORMER</div>
                  <div style={{ fontWeight: 700, fontSize: '.88rem', color: 'var(--white)', marginBottom: '.1rem' }}>{topAgent.agents?.name}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.78rem', fontWeight: 700, color: topStats.total_return_pct >= 0 ? 'var(--mint)' : 'var(--red)' }}>
                    {fmtPct(topStats.total_return_pct)} all-time
                  </div>
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', marginBottom: '.25rem' }}>SIGNAL</div>
                  <div style={{ fontSize: '.78rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                    {topAgent.agents?.signal_summary ?? 'Agents are scanning for opportunities. No signals triggered yet today.'}
                  </div>
                </div>
                <Link href={`/agents/${topAgent.agents?.slug}`} style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--blue2)', textDecoration: 'none', fontWeight: 600 }}>
                  View {topAgent.agents?.name} →
                </Link>
              </div>
            ) : (
              <div style={{ fontSize: '.8rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                No agent data yet. Allocate funds to an agent to receive AI-powered briefings.
                <Link href="/agents" style={{ display: 'block', marginTop: '.75rem', color: 'var(--blue2)', fontSize: '.78rem', fontWeight: 600, textDecoration: 'none' }}>Browse Agents →</Link>
              </div>
            )}
          </div>

          {/* Live Activity Feed */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', fontWeight: 700, color: 'var(--faint)', letterSpacing: '.12em' }}>LIVE ACTIVITY</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--mint)', animation: 'pulse 2s infinite' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--mint)' }}>LIVE</span>
              </div>
            </div>
            {liveEvents.length === 0 ? (
              <div style={{ padding: '2rem 1.25rem', textAlign: 'center', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.65rem' }}>
                No activity yet
              </div>
            ) : (
              <div>
                {liveEvents.map((evt, i) => (
                  <div key={evt.id} style={{ padding: '.75rem 1.25rem', borderBottom: i < liveEvents.length - 1 ? '1px solid rgba(30,55,100,.15)' : 'none', display: 'flex', alignItems: 'flex-start', gap: '.75rem' }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: evt.type === 'trade-buy' ? 'rgba(0,229,153,.1)' : 'rgba(242,54,69,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '.65rem' }}>
                      {evt.type === 'trade-buy' ? '↑' : '↓'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '.78rem', color: 'var(--white)', marginBottom: '.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{evt.agent}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)' }}>{evt.symbol} · {evt.detail}</div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', flexShrink: 0, marginTop: '.05rem' }}>{getRelativeTime(evt.time)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @media(max-width: 1024px) {
          .dash-main-grid { grid-template-columns: 1fr !important }
          .hero-grid { grid-template-columns: 1fr !important }
        }
        @media(max-width: 700px) {
          .dash-stats-strip { grid-template-columns: repeat(2, 1fr) !important }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>

      {showFunding && <FundingModal onClose={() => setShowFunding(false)} />}
      {showAccount && <AccountModal onClose={() => setShowAccount(false)} onSuccess={() => { setShowAccount(false); void load() }} />}
    </div>
  )
}
