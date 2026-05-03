'use client'

/**
 * Manage Agents — tabbed surface that replaces the old split-pane.
 *
 *   Drafts (local) — work-in-progress strategies saved to localStorage by
 *                    /dashboard/build's autosave. Open in code, delete, or
 *                    publish-from-draft via the inline action.
 *   Published      — ai_agents rows whose status='published'. Live trading
 *                    metrics, last-tick freshness, archive/republish.
 *   Activity       — flat ledger view across all your published agents
 *                    (last 100 trades), so you can see what's actually
 *                    firing.
 */

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const C = {
  bg: '#030608', bg2: '#060d17', bg3: '#0a1525', bg4: '#0e1c30',
  border: '#1a2535', border2: '#243347',
  text: '#94a3b8', faint: '#475569', muted: '#64748b',
  white: '#f1f5f9', blue: '#3b82f6', blue2: '#60a5fa',
  mint: '#16c784', orange: '#f59e0b', red: '#ef4444', purple: '#8b5cf6',
}

interface Draft {
  id: string
  name: string
  prompt: string
  files: Record<string, string>
  blocks: string[]
  createdAt: number
}

interface AgentRow {
  id: string
  name: string
  thesis: string
  spec?: { alpha_type?: string; symbols?: string[]; cadence?: string }
  status: string
  last_grade?: string
  last_sharpe?: number
  last_cagr?: number
  last_max_dd?: number
  slug?: string
  last_tick_at?: string
  trade_count?: number
  last_trade_at?: string
  created_at: string
  updated_at: string
}

interface LedgerTrade {
  symbol: string
  side: string
  qty: number
  price: number
  notional: number
  executed_at: string
  agent_id?: string
}

// Hook that returns a stable timestamp per render — refreshes every minute
// so "12m ago" stays roughly accurate without hammering re-renders. The
// react/purity lint rule blocks raw Date.now() calls in render.
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}

