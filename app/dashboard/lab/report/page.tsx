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

function ReportPageInner() {
  const searchParams = useSearchParams()
  const agentId = searchParams.get('agent_id')
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<any>(null)

  useEffect(() => {
    if (!agentId) { setLoading(false); return }
    setLoading(true)
    fetch(`/api/quant/agent/save?id=${agentId}`)
      .then(r => r.json())
      .then(j => {
        if (j.agent?.last_backtest) {
          setResult(j.agent.last_backtest)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [agentId])

  const ts = result?.tear_sheet ?? {}
  const grade = result?.grade ?? '—'
  const gradeColor = grade?.startsWith('A') ? C.green : grade?.startsWith('B') ? C.blue : C.amber
  const equity: any[] = result?.equity_curve ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bg, color: C.text, fontFamily: 'var(--font-sans)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 1rem', height: 42, borderBottom: '1px solid ' + C.border, background: C.surface, flexShrink: 0 }}>
        <Link href="/dashboard/lab" style={{ fontSize: '0.55rem', color: C.blue, textDecoration: 'none' }}>← Build</Link>
        <span style={{ color: C.faint }}>·</span>
        <div style={{ fontSize: '0.58rem', letterSpacing: '0.22em', color: C.faint, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>Full Report</div>
      </div>
      
      <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
        {!agentId ? (
          <div style={{ textAlign: 'center', color: C.muted, padding: '3rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>📊</div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: C.text }}>No Agent Selected</div>
            <div style={{ fontSize: '0.75rem', marginTop: 4 }}>Select an agent to view its full backtest report</div>
          </div>
        ) : loading ? (
          <div style={{ textAlign: 'center', color: C.muted, padding: '3rem' }}>Loading report...</div>
        ) : !result ? (
          <div style={{ textAlign: 'center', color: C.muted, padding: '3rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>📊</div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: C.text }}>No Backtest Data</div>
            <div style={{ fontSize: '0.75rem', marginTop: 4 }}>Run a backtest on this agent first</div>
            <Link href={`/dashboard/lab/backtest?agent_id=${agentId}`} style={{ display: 'inline-block', marginTop: 16, padding: '0.4rem 1rem', background: C.violet, color: 'white', textDecoration: 'none', borderRadius: 6, fontSize: '0.75rem' }}>Run Backtest</Link>
          </div>
        ) : (
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>Performance Report</div>
                <div style={{ fontSize: '0.75rem', color: C.muted, marginTop: 4 }}>Generated {new Date().toLocaleString()}</div>
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: gradeColor }}>{grade}</div>
                  <div style={{ fontSize: '0.5rem', color: C.faint, fontFamily: 'var(--font-mono)' }}>GRADE</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
              {[
                { label: 'CAGR', value: ts.cagr != null ? ts.cagr.toFixed(1) + '%' : '—', color: ts.cagr != null && ts.cagr > 0 ? C.green : C.red },
                { label: 'Sharpe', value: ts.sharpeRatio?.toFixed(2) ?? '—', color: ts.sharpeRatio != null && ts.sharpeRatio > 1 ? C.green : C.amber },
                { label: 'Max DD', value: ts.maxDrawdownPct != null ? ts.maxDrawdownPct.toFixed(1) + '%' : '—', color: C.red },
                { label: 'Win Rate', value: ts.winRate != null ? (ts.winRate * 100).toFixed(0) + '%' : '—', color: ts.winRate != null && ts.winRate > 0.4 ? C.green : C.blue },
              ].map(m => (
                <div key={m.label} style={{ background: C.surface, border: '1px solid ' + C.border, borderRadius: 10, padding: '1rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.5rem', color: C.faint, fontFamily: 'var(--font-mono)', marginBottom: 4 }}>{m.label}</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: m.color, fontFamily: 'var(--font-mono)' }}>{m.value}</div>
                </div>
              ))}
            </div>

            {equity.length > 2 && (
              <div style={{ background: C.surface, border: '1px solid ' + C.border, borderRadius: 10, padding: '1rem', marginBottom: 24 }}>
                <div style={{ fontSize: '0.5rem', letterSpacing: '0.15em', color: C.faint, fontFamily: 'var(--font-mono)', marginBottom: 12 }}>EQUITY CURVE</div>
                <svg viewBox="0 0 500 120" style={{ width: '100%', height: 120 }}>
                  {(() => {
                    const vals = equity.map(d => d.equity)
                    const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1
                    const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * 500},${120 - ((v - min) / range) * 100}`).join(' ')
                    const color = vals[vals.length - 1] > vals[0] ? C.green : C.red
                    return (
                      <>
                        <defs><linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.3" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
                        <polygon points={`0,120 ${pts} 500,120`} fill="url(#eqGrad)" />
                        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" />
                      </>
                    )
                  })()}
                </svg>
              </div>
            )}

            <div style={{ background: C.surface, border: '1px solid ' + C.border, borderRadius: 10, padding: '1rem' }}>
              <div style={{ fontSize: '0.5rem', letterSpacing: '0.15em', color: C.faint, fontFamily: 'var(--font-mono)', marginBottom: 12 }}>METRICS</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, fontSize: '0.7rem' }}>
                {[
                  ['Alpha', ts.alphaAnnualizedPct != null ? ts.alphaAnnualizedPct.toFixed(1) + '%' : '—'],
                  ['Beta', ts.beta ?? '—'],
                  ['Volatility', ts.volatilityPct != null ? ts.volatilityPct.toFixed(1) + '%' : '—'],
                  ['Sortino', ts.sortinoRatio?.toFixed(2) ?? '—'],
                  ['Calmar', ts.calmarRatio?.toFixed(2) ?? '—'],
                  ['Total Trades', String(result?.n_trades ?? 0)],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid ' + C.border }}>
                    <span style={{ color: C.faint }}>{k}</span>
                    <span style={{ color: C.text, fontFamily: 'var(--font-mono)' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ReportPage() {
  return <Suspense fallback={<div style={{ background: C.bg, color: C.text, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>}><ReportPageInner /></Suspense>
}