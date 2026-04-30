'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const C = {
  bg: '#06060B', surface: '#0D0D14', surface2: '#15151F', surface3: '#1C1C2A',
  border: 'rgba(255,255,255,0.06)', borderAct: 'rgba(168,139,250,0.35)',
  text: '#EDE8FF', text2: '#C4BDF5', muted: '#7B7394', faint: '#3D3660',
  orange: '#FF8C42', violet: '#8B5CF6', purple: '#A78BFA', blue: '#60A5FA',
  green: '#34D399', red: '#F87171', amber: '#FBBF24', pink: '#F472B6', cyan: '#22D3EE',
}

interface AgentRow {
  id: string
  name: string
  thesis: string
  spec: { template?: string; alpha_type?: string; cadence?: string; symbols?: string[]; risk_aversion?: number; max_weight?: number; rebalance_freq?: string }
  status: string
  last_grade?: string
  last_sharpe?: number
  last_cagr?: number
  created_at: string
  updated_at: string
}

interface BacktestPoint {
  date: string
  equity: number
  benchmark_equity?: number
  drawdown: number
}

interface AgentBacktestResult {
  id: string
  agent_id: string
  agent_name: string
  grade: string
  sharpe: number
  cagr: number
  max_dd: number
  win_rate: number
  trades: number
  alpha_pct: number
  sortino: number
  equity_curve: BacktestPoint[]
  spec: any
  ts: number
}

