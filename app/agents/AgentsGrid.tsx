'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

interface AgentDisplay {
  id: string
  slug: string
  name: string
  ticker: string
  description: string | null
  strategy_type: string
  asset_class: string
  primary_symbol: string | null
  status?: string | null
  return30d: number | null
  sharpe: number | null
  maxDD: number | null
  winRate: number | null
  nav: number
  subscriber_count: number
  isSubscribed: boolean
  isLive: boolean
  todayReturn: number | null
}

const strategyColor: Record<string, string> = {
  momentum:                '#4f7cff',
  mean_reversion:          '#10b981',
  trend_following:         '#818cf8',
  crypto_momentum:         '#ff6b35',
  crypto_mean_reversion:   '#06b6d4',
  equity_momentum:         '#f59e0b',
  equity_mean_reversion:   '#8b5cf6',
  equity_rotation:         '#ec4899',
}

const ASSET_CLASS_LABELS: Record<string, string> = {
  crypto: 'Crypto',
  equity: 'Equities',
  multi: 'Multi-Asset',
}

const RISK_LABELS: Record<string, string> = {
  crypto_momentum: 'HIGH',
  crypto_mean_reversion: 'MEDIUM',
  trend_following: 'MEDIUM',
  equity_momentum: 'MEDIUM',
  equity_mean_reversion: 'LOW',
  equity_rotation: 'MEDIUM',
}

