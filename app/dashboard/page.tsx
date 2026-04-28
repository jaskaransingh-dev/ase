'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export const dynamic = 'force-dynamic'

type Agent = { id: string; name: string; slug: string; signal_summary?: string; primary_symbol?: string; strategy_type?: string; ticker?: string }
type Subscription = {
  id: string; agent_id: string; created_at: string
  agents: Agent & { agent_stats?: { total_return_pct: number; sharpe_ratio: number; max_drawdown_pct: number; win_rate_pct: number; nav_cents: number; snapshot_at: string }[] }
  holding?: { id: string; shares: number; invested_cents: number; current_value_cents: number; pnl_cents: number } | null
  has_investment: boolean
}
type SellState = { holdingId: string; agentName: string; shares: number; investedCents: number; currentValueCents: number } | null
type Trade = { id: string; agent_id: string; symbol: string; side: string; qty: number; fill_price: number; filled_at: string; pnl_cents: number | null; agents?: { name: string; slug: string } }
type AgentActivity = { agent_id: string; agent_name: string; slug: string; status: 'BUYING' | 'SELLING' | 'SCANNING' | 'OFFLINE'; symbol: string; last_trade_at: string; signal_summary?: string }
type BrokerAccount = { has_account: boolean; account_id: string | null; account_number: string | null; status: string | null; trading_enabled: boolean; cash?: string; portfolio_value?: string; equity_cents?: number; cash_cents?: number; invested_cents?: number; available_cents?: number; provider?: string; positions?: Array<{ symbol: string; qty: number; market_value: string }> }

function fmt$(cents: number, decimals = 2) { return `${cents >= 0 ? '+' : '-'}$${(Math.abs(cents) / 100).toFixed(decimals)}` }
function fmtPct(n: number) { return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%` }
function fmtMoney(v: string | number) { return `$${parseFloat(String(v)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }
function getRelativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000), hours = Math.floor(diff / 3600000), days = Math.floor(diff / 86400000)
  if (mins < 1) return 'just now'; if (mins < 60) return `${mins}m ago`; if (hours < 24) return `${hours}h ago`; return `${days}d ago`
}
function getGreeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' }
function statusColor(s: AgentActivity['status']) { return s === 'BUYING' ? '#16C784' : s === 'SELLING' ? '#E45867' : s === 'SCANNING' ? '#7F8CA3' : '#425366' }

function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted || data.length < 2) return <div style={{ height: 32, width: 64 }} />
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1
  const w = 64, h = 32
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 2) - 1}`)
  const color = positive ? '#16C784' : '#E45867'
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      <defs><linearGradient id={`sg${positive}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.2}/><stop offset="100%" stopColor={color} stopOpacity={0}/></linearGradient></defs>
      <polygon points={`0,${h} ${pts.join(' ')} ${w},${h}`} fill={`url(#sg${positive})`}/>
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  )
}

// Panel header component for terminal style
function PanelHeader({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ width: 3, height: 12, borderRadius: 2, background: 'var(--blue)' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 700, color: 'var(--faint)', letterSpacing: '0.12em' }}>{label}</span>
      </div>
      {action}
    </div>
  )
}