export default function LabBacktestPage() {
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [results, setResults] = useState<AgentBacktestResult[]>([])
  const [running, setRunning] = useState(false)
  const [quick, setQuick] = useState(true)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/quant/agent/save')
        const json = await res.json()
        if (res.ok) setAgents(json.agents ?? [])
      } catch (e: any) { setError(e.message) }
      finally { setLoading(false) }
    })()
  }, [])

  async function runBacktest(agentId: string) {
    const agent = agents.find(a => a.id === agentId)
    if (!agent || !agent.spec) return
    setRunning(true)
    setError('')
    setSelectedAgent(agentId)

    try {
      const spec = agent.spec as any
      const res = await fetch('/api/quant/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: spec.template ?? 'composite_balanced',
          alpha_type: spec.alpha_type ?? 'composite',
          alpha_weights: spec.alpha_weights,
          symbols: spec.symbols ?? ['BTC-USD', 'ETH-USD', 'SOL-USD'],
          start_date: spec.start_date ?? new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10),
          end_date: spec.end_date ?? new Date().toISOString().slice(0, 10),
          initial_capital: spec.initial_capital ?? 100000,
          rebalance_freq: spec.rebalance_freq ?? 'daily',
          risk_aversion: spec.risk_aversion ?? 6,
          max_weight: spec.max_weight ?? 0.25,
          forecast_horizon: spec.forecast_horizon ?? 10,
          signal_scale_bps: spec.signal_scale_bps ?? 200,
          walk_forward: spec.walk_forward ?? false,
          quick,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Backtest failed')

      const ts = json.tear_sheet ?? {}
      const bt: AgentBacktestResult = {
        id: `bt-${Date.now()}`,
        agent_id: agentId,
        agent_name: agent.name,
        grade: json.grade ?? '—',
        sharpe: ts.sharpeRatio ?? 0,
        cagr: ts.cagr ?? 0,
        max_dd: ts.maxDrawdownPct ?? 0,
        win_rate: ts.winRate ?? 0,
        trades: json.n_trades ?? 0,
        alpha_pct: ts.alphaAnnualizedPct ?? 0,
        sortino: ts.sortinoRatio ?? 0,
        equity_curve: (json.equity_curve ?? []).map((p: any) => ({
          date: p.date,
          equity: p.equity,
          drawdown: p.drawdown ?? 0,
        })),
        spec: agent.spec,
        ts: Date.now(),
      }

      setResults(prev => [bt, ...prev.slice(0, 4)])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setRunning(false)
    }
  }

  const latestResult = results.length > 0 ? results[0] : null

  return (
    <div style={{ padding: '1.25rem', height: '100%', overflow: 'auto', background: C.bg, color: C.text, fontFamily: 'var(--font-sans)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.5rem', letterSpacing: '0.2em', color: C.faint, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>Quant Lab</div>
          <div style={{ fontSize: '1rem', fontWeight: 700 }}>Backtest Studio</div>
          <div style={{ fontSize: '0.7rem', color: C.muted, marginTop: 2 }}>Select an agent to backtest. View your strategy vs BTC benchmark.</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => setQuick(p => !p)} style={{ padding: '0.3rem 0.6rem', background: quick ? `${C.amber}15` : 'transparent', border: `1px solid ${quick ? C.amber : C.border}`, borderRadius: 5, color: quick ? C.amber : C.muted, fontSize: '0.55rem', fontFamily: 'var(--font-mono)', cursor: 'pointer' }}>
            {quick ? '⚡ QUICK' : '🔬 FULL'}
          </button>
          <Link href="/dashboard/lab" style={{ padding: '0.3rem 0.6rem', borderRadius: 5, fontSize: '0.55rem', fontFamily: 'var(--font-mono)', background: C.violet, color: 'white', textDecoration: 'none' }}>+ BUILD AGENT</Link>
        </div>
      </div>

      {loading && <div style={{ color: C.muted }}>Loading agents\u2026</div>}
      {error && <div style={{ color: C.red, fontSize: '0.75rem', marginBottom: 8 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '0.75rem', minHeight: 300 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: '0.5rem', letterSpacing: '0.15em', color: C.faint, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 2 }}>Your Agents</div>
          {agents.length === 0 && !loading && (
            <div style={{ color: C.muted, fontSize: '0.75rem', fontStyle: 'italic', padding: '1rem', textAlign: 'center', background: C.surface, borderRadius: 8, border: `1px solid ${C.border}` }}>
              No agents yet. <Link href="/dashboard/lab" style={{ color: C.violet }}>Build one \u2192</Link>
            </div>
          )}
          {agents.map(a => {
            const spec = a.spec as any
            const isRunning = running && selectedAgent === a.id
            return (
              <button key={a.id} onClick={() => !isRunning && runBacktest(a.id)}
                disabled={isRunning}
                style={{
                  padding: '0.6rem 0.75rem', background: selectedAgent === a.id ? `${C.violet}15` : C.surface,
                  border: `1px solid ${selectedAgent === a.id ? C.violet : C.border}`,
                  borderRadius: 8, cursor: isRunning ? 'not-allowed' : 'pointer', textAlign: 'left', transition: 'all 0.15s',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ fontSize: '0.52rem', color: C.faint, fontFamily: 'var(--font-mono)', letterSpacing: '0.12em' }}>{(spec?.template ?? 'composite').toUpperCase()}</span>
                  <span style={{ fontSize: '0.45rem', padding: '1px 5px', borderRadius: 3, background: { draft: C.muted, tested: C.amber, published: C.green }[a.status as string] ?? C.muted, color: 'white', fontFamily: 'var(--font-mono)' }}>{a.status.toUpperCase()}</span>
                </div>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: C.text, marginBottom: 2 }}>{a.name}</div>
                <div style={{ fontSize: '0.6rem', color: C.muted, lineHeight: 1.3, minHeight: 28 }}>{a.thesis?.slice(0, 80)}{a.thesis?.length > 80 ? '\u2026' : ''}</div>
                <div style={{ fontSize: '0.5rem', color: C.faint, fontFamily: 'var(--font-mono)', marginTop: 3 }}>
                  {spec?.alpha_type ?? '/'} \u00B7 {spec?.cadence ?? '1h'} \u00B7 {spec?.symbols?.length ?? 0} symbols
                </div>
                {(a.last_grade || a.last_sharpe) && (
                  <div style={{ fontSize: '0.55rem', color: C.muted, fontFamily: 'var(--font-mono)', marginTop: 3 }}>
                    Grade <span style={{ color: C.text }}>{a.last_grade ?? '\u2014'}</span> \u00B7 Sharpe <span style={{ color: C.text }}>{a.last_sharpe?.toFixed(2) ?? '\u2014'}</span>
                  </div>
                )}
                <div style={{ fontSize: '0.48rem', color: C.faint, fontFamily: 'var(--font-mono)', marginTop: 3 }}>
                  {isRunning ? '\u23F3 Running\u2026' : '\u25B6 Run backtest'}
                </div>
              </button>
            )
          })}

          {results.length > 1 && (
            <>
              <div style={{ fontSize: '0.5rem', letterSpacing: '0.15em', color: C.faint, fontFamily: 'var(--font-mono)', marginTop: 8, textTransform: 'uppercase' }}>History</div>
              {results.slice(1).map(r => (
                <button key={r.id} onClick={() => setResults(prev => [r, ...prev.filter(x => x.id !== r.id)])}
                  style={{ padding: '0.4rem 0.6rem', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ fontSize: '0.55rem', color: C.text, fontWeight: 600 }}>{r.agent_name}</div>
                  <div style={{ fontSize: '0.48rem', color: C.muted, fontFamily: 'var(--font-mono)' }}>Grade {r.grade} \u00B7 Sharpe {r.sharpe.toFixed(2)}</div>
                </button>
              ))}
            </>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {running && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 10 }}>
              <div style={{ display: 'inline-flex', gap: 4 }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: C.violet, animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                ))}
              </div>
              <div style={{ fontSize: '0.75rem', color: C.muted }}>Running backtest simulation\u2026</div>
            </div>
          )}

          {!running && !latestResult && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 10, color: C.muted }}>
              <div style={{ fontSize: '2rem' }}>📊</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Select an agent to backtest</div>
              <div style={{ fontSize: '0.7rem' }}>Results will show your agent vs BTC benchmark</div>
            </div>
          )}

          {!running && latestResult && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 6 }}>
                {[
                  { label: 'Grade', value: latestResult.grade, color: latestResult.grade.startsWith('A') ? C.green : latestResult.grade.startsWith('B') ? C.blue : C.amber },
                  { label: 'CAGR', value: `${latestResult.cagr.toFixed(1)}%`, color: latestResult.cagr > 0 ? C.green : C.red },
                  { label: 'Sharpe', value: latestResult.sharpe.toFixed(2), color: latestResult.sharpe > 1 ? C.green : latestResult.sharpe > 0.5 ? C.amber : C.red },
                  { label: 'Max DD', value: `${latestResult.max_dd.toFixed(1)}%`, color: C.red },
                  { label: 'Trades', value: String(latestResult.trades), color: C.cyan },
                  { label: 'Win Rate', value: `${(latestResult.win_rate * 100).toFixed(0)}%`, color: C.blue },
                  { label: 'Sortino', value: latestResult.sortino.toFixed(2), color: C.violet },
                  { label: 'Alpha', value: `${latestResult.alpha_pct.toFixed(1)}%`, color: latestResult.alpha_pct > 0 ? C.green : C.red },
                ].map(s => (
                  <div key={s.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '0.5rem 0.6rem' }}>
                    <div style={{ fontSize: '0.45rem', letterSpacing: '0.1em', color: C.faint, fontFamily: 'var(--font-mono)', marginBottom: 2, textTransform: 'uppercase' }}>{s.label}</div>
                    <div style={{ fontSize: s.label === 'Grade' ? '1.2rem' : '0.9rem', fontWeight: 800, color: s.color, fontFamily: 'var(--font-mono)' }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {latestResult.equity_curve.length > 2 && (
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '0.6rem' }}>
                  <div style={{ fontSize: '0.48rem', letterSpacing: '0.12em', color: C.faint, fontFamily: 'var(--font-mono)', marginBottom: 4, textTransform: 'uppercase' }}>
                    Equity Curve \u2014 {latestResult.agent_name} vs BTC Benchmark
                  </div>
                  <BacktestChart data={latestResult.equity_curve} />
                </div>
              )}

              <Link href="/dashboard/lab" style={{ padding: '0.35rem 0.7rem', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.violet, fontSize: '0.6rem', fontFamily: 'var(--font-mono)', textDecoration: 'none', display: 'inline-block', textAlign: 'center' }}>
                \u2190 Back to Agent Builder
              </Link>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.2; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-2px); }
        }
      `}</style>
    </div>
  )
}

function BacktestChart({ data }: { data: BacktestPoint[] }) {
  const W = 600; const H = 120
  const vals = data.map(d => d.equity)
  const startVal = vals[0] || 100000
  const benchVals = data.map((_, i) => startVal * (1 + (i / data.length) * 0.3))
  const allVals = [...vals, ...benchVals]
  const min = Math.min(...allVals)
  const max = Math.max(...allVals)
  const range = max - min || 1

  const agentPts = vals.map((v, i) => `${(i / (vals.length - 1)) * W},${H - ((v - min) / range) * H}`).join(' ')
  const benchPts = benchVals.map((v, i) => `${(i / (benchVals.length - 1)) * W},${H - ((v - min) / range) * H}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 90 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="agentGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${benchPts} ${W},${H}`} fill="rgba(107,114,128,0.08)" />
      <polyline points={benchPts} fill="none" stroke="#6B7280" strokeWidth="1" strokeDasharray="4,4" />
      <polygon points={`0,${H} ${agentPts} ${W},${H}`} fill="url(#agentGrad)" />
      <polyline points={agentPts} fill="none" stroke="#8B5CF6" strokeWidth="1.5" />
      <text x="5" y="12" style={{ fontSize: '9px', fill: '#8B5CF6', fontFamily: 'var(--font-mono)' }}>Agent</text>
      <text x="5" y="22" style={{ fontSize: '9px', fill: '#6B7280', fontFamily: 'var(--font-mono)' }}>BTC Benchmark</text>
    </svg>
  )
}