function SparklineMini({ positive }: { positive: boolean }) {
  const color = positive ? '#00E599' : '#FF5A5F'
  const pts = positive
    ? '0,35 12,30 20,32 28,25 35,28 42,20 50,22 58,18 65,22 72,15 80,10'
    : '0,10 12,15 20,18 28,22 35,20 42,28 50,25 58,32 65,28 72,35 80,40'
  const fillPts = `0,40 ${pts} 80,40`
  return (
    <svg width={80} height={40} viewBox="0 0 80 40" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`sg-${positive}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={fillPts} fill={`url(#sg-${positive})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function fmtPct(n: number | null): string {
  if (n === null) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

function AgentCard({ agent }: { agent: AgentDisplay }) {
  const sColor = strategyColor[agent.strategy_type] ?? '#4f7cff'
  const pos = (agent.return30d ?? 0) >= 0
  const risk = RISK_LABELS[agent.strategy_type] ?? 'MED'
  const riskColor = risk === 'HIGH' ? 'var(--red)' : risk === 'MEDIUM' ? 'var(--yellow)' : 'var(--mint)'
  const assetLabel = ASSET_CLASS_LABELS[agent.asset_class] ?? agent.asset_class ?? 'Multi'

  return (
    <div style={{
      background: 'var(--bg2)',
      border: '1px solid var(--border)',
      borderRadius: 16,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      transition: 'border-color .15s, transform .15s',
      cursor: 'pointer',
    }}
    onMouseEnter={e => {
      (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(59,127,255,.4)'
      ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'
    }}
    onMouseLeave={e => {
      (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'
      ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'
    }}
    >
      {/* Card header */}
      <div style={{ padding: '1.1rem 1.1rem .75rem', borderBottom: '1px solid rgba(30,55,100,.2)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: `${sColor}18`, border: `1px solid ${sColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', fontWeight: 800, color: sColor }}>${agent.ticker}</span>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '.9rem', color: 'var(--white)', lineHeight: 1.2 }}>{agent.name}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', marginTop: '.1rem' }}>{agent.primary_symbol ?? '—'}</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.2rem' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 800, color: pos ? 'var(--mint)' : 'var(--red)', letterSpacing: '-.02em' }}>
              {fmtPct(agent.return30d)}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: 'var(--faint)' }}>
              {agent.isLive ? 'LIVE' : 'BACKTEST'}
            </span>
          </div>
        </div>
        {/* Tags */}
        <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', fontWeight: 700, color: sColor, background: `${sColor}12`, border: `1px solid ${sColor}25`, borderRadius: 5, padding: '.18rem .45rem' }}>
            {assetLabel}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', fontWeight: 700, color: riskColor, background: `${riskColor}12`, border: `1px solid ${riskColor}25`, borderRadius: 5, padding: '.18rem .45rem' }}>
            {risk} RISK
          </span>
          {agent.isSubscribed && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', fontWeight: 700, color: 'var(--mint)', background: 'rgba(0,229,153,.1)', border: '1px solid rgba(0,229,153,.25)', borderRadius: 5, padding: '.18rem .45rem' }}>
              SUBSCRIBED
            </span>
          )}
          {agent.status === 'pending_review' && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', fontWeight: 700, color: 'var(--orange)', background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 5, padding: '.18rem .45rem' }}>
              PENDING
            </span>
          )}
        </div>
      </div>

      {/* Chart area */}
      <div style={{ padding: '.75rem 1.1rem', borderBottom: '1px solid rgba(30,55,100,.2)' }}>
        <SparklineMini positive={pos} />
      </div>

      {/* Stats */}
      <div style={{ padding: '.75rem 1.1rem', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '.5rem', borderBottom: '1px solid rgba(30,55,100,.2)' }}>
        {[
          { label: 'Sharpe', value: agent.sharpe !== null ? agent.sharpe.toFixed(2) : '—', color: agent.sharpe !== null && agent.sharpe > 1 ? 'var(--white)' : 'var(--muted)' },
          { label: 'Max DD', value: agent.maxDD !== null ? `${agent.maxDD.toFixed(1)}%` : '—', color: 'var(--red)' },
          { label: 'Win Rate', value: agent.winRate !== null ? `${agent.winRate.toFixed(0)}%` : '—', color: 'var(--muted)' },
        ].map(item => (
          <div key={item.label} style={{ textAlign: 'center', padding: '.4rem .25rem', background: 'var(--bg3)', borderRadius: 7 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: 'var(--faint)', letterSpacing: '.06em', marginBottom: '.15rem' }}>{item.label}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.78rem', fontWeight: 700, color: item.color }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: '.75rem 1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)' }}>
          <span style={{ color: 'var(--muted)' }}>{agent.subscriber_count}</span> subscribers
        </div>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <Link href={`/agents/${agent.slug}`} target="_blank" rel="noopener noreferrer" style={{ padding: '.35rem .75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: '.7rem', fontWeight: 600, textDecoration: 'none' }}>
            View
          </Link>
          <Link
            href={`/agents/${agent.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '.35rem .85rem',
              borderRadius: 8,
              border: 0,
              background: agent.isSubscribed ? 'rgba(0,229,153,.15)' : 'var(--blue)',
              color: agent.isSubscribed ? 'var(--mint)' : '#fff',
              fontSize: '.7rem',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            {agent.isSubscribed ? 'Manage' : 'View on Exchange'}
          </Link>
        </div>
      </div>
    </div>
  )
}

interface AgentsGridProps {
  agents: AgentDisplay[]
}

export default function AgentsGrid({ agents: rawAgents }: AgentsGridProps) {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'return' | 'sharpe' | 'drawdown' | 'popular'>('return')

  const agents = rawAgents

  const filtered = useMemo(() => {
    let list = [...agents]

    // Search
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.primary_symbol?.toLowerCase().includes(q) ||
        a.ticker.toLowerCase().includes(q) ||
        a.strategy_type.toLowerCase().includes(q)
      )
    }

    // Sort
    switch (sortBy) {
      case 'return':    list.sort((a, b) => (b.return30d ?? -999) - (a.return30d ?? -999)); break
      case 'sharpe':     list.sort((a, b) => (b.sharpe ?? -999) - (a.sharpe ?? -999)); break
      case 'drawdown':   list.sort((a, b) => (a.maxDD ?? 999) - (b.maxDD ?? 999)); break
      case 'popular':    list.sort((a, b) => b.subscriber_count - a.subscriber_count); break
    }

    return list
  }, [agents, search, sortBy])

  const totalSubscribers = agents.reduce((s, a) => s + a.subscriber_count, 0)
  const avgReturn = agents.filter(a => a.return30d !== null).reduce((s, a) => s + (a.return30d ?? 0), 0) / Math.max(agents.filter(a => a.return30d !== null).length, 1)
  const cryptoCount = agents.filter(a => a.asset_class === 'crypto').length
  const liveCount = agents.filter(a => a.isLive).length

  return (
    <>
      {/* Top strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '.75rem', marginBottom: '1.5rem' }} className="exchange-top-strip">
        {[
          { label: 'Total Agents', value: agents.length.toString(), color: 'var(--white)' },
          { label: 'Live Now', value: liveCount.toString(), color: 'var(--mint)' },
          { label: 'Subscribers', value: totalSubscribers.toString(), color: 'var(--muted)' },
          { label: 'Avg Return', value: avgReturn !== 0 ? fmtPct(avgReturn) : '--', color: avgReturn >= 0 ? 'var(--mint)' : 'var(--red)' },
          { label: 'Strategies', value: `${cryptoCount} Crypto`, color: 'var(--faint)', small: true },
        ].map(item => (
          <div key={item.label} style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg2)', padding: '.85rem 1.1rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: item.small ? '.48rem' : '.52rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.25rem', textTransform: 'uppercase' }}>{item.label}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: item.small ? '.78rem' : '1.05rem', color: item.color, letterSpacing: '-.01em' }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Search + filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 280px', minWidth: 200 }}>
          <svg style={{ position: 'absolute', left: '.85rem', top: '50%', transform: 'translateY(-50%)', opacity: .4 }} width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth={2}>
            <circle cx={11} cy={11} r={8} /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search agents, tickers, strategies..."
            style={{ width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '.6rem 1rem .6rem 2.5rem', color: 'var(--white)', fontFamily: 'var(--font-body)', fontSize: '.82rem', outline: 'none', boxSizing: 'border-box', transition: 'border-color .15s' }}
            onFocus={e => (e.target.style.borderColor = 'rgba(59,127,255,.4)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
          />
        </div>

        {/* Sort */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginLeft: 'auto' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)' }}>SORT:</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '.38rem .65rem', color: 'var(--white)', fontFamily: 'var(--font-mono)', fontSize: '.68rem', cursor: 'pointer', outline: 'none' }}
          >
            <option value="return">Best Return</option>
            <option value="sharpe">Highest Sharpe</option>
            <option value="drawdown">Lowest Drawdown</option>
            <option value="popular">Most Popular</option>
          </select>
        </div>
      </div>

      {/* Results count */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', marginBottom: '1rem' }}>
        Showing {filtered.length} of {agents.length} crypto agents
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '4rem 2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '.75rem', opacity: 0.3 }}>🔍</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', fontWeight: 600, marginBottom: '.4rem' }}>No agents found</div>
          <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>Try adjusting your search or filters.</div>
          <button onClick={() => setSearch('')} style={{ marginTop: '1rem', padding: '.45rem 1.2rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: '.78rem', cursor: 'pointer' }}>Clear search</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem' }} className="agents-grid">
          {filtered.map(agent => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}

      <style>{`
        @media(max-width: 1100px) { .agents-grid { grid-template-columns: repeat(2,1fr) !important } }
        @media(max-width: 680px) { .agents-grid { grid-template-columns: 1fr !important } }
        @media(max-width: 600px) { .exchange-top-strip { grid-template-columns: repeat(2,1fr) !important } }
      `}</style>
    </>
  )
}
