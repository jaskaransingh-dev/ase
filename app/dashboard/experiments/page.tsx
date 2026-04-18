'use client'

import { useState, useEffect } from 'react'
import { Loader2, Plus, FlaskConical, Play, ChevronDown, ChevronUp, TrendingUp, X, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ScatterChart, Scatter, ZAxis } from 'recharts'

const C = {
  bg: '#06111F', bg2: '#0B1728', bg3: '#101A2D', bg4: '#162438',
  border: '#1E2A3D', border2: '#2A3A50',
  blue: '#4F8CFF', mint: '#16C784', red: '#FF5468', orange: '#F5B942',
  purple: '#8B5CF6',
  text: '#B7C4D5', muted: '#7F8CA3', faint: '#55657A', white: '#F7FAFF',
}

const BUILT_IN_STRATEGIES = [
  { id: 'momentum_crossover', label: 'Momentum Crossover', params: { fast_period: [5,10,20,30], slow_period: [50,100,200] } },
  { id: 'mean_reversion',     label: 'Mean Reversion',     params: { window: [10,20,30,50], z_threshold: [1,1.5,2,2.5] } },
  { id: 'rsi_trend_filter',   label: 'RSI Trend Filter',   params: { rsi_period: [7,14,21], trend_period: [50,100,200] } },
  { id: 'volatility_breakout',label: 'Volatility Breakout',params: { atr_period: [10,14,20], atr_mult: [1.5,2.0,2.5] } },
]

const PERIODS = ['90d','180d','1y','2y']
const INTERVALS = ['1h','4h','1d']
const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32', C.blue, C.muted]

interface Strategy { id: string; name: string; status: string }
interface Experiment {
  id: string; name: string; symbol: string; interval: string
  period: string; status: string; total_runs: number; completed_runs: number
  created_at: string; completed_at: string | null
}

interface RunResult {
  params: Record<string, number>
  sharpe: number; total_return: number; max_drawdown: number; win_rate: number; rank: number
  backtest_run?: { bars: Array<{ date: string; equity: number }> | null }
}