function timeAgo(iso?: string | null, now: number = 0) {
  if (!iso) return '—'
  const diff = (now || Date.now()) - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const DRAFTS_KEY = 'ase_agent_drafts'

type Tab = 'drafts' | 'published' | 'activity'

export default function ManageAgentsPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('drafts')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [activity, setActivity] = useState<LedgerTrade[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)

  const loadDrafts = useCallback(() => {
    try { setDrafts(JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? '[]')) }
    catch { setDrafts([]) }
  }, [])

  const loadAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/quant/agent/save')
      const json = await res.json()
      const list: AgentRow[] = json.agents ?? []
      const enriched = await Promise.all(list.map(async (a) => {
        try {
          const lr = await fetch(`/api/quant/agent/ledger?agent_id=${a.id}&limit=1`)
          const lj = await lr.json()
          const trades = lj.trades ?? []
          return { ...a, trade_count: trades.length, last_trade_at: trades[0]?.executed_at ?? null }
        } catch { return a }
      }))
      setAgents(enriched)
    } catch {}
    finally { setLoading(false) }
  }, [])

  const loadActivity = useCallback(async () => {
    try {
      const published = agents.filter(a => a.status === 'published')
      const all: LedgerTrade[] = []
      for (const a of published) {
        try {
          const lr = await fetch(`/api/quant/agent/ledger?agent_id=${a.id}&limit=20`)
          const lj = await lr.json()
          const tr = (lj.trades ?? []) as LedgerTrade[]
          tr.forEach(t => all.push({ ...t, agent_id: a.id }))
        } catch {}
      }
      all.sort((a, b) => +new Date(b.executed_at) - +new Date(a.executed_at))
      setActivity(all.slice(0, 100))
    } catch {}
  }, [agents])

  useEffect(() => { loadDrafts(); loadAgents() }, [loadDrafts, loadAgents])
  useEffect(() => { if (tab === 'activity') loadActivity() }, [tab, loadActivity])

  const published = useMemo(() => agents.filter(a => a.status === 'published'), [agents])
  const tested = useMemo(() => agents.filter(a => a.status !== 'published'), [agents])

  // ── Actions ─────────────────────────────────────────────────────────────────
  function openDraftInCode(d: Draft) {
    try {
      localStorage.setItem('ase-files', JSON.stringify(d.files))
      localStorage.setItem('ase_latest_draft_id', d.id)
      localStorage.setItem('ase_build_agent_name', d.name)
    } catch {}
    router.push('/dashboard/build/code')
  }
  function openDraftInBuild(d: Draft) {
    try {
      localStorage.setItem('ase-files', JSON.stringify(d.files))
      localStorage.setItem('ase_latest_draft_id', d.id)
      localStorage.setItem('ase_build_agent_name', d.name)
      localStorage.setItem('ase_build_prompt', d.prompt)
    } catch {}
    router.push('/dashboard/build')
  }
  function deleteDraft(id: string) {
    if (!confirm('Delete this draft? This cannot be undone.')) return
    const next = drafts.filter(x => x.id !== id)
    try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(next)) } catch {}
    setDrafts(next)
  }

  async function unpublish(a: AgentRow) {
    if (!confirm(`Unpublish "${a.name}"? Cron will stop ticking it.`)) return
    setActing(a.id)
    try {
      await fetch(`/api/quant/agent/save?id=${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      })
      await loadAgents()
    } finally { setActing(null) }
  }
  async function republish(a: AgentRow) {
    setActing(a.id)
    try {
      await fetch(`/api/quant/agent/publish?id=${a.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      await loadAgents()
    } finally { setActing(null) }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ width: '100%', minHeight: 'calc(100vh - 56px)', background: C.bg, color: C.white, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '.85rem 1.1rem .55rem', borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, letterSpacing: '.12em', fontWeight: 700, marginBottom: '.25rem' }}>MANAGE</div>
          <h1 style={{ fontSize: '1rem', fontWeight: 800, color: C.white, margin: 0, letterSpacing: '-.02em' }}>Your agents</h1>
        </div>

        {/* Stats overview */}
        <div style={{ display: 'flex', gap: '.5rem', marginLeft: 'auto', flexWrap: 'wrap' }}>
          {[
            { k: 'DRAFTS', v: drafts.length, c: C.purple },
            { k: 'PUBLISHED', v: published.length, c: C.mint },
            { k: 'TESTING', v: tested.length, c: C.orange },
            { k: 'TOTAL TRADES', v: agents.reduce((s, a) => s + (a.trade_count ?? 0), 0), c: C.blue2 },
          ].map(s => (
            <div key={s.k} style={{ padding: '.4rem .7rem', borderRadius: 7, background: C.bg2, border: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.4rem', color: C.faint, letterSpacing: '.1em' }}>{s.k}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', fontWeight: 700, color: s.c }}>{s.v}</div>
            </div>
          ))}
          <button onClick={() => router.push('/dashboard/build')}
            style={{ padding: '.4rem .85rem', borderRadius: 7, background: C.mint, color: '#000', border: 'none', cursor: 'pointer', fontSize: '.6rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
            + New Agent
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '.4rem', padding: '.55rem 1.1rem', borderBottom: `1px solid ${C.border}`, background: `${C.bg2}aa` }}>
        {([
          { id: 'drafts',    label: 'Drafts',    count: drafts.length,    color: C.purple },
          { id: 'published', label: 'Published', count: published.length, color: C.mint },
          { id: 'activity',  label: 'Activity',  count: activity.length,  color: C.blue2 },
        ] as const).map(t => {
          const active = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '.35rem',
                padding: '.32rem .7rem', borderRadius: 7,
                background: active ? `${t.color}14` : 'transparent',
                border: `1px solid ${active ? t.color + '50' : C.border}`,
                color: active ? t.color : C.faint,
                fontFamily: 'var(--font-mono)', fontSize: '.58rem', fontWeight: 700,
                cursor: 'pointer', transition: 'all .15s',
              }}>
              {t.label}
              <span style={{ fontSize: '.46rem', opacity: .8, fontWeight: 500 }}>{t.count}</span>
            </button>
          )
        })}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '1.1rem 1.25rem' }}>
        {tab === 'drafts' && (
          <DraftsList drafts={drafts}
            onOpenBuild={openDraftInBuild} onOpenCode={openDraftInCode} onDelete={deleteDraft} />
        )}
        {tab === 'published' && (
          <PublishedList agents={agents} loading={loading} acting={acting}
            onUnpublish={unpublish} onRepublish={republish}
            onView={(slug) => router.push(`/agents/${slug}`)} />
        )}
        {tab === 'activity' && (
          <ActivityList trades={activity} agents={agents} loading={loading} />
        )}
      </div>
    </div>
  )
}

