'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const C = { bg: '#070A12', panel: '#0C111B', border: 'rgba(30,42,61,0.8)', text: '#E6EBF5', muted: '#8A95AB', faint: '#5A6478', blue: '#4F8CFF', green: '#22C55E', amber: '#F59E0B' }

interface AgentRow {
  id: string
  name: string
  thesis: string
  spec: { template?: string; alpha_type?: string; cadence?: string; symbols?: string[] }
  status: string
  last_grade?: string
  last_sharpe?: number
  last_cagr?: number
  created_at: string
  updated_at: string
}

export default function MyAgents() {
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [filter, setFilter] = useState<'all' | 'draft' | 'tested' | 'published'>('all')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/quant/agent/save')
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'load failed')
        setAgents(json.agents)
      } catch (e: any) { setErr(e.message) } finally { setLoading(false) }
    })()
  }, [])

  const filtered = agents.filter(a => filter === 'all' || a.status === filter)

  async function publish(id: string) {
    const r = await fetch(`/api/quant/agent/publish?id=${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    const j = await r.json()
    if (r.ok) {
      setAgents(prev => prev.map(a => a.id === id ? { ...a, status: 'published' } : a))
    } else alert(j.error)
  }

  async function tick(id: string) {
    const r = await fetch('/api/quant/agent/tick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_id: id }) })
    const j = await r.json()
    alert(`Ticked: ${JSON.stringify(j.ticked)}`)
  }

  return (
    <div style={{ padding: '1.25rem', height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
        <div>
          <div style={{ fontSize: '0.55rem', letterSpacing: '0.2em', color: C.faint, fontFamily: 'var(--font-mono)' }}>QUANT LAB</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>My Agents</div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'draft', 'tested', 'published'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '0.4rem 0.7rem', borderRadius: 6, fontSize: '0.65rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
              background: filter === f ? C.blue : 'transparent', color: filter === f ? 'white' : C.muted, border: `1px solid ${filter === f ? C.blue : C.border}`, cursor: 'pointer',
            }}>{f.toUpperCase()}</button>
          ))}
          <Link href="/dashboard/lab" style={{ padding: '0.4rem 0.7rem', borderRadius: 6, fontSize: '0.65rem', fontFamily: 'var(--font-mono)', background: C.green, color: 'white', textDecoration: 'none', letterSpacing: '0.08em' }}>+ NEW</Link>
        </div>
      </div>

      {loading && <div style={{ color: C.muted, fontSize: '0.85rem' }}>Loading…</div>}
      {err && <div style={{ color: '#EF4444', fontSize: '0.85rem' }}>{err}</div>}

      {!loading && filtered.length === 0 && (
        <div style={{ padding: '3rem', textAlign: 'center', color: C.faint, fontStyle: 'italic' }}>No agents yet — create one in Agent mode.</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.7rem' }}>
        {filtered.map(a => (
          <div key={a.id} style={{ padding: '0.85rem 1rem', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: '0.55rem', color: C.faint, fontFamily: 'var(--font-mono)', letterSpacing: '0.15em' }}>{a.spec?.template?.toUpperCase()}</div>
              <Badge status={a.status} />
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 4 }}>{a.name}</div>
            <div style={{ fontSize: '0.75rem', color: C.muted, lineHeight: 1.4, marginBottom: 8, minHeight: 40 }}>{a.thesis}</div>
            <div style={{ fontSize: '0.65rem', color: C.muted, fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
              {a.spec?.alpha_type} · {a.spec?.cadence ?? '1h'} · {a.spec?.symbols?.length ?? 0} symbols
            </div>
            {(a.last_grade || a.last_sharpe) && (
              <div style={{ fontSize: '0.7rem', color: C.muted, fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
                grade <span style={{ color: C.text }}>{a.last_grade ?? '—'}</span> · Sharpe <span style={{ color: C.text }}>{a.last_sharpe?.toFixed(2) ?? '—'}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
              {a.status !== 'published' && (
                <button onClick={() => publish(a.id)} style={btn(C.green)}>PUBLISH →</button>
              )}
              {a.status === 'published' && (
                <button onClick={() => tick(a.id)} style={btn(C.blue)}>TICK NOW</button>
              )}
              <Link href={`/dashboard/lab/studio?agent=${a.id}`} style={{ ...btn(C.border), color: C.muted, textDecoration: 'none' }}>EDIT</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Badge({ status }: { status: string }) {
  const colors: Record<string, string> = { draft: C.muted, tested: C.amber, published: C.green, archived: C.faint }
  const c = colors[status] ?? C.muted
  return <span style={{ fontSize: '0.55rem', padding: '2px 6px', borderRadius: 3, background: c + '22', color: c, border: `1px solid ${c}55`, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>{status.toUpperCase()}</span>
}

function btn(bg: string): React.CSSProperties {
  return { padding: '0.4rem 0.7rem', borderRadius: 5, background: bg, color: 'white', border: 'none', fontSize: '0.6rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', fontWeight: 700, cursor: 'pointer' }
}