export default function ExperimentsPage() {
  const supabase = createClient()
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState('')
  const [selectedExp, setSelectedExp] = useState<string | null>(null)
  const [expRuns, setExpRuns] = useState<RunResult[]>([])
  const [loadingRuns, setLoadingRuns] = useState(false)
  const [compareIdxs, setCompareIdxs] = useState<number[]>([0, 1])

  // Form state
  const [fStrategyId, setFStrategyId] = useState('')
  const [fBuiltin, setFBuiltin] = useState('momentum_crossover')
  const [fName, setFName] = useState('')
  const [fSymbol, setFSymbol] = useState('BTC-USD')
  const [fPeriod, setFPeriod] = useState('1y')
  const [fInterval, setFInterval] = useState('1d')
  const [fGrid, setFGrid] = useState<Record<string, string>>({})  // param → comma-separated values

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const token = await getToken()
    const [sRes, eRes] = await Promise.all([
      fetch('/api/strategies', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/experiments', { headers: { Authorization: `Bearer ${token}` } }),
    ])
    if (sRes.ok) setStrategies((await sRes.json()).strategies ?? [])
    if (eRes.ok) setExperiments((await eRes.json()).experiments ?? [])
    setLoading(false)
  }

  // Init grid when builtin strategy changes
  useEffect(() => {
    const strat = BUILT_IN_STRATEGIES.find(s => s.id === fBuiltin)
    if (!strat) return
    const newGrid: Record<string, string> = {}
    for (const [k, vals] of Object.entries(strat.params)) {
      newGrid[k] = vals.slice(0, 3).join(', ')
    }
    setFGrid(newGrid)
  }, [fBuiltin])

  async function handleRun() {
    if (!fStrategyId || !fName.trim()) { setRunError('Strategy and name are required'); return }
    const paramGrid: Record<string, number[]> = {}
    for (const [k, v] of Object.entries(fGrid)) {
      const vals = v.split(',').map(x => parseFloat(x.trim())).filter(n => !isNaN(n))
      if (vals.length > 0) paramGrid[k] = vals
    }
    if (Object.keys(paramGrid).length === 0) { setRunError('Add at least one parameter sweep'); return }

    setRunning(true)
    setRunError('')
    const token = await getToken()
    const res = await fetch('/api/experiments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        strategy_id: fStrategyId,
        strategy_id_builtin: fBuiltin,
        name: fName,
        param_grid: paramGrid,
        symbol: fSymbol,
        interval: fInterval,
        period: fPeriod,
      }),
    })
    const json = await res.json()
    if (!res.ok) {
      setRunError(json.error ?? 'Experiment failed')
    } else {
      setShowForm(false)
      setFName('')
      await loadAll()
      // Auto-open results
      setSelectedExp(json.experiment_id)
      const ranked: RunResult[] = json.results
      setExpRuns(ranked)
      setCompareIdxs([0, 1])
    }
    setRunning(false)
  }

  async function loadExperiment(id: string) {
    if (selectedExp === id) { setSelectedExp(null); return }
    setSelectedExp(id)
    setLoadingRuns(true)
    const token = await getToken()
    const res = await fetch(`/api/experiments/${id}`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const json = await res.json()
      setExpRuns((json.runs ?? []).sort((a: RunResult, b: RunResult) => a.rank - b.rank))
      setCompareIdxs([0, 1])
    }
    setLoadingRuns(false)
  }

  const builtinMeta = BUILT_IN_STRATEGIES.find(s => s.id === fBuiltin)

  return (
    <div style={{ padding: '2rem', maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: C.blue, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '.3rem' }}>
            QUANT PLATFORM
          </div>
          <h1 style={{ fontSize: '1.7rem', fontWeight: 800, color: C.white, letterSpacing: '-.03em', margin: 0 }}>
            Experimentation Lab
          </h1>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: C.muted, marginTop: '0.3rem' }}>
            Parameter sweeps · Side-by-side comparison · Version tracking
          </div>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={btnPrimaryStyle}>
          <Plus size={14} /> New Experiment
        </button>
      </div>

      {/* New experiment form */}
      {showForm && (
        <div style={{ background: C.bg2, border: `1px solid ${C.border2}`, borderRadius: 12, padding: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ fontWeight: 700, color: C.white, marginBottom: '1rem' }}>Configure Experiment</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            <Field label="Strategy (yours)">
              <select value={fStrategyId} onChange={e => setFStrategyId(e.target.value)} style={selectStyle}>
                <option value="">Select strategy…</option>
                {strategies.filter(s => ['validated','listed'].includes(s.status)).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Built-in Engine">
              <select value={fBuiltin} onChange={e => setFBuiltin(e.target.value)} style={selectStyle}>
                {BUILT_IN_STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Experiment Name">
              <input value={fName} onChange={e => setFName(e.target.value)} placeholder="e.g. Fast MA sweep" style={inputStyle} />
            </Field>
            <Field label="Symbol">
              <input value={fSymbol} onChange={e => setFSymbol(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Period">
              <select value={fPeriod} onChange={e => setFPeriod(e.target.value)} style={selectStyle}>
                {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Interval">
              <select value={fInterval} onChange={e => setFInterval(e.target.value)} style={selectStyle}>
                {INTERVALS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </Field>
          </div>

          {/* Parameter grid editor */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: C.faint, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
              Parameter Grid — comma-separated values per parameter
            </div>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {Object.keys(fGrid).map(param => (
                <div key={param} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: C.blue, minWidth: 140 }}>{param}</div>
                  <input
                    value={fGrid[param]}
                    onChange={e => setFGrid(prev => ({ ...prev, [param]: e.target.value }))}
                    placeholder="e.g. 5, 10, 20"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: C.faint }}>
                    {fGrid[param].split(',').map(x => parseFloat(x.trim())).filter(n => !isNaN(n)).length} values
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: C.faint, marginTop: '0.5rem' }}>
              {(() => {
                const counts = Object.values(fGrid).map(v => v.split(',').map(x => parseFloat(x.trim())).filter(n => !isNaN(n)).length)
                const combos = counts.reduce((a, b) => a * b, 1)
                return `${combos} combination${combos !== 1 ? 's' : ''} (max 50)`
              })()}
            </div>
          </div>

          {runError && <div style={{ color: C.red, fontSize: '0.75rem', marginBottom: '0.75rem' }}>{runError}</div>}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleRun} disabled={running} style={btnPrimaryStyle}>
              {running ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={13} />}
              {running ? 'Running sweep…' : 'Run Experiment'}
            </button>
            <button onClick={() => setShowForm(false)} style={btnGhostStyle}>Cancel</button>
          </div>
        </div>
      )}

      {/* Experiment list */}
      {loading ? (
        <div style={{ textAlign: 'center', color: C.muted, padding: '3rem' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : experiments.length === 0 ? (
        <div style={{ background: C.bg2, border: `1px dashed ${C.border2}`, borderRadius: 12, padding: '3rem', textAlign: 'center' }}>
          <FlaskConical size={32} color={C.faint} style={{ marginBottom: '1rem' }} />
          <div style={{ fontWeight: 700, color: C.white, marginBottom: '0.5rem' }}>No experiments yet</div>
          <div style={{ color: C.muted, fontSize: '0.8rem' }}>Run a parameter sweep to find the optimal strategy configuration.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {experiments.map(exp => (
            <div key={exp.id}>
              <div
                onClick={() => loadExperiment(exp.id)}
                style={{
                  background: C.bg2, border: `1px solid ${selectedExp === exp.id ? C.blue : C.border}`,
                  borderRadius: 10, padding: '1rem 1.25rem', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '1rem',
                  transition: 'border-color 0.15s',
                }}
              >
                <FlaskConical size={16} color={exp.status === 'completed' ? C.mint : C.orange} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: C.white, fontSize: '0.9rem' }}>{exp.name}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: C.faint, marginTop: '0.2rem' }}>
                    {exp.symbol} · {exp.interval} · {exp.period} · {exp.total_runs} runs
                  </div>
                </div>
                <StatusBadge status={exp.status} />
                {selectedExp === exp.id ? <ChevronUp size={14} color={C.faint} /> : <ChevronDown size={14} color={C.faint} />}
              </div>

              {selectedExp === exp.id && (
                <div style={{ borderLeft: `2px solid ${C.blue}22`, marginLeft: '1.5rem', paddingLeft: '1rem', marginTop: '0.5rem' }}>
                  {loadingRuns ? (
                    <div style={{ color: C.muted, padding: '1rem' }}><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /></div>
                  ) : (
                    <ExperimentResults runs={expRuns} compareIdxs={compareIdxs} setCompareIdxs={setCompareIdxs} />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Experiment results panel ────────────────────────────────────────────────

function ExperimentResults({
  runs, compareIdxs, setCompareIdxs,
}: {
  runs: RunResult[]
  compareIdxs: number[]
  setCompareIdxs: (idxs: number[]) => void
}) {
  if (runs.length === 0) return <div style={{ color: C.muted, fontSize: '0.8rem', padding: '1rem' }}>No runs yet.</div>

  function toggleCompare(i: number) {
    if (compareIdxs.includes(i)) {
      setCompareIdxs(compareIdxs.filter(x => x !== i))
    } else if (compareIdxs.length < 4) {
      setCompareIdxs([...compareIdxs, i].sort((a, b) => a - b))
    }
  }

  // Build comparison chart data
  const compareRuns = compareIdxs.map(i => runs[i]).filter(Boolean)
  const maxBars = Math.max(...compareRuns.map(r => r.backtest_run?.bars?.length ?? 0))
  const chartData = Array.from({ length: maxBars }, (_, i) => {
    const point: Record<string, number | string> = { i }
    for (const run of compareRuns) {
      const bars = run.backtest_run?.bars ?? []
      const bar = bars[Math.floor(i * bars.length / maxBars)]
      point[`run_${runs.indexOf(run)}`] = bar?.equity ?? 0
      if (i === 0 && bars.length > 0) point.date = bars[0].date
    }
    return point
  })

  const colors = [C.mint, C.blue, C.orange, C.purple]

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {/* Comparison chart */}
      {compareRuns.length > 0 && chartData.some(d => compareRuns.some((_, ci) => (d[`run_${compareIdxs[ci]}`] as number) > 0)) && (
        <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '1.25rem' }}>
          <div style={{ fontWeight: 700, color: C.white, fontSize: '0.8rem', marginBottom: '0.5rem' }}>
            Equity Comparison
          </div>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            {compareRuns.map((run, ci) => (
              <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem' }}>
                <div style={{ width: 10, height: 2, background: colors[ci], borderRadius: 1 }} />
                <span style={{ color: C.muted }}>
                  {Object.entries(run.params).map(([k, v]) => `${k}=${v}`).join(', ')}
                </span>
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <XAxis dataKey="i" hide />
              <YAxis tick={{ fontSize: 9, fill: C.faint }} tickLine={false} axisLine={false} width={50} />
              <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 10 }} />
              {compareIdxs.map((runIdx, ci) => (
                <Area
                  key={runIdx}
                  dataKey={`run_${runIdx}`}
                  stroke={colors[ci]}
                  fill={colors[ci] + '18'}
                  strokeWidth={1.5}
                  dot={false}
                  name={`Run ${runIdx + 1}`}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Runs table */}
      <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '0.75rem 1.25rem', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, color: C.white, fontSize: '0.8rem' }}>{runs.length} Runs — Ranked by Sharpe</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: C.faint }}>click to toggle comparison (max 4)</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Rank', 'Parameters', 'Sharpe', 'Return', 'Max DD', 'Win Rate', 'Compare'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '0.5rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: C.faint, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((run, i) => {
                const isCompared = compareIdxs.includes(i)
                const rankColor = i < RANK_COLORS.length ? RANK_COLORS[i] : C.faint
                return (
                  <tr
                    key={i}
                    style={{ background: isCompared ? `${C.blue}0A` : 'transparent', transition: 'background 0.1s' }}
                  >
                    <td style={{ padding: '0.6rem 1rem', borderBottom: `1px solid ${C.border}22` }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: rankColor, fontSize: '0.85rem' }}>
                        #{run.rank}
                      </div>
                    </td>
                    <td style={{ padding: '0.6rem 1rem', borderBottom: `1px solid ${C.border}22` }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: C.text }}>
                        {Object.entries(run.params).map(([k, v]) => (
                          <span key={k} style={{ marginRight: '0.75rem' }}>
                            <span style={{ color: C.faint }}>{k}=</span>
                            <span style={{ color: C.blue }}>{v}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '0.6rem 1rem', borderBottom: `1px solid ${C.border}22` }}>
                      <span style={{ color: run.sharpe > 1 ? C.mint : run.sharpe > 0 ? C.orange : C.red, fontWeight: 700, fontSize: '0.85rem' }}>
                        {run.sharpe?.toFixed(2) ?? '—'}
                      </span>
                    </td>
                    <td style={{ padding: '0.6rem 1rem', borderBottom: `1px solid ${C.border}22` }}>
                      <span style={{ color: run.total_return > 0 ? C.mint : C.red, fontWeight: 600, fontSize: '0.8rem' }}>
                        {run.total_return?.toFixed(1)}%
                      </span>
                    </td>
                    <td style={{ padding: '0.6rem 1rem', borderBottom: `1px solid ${C.border}22` }}>
                      <span style={{ color: run.max_drawdown > 30 ? C.red : C.muted, fontSize: '0.8rem' }}>
                        {run.max_drawdown?.toFixed(1)}%
                      </span>
                    </td>
                    <td style={{ padding: '0.6rem 1rem', borderBottom: `1px solid ${C.border}22` }}>
                      <span style={{ color: run.win_rate > 0.5 ? C.mint : C.muted, fontSize: '0.8rem' }}>
                        {((run.win_rate ?? 0) * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td style={{ padding: '0.6rem 1rem', borderBottom: `1px solid ${C.border}22` }}>
                      <button
                        onClick={() => toggleCompare(i)}
                        style={{
                          background: isCompared ? C.blue : 'none',
                          border: `1px solid ${isCompared ? C.blue : C.border2}`,
                          borderRadius: 5, padding: '0.25rem 0.5rem',
                          color: isCompared ? '#fff' : C.faint,
                          cursor: 'pointer', fontSize: '0.7rem',
                          display: 'flex', alignItems: 'center', gap: '0.3rem',
                        }}
                      >
                        {isCompared ? <Check size={11} /> : <Plus size={11} />}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const meta: Record<string, { color: string; label: string }> = {
    pending:   { color: C.faint,   label: 'Pending' },
    running:   { color: C.orange,  label: 'Running' },
    completed: { color: C.mint,    label: 'Completed' },
    failed:    { color: C.red,     label: 'Failed' },
  }
  const m = meta[status] ?? meta.pending
  return (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: m.color, fontWeight: 700, textTransform: 'uppercase' }}>
      {m.label}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: C.faint, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.35rem' }}>{label}</div>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: '#06111F', border: '1px solid #1E2A3D', borderRadius: 7,
  padding: '0.45rem 0.7rem', color: '#B7C4D5', fontSize: '0.8rem',
  outline: 'none', width: '100%', boxSizing: 'border-box',
}

const selectStyle: React.CSSProperties = {
  background: '#06111F', border: '1px solid #1E2A3D', borderRadius: 7,
  padding: '0.45rem 0.7rem', color: '#B7C4D5', fontSize: '0.8rem',
  outline: 'none', width: '100%', cursor: 'pointer',
}

const btnPrimaryStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
  background: '#4F8CFF', border: 'none', borderRadius: 7,
  padding: '0.55rem 1rem', color: '#fff', fontWeight: 700,
  fontSize: '0.8rem', cursor: 'pointer',
}

const btnGhostStyle: React.CSSProperties = {
  background: 'none', border: '1px solid #2A3A50', borderRadius: 7,
  padding: '0.55rem 1rem', color: '#7F8CA3', fontWeight: 600,
  fontSize: '0.8rem', cursor: 'pointer',
}
