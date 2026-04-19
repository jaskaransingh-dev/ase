'use client'

import { useState, useEffect } from 'react'
import { Loader2, Search, TrendingUp, Shield, Zap, BarChart3 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const C = {
  bg: '#06111F', bg2: '#0B1728', bg3: '#101A2D', bg4: '#162438',
  border: '#1E2A3D', border2: '#2A3A50',
  blue: '#4F8CFF', mint: '#16C784', red: '#E45867', orange: '#F5B942',
  text: '#B7C4D5', muted: '#7F8CA3', faint: '#55657A', white: '#F7FAFF',
  gold: '#F7C864', purple: '#8B5CF6',
}

interface Listing {
  id: string; slug: string; name: string; ticker: string; description: string | null
  strategy_type: string; asset_class: string; primary_symbol: string | null; status: string
  share_price_cents: number; subscriber_count: number
  return30d: number | null; sharpe: number | null; maxDD: number | null; winRate: number | null; isLive: boolean
}

const SORT_OPTIONS = [
  { value: 'rank', label: 'Top Ranked', icon: TrendingUp },
  { value: 'return', label: 'Highest Return', icon: Zap },
  { value: 'sharpe', label: 'Best Sharpe', icon: Shield },
  { value: 'drawdown', label: 'Low Drawdown', icon: BarChart3 },
]

const TAGS = ['momentum', 'mean-reversion', 'crypto', 'equities', 'low-drawdown', 'high-sharpe', 'multi-asset']

function MiniSparkline({ positive }: { positive: boolean }) {
  const pts = Array.from({ length: 14 }, (_, i) => {
    const trend = positive ? i * 2.2 : -i * 1.5
    const noise = Math.sin(i * 0.9) * 6 + Math.cos(i * 1.7) * 3
    const y = 22 - trend * 0.45 - noise
    return `${(i / 13) * 60},${Math.max(2, Math.min(24, y))}`
  }).join(' ')
  const color = positive ? C.mint : C.red
  return (
    <svg width="60" height="26" viewBox="0 0 60 26" preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs><linearGradient id={`mg${positive}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.22"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
      <polygon points={`0,26 ${pts} 60,26`} fill={`url(#mg${positive})`}/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  )
}

export default function MarketplacePage() {
  const supabase = createClient()
  const router = useRouter()
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState('rank')
  const [tag, setTag] = useState('')
  const [search, setSearch] = useState('')
  const [subscribing, setSubscribing] = useState<string | null>(null)
  const [subscribed, setSubscribed] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')

  useEffect(() => { fetchAgents() }, [sort, tag])

  async function fetchAgents() {
    setLoading(true)
    try {
      const res = await fetch('/api/agents')
      if (res.ok) { const json = await res.json(); setListings(json.data ?? []) }
    } catch (e) { console.error('Failed to fetch agents:', e) }
    setLoading(false)
  }

  async function handleSubscribe(listing: Listing) {
    setSubscribing(listing.id)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ agent_id: listing.id, amount_cents: 10000 }),
    })
    if (res.ok) setSubscribed(prev => new Set([...prev, listing.id]))
    setSubscribing(null)
  }

  const displayed = listings.filter(l =>
    !search || l.name?.toLowerCase().includes(search.toLowerCase()) ||
    l.ticker?.toLowerCase().includes(search.toLowerCase()) ||
    l.description?.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => {
    if (sort === 'return') return ((b.return30d ?? 0) - (a.return30d ?? 0))
    if (sort === 'sharpe') return ((b.sharpe ?? 0) - (a.sharpe ?? 0))
    if (sort === 'drawdown') return ((a.maxDD ?? 999) - (b.maxDD ?? 999))
    return ((b.sharpe ?? 0) + (b.return30d ?? 0) * 0.1) - ((a.sharpe ?? 0) + (a.return30d ?? 0) * 0.1)
  })

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
            <div style={{ width: 3, height: 14, borderRadius: 2, background: 'var(--blue)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 700, color: 'var(--faint)', letterSpacing: '0.12em' }}>STRATEGY MARKETPLACE</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: '1.5rem', color: C.white, letterSpacing: '-0.03em', margin: 0 }}>
            Verified Trading Agents
          </h1>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: C.muted, marginTop: '0.3rem' }}>
            Ranked by risk-adjusted performance · Hidden test set verified · Real-time P&L
          </div>
        </div>

        {/* View mode + create */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ display: 'flex', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
            {(['grid', 'table'] as const).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)} style={{ padding: '0.4rem 0.7rem', background: viewMode === mode ? C.bg4 : 'transparent', border: 'none', color: viewMode === mode ? C.white : C.faint, fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.14s' }}>
                {mode === 'grid' ? '⊞ Grid' : '≡ Table'}
              </button>
            ))}
          </div>
          <Link href="/agents/submit" style={{ padding: '0.4rem 0.85rem', borderRadius: 8, background: C.blue, color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            List Agent
          </Link>
        </div>
      </div>

      {/* Filters bar */}
      <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1', minWidth: 180 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.faint, pointerEvents: 'none' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search agents, tickers…"
            style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 7, padding: '0.45rem 0.75rem 0.45rem 2rem', color: C.white, fontSize: '0.82rem', outline: 'none', width: '100%', fontFamily: 'inherit', transition: 'border-color 0.14s' }}
            onFocus={e => e.target.style.borderColor = C.blue}
            onBlur={e => e.target.style.borderColor = C.border}
          />
        </div>

        {/* Sort */}
        <div style={{ display: 'flex', gap: '0.3rem' }}>
          {SORT_OPTIONS.map(s => (
            <button key={s.value} onClick={() => setSort(s.value)} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.65rem', borderRadius: 7, background: sort === s.value ? C.blue : C.bg3, border: `1px solid ${sort === s.value ? C.blue : C.border}`, color: sort === s.value ? '#fff' : C.muted, fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.14s', whiteSpace: 'nowrap' }}>
              <s.icon size={10} />
              {s.label}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: C.border }} />

        {/* Tags */}
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
          {['', ...TAGS].map(t => (
            <button key={t} onClick={() => setTag(t)} style={{ padding: '0.3rem 0.6rem', borderRadius: 20, background: tag === t ? 'rgba(79,140,255,0.15)' : 'transparent', border: `1px solid ${tag === t ? C.blue : C.border}`, color: tag === t ? C.blue : C.faint, fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s' }}>
              {t === '' ? 'All' : t}
            </button>
          ))}
        </div>
      </div>

      {/* Stats strip */}
      {!loading && displayed.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1rem', padding: '0 0.25rem' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: C.faint }}>{displayed.length} agent{displayed.length !== 1 ? 's' : ''}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: C.faint }}>avg sharpe: <span style={{ color: C.white }}>{(displayed.reduce((s, l) => s + (l.sharpe ?? 0), 0) / displayed.length).toFixed(2)}</span></span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: C.faint }}>live: <span style={{ color: C.mint }}>{displayed.filter(l => l.isLive).length}</span></span>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', color: C.muted }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', marginRight: '0.75rem' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.06em' }}>LOADING AGENTS…</span>
        </div>
      ) : displayed.length === 0 ? (
        <div style={{ background: C.bg2, border: `1px dashed ${C.border}`, borderRadius: 12, padding: '4rem', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: C.faint, marginBottom: '0.5rem' }}>NO AGENTS FOUND</div>
          <div style={{ color: C.muted, fontSize: '0.85rem', marginBottom: '1.5rem' }}>Be the first to create and list your trading agent.</div>
          <button onClick={() => router.push('/agents/submit')} style={{ background: C.blue, border: 'none', borderRadius: 8, padding: '0.55rem 1.25rem', color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
            Create Agent →
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.85rem' }}>
          {displayed.map((listing, idx) => (
            <AgentCard key={listing.id} listing={listing} rank={idx + 1} isSubscribed={subscribed.has(listing.id)} subscribing={subscribing === listing.id} onSubscribe={() => handleSubscribe(listing)} />
          ))}
        </div>
      ) : (
        /* Table view */
        <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['#', 'AGENT', 'TICKER', 'RETURN', 'SHARPE', 'MAX DD', 'WIN RATE', 'SUBSCRIBERS', ''].map(h => (
                  <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: '0.5rem', fontWeight: 700, color: C.faint, letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map((l, idx) => {
                const pos = (l.return30d ?? 0) >= 0
                return (
                  <tr key={l.id} style={{ borderBottom: `1px solid rgba(30,42,61,0.5)` }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,140,255,0.03)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: C.faint }}>{idx + 1}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: C.white }}>{l.name}</div>
                      {l.description && <div style={{ fontSize: '0.7rem', color: C.faint, marginTop: '0.1rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.description}</div>}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: C.muted }}>{l.ticker}</td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700, color: pos ? C.mint : C.red }}>
                      {l.return30d != null ? `${pos ? '+' : ''}${l.return30d.toFixed(1)}%` : '—'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700, color: (l.sharpe ?? 0) > 1 ? C.mint : C.muted }}>
                      {l.sharpe != null ? l.sharpe.toFixed(2) : '—'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: (l.maxDD ?? 0) > 30 ? C.red : C.muted }}>
                      {l.maxDD != null ? `${l.maxDD.toFixed(1)}%` : '—'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: (l.winRate ?? 0) > 50 ? C.mint : C.muted }}>
                      {l.winRate != null ? `${l.winRate.toFixed(0)}%` : '—'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: C.faint }}>{l.subscriber_count}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <Link href={`/agents/${l.slug}`} style={{ padding: '0.3rem 0.6rem', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: '0.65rem', fontWeight: 600, textDecoration: 'none', fontFamily: 'var(--font-mono)' }}>View</Link>
                        <button onClick={() => handleSubscribe(l)} disabled={subscribing === l.id || subscribed.has(l.id)} style={{ padding: '0.3rem 0.65rem', borderRadius: 6, border: 0, background: subscribed.has(l.id) ? 'rgba(22,199,132,.12)' : C.blue, color: subscribed.has(l.id) ? C.mint : '#fff', fontSize: '0.65rem', fontWeight: 700, cursor: subscribed.has(l.id) ? 'default' : 'pointer', fontFamily: 'var(--font-mono)' }}>
                          {subscribed.has(l.id) ? 'Joined' : 'Subscribe'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function AgentCard({ listing, rank, isSubscribed, subscribing, onSubscribe }: {
  listing: Listing; rank: number; isSubscribed: boolean; subscribing: boolean; onSubscribe: () => void
}) {
  const rankColors: Record<number, string> = { 1: '#F7C864', 2: '#C0C0C0', 3: '#CD7F32' }
  const rankColor = rankColors[rank] ?? C.faint
  const pos = (listing.return30d ?? 0) >= 0

  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', transition: 'border-color 0.15s, transform 0.15s', cursor: 'default', display: 'flex', flexDirection: 'column' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border2; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.transform = 'none' }}>

      {/* Card header */}
      <div style={{ padding: '1rem 1rem 0.75rem', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
          {/* Rank badge */}
          <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 7, padding: '0.3rem 0.5rem', fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.65rem', color: rankColor, flexShrink: 0, minWidth: 30, textAlign: 'center' }}>
            #{rank}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: C.white, fontSize: '0.88rem', marginBottom: '0.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{listing.name}</div>
            {listing.description && (
              <div style={{ color: C.muted, fontSize: '0.7rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{listing.description}</div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem', flexShrink: 0 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: C.faint }}>{listing.primary_symbol || listing.ticker}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: listing.isLive ? C.mint : C.faint }}>
              {listing.isLive && <span style={{ width: 4, height: 4, borderRadius: '50%', background: C.mint, display: 'inline-block', animation: 'pulse 2s infinite' }} />}
              {listing.isLive ? 'LIVE' : 'BACKTEST'}
            </span>
          </div>
        </div>
      </div>

      {/* Sparkline + return */}
      <div style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${C.border}` }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: C.faint, letterSpacing: '0.08em', marginBottom: '0.2rem' }}>RETURN (30D)</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.3rem', color: pos ? C.mint : C.red, letterSpacing: '-0.02em' }}>
            {listing.return30d != null ? `${pos ? '+' : ''}${listing.return30d.toFixed(1)}%` : '—'}
          </div>
        </div>
        <MiniSparkline positive={pos} />
      </div>

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: `1px solid ${C.border}` }}>
        {[
          { label: 'Sharpe', value: listing.sharpe != null ? listing.sharpe.toFixed(2) : '—', color: (listing.sharpe ?? 0) > 1 ? C.mint : C.muted },
          { label: 'Max DD', value: listing.maxDD != null ? `${listing.maxDD.toFixed(0)}%` : '—', color: (listing.maxDD ?? 0) > 30 ? C.red : C.muted },
          { label: 'Win Rate', value: listing.winRate != null ? `${listing.winRate.toFixed(0)}%` : '—', color: (listing.winRate ?? 0) > 50 ? C.mint : C.muted },
          { label: 'Subs', value: String(listing.subscriber_count), color: C.muted },
        ].map((m, i) => (
          <div key={m.label} style={{ padding: '0.6rem 0.5rem', textAlign: 'center', borderRight: i < 3 ? `1px solid ${C.border}` : 'none' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.48rem', color: C.faint, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>{m.label}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.82rem', color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Tags */}
      <div style={{ padding: '0.6rem 1rem', display: 'flex', gap: '0.3rem', flexWrap: 'wrap', borderBottom: `1px solid ${C.border}` }}>
        <span style={{ background: `${C.blue}18`, border: `1px solid ${C.blue}28`, borderRadius: 20, padding: '0.12rem 0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: C.blue }}>
          {listing.asset_class || 'crypto'}
        </span>
        <span style={{ background: `${C.muted}18`, border: `1px solid ${C.muted}28`, borderRadius: 20, padding: '0.12rem 0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: C.muted }}>
          {listing.strategy_type?.replace(/_/g, ' ') || 'algo'}
        </span>
      </div>

      {/* Footer */}
      <div style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.9rem', color: C.white }}>
            ${((listing.share_price_cents ?? 10000) / 100).toFixed(2)}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: C.faint }}>per share</div>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <Link href={`/agents/${listing.slug}`} style={{ padding: '0.38rem 0.7rem', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: '0.68rem', fontWeight: 600, textDecoration: 'none', fontFamily: 'var(--font-mono)', transition: 'all 0.12s' }}
            onMouseEnter={e => { e.currentTarget.style.color = C.white; e.currentTarget.style.borderColor = C.border2 }}
            onMouseLeave={e => { e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border }}>
            View →
          </Link>
          <button onClick={onSubscribe} disabled={subscribing || isSubscribed} style={{ padding: '0.38rem 0.8rem', borderRadius: 7, border: 0, background: isSubscribed ? 'rgba(22,199,132,.12)' : C.blue, color: isSubscribed ? C.mint : '#fff', fontSize: '0.68rem', fontWeight: 700, cursor: isSubscribed ? 'default' : 'pointer', fontFamily: 'var(--font-mono)', opacity: subscribing ? 0.7 : 1, transition: 'all 0.12s' }}>
            {isSubscribed ? '✓ Subscribed' : subscribing ? '…' : 'Subscribe'}
          </button>
        </div>
      </div>
    </div>
  )
}