export default function DashboardPage() {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [agentActivity, setAgentActivity] = useState<AgentActivity[]>([])
  const [brokerAccount, setBrokerAccount] = useState<BrokerAccount | null>(null)
  const [watchlist, setWatchlist] = useState<{id: string; agent_id: string; agents: {id: string; name: string; slug: string; primary_symbol: string}}[]>([])
  const [sellTarget, setSellTarget] = useState<SellState>(null)
  const [selling, setSelling] = useState(false)
  const [sellError, setSellError] = useState('')
  const [sellDone, setSellDone] = useState<{ pnl_cents: number; returned_cents: number } | null>(null)
  const [marketPrices, setMarketPrices] = useState<Record<string, { price: number; change: number }>>({})

  // Fetch market prices for top cryptos
  useEffect(() => {
    async function fetchPrices() {
      try {
        const symbols = ['BTC-USD', 'ETH-USD', 'SOL-USD']
        const res = await fetch(`/api/market/prices?symbols=${symbols.join(',')}`)
        const data = await res.json()
        if (data.prices) setMarketPrices(data.prices)
      } catch {}
    }
    fetchPrices()
    const id = setInterval(fetchPrices, 30000)
    return () => clearInterval(id)
  }, [])

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).single()
    setUserName(profile?.display_name || user.email?.split('@')[0] || 'there')
    const [subsRes, tradesRes, agentsRes, statsRes] = await Promise.all([
      fetch('/api/subscriptions').then(async res => { const data = await res.json(); return { data: res.ok ? data.subscriptions ?? [] : [], error: res.ok ? null : new Error(data.error || 'Failed') } }),
      supabase.from('agent_trades').select('*, agents(name,slug)').order('filled_at', { ascending: false }).limit(30),
      supabase.from('agents').select('id, name, slug, signal_summary, status').eq('status', 'active'),
      supabase.from('agent_stats').select('agent_id, total_return_pct, sharpe_ratio, max_drawdown_pct, win_rate_pct, nav_cents, snapshot_at').order('snapshot_at', { ascending: false }),
    ])
    const wlRes = await fetch('/api/watchlist').catch(() => null)
    if (wlRes) { const d = await wlRes.json(); setWatchlist(d.watchlist || []) }
    
    // Fetch balance from account/balance which accounts for invested amounts
    const balanceRes = await fetch('/api/account/balance')
    const balanceData = await balanceRes.json()
    
    // Also get broker account for positions
    const brokerRes = await fetch('/api/broker/account')
    const brokerData = await brokerRes.json()
    
    // Merge: use balance endpoint's values but keep positions from broker
    setBrokerAccount({ ...brokerData, ...balanceData } as BrokerAccount)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const statsMap: Record<string, any> = {}
    for (const s of (statsRes.data ?? [])) { if (!statsMap[s.agent_id]) statsMap[s.agent_id] = s }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subsWithStats = ((subsRes.data ?? []) as any[]).map((sub: any) => ({ ...sub, agents: sub.agents ? { ...sub.agents, agent_stats: statsMap[sub.agent_id] ? [statsMap[sub.agent_id]] : [] } : sub.agents }))
    setSubscriptions(subsWithStats as Subscription[])
    setTrades((tradesRes.data ?? []) as Trade[])
    if (agentsRes.data && tradesRes.data) {
      const tenMinAgo = Date.now() - 10 * 60000
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const activityMap: Record<string, AgentActivity> = {}
      for (const agent of agentsRes.data) { activityMap[agent.id] = { agent_id: agent.id, agent_name: agent.name, slug: agent.slug, status: 'SCANNING', symbol: '--', last_trade_at: '', signal_summary: agent.signal_summary ?? '' } }
      const tradesByAgent: Record<string, Trade> = {}
      for (const t of tradesRes.data as Trade[]) { if (!tradesByAgent[t.agent_id]) tradesByAgent[t.agent_id] = t }
      for (const [agentId, trade] of Object.entries(tradesByAgent)) {
        if (!activityMap[agentId]) continue
        const tradeTime = new Date(trade.filled_at).getTime()
        if (tradeTime >= tenMinAgo) { activityMap[agentId].status = trade.side === 'buy' ? 'BUYING' : 'SELLING' }
        activityMap[agentId].symbol = trade.symbol
        activityMap[agentId].last_trade_at = trade.filled_at
      }
      setAgentActivity(Object.values(activityMap))
    }
    setLoading(false)
  }, [router, supabase])

  useEffect(() => { void load() }, [load])
  useEffect(() => { const id = setInterval(() => void load(), 30000); return () => clearInterval(id) }, [load])

  // Refresh holdings on mount to catch any changes
  useEffect(() => {
    if (!loading) return
    const timer = setTimeout(() => { void load() }, 2000)
    return () => clearTimeout(timer)
  }, [loading])

  async function handleSell() {
    if (!sellTarget) return
    setSelling(true)
    setSellError('')
    setSellDone(null)
    try {
      const res = await fetch('/api/holdings/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holding_id: sellTarget.holdingId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sell failed')
      setSellDone({ pnl_cents: data.pnl_cents, returned_cents: data.returned_cents })
      void load()
    } catch (e) {
      setSellError(e instanceof Error ? e.message : 'Sell failed')
    } finally {
      setSelling(false)
    }
  }

  const quickSell = (sub: Subscription) => {
    if (!sub.holding?.id) return
    setSellTarget({ holdingId: sub.holding.id, agentName: sub.agents?.name ?? 'Agent', shares: Number(sub.holding.shares), investedCents: sub.holding.invested_cents, currentValueCents: sub.holding.current_value_cents })
    setSellError('')
    setSellDone(null)
  }

  const subscribedAgentIds = new Set(subscriptions.map(s => s.agent_id))
  const subscribedActivity = agentActivity.filter(a => subscribedAgentIds.has(a.agent_id))
  const totalInvested = subscriptions.reduce((sum, s) => sum + (s.holding?.invested_cents || 0), 0)
  const totalValue = subscriptions.reduce((sum, s) => sum + (s.holding?.current_value_cents || 0), 0)
  const totalPnL = totalValue - totalInvested
  const portfolioReturnPct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0
  const todayPnl = trades.filter(t => { const tradeTime = new Date(t.filled_at).getTime(); const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0); return tradeTime >= todayStart.getTime() && subscribedAgentIds.has(t.agent_id) }).reduce((sum, t) => sum + (t.pnl_cents ?? 0), 0)
  const equityCurve = (() => {
    const myTrades = trades.filter(t => subscribedAgentIds.has(t.agent_id))
    if (myTrades.length === 0) return []
    const sorted = [...myTrades].sort((a, b) => new Date(a.filled_at).getTime() - new Date(b.filled_at).getTime())
    const base = totalInvested || 100000; let equity = base; const pts = [equity]
    for (const t of sorted) { equity += (t.pnl_cents ?? 0); pts.push(Math.max(0, equity)) }
    return pts.slice(-30)
  })()
  const liveEvents = [...trades.filter(t => subscribedAgentIds.has(t.agent_id)).slice(0, 10).map(t => ({ id: t.id, time: t.filled_at, type: t.side === 'buy' ? 'buy' : 'sell', agent: t.agents?.name ?? 'Agent', symbol: t.symbol, detail: `${t.side === 'buy' ? 'Bought' : 'Sold'} ${t.qty.toFixed(4)} @ $${t.fill_price.toFixed(2)}`, pnl: t.pnl_cents }))].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 10)
  const topAgent = subscriptions.length > 0 ? subscriptions.reduce((best, s) => { const stats = Array.isArray(s.agents?.agent_stats) ? s.agents.agent_stats[0] : null; const ret = stats?.total_return_pct ?? -999; const bestRet = best ? (Array.isArray(best.agents?.agent_stats) ? best.agents.agent_stats[0]?.total_return_pct ?? -999 : -999) : -999; return ret > bestRet ? s : best }, null as Subscription | null) : null
  const topStats = topAgent ? (Array.isArray(topAgent.agents?.agent_stats) ? topAgent.agents.agent_stats[0] : null) : null
  const activeCount = subscribedActivity.filter(a => a.status !== 'SCANNING').length
  // Use balance endpoint which accounts for invested amounts
  const krakenCash = brokerAccount?.cash_cents ? brokerAccount.cash_cents / 100 : brokerAccount?.cash ? parseFloat(brokerAccount.cash) : 0
  // Total portfolio = invested in agents + available cash (not raw Kraken cash, since invested amounts are deducted)
  const portfolioValue = (totalValue / 100) + krakenCash

  if (loading) {
    return (
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <style>{`@keyframes shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}.sk{background:linear-gradient(90deg,var(--bg3) 25%,var(--bg4) 50%,var(--bg3) 75%);background-size:800px 100%;animation:shimmer 1.4s infinite;border-radius:6px}`}</style>
        {/* Top bar skeleton */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <div className="sk" style={{ width: 220, height: 22, marginBottom: 8 }} />
            <div className="sk" style={{ width: 160, height: 12 }} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {[80, 90, 110, 100].map((w, i) => <div key={i} className="sk" style={{ width: w, height: 32, borderRadius: 8 }} />)}
          </div>
        </div>
        {/* Portfolio hero skeleton */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, marginBottom: '1rem', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
            <div style={{ flex: '1 1 260px', padding: '1.25rem 1.5rem', borderRight: '1px solid var(--border)' }}>
              <div className="sk" style={{ width: 110, height: 10, marginBottom: 16 }} />
              <div className="sk" style={{ width: 200, height: 40, marginBottom: 20 }} />
              <div style={{ display: 'flex', gap: '1rem' }}>
                {[70, 70, 70].map((w, i) => <div key={i} className="sk" style={{ width: w, height: 30 }} />)}
              </div>
            </div>
            <div style={{ flex: '0 0 160px', padding: '1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid var(--border)', gap: 12 }}>
              <div className="sk" style={{ width: 80, height: 10 }} />
              <div className="sk" style={{ width: 120, height: 40 }} />
            </div>
            <div style={{ flex: '1 1 400px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)' }}>
              {[0,1,2,3].map(i => (
                <div key={i} style={{ padding: '1.25rem 1rem', borderRight: i < 3 ? '1px solid var(--border)' : 'none' }}>
                  <div className="sk" style={{ width: 50, height: 9, marginBottom: 12 }} />
                  <div className="sk" style={{ width: 70, height: 20, marginBottom: 8 }} />
                  <div className="sk" style={{ width: 55, height: 9 }} />
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Grid skeleton */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1rem' }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <div style={{ width: 3, height: 12, borderRadius: 2, background: 'var(--blue)' }} />
              <div className="sk" style={{ width: 120, height: 10 }} />
            </div>
            <div style={{ padding: '2.5rem', textAlign: 'center' }}>
              <div className="sk" style={{ width: 140, height: 12, margin: '0 auto 12px' }} />
              <div className="sk" style={{ width: 200, height: 10, margin: '0 auto 20px' }} />
              <div className="sk" style={{ width: 120, height: 34, margin: '0 auto', borderRadius: 8 }} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {[140, 180].map((h, i) => (
              <div key={i} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, height: h }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>

      {/* ── TOP BAR ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--white)', letterSpacing: '-0.01em', marginBottom: '0.2rem' }}>
            {getGreeting()}, <span style={{ color: 'var(--blue2)' }}>{userName || '—'}</span>
          </h1>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--faint)', letterSpacing: '0.06em' }}>
            {subscriptions.length === 0 ? 'No agents allocated · browse to get started' : `${activeCount} agent${activeCount !== 1 ? 's' : ''} active · ${subscriptions.length} subscription${subscriptions.length !== 1 ? 's' : ''}`}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {brokerAccount?.has_account ? (
            <Link href="/dashboard/connect/kraken" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.85rem', borderRadius: 8, border: '1px solid rgba(94,65,217,.3)', background: 'rgba(94,65,217,.1)', color: '#a78bfa', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700, textDecoration: 'none' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--mint)', display: 'inline-block' }} /> Kraken {brokerAccount.cash ? fmtMoney(brokerAccount.cash) : 'Kraken'}
            </Link>
          ) : (
            <Link href="/dashboard/connect/kraken" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.85rem', borderRadius: 8, border: '1px solid rgba(94,65,217,.25)', background: 'rgba(94,65,217,.07)', color: '#a78bfa', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700, textDecoration: 'none' }}>
              Kraken Connect
            </Link>
          )}
          <a href="https://www.kraken.com/u/funding/deposit" target="_blank" rel="noopener noreferrer" style={{ padding: '0.4rem 0.85rem', borderRadius: 8, border: '1px solid rgba(79,140,255,.25)', background: 'rgba(79,140,255,.08)', color: 'var(--blue2)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'none' }}>
            + Deposit
          </a>
          <Link href="/dashboard/build?new=1" style={{ padding: '0.4rem 0.85rem', borderRadius: 8, border: '1px solid rgba(22,199,132,.25)', background: 'rgba(22,199,132,.07)', color: 'var(--mint)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700, textDecoration: 'none' }}>
            + New Strategy
          </Link>
<Link href="/dashboard/marketplace" style={{ padding: '0.4rem 0.85rem', borderRadius: 8, border: 0, background: 'var(--blue)', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700, textDecoration: 'none' }}>
            Marketplace
          </Link>
        </div>
      </div>

      {/* ── QUICK ACTIONS ── */}
      {subscriptions.length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', padding: '0.5rem 0.75rem', background: 'var(--bg3)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <Link href="/dashboard/marketplace" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.75rem', borderRadius: 6, border: '1px solid var(--mint)', background: 'rgba(22,199,132,.08)', color: 'var(--mint)', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700, textDecoration: 'none' }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            Invest More
          </Link>
          {subscriptions.filter(s => s.holding?.id).map(sub => (
            <button key={sub.id} onClick={() => quickSell(sub)} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.35rem 0.65rem', borderRadius: 6, border: '1px solid rgba(228,88,103,.25)', background: 'rgba(228,88,103,.06)', color: '#E45867', fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 700, cursor: 'pointer' }}>
              Sell {sub.agents?.name?.split(' ')[0] ?? 'Position'}
            </button>
          ))}
        </div>
      )}

      {/* ── PORTFOLIO HERO ── */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, marginBottom: '1rem', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'stretch', flexWrap: 'wrap' }} className="portfolio-hero-grid">
          {/* Main value */}
          <div style={{ flex: '1 1 260px', padding: '1.25rem 1.5rem', borderRight: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--faint)', letterSpacing: '0.12em', marginBottom: '0.5rem' }}>PORTFOLIO VALUE</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '2.2rem', fontWeight: 700, color: 'var(--white)', letterSpacing: '-0.03em', lineHeight: 1 }}>
              {fmtMoney(portfolioValue)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.75rem' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--faint)', letterSpacing: '0.08em', marginBottom: '0.15rem' }}>TODAY P&L</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 700, color: todayPnl >= 0 ? 'var(--mint)' : 'var(--red)' }}>
                  {todayPnl !== 0 ? fmt$(todayPnl) : '$0.00'}
                </div>
              </div>
              <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--faint)', letterSpacing: '0.08em', marginBottom: '0.15rem' }}>ALL-TIME</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 700, color: portfolioReturnPct >= 0 ? 'var(--mint)' : 'var(--red)' }}>
                  {totalInvested > 0 ? fmtPct(portfolioReturnPct) : '—'}
                </div>
              </div>
              <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--faint)', letterSpacing: '0.08em', marginBottom: '0.15rem' }}>TOTAL P&L</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 700, color: totalPnL >= 0 ? 'var(--mint)' : 'var(--red)' }}>
                  {totalPnL !== 0 ? fmt$(totalPnL) : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Sparkline */}
          <div style={{ flex: '0 0 160px', padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', borderRight: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--faint)', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>PERFORMANCE</div>
            <Sparkline data={equityCurve.length > 1 ? equityCurve : [0, 1]} positive={portfolioReturnPct >= 0} />
          </div>

          {/* Quick stats */}
          <div style={{ flex: '1 1 400px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {[
              { label: 'KRAKEN CASH', value: krakenCash !== null ? fmtMoney(krakenCash) : '--', sub: brokerAccount?.has_account ? 'connected' : 'not connected', color: 'var(--white)', click: undefined },
              { label: 'INVESTED', value: totalInvested > 0 ? `$${(totalInvested / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00', sub: `${subscriptions.filter(s => s.has_investment).length} agent${subscriptions.filter(s => s.has_investment).length !== 1 ? 's' : ''}`, color: 'var(--white)', click: undefined },
              { label: 'ACTIVE', value: `${subscriptions.length}`, sub: `${activeCount} running`, color: activeCount > 0 ? 'var(--mint)' : 'var(--faint)', click: undefined },
              { label: 'TOTAL P&L', value: totalInvested > 0 ? fmt$(totalPnL) : '—', sub: totalInvested > 0 ? fmtPct(portfolioReturnPct) : 'no positions', color: totalPnL >= 0 ? 'var(--mint)' : 'var(--red)', click: undefined },
            ].map((item, i) => (
              <div key={item.label} onClick={item.click} style={{ padding: '1.25rem 1rem', borderRight: i < 3 ? '1px solid var(--border)' : 'none', cursor: item.click ? 'pointer' : 'default', transition: 'background 0.14s' }}
                onMouseEnter={e => { if (item.click) e.currentTarget.style.background = 'rgba(79,140,255,0.04)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--faint)', letterSpacing: '0.1em', marginBottom: '0.35rem' }}>{item.label}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1rem', color: item.color, letterSpacing: '-0.02em' }}>{item.value}</div>
                {item.sub && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--faint)', marginTop: '0.2rem' }}>{item.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── NEW STRATEGY BANNER ── */}
      {subscriptions.length === 0 && (
        <Link href="/dashboard/build?new=1" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '1rem', padding: '1rem 1.5rem',
          background: 'linear-gradient(90deg, rgba(22,199,132,.08) 0%, rgba(79,140,255,.06) 100%)',
          border: '1px solid rgba(22,199,132,.2)', borderRadius: 12, textDecoration: 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(22,199,132,.12)', border: '1px solid rgba(22,199,132,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--mint)" strokeWidth="1.5"><path d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--mint)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '0.2rem' }}>QUANT LAB</div>
              <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, color: 'var(--white)', fontSize: '0.9rem' }}>Build your first algorithmic strategy</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--mint)', fontWeight: 700, flexShrink: 0 }}>
            Open Quant Lab <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </div>
        </Link>
      )}

      {/* ── KRAKEN CTA ── */}
      {brokerAccount !== null && !brokerAccount?.has_account && (
        <Link href="/dashboard/connect/kraken" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '1rem', padding: '0.9rem 1.25rem',
          background: 'rgba(94,65,217,.08)',
          border: '1px solid rgba(94,65,217,.25)', borderRadius: 12, textDecoration: 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(94,65,217,.14)', border: '1px solid rgba(94,65,217,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: '1rem' }}></span>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: '#a78bfa', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '0.15rem' }}>CONNECT KRAKEN</div>
              <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, color: 'var(--white)', fontSize: '0.85rem' }}>Link your Kraken API keys to start live trading</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#a78bfa', fontWeight: 700, flexShrink: 0 }}>
            Connect Now <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </div>
        </Link>
      )}

      {/* ── MAIN GRID ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1rem', alignItems: 'start' }} className="dash-main-grid">

        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Holdings panel */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <PanelHeader label="YOUR HOLDINGS" action={
              <Link href="/dashboard/marketplace" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--blue2)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                + Invest <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </Link>
            } />
            {subscriptions.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--faint)', marginBottom: '0.5rem' }}>NO HOLDINGS YET</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '1.25rem' }}>Invest in a verified agent starting from $1 — trades execute live on your Kraken account.</div>
                <Link href="/dashboard/marketplace" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1.1rem', borderRadius: 8, background: 'var(--blue)', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700, textDecoration: 'none' }}>
                  Browse Agents →
                </Link>
              </div>
            ) : (
              <div>
                {subscriptions.map((sub, i) => {
                  const stats = Array.isArray(sub.agents?.agent_stats) ? sub.agents.agent_stats[0] : null
                  const ret = stats?.total_return_pct ?? 0
                  const invested = sub.holding?.invested_cents ?? 0
                  const value = sub.holding?.current_value_cents ?? 0
                  const pnl = sub.holding?.pnl_cents ?? 0
                  const shares = sub.holding?.shares ?? 0
                  const activity = agentActivity.find(a => a.agent_id === sub.agent_id)
                  const sc = statusColor(activity?.status ?? 'SCANNING')
                  const pnlPos = pnl >= 0
                  const signal = activity?.signal_summary || sub.agents?.signal_summary || ''
                  const hasHolding = !!sub.holding?.id && invested > 0

                  // Find matching Kraken position for this agent's primary symbol
                  const primaryAsset = sub.agents?.primary_symbol?.replace(/-USD$/, '')
                  const krakenPos = brokerAccount?.positions?.find(p =>
                    p.symbol === primaryAsset ||
                    p.symbol === `X${primaryAsset}` ||
                    p.symbol.replace(/^X/, '') === primaryAsset
                  )

                  return (
                    <div key={sub.id} style={{ borderBottom: i < subscriptions.length - 1 ? '1px solid var(--border)' : 'none', padding: '1rem 1.25rem' }}>
                      {/* Row 1: agent name + status + sell */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
                        <Link href={`/agents/${sub.agents?.slug}`} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', textDecoration: 'none' }}>
                          <div style={{ width: 36, height: 36, borderRadius: 9, background: hasHolding ? 'rgba(22,199,132,.1)' : 'rgba(79,140,255,.1)', border: `1px solid ${hasHolding ? 'rgba(22,199,132,.22)' : 'rgba(79,140,255,.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', fontWeight: 700, color: hasHolding ? 'var(--mint)' : 'var(--blue2)' }}>{(sub.agents?.ticker ?? sub.agents?.primary_symbol?.split('-')[0] ?? 'XX').slice(0, 3)}</span>
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--white)' }}>{sub.agents?.name ?? '—'}</span>
                              {hasHolding && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.44rem', padding: '0.1rem 0.35rem', borderRadius: 4, background: 'rgba(22,199,132,.1)', border: '1px solid rgba(22,199,132,.2)', color: 'var(--mint)', letterSpacing: '.06em' }}>INVESTED</span>}
                            </div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: 'var(--faint)', marginTop: '0.1rem' }}>
                              {sub.agents?.primary_symbol ?? '—'} · {shares > 0 ? `${Number(shares).toFixed(4)} shares` : 'no shares'}
                              {krakenPos && ` · holding ${Number(krakenPos.qty).toFixed(6)} ${primaryAsset}`}
                            </div>
                          </div>
                        </Link>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontFamily: 'var(--font-mono)', fontSize: '0.52rem', fontWeight: 700, color: sc, background: `${sc}18`, border: `1px solid ${sc}28`, borderRadius: 5, padding: '0.2rem 0.5rem' }}>
                            <span style={{ width: 4, height: 4, borderRadius: '50%', background: sc, display: 'inline-block', animation: activity?.status !== 'SCANNING' ? 'pulse 1.5s infinite' : 'none' }} />
                            {activity?.status ?? 'SCANNING'}
                          </span>
                          {sub.holding?.id && hasHolding && (
                            <button onClick={() => { setSellTarget({ holdingId: sub.holding!.id, agentName: sub.agents?.name ?? 'Agent', shares: Number(sub.holding!.shares), investedCents: sub.holding!.invested_cents, currentValueCents: sub.holding!.current_value_cents }); setSellError(''); setSellDone(null) }}
                              style={{ padding: '0.25rem 0.65rem', borderRadius: 6, border: '1px solid rgba(228,88,103,.3)', background: 'rgba(228,88,103,.08)', color: '#E45867', fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 700, cursor: 'pointer' }}>
                              SELL
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Holding metrics — only shown when invested */}
                      {hasHolding && (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.5rem', marginBottom: krakenPos || signal ? '0.55rem' : 0 }}>
                            {[
                              { label: 'INVESTED', value: `$${(invested / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: 'var(--muted)' },
                              { label: 'VALUE NOW', value: `$${(value / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: 'var(--white)' },
                              { label: 'P&L', value: `${pnlPos ? '+' : ''}$${(Math.abs(pnl) / 100).toFixed(2)}`, color: pnlPos ? 'var(--mint)' : 'var(--red)' },
                              { label: 'RETURN', value: fmtPct(ret), color: ret >= 0 ? 'var(--mint)' : 'var(--red)' },
                            ].map(m => (
                              <div key={m.label} style={{ background: 'var(--bg3)', borderRadius: 7, padding: '0.4rem 0.6rem' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.46rem', color: 'var(--faint)', letterSpacing: '0.1em', marginBottom: '0.2rem' }}>{m.label}</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700, color: m.color }}>{m.value}</div>
                              </div>
                            ))}
                          </div>

                          {/* Kraken position for this agent */}
                          {krakenPos && (
                            <div style={{ background: 'rgba(22,199,132,.04)', border: '1px solid rgba(22,199,132,.12)', borderRadius: 7, padding: '0.4rem 0.7rem', marginBottom: signal ? '0.5rem' : 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--mint)" strokeWidth="2"><path d="M3 3l18 18M3 21l18-18"/><circle cx="12" cy="12" r="10"/></svg>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: 'var(--mint)', fontWeight: 700 }}>HOLDING IN KRAKEN</span>
                              </div>
                              <div style={{ display: 'flex', gap: '1rem' }}>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.46rem', color: 'var(--faint)', marginBottom: '0.08rem' }}>{primaryAsset} QTY</div>
                                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, color: 'var(--white)' }}>{Number(krakenPos.qty).toFixed(6)}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.46rem', color: 'var(--faint)', marginBottom: '0.08rem' }}>MKT VALUE</div>
                                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, color: 'var(--white)' }}>${parseFloat(krakenPos.market_value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      {/* Row 3: agent signal */}
                      {signal && (
                        <div style={{ background: 'rgba(79,140,255,.05)', border: '1px solid rgba(79,140,255,.12)', borderRadius: 7, padding: '0.4rem 0.65rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: hasHolding ? 0 : 0 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--blue2)" strokeWidth="2"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--muted)', lineHeight: 1.4 }}>{signal.slice(0, 120)}{signal.length > 120 ? '…' : ''}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Kraken open positions */}
          {brokerAccount?.has_account && brokerAccount.positions && brokerAccount.positions.length > 0 && (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <PanelHeader label="KRAKEN OPEN POSITIONS" action={
                <a href="https://www.kraken.com/u/trade" target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--faint)', textDecoration: 'none' }}>View on Kraken ↗</a>
              } />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
                {brokerAccount.positions.map((pos, i) => (
                  <div key={pos.symbol} style={{ padding: '0.85rem 1rem', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 700, color: 'var(--blue2)', marginBottom: '0.2rem' }}>{pos.symbol}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, color: 'var(--white)', marginBottom: '0.1rem' }}>${parseFloat(pos.market_value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: 'var(--faint)' }}>qty: {Number(pos.qty).toFixed(6)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Watchlist */}
          {watchlist.length > 0 && (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <PanelHeader label="WATCHLIST" action={
                <Link href="/dashboard/marketplace" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--faint)', textDecoration: 'none' }}>View all</Link>
              } />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0', borderTop: 'none' }}>
                {watchlist.map((w, i) => (
                  <Link key={w.id} href={`/agents/${w.agents?.slug}`} style={{ padding: '0.85rem 1rem', borderRight: (i + 1) % 3 !== 0 ? '1px solid var(--border)' : 'none', borderBottom: '1px solid var(--border)', textDecoration: 'none', display: 'block', transition: 'background 0.12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,140,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--white)', marginBottom: '0.15rem' }}>{w.agents?.name ?? '—'}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: 'var(--faint)' }}>{w.agents?.primary_symbol}</div>
                  </Link>
                ))}
                <Link href="/dashboard/marketplace" style={{ padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', borderBottom: '1px solid var(--border)', transition: 'all 0.12s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--blue2)'; e.currentTarget.style.background = 'rgba(79,140,255,0.04)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--faint)'; e.currentTarget.style.background = 'transparent' }}>
                  + Browse
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Agent signals panel */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <PanelHeader label="TODAY'S BRIEFING" />
            <div style={{ padding: '1rem' }}>
              {topAgent && topStats ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ padding: '0.75rem', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--faint)', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>TOP PERFORMER</div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--white)', marginBottom: '0.1rem' }}>{topAgent.agents?.name}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: topStats.total_return_pct >= 0 ? 'var(--mint)' : 'var(--red)' }}>{fmtPct(topStats.total_return_pct)} all-time</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--faint)', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>SIGNAL</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.55 }}>{topAgent.agents?.signal_summary ?? 'Agents are scanning for opportunities.'}</div>
                  </div>
                  <Link href={`/agents/${topAgent.agents?.slug}`} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--blue2)', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    View {topAgent.agents?.name} <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </Link>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.6, marginBottom: '0.75rem' }}>Allocate funds to an agent to receive AI-powered market briefings.</div>
                  <Link href="/dashboard/marketplace" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--blue2)', textDecoration: 'none', fontWeight: 600 }}>Browse Agents →</Link>
                </div>
              )}
            </div>
          </div>

          {/* Live activity feed */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <PanelHeader label="LIVE ACTIVITY" action={
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--mint)', animation: 'pulse 2s infinite' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--mint)' }}>LIVE</span>
              </div>
            } />
            {liveEvents.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--faint)' }}>No activity yet</div>
            ) : (
              <div>
                {liveEvents.map((evt, i) => (
                  <div key={evt.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', padding: '0.65rem 1rem', borderBottom: i < liveEvents.length - 1 ? '1px solid rgba(30,42,61,0.4)' : 'none' }}>
                    <div style={{ width: 22, height: 22, borderRadius: 6, background: evt.type === 'buy' ? 'rgba(22,199,132,.1)' : 'rgba(228,88,103,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.6rem', fontFamily: 'var(--font-mono)', color: evt.type === 'buy' ? 'var(--mint)' : 'var(--red)', fontWeight: 700 }}>
                      {evt.type === 'buy' ? '↑' : '↓'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--white)', marginBottom: '0.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{evt.agent}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{evt.symbol} · {evt.detail}</div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--faint)', flexShrink: 0 }}>{getRelativeTime(evt.time)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick links panel */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <PanelHeader label="QUICK ACCESS" />
            <div style={{ padding: '0.5rem' }}>
              {[
                { href: '/dashboard/build', label: 'Quant Lab', sub: 'Build & backtest strategies', icon: '8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
                { href: '/dashboard/backtest', label: 'Backtest Engine', sub: 'Test against historical data', icon: '16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
                { href: '/dashboard/marketplace', label: 'Marketplace', sub: 'Discover verified agents', icon: '3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z' },
              ].map(link => (
                <Link key={link.href} href={link.href} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0.75rem', borderRadius: 8, textDecoration: 'none', transition: 'background 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--blue-dim)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--bg3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round"><path d={link.icon}/></svg>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--white)' }}>{link.label}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--faint)' }}>{link.sub}</div>
                  </div>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2" style={{ marginLeft: 'auto', flexShrink: 0 }}><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media(max-width:1024px){.dash-main-grid{grid-template-columns:1fr!important}}
        @media(max-width:700px){.portfolio-hero-grid{flex-direction:column!important}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
      `}</style>

      {/* ── SELL CONFIRMATION MODAL ── */}
      {sellTarget && !sellDone && (
        <div onClick={() => { if (!selling) setSellTarget(null) }} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(4,3,12,.88)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid rgba(228,88,103,.25)', borderRadius: 20, padding: '2rem', width: '100%', maxWidth: 420, boxShadow: '0 40px 80px rgba(0,0,0,.8)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--faint)', letterSpacing: '0.12em', marginBottom: '0.5rem' }}>CLOSE POSITION</div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--white)', marginBottom: '1.25rem' }}>{sellTarget.agentName}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1.5rem' }}>
              {[
                { label: 'SHARES', value: Number(sellTarget.shares).toFixed(4) },
                { label: 'INVESTED', value: `$${(sellTarget.investedCents / 100).toFixed(2)}` },
                { label: 'CURRENT VALUE', value: `$${(sellTarget.currentValueCents / 100).toFixed(2)}` },
                { label: 'UNREALIZED P&L', value: fmt$(sellTarget.currentValueCents - sellTarget.investedCents), },
              ].map(item => (
                <div key={item.label} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '0.65rem 0.75rem' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.46rem', color: 'var(--faint)', letterSpacing: '0.1em', marginBottom: '0.2rem' }}>{item.label}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 700, color: 'var(--white)' }}>{item.value}</div>
                </div>
              ))}
            </div>
            <div style={{ background: 'rgba(228,88,103,.07)', border: '1px solid rgba(228,88,103,.2)', borderRadius: 10, padding: '0.75rem', marginBottom: '1.25rem', fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.55 }}>
              This will close <strong style={{ color: 'var(--white)' }}>all shares</strong> in this position. Any open Kraken orders will be market-sold. Proceeds go back to your Kraken account.
            </div>
            {sellError && <div style={{ color: '#E45867', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', marginBottom: '0.75rem' }}>{sellError}</div>}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setSellTarget(null)} disabled={selling}
                style={{ flex: 1, padding: '0.75rem', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleSell} disabled={selling}
                style={{ flex: 2, padding: '0.75rem', borderRadius: 10, border: 'none', background: selling ? 'rgba(228,88,103,.4)' : '#E45867', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: selling ? 'wait' : 'pointer' }}>
                {selling ? 'Closing…' : 'Confirm Sell'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SELL SUCCESS MODAL ── */}
      {sellDone && (
        <div onClick={() => setSellDone(null)} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(4,3,12,.88)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid rgba(22,199,132,.25)', borderRadius: 20, padding: '2.5rem', width: '100%', maxWidth: 380, textAlign: 'center', boxShadow: '0 40px 80px rgba(0,0,0,.8)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}></div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--mint)', marginBottom: '0.5rem' }}>Position Closed</h2>
            <p style={{ color: 'var(--muted)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              Returned <strong style={{ color: 'var(--white)' }}>${(sellDone.returned_cents / 100).toFixed(2)}</strong> to your Kraken account.
              {sellDone.pnl_cents !== 0 && <> P&L: <strong style={{ color: sellDone.pnl_cents >= 0 ? 'var(--mint)' : '#E45867' }}>{fmt$(sellDone.pnl_cents)}</strong></>}
            </p>
            <button onClick={() => { setSellDone(null); setSellTarget(null) }}
              style={{ width: '100%', padding: '0.85rem', borderRadius: 12, border: 'none', background: 'var(--mint)', color: '#000', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
