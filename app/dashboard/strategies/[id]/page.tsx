'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Play, Loader2, CheckCircle, AlertCircle, Save, Shield, GitBranch,
  FlaskConical, ChevronLeft, Info, TrendingUp, TrendingDown, Activity,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'

const C = {
  bg: '#06111F', bg2: '#0B1728', bg3: '#101A2D', bg4: '#162438',
  border: '#1E2A3D', border2: '#2A3A50',
  blue: '#4F8CFF', mint: '#16C784', red: '#FF5468', orange: '#F5B942',
  text: '#B7C4D5', muted: '#7F8CA3', faint: '#55657A', white: '#F7FAFF',
}

const BUILT_IN_STRATEGIES = [
  { id: 'momentum_crossover', label: 'Momentum Crossover' },
  { id: 'mean_reversion',     label: 'Mean Reversion' },
  { id: 'rsi_trend_filter',   label: 'RSI Trend Filter' },
  { id: 'volatility_breakout',label: 'Volatility Breakout' },
  { id: 'dual_momentum',      label: 'Dual Momentum' },
  { id: 'macd_trend',         label: 'MACD Trend' },
]

const PERIODS = ['90d','180d','1y','2y','5y']
const INTERVALS = ['1h','4h','1d']

interface Strategy {
  id: string; name: string; description: string | null
  code: string; status: string; symbol: string; interval: string
  params: Record<string, number>; validation_error: string | null
}

