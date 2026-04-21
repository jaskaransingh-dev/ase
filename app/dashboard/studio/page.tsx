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
  border: '#1A2640',
  blue: '#3B82F6',
  mint: '#10B981',
  amber: '#F59E0B',
  red: '#EF4444',
  muted: '#6B7280',
  faint: '#374151',
  white: '#F9FAFB',
  text: '#9CA3AF',
}

type AgentStatus = 'active' | 'paused' | 'draft'
type View = 'agents' | 'docs'
type FilterStatus = AgentStatus | 'all'

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

const STATUS_COLOR: Record<AgentStatus, string> = {
  active: C.mint,
  paused: C.amber,
  draft: C.red,
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
    status: save?.status ?? 'active',
    published: save?.published ?? false,
    updatedAt: save?.updatedAt ?? new Date().toISOString(),
    strategyCode: save?.strategyCode ?? DEFAULT_STRATEGY_TS,
    configJson: save?.configJson ?? DEFAULT_CONFIG_JSON,
    version: save?.version ?? 1,
  }
}

const PUBLISH_REQUIREMENTS = [
  { key: 'desc', label: 'Strategy description filled (> 50 chars)' },
  { key: 'ticker', label: 'Ticker symbol set' },
  { key: 'backtest', label: 'Backtest has run' },
  { key: 'approved', label: 'Strategy approved' },
]

