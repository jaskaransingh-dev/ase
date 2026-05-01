'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const C = {
  bg: '#030608', bg2: '#060d17', bg3: '#0a1525',
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
  spec?: { alpha_type?: string; symbols?: string[] }
  status: string
  last_grade?: string
  last_sharpe?: number
  last_cagr?: number
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

const DRAFTS_KEY = 'ase_agent_drafts'

export default function ManageAgentsPage() {
  const router = useRouter()
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [ledger, setLedger] = useState<LedgerTrade[]>([])
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const loadDrafts = useCallback(() => {
    try {
      const raw = localStorage.getItem(DRAFTS_KEY) ?? '[]'
      setDrafts(JSON.parse(raw))
    } catch { setDrafts([]) }
  }, [])

  const loadAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/quant/agent/save')
      const json = await res.json()
      const list: AgentRow[] = json.agents ?? []
      const enriched = await Promise.all(list.map(async (a) => {
        if (a.status !== 'published') return a
        try {
          const lr = await fetch(`/api/quant/agent/ledger?agent_id=${a.id}&limit=1`)
          const lj = await lr.json()
          const trades = lj.trades ?? []
          return { ...a, trade_count: trades.length, last_trade_at: trades[0]?.executed_at ?? null }
        } catch { return a }
      }))
      setAgents(enriched)
      // Auto-select first published agent for ledger preview
      if (!activeAgentId && enriched.length) {
        const first = enriched.find(a => a.status === 'published') ?? enriched[0]
        setActiveAgentId(first.id)
      }
    } catch {}
    finally { setLoading(false) }
  }, [activeAgentId])

  // Hydrate ledger for the selected agent
  useEffect(() => {
    if (!activeAgentId) { setLedger([]); return }
    fetch(`/api/quant/agent/ledger?agent_id=${activeAgentId}&limit=50`)
      .then(r => r.json())
      .then(j => setLedger(j.trades ?? []))
      .catch(() => setLedger([]))
  }, [activeAgentId])

  useEffect(() => { loadDrafts(); loadAgents() }, [loadDrafts, loadAgents])

  const totalNotional = useMemo(
    () => ledger.reduce((s, r) => s + (Number(r.notional) || 0), 0),
    [ledger]
  )

  return (
    <div style={{ width: '100%', height: 'calc(100vh - 56px)', overflow: 'hidden', background: C.bg, color: C.white, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '.4rem .65rem', borderBottom: `1px solid ${C.border}`, background: `${C.bg2}cc`, flexShrink: 0 }}>
        <button onClick={() => router.push('/dashboard/build')}
          style={{ padding: '.22rem .55rem', borderRadius: 5, background: C.mint, color: '#000', border: 'none', cursor: 'pointer', fontSize: '.55rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
          + New
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
        {/* ── Left: Drafts + Published Agents ─────────────────────────── */}
        <div style={{ borderRight: `1px solid ${C.border}`, overflow: 'auto', padding: '1rem 1.25rem' }}>
          <h2 style={{ fontSize: '.7rem', fontWeight: 700, color: C.white, letterSpacing: '.1em', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', margin: 0, marginBottom: '.55rem' }}>
            Drafts <span style={{ color: C.faint, fontSize: '.55rem', marginLeft: '.4rem' }}>({drafts.length})</span>
          </h2>
          {drafts.length === 0 && (
            <div style={{ padding: '.85rem 1rem', borderRadius: 8, border: `1px dashed ${C.border2}`, color: C.faint, fontSize: '.6rem' }}>
              No drafts. Pick blocks on the canvas → describe the strategy → press Build.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem', marginBottom: '1.4rem' }}>
            {drafts.map(d => (
              <div key={d.id} style={{ padding: '.6rem .8rem', borderRadius: 9, background: C.bg3, border: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem' }}>
                  <div style={{ fontSize: '.66rem', fontWeight: 600, color: C.white, lineHeight: 1.3 }}>{d.name}</div>
                  <span style={{ fontSize: '.46rem', color: C.faint, fontFamily: 'var(--font-mono)' }}>{timeAgo(new Date(d.createdAt).toISOString())}</span>
                </div>
                <div style={{ fontSize: '.54rem', color: C.faint, marginTop: '.18rem', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{d.prompt}</div>
                <div style={{ display: 'flex', gap: '.3rem', marginTop: '.4rem', flexWrap: 'wrap' }}>
                  {Object.keys(d.files).map(f => {
                    const ext = f.split('.').pop() ?? ''
                    const lc = { ts: C.blue, py: C.mint, json: C.orange }[ext] ?? C.faint
                    return <span key={f} style={{ fontSize: '.46rem', color: lc, fontFamily: 'var(--font-mono)', background: `${lc}12`, padding: '.05rem .3rem', borderRadius: 3 }}>{f}</span>
                  })}
                  {d.blocks.length > 0 && <span style={{ fontSize: '.46rem', color: C.purple, fontFamily: 'var(--font-mono)', background: `${C.purple}12`, padding: '.05rem .3rem', borderRadius: 3 }}>{d.blocks.length} blocks</span>}
                </div>
                <div style={{ display: 'flex', gap: '.35rem', marginTop: '.5rem' }}>
                  <button onClick={() => {
                    try {
                      localStorage.setItem('ase-files', JSON.stringify(d.files))
                      localStorage.setItem('ase_latest_draft_id', d.id)
                    } catch {}
                    router.push('/dashboard/build/code')
                  }} style={{ padding: '.22rem .55rem', borderRadius: 5, background: C.mint, color: '#000', border: 'none', fontSize: '.5rem', fontWeight: 700, cursor: 'pointer' }}>
                    Open in Code →
                  </button>
                  <button onClick={() => {
                    if (!confirm('Delete this draft?')) return
                    const updated = drafts.filter(x => x.id !== d.id)
                    try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(updated)) } catch {}
                    setDrafts(updated)
                  }} style={{ padding: '.22rem .45rem', borderRadius: 5, background: 'transparent', border: `1px solid ${C.border}`, color: C.faint, fontSize: '.46rem', cursor: 'pointer' }}>
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>

          <h2 style={{ fontSize: '.7rem', fontWeight: 700, color: C.white, letterSpacing: '.1em', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', margin: 0, marginBottom: '.55rem' }}>
            Published <span style={{ color: C.faint, fontSize: '.55rem', marginLeft: '.4rem' }}>({agents.filter(a => a.status === 'published').length})</span>
          </h2>
          {loading && <div style={{ color: C.faint, fontSize: '.6rem' }}>Loading agents…</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
            {agents.map(a => {
              const active = activeAgentId === a.id
              return (
                <div key={a.id} onClick={() => setActiveAgentId(a.id)} style={{
                  padding: '.6rem .8rem', borderRadius: 9, cursor: 'pointer',
                  background: active ? `${C.mint}10` : C.bg3,
                  border: `1px solid ${active ? C.mint + '40' : C.border}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem' }}>
                    <div style={{ fontSize: '.66rem', fontWeight: 600, color: C.white }}>{a.name}</div>
                    <span style={{ fontSize: '.46rem', padding: '.05rem .35rem', borderRadius: 3, background: a.status === 'published' ? `${C.mint}18` : `${C.faint}18`, color: a.status === 'published' ? C.mint : C.faint, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{a.status}</span>
                  </div>
                  <div style={{ fontSize: '.54rem', color: C.faint, marginTop: '.18rem', lineHeight: 1.5 }}>{a.thesis}</div>
                  <div style={{ display: 'flex', gap: '.85rem', marginTop: '.45rem', fontSize: '.5rem', fontFamily: 'var(--font-mono)', color: C.faint }}>
                    <span><span style={{ color: C.faint, opacity: .6 }}>SHARPE</span> <span style={{ color: (a.last_sharpe ?? 0) >= 1 ? C.mint : C.orange }}>{(a.last_sharpe ?? 0).toFixed(2)}</span></span>
                    <span><span style={{ color: C.faint, opacity: .6 }}>CAGR</span> <span style={{ color: (a.last_cagr ?? 0) >= 0 ? C.mint : C.red }}>{(a.last_cagr ?? 0).toFixed(1)}%</span></span>
                    <span><span style={{ color: C.faint, opacity: .6 }}>TRADES</span> <span style={{ color: C.white }}>{a.trade_count ?? 0}</span></span>
                    <span><span style={{ color: C.faint, opacity: .6 }}>LAST</span> {timeAgo(a.last_trade_at)}</span>
                  </div>
                </div>
              )
            })}
            {!loading && agents.length === 0 && (
              <div style={{ padding: '.85rem 1rem', borderRadius: 8, border: `1px dashed ${C.border2}`, color: C.faint, fontSize: '.6rem' }}>
                No agents saved yet. Build one and click Publish in the code editor.
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Ledger Preview for the selected agent ─────────────── */}
        <div style={{ overflow: 'auto', padding: '1rem 1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '.55rem' }}>
            <h2 style={{ fontSize: '.7rem', fontWeight: 700, color: C.white, letterSpacing: '.1em', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', margin: 0 }}>
              Ledger {activeAgentId ? <span style={{ color: C.faint, fontSize: '.55rem', marginLeft: '.4rem' }}>· {ledger.length} trades</span> : null}
            </h2>
            {activeAgentId && (
              <Link href={`/dashboard/build/backtest?agent_id=${activeAgentId}`}
                style={{ fontSize: '.55rem', color: C.mint, fontFamily: 'var(--font-mono)', textDecoration: 'none' }}>
                Open in Backtest →
              </Link>
            )}
          </div>

          {!activeAgentId && (
            <div style={{ padding: '.85rem 1rem', borderRadius: 8, border: `1px dashed ${C.border2}`, color: C.faint, fontSize: '.6rem' }}>
              Select an agent on the left to view its paper trade ledger here.
            </div>
          )}

          {activeAgentId && (
            <>
              <div style={{ display: 'flex', gap: '.55rem', marginBottom: '.65rem' }}>
                <div style={{ flex: 1, padding: '.5rem .65rem', borderRadius: 7, background: C.bg3, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: '.46rem', color: C.faint, fontFamily: 'var(--font-mono)', letterSpacing: '.08em' }}>TRADES</div>
                  <div style={{ fontSize: '.85rem', fontWeight: 700, color: C.white, fontFamily: 'var(--font-mono)' }}>{ledger.length}</div>
                </div>
                <div style={{ flex: 1, padding: '.5rem .65rem', borderRadius: 7, background: C.bg3, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: '.46rem', color: C.faint, fontFamily: 'var(--font-mono)', letterSpacing: '.08em' }}>NOTIONAL</div>
                  <div style={{ fontSize: '.85rem', fontWeight: 700, color: C.white, fontFamily: 'var(--font-mono)' }}>${totalNotional.toFixed(0)}</div>
                </div>
                <div style={{ flex: 1, padding: '.5rem .65rem', borderRadius: 7, background: C.bg3, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: '.46rem', color: C.faint, fontFamily: 'var(--font-mono)', letterSpacing: '.08em' }}>LAST TRADE</div>
                  <div style={{ fontSize: '.65rem', fontWeight: 700, color: C.white, fontFamily: 'var(--font-mono)' }}>{timeAgo(ledger[0]?.executed_at)}</div>
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.55rem' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {['#','Symbol','Side','Qty','Price','Notional','When'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '.46rem', letterSpacing: '.1em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((r, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '6px 8px', color: C.faint, fontFamily: 'var(--font-mono)' }}>{i + 1}</td>
                      <td style={{ padding: '6px 8px', color: C.orange, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{r.symbol}</td>
                      <td style={{ padding: '6px 8px', color: r.side === 'BUY' ? C.mint : C.red, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{r.side}</td>
                      <td style={{ padding: '6px 8px', color: C.text, fontFamily: 'var(--font-mono)' }}>{Number(r.qty).toFixed(4)}</td>
                      <td style={{ padding: '6px 8px', color: C.text, fontFamily: 'var(--font-mono)' }}>${Number(r.price).toFixed(2)}</td>
                      <td style={{ padding: '6px 8px', color: C.muted, fontFamily: 'var(--font-mono)' }}>${Number(r.notional).toFixed(0)}</td>
                      <td style={{ padding: '6px 8px', color: C.faint, fontFamily: 'var(--font-mono)' }}>{timeAgo(r.executed_at)}</td>
                    </tr>
                  ))}
                  {ledger.length === 0 && (
                    <tr><td colSpan={7} style={{ padding: '.85rem', color: C.faint, fontSize: '.55rem', textAlign: 'center' }}>
                      No trades yet — agent hasn&apos;t ticked since publish.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