export default function StrategyEditorPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [strategy, setStrategy] = useState<Strategy | null>(null)
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [validating, setValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<{ valid: boolean; errors: string[]; warnings: string[] } | null>(null)

  // Backtest config
  const [builtinStrategy, setBuiltinStrategy] = useState('momentum_crossover')
  const [period, setPeriod] = useState('1y')
  const [interval, setInterval] = useState('1d')
  const [runType, setRunType] = useState<'standard' | 'walk_forward' | 'monte_carlo'>('standard')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [btError, setBtError] = useState('')

  // Active tab
  const [tab, setTab] = useState<'code' | 'backtest' | 'versions'>('code')

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  const load = useCallback(async () => {
    const token = await getToken()
    const res = await fetch(`/api/strategies/${id}`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const json = await res.json()
      setStrategy(json.strategy)
      setCode(json.strategy.code)
    }
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  async function handleSave() {
    setSaving(true)
    const token = await getToken()
    const res = await fetch(`/api/strategies/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code }),
    })
    if (res.ok) {
      const json = await res.json()
      setStrategy(json.strategy)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      setValidationResult(null)
    }
    setSaving(false)
  }

  async function handleValidate() {
    if (code !== strategy?.code) await handleSave()
    setValidating(true)
    setValidationResult(null)
    const token = await getToken()
    const res = await fetch(`/api/strategies/${id}/validate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = await res.json()
    setValidationResult(json)
    await load()
    setValidating(false)
  }

  async function handleBacktest() {
    if (!strategy) return
    if (strategy.status === 'draft') {
      setBtError('Validate your strategy first')
      return
    }
    setRunning(true)
    setBtError('')
    setResult(null)
    const token = await getToken()
    const res = await fetch(`/api/strategies/${id}/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ period, interval, run_type: runType, strategy_id: builtinStrategy }),
    })
    const json = await res.json()
    if (!res.ok) {
      setBtError(json.error ?? 'Backtest failed')
    } else {
      setResult(json)
    }
    setRunning(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
      <Loader2 size={24} color={C.blue} style={{ animation: 'spin 1s linear infinite' }} />
    </div>
  )

  if (!strategy) return <div style={{ color: C.red, padding: '2rem' }}>Strategy not found.</div>

  const statusColor = { draft: C.muted, validated: C.mint, rejected: C.red, listed: C.blue }[strategy.status] ?? C.muted

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button onClick={() => router.push('/dashboard/strategies')} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', display: 'flex' }}>
          <ChevronLeft size={18} />
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: C.white, margin: 0 }}>{strategy.name}</h1>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: statusColor, marginTop: '0.2rem', textTransform: 'uppercase' }}>
            {strategy.status}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={handleSave} disabled={saving} style={btnGhostStyle}>
            {saving ? <Loader2 size={13} /> : saved ? <CheckCircle size={13} color={C.mint} /> : <Save size={13} />}
            {saved ? 'Saved' : 'Save'}
          </button>
          <button onClick={handleValidate} disabled={validating} style={btnPrimaryStyle}>
            {validating ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Shield size={13} />}
            Validate
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', borderBottom: `1px solid ${C.border}`, paddingBottom: '0' }}>
        {(['code', 'backtest', 'versions'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: 'none', border: 'none', borderBottom: tab === t ? `2px solid ${C.blue}` : '2px solid transparent',
              color: tab === t ? C.white : C.muted, fontWeight: tab === t ? 700 : 500,
              padding: '0.6rem 1rem', cursor: 'pointer', fontSize: '0.8rem',
              textTransform: 'capitalize', transition: 'color 0.15s',
            }}
          >
            {t === 'code' ? 'Editor' : t === 'backtest' ? 'Backtest' : 'Versions'}
          </button>
        ))}
      </div>

      {/* Code tab */}
      {tab === 'code' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {validationResult && (
            <div style={{
              background: validationResult.valid ? 'rgba(22,199,132,0.08)' : 'rgba(255,84,104,0.08)',
              border: `1px solid ${validationResult.valid ? C.mint : C.red}`,
              borderRadius: 8, padding: '0.75rem 1rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: validationResult.valid ? C.mint : C.red, marginBottom: '0.4rem' }}>
                {validationResult.valid ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                {validationResult.valid ? 'Validation passed' : 'Validation failed'}
              </div>
              {validationResult.errors.map((e, i) => (
                <div key={i} style={{ color: C.red, fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>✗ {e}</div>
              ))}
              {validationResult.warnings.map((w, i) => (
                <div key={i} style={{ color: C.orange, fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>⚠ {w}</div>
              ))}
            </div>
          )}

          <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10 }}>
            <div style={{
              padding: '0.6rem 1rem', borderBottom: `1px solid ${C.border}`,
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: C.muted,
            }}>
              <span style={{ color: C.mint }}>●</span> strategy.py
              <span style={{ marginLeft: 'auto', color: C.faint }}>
                Allowed: numpy, pandas, math · No networking, no file I/O
              </span>
            </div>
            <textarea
              value={code}
              onChange={e => setCode(e.target.value)}
              spellCheck={false}
              style={{
                width: '100%', minHeight: 480, background: 'transparent',
                border: 'none', outline: 'none', resize: 'vertical',
                fontFamily: 'var(--font-mono)', fontSize: '0.8rem', lineHeight: 1.6,
                color: C.text, padding: '1rem', boxSizing: 'border-box',
                tabSize: 4,
              }}
            />
          </div>

          {strategy.validation_error && (
            <div style={{ background: 'rgba(255,84,104,0.06)', border: `1px solid ${C.red}22`, borderRadius: 8, padding: '0.75rem 1rem' }}>
              <div style={{ display: 'flex', gap: '0.4rem', color: C.red, fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 2 }} />
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{strategy.validation_error}</pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Backtest tab */}
      {tab === 'backtest' && (
        <div style={{ display: 'grid', gap: '1.25rem' }}>
          {/* Config */}
          <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '1.25rem' }}>
            <div style={{ fontWeight: 700, color: C.white, marginBottom: '1rem', fontSize: '0.85rem' }}>Configuration</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
              <Field label="Built-in Engine">
                <select value={builtinStrategy} onChange={e => setBuiltinStrategy(e.target.value)} style={selectStyle}>
                  {BUILT_IN_STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </Field>
              <Field label="Period">
                <select value={period} onChange={e => setPeriod(e.target.value)} style={selectStyle}>
                  {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Interval">
                <select value={interval} onChange={e => setInterval(e.target.value)} style={selectStyle}>
                  {INTERVALS.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </Field>
              <Field label="Run Type">
                <select value={runType} onChange={e => setRunType(e.target.value as typeof runType)} style={selectStyle}>
                  <option value="standard">Standard (60/20/20 split)</option>
                  <option value="walk_forward">Walk-Forward</option>
                  <option value="monte_carlo">Monte Carlo</option>
                </select>
              </Field>
            </div>
            {strategy.status === 'draft' && (
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', color: C.orange, fontSize: '0.75rem', marginBottom: '0.75rem' }}>
                <Info size={13} /> Validate your strategy first to enable backtesting
              </div>
            )}
            <button onClick={handleBacktest} disabled={running || strategy.status === 'draft'} style={btnPrimaryStyle}>
              {running ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={13} />}
              {running ? 'Running…' : 'Run Backtest'}
            </button>
            {btError && <div style={{ color: C.red, fontSize: '0.75rem', marginTop: '0.75rem' }}>{btError}</div>}
          </div>

          {result && <BacktestResults result={result} />}
        </div>
      )}

      {/* Versions tab */}
      {tab === 'versions' && (
        <VersionsPanel strategyId={id} token={''} getToken={getToken} />
      )}
    </div>
  )
}

// ─── Backtest results ────────────────────────────────────────────────────────

interface BacktestResult {
  run_id: string
  symbol: string
  period: string
  run_type: string
  splits: { train_bars: number; val_bars: number; test_bars: number }
  train_stats: Record<string, number> | null
  val_stats: Record<string, number> | null
  bars: Array<{ date: string; equity: number; close: number; position: number }>
  buy_hold: Array<{ date: string; equity: number }>
  composite_score: number
  sharpe: number
  max_drawdown: number
  walk_forward_result?: unknown
  monte_carlo_result?: Record<string, unknown>
}

function BacktestResults({ result }: { result: BacktestResult }) {
  const s = result.train_stats
  const vs = result.val_stats

  const equityData = result.bars.map((b, i) => ({
    date: b.date,
    strategy: b.equity,
    buyHold: result.buy_hold[Math.min(i, result.buy_hold.length - 1)]?.equity ?? 0,
  }))

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {/* Split indicator */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {[
          { label: 'Train', bars: result.splits.train_bars, color: C.blue },
          { label: 'Validation', bars: result.splits.val_bars, color: C.mint },
          { label: 'Test (hidden)', bars: result.splits.test_bars, color: C.faint },
        ].map(sp => (
          <div key={sp.label} style={{
            background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 6,
            padding: '0.35rem 0.75rem', fontSize: '0.7rem', color: sp.color, fontWeight: 600,
          }}>
            {sp.label}: {sp.bars} bars
          </div>
        ))}
      </div>

      {/* Equity curve */}
      <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '1.25rem' }}>
        <div style={{ fontWeight: 700, color: C.white, fontSize: '0.8rem', marginBottom: '1rem' }}>Equity Curve</div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={equityData}>
            <defs>
              <linearGradient id="gradStrat" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={C.mint} stopOpacity={0.25} />
                <stop offset="95%" stopColor={C.mint} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: C.faint }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 9, fill: C.faint }} tickLine={false} axisLine={false} width={50} />
            <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11 }} />
            <Area dataKey="strategy" stroke={C.mint} fill="url(#gradStrat)" strokeWidth={1.5} dot={false} name="Strategy" />
            <Line dataKey="buyHold" stroke={C.blue} strokeWidth={1} dot={false} name="Buy & Hold" strokeDasharray="4 3" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Metrics: train vs val */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <MetricsPanel label="Train Set" stats={s} color={C.blue} />
        <MetricsPanel label="Validation Set" stats={vs} color={C.mint} />
      </div>

      {/* Monte Carlo summary */}
      {result.monte_carlo_result && (
        <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '1.25rem' }}>
          <div style={{ fontWeight: 700, color: C.white, fontSize: '0.8rem', marginBottom: '0.75rem' }}>Monte Carlo Summary</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem' }}>
            {[
              { label: 'Trials', value: String(result.monte_carlo_result.nTrials) },
              { label: 'Median Return', value: `${(result.monte_carlo_result.medianReturn as number)?.toFixed(1)}%` },
              { label: 'Beat Rate', value: `${((result.monte_carlo_result.beatRate as number) * 100)?.toFixed(0)}%` },
              { label: 'Median Sharpe', value: (result.monte_carlo_result.medianSharpe as number)?.toFixed(2) },
              { label: 'P10 Return', value: `${(result.monte_carlo_result.p10Return as number)?.toFixed(1)}%` },
              { label: 'P90 Return', value: `${(result.monte_carlo_result.p90Return as number)?.toFixed(1)}%` },
            ].map(m => <MiniStat key={m.label} label={m.label} value={m.value} />)}
          </div>
        </div>
      )}
    </div>
  )
}

function MetricsPanel({ label, stats, color }: { label: string; stats: Record<string, number> | null; color: string }) {
  if (!stats) return (
    <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '1.25rem' }}>
      <div style={{ fontWeight: 700, fontSize: '0.8rem', color, marginBottom: '0.75rem' }}>{label}</div>
      <div style={{ color: C.faint, fontSize: '0.75rem' }}>No data</div>
    </div>
  )
  const metrics = [
    { label: 'Total Return', value: `${stats.totalReturnPct?.toFixed(1)}%`, pos: stats.totalReturnPct > 0 },
    { label: 'CAGR', value: `${stats.cagr?.toFixed(1)}%`, pos: stats.cagr > 0 },
    { label: 'Sharpe', value: stats.sharpeRatio?.toFixed(2), pos: stats.sharpeRatio > 0 },
    { label: 'Sortino', value: stats.sortinoRatio?.toFixed(2), pos: stats.sortinoRatio > 0 },
    { label: 'Max Drawdown', value: `${stats.maxDrawdownPct?.toFixed(1)}%`, pos: false },
    { label: 'Win Rate', value: `${(stats.winRate * 100)?.toFixed(0)}%`, pos: stats.winRate > 0.5 },
    { label: 'Trades', value: String(stats.totalTrades), pos: true },
    { label: 'Profit Factor', value: stats.profitFactor?.toFixed(2), pos: stats.profitFactor > 1 },
  ]
  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '1.25rem' }}>
      <div style={{ fontWeight: 700, fontSize: '0.8rem', color, marginBottom: '0.75rem' }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        {metrics.map(m => (
          <div key={m.label}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: C.faint, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{m.label}</div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: m.pos ? C.mint : C.red }}>{m.value ?? '—'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: C.faint, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontWeight: 700, color: C.white, fontSize: '0.9rem', marginTop: '0.2rem' }}>{value}</div>
    </div>
  )
}

function VersionsPanel({ strategyId, getToken }: { strategyId: string; token: string; getToken: () => Promise<string> }) {
  const [versions, setVersions] = useState<Array<{ id: string; version: number; code_hash: string; created_at: string; change_note: string | null }>>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const token = await getToken()
      const res = await fetch(`/api/strategies/${strategyId}`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const json = await res.json()
        setVersions((json.strategy.strategy_versions ?? []).sort((a: { version: number }, b: { version: number }) => b.version - a.version))
      }
      setLoading(false)
    }
    load()
  }, [strategyId])

  if (loading) return <div style={{ color: C.muted, padding: '1rem' }}><Loader2 size={16} /></div>
  if (versions.length === 0) return <div style={{ color: C.muted, padding: '1rem', fontSize: '0.8rem' }}>No versions yet — save your code to create version history.</div>

  return (
    <div style={{ display: 'grid', gap: '0.5rem' }}>
      {versions.map(v => (
        <div key={v.id} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '0.85rem 1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: C.blue, fontWeight: 700 }}>v{v.version}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: C.faint }}>{v.code_hash.slice(0, 12)}…</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: C.faint, marginLeft: 'auto' }}>
              {new Date(v.created_at).toLocaleDateString()}
            </div>
          </div>
          {v.change_note && <div style={{ color: C.muted, fontSize: '0.75rem', marginTop: '0.3rem' }}>{v.change_note}</div>}
        </div>
      ))}
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

const selectStyle: React.CSSProperties = {
  background: '#06111F', border: `1px solid #1E2A3D`, borderRadius: 7,
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
  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
  background: 'none', border: '1px solid #2A3A50', borderRadius: 7,
  padding: '0.55rem 1rem', color: '#7F8CA3', fontWeight: 600,
  fontSize: '0.8rem', cursor: 'pointer',
}
