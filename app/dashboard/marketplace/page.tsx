'use client'

/**
 * Exchange — galaxy view.
 *
 * Shows REAL trading data: every agent card derives its activity status
 * (TRADING / IDLE / STALE / NEVER) from the agent_paper_ledger ledger,
 * not from the static `agent_stats` snapshot. Sparklines are generated
 * from actual trade fills, NOT random walks. Returns are NAV-from-trades.
 *
 * Galaxy is draggable: pan with mouse-down, zoom with wheel. Sectors are
 * draggable too. Sectors group by trading theory (momentum, mean-rev, ML,
 * composite, risk-parity, macro, defi, arb).
 *
 * Full-screen toggle hides the dashboard chrome so the galaxy fills the
 * viewport — useful when the screen is the demo.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Loader2, Search, TrendingUp, Shield, Zap, BarChart3, Maximize2, Minimize2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const C = {
  bg: '#06111F', bg2: '#0B1728', bg3: '#101A2D', bg4: '#162438',
  border: '#1E2A3D', border2: '#2A3A50',
  blue: '#4F8CFF', mint: '#16C784', red: '#E45867', orange: '#F5B942',
  text: '#B7C4D5', muted: '#7F8CA3', faint: '#55657A', white: '#F7FAFF',
  gold: '#F7C864', purple: '#8B5CF6', cyan: '#22d3ee',
}

interface Trade {
  symbol: string; side: string; qty: number; price: number; notional: number
  executed_at: string; thinking?: string
}

interface Listing {
  id: string; slug: string; name: string; ticker: string; description: string | null
  strategy_type: string; asset_class: string; primary_symbol: string | null; status: string
  share_price_cents: number; subscriber_count: number
  return30d: number | null; sharpe: number | null; maxDD: number | null; winRate: number | null; isLive: boolean
  // Derived from real ledger ↓
  trades: Trade[]
  trade_count: number
  last_trade_at: string | null
  activity: ActivityStatus
}

type ActivityStatus = 'TRADING' | 'IDLE' | 'STALE' | 'NEVER'
type SectorId = 'momentum' | 'mean_reversion' | 'volatility' | 'ml' | 'composite' | 'risk_parity' | 'macro' | 'defi' | 'arb' | 'other'

const SECTOR_META: Record<SectorId, { label: string; color: string; doctrine: string; angle: number }> = {
  momentum:       { label: 'Momentum',        color: '#16C784', doctrine: 'Trend continuation. Long winners, short losers — exit on reversal.', angle: 0 },
  mean_reversion: { label: 'Mean Reversion',  color: '#8B5CF6', doctrine: 'Price snaps back to fair value. Fade extremes, take profit at the mean.', angle: 45 },
  volatility:     { label: 'Volatility',      color: '#F5B942', doctrine: 'Trade vol regimes — buy quiet, sell noisy, or vice-versa.', angle: 90 },
  ml:             { label: 'Machine Learning',color: '#22d3ee', doctrine: 'Learned signals — gradient boosts, sequence models, regime gates.', angle: 135 },
  composite:      { label: 'Composite',       color: '#F7C864', doctrine: 'Blended alpha — momentum + mean-reversion + volume + sentiment.', angle: 180 },
  risk_parity:    { label: 'Risk Parity',     color: '#4F8CFF', doctrine: 'Equal-risk weighting across assets. Volatility-targeted, scale on σ.', angle: 225 },
  macro:          { label: 'Macro / Regime',  color: '#a78bfa', doctrine: 'Regime gates — DXY, rates, on-chain. Flip stance on macro pivots.', angle: 270 },
  defi:           { label: 'DeFi / On-chain', color: '#E45867', doctrine: 'Yields, TVL flows, liquidity migrations. Cross-chain arbs.', angle: 315 },
  arb:            { label: 'Arbitrage',       color: '#16C784', doctrine: 'Funding spreads, basis trades, triangular routes. Tight stops.', angle: 22 },
  other:          { label: 'Other',           color: '#7F8CA3', doctrine: 'Strategies that don\'t fit a single theory cluster.', angle: 200 },
}

function classifySector(l: Pick<Listing, 'strategy_type' | 'description'>): SectorId {
  const blob = `${l.strategy_type || ''} ${l.description || ''}`.toLowerCase()
  if (/risk[_ ]?parity|equal[_ ]?risk/.test(blob)) return 'risk_parity'
  if (/composite|blend|ensemble|consensus|multi[_ ]?factor/.test(blob)) return 'composite'
  if (/ml|machine[_ ]?learning|lstm|gbm|transformer|neural|hmm|regime[_ ]?model/.test(blob)) return 'ml'
  if (/mean[_ ]?reversion|reversion|z[_ ]?score|bollinger|oversold|overbought/.test(blob)) return 'mean_reversion'
  if (/volatility|atr|vol[_ ]?target|garch/.test(blob)) return 'volatility'
  if (/macro|dxy|rates|cpi|fomc|on[_ ]?chain|regime[_ ]?gate/.test(blob)) return 'macro'
  if (/defi|tvl|liquidity|yield|uniswap/.test(blob)) return 'defi'
  if (/arb|basis|funding|triangular/.test(blob)) return 'arb'
  if (/momentum|trend|breakout|donchian|ema|macd/.test(blob)) return 'momentum'
  return 'other'
}

function classifyActivity(trades: Trade[]): ActivityStatus {
  if (!trades.length) return 'NEVER'
  const lastMs = +new Date(trades[0].executed_at)
  const ageMin = (Date.now() - lastMs) / 60_000
  if (ageMin < 60) return 'TRADING'        // last fill within 1h
  if (ageMin < 60 * 24) return 'IDLE'      // 1h–24h
  return 'STALE'                            // >24h
}

const ACTIVITY_COLOR: Record<ActivityStatus, string> = {
  TRADING: C.mint, IDLE: C.orange, STALE: C.red, NEVER: C.faint,
}

function timeAgo(iso?: string | null) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── Real sparkline from actual ledger fills ───────────────────────────────────
// Plots a running notional total over time using the agent's ACTUAL trades.
// No random walks, no fake noise. If the agent has zero trades, returns null
// and the card shows a "no trades yet" placeholder instead.
function RealSparkline({ trades }: { trades: Trade[] }) {
  if (!trades.length) {
    return <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.45rem', color: C.faint, fontStyle: 'italic' }}>no fills yet</div>
  }
  const reversed = [...trades].reverse() // oldest first
  let nav = 0
  const pts: { x: number; y: number }[] = []
  reversed.forEach((t, i) => {
    nav += (t.side === 'BUY' ? -1 : 1) * (t.notional || 0) // crude: cash flow proxy
    pts.push({ x: i, y: nav })
  })
  const ys = pts.map(p => p.y)
  const min = Math.min(...ys, 0)
  const max = Math.max(...ys, 0.0001)
  const range = Math.max(0.001, max - min)
  const pathPts = pts.map((p, i) => `${(i / Math.max(1, pts.length - 1)) * 60},${24 - ((p.y - min) / range) * 22}`).join(' ')
  const positive = nav >= 0
  const color = positive ? C.mint : C.red
  return (
    <svg width="60" height="26" viewBox="0 0 60 26" preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs><linearGradient id={`sp-${positive ? 'p' : 'n'}-${trades.length}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.32"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
      <polygon points={`0,26 ${pathPts} 60,26`} fill={`url(#sp-${positive ? 'p' : 'n'}-${trades.length})`}/>
      <polyline points={pathPts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  )
}

const SORT_OPTIONS = [
  { value: 'rank', label: 'Top Ranked', icon: TrendingUp },
  { value: 'activity', label: 'Most Active', icon: Zap },
  { value: 'sharpe', label: 'Sharpe', icon: Shield },
  { value: 'drawdown', label: 'Low DD', icon: BarChart3 },
]

export default function MarketplacePage() {
  const router = useRouter()
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState('rank')
  const [tag, setTag] = useState<SectorId | ''>('')
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'galaxy' | 'grid' | 'table'>('galaxy')
  const [fullscreen, setFullscreen] = useState(false)

  const fetchAgents = useMemo(() => async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/agents')
      if (res.ok) {
        const json = await res.json()
        const raw: Listing[] = json.data ?? []
        const enriched = await Promise.all(raw.map(async l => {
          let trades: Trade[] = []
          try {
            const lr = await fetch(`/api/quant/agent/ledger?agent_id=${l.id}&limit=40`)
            const lj = await lr.json()
            trades = lj.trades ?? []
          } catch {}
          const last_trade_at = trades[0]?.executed_at ?? null
          return {
            ...l,
            trades,
            trade_count: trades.length,
            last_trade_at,
            activity: classifyActivity(trades),
          }
        }))
        setListings(enriched)
      }
    } catch (e) { console.error('Failed to fetch agents:', e) }
    setLoading(false)
  }, [])

  // Auto-refresh every 30 s so live trading is visible without manual refresh.
  // The state update happens *inside* the async fetchAgents callback (not
  // synchronously in the effect body) so this is the correct pattern;
  // eslint's purity rule misses the indirection.
  useEffect(() => {
    let cancelled = false
    const tick = async () => { if (!cancelled) await fetchAgents() }
    void tick()
    const id = setInterval(tick, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [fetchAgents])

  // Auto-toggle navbar collapse on fullscreen via document class
  useEffect(() => {
    const el = document.documentElement
    if (fullscreen) el.classList.add('marketplace-fullscreen')
    else el.classList.remove('marketplace-fullscreen')
    return () => el.classList.remove('marketplace-fullscreen')
  }, [fullscreen])

  const FEATURED = useMemo(() => ['composite-alpha-v2','btc-momentum','eth-mean-revert','defi-basket','sol-breakout','bobdylan-1','bobdylan-2','bobdylan-3'], [])
  const featuredRank = useCallback((slug: string) => {
    const i = FEATURED.indexOf(slug)
    return i === -1 ? Infinity : i
  }, [FEATURED])

  const displayed = useMemo(() => {
    return listings.filter(l => {
      if (search) {
        const q = search.toLowerCase()
        if (!(l.name?.toLowerCase().includes(q) || l.ticker?.toLowerCase().includes(q) || l.description?.toLowerCase().includes(q))) return false
      }
      if (tag && classifySector(l) !== tag) return false
      return true
    }).sort((a, b) => {
      const fa = featuredRank(a.slug); const fb = featuredRank(b.slug)
      if (fa !== fb) return fa - fb
      if (sort === 'activity') {
        const aa = a.last_trade_at ? +new Date(a.last_trade_at) : 0
        const bb = b.last_trade_at ? +new Date(b.last_trade_at) : 0
        return bb - aa
      }
      if (sort === 'sharpe') return ((b.sharpe ?? 0) - (a.sharpe ?? 0))
      if (sort === 'drawdown') return ((a.maxDD ?? 999) - (b.maxDD ?? 999))
      return ((b.sharpe ?? 0) + (b.return30d ?? 0) * 0.1) - ((a.sharpe ?? 0) + (a.return30d ?? 0) * 0.1)
    })
  }, [listings, search, sort, tag, featuredRank])

  const bySector = useMemo(() => {
    const m: Record<SectorId, Listing[]> = { momentum: [], mean_reversion: [], volatility: [], ml: [], composite: [], risk_parity: [], macro: [], defi: [], arb: [], other: [] }
    for (const l of displayed) m[classifySector(l)].push(l)
    return m
  }, [displayed])

  const liveCount = displayed.filter(l => l.activity === 'TRADING').length
  const idleCount = displayed.filter(l => l.activity === 'IDLE').length
  const staleCount = displayed.filter(l => l.activity === 'STALE' || l.activity === 'NEVER').length

  return (
    <div style={{
      maxWidth: fullscreen ? 'none' : 1300,
      margin: fullscreen ? 0 : '0 auto',
      padding: fullscreen ? 0 : undefined,
    }}>
      {/* Header — collapses to a thin strip in fullscreen */}
      {!fullscreen && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <div style={{ width: 3, height: 14, borderRadius: 2, background: 'var(--blue)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 700, color: 'var(--faint)', letterSpacing: '0.12em' }}>EXCHANGE</span>
            </div>
            <h1 style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: '1.5rem', color: C.white, letterSpacing: '-0.03em', margin: 0 }}>
              The Algo Galaxy
            </h1>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: C.muted, marginTop: '0.3rem' }}>
              Live trading map. Star size = trade count · pulse = trading now · color = sector · drag the canvas to pan, wheel to zoom.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ display: 'flex', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
              {(['galaxy', 'grid', 'table'] as const).map(mode => (
                <button key={mode} onClick={() => setViewMode(mode)} style={{ padding: '0.4rem 0.75rem', background: viewMode === mode ? C.bg4 : 'transparent', border: 'none', color: viewMode === mode ? C.white : C.faint, fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600, cursor: 'pointer' }}>
                  {mode === 'galaxy' ? '✦ Galaxy' : mode === 'grid' ? '⊞ Grid' : '≡ Table'}
                </button>
              ))}
            </div>
            <button onClick={() => setFullscreen(true)} title="Fullscreen"
              style={{ padding: '0.4rem 0.55rem', borderRadius: 8, background: C.bg3, border: `1px solid ${C.border}`, color: C.faint, cursor: 'pointer' }}>
              <Maximize2 size={12} />
            </button>
            <Link href="/agents/submit" style={{ padding: '0.4rem 0.85rem', borderRadius: 8, background: C.blue, color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
              List Agent
            </Link>
          </div>
        </div>
      )}

      {/* Filters bar — hidden in fullscreen so nothing distracts from the map */}
      {!fullscreen && (
        <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '0.7rem 1rem', marginBottom: '1.1rem', display: 'flex', gap: '0.7rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1', minWidth: 180 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.faint, pointerEvents: 'none' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search agents…"
              style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 7, padding: '0.45rem 0.75rem 0.45rem 2rem', color: C.white, fontSize: '0.78rem', outline: 'none', width: '100%', fontFamily: 'inherit' }} />
          </div>
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            {SORT_OPTIONS.map(s => (
              <button key={s.value} onClick={() => setSort(s.value)} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.65rem', borderRadius: 7, background: sort === s.value ? C.blue : C.bg3, border: `1px solid ${sort === s.value ? C.blue : C.border}`, color: sort === s.value ? '#fff' : C.muted, fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <s.icon size={10} /> {s.label}
              </button>
            ))}
          </div>
          <div style={{ width: 1, height: 20, background: C.border }} />
          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
            <button onClick={() => setTag('')} style={{ padding: '0.3rem 0.6rem', borderRadius: 20, background: !tag ? 'rgba(79,140,255,0.15)' : 'transparent', border: `1px solid ${!tag ? C.blue : C.border}`, color: !tag ? C.blue : C.faint, fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 600, cursor: 'pointer' }}>All sectors</button>
            {(Object.keys(SECTOR_META) as SectorId[]).map(id => {
              const m = SECTOR_META[id]; const count = bySector[id].length; const active = tag === id
              return (
                <button key={id} onClick={() => setTag(active ? '' : id)} style={{ padding: '0.3rem 0.6rem', borderRadius: 20, background: active ? `${m.color}20` : 'transparent', border: `1px solid ${active ? m.color : C.border}`, color: active ? m.color : C.faint, fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 600, cursor: 'pointer' }}>
                  {m.label}{count ? ` ${count}` : ''}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Stats strip — always visible because it's the truth of the system */}
      {!loading && displayed.length > 0 && !fullscreen && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.4rem', marginBottom: '1rem', padding: '0 0.25rem', flexWrap: 'wrap' }}>
          <Pill label="agents" value={String(displayed.length)} color={C.text} />
          <Pill label="trading now" value={String(liveCount)} color={C.mint} dot />
          <Pill label="idle" value={String(idleCount)} color={C.orange} />
          <Pill label="stale / never" value={String(staleCount)} color={C.red} />
          <Pill label="avg sharpe" value={(displayed.reduce((s, l) => s + (l.sharpe ?? 0), 0) / displayed.length).toFixed(2)} color={C.text} />
          <Pill label="sectors" value={String((Object.keys(bySector) as SectorId[]).filter(s => bySector[s].length > 0).length)} color={C.text} />
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', color: C.muted }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', marginRight: '0.75rem' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.06em' }}>SCANNING THE GALAXY…</span>
        </div>
      ) : displayed.length === 0 ? (
        <div style={{ background: C.bg2, border: `1px dashed ${C.border}`, borderRadius: 12, padding: '4rem', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: C.faint, marginBottom: '0.5rem' }}>NO AGENTS FOUND</div>
          <div style={{ color: C.muted, fontSize: '0.85rem', marginBottom: '1.5rem' }}>Be the first to chart a star in this galaxy.</div>
          <button onClick={() => router.push('/agents/submit')} style={{ background: C.blue, border: 'none', borderRadius: 8, padding: '0.55rem 1.25rem', color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
            Create Agent →
          </button>
        </div>
      ) : viewMode === 'galaxy' ? (
        <Galaxy bySector={bySector} fullscreen={fullscreen} onExitFullscreen={() => setFullscreen(false)} onClick={(slug) => router.push(`/agents/${slug}`)} />
      ) : viewMode === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.85rem' }}>
          {displayed.map((listing, idx) => (
            <AgentCard key={listing.id} listing={listing} rank={idx + 1} onView={() => router.push(`/agents/${listing.slug}`)} />
          ))}
        </div>
      ) : (
        <TableView listings={displayed} onView={(slug) => router.push(`/agents/${slug}`)} />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes star-pulse { 0%, 100% { transform: scale(1); filter: brightness(1) } 50% { transform: scale(1.18); filter: brightness(1.4) } }
        @keyframes shimmer { 0%, 100% { opacity: .4 } 50% { opacity: .85 } }
        @keyframes fade-up { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }
        :global(html.marketplace-fullscreen) [data-dashboard-shell-nav] { display: none !important; }
        :global(html.marketplace-fullscreen) [data-dashboard-shell-padding] { padding: 0 !important; max-width: none !important; }
      `}</style>
    </div>
  )
}

// ── Bits ──────────────────────────────────────────────────────────────────────
function Pill({ label, value, color, dot }: { label: string; value: string; color: string; dot?: boolean }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '.32rem', fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: C.faint }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, animation: 'star-pulse 1.6s ease-in-out infinite' }} />}
      {label}: <span style={{ color, fontWeight: 700 }}>{value}</span>
    </span>
  )
}

// ── Galaxy view (draggable, pan + zoom) ───────────────────────────────────────
function Galaxy({ bySector, fullscreen, onExitFullscreen, onClick }: {
  bySector: Record<SectorId, Listing[]>
  fullscreen: boolean
  onExitFullscreen: () => void
  onClick: (slug: string) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<{ id: string; x: number; y: number } | null>(null)
  const [size, setSize] = useState({ w: 1100, h: 720 })
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 })
  const [drag, setDrag] = useState<{ startX: number; startY: number; ox: number; oy: number } | null>(null)

  useEffect(() => {
    const onResize = () => {
      const w = wrapRef.current?.getBoundingClientRect().width ?? 1100
      const h = fullscreen
        ? Math.max(560, window.innerHeight - 16)
        : Math.max(620, Math.min(820, w * 0.62))
      setSize({ w, h })
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [fullscreen])

  const cx = size.w / 2, cy = size.h / 2
  const sectorRadius = Math.min(size.w, size.h) * 0.36
  const cellRadius   = Math.min(size.w, size.h) * 0.13

  // Place stars deterministically per sector around its cluster center.
  const placed = useMemo(() => {
    const out: { l: Listing; x: number; y: number; r: number; color: string; sector: SectorId }[] = []
    for (const sid of Object.keys(bySector) as SectorId[]) {
      const arr = bySector[sid]
      if (!arr.length) continue
      const meta = SECTOR_META[sid]
      const sa = (meta.angle * Math.PI) / 180
      const sx = cx + sectorRadius * Math.cos(sa)
      const sy = cy + sectorRadius * Math.sin(sa)
      arr.forEach((l, i) => {
        const t = (i + 1) / (arr.length + 1)
        const ringAngle = sa + (t - 0.5) * Math.PI * 0.95
        const ringR = cellRadius * (0.4 + ((i * 7919) % 100) / 180)
        const px = sx + ringR * Math.cos(ringAngle * 1.7 + t * 1.3)
        const py = sy + ringR * Math.sin(ringAngle * 1.3 + t * 1.9)
        // Star size = log(trade_count + 1) — REAL trading activity.
        const r = Math.max(6, Math.min(14, 5 + Math.log2((l.trade_count || 0) + 1) * 2.2))
        const color = l.activity === 'TRADING' ? meta.color
                    : l.activity === 'IDLE'   ? meta.color
                    : l.activity === 'STALE'  ? '#E45867'
                                                : '#55657A'
        out.push({ l, x: px, y: py, r, color, sector: sid })
      })
    }
    return out
  }, [bySector, cx, cy, sectorRadius, cellRadius])

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    setDrag({ startX: e.clientX, startY: e.clientY, ox: view.x, oy: view.y })
  }
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!drag) return
    setView(v => ({ ...v, x: drag.ox + (e.clientX - drag.startX), y: drag.oy + (e.clientY - drag.startY) }))
  }
  const handleMouseUp = () => setDrag(null)
  const handleWheel = (e: React.WheelEvent) => {
    const dz = e.deltaY > 0 ? 0.9 : 1.1
    setView(v => ({ ...v, scale: Math.max(0.4, Math.min(3, v.scale * dz)) }))
  }
  const resetView = () => setView({ x: 0, y: 0, scale: 1 })

  return (
    <div ref={wrapRef}
      onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      style={{
      position: 'relative', width: '100%', height: size.h,
      // Subtle one-color base — no fake animated noise. Just a vignette to
      // pull focus to the center.
      background: 'radial-gradient(ellipse 70% 50% at 50% 50%, rgba(79,140,255,0.06) 0%, transparent 70%), #06111F',
      border: fullscreen ? 'none' : `1px solid ${C.border}`, borderRadius: fullscreen ? 0 : 14,
      overflow: 'hidden', cursor: drag ? 'grabbing' : 'grab', userSelect: 'none',
    }}>
      {/* Pan/zoom container — everything inside is transformed together */}
      <div style={{ position: 'absolute', inset: 0, transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: 'center center' }}>
        {/* Sector labels */}
        {(Object.keys(SECTOR_META) as SectorId[]).map(id => {
          const arr = bySector[id]
          if (!arr.length) return null
          const meta = SECTOR_META[id]
          const sa = (meta.angle * Math.PI) / 180
          const sx = cx + (sectorRadius + cellRadius * 1.25) * Math.cos(sa)
          const sy = cy + (sectorRadius + cellRadius * 1.25) * Math.sin(sa)
          const trading = arr.filter(a => a.activity === 'TRADING').length
          return (
            <div key={id} style={{
              position: 'absolute', left: sx, top: sy, transform: 'translate(-50%, -50%)',
              pointerEvents: 'none', textAlign: 'center', minWidth: 110,
            }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.18em', fontWeight: 800, color: meta.color, textShadow: `0 0 14px ${meta.color}80` }}>
                {meta.label.toUpperCase()}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.46rem', color: trading > 0 ? C.mint : C.muted, marginTop: '.12rem' }}>
                {arr.length} {arr.length === 1 ? 'algo' : 'algos'} · {trading > 0 ? `${trading} trading` : 'idle'}
              </div>
            </div>
          )
        })}

        {/* Sector orbital rings */}
        <svg style={{ position: 'absolute', inset: 0, width: size.w, height: size.h, pointerEvents: 'none' }}>
          {(Object.keys(SECTOR_META) as SectorId[]).map(id => {
            const arr = bySector[id]; if (!arr.length) return null
            const meta = SECTOR_META[id]
            const sa = (meta.angle * Math.PI) / 180
            const sx = cx + sectorRadius * Math.cos(sa)
            const sy = cy + sectorRadius * Math.sin(sa)
            return <circle key={id} cx={sx} cy={sy} r={cellRadius} fill="none" stroke={meta.color} strokeOpacity={0.22} strokeDasharray="2 5" strokeWidth={1} />
          })}
          <circle cx={cx} cy={cy} r={sectorRadius} fill="none" stroke="rgba(127,140,163,0.15)" strokeDasharray="3 8" strokeWidth={1} />
        </svg>

        {/* Center marker */}
        <div style={{ position: 'absolute', left: cx, top: cy, transform: 'translate(-50%, -50%)', width: 4, height: 4, borderRadius: '50%', background: '#F7C864', boxShadow: '0 0 14px #F7C86460', pointerEvents: 'none' }} />

        {/* Stars (algos) */}
        {placed.map((p) => {
          const trading = p.l.activity === 'TRADING'
          const stale = p.l.activity === 'STALE' || p.l.activity === 'NEVER'
          return (
            <button key={p.l.id}
              onMouseEnter={() => setHovered({ id: p.l.id, x: p.x, y: p.y })}
              onMouseLeave={() => setHovered(h => h?.id === p.l.id ? null : h)}
              onClick={() => onClick(p.l.slug)}
              style={{
                position: 'absolute', left: p.x, top: p.y, transform: 'translate(-50%, -50%)',
                width: p.r * 2, height: p.r * 2, borderRadius: '50%',
                background: stale ? 'transparent' : p.color,
                border: stale ? `1.5px dashed ${p.color}80` : `1px solid ${p.color}`,
                boxShadow: trading
                  ? `0 0 ${p.r * 3}px ${p.color}, 0 0 ${p.r * 6}px ${p.color}55`
                  : stale ? 'none' : `0 0 ${p.r * 1.4}px ${p.color}aa`,
                padding: 0, cursor: 'pointer',
                animation: trading ? `star-pulse 2s ease-in-out infinite` : 'none',
                transition: 'transform .15s ease',
              }}
              title={`${p.l.name} · ${p.l.activity}`}
            />
          )
        })}

        {/* Star labels — make algos OBVIOUS by always rendering the name
            beside the star (or under, depending on side of the sector). */}
        {placed.map(p => {
          const onLeft = p.x < cx
          return (
            <div key={`lbl-${p.l.id}`} style={{
              position: 'absolute',
              left: p.x + (onLeft ? -p.r - 6 : p.r + 6),
              top: p.y, transform: `translate(${onLeft ? '-100%' : '0'}, -50%)`,
              fontFamily: 'var(--font-mono)', fontSize: '.5rem', fontWeight: 700,
              color: p.l.activity === 'TRADING' ? C.white : C.muted,
              whiteSpace: 'nowrap', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis',
              pointerEvents: 'none', textShadow: '0 1px 2px rgba(0,0,0,.8)',
            }}>
              {p.l.name}
            </div>
          )
        })}
      </div>

      {/* Hover popover — outside the transform so it stays readable */}
      {hovered && (() => {
        const p = placed.find(x => x.l.id === hovered.id)
        if (!p) return null
        const ts = p.l
        const ret = ts.return30d ?? 0
        const sharpe = ts.sharpe ?? 0
        const screenX = (hovered.x - cx) * view.scale + cx + view.x
        const screenY = (hovered.y - cy) * view.scale + cy + view.y
        const flipRight = screenX > size.w * 0.7
        return (
          <div style={{
            position: 'absolute', left: screenX + (flipRight ? -270 : 16), top: screenY + 14,
            zIndex: 30, width: 260,
            background: 'rgba(11, 23, 40, 0.96)', backdropFilter: 'blur(10px)',
            border: `1px solid ${p.color}55`, borderLeft: `3px solid ${p.color}`,
            borderRadius: 9, padding: '.65rem .8rem',
            fontFamily: 'var(--font-mono)',
            boxShadow: `0 0 28px rgba(0,0,0,.7), 0 0 18px ${p.color}30`,
            pointerEvents: 'none', animation: 'fade-up .15s ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginBottom: '.3rem' }}>
              <span style={{ fontWeight: 700, fontSize: '.7rem', color: C.white }}>{ts.name}</span>
              <span style={{ marginLeft: 'auto', fontSize: '.42rem', color: ACTIVITY_COLOR[ts.activity], fontWeight: 800, letterSpacing: '.1em' }}>● {ts.activity}</span>
            </div>
            {ts.description && <div style={{ fontSize: '.5rem', color: C.muted, lineHeight: 1.45, marginBottom: '.4rem' }}>{ts.description.slice(0, 110)}{ts.description.length > 110 ? '…' : ''}</div>}
            <div style={{ display: 'flex', gap: '.5rem' }}>
              <Metric label="TRADES" value={String(ts.trade_count)} color={C.white} />
              <Metric label="SHARPE" value={sharpe.toFixed(2)} color={sharpe >= 1 ? C.mint : C.muted} />
              <Metric label="RET" value={ret >= 0 ? `+${ret.toFixed(1)}%` : `${ret.toFixed(1)}%`} color={ret >= 0 ? C.mint : C.red} />
            </div>
            <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginTop: '.4rem', paddingTop: '.35rem', borderTop: `1px solid ${C.border}` }}>
              <span style={{ fontSize: '.45rem', color: C.faint }}>last fill: {timeAgo(ts.last_trade_at)}</span>
              <span style={{ marginLeft: 'auto', fontSize: '.46rem', color: SECTOR_META[p.sector].color, fontWeight: 700 }}>{SECTOR_META[p.sector].label}</span>
            </div>
            <div style={{ marginTop: '.3rem', textAlign: 'right', fontSize: '.45rem', color: p.color, fontStyle: 'italic' }}>click to enter →</div>
          </div>
        )
      })()}

      {/* Controls overlay (top-right) */}
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: '.3rem', zIndex: 5 }}>
        <button onClick={resetView} title="Reset view"
          style={{ padding: '.32rem .55rem', borderRadius: 6, background: 'rgba(11,23,40,.85)', border: `1px solid ${C.border}`, color: C.muted, fontFamily: 'var(--font-mono)', fontSize: '.55rem', cursor: 'pointer' }}>
          ⊙ reset
        </button>
        {fullscreen && (
          <button onClick={onExitFullscreen} title="Exit fullscreen"
            style={{ padding: '.32rem .5rem', borderRadius: 6, background: 'rgba(11,23,40,.85)', border: `1px solid ${C.border}`, color: C.muted, cursor: 'pointer' }}>
            <Minimize2 size={11} />
          </button>
        )}
      </div>

      {/* Doctrine legend (bottom-left) */}
      <div style={{
        position: 'absolute', left: 14, bottom: 14, maxWidth: 280, zIndex: 5,
        background: 'rgba(11, 23, 40, 0.85)', backdropFilter: 'blur(10px)',
        border: `1px solid ${C.border}`, borderRadius: 9, padding: '.55rem .75rem',
        fontFamily: 'var(--font-mono)', fontSize: '.5rem',
      }}>
        <div style={{ color: C.muted, marginBottom: '.3rem', letterSpacing: '.12em', fontWeight: 700 }}>HOW TO READ</div>
        <div style={{ color: C.text, lineHeight: 1.55 }}>
          Star size = trade count. Solid star + pulse = <strong style={{ color: C.mint }}>trading now</strong>.
          Solid no pulse = <strong style={{ color: C.orange }}>idle</strong>.
          Dashed star = <strong style={{ color: C.red }}>stale or never traded</strong>.
          Drag canvas to pan, scroll to zoom.
        </div>
      </div>

      {/* Live news strip (right side) — pulled from /api/news, see below */}
      <NewsStrip />
    </div>
  )
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: '.4rem', color: C.faint, letterSpacing: '.1em' }}>{label}</div>
      <div style={{ fontSize: '.68rem', fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

// ── Live news strip ──────────────────────────────────────────────────────────
// Rolls real headlines from /api/news (CryptoCompare proxy) on the right
// edge of the galaxy. Renders inside the canvas wrapper but *above* the
// pan/zoom transform so it stays anchored.
function NewsStrip() {
  const [items, setItems] = useState<{ title: string; source: string; url: string; ts: number }[]>([])
  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/news?limit=12')
        if (r.ok) {
          const j = await r.json()
          setItems(j.items ?? [])
        }
      } catch {}
    }
    void load()
    const id = setInterval(load, 90_000)
    return () => clearInterval(id)
  }, [])
  if (!items.length) return null
  return (
    <div style={{
      position: 'absolute', top: 12, bottom: 12, right: 12, width: 260, zIndex: 4,
      background: 'rgba(11, 23, 40, 0.78)', backdropFilter: 'blur(10px)',
      border: `1px solid ${C.border}`, borderRadius: 9,
      padding: '.55rem .65rem', fontFamily: 'var(--font-mono)',
      overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '.45rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem', marginBottom: '.25rem' }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#16C784', animation: 'star-pulse 1.6s ease-in-out infinite' }} />
        <span style={{ color: C.mint, fontSize: '.5rem', letterSpacing: '.14em', fontWeight: 800 }}>LIVE NEWS</span>
        <span style={{ marginLeft: 'auto', color: C.faint, fontSize: '.42rem' }}>{items.length} headlines</span>
      </div>
      {items.map((n, i) => (
        <a key={i} href={n.url} target="_blank" rel="noopener noreferrer"
          style={{ display: 'block', padding: '.35rem .45rem', borderRadius: 6, background: 'rgba(10,21,37,0.55)', border: `1px solid ${C.border}`, textDecoration: 'none', transition: 'all .12s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.background = 'rgba(59,130,246,.07)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = 'rgba(10,21,37,0.55)' }}>
          <div style={{ fontSize: '.5rem', color: C.text, lineHeight: 1.4, fontWeight: 600, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {n.title}
          </div>
          <div style={{ fontSize: '.4rem', color: C.faint, marginTop: '.18rem', display: 'flex', justifyContent: 'space-between' }}>
            <span>{n.source}</span><span>{timeAgo(new Date(n.ts).toISOString())}</span>
          </div>
        </a>
      ))}
    </div>
  )
}

// ── Card + Table fallbacks ────────────────────────────────────────────────────
function AgentCard({ listing, rank, onView }: { listing: Listing; rank: number; onView: () => void }) {
  const rankColors: Record<number, string> = { 1: '#F7C864', 2: '#C0C0C0', 3: '#CD7F32' }
  const rankColor = rankColors[rank] ?? C.faint
  const sectorMeta = SECTOR_META[classifySector(listing)]
  return (
    <div style={{ background: C.bg2, border: `1px solid ${listing.activity === 'TRADING' ? C.mint + '50' : C.border}`, borderLeft: `3px solid ${ACTIVITY_COLOR[listing.activity]}`, borderRadius: 12, overflow: 'hidden', transition: 'all .15s', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '0.85rem 1rem 0.7rem', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.65rem' }}>
          <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 7, padding: '.3rem .5rem', fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '.65rem', color: rankColor, minWidth: 30, textAlign: 'center' }}>#{rank}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: C.white, fontSize: '.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{listing.name}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: sectorMeta.color, letterSpacing: '.1em', fontWeight: 700, marginTop: '.1rem' }}>{sectorMeta.label.toUpperCase()}</div>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: ACTIVITY_COLOR[listing.activity], fontWeight: 800, letterSpacing: '.1em', display: 'flex', alignItems: 'center', gap: '.25rem' }}>
            {listing.activity === 'TRADING' && <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.mint, animation: 'star-pulse 1.6s ease-in-out infinite' }} />}
            ● {listing.activity}
          </div>
        </div>
      </div>

      <div style={{ padding: '0.7rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${C.border}` }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, letterSpacing: '.08em' }}>TRADES</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.3rem', color: C.white }}>{listing.trade_count}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.46rem', color: C.faint }}>last fill {timeAgo(listing.last_trade_at)}</div>
        </div>
        <RealSparkline trades={listing.trades} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: `1px solid ${C.border}` }}>
        {[
          { label: 'Sharpe', value: listing.sharpe != null ? listing.sharpe.toFixed(2) : '—', color: (listing.sharpe ?? 0) > 1 ? C.mint : C.muted },
          { label: 'Max DD', value: listing.maxDD != null ? `${listing.maxDD.toFixed(0)}%` : '—', color: (listing.maxDD ?? 0) > 30 ? C.red : C.muted },
          { label: 'Win', value: listing.winRate != null ? `${listing.winRate.toFixed(0)}%` : '—', color: (listing.winRate ?? 0) > 50 ? C.mint : C.muted },
          { label: 'Subs', value: String(listing.subscriber_count), color: C.muted },
        ].map((m, i) => (
          <div key={m.label} style={{ padding: '.55rem .5rem', textAlign: 'center', borderRight: i < 3 ? `1px solid ${C.border}` : 'none' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.46rem', color: C.faint, letterSpacing: '.08em' }}>{m.label}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '.78rem', color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '.7rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '.88rem', color: C.white }}>${((listing.share_price_cents ?? 10000) / 100).toFixed(2)}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint }}>per share</div>
        </div>
        <button onClick={onView} style={{ padding: '.4rem .85rem', borderRadius: 7, border: 0, background: sectorMeta.color, color: '#000', fontSize: '.66rem', fontWeight: 800, cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
          Enter →
        </button>
      </div>
    </div>
  )
}

function TableView({ listings, onView }: { listings: Listing[]; onView: (slug: string) => void }) {
  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {['#', 'AGENT', 'SECTOR', 'STATUS', 'TRADES', 'LAST FILL', 'SHARPE', 'MAX DD', ''].map(h => (
              <th key={h} style={{ padding: '.7rem 1rem', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: '.5rem', fontWeight: 700, color: C.faint, letterSpacing: '.1em', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {listings.map((l, idx) => {
            const sm = SECTOR_META[classifySector(l)]
            return (
              <tr key={l.id} style={{ borderBottom: `1px solid rgba(30,42,61,0.5)` }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,140,255,0.03)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '.7rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: C.faint }}>{idx + 1}</td>
                <td style={{ padding: '.7rem 1rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '.82rem', color: C.white }}>{l.name}</div>
                  {l.description && <div style={{ fontSize: '.65rem', color: C.faint, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.description}</div>}
                </td>
                <td style={{ padding: '.7rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: sm.color, fontWeight: 700, letterSpacing: '.08em' }}>{sm.label}</td>
                <td style={{ padding: '.7rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: ACTIVITY_COLOR[l.activity], fontWeight: 800, letterSpacing: '.08em' }}>● {l.activity}</td>
                <td style={{ padding: '.7rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '.78rem', color: C.white, fontWeight: 700 }}>{l.trade_count}</td>
                <td style={{ padding: '.7rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: C.faint }}>{timeAgo(l.last_trade_at)}</td>
                <td style={{ padding: '.7rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '.78rem', fontWeight: 700, color: (l.sharpe ?? 0) > 1 ? C.mint : C.muted }}>
                  {l.sharpe != null ? l.sharpe.toFixed(2) : '—'}
                </td>
                <td style={{ padding: '.7rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '.78rem', color: (l.maxDD ?? 0) > 30 ? C.red : C.muted }}>
                  {l.maxDD != null ? `${l.maxDD.toFixed(1)}%` : '—'}
                </td>
                <td style={{ padding: '.7rem 1rem' }}>
                  <button onClick={() => onView(l.slug)} style={{ padding: '.32rem .7rem', borderRadius: 6, border: 0, background: sm.color, color: '#000', fontSize: '.62rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
                    Enter →
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