// ── Drafts ─────────────────────────────────────────────────────────────────────
function DraftsList({ drafts, onOpenBuild, onOpenCode, onDelete }: {
  drafts: Draft[]
  onOpenBuild: (d: Draft) => void
  onOpenCode: (d: Draft) => void
  onDelete: (id: string) => void
}) {
  if (drafts.length === 0) {
    return (
      <Empty
        title="No drafts yet"
        body="Each time you build, the canvas auto-saves a draft. Open /dashboard/build, describe a strategy, and your work-in-progress lands here."
        cta="Open Build"
        href="/dashboard/build"
      />
    )
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '.6rem' }}>
      {drafts.map(d => (
        <div key={d.id} style={{ padding: '.7rem .85rem', borderRadius: 9, background: C.bg2, border: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '.7rem', fontWeight: 700, color: C.white, lineHeight: 1.3 }}>{d.name}</div>
            <span style={{ fontSize: '.46rem', color: C.faint, fontFamily: 'var(--font-mono)' }}>{timeAgo(new Date(d.createdAt).toISOString())}</span>
          </div>
          {d.prompt && (
            <div style={{ fontSize: '.54rem', color: C.text, marginTop: '.25rem', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{d.prompt}</div>
          )}
          <div style={{ display: 'flex', gap: '.3rem', marginTop: '.4rem', flexWrap: 'wrap' }}>
            {Object.keys(d.files).map(f => {
              const ext = f.split('.').pop() ?? ''
              const lc = { ts: C.blue, py: C.mint, json: C.orange, md: C.muted }[ext] ?? C.faint
              return <span key={f} style={{ fontSize: '.46rem', color: lc, fontFamily: 'var(--font-mono)', background: `${lc}14`, padding: '.05rem .3rem', borderRadius: 3 }}>{f}</span>
            })}
            {d.blocks.length > 0 && <span style={{ fontSize: '.46rem', color: C.purple, fontFamily: 'var(--font-mono)', background: `${C.purple}14`, padding: '.05rem .3rem', borderRadius: 3 }}>{d.blocks.length} blocks</span>}
          </div>
          <div style={{ display: 'flex', gap: '.35rem', marginTop: '.55rem' }}>
            <button onClick={() => onOpenBuild(d)}
              style={{ flex: 1, padding: '.3rem .55rem', borderRadius: 5, background: C.mint, color: '#000', border: 'none', fontSize: '.55rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
              Open in Build →
            </button>
            <button onClick={() => onOpenCode(d)}
              style={{ padding: '.3rem .55rem', borderRadius: 5, background: 'transparent', border: `1px solid ${C.border2}`, color: C.text, fontSize: '.55rem', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
              Code
            </button>
            <button onClick={() => onDelete(d.id)} title="Delete draft"
              style={{ padding: '.3rem .45rem', borderRadius: 5, background: 'transparent', border: `1px solid ${C.border}`, color: C.faint, fontSize: '.55rem', cursor: 'pointer' }}>
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Published ──────────────────────────────────────────────────────────────────
function PublishedList({ agents, loading, acting, onUnpublish, onRepublish, onView }: {
  agents: AgentRow[]
  loading: boolean
  acting: string | null
  onUnpublish: (a: AgentRow) => void
  onRepublish: (a: AgentRow) => void
  onView: (slug: string) => void
}) {
  // Hooks first — all early returns must come AFTER useNow() per the
  // rules-of-hooks lint rule. The `renderedAt` baseline is also used by
  // the staleness pill on each card.
  const renderedAt = useNow()
  if (loading) return <div style={{ color: C.faint, fontSize: '.65rem', padding: '1rem' }}>Loading agents…</div>
  if (agents.length === 0) {
    return (
      <Empty
        title="Nothing published yet"
        body="Build a strategy, run a backtest, hit Publish. Your live agents land here with their tick history and metrics."
        cta="Open Build"
        href="/dashboard/build"
      />
    )
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '.6rem' }}>
      {agents.map(a => {
        const live = a.status === 'published'
        const stale = a.last_trade_at && (renderedAt - +new Date(a.last_trade_at)) > 24 * 3600 * 1000
        const sharpe = a.last_sharpe ?? 0
        const cagr = a.last_cagr ?? 0
        return (
          <div key={a.id} style={{
            padding: '.75rem .9rem', borderRadius: 10,
            background: C.bg2, border: `1px solid ${live ? C.mint + '35' : C.border}`,
            borderLeft: `3px solid ${live ? C.mint : C.faint}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
              <div style={{ fontSize: '.72rem', fontWeight: 700, color: C.white, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
              <span style={{
                fontSize: '.42rem', padding: '.06rem .35rem', borderRadius: 3, fontFamily: 'var(--font-mono)',
                background: live ? `${C.mint}18` : `${C.faint}18`, color: live ? C.mint : C.faint,
                textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700,
              }}>{a.status}</span>
            </div>
            {a.thesis && <div style={{ fontSize: '.55rem', color: C.text, marginTop: '.25rem', lineHeight: 1.5 }}>{a.thesis}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '.25rem', marginTop: '.5rem', padding: '.45rem .55rem', borderRadius: 6, background: C.bg3 }}>
              <Stat label="SHARPE" value={sharpe.toFixed(2)} color={sharpe >= 1 ? C.mint : C.orange} />
              <Stat label="CAGR" value={`${cagr.toFixed(1)}%`} color={cagr >= 0 ? C.mint : C.red} />
              <Stat label="MAX DD" value={`${(a.last_max_dd ?? 0).toFixed(0)}%`} color={(a.last_max_dd ?? 0) > 30 ? C.red : C.text} />
              <Stat label="TRADES" value={String(a.trade_count ?? 0)} color={C.white} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '.4rem', fontSize: '.5rem', fontFamily: 'var(--font-mono)', color: C.faint }}>
              <span>cadence <span style={{ color: C.text }}>{a.spec?.cadence ?? '1h'}</span></span>
              <span>last trade <span style={{ color: stale ? C.orange : C.text }}>{timeAgo(a.last_trade_at)}</span></span>
            </div>
            <div style={{ display: 'flex', gap: '.3rem', marginTop: '.5rem' }}>
              {a.slug && (
                <button onClick={() => onView(a.slug!)}
                  style={{ flex: 1, padding: '.32rem .55rem', borderRadius: 5, background: 'transparent', border: `1px solid ${C.border2}`, color: C.text, fontSize: '.55rem', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
                  View on Exchange
                </button>
              )}
              <button onClick={() => onRepublish(a)} disabled={acting === a.id}
                title="Re-trigger publish + first cron tick"
                style={{ padding: '.32rem .55rem', borderRadius: 5, background: `${C.mint}14`, border: `1px solid ${C.mint}40`, color: C.mint, fontSize: '.55rem', cursor: acting === a.id ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                ↻
              </button>
              {live && (
                <button onClick={() => onUnpublish(a)} disabled={acting === a.id}
                  title="Archive — cron stops ticking, listing hidden"
                  style={{ padding: '.32rem .55rem', borderRadius: 5, background: 'transparent', border: `1px solid ${C.border}`, color: C.red, fontSize: '.55rem', cursor: acting === a.id ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-mono)' }}>
                  Archive
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Activity ───────────────────────────────────────────────────────────────────
function ActivityList({ trades, agents, loading }: { trades: LedgerTrade[]; agents: AgentRow[]; loading: boolean }) {
  const nameOf = (id?: string) => agents.find(a => a.id === id)?.name ?? '—'
  if (loading && !trades.length) return <div style={{ color: C.faint, fontSize: '.65rem' }}>Loading activity…</div>
  if (!trades.length) return (
    <Empty title="No trades posted yet" body="Once you publish an agent, the cron tick writes fills to its paper ledger. They show up here as they happen." />
  )
  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.55rem' }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}`, background: `${C.bg3}` }}>
            {['#','Agent','Symbol','Side','Qty','Price','Notional','When'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '.45rem .65rem', color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '.45rem', letterSpacing: '.1em', fontWeight: 700 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trades.map((r, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}
              onMouseEnter={e => e.currentTarget.style.background = `${C.bg3}55`}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <td style={{ padding: '.4rem .65rem', color: C.faint, fontFamily: 'var(--font-mono)' }}>{i + 1}</td>
              <td style={{ padding: '.4rem .65rem', color: C.text, fontFamily: 'var(--font-mono)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(r.agent_id)}</td>
              <td style={{ padding: '.4rem .65rem', color: C.orange, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{r.symbol}</td>
              <td style={{ padding: '.4rem .65rem', color: r.side === 'BUY' ? C.mint : C.red, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{r.side}</td>
              <td style={{ padding: '.4rem .65rem', color: C.text, fontFamily: 'var(--font-mono)' }}>{Number(r.qty).toFixed(4)}</td>
              <td style={{ padding: '.4rem .65rem', color: C.text, fontFamily: 'var(--font-mono)' }}>${Number(r.price).toFixed(2)}</td>
              <td style={{ padding: '.4rem .65rem', color: C.muted, fontFamily: 'var(--font-mono)' }}>${Number(r.notional).toFixed(0)}</td>
              <td style={{ padding: '.4rem .65rem', color: C.faint, fontFamily: 'var(--font-mono)' }}>{timeAgo(r.executed_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Bits ───────────────────────────────────────────────────────────────────────
function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.4rem', color: C.faint, letterSpacing: '.1em' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

function Empty({ title, body, cta, href }: { title: string; body: string; cta?: string; href?: string }) {
  return (
    <div style={{
      padding: '2.5rem 1rem', textAlign: 'center', maxWidth: 540, margin: '0 auto',
      borderRadius: 12, border: `1px dashed ${C.border2}`, background: `${C.bg2}66`,
    }}>
      <div style={{ fontSize: '.85rem', fontWeight: 700, color: C.white, marginBottom: '.4rem' }}>{title}</div>
      <div style={{ fontSize: '.6rem', color: C.text, lineHeight: 1.6, marginBottom: cta ? '1rem' : 0 }}>{body}</div>
      {cta && href && (
        <Link href={href}
          style={{ display: 'inline-block', padding: '.45rem .9rem', borderRadius: 7, background: C.mint, color: '#000', textDecoration: 'none', fontWeight: 700, fontSize: '.6rem', fontFamily: 'var(--font-mono)' }}>
          {cta} →
        </Link>
      )}
    </div>
  )
}
