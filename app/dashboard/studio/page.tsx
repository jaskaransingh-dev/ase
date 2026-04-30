'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { AGENT_CONFIGS } from '@/lib/agents'
import type { AgentConfig } from '@/lib/agents'
import { createClient } from '@/lib/supabase/client'
import { DEFAULT_STRATEGY_TS, DEFAULT_CONFIG_JSON } from '@/lib/backtest-config'

const C = {
  bg: '#06111F',
  bg2: '#0B1728',
  bg3: '#101A2D',
  bg4: '#152238',
  border: '#1A2640',
  blue: '#3B82F6',
  blue2: '#2563EB',
  mint: '#10B981',
  mint2: '#059669',
  amber: '#F59E0B',
  red: '#EF4444',
  purple: '#8B5CF6',
  muted: '#6B7280',
  faint: '#374151',
  white: '#F9FAFB',
  text: '#9CA3AF',
}

type AgentStatus = 'active' | 'paused' | 'draft'
type View = 'manage' | 'build' | 'docs'

interface AgentSave {
  id: string
  name: string
  description: string
  tagline: string
  ticker: string
  status: AgentStatus
  published: boolean
  updatedAt: string
  strategyCode?: string
  configJson?: string
  version?: number
}

interface DbAgent {
  id: string
  name: string
  slug: string
  ticker?: string
  description: string
  strategy_type: string
  status: string
  total_aum_cents: number
  share_price_cents?: number
  signal_summary?: string
  last_run_at?: string
  owner_id: string
  monthly_fee_cents?: number
  isLive?: boolean
  subscriber_count?: number
  backtest_stats?: Record<string, unknown> | null
  agent_stats?: { nav_cents: number; total_return_pct: number; sharpe_ratio: number; max_drawdown_pct: number; win_rate_pct: number; total_trades: number } | null
  [key: string]: unknown
}

function getStorageKey(userId: string) {
  return `ase_agent_saves_${userId}`
}

function loadSaves(userId: string): Record<string, AgentSave> {
  if (!userId) return {}
  try {
    return JSON.parse(localStorage.getItem(getStorageKey(userId)) ?? '{}')
  } catch { return {} }
}

function persistSaves(userId: string, saves: Record<string, AgentSave>) {
  if (!userId) return
  localStorage.setItem(getStorageKey(userId), JSON.stringify(saves))
}

function mergeAgent(base: AgentConfig, save?: AgentSave): AgentSave {
  return {
    id: base.id,
    name: save?.name ?? base.name,
    description: save?.description ?? base.description,
    tagline: save?.tagline ?? base.tagline,
    ticker: save?.ticker ?? base.ticker,
    status: save?.status ?? (base.id === 'composite-alpha-v2' ? 'active' : 'draft'),
    published: save?.published ?? (base.id === 'composite-alpha-v2'),
    updatedAt: save?.updatedAt ?? new Date().toISOString(),
    strategyCode: save?.strategyCode ?? DEFAULT_STRATEGY_TS,
    configJson: save?.configJson ?? DEFAULT_CONFIG_JSON,
    version: save?.version ?? 1,
  }
}

const PUBLISH_REQUIREMENTS = [
  { key: 'desc', label: 'Strategy description (> 50 chars)' },
  { key: 'ticker', label: 'Ticker symbol set' },
  { key: 'backtest', label: 'Backtest completed' },
  { key: 'approved', label: 'Risk review approved' },
]

