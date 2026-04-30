'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const C = {
  bg: '#0B1728', surface: '#101A2D', surface2: '#162438', surface3: '#1E2A3D',
  border: 'rgba(79, 140, 255, 0.1)', borderActive: 'rgba(79, 140, 255, 0.3)',
  text: '#F5F8FC', text2: '#D9E3F1', muted: '#7F8CA3', faint: '#55657A',
  orange: '#F59E0B', violet: '#8B5CF6', purple: '#A78BFA', blue: '#4F8CFF',
  green: '#16C784', red: '#E45867', amber: '#F59E0B', pink: '#F472B6', cyan: '#6DD3FF',
}

interface AgentRow {
  id: string
  name: string
  thesis: string
  spec: { template?: string; alpha_type?: string; cadence?: string; symbols?: string[] }
  status: string
  last_grade?: string
  last_sharpe?: number
  last_cagr?: number
  slug?: string
  created_at: string
  updated_at: string
}

export default function MyAgents() {
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [filter, setFilter] = useState<'all' | 'draft' | 'tested' | 'published'>('all')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [publishing, setPublishing] = useState<string | null>(null)
  const [publishResult, setPublishResult] = useState<{ agentId: string; slug: string; agentUrl: string } | null>(null)

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
    setPublishing(id)
    setPublishResult(null)
    try {
      const res = await fetch(`/api/quant/agent/publish?id=${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ live: false }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Publish failed')

      setAgents(prev => prev.map(a => a.id === id ? { ...a, status: 'published' } : a))

      const agentName = agents.find(a => a.id === id)?.name ?? 'Agent'
      const slug = json.listing?.slug ?? ''
      const agentUrl = `/agents/${slug}`

      setPublishResult({ agentId: id, slug, agentUrl })

      const refreshed = await fetch('/api/quant/agent/save')
      const rJson = await refreshed.json()
      if (refreshed.ok) setAgents(rJson.agents ?? [])

      window.dispatchEvent(new CustomEvent('agent-published', { detail: { id, slug, name: agentName } }))
    } catch (e: any) {
      alert('Publish failed: ' + e.message)
    } finally {
      setPublishing(null)
    }
  }

  const statusColors: Record<string, string> = { draft: C.muted, tested: C.amber, published: C.green, archived: C.faint }
  const statusLabels: Record<string, string> = { draft: 'Draft', tested: 'Tested', published: 'Live', archived: 'Archived' }

  return (
    <div style={{ padding: '1.25rem', height: '100%', overflow: 'auto', background: C.bg, color: C.text, fontFamily: 'var(--font-sans)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.5rem', letterSpacing: '0.2em', color: C.faint, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>Quant Lab</div>
          <div style={{ fontSize: '1rem', fontWeight: 700 }}>My Agents</div>
          <div style={{ fontSize: '0.68rem', color: C.muted, marginTop: 2 }}>Build, backtest, and deploy your trading agents.</div>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {(['all', 'draft', 'tested', 'published'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '0.3rem 0.6rem', borderRadius: 5, fontSize: '0.55rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
              background: filter === f ? C.violet : 'transparent', color: filter === f ? 'white' : C.muted, border: `1px solid ${filter === f ? C.violet : C.border}`, cursor: 'pointer',
            }}>{f.toUpperCase()}</button>
          ))}
          <Link href="/dashboard/lab" style={{ padding: '0.3rem 0.6rem', borderRadius: 5, fontSize: '0.55rem', fontFamily: 'var(--font-mono)', background: C.violet, color: 'white', textDecoration: 'none', letterSpacing: '0.08em' }}>+ NEW</Link>
        </div>
      </div>

      {publishResult && (
        <div style={{ marginBottom: '0.75rem', padding: '0.7rem 0.85rem', background: `${C.green}10`, border: `1px solid ${C.green}40`, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: '1.2rem' }}>✓</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: C.green }}>Published to Exchange</div>
            <div style={{ fontSize: '0.6rem', color: C.muted, marginTop: 2 }}>Your agent is now live on the marketplace.</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <a href={publishResult.agentUrl} target="_blank" rel="noopener noreferrer" style={{ padding: '0.25rem 0.6rem', borderRadius: 4, background: C.green, color: 'white', textDecoration: 'none', fontSize: '0.55rem', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>VIEW →</a>
            <button onClick={() => setPublishResult(null)} style={{ padding: '0.25rem 0.4rem', borderRadius: 4, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, fontSize: '0.52rem', cursor: 'pointer' }}>×</button>
          </div>
        </div>
      )}

      {err && <div style={{ color: C.red, fontSize: '0.75rem', marginBottom: 8 }}>{err}</div>}
      {loading && <div style={{ color: C.muted }}>Loading...</div>}

      {!loading && filtered.length === 0 && (
        <div style={{ padding: '3rem', textAlign: 'center', color: C.faint }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>🧪</div>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: C.text }}>No {filter === 'all' ? '' : filter} agents</div>
          <div style={{ fontSize: '0.72rem', marginTop: 4 }}>Create one in the Builder</div>
          <Link href="/dashboard/lab" style={{ display: 'inline-block', marginTop: 12, padding: '0.4rem 1rem', background: C.violet, color: 'white', textDecoration: 'none', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600 }}>+ Build Agent</Link>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.6rem' }}>
        {filtered.map(a => {
          const spec = a.spec as any
          const isPublished = a.status === 'published'
          const isPublishing = publishing === a.id
          return (
            <div key={a.id} style={{ padding: '0.85rem', background: C.surface, border: `1px solid ${isPublished ? C.green : C.border}`, borderRadius: 8, position: 'relative' }}>
              {isPublished && (
                <div style={{ position: 'absolute', top: 8, right: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, boxShadow: `0 0 6px ${C.green}` }} />
                  <span style={{ fontSize: '0.45rem', color: C.green, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>LIVE</span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                <div style={{ fontSize: '0.5rem', color: C.faint, fontFamily: 'var(--font-mono)', letterSpacing: '0.12em' }}>{(spec?.template ?? 'composite').toUpperCase()}</div>
                <span style={{ fontSize: '0.48rem', padding: '1px 5px', borderRadius: 3, background: (statusColors[a.status] ?? C.muted) + '22', color: statusColors[a.status] ?? C.muted, border: `1px solid ${(statusColors[a.status] ?? C.muted)}55`, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>{statusLabels[a.status] ?? a.status.toUpperCase()}</span>
              </div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: 4, color: C.text }}>{a.name}</div>
              <div style={{ fontSize: '0.68rem', color: C.muted, lineHeight: 1.4, marginBottom: 8 }}>{a.thesis?.slice(0, 120)}{a.thesis?.length > 120 ? '…' : ''}</div>
              <div style={{ fontSize: '0.55rem', color: C.faint, fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
                {(spec?.alpha_type ?? '—').toUpperCase()} · {spec?.cadence ?? '1h'} · {spec?.symbols?.length ?? 0} symbols
              </div>
              {(a.last_grade || a.last_sharpe) && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  {a.last_grade && (
                    <div style={{ background: C.surface2, borderRadius: 4, padding: '0.2rem 0.5rem' }}>
                      <div style={{ fontSize: '0.42rem', color: C.faint, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>GRADE</div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 800, color: a.last_grade?.startsWith('A') ? C.green : a.last_grade?.startsWith('B') ? C.blue : C.amber, fontFamily: 'var(--font-mono)' }}>{a.last_grade}</div>
                    </div>
                  )}
                  {a.last_sharpe != null && (
                    <div style={{ background: C.surface2, borderRadius: 4, padding: '0.2rem 0.5rem' }}>
                      <div style={{ fontSize: '0.42rem', color: C.faint, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>SHARPE</div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 800, color: C.text, fontFamily: 'var(--font-mono)' }}>{a.last_sharpe.toFixed(2)}</div>
                    </div>
                  )}
                  {a.last_cagr != null && (
                    <div style={{ background: C.surface2, borderRadius: 4, padding: '0.2rem 0.5rem' }}>
                      <div style={{ fontSize: '0.42rem', color: C.faint, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>CAGR</div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 800, color: a.last_cagr > 0 ? C.green : C.red, fontFamily: 'var(--font-mono)' }}>{a.last_cagr.toFixed(1)}%</div>
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                {!isPublished && a.status === 'tested' && (
                  <button onClick={() => publish(a.id)} disabled={isPublishing} style={{ padding: '0.32rem 0.7rem', background: isPublishing ? C.surface2 : C.green, color: isPublishing ? C.muted : 'white', border: 'none', borderRadius: 4, fontSize: '0.55rem', fontFamily: 'var(--font-mono)', fontWeight: 700, cursor: isPublishing ? 'not-allowed' : 'pointer', letterSpacing: '0.06em' }}>
                    {isPublishing ? 'PUBLISHING…' : '🚀 PUBLISH'}
                  </button>
                )}
                {!isPublished && a.status === 'draft' && (
                  <span style={{ fontSize: '0.52rem', color: C.amber, fontFamily: 'var(--font-mono)', padding: '0.25rem 0' }}>Run backtest first</span>
                )}
                {isPublished && (
                  <a href={`/agents/${a.slug || a.id}`} target="_blank" rel="noopener noreferrer" style={{ padding: '0.32rem 0.7rem', borderRadius: 4, background: C.green, color: 'white', textDecoration: 'none', fontSize: '0.55rem', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.06em' }}>
                    VIEW →
                  </a>
                )}
                <Link href={`/dashboard/lab?agent=${a.id}`} target="_blank" style={{ padding: '0.32rem 0.6rem', borderRadius: 4, background: C.surface2, color: C.text2, textDecoration: 'none', fontSize: '0.55rem', fontFamily: 'var(--font-mono)', border: `1px solid ${C.border}`, letterSpacing: '0.06em' }}>
                  EDIT
                </Link>
                <Link href={`/dashboard/lab/backtest`} target="_blank" style={{ padding: '0.32rem 0.6rem', borderRadius: 4, background: 'transparent', color: C.violet, textDecoration: 'none', fontSize: '0.55rem', fontFamily: 'var(--font-mono)', border: `1px solid ${C.violet}30`, letterSpacing: '0.06em' }}>
                  BACKTEST
                </Link>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: '1rem', padding: '0.65rem 0.75rem', background: `${C.violet}08`, border: `1px solid ${C.violet}18`, borderRadius: 8 }}>
        <div style={{ fontSize: '0.62rem', fontWeight: 600, color: C.violet, marginBottom: 4 }}>How Publishing Works</div>
        <div style={{ fontSize: '0.55rem', color: C.muted, lineHeight: 1.6 }}>
          <div><span style={{ color: C.green }}>1.</span> Backtest until grade B+</div>
          <div><span style={{ color: C.green }}>2.</span> Click <b style={{ color: C.green }}>Publish</b> to list at /agents/</div>
          <div><span style={{ color: C.green }}>3.</span> Paper trading starts immediately</div>
        </div>
      </div>
    </div>
  )
}