export default function StudioPage() {
  const router = useRouter()
  const [view, setView] = useState<View>('agents')
  const [userId, setUserId] = useState<string>('')
  const [saves, setSaves] = useState<Record<string, AgentSave>>({})
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<AgentSave>>({})
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [publishConfirmed, setPublishConfirmed] = useState(false)
  const [dbAgents, setDbAgents] = useState<DbAgent[]>([])
  const [loading, setLoading] = useState(true)
  const slideRef = useRef<HTMLDivElement>(null)

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
      return (
        a.name.toLowerCase().includes(q) ||
        a.ticker.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q)
      )
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
    const a = agents.find(x => x.id === id)!
    setDraft({ ...a })
    setEditingId(id)
    setPublishingId(null)
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

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      <div style={{ borderBottom: `1px solid ${C.border}`, padding: '1.25rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: C.white, letterSpacing: '0.06em', fontFamily: 'var(--font-mono)' }}>AGENT STUDIO</div>
          <div style={{ fontSize: '0.7rem', color: C.muted, marginTop: '0.2rem' }}>Manage and publish your trading agents</div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(['agents', 'docs'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '0.45rem 1.1rem',
                borderRadius: 6,
                cursor: 'pointer',
                background: view === v ? C.blue : 'transparent',
                color: view === v ? '#fff' : C.muted,
                border: `1px solid ${view === v ? C.blue : C.border}`,
                transition: 'all 0.15s',
              }}
            >
              {v === 'agents' ? 'Agent Manager' : 'Documentation'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '2rem' }}>

        {view === 'agents' && (
          <div>
            <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search agents..."
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  background: C.bg3,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  padding: '0.45rem 0.8rem',
                  color: C.white,
                  outline: 'none',
                  width: 240,
                }}
              />
              {(['all', 'active', 'paused', 'draft'] as const).map(s => {
                const active = filterStatus === s
                const accent = s === 'all' ? C.blue : s === 'active' ? C.mint : s === 'paused' ? C.amber : C.red
                return (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s)}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.65rem',
                      letterSpacing: '0.08em',
                      textTransform: 'capitalize',
                      padding: '0.35rem 0.75rem',
                      borderRadius: 6,
                      cursor: 'pointer',
                      background: active ? accent + '18' : 'transparent',
                      color: active ? accent : C.muted,
                      border: `1px solid ${active ? accent + '55' : C.border}`,
                      transition: 'all 0.15s',
                    }}
                  >
                    {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                )
              })}
              <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: C.muted }}>
                {filtered.length} / {agents.length} agents
              </div>
            </div>

            <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1.6fr 90px 100px 110px 120px 180px',
                padding: '0.55rem 1.25rem',
                borderBottom: `1px solid ${C.border}`,
                fontFamily: 'var(--font-mono)',
                fontSize: '0.6rem',
                color: C.muted,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}>
                <div>Agent Name</div>
                <div>Ticker</div>
                <div>Status</div>
                <div>Published</div>
                <div>Last Updated</div>
                <div>Actions</div>
              </div>

              {loading && (
                <div style={{ padding: '2.5rem', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: C.muted }}>
                  Loading your agents…
                </div>
              )}

              {!loading && filtered.length === 0 && dbAgents.length === 0 && userId && userId !== 'anonymous' && (
                <div style={{ padding: '3rem 2rem', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, color: C.white, marginBottom: '.5rem' }}>No agents yet</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: C.muted, marginBottom: '1rem' }}>Create your first agent from the Quant Lab or Builders page.</div>
                  <button onClick={() => router.push('/dashboard/quant')} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, padding: '0.5rem 1.1rem', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', cursor: 'pointer' }}>
                    Open Quant Lab →
                  </button>
                </div>
              )}

              {!loading && filtered.length === 0 && (dbAgents.length > 0 || !userId || userId === 'anonymous') && (
                <div style={{ padding: '2.5rem', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: C.muted }}>
                  No agents match the current filter.
                </div>
              )}

              {filtered.map((a, i) => {
                const base = AGENT_CONFIGS.find(x => x.id === a.id)
                return (
                  <div
                    key={a.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.6fr 90px 100px 110px 120px 180px',
                      padding: '0.85rem 1.25rem',
                      borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none',
                      alignItems: 'center',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.bg3)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: C.white, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.name}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: C.muted, marginTop: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {base?.strategyType ?? (dbAgents.find(x => x.id === a.id)?.strategy_type ?? 'strategy')
                          ?.replace(/_/g, ' ')
                          ?.replace(/\b\w/g, (c: string) => c.toUpperCase())}
                      </div>
                    </div>

                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 600, color: C.text }}>
                      {a.ticker}
                    </div>

                    <div>
                      <select
                        value={a.status}
                        onChange={e => updateAgent(a.id, { status: e.target.value as AgentStatus })}
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.65rem',
                          background: C.bg3,
                          border: `1px solid ${STATUS_COLOR[a.status]}40`,
                          borderRadius: 5,
                          color: STATUS_COLOR[a.status],
                          padding: '0.25rem 0.5rem',
                          cursor: 'pointer',
                          outline: 'none',
                          appearance: 'none',
                          paddingRight: '1.2rem',
                          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%236B7280' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E")`,
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'right 0.4rem center',
                        }}
                      >
                        <option value="active">Active</option>
                        <option value="paused">Paused</option>
                        <option value="draft">Draft</option>
                      </select>
                    </div>

                    <div>
                      <button
                        onClick={() => {
                          if (!a.published) {
                            openPublish(a.id)
                          } else {
                            updateAgent(a.id, { published: false })
                          }
                        }}
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.62rem',
                          padding: '0.25rem 0.6rem',
                          borderRadius: 5,
                          cursor: 'pointer',
                          border: `1px solid ${a.published ? C.mint + '55' : C.border}`,
                          background: a.published ? C.mint + '15' : 'transparent',
                          color: a.published ? C.mint : C.muted,
                          transition: 'all 0.15s',
                        }}
                      >
                        {a.published ? 'Published' : 'Publish'}
                      </button>
                    </div>

                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: C.muted }}>
                      {new Date(a.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>

                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      <button
                        onClick={() => openEdit(a.id)}
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.62rem',
                          padding: '0.25rem 0.6rem',
                          borderRadius: 5,
                          cursor: 'pointer',
                          background: 'transparent',
                          border: `1px solid ${C.border}`,
                          color: C.text,
                          transition: 'border-color 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = C.blue)}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => resetAgent(a.id)}
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.62rem',
                          padding: '0.25rem 0.6rem',
                          borderRadius: 5,
                          cursor: 'pointer',
                          background: 'transparent',
                          border: `1px solid ${C.border}`,
                          color: C.muted,
                          transition: 'border-color 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = C.red)}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                      >
                        Reset
                      </button>
                      <button
                        onClick={() => router.push('/dashboard/build')}
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.62rem',
                          padding: '0.25rem 0.6rem',
                          borderRadius: 5,
                          cursor: 'pointer',
                          background: C.blue + '18',
                          border: `1px solid ${C.blue + '40'}`,
                          color: C.blue,
                          transition: 'all 0.15s',
                        }}
                      >
                        Deploy
                      </button>
                      {a.published && (
                        <button
                          onClick={() => delistAgent(a.id)}
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.62rem',
                            padding: '0.25rem 0.6rem',
                            borderRadius: 5,
                            cursor: 'pointer',
                            background: 'transparent',
                            border: `1px solid ${C.red + '50'}`,
                            color: C.red,
                          }}
                        >
                          Delist
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {view === 'docs' && <DocsView />}
      </div>

      {isSlideOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200 }}
          onClick={closeSlide}
        />
      )}

      <div
        ref={slideRef}
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
    </div>
  )
}

