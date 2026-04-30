'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

const C = {
  bg: '#0B1728', surface: '#101A2D', surface2: '#162438', surface3: '#1E2A3D',
  border: 'rgba(79, 140, 255, 0.1)', borderActive: 'rgba(79, 140, 255, 0.3)',
  text: '#F5F8FC', text2: '#D9E3F1', muted: '#7F8CA3', faint: '#55657A',
  orange: '#F59E0B', violet: '#8B5CF6', purple: '#A78BFA', blue: '#4F8CFF',
  green: '#16C784', red: '#E45867', amber: '#F59E0B', cyan: '#6DD3FF',
}

function LedgerPageInner() {
  const searchParams = useSearchParams()
  const agentId = searchParams.get('agent_id')
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    if (!agentId) { setLoading(false); return }
    setLoading(true)
    fetch(`/api/quant/agent/ledger?agent_id=${agentId}&limit=100`)
      .then(r => r.json())
      .then(j => setRows(j.trades ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [agentId])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bg, color: C.text, fontFamily: 'var(--font-sans)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 1rem', height: 42, borderBottom: '1px solid ' + C.border, background: C.surface, flexShrink: 0 }}>
        <Link href="/dashboard/lab" style={{ fontSize: '0.55rem', color: C.blue, textDecoration: 'none' }}>← Build</Link>
        <span style={{ color: C.faint }}>·</span>
        <div style={{ fontSize: '0.58rem', letterSpacing: '0.22em', color: C.faint, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>Paper Ledger</div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '0.55rem', color: C.muted, fontFamily: 'var(--font-mono)' }}>{rows.length} trades</span>
      </div>
      
      <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>
        {!agentId ? (
          <div style={{ textAlign: 'center', color: C.muted, padding: '3rem' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📋</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: C.text }}>No Agent Selected</div>
            <div style={{ fontSize: '0.75rem', marginTop: 4 }}>Select an agent from the builder to view its ledger</div>
            <Link href="/dashboard/lab" style={{ display: 'inline-block', marginTop: 16, padding: '0.4rem 1rem', background: C.violet, color: 'white', textDecoration: 'none', borderRadius: 6, fontSize: '0.75rem' }}>Go to Builder</Link>
          </div>
        ) : loading ? (
          <div style={{ textAlign: 'center', color: C.muted, padding: '3rem' }}>Loading trades...</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', color: C.muted, padding: '3rem' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📋</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: C.text }}>No Trades Yet</div>
            <div style={{ fontSize: '0.75rem', marginTop: 4 }}>Publish an agent to start paper trading</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.65rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid ' + C.border }}>
                {['#', 'Symbol', 'Side', 'Qty', 'Price', 'Notional', 'When'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '0.5rem', letterSpacing: '0.1em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <>
                  <tr key={i} onClick={() => setExpanded(expanded === i ? null : i)} style={{ borderBottom: '1px solid ' + C.border, cursor: 'pointer', background: expanded === i ? C.surface2 : 'transparent' }}>
                    <td style={{ padding: '8px 12px', color: C.faint, fontFamily: 'var(--font-mono)' }}>{i + 1}</td>
                    <td style={{ padding: '8px 12px', color: C.amber, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{r.symbol}</td>
                    <td style={{ padding: '8px 12px', color: r.side === 'BUY' ? C.green : C.red, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{r.side}</td>
                    <td style={{ padding: '8px 12px', color: C.text, fontFamily: 'var(--font-mono)' }}>{typeof r.qty === 'number' ? r.qty.toFixed(4) : r.qty}</td>
                    <td style={{ padding: '8px 12px', color: C.text, fontFamily: 'var(--font-mono)' }}>${typeof r.price === 'number' ? r.price.toFixed(2) : r.price}</td>
                    <td style={{ padding: '8px 12px', color: C.muted, fontFamily: 'var(--font-mono)' }}>${typeof r.notional === 'number' ? r.notional.toFixed(0) : r.notional}</td>
                    <td style={{ padding: '8px 12px', color: C.faint }}>{r.executed_at ? new Date(r.executed_at).toLocaleString() : '—'}</td>
                  </tr>
                  {expanded === i && (
                    <tr key={i + '-detail'}>
                      <td colSpan={7} style={{ padding: '12px', background: C.surface, borderBottom: '1px solid ' + C.border }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, fontSize: '0.6rem' }}>
                          <div><span style={{ color: C.faint }}>Trade ID:</span> <span style={{ color: C.text, fontFamily: 'var(--font-mono)' }}>{r.id || '—'}</span></div>
                          <div><span style={{ color: C.faint }}>Mode:</span> <span style={{ color: C.text }}>{r.mode || 'paper'}</span></div>
                          <div><span style={{ color: C.faint }}>Owner:</span> <span style={{ color: C.text, fontFamily: 'var(--font-mono)' }}>{r.owner_id?.slice(0, 8) || '—'}...</span></div>
                          <div><span style={{ color: C.faint }}>UTC:</span> <span style={{ color: C.text }}>{r.executed_at ? new Date(r.executed_at).toISOString() : '—'}</span></div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default function LedgerPage() {
  return <Suspense fallback={<div style={{ background: C.bg, color: C.text, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>}><LedgerPageInner /></Suspense>
}