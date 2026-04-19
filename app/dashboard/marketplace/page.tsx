'use client'

import { useState, useEffect } from 'react'
import { Loader2, Star, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const C = {
  bg: '#06111F', bg2: '#0B1728', bg3: '#101A2D', bg4: '#162438',
  border: '#1E2A3D', border2: '#2A3A50',
  blue: '#4F8CFF', mint: '#16C784', red: '#FF5468', orange: '#F5B942',
  text: '#B7C4D5', muted: '#7F8CA3', faint: '#55657A', white: '#F7FAFF',
  gold: '#F7C864',
}

interface AgentListing {
  id: string
  slug: string
  name: string
  ticker: string
  description: string | null
  strategy_type: string
  asset_class: string
  primary_symbol: string | null
  status: string
  share_price_cents: number
  subscriber_count: number
  return30d: number | null
  sharpe: number | null
  maxDD: number | null
  winRate: number | null
  isLive: boolean
}

const inputStyle = {
  background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8,
  padding: '0.5rem 0.75rem', color: C.white, fontSize: '0.85rem',
  outline: 'none', width: '100%', fontFamily: 'inherit',
}

const selectStyle = {
  background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8,
  padding: '0.5rem 0.7rem', color: C.white, fontSize: '0.8rem',
  outline: 'none', cursor: 'pointer',
}

const SORT_OPTIONS = [
  { value: 'rank',     label: 'Top Ranked' },
  { value: 'return',   label: 'Highest Return' },
  { value: 'sharpe',   label: 'Best Sharpe' },
  { value: 'drawdown', label: 'Lowest Drawdown' },
]

const TAGS = ['momentum', 'mean-reversion', 'crypto', 'low-drawdown', 'high-sharpe', 'multi-asset']

interface Listing {
  id: string
  slug: string
  name: string
  ticker: string
  description: string | null
  strategy_type: string
  asset_class: string
  primary_symbol: string | null
  status: string
  share_price_cents: number
  subscriber_count: number
  return30d: number | null
  sharpe: number | null
  maxDD: number | null
  winRate: number | null
  isLive: boolean
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

  useEffect(() => { fetchAgents() }, [sort, tag])

  async function fetchAgents() {
    setLoading(true)
    try {
      const res = await fetch('/api/agents')
      if (res.ok) {
        const json = await res.json()
        setListings(json.data ?? [])
      }
    } catch (e) {
      console.error('Failed to fetch agents:', e)
    }
    setLoading(false)
  }

  async function handleSubscribe(listing: Listing) {
    setSubscribing(listing.id)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/subscribe`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}` 
      },
      body: JSON.stringify({ agent_id: listing.id, amount_cents: 10000 }),
    })
    if (res.ok) {
      setSubscribed(prev => new Set([...prev, listing.id]))
    }
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
    <div style={{ padding: '2rem', maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: C.blue, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '.3rem' }}>
          QUANT PLATFORM
        </div>
        <h1 style={{ fontSize: '1.7rem', fontWeight: 800, color: C.white, letterSpacing: '-.03em', margin: 0 }}>
          Strategy Marketplace
        </h1>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: C.muted, marginTop: '0.3rem' }}>
          Ranked by risk-adjusted performance · Hidden test set verified · Creator revenue split
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1', minWidth: 200 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.faint }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search strategies…"
            style={{ ...inputStyle, paddingLeft: '2rem', width: '100%' }}
          />
        </div>
        {/* Sort */}
        <select value={sort} onChange={e => setSort(e.target.value)} style={{ ...selectStyle, minWidth: 150 }}>
          {SORT_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {/* Tags */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {['', ...TAGS].map(t => (
            <button
              key={t}
              onClick={() => setTag(t)}
              style={{
                background: tag === t ? C.blue : C.bg2,
                border: `1px solid ${tag === t ? C.blue : C.border}`,
                borderRadius: 20, padding: '0.3rem 0.75rem',
                color: tag === t ? '#fff' : C.muted,
                fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {t === '' ? 'All' : t}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: C.muted, padding: '3rem' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : displayed.length === 0 ? (
        <div style={{ background: C.bg2, border: `1px dashed ${C.border2}`, borderRadius: 12, padding: '3rem', textAlign: 'center' }}>
          <Star size={28} color={C.faint} style={{ marginBottom: '1rem' }} />
          <div style={{ fontWeight: 700, color: C.white, marginBottom: '0.5rem' }}>No agents available yet</div>
          <div style={{ color: C.muted, fontSize: '0.8rem', marginBottom: '1.5rem' }}>
            Be the first to create and list your trading agent.
          </div>
          <button onClick={() => router.push('/agents/submit')} style={{
            background: C.blue, border: 'none', borderRadius: 7,
            padding: '0.55rem 1rem', color: '#fff', fontWeight: 700,
            fontSize: '0.8rem', cursor: 'pointer',
          }}>
            Create Agent
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
          {displayed.map((listing, idx) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              rank={idx + 1}
              isSubscribed={subscribed.has(listing.id)}
              subscribing={subscribing === listing.id}
              onSubscribe={() => handleSubscribe(listing)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ListingCard({
  listing, rank, isSubscribed, subscribing, onSubscribe,
}: {
  listing: Listing
  rank: number
  isSubscribed: boolean
  subscribing: boolean
  onSubscribe: () => void
}) {
  const rankColors: Record<number, string> = { 1: C.gold, 2: '#C0C0C0', 3: '#CD7F32' }
  const rankColor = rankColors[rank] ?? C.faint

  return (
    <div style={{
      background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem',
      transition: 'border-color 0.15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = C.border2)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
    >
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div style={{
          background: C.bg3, borderRadius: 8, padding: '0.4rem 0.6rem',
          fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.75rem',
          color: rankColor, minWidth: 32, textAlign: 'center',
        }}>
          #{rank}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: C.white, fontSize: '0.9rem', marginBottom: '0.2rem' }}>
            {listing.name}
          </div>
          {listing.description && (
            <div style={{ color: C.muted, fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {listing.description}
            </div>
          )}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: C.faint, whiteSpace: 'nowrap' }}>
          {listing.primary_symbol || listing.ticker}
        </div>
      </div>

      {/* Key metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
        <MetricCell label="Sharpe" value={(listing.sharpe ?? 0) > 0 ? listing.sharpe!.toFixed(2) : '—'} color={(listing.sharpe ?? 0) > 1 ? C.mint : C.orange} />
        <MetricCell label="Return" value={typeof (listing as any).return30d === 'number' ? `${(listing as any).return30d >= 0 ? '+' : ''}${(listing as any).return30d.toFixed(0)}%` : '—'} color={(listing as any).return30d > 0 ? C.mint : C.red} />
        <MetricCell label="Max DD" value={listing.maxDD != null ? `${listing.maxDD.toFixed(0)}%` : '—'} color={(listing.maxDD ?? 0) > 30 ? C.red : C.muted} />
        <MetricCell label="Win Rate" value={listing.winRate != null ? `${listing.winRate.toFixed(0)}%` : '—'} color={(listing.winRate ?? 0) > 50 ? C.mint : C.muted} />
      </div>

      {/* Tags - show strategy type as tag */}
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
        <span style={{
          background: C.blue + '18', border: `1px solid ${C.blue}30`,
          borderRadius: 20, padding: '0.15rem 0.55rem',
          fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: C.blue,
        }}>{listing.asset_class || 'crypto'}</span>
        <span style={{
          background: C.muted + '18', border: `1px solid ${C.muted}30`,
          borderRadius: 20, padding: '0.15rem 0.55rem',
          fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: C.muted,
        }}>{listing.isLive ? 'LIVE' : 'BACKTEST'}</span>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '0.5rem', borderTop: `1px solid ${C.border}` }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, color: C.white, fontSize: '0.95rem' }}>
            ${((listing.share_price_cents ?? 10000) / 100).toFixed(2)}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: C.faint }}>
            {listing.subscriber_count} subscriber{(listing.subscriber_count ?? 0) !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link href={`/agents/${listing.slug}`} target="_blank" rel="noopener noreferrer" style={{ padding: '.35rem .75rem', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: '.7rem', fontWeight: 600, textDecoration: 'none' }}>
            View
          </Link>
          <button
            onClick={onSubscribe}
            disabled={subscribing || isSubscribed}
            style={{
              padding: '.35rem .85rem',
              borderRadius: 8,
              border: 0,
              background: isSubscribed ? 'rgba(0,229,153,.15)' : C.blue,
              color: isSubscribed ? C.mint : '#fff',
              fontSize: '.7rem',
              fontWeight: 700,
              cursor: isSubscribed ? 'default' : 'pointer',
            }}
          >
            {isSubscribed ? 'Manage' : 'View on Exchange'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MetricCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: C.faint, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>{label}</div>
      <div style={{ fontWeight: 700, color, fontSize: '0.85rem' }}>{value}</div>
    </div>
  )
}