function EditPanel({
  agent,
  draft,
  setDraft,
  onSave,
  onRepublish,
  onClose,
}: {
  agent: AgentSave
  draft: Partial<AgentSave>
  setDraft: React.Dispatch<React.SetStateAction<Partial<AgentSave>>>
  onSave: () => void
  onRepublish: () => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<'meta' | 'strategy' | 'config'>('meta')
  const [republishing, setRepublishing] = useState(false)

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
      <div style={{ padding: '1.5rem 1.75rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.1em', color: C.muted, textTransform: 'uppercase', marginBottom: '0.3rem' }}>
            Edit Agent · v{agent.version ?? 1}
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: C.white }}>{agent.name}</div>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, padding: '0.25rem' }}
        >
          x
        </button>
      </div>

      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, padding: '0 1rem', gap: '.25rem' }}>
        {(['meta','strategy','config'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '.62rem',
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              padding: '.65rem .9rem',
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
            config.json — params for the Active Swing engine
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 1.75rem' }}>
        {fields.map(f => (
          <div key={f.key} style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.1em', color: C.muted, textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              {f.label}
            </div>
            {f.multiline ? (
              <textarea
                value={(draft[f.key] as string) ?? ''}
                onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}
                rows={6}
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

        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.1em', color: C.muted, textTransform: 'uppercase', marginBottom: '0.4rem' }}>
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

      <div style={{ padding: '1rem 1.25rem', borderTop: `1px solid ${C.border}`, display: 'flex', gap: '0.65rem', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: C.faint }}>
          Republish ships v{(agent.version ?? 1) + 1} to the exchange
        </div>
        <div style={{ display: 'flex', gap: '.6rem' }}>
          <button
            onClick={onClose}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.7rem',
              padding: '0.5rem 1rem',
              borderRadius: 6,
              cursor: 'pointer',
              background: 'transparent',
              border: `1px solid ${C.border}`,
              color: C.muted,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.7rem',
              padding: '0.5rem 1rem',
              borderRadius: 6,
              cursor: 'pointer',
              background: 'transparent',
              border: `1px solid ${C.blue}55`,
              color: C.blue,
              fontWeight: 600,
            }}
          >
            Save Draft
          </button>
          <button
            onClick={handleRepublish}
            disabled={republishing}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.7rem',
              padding: '0.5rem 1.1rem',
              borderRadius: 6,
              cursor: republishing ? 'not-allowed' : 'pointer',
              background: C.mint,
              border: 'none',
              color: '#fff',
              fontWeight: 700,
              opacity: republishing ? 0.6 : 1,
            }}
          >
            {republishing ? 'Publishing…' : 'Save & Republish'}
          </button>
        </div>
      </div>
    </>
  )
}

function PublishPanel({
  agent,
  confirmed,
  onConfirm,
  onClose,
}: {
  agent: AgentSave
  confirmed: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <>
      <div style={{ padding: '1.5rem 1.75rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.1em', color: C.muted, textTransform: 'uppercase', marginBottom: '0.3rem' }}>Publish Agent</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: C.white }}>{agent.name}</div>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, padding: '0.25rem' }}
        >
          x
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1.75rem' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.08em', color: C.muted, textTransform: 'uppercase', marginBottom: '1rem' }}>
          Publishing Requirements
        </div>
        <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', marginBottom: '1.5rem' }}>
          {PUBLISH_REQUIREMENTS.map((req, i) => (
            <div
              key={req.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.85rem',
                padding: '0.85rem 1rem',
                borderBottom: i < PUBLISH_REQUIREMENTS.length - 1 ? `1px solid ${C.border}` : 'none',
              }}
            >
              <div style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: C.mint + '20',
                border: `1.5px solid ${C.mint}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.mint }} />
              </div>
              <div style={{ fontSize: '0.8rem', color: C.text }}>{req.label}</div>
              <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: C.mint }}>
                PASS
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, padding: '1rem 1.1rem', marginBottom: '1.5rem' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
            Summary
          </div>
          <div style={{ fontSize: '0.78rem', color: C.text, lineHeight: 1.6 }}>
            Publishing makes this agent visible to subscribers on the ASE Exchange. It will appear in the agent marketplace and can receive capital allocations.
          </div>
        </div>

        {confirmed && (
          <div style={{
            background: C.mint + '15',
            border: `1px solid ${C.mint + '40'}`,
            borderRadius: 8,
            padding: '0.85rem 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.mint, flexShrink: 0 }} />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: C.mint }}>
              Published successfully.
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '1.25rem 1.75rem', borderTop: `1px solid ${C.border}`, display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
        <button
          onClick={onClose}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.7rem',
            padding: '0.5rem 1.1rem',
            borderRadius: 6,
            cursor: 'pointer',
            background: 'transparent',
            border: `1px solid ${C.border}`,
            color: C.muted,
          }}
        >
          Cancel
        </button>
        {!confirmed && (
          <button
            onClick={onConfirm}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.7rem',
              padding: '0.5rem 1.25rem',
              borderRadius: 6,
              cursor: 'pointer',
              background: C.mint,
              border: 'none',
              color: '#fff',
              fontWeight: 600,
            }}
          >
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
        fontFamily: 'var(--font-mono)',
        fontSize: '0.6rem',
        letterSpacing: '0.12em',
        color: C.blue,
        textTransform: 'uppercase',
        marginBottom: '0.6rem',
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

function DocHeading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: C.white, marginBottom: '0.5rem', marginTop: '1.1rem' }}>
      {children}
    </div>
  )
}

function DocList({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: '0 0 1rem', paddingLeft: 0, listStyle: 'none' }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', fontSize: '0.8rem', color: C.text, marginBottom: '0.45rem', lineHeight: 1.6 }}>
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
                  padding: '0.55rem 0.85rem',
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

function DocsView() {
  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.12em', color: C.muted, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
          Reference
        </div>
        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: C.white, marginBottom: '0.5rem' }}>
          How to Create Agents on ASE
        </div>
        <div style={{ fontSize: '0.82rem', color: C.muted, lineHeight: 1.6 }}>
          A complete guide to writing, backtesting, and deploying trading agents on the Algorithmic Strategy Exchange.
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

      <DocSection title="Step-by-Step Workflow">
        <DocHeading>1. Write your strategy in Quant Lab</DocHeading>
        <DocParagraph>
          Open the Quant Lab IDE from the sidebar. Write your trading logic using the ASE strategy API. Quant Lab provides a full TypeScript environment with access to market data utilities, indicator functions, and the backtesting runtime.
        </DocParagraph>

        <DocHeading>2. Run the backtest</DocHeading>
        <DocParagraph>
          ASE handles backtesting automatically. Submit your strategy and the engine runs a full simulation across historical data. The engine applies realistic slippage, commissions, and capital constraints. You do not need to configure data feeds or write test harnesses.
        </DocParagraph>

        <DocHeading>3. Review results in Backtest Studio</DocHeading>
        <DocParagraph>
          Navigate to Backtest Studio to see your strategy grade, Sharpe ratio, max drawdown, and full equity curve. Compare against benchmarks. Run robustness checks including Monte Carlo simulation and walk-forward validation.
        </DocParagraph>

        <DocHeading>4. Publish to the Exchange</DocHeading>
        <DocParagraph>
          Once your strategy meets the publishing requirements, click Publish from Agent Manager. A checklist confirms all requirements are met. After confirmation, the agent becomes visible in the marketplace and can receive subscriber capital.
        </DocParagraph>
      </DocSection>

      <DocSection title="Publishing Requirements">
        <DocParagraph>
          All agents must satisfy the following before they can be published to the Exchange:
        </DocParagraph>
        <DocList items={[
          'Description must be at least 50 characters explaining the strategy logic',
          'A valid ticker symbol must be set (single asset or basket identifier)',
          'The strategy must have completed at least one backtest run',
          'Strategy grade of B or above is strongly recommended — agents graded C or below may receive reduced visibility',
          'Agent name must be unique across the platform',
        ]} />
      </DocSection>

      <DocSection title="The Standardized Engine">
        <DocParagraph>
          ASE runs a single, well-tuned backtest engine — <DocCode>active_swing</DocCode> —
          for every agent on the platform. It uses RSI(7) entries inside an EMA(8/21)
          trend filter with an ATR(10) trailing stop, and is tuned to produce around
          200 round-trips over a 6-month window on liquid crypto pairs.
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
        <DocParagraph>
          Edit <DocCode>strategy.ts</DocCode> and <DocCode>config.json</DocCode> in
          Agent Studio to customize behavior per-agent, then hit <DocCode>Save &amp; Republish</DocCode>
          to ship a new version to the exchange.
        </DocParagraph>
      </DocSection>

      <DocSection title="Risk Controls">
        <DocParagraph>
          Every agent on ASE operates under platform-level risk controls that run on top of your strategy logic. These cannot be disabled.
        </DocParagraph>
        <DocList items={[
          'Maximum drawdown limit: if a single agent loses more than 25% from its peak NAV, it is paused automatically and placed in review',
          'ATR-based position sizing: entries are sized based on realized volatility to prevent outsized exposure on high-vol assets',
          'Kill switch: the platform can halt all agent orders in the event of an exchange-level circuit breaker or detected data feed error',
          'Maximum single-position exposure: no agent may hold more than 40% of its capital in a single position at any time',
          'Trade rate limits: agents are rate-limited to prevent excessive churning that would erode returns via fees',
        ]} />
        <DocParagraph>
          Your strategy should define its own inner risk limits as well. The platform controls are a safety net, not a substitute for sound strategy design.
        </DocParagraph>

        <DocHeading>Fee Structure</DocHeading>
        <DocParagraph>
          Backtests apply realistic costs. Equities assume <DocCode>$0.005/share</DocCode> commission with 5bps slippage. Crypto assumes <DocCode>0.1% taker</DocCode> fee with 10bps slippage. These are applied automatically — you do not configure them.
        </DocParagraph>
      </DocSection>
    </div>
  )
}