export default function StudioPage() {
  const router = useRouter()
  const [view, setView] = useState<View>('manage')
  const [userId, setUserId] = useState('')
  const [saves, setSaves] = useState<Record<string, AgentSave>>({})
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'paused' | 'draft'>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<AgentSave>>({})
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [publishConfirmed, setPublishConfirmed] = useState(false)
  const [dbAgents, setDbAgents] = useState<DbAgent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? 'anonymous'
      setUserId(id)
      setSaves(loadSaves(id))
      setLoading(true)
      supabase
        .from('agents')
        .select('id, name, slug, ticker, description, strategy_type, status, total_aum_cents, share_price_cents, signal_summary, last_run_at, primary_symbol, subscriber_count, backtest_stats, agent_stats(nav_cents, bid_cents, ask_cents, total_return_pct, sharpe_ratio, max_drawdown_pct, win_rate_pct, total_trades, snapshot_at), owner_id, monthly_fee_cents, created_at')
        .eq('owner_id', id)
        .in('status', ['active', 'paused', 'pending_review', 'draft'])
        .order('created_at', { ascending: false })
        .then(({ data: agents }) => {
          setDbAgents((agents as unknown as DbAgent[]) ?? [])
          setLoading(false)
        })
    })
  }, [])

  const agents: AgentSave[] = dbAgents.length > 0
    ? dbAgents.map(a => ({
        id: a.id,
        name: a.name,
        description: a.description ?? '',
        tagline: a.name,
        ticker: a.ticker ?? a.slug?.toUpperCase().replace(/-/g, '').slice(0, 4) ?? 'AGNT',
        status: (a.status === 'active' ? 'active' : a.status === 'paused' ? 'paused' : 'draft') as AgentStatus,
        published: a.status === 'active',
        updatedAt: a.last_run_at ?? (a as any).created_at ?? new Date().toISOString(),
        version: 1,
      }))
    : userId && userId !== 'anonymous' ? [] : AGENT_CONFIGS.map(a => mergeAgent(a, saves[a.id]))

  const filtered = agents.filter(a => {
    if (filterStatus !== 'all' && a.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      return a.name.toLowerCase().includes(q) || a.ticker.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
    }
    return true
  })

  function updateAgent(id: string, patch: Partial<AgentSave>) {
    const base = AGENT_CONFIGS.find(a => a.id === id)
    const current = saves[id] ?? (base ? mergeAgent(base) : { id } as AgentSave)
    const updated: AgentSave = { ...current, ...patch, updatedAt: new Date().toISOString() }
    const next = { ...saves, [id]: updated }
    setSaves(next)
    persistSaves(userId, next)
  }

  function openEdit(id: string) {
    const a = agents.find(x => x.id === id)
    if (!a) return
    const saved = loadSaves(userId)[id]
    setDraft({
      name: a.name,
      description: a.description,
      tagline: a.tagline,
      ticker: a.ticker,
      status: a.status,
      strategyCode: a.strategyCode,
      configJson: a.configJson,
      ...(saved ? { name: saved.name, description: saved.description, tagline: saved.tagline, ticker: saved.ticker, status: saved.status, strategyCode: saved.strategyCode, configJson: saved.configJson } : {}),
    })
    setEditingId(id)
  }

  function closeSlide() {
    setEditingId(null)
    setDraft({})
    setPublishingId(null)
    setPublishConfirmed(false)
  }

  function saveEdit() {
    if (!editingId) return
    updateAgent(editingId, draft)
    closeSlide()
  }

  async function saveAndRepublish() {
    if (!editingId) return
    const current = agents.find(a => a.id === editingId)!
    const nextVersion = (current.version ?? 1) + 1
    const patch: Partial<AgentSave> = { ...draft, published: true, version: nextVersion }
    updateAgent(editingId, patch)
    const merged = { ...current, ...patch }
    const dbAgent = dbAgents.find(a => a.id === editingId)
    try {
      await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: merged.name,
          description: merged.description,
          strategy_type: dbAgent?.strategy_type ?? AGENT_CONFIGS.find(a => a.id === editingId)?.strategyType ?? 'crypto_momentum',
          primary_symbol: dbAgent?.primary_symbol ?? 'BTC/USD',
          backtest_strategy: 'composite_balanced',
          asset_class: dbAgent ? (dbAgent as any).asset_class ?? 'crypto' : (AGENT_CONFIGS.find(a => a.id === editingId)?.asset ?? 'crypto'),
          slug: dbAgent?.slug ?? editingId,
          ticker: merged.ticker,
          strategy_code: merged.strategyCode,
          config_json: merged.configJson,
          version: nextVersion,
          publish: true,
        }),
      })
    } catch {}
    closeSlide()
  }

  function resetAgent(id: string) {
    const next = { ...saves }
    delete next[id]
    setSaves(next)
    persistSaves(userId, next)
  }

  function openPublish(id: string) {
    setPublishingId(id)
    setEditingId(null)
    setPublishConfirmed(false)
  }

  async function confirmPublish() {
    if (!publishingId) return
    updateAgent(publishingId, { published: true })
    setPublishConfirmed(true)
    const agent = agents.find(a => a.id === publishingId)
    const dbAgent = dbAgents.find(a => a.id === publishingId)
    if (agent) {
      try {
        await fetch('/api/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: agent.name,
            description: agent.description,
            strategy_type: dbAgent?.strategy_type ?? AGENT_CONFIGS.find(a => a.id === publishingId)?.strategyType ?? 'crypto_momentum',
            primary_symbol: dbAgent?.primary_symbol ?? 'BTC/USD',
            backtest_strategy: 'composite_balanced',
            asset_class: dbAgent ? (dbAgent as any).asset_class ?? 'crypto' : (AGENT_CONFIGS.find(a => a.id === publishingId)?.asset ?? 'crypto'),
            slug: dbAgent?.slug ?? agent.id,
            ticker: agent.ticker,
            strategy_code: agent.strategyCode,
            config_json: agent.configJson,
            publish: true,
          }),
        })
      } catch {}
    }
    setTimeout(() => { closeSlide() }, 1200)
  }

  function delistAgent(id: string) {
    updateAgent(id, { published: false, status: 'paused' })
  }

  const isSlideOpen = editingId !== null || publishingId !== null

  const statusCounts = {
    active: agents.filter(a => a.status === 'active').length,
    paused: agents.filter(a => a.status === 'paused').length,
    draft: agents.filter(a => a.status === 'draft').length,
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: '1rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.bg2 }}>
        <div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: C.white, letterSpacing: '0.02em' }}>Agent Studio</div>
          <div style={{ fontSize: '0.72rem', color: C.muted, marginTop: '0.15rem' }}>Build, deploy, and manage autonomous trading agents</div>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', background: C.bg, borderRadius: 8, padding: '0.2rem', border: `1px solid ${C.border}` }}>
          {(['manage', 'build', 'docs'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                padding: '0.4rem 0.9rem',
                borderRadius: 6,
                cursor: 'pointer',
                background: view === v ? C.blue : 'transparent',
                color: view === v ? '#fff' : C.muted,
                border: 'none',
                fontWeight: view === v ? 600 : 400,
                transition: 'all 0.15s',
              }}
            >
              {v === 'manage' ? 'Manage' : v === 'build' ? 'Build' : 'Docs'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '1.5rem 2rem' }}>
        {view === 'manage' && (
          <div>
            {/* Stats bar */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
              {[
                { label: 'Active', count: statusCounts.active, color: C.mint },
                { label: 'Paused', count: statusCounts.paused, color: C.amber },
                { label: 'Drafts', count: statusCounts.draft, color: C.blue },
              ].map(s => (
                <div key={s.label} style={{
                  background: C.bg3,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  padding: '0.6rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  minWidth: 120,
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: C.white, fontFamily: 'var(--font-mono)' }}>{s.count}</div>
                    <div style={{ fontSize: '0.6rem', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{s.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Search + filters */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search agents..."
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.72rem',
                  background: C.bg3,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  padding: '0.4rem 0.75rem',
                  color: C.white,
                  outline: 'none',
                  width: 220,
                }}
              />
              {(['all', 'active', 'paused', 'draft'] as const).map(s => {
                const active = filterStatus === s
                const accent = s === 'all' ? C.blue : s === 'active' ? C.mint : s === 'paused' ? C.amber : C.purple
                return (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s)}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.62rem',
                      letterSpacing: '0.08em',
                      textTransform: 'capitalize',
                      padding: '0.3rem 0.65rem',
                      borderRadius: 6,
                      cursor: 'pointer',
                      background: active ? accent + '18' : 'transparent',
                      color: active ? accent : C.muted,
                      border: `1px solid ${active ? accent + '55' : C.border}`,
                      transition: 'all 0.15s',
                    }}
                  >
                    {s === 'all' ? 'ALL' : s.toUpperCase()}
                  </button>
                )
              })}
              <button
                onClick={() => router.push('/dashboard/build?new=1')}
                style={{
                  marginLeft: 'auto',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  padding: '0.45rem 1rem',
                  borderRadius: 6,
                  border: 'none',
                  background: C.blue,
                  color: '#fff',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                + New Agent
              </button>
            </div>

            {/* Agent cards */}
            {loading && (
              <div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: C.muted }}>
                Loading your agents...
              </div>
            )}

            {!loading && filtered.length === 0 && dbAgents.length === 0 && userId && userId !== 'anonymous' && (
              <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🤖</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, color: C.white, marginBottom: '.5rem' }}>No agents yet</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: C.muted, marginBottom: '1.25rem' }}>Create your first trading agent from the Build tab or Quant Lab.</div>
                <button onClick={() => router.push('/dashboard/build?new=1')} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 600, padding: '0.55rem 1.3rem', borderRadius: 8, border: 'none', background: C.mint, color: '#fff', cursor: 'pointer' }}>
                  Open Quant Lab →
                </button>
              </div>
            )}

            {!loading && filtered.length === 0 && (dbAgents.length > 0 || !userId || userId === 'anonymous') && (
              <div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: C.muted }}>
                No agents match the current filter.
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '0.75rem' }}>
              {filtered.map(a => {
                const base = AGENT_CONFIGS.find(x => x.id === a.id)
                const statusColor = a.status === 'active' ? C.mint : a.status === 'paused' ? C.amber : C.muted
                const borderColor = a.published ? C.mint + '40' : a.status === 'draft' ? C.purple + '30' : C.border
                return (
                  <div
                    key={a.id}
                    style={{
                      background: C.bg3,
                      border: `1px solid ${borderColor}`,
                      borderRadius: 10,
                      padding: '1.1rem 1.25rem',
                      transition: 'border-color 0.2s, transform 0.15s',
                      cursor: 'default',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = a.published ? C.mint + '70' : C.blue + '50'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = borderColor; e.currentTarget.style.transform = 'none' }}
                  >
                    {/* Live indicator */}
                    {a.published && a.status === 'active' && (
                      <div style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.mint, boxShadow: `0 0 6px ${C.mint}80`, animation: 'pulse 2s infinite' }} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: C.mint, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>LIVE</span>
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: C.white, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.name}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: C.muted, marginTop: '0.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {(base?.strategyType ?? dbAgents.find(x => x.id === a.id)?.strategy_type ?? 'strategy')?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                        </div>
                      </div>
                      <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.45rem',
                        borderRadius: 4,
                        background: statusColor + '18',
                        color: statusColor,
                        border: `1px solid ${statusColor}40`,
                        marginLeft: '0.5rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}>
                        {a.status}
                      </div>
                    </div>

                    <div style={{ fontSize: '0.7rem', color: C.text, lineHeight: 1.5, marginBottom: '0.75rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {a.description}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.62rem', color: C.muted, marginBottom: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                      <span style={{ color: C.white, fontWeight: 600, fontSize: '0.7rem' }}>${a.ticker}</span>
                      <span>·</span>
                      <span>v{a.version ?? 1}</span>
                      <span>·</span>
                      <span>{new Date(a.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </div>

                    <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                      <button
                        onClick={() => openEdit(a.id)}
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.62rem',
                          fontWeight: 600,
                          padding: '0.35rem 0.7rem',
                          borderRadius: 5,
                          cursor: 'pointer',
                          background: 'transparent',
                          border: `1px solid ${C.border}`,
                          color: C.text,
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = C.blue; e.currentTarget.style.color = C.blue }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.text }}
                      >
                        Edit
                      </button>

                      {!a.published ? (
                        <button
                          onClick={() => openPublish(a.id)}
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.62rem',
                            fontWeight: 600,
                            padding: '0.35rem 0.7rem',
                            borderRadius: 5,
                            cursor: 'pointer',
                            background: C.mint + '15',
                            border: `1px solid ${C.mint}55`,
                            color: C.mint,
                            transition: 'all 0.15s',
                          }}
                        >
                          Publish
                        </button>
                      ) : (
                        <button
                          onClick={() => delistAgent(a.id)}
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.62rem',
                            fontWeight: 600,
                            padding: '0.35rem 0.7rem',
                            borderRadius: 5,
                            cursor: 'pointer',
                            background: 'transparent',
                            border: `1px solid ${C.mint}40`,
                            color: C.mint,
                            transition: 'all 0.15s',
                          }}
                        >
                          Published
                        </button>
                      )}

                      <button
                        onClick={() => router.push('/dashboard/build')}
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.62rem',
                          fontWeight: 600,
                          padding: '0.35rem 0.7rem',
                          borderRadius: 5,
                          cursor: 'pointer',
                          background: C.blue + '15',
                          border: `1px solid ${C.blue}40`,
                          color: C.blue,
                          marginLeft: 'auto',
                          transition: 'all 0.15s',
                        }}
                      >
                        Deploy
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {view === 'build' && (
          <div style={{ padding: '2rem 1rem', maxWidth: 900, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚡</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: C.white, marginBottom: '0.75rem' }}>Build Your Agent</div>
              <div style={{ fontSize: '0.82rem', color: C.muted, maxWidth: 550, margin: '0 auto 1.5rem', lineHeight: 1.6 }}>
                Write your trading strategy in the Quant Lab IDE using TypeScript. Configure parameters, run backtests, and deploy to the Exchange.
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                <button
                  onClick={() => router.push('/dashboard/build?new=1')}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    padding: '0.7rem 1.8rem',
                    borderRadius: 8,
                    border: 'none',
                    background: C.blue,
                    color: '#fff',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  Open Quant Lab →
                </button>
                <button
                  onClick={() => router.push('/dashboard/backtest')}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    padding: '0.7rem 1.8rem',
                    borderRadius: 8,
                    border: `1px solid ${C.border}`,
                    background: 'transparent',
                    color: C.text,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = C.blue}
                  onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
                >
                  Run Backtest
                </button>
              </div>
            </div>

            {/* Templates */}
            <div style={{ marginTop: '1rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '1rem', paddingLeft: '0.25rem' }}>
                Strategy Templates
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                {[
                  { name: 'Composite Alpha v2', desc: '6-signal composite score with vol targeting', icon: '🎯' },
                  { name: 'Momentum Crossover', desc: 'EMA crossover with RSI and ATR stops', icon: '📈' },
                  { name: 'Mean Reversion', desc: 'Z-score + Bollinger Band entries', icon: '🔄' },
                  { name: 'Risk Parity', desc: 'Inverse-vol weighted multi-asset allocation', icon: '⚖️' },
                ].map(t => (
                  <div
                    key={t.name}
                    style={{
                      background: C.bg3,
                      border: `1px solid ${C.border}`,
                      borderRadius: 10,
                      padding: '1.25rem 1.5rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                    }}
                    onClick={() => router.push('/dashboard/build?new=1')}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = C.blue
                      e.currentTarget.style.transform = 'translateY(-2px)'
                      e.currentTarget.style.boxShadow = `0 4px 12px ${C.blue}20`
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = C.border
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>{t.icon}</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: C.white, marginBottom: '0.35rem' }}>{t.name}</div>
                    <div style={{ fontSize: '0.7rem', color: C.muted, lineHeight: 1.5 }}>{t.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {view === 'docs' && <DocsView />}
      </div>

      {/* Overlay */}
      {isSlideOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200 }}
          onClick={closeSlide}
        />
      )}

      {/* Edit slide panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: editingId !== null ? 760 : 480,
          background: C.bg2,
          borderLeft: `1px solid ${C.border}`,
          zIndex: 201,
          transform: isSlideOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {editingId !== null && (
          <EditPanel
            agent={agents.find(a => a.id === editingId)!}
            draft={draft}
            setDraft={setDraft}
            onSave={saveEdit}
            onRepublish={saveAndRepublish}
            onClose={closeSlide}
          />
        )}
        {publishingId !== null && (
          <PublishPanel
            agent={agents.find(a => a.id === publishingId)!}
            confirmed={publishConfirmed}
            onConfirm={confirmPublish}
            onClose={closeSlide}
          />
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}

function EditPanel({ agent, draft, setDraft, onSave, onRepublish, onClose }: {
  agent: AgentSave
  draft: Partial<AgentSave>
  setDraft: React.Dispatch<React.SetStateAction<Partial<AgentSave>>>
  onSave: () => void
  onRepublish: () => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<'meta' | 'strategy' | 'config'>('meta')
  const [republishing, setRepublishing] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      const patch: Partial<AgentSave> = { ...draft }
      if (Object.keys(patch).length > 0 && typeof window !== 'undefined') {
        try {
          const userId = localStorage.getItem('ase_user_id') || 'anonymous'
          const key = `ase_agent_saves_${userId}`
          const existing = JSON.parse(localStorage.getItem(key) || '{}')
          localStorage.setItem(key, JSON.stringify({ ...existing, [agent.id]: { ...existing[agent.id], ...patch, updatedAt: new Date().toISOString() } }))
        } catch {}
      }
    }, 2000)
    return () => clearTimeout(timer)
  }, [draft, agent.id])

  const fields: { key: keyof AgentSave; label: string; multiline?: boolean }[] = [
    { key: 'name', label: 'Agent Name' },
    { key: 'ticker', label: 'Ticker Symbol' },
    { key: 'tagline', label: 'Tagline' },
    { key: 'description', label: 'Description', multiline: true },
  ]

  const inputStyle = {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.75rem',
    width: '100%',
    background: C.bg3,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: '0.5rem 0.75rem',
    color: C.white,
    outline: 'none',
    boxSizing: 'border-box' as const,
    lineHeight: 1.6,
  }

  const codeStyle = {
    ...inputStyle,
    fontSize: '0.68rem',
    lineHeight: 1.55,
    resize: 'none' as const,
    height: '100%',
    tabSize: 2,
    whiteSpace: 'pre' as const,
  }

  async function handleRepublish() {
    setRepublishing(true)
    try { await Promise.resolve(onRepublish()) } finally { setRepublishing(false) }
  }

  return (
    <>
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.1em', color: C.muted, textTransform: 'uppercase', marginBottom: '0.25rem' }}>
            Edit Agent · v{agent.version ?? 1}
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: C.white }}>{agent.name}</div>
          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem', alignItems: 'center' }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.55rem', padding: '0.15rem 0.4rem',
              borderRadius: 4, background: (agent.published ? C.mint : agent.status === 'draft' ? C.purple : C.amber) + '18',
              color: agent.published ? C.mint : agent.status === 'draft' ? C.purple : C.amber,
              border: `1px solid ${(agent.published ? C.mint : agent.status === 'draft' ? C.purple : C.amber)}40`,
              textTransform: 'uppercase', letterSpacing: '0.08em',
            }}>
              {agent.published ? 'Published' : agent.status}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: C.faint }}>
              ${agent.ticker}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: '0.25rem' }}
        >
          ✕
        </button>
      </div>

      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, padding: '0 1rem', gap: '.25rem' }}>
        {(['meta', 'strategy', 'config'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '.62rem',
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              padding: '.6rem .85rem',
              background: 'transparent',
              border: 'none',
              borderBottom: tab === t ? `2px solid ${C.blue}` : '2px solid transparent',
              color: tab === t ? C.white : C.muted,
              cursor: 'pointer',
            }}
          >
            {t === 'meta' ? 'Metadata' : t === 'strategy' ? 'strategy.ts' : 'config.json'}
          </button>
        ))}
      </div>

      {tab === 'strategy' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1rem 1.25rem', overflow: 'hidden' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: C.muted, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '.4rem' }}>
            strategy.ts — edit source and Republish to ship a new version
          </div>
          <textarea
            value={draft.strategyCode ?? agent.strategyCode ?? DEFAULT_STRATEGY_TS}
            onChange={e => setDraft(d => ({ ...d, strategyCode: e.target.value }))}
            spellCheck={false}
            style={codeStyle}
          />
        </div>
      )}

      {tab === 'config' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1rem 1.25rem', overflow: 'hidden' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: C.muted, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '.4rem' }}>
            config.json — parameters for the Active Swing engine
          </div>
          <textarea
            value={draft.configJson ?? agent.configJson ?? DEFAULT_CONFIG_JSON}
            onChange={e => setDraft(d => ({ ...d, configJson: e.target.value }))}
            spellCheck={false}
            style={codeStyle}
          />
        </div>
      )}

      {tab === 'meta' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
          {fields.map(f => (
            <div key={f.key} style={{ marginBottom: '1.1rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.1em', color: C.muted, textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                {f.label}
              </div>
              {f.multiline ? (
                <textarea
                  value={(draft[f.key] as string) ?? ''}
                  onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}
                  rows={5}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              ) : (
                <input
                  value={(draft[f.key] as string) ?? ''}
                  onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}
                  style={inputStyle}
                />
              )}
            </div>
          ))}

          <div style={{ marginBottom: '1.1rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.1em', color: C.muted, textTransform: 'uppercase', marginBottom: '0.35rem' }}>
              Status
            </div>
            <select
              value={(draft.status as string) ?? 'active'}
              onChange={e => setDraft(d => ({ ...d, status: e.target.value as AgentStatus }))}
              style={{ ...inputStyle, cursor: 'pointer', appearance: 'none' as const }}
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="draft">Draft</option>
            </select>
          </div>
        </div>
      )}

      <div style={{ padding: '0.85rem 1.25rem', borderTop: `1px solid ${C.border}`, display: 'flex', gap: '0.5rem', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: C.faint }}>
          Republish ships v{(agent.version ?? 1) + 1} to the exchange
        </div>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <button onClick={onClose} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', padding: '0.45rem 0.9rem', borderRadius: 6, cursor: 'pointer', background: 'transparent', border: `1px solid ${C.border}`, color: C.muted }}>
            Cancel
          </button>
          <button onClick={onSave} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', padding: '0.45rem 0.9rem', borderRadius: 6, cursor: 'pointer', background: 'transparent', border: `1px solid ${C.blue}55`, color: C.blue, fontWeight: 600 }}>
            Save Draft
          </button>
          <button onClick={handleRepublish} disabled={republishing} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', padding: '0.45rem 1rem', borderRadius: 6, cursor: republishing ? 'not-allowed' : 'pointer', background: C.mint, border: 'none', color: '#fff', fontWeight: 700, opacity: republishing ? 0.6 : 1 }}>
            {republishing ? 'Publishing...' : 'Save & Republish'}
          </button>
        </div>
      </div>
    </>
  )
}

function PublishPanel({ agent, confirmed, onConfirm, onClose }: {
  agent: AgentSave
  confirmed: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <>
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.1em', color: C.mint, textTransform: 'uppercase', marginBottom: '0.25rem' }}>
            Publish Agent
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: C.white }}>{agent.name}</div>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: '0.25rem' }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.08em', color: C.muted, textTransform: 'uppercase', marginBottom: '1rem' }}>
          Publishing Requirements
        </div>
        <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', marginBottom: '1.5rem' }}>
          {PUBLISH_REQUIREMENTS.map((req, i) => (
            <div key={req.key} style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.75rem 1rem',
              borderBottom: i < PUBLISH_REQUIREMENTS.length - 1 ? `1px solid ${C.border}` : 'none',
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%',
                background: C.mint + '20', border: `1.5px solid ${C.mint}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.mint }} />
              </div>
              <div style={{ fontSize: '0.78rem', color: C.text }}>{req.label}</div>
              <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: C.mint }}>
                PASS
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: C.bg3, border: `1px solid ${C.mint}30`, borderRadius: 8, padding: '1rem 1.1rem', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.72rem', color: C.mint, fontWeight: 600, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            🔒 Security Notice
          </div>
          <div style={{ fontSize: '0.78rem', color: C.text, lineHeight: 1.6 }}>
            Publishing makes this agent visible to subscribers on the ASE Exchange. Your strategy source code remains private — only performance metrics and signal summaries are shared.
          </div>
        </div>

        {confirmed && (
          <div style={{
            background: C.mint + '15', border: `1px solid ${C.mint}40`, borderRadius: 8,
            padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.6rem',
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.mint, flexShrink: 0 }} />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: C.mint }}>
              Agent published successfully. It is now live on the Exchange.
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '1rem 1.5rem', borderTop: `1px solid ${C.border}`, display: 'flex', gap: '0.65rem', justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', padding: '0.5rem 1rem', borderRadius: 6, cursor: 'pointer', background: 'transparent', border: `1px solid ${C.border}`, color: C.muted }}>
          Cancel
        </button>
        {!confirmed && (
          <button onClick={onConfirm} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', padding: '0.5rem 1.2rem', borderRadius: 6, cursor: 'pointer', background: C.mint, border: 'none', color: '#fff', fontWeight: 600 }}>
            Confirm Publish
          </button>
        )}
      </div>
    </>
  )
}

function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.12em',
        color: C.blue, textTransform: 'uppercase', marginBottom: '0.6rem',
      }}>
        {title}
      </div>
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: '1.1rem' }}>
        {children}
      </div>
    </div>
  )
}

function DocParagraph({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: '0.82rem', color: C.text, lineHeight: 1.75, margin: '0 0 0.85rem' }}>
      {children}
    </p>
  )
}

function DocHeading({ children, level = 3 }: { children: React.ReactNode; level?: number }) {
  const size = level === 2 ? '1.05rem' : level === 3 ? '0.88rem' : '0.78rem'
  const mt = level === 2 ? '1.5rem' : '1.1rem'
  return (
    <div style={{ fontSize: size, fontWeight: 600, color: C.white, marginBottom: '0.5rem', marginTop: mt }}>
      {children}
    </div>
  )
}

function DocList({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: '0 0 1rem', paddingLeft: 0, listStyle: 'none' }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', fontSize: '0.78rem', color: C.text, marginBottom: '0.45rem', lineHeight: 1.6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', color: C.blue, flexShrink: 0, marginTop: '0.05rem' }}>—</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function DocCode({ children }: { children: React.ReactNode }) {
  return (
    <code style={{
      fontFamily: 'var(--font-mono)',
      fontSize: '0.72rem',
      background: C.bg3,
      border: `1px solid ${C.border}`,
      borderRadius: 4,
      padding: '0.1rem 0.4rem',
      color: C.mint,
    }}>
      {children}
    </code>
  )
}

function DocTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.75rem' }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.6rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: C.muted,
                padding: '0.5rem 0.85rem',
                borderBottom: `1px solid ${C.border}`,
                textAlign: 'left',
                background: C.bg3,
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ borderBottom: `1px solid ${C.border}` }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{
                  fontFamily: ci === 0 ? 'var(--font-mono)' : 'inherit',
                  padding: '0.5rem 0.85rem',
                  color: ci === 0 ? C.white : C.text,
                  fontSize: ci === 0 ? '0.7rem' : '0.78rem',
                }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DocEndpoint({ method, path, desc }: { method: string; path: string; desc: string }) {
  const methodColor = method === 'GET' ? C.mint : method === 'POST' ? C.blue : method === 'PUT' ? C.amber : C.muted
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0', borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700, padding: '0.15rem 0.45rem', borderRadius: 4, background: methodColor + '18', color: methodColor, border: `1px solid ${methodColor}40`, letterSpacing: '0.05em' }}>
        {method}
      </span>
      <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: C.white }}>{path}</code>
      <span style={{ fontSize: '0.72rem', color: C.muted, marginLeft: '0.5rem' }}>{desc}</span>
    </div>
  )
}

function DocsView() {
  const [docTab, setDocTab] = useState<'overview' | 'agents' | 'backtest' | 'api' | 'quant'>('overview')

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '1.5rem', background: C.bg3, borderRadius: 8, padding: '0.2rem', border: `1px solid ${C.border}`, width: 'fit-content' }}>
        {(['overview', 'agents', 'backtest', 'api', 'quant'] as const).map(t => (
          <button
            key={t}
            onClick={() => setDocTab(t)}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.62rem',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              padding: '0.4rem 0.75rem',
              borderRadius: 6,
              cursor: 'pointer',
              background: docTab === t ? C.blue : 'transparent',
              color: docTab === t ? '#fff' : C.muted,
              border: 'none',
              fontWeight: docTab === t ? 600 : 400,
              transition: 'all 0.15s',
            }}
          >
            {t === 'quant' ? 'Quant Lab' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {docTab === 'overview' && (
        <>
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: C.white, marginBottom: '0.5rem' }}>
              ASE Platform Documentation
            </div>
            <div style={{ fontSize: '0.82rem', color: C.muted, lineHeight: 1.6 }}>
              Complete reference for building, backtesting, and deploying autonomous trading agents on the Algorithmic Strategy Exchange.
            </div>
          </div>

          <DocSection title="Overview">
            <DocParagraph>
              ASE lets you write, backtest, and deploy autonomous trading agents. You define the logic — we handle all backtesting infrastructure, execution, risk controls, and capital management. Each agent runs with isolated paper trading capital tracked per-agent, not per-account.
            </DocParagraph>
            <DocParagraph>
              Agents you publish appear on the ASE Exchange where other users can allocate capital to subscribe. Your agent earns based on performance. All published agents must meet minimum quality standards before going live.
            </DocParagraph>
          </DocSection>

          <DocSection title="Platform Architecture">
            <DocParagraph>
              The platform is built on a 9-layer institutional quant pipeline:
            </DocParagraph>
            <DocList items={[
              'Data Ingestion — Yahoo Finance crypto + equity bars, 1D and 1H timeframes',
              'Feature Engineering — EMA, RSI, ATR, MACD, Bollinger Bands, Z-scores, VWAP, ADX, volume',
              'Signal Generation — Per-strategy alpha models with composite scoring',
              'Portfolio Optimization — Vol-targeting, inverse-volatility weighting, exposure limits',
              'Risk Controls — Hard stops (4-6%), ATR trailing stops, kill switch (20% drawdown), max position 40%',
              'Execution Simulation — Realistic slippage (5-10bps) and commission ($0.005/share equity, 0.1% crypto)',
              'Performance Attribution — Sharpe, Sortino, Calmar, max drawdown, win rate, profit factor',
              'Walk-Forward Validation — Rolling out-of-sample testing with anchored windows',
              'Live Deployment — Cloudflare Workers cron (1min intervals), per-agent paper trading accounts',
            ]} />
          </DocSection>

          <DocSection title="Workflow">
            <DocHeading level={2}>1. Write your strategy</DocHeading>
            <DocParagraph>
              Open the Quant Lab IDE from the sidebar. Write your trading logic using the ASE strategy API. Quant Lab provides a full TypeScript environment with access to market data utilities, indicator functions, and the backtesting runtime.
            </DocParagraph>
            <DocHeading level={2}>2. Run the backtest</DocHeading>
            <DocParagraph>
              Navigate to Backtest Studio to configure parameters and run a full simulation. The engine applies realistic slippage, commissions, and capital constraints. Results include a grade (A+ through F), Sharpe ratio, max drawdown, and equity curve.
            </DocParagraph>
            <DocHeading level={2}>3. Publish to the Exchange</DocHeading>
            <DocParagraph>
              Once your strategy meets the publishing requirements, click Publish from the Manage tab. A checklist confirms all requirements are met. After confirmation, the agent becomes visible in the marketplace.
            </DocParagraph>
          </DocSection>
        </>
      )}

      {docTab === 'agents' && (
        <>
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: C.white, marginBottom: '0.5rem' }}>
              Agent Engine Reference
            </div>
            <div style={{ fontSize: '0.82rem', color: C.muted, lineHeight: 1.6 }}>
              How agents trade, risk controls, and strategy definitions.
            </div>
          </div>

          <DocSection title="How Agents Trade">
            <DocParagraph>
              Agents run automatically every minute via Cloudflare Workers cron. Each agent:
            </DocParagraph>
            <DocList items={[
              'Fetches real price bars from Yahoo Finance / Alpaca',
              'Calculates technical indicators (EMA, RSI, ATR, MACD, Bollinger Bands, etc.)',
              'Evaluates entry/exit conditions per its strategy',
              'Executes trades via Alpaca paper trading API',
              'Logs fills to agent_trades with FIFO cost basis tracking',
              'Calculates NAV from realized + unrealized P&L',
            ]} />
          </DocSection>

          <DocSection title="Built-in Strategies">
            <DocTable
              headers={['Agent', 'Strategy', 'Universe', 'Max Exposure']}
              rows={[
                ['BTC Momentum Alpha', '8/21/50 EMA + MACD histogram', 'BTC', '45%'],
                ['ETH Statistical Arb', 'Z-score + RSI + Bollinger %B', 'ETH', '35%'],
                ['Multi-Asset Trend', '10/30 EMA + ADX filter', 'BTC/ETH/SOL', '50%'],
                ['SOL Volatility Breakout', 'Bollinger squeeze + volume', 'SOL', '30%'],
                ['DeFi Smart Beta', 'Risk-adjusted momentum rotation', 'LINK/UNI/AAVE/AVAX', '40%'],
                ['BTC/ETH Pairs', 'Spread z-score pairs trading', 'BTC + ETH', '25%/leg'],
                ['Crypto Vol Harvester', 'ATR/price vol ratio entry', 'BTC/ETH/SOL', '20%/pos'],
                ['Crypto Momentum Carry', 'Momentum + inverse-vol weighting', 'BTC/ETH/SOL/AVAX/LINK', '30%/pos'],
                ['Composite Alpha v2', '6-signal composite + vol targeting', 'BTC/ETH/SOL/AVAX/LINK', '60%'],
                ['S&P 500 Momentum', '20/50 EMA + ADX', 'SPY', '40%'],
                ['Nasdaq Growth Rotation', 'Relative strength vs SPY', 'QQQ', '35%'],
                ['Sector Momentum', '20-day rotation top rank', 'XLK/XLV/XLF', '50%'],
                ['Low Vol Premium', 'RSI mean reversion + VIX filter', 'SPLV', '40%'],
                ['Dual Momentum', 'Absolute + relative momentum', 'SPY/AGG', '90%'],
                ['Tech Rotation', 'Sharpe-like score top-2', 'AAPL/MSFT/GOOGL/NVDA/META', '45%/name'],
                ['Equity Mean Reversion', 'RSI(2) + Bollinger + 200d MA', 'SPY', '90%'],
                ['EMA Golden Cross', '50/200 EMA + ADX confirmation', 'QQQ', '85%'],
                ['Risk Parity', '1/vol allocation + tactical overlay', 'SPY/TLT/GLD', '95%'],
              ]}
            />
          </DocSection>

          <DocSection title="Risk Controls">
            <DocParagraph>
              Every agent operates under platform-level risk controls that cannot be disabled:
            </DocParagraph>
            <DocList items={[
              'Maximum drawdown kill switch: if a single agent loses more than 20% from peak NAV, it is paused automatically',
              'ATR-based position sizing: entries are sized based on realized volatility to prevent outsized exposure',
              'Hard stops per position: typically 4-6% depending on strategy',
              'Maximum single-position exposure: no agent may hold more than 40-45% in a single position',
              'Trade rate limits: agents are rate-limited to prevent excessive churning',
              'Minimum cash reserve: agents always maintain at least 10% cash',
            ]} />

            <DocHeading level={3}>Fee Structure</DocHeading>
            <DocParagraph>
              Backtests apply realistic costs: <DocCode>$0.005/share</DocCode> commission for equities with 5bps slippage, <DocCode>0.1% taker</DocCode> fee for crypto with 10bps slippage. Applied automatically.
            </DocParagraph>
          </DocSection>
        </>
      )}

      {docTab === 'backtest' && (
        <>
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: C.white, marginBottom: '0.5rem' }}>
              Backtest Engine Reference
            </div>
            <div style={{ fontSize: '0.82rem', color: C.muted, lineHeight: 1.6 }}>
              How backtesting works on ASE, including methodology and parameters.
            </div>
          </div>

          <DocSection title="The Standardized Engine">
            <DocParagraph>
              ASE runs one standardized backtest engine — <DocCode>active_swing</DocCode> — for every agent on the platform. It uses RSI(7) entries inside an EMA(8/21) trend filter with an ATR(10) trailing stop, tuned to produce ~200 round-trips over 6 months on liquid crypto pairs.
            </DocParagraph>
            <DocTable
              headers={['Parameter', 'Default', 'Description']}
              rows={[
                ['rsi_window', '7', 'RSI period — short for sensitivity to dips'],
                ['buy_below', '38', 'Enter long when RSI < this inside an uptrend'],
                ['sell_above', '64', 'Exit when RSI crosses above this'],
                ['atr_window', '10', 'ATR period for trailing stop'],
                ['atr_mult', '2.0', 'Trailing stop = close − ATR × mult'],
                ['fast_ema', '8', 'Fast EMA for trend filter'],
                ['slow_ema', '21', 'Slow EMA for trend filter'],
              ]}
            />
          </DocSection>

          <DocSection title="Backtest Methodology">
            <DocHeading level={3}>9-Layer Institutional Pipeline</DocHeading>
            <DocList items={[
              'Data Ingestion — Multi-source OHLCV bars (Yahoo Finance, Alpaca, Binance)',
              'Feature Engineering — 30+ indicators: EMA, RSI, ATR, MACD, BB, Z-score, VWAP, ADX, volume ratios',
              'Signal Generation — Per-strategy models with composite alpha scoring',
              'Portfolio Optimization — Vol-targeting at 15% ann., inverse-vol weighting, exposure limits',
              'Risk Controls — Hard stops (4-6%), ATR trailing stops, 20% drawdown kill switch',
              'Execution Simulation — Realistic slippage (5-10bps) and commission',
              'Performance Attribution — Sharpe, Sortino, Calmar, max DD, win rate, profit factor',
              'Walk-Forward Validation — Rolling OOS with anchored windows',
              'Live Deployment — Per-agent isolated paper trading, cron-based execution',
            ]} />

            <DocHeading level={3}>Scoring & Grading</DocHeading>
            <DocParagraph>
              Each backtest receives a composite grade from A+ to F based on a weighted scorecard:
            </DocParagraph>
            <DocTable
              headers={['Metric', 'Weight', 'Description']}
              rows={[
                ['Sharpe Ratio', '30%', 'Risk-adjusted return — Sharpe > 1.5 targets A grade'],
                ['Max Drawdown', '25%', 'Largest peak-to-trough decline — lower is better'],
                ['Win Rate', '15%', 'Percentage of profitable trades'],
                ['Profit Factor', '15%', 'Gross profit / gross loss ratio'],
                ['Total Return', '15%', 'Absolute return over the backtest period'],
              ]}
            />
          </DocSection>

          <DocSection title="Configuring Backtest Parameters">
            <DocParagraph>
              Edit <DocCode>config.json</DocCode> in Agent Studio or Quant Lab to customize:
            </DocParagraph>
            <DocTable
              headers={['Field', 'Type', 'Default']}
              rows={[
                ['template', 'string', 'composite_balanced'],
                ['alpha_type', 'string', 'composite'],
                ['symbols', 'string[]', 'BTC-USD, ETH-USD, SOL-USD'],
                ['rebalanceFreq', 'daily/weekly/monthly', 'daily'],
                ['riskAversion', '1-20', '8'],
                ['maxWeight', '0.05-1.0', '0.25'],
                ['walkForward', 'boolean', 'true'],
                ['initialCapital', 'number', '1,000,000'],
                ['feeBps', 'number', '7'],
                ['killSwitch', '0-1', '0.20'],
              ]}
            />
          </DocSection>
        </>
      )}

      {docTab === 'api' && (
        <>
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: C.white, marginBottom: '0.5rem' }}>
              API Reference
            </div>
            <div style={{ fontSize: '0.82rem', color: C.muted, lineHeight: 1.6 }}>
              RESTful endpoints for creating, managing, and subscribing to agents.
            </div>
          </div>

          <DocSection title="Agents">
            <DocEndpoint method="POST" path="/api/agents" desc="Create or update an agent" />
            <DocEndpoint method="GET" path="/api/agents" desc="List all agents on the exchange" />
            <DocEndpoint method="GET" path="/api/agents/:id" desc="Get agent details and stats" />

            <DocHeading level={3}>Create Agent</DocHeading>
            <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, padding: '1rem', marginBottom: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: C.mint, overflow: 'auto', whiteSpace: 'pre' }}>
{`POST /api/agents
Content-Type: application/json

{
  "name": "My Trading Agent",
  "description": "Momentum strategy on BTC",
  "strategy_type": "crypto_momentum",
  "primary_symbol": "BTC-USD",
  "asset_class": "crypto",
  "publish": true
}

// Response:
{
  "ok": true,
  "agent": {
    "id": "...",
    "slug": "my-trading-agent",
    "status": "active"
  }
}`}
            </div>
          </DocSection>

          <DocSection title="Trading">
            <DocEndpoint method="POST" path="/api/cron/run-agents" desc="Run all active agent strategies" />
            <DocEndpoint method="GET" path="/api/agents/:id/trades" desc="Get trade history for an agent" />
            <DocEndpoint method="GET" path="/api/agents/:id/stats" desc="Get NAV and performance stats" />
          </DocSection>

          <DocSection title="Subscriptions">
            <DocEndpoint method="POST" path="/api/subscribe" desc="Subscribe to an agent with capital" />
            <DocEndpoint method="DELETE" path="/api/subscribe" desc="Unsubscribe from an agent" />
          </DocSection>

          <DocSection title="Authentication">
            <DocParagraph>
              All API endpoints require a valid Supabase JWT token in the <DocCode>Authorization: Bearer</DocCode> header. The cron endpoint requires an additional <DocCode>x-cron-secret</DocCode> header.
            </DocParagraph>
          </DocSection>
        </>
      )}

      {docTab === 'quant' && (
        <>
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: C.white, marginBottom: '0.5rem' }}>
              Quant Lab Reference
            </div>
            <div style={{ fontSize: '0.82rem', color: C.muted, lineHeight: 1.6 }}>
              Writing strategies, signal generation, and the Composite Alpha framework.
            </div>
          </div>

          <DocSection title="Signal Generation">
            <DocParagraph>
              Each strategy generates a <DocCode>SignalResult</DocCode> containing actions (BUY/SELL/HOLD), a portfolio snapshot, and a <DocCode>signal_summary</DocCode> string. The Composite Alpha v2 uses a 6-signal weighted composite:
            </DocParagraph>
            <DocTable
              headers={['Signal', 'Weight', 'Description']}
              rows={[
                ['5-day momentum', '25%', 'Short-term price momentum (tanh-scaled)'],
                ['20-day momentum', '20%', 'Medium-term trend continuation'],
                ['60-day momentum', '10%', 'Long-term trend confirmation'],
                ['RSI z-score', '20%', 'Mean-reversion signal from RSI normalization'],
                ['EMA filter', '15%', '8/21 EMA crossover trend regime'],
                ['Volume/On-chain', '10%', 'Volume shock boost + NUPL/Fear-Greed'],
              ]}
            />
          </DocSection>

          <DocSection title="Available Features (FeatureRow)">
            <DocTable
              headers={['Field', 'Description', 'Type']}
              rows={[
                ['symbol', 'Asset ticker (e.g. BTC-USD)', 'string'],
                ['ret_1d', '1-day return', 'number'],
                ['ret_5d', '5-day return', 'number'],
                ['ret_20d', '20-day return', 'number'],
                ['ret_60d', '60-day return', 'number'],
                ['vol_20d', '20-day realized volatility (ann.)', 'number'],
                ['vol_shock', 'Volume vs 30-day avg', 'number'],
                ['rsi_14', '14-period RSI (0-100)', 'number'],
                ['bb_pct', 'Bollinger Band %B (0-1)', 'number'],
                ['nupl', 'Net Unrealized Profit/Loss', 'number'],
                ['fear_greed', 'Fear & Greed index (0-100)', 'number'],
              ]}
            />
          </DocSection>

          <DocSection title="Keyboard Shortcuts">
            <DocTable
              headers={['Shortcut', 'Action']}
              rows={[
                ['Cmd+Enter', 'Run backtest'],
                ['Cmd+S', 'Save current file'],
                ['Cmd+K', 'Focus AI chat'],
              ]}
            />
          </DocSection>
        </>
      )}
    </div>
  )
}