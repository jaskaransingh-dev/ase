'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Area, AreaChart, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell } from 'recharts'
import { STRATEGIES, type BacktestStats, type MonteCarloResult, type WalkForwardResult } from '@/lib/backtest'
import { createClient } from '@/lib/supabase/client'

interface FullBacktestResult {
  stats: BacktestStats
  bars: Array<{ date: string; close: number; equity: number; position: number }>
  buyHold: Array<{ date: string; equity: number }>
  symbol: string
  period: string
}

const POPULAR_ASSETS = [
  { group: 'Crypto', symbols: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'AVAX-USD', 'LINK-USD'] },
  { group: 'Tech Stocks', symbols: ['NVDA', 'AAPL', 'MSFT', 'META', 'GOOGL', 'AMZN', 'TSLA'] },
  { group: 'ETFs', symbols: ['SPY', 'QQQ', 'VOO', 'IWM', 'TLT', 'GLD', 'ARKK'] },
  { group: 'Crypto ETFs', symbols: ['IBIT', 'FBTC', 'ARKB'] },
  { group: 'Finance', symbols: ['JPM', 'BAC', 'GS', 'MS'] },
]
const ALL_ASSETS = [...new Set(POPULAR_ASSETS.flatMap(g => g.symbols))].sort()
const PERIODS = [
  { value: '3mo', label: '3 months' },
  { value: '6mo', label: '6 months' },
  { value: '1y', label: '1 year' },
  { value: '2y', label: '2 years' },
  { value: '5y', label: '5 years' },
]

function fmtPct(v: number | undefined | null) {
  if (v == null || isNaN(v)) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}
function colorOf(v: number | undefined | null) {
  if (v == null || isNaN(v)) return 'var(--faint)'
  return v >= 0 ? '#00E599' : '#FF5A5F'
}
function fmt2(v: number | undefined | null) {
  if (v == null || isNaN(v)) return '—'
  return v.toFixed(2)
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
      <div style={{ color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color, fontWeight: 600 }}>
          {p.dataKey === 'strategy' ? 'Strategy' : 'Buy & Hold'}: ${p.value.toFixed(0)}
        </div>
      ))}
    </div>
  )
}

function StatCard({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.85rem 1rem' }}>
      <div style={{ fontSize: '0.58rem', color: 'var(--faint)', marginBottom: '0.3rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: color ?? 'var(--white)', fontFamily: 'var(--font-mono)' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '0.58rem', color: 'var(--faint)', marginTop: '0.2rem' }}>{sub}</div>}
    </div>
  )
}

export default function BacktestPage() {
  const searchParams = useSearchParams()
  const [mode, setMode] = useState<'simple' | 'advanced' | 'csv'>('simple')

  // Simple mode
  const [symbol, setSymbol] = useState('BTC-USD')
  const [strategy, setStrategy] = useState(() => {
    const strat = searchParams.get('strategy')
    return strat || 'momentum_crossover'
  })
  const [customCode, setCustomCode] = useState(() => {
    const code = searchParams.get('code')
    return code ? decodeURIComponent(code) : ''
  })
  const [period, setPeriod] = useState('1y')
  const [fee, setFee] = useState(0.001)
  const [slippageBps, setSlippageBps] = useState(5)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<FullBacktestResult | null>(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [showAdvParams, setShowAdvParams] = useState(false)
  const [customParams, setCustomParams] = useState<Record<string, number>>({})

  // Advanced compare mode
  const [advSymbols, setAdvSymbols] = useState<string[]>(['SPY', 'QQQ'])
  const [advStrategies, setAdvStrategies] = useState<string[]>(['momentum_crossover'])
  const [advPeriod, setAdvPeriod] = useState('1y')
  const [advLoading, setAdvLoading] = useState(false)
  const [advResults, setAdvResults] = useState<Record<string, FullBacktestResult>>({})
  const [advError, setAdvError] = useState('')
  const [advInput, setAdvInput] = useState('SPY, QQQ')

  // CSV upload mode
  const [csvData, setCsvData] = useState<Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }> | null>(null)
  const [csvSymbolName, setCsvSymbolName] = useState('CUSTOM')
  const [csvStrategy, setCsvStrategy] = useState('momentum_crossover')
  const [csvFee, setCsvFee] = useState(0.001)
  const [csvLoading, setCsvLoading] = useState(false)
  const [csvResult, setCsvResult] = useState<FullBacktestResult | null>(null)
  const [csvError, setCsvError] = useState('')
  const [csvFileName, setCsvFileName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Multi-view chart
  const [chartView, setChartView] = useState<'equity' | 'drawdown' | 'monthly'>('equity')

  // Monte Carlo
  const [mcLoading, setMcLoading] = useState(false)
  const [mcResult, setMcResult] = useState<MonteCarloResult | null>(null)

  // Walk-Forward
  const [wfLoading, setWfLoading] = useState(false)
  const [wfResult, setWfResult] = useState<WalkForwardResult | null>(null)

  // Saved backtests
  const [savedBacktests, setSavedBacktests] = useState<Array<{
    id: string; name: string; symbol: string; strategy: string; period: string;
    totalReturn: number; sharpe: number; createdAt: string; shareToken?: string
  }>>([])
  const [savedLoading, setSavedLoading] = useState(false)
  const [showSaved, setShowSaved] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveSaving, setSaveSaving] = useState(false)

  const filteredAssets = ALL_ASSETS.filter(a => a.toLowerCase().includes(search.toLowerCase())).slice(0, 24)
  const stratMeta = STRATEGIES[strategy as keyof typeof STRATEGIES]

  const runBacktest = useCallback(async () => {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const slippageFraction = slippageBps / 10000
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, strategy, period, fee: fee + slippageFraction, params: customParams }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Backtest failed')
      setResult({ stats: data.stats, bars: data.bars, buyHold: data.buyHold, symbol: data.symbol, period: data.period })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error running backtest')
    } finally {
      setLoading(false)
    }
  }, [symbol, strategy, period, fee, slippageBps, customParams])

  const runAdvanced = useCallback(async () => {
    setAdvLoading(true)
    setAdvError('')
    const results: Record<string, FullBacktestResult> = {}
    for (const sym of advSymbols) {
      for (const strat of advStrategies) {
        try {
          const res = await fetch('/api/backtest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol: sym, strategy: strat, period: advPeriod }),
          })
          const data = await res.json()
          if (res.ok && !data.error) {
            results[`${sym} · ${strat.replace(/_/g, ' ')}`] = { stats: data.stats, bars: data.bars, buyHold: data.buyHold, symbol: sym, period: data.period }
          }
        } catch { /* skip */ }
      }
    }
    setAdvResults(results)
    setAdvLoading(false)
  }, [advSymbols, advStrategies, advPeriod])

  const parseCSV = (text: string) => {
    const lines = text.trim().split('\n')
    const header = lines[0].toLowerCase().split(',').map(h => h.trim())
    const dateIdx = header.findIndex(h => h.includes('date') || h.includes('time'))
    const openIdx = header.findIndex(h => h.includes('open'))
    const highIdx = header.findIndex(h => h.includes('high'))
    const lowIdx = header.findIndex(h => h.includes('low'))
    const closeIdx = header.findIndex(h => h.includes('close') || h.includes('adj'))
    const volIdx = header.findIndex(h => h.includes('vol'))

    if (closeIdx === -1 || dateIdx === -1) throw new Error('CSV must have Date and Close columns')

    return lines.slice(1).map(line => {
      const cols = line.split(',').map(c => c.trim().replace(/"/g, ''))
      const close = parseFloat(cols[closeIdx])
      return {
        date: cols[dateIdx].slice(0, 10),
        open: openIdx >= 0 ? parseFloat(cols[openIdx]) || close : close,
        high: highIdx >= 0 ? parseFloat(cols[highIdx]) || close : close,
        low: lowIdx >= 0 ? parseFloat(cols[lowIdx]) || close : close,
        close,
        volume: volIdx >= 0 ? parseFloat(cols[volIdx]) || 0 : 0,
      }
    }).filter(b => b.close > 0 && !isNaN(b.close) && b.date.length >= 10)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string
        const parsed = parseCSV(text)
        if (parsed.length < 60) throw new Error(`Need at least 60 bars, got ${parsed.length}`)
        setCsvData(parsed)
        setCsvError('')
      } catch (err) {
        setCsvError(err instanceof Error ? err.message : 'Failed to parse CSV')
        setCsvData(null)
      }
    }
    reader.readAsText(file)
  }

  const runCsvBacktest = async () => {
    if (!csvData) return
    setCsvLoading(true)
    setCsvError('')
    setCsvResult(null)
    try {
      const res = await fetch('/api/backtest/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bars: csvData, strategy: csvStrategy, fee: csvFee }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Backtest failed')
      setCsvResult({ stats: data.stats, bars: data.bars, buyHold: data.buyHold, symbol: csvSymbolName, period: `${csvData.length} bars` })
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : 'Error running backtest')
    } finally {
      setCsvLoading(false)
    }
  }

  // Auto-reset custom params when strategy changes
  useEffect(() => { setCustomParams({}) }, [strategy])

  const activeResult = mode === 'csv' ? csvResult : result

  // ── Monte Carlo ───────────────────────────────────────────────
  const runMonteCarlo = useCallback(async () => {
    if (!activeResult) return
    setMcLoading(true)
    setMcResult(null)
    try {
      const slippageFraction = slippageBps / 10000
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, strategy, period, fee: fee + slippageFraction, params: customParams, monteCarlo: true, nTrials: 80, windowDays: 180, seed: 42 }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Monte Carlo failed')
      setMcResult(data.monteCarlo)
    } catch (e) {
      setMcResult(null)
    } finally {
      setMcLoading(false)
    }
  }, [activeResult, symbol, strategy, period, fee, slippageBps, customParams])

  // ── Walk-Forward ──────────────────────────────────────────────
  const runWalkForward = useCallback(async () => {
    if (!activeResult) return
    setWfLoading(true)
    setWfResult(null)
    try {
      const slippageFraction = slippageBps / 10000
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, strategy, period, fee: fee + slippageFraction, params: customParams, walkForward: true, trainDays: 252, testDays: 63 }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Walk-Forward failed')
      setWfResult(data.walkForward)
    } catch (e) {
      setWfResult(null)
    } finally {
      setWfLoading(false)
    }
  }, [activeResult, symbol, strategy, period, fee, slippageBps, customParams])

  // ── Saved Backtests ───────────────────────────────────────────
  const loadSaved = useCallback(async () => {
    setSavedLoading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const res = await fetch('/api/backtest/save?user_id=' + user.id)
      const data = await res.json()
      if (data.backtests) setSavedBacktests(data.backtests)
    } catch { /* ignore */ }
    finally { setSavedLoading(false) }
  }, [])

  const saveBacktest = useCallback(async () => {
    if (!activeResult || !saveName.trim()) return
    setSaveSaving(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const res = await fetch('/api/backtest/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: saveName.trim(),
          symbol: activeResult.symbol,
          strategy,
          period: activeResult.period,
          stats: activeResult.stats,
          bars: activeResult.bars,
          buyHold: activeResult.buyHold,
          user_id: user.id,
        }),
      })
      const data = await res.json()
      if (data.id) {
        setSaveName('')
        loadSaved()
      }
    } catch { /* ignore */ }
    finally { setSaveSaving(false) }
  }, [activeResult, saveName, strategy, loadSaved])

  const deleteSaved = useCallback(async (id: string) => {
    try {
      const res = await fetch('/api/backtest/save?id=' + id, { method: 'DELETE' })
      if (res.ok) setSavedBacktests(prev => prev.filter(b => b.id !== id))
    } catch { /* ignore */ }
  }, [])

  const loadSavedBacktest = useCallback(async (id: string) => {
    try {
      const res = await fetch('/api/backtest/save?id=' + id)
      const data = await res.json()
      if (data.backtest) {
        setResult({ stats: data.backtest.results.stats, bars: data.backtest.results.bars, buyHold: data.backtest.results.buyHold, symbol: data.backtest.symbol, period: data.backtest.period })
        setSymbol(data.backtest.symbol)
        setStrategy(data.backtest.strategy)
        setChartView('equity')
        setMcResult(null)
        setWfResult(null)
        setShowSaved(false)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (showSaved) loadSaved()
  }, [showSaved, loadSaved])

  // Build chart data with drawdown
  const chartData = activeResult?.bars.map(b => ({
    date: b.date,
    strategy: Math.round(b.equity),
    buyHold: undefined as number | undefined,
    drawdown: 0,
  })) ?? []

  if (activeResult?.buyHold) {
    activeResult.buyHold.forEach((b, i) => {
      if (chartData[i]) chartData[i].buyHold = Math.round(b.equity)
    })
  }

  // Compute drawdown series
  let peak = 0
  chartData.forEach((d, i) => {
    const equity = activeResult?.bars[i]?.equity ?? 0
    if (equity > peak) peak = equity
    d.drawdown = peak > 0 ? ((equity - peak) / peak) * 100 : 0
  })

  // Compute monthly returns
  const monthlyReturns: Array<{ month: string; year: number; returnPct: number; isPositive: boolean }> = []
  if (activeResult?.bars) {
    const byYearMonth = new Map<string, { start: number; end: number }>()
    activeResult.bars.forEach(b => {
      const ym = b.date.slice(0, 7) // "2024-01"
      const existing = byYearMonth.get(ym)
      if (!existing) byYearMonth.set(ym, { start: b.equity, end: b.equity })
      else existing.end = b.equity
    })
    byYearMonth.forEach((v, ym) => {
      monthlyReturns.push({
        month: ym,
        year: parseInt(ym.slice(0, 4)),
        returnPct: v.start > 0 ? ((v.end - v.start) / v.start) * 100 : 0,
        isPositive: v.end >= v.start,
      })
    })
    monthlyReturns.sort((a, b) => a.month.localeCompare(b.month))
  }

  const isPositive = (activeResult?.stats.totalReturnPct ?? 0) >= 0

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: '.3rem' }}>RESEARCH LAB</div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.85rem', fontWeight: 700, letterSpacing: '-0.02em' }}>Strategy Backtest</h1>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--faint)', maxWidth: 320, textAlign: 'right' }}>
          Historical simulation with fees + slippage. Past performance does not guarantee future results.
        </div>
      </div>

      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.75rem', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.3rem', width: 'fit-content' }}>
        {(['simple', 'advanced', 'csv'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)} style={{
            padding: '0.45rem 1.1rem', borderRadius: 8, border: 'none',
            background: mode === m ? 'var(--blue)' : 'transparent',
            color: mode === m ? '#fff' : 'var(--muted)',
            fontSize: '0.78rem', fontWeight: mode === m ? 700 : 500, cursor: 'pointer',
            textTransform: 'capitalize', transition: 'all 0.15s',
          }}>
            {m === 'csv' ? 'CSV Upload' : m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {/* ── SIMPLE MODE ─────────────────────────────────────────── */}
      {mode === 'simple' && (
        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '1.5rem', alignItems: 'start' }} className="backtest-grid">
          {/* Controls */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* Asset */}
            <div>
              <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--faint)', marginBottom: '0.4rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>ASSET</label>
              <input
                type="text"
                value={search || symbol}
                onChange={e => { setSearch(e.target.value); const v = e.target.value.toUpperCase().trim(); if (ALL_ASSETS.includes(v)) { setSymbol(v); setSearch('') } }}
                onBlur={() => { if (search && !ALL_ASSETS.includes(search.toUpperCase())) setSearch('') }}
                placeholder="Search symbol..."
                style={{ width: '100%', padding: '0.65rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--white)', fontSize: '0.85rem', fontFamily: 'var(--font-mono)', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.5rem', maxHeight: 96, overflowY: 'auto' }}>
                {filteredAssets.map(s => (
                  <button key={s} onClick={() => { setSymbol(s); setSearch('') }} style={{
                    padding: '0.25rem 0.55rem', borderRadius: 5,
                    border: symbol === s ? '1px solid var(--blue)' : '1px solid var(--border)',
                    background: symbol === s ? 'rgba(59,127,255,0.2)' : 'var(--bg3)',
                    color: symbol === s ? 'var(--blue)' : 'var(--muted)',
                    fontSize: '0.65rem', cursor: 'pointer', fontWeight: symbol === s ? 700 : 400,
                  }}>{s}</button>
                ))}
              </div>
            </div>

            {/* Strategy */}
            <div>
              <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--faint)', marginBottom: '0.4rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>STRATEGY</label>
              <select value={strategy} onChange={e => setStrategy(e.target.value)} style={{ width: '100%', padding: '0.65rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--white)', fontSize: '0.82rem', boxSizing: 'border-box' }}>
                {Object.entries(STRATEGIES).map(([id, meta]) => (
                  <option key={id} value={id}>{meta.name}</option>
                ))}
              </select>
              <p style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: '0.4rem', lineHeight: 1.4 }}>{stratMeta?.plainEnglish}</p>
            </div>

            {/* Period + Fee row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--faint)', marginBottom: '0.4rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>PERIOD</label>
                <select value={period} onChange={e => setPeriod(e.target.value)} style={{ width: '100%', padding: '0.65rem 0.5rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--white)', fontSize: '0.8rem', boxSizing: 'border-box' }}>
                  {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--faint)', marginBottom: '0.4rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>FEE (bps)</label>
                <input type="number" min={0} max={100} step={1} value={Math.round(fee * 10000)} onChange={e => setFee(Number(e.target.value) / 10000)} style={{ width: '100%', padding: '0.65rem 0.5rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--white)', fontSize: '0.8rem', boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* Slippage */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <label style={{ fontSize: '0.65rem', color: 'var(--faint)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>SLIPPAGE (bps)</label>
                <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>{slippageBps} bps</span>
              </div>
              <input type="range" min={0} max={50} step={1} value={slippageBps} onChange={e => setSlippageBps(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--blue)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.2rem' }}>
                <span style={{ fontSize: '0.58rem', color: 'var(--faint)' }}>0 (liquid ETF)</span>
                <span style={{ fontSize: '0.58rem', color: 'var(--faint)' }}>50 (illiquid crypto)</span>
              </div>
            </div>

            {/* Advanced params toggle */}
            {stratMeta?.paramSchema && (
              <div>
                <button onClick={() => setShowAdvParams(!showAdvParams)} style={{ background: 'none', border: 'none', color: 'var(--blue)', fontSize: '0.72rem', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-mono)' }}>
                  {showAdvParams ? '▾' : '▸'} Strategy parameters
                </button>
                {showAdvParams && (
                  <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {stratMeta.paramSchema.map(param => (
                      <div key={param.key}>
                        <label style={{ display: 'block', fontSize: '0.62rem', color: 'var(--faint)', marginBottom: '0.25rem' }}>{param.label}</label>
                        <input
                          type="number"
                          step={param.step}
                          min={param.min}
                          max={param.max}
                          value={customParams[param.key] ?? stratMeta.defaultParams[param.key]}
                          onChange={e => setCustomParams(prev => ({ ...prev, [param.key]: Number(e.target.value) }))}
                          style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--white)', fontSize: '0.8rem', boxSizing: 'border-box' }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button onClick={runBacktest} disabled={loading} className="btn-primary" style={{ width: '100%', padding: '0.85rem', borderRadius: 10, fontSize: '0.88rem', fontWeight: 700, opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Running…' : 'Run Backtest →'}
            </button>

            {error && (
              <div style={{ padding: '0.75rem', borderRadius: 8, background: 'rgba(255,90,95,0.1)', border: '1px solid rgba(255,90,95,0.3)', color: '#FF5A5F', fontSize: '0.78rem' }}>{error}</div>
            )}
          </div>

          {/* Results */}
          <div>
            {!result && !loading && (
              <div style={{ background: 'var(--bg2)', border: '1px dashed var(--border)', borderRadius: 16, padding: '4rem 2rem', textAlign: 'center' }}>
                <div style={{ color: 'var(--faint)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Configure a strategy and hit Run</div>
                <div style={{ color: 'var(--faint)', fontSize: '0.75rem' }}>Fees + slippage are applied on every trade</div>
              </div>
            )}

            {loading && (
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '4rem 2rem', textAlign: 'center' }}>
                <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Fetching market data and running simulation…</div>
              </div>
            )}

            {result && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Header row with save button */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--faint)', letterSpacing: '0.08em' }}>
                    {result.symbol} · {result.period}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => { setSaveName(`${result.symbol} ${STRATEGIES[strategy as keyof typeof STRATEGIES]?.name ?? strategy}`); setSaveSaving(false) }} className="btn-primary" style={{ padding: '0.45rem 1rem', borderRadius: 8, fontSize: '0.72rem', fontWeight: 600, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}>
                      Save
                    </button>
                    <button onClick={() => setShowSaved(s => !s)} className="btn-primary" style={{ padding: '0.45rem 1rem', borderRadius: 8, fontSize: '0.72rem', fontWeight: 600, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}>
                      History {savedBacktests.length > 0 ? `(${savedBacktests.length})` : ''}
                    </button>
                  </div>
                </div>

                {/* Save modal */}
                {saveName && !saveSaving && (
                  <div style={{ background: 'var(--bg2)', border: '1px solid var(--blue)', borderRadius: 10, padding: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={saveName}
                      onChange={e => setSaveName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveBacktest()}
                      placeholder="Backtest name..."
                      style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--white)', fontSize: '0.82rem', boxSizing: 'border-box' }}
                    />
                    <button onClick={saveBacktest} style={{ padding: '0.5rem 1rem', borderRadius: 6, background: 'var(--blue)', border: 'none', color: '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>Save</button>
                    <button onClick={() => setSaveName('')} style={{ padding: '0.5rem 0.75rem', borderRadius: 6, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: '0.78rem', cursor: 'pointer' }}>✕</button>
                  </div>
                )}
                {saveSaving && <div style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>Saving…</div>}

                {/* Saved backtests panel */}
                {showSaved && (
                  <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>SAVED BACKTESTS</div>
                    {savedLoading ? (
                      <div style={{ color: 'var(--faint)', fontSize: '0.78rem' }}>Loading…</div>
                    ) : savedBacktests.length === 0 ? (
                      <div style={{ color: 'var(--faint)', fontSize: '0.78rem' }}>No saved backtests yet</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {savedBacktests.map(b => (
                          <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.6rem', background: 'var(--bg3)', borderRadius: 6 }}>
                            <div style={{ cursor: 'pointer' }} onClick={() => loadSavedBacktest(b.id)}>
                              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--white)' }}>{b.name}</div>
                              <div style={{ fontSize: '0.62rem', color: 'var(--faint)' }}>{b.symbol} · {b.strategy} · {fmtPct(b.totalReturn)} · Sharpe {fmt2(b.sharpe)}</div>
                            </div>
                            <button onClick={() => deleteSaved(b.id)} style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', fontSize: '0.7rem', padding: '0.25rem' }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Primary stats row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.75rem' }}>
                  <StatCard label="Total Return" value={fmtPct(result.stats.totalReturnPct)} color={colorOf(result.stats.totalReturnPct)} />
                  <StatCard label="Ann. Return" value={fmtPct(result.stats.annualizedReturnPct)} color={colorOf(result.stats.annualizedReturnPct)} />
                  <StatCard label="Sharpe" value={fmt2(result.stats.sharpeRatio)} color={result.stats.sharpeRatio > 1 ? '#00E599' : result.stats.sharpeRatio > 0 ? 'var(--white)' : '#FF5A5F'} />
                  <StatCard label="Max Drawdown" value={fmtPct(-result.stats.maxDrawdownPct)} color="#FF5A5F" sub={result.stats.maxDrawdownDuration > 0 ? `${result.stats.maxDrawdownDuration}d duration` : undefined} />
                </div>

                {/* Chart with view tabs */}
                <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem' }}>
                  {/* View tabs */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg3)', borderRadius: 8, padding: '0.25rem' }}>
                      {(['equity', 'drawdown', 'monthly'] as const).map(v => (
                        <button key={v} onClick={() => setChartView(v)} style={{
                          padding: '0.3rem 0.75rem', borderRadius: 6, border: 'none',
                          background: chartView === v ? 'var(--blue)' : 'transparent',
                          color: chartView === v ? '#fff' : 'var(--muted)',
                          fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer',
                          textTransform: 'capitalize', transition: 'all 0.15s',
                        }}>
                          {v === 'equity' ? 'Equity' : v === 'drawdown' ? 'Drawdown' : 'Monthly'}
                        </button>
                      ))}
                    </div>
                    {chartView === 'equity' && (
                      <div style={{ display: 'flex', gap: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.62rem' }}>
                        <span style={{ color: isPositive ? '#00E599' : '#FF5A5F' }}>● Strategy</span>
                        <span style={{ color: 'var(--faint)' }}>● Buy & Hold</span>
                      </div>
                    )}
                  </div>

                  {/* Equity chart */}
                  {chartView === 'equity' && (
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="stratGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={isPositive ? '#00E599' : '#FF5A5F'} stopOpacity={0.25} />
                            <stop offset="100%" stopColor={isPositive ? '#00E599' : '#FF5A5F'} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" tick={{ fill: 'var(--faint)', fontSize: 9 }} tickFormatter={v => v.slice(5)} interval="preserveStartEnd" />
                        <YAxis tick={{ fill: 'var(--faint)', fontSize: 9 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} domain={['auto', 'auto']} />
                        <Tooltip content={<ChartTooltip />} />
                        <ReferenceLine y={10000} stroke="var(--border)" strokeDasharray="3 3" />
                        <Area type="monotone" dataKey="strategy" stroke={isPositive ? '#00E599' : '#FF5A5F'} strokeWidth={2} fill="url(#stratGrad)" dot={false} />
                        <Area type="monotone" dataKey="buyHold" stroke="rgba(255,255,255,0.2)" strokeWidth={1} fill="none" dot={false} strokeDasharray="4 2" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}

                  {/* Drawdown chart */}
                  {chartView === 'drawdown' && (
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#FF5A5F" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#FF5A5F" stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" tick={{ fill: 'var(--faint)', fontSize: 9 }} tickFormatter={v => v.slice(5)} interval="preserveStartEnd" />
                        <YAxis tick={{ fill: 'var(--faint)', fontSize: 9 }} tickFormatter={v => `${v.toFixed(1)}%`} domain={['auto', 0]} orientation="right" />
                        <Tooltip content={({ active, payload, label }: any) => active && payload?.[0] ? (
                          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                            <div style={{ color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
                            <div style={{ color: '#FF5A5F' }}>Drawdown: {Number(payload[0].value).toFixed(2)}%</div>
                          </div>
                        ) : null} />
                        <Area type="monotone" dataKey="drawdown" stroke="#FF5A5F" strokeWidth={1.5} fill="url(#ddGrad)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}

                  {/* Monthly returns heatmap */}
                  {chartView === 'monthly' && monthlyReturns.length > 0 && (
                    <div>
                      {(() => {
                        const allYears = [...new Set(monthlyReturns.map(m => m.year))].sort()
                        const MONTHS = ['01','02','03','04','05','06','07','08','09','10','11','12']
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            {allYears.map(year => (
                              <div key={year} style={{ display: 'flex', gap: '0.15rem', alignItems: 'center' }}>
                                <div style={{ width: 36, fontSize: '0.58rem', color: 'var(--faint)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{year}</div>
                                <div style={{ display: 'flex', gap: '0.15rem', flex: 1 }}>
                                  {MONTHS.map(month => {
                                    const m = monthlyReturns.find(mr => mr.month === `${year}-${month}`)
                                    if (!m) return <div key={month} style={{ width: 20, height: 20 }} />
                                    const intensity = Math.min(0.15 + Math.abs(m.returnPct) / 20 * 0.75, 0.9)
                                    return (
                                      <div key={month} title={`${m.month}: ${fmtPct(m.returnPct)}`}
                                        style={{
                                          width: 20, height: 20, borderRadius: 3,
                                          background: m.isPositive
                                            ? `rgba(0,229,153,${intensity})`
                                            : `rgba(255,90,95,${intensity})`,
                                          border: '1px solid rgba(255,255,255,0.05)',
                                        }}
                                      />
                                    )
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      })()}
                      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.58rem', color: 'var(--faint)', fontFamily: 'var(--font-mono)' }}>Legend:</span>
                        <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                          <div style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(255,90,95,0.8)' }} />
                          <span style={{ fontSize: '0.58rem', color: 'var(--faint)' }}>Loss</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                          <div style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(0,229,153,0.8)' }} />
                          <span style={{ fontSize: '0.58rem', color: 'var(--faint)' }}>Gain</span>
                        </div>
                        <span style={{ fontSize: '0.58rem', color: 'var(--faint)', fontFamily: 'var(--font-mono)' }}>Intensity = return magnitude</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Analysis tools row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '0.75rem' }}>
                  <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--muted)', letterSpacing: '0.08em' }}>MONTE Carlo — 80 trials</div>
                      <button onClick={runMonteCarlo} disabled={mcLoading} style={{
                        padding: '0.35rem 0.85rem', borderRadius: 6, border: '1px solid var(--border)',
                        background: mcLoading ? 'var(--bg3)' : 'var(--bg3)', color: 'var(--muted)',
                        fontSize: '0.68rem', fontWeight: 600, cursor: mcLoading ? 'default' : 'pointer',
                      }}>
                        {mcLoading ? 'Running…' : 'Run'}
                      </button>
                    </div>
                    {mcResult && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.5rem' }}>
                        <StatCard label="Median Return" value={fmtPct(mcResult.medianReturn)} color={colorOf(mcResult.medianReturn)} />
                        <StatCard label="Beat Rate" value={`${(mcResult.beatRate * 100).toFixed(0)}%`} color={mcResult.beatRate > 0.5 ? '#00E599' : 'var(--white)'} />
                        <StatCard label="P90 Return" value={fmtPct(mcResult.p90Return)} color="#00E599" />
                        <StatCard label="P10 Return" value={fmtPct(mcResult.p10Return)} color="#FF5A5F" />
                        <StatCard label="Median Sharpe" value={fmt2(mcResult.medianSharpe)} color={mcResult.medianSharpe > 1 ? '#00E599' : 'var(--white)'} />
                        <StatCard label="Median DD" value={fmtPct(-mcResult.medianMaxDrawdown)} color="#FF5A5F" />
                      </div>
                    )}
                  </div>

                  <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--muted)', letterSpacing: '0.08em' }}>WALK-FORWARD — 252d train / 63d test</div>
                      <button onClick={runWalkForward} disabled={wfLoading} style={{
                        padding: '0.35rem 0.85rem', borderRadius: 6, border: '1px solid var(--border)',
                        background: wfLoading ? 'var(--bg3)' : 'var(--bg3)', color: 'var(--muted)',
                        fontSize: '0.68rem', fontWeight: 600, cursor: wfLoading ? 'default' : 'pointer',
                      }}>
                        {wfLoading ? 'Running…' : 'Run'}
                      </button>
                    </div>
                    {wfResult && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.5rem' }}>
                        <StatCard label="Avg Return" value={fmtPct(wfResult.avgReturn)} color={colorOf(wfResult.avgReturn)} />
                        <StatCard label="Avg Sharpe" value={fmt2(wfResult.avgSharpe)} color={wfResult.avgSharpe > 1 ? '#00E599' : 'var(--white)'} />
                        <StatCard label="Beat Buy-Hold" value={`${(wfResult.beatBuyHoldRate * 100).toFixed(0)}%`} color={wfResult.beatBuyHoldRate > 0.5 ? '#00E599' : 'var(--white)'} />
                        <StatCard label="Consistency" value={`${(wfResult.consistencyRatio * 100).toFixed(0)}%`} />
                        <StatCard label="Windows" value={String(wfResult.nWindows)} />
                        <StatCard label="Outperformance" value={fmtPct(wfResult.avgSharpe > 0 ? wfResult.avgReturn - (activeResult?.stats.annualizedReturnPct ?? 0) : 0)} color={colorOf(wfResult.avgReturn - (activeResult?.stats.annualizedReturnPct ?? 0))} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Full stats grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.75rem' }}>
                  <StatCard label="Sortino" value={fmt2(result.stats.sortinoRatio)} color={result.stats.sortinoRatio > 1 ? '#00E599' : 'var(--white)'} />
                  <StatCard label="Calmar" value={fmt2(result.stats.calmarRatio)} color={result.stats.calmarRatio > 0.5 ? '#00E599' : 'var(--white)'} />
                  <StatCard label="Profit Factor" value={result.stats.profitFactor >= 999 ? '∞' : fmt2(result.stats.profitFactor)} color={result.stats.profitFactor > 1.5 ? '#00E599' : result.stats.profitFactor > 1 ? 'var(--white)' : '#FF5A5F'} />
                  <StatCard label="Exposure" value={`${result.stats.exposureTime?.toFixed(0) ?? '—'}%`} sub="time in market" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.75rem' }}>
                  <StatCard label="Win Rate" value={result.stats.winRate > 0 ? `${result.stats.winRate.toFixed(0)}%` : '—'} color={result.stats.winRate > 50 ? '#00E599' : 'var(--white)'} />
                  <StatCard label="Trades" value={String(result.stats.totalTrades || '—')} sub={`${result.stats.profitableTrades ?? 0} profitable`} />
                  <StatCard label="Avg Win" value={fmtPct(result.stats.avgWin)} color="#00E599" />
                  <StatCard label="Avg Loss" value={fmtPct(result.stats.avgLoss)} color="#FF5A5F" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.75rem' }}>
                  <StatCard label="Best Trade" value={fmtPct(result.stats.bestTradePct)} color="#00E599" />
                  <StatCard label="Worst Trade" value={fmtPct(result.stats.worstTradePct)} color="#FF5A5F" />
                  <StatCard label="Avg Duration" value={`${result.stats.avgTradeDurationDays ?? '—'}d`} sub="per trade" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ADVANCED COMPARE MODE ────────────────────────────────── */}
      {mode === 'advanced' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--muted)', letterSpacing: '0.1em', marginBottom: '1.25rem' }}>CROSS-ASSET & STRATEGY COMPARISON</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--faint)', marginBottom: '0.4rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>ASSETS (comma-separated)</label>
                <input
                  type="text"
                  value={advInput}
                  onChange={e => { setAdvInput(e.target.value); setAdvSymbols(e.target.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)) }}
                  placeholder="SPY, QQQ, BTC-USD, AAPL..."
                  style={{ width: '100%', padding: '0.65rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--white)', fontSize: '0.85rem', fontFamily: 'var(--font-mono)', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.5rem' }}>
                  {['SPY', 'QQQ', 'BTC-USD', 'ETH-USD', 'AAPL', 'NVDA', 'TLT', 'GLD'].map(s => (
                    <button key={s} onClick={() => { const list = advSymbols.includes(s) ? advSymbols.filter(x => x !== s) : [...advSymbols, s]; setAdvSymbols(list); setAdvInput(list.join(', ')) }} style={{ padding: '0.25rem 0.5rem', borderRadius: 5, border: '1px solid var(--border)', background: advSymbols.includes(s) ? 'var(--blue)' : 'var(--bg3)', color: advSymbols.includes(s) ? '#fff' : 'var(--muted)', fontSize: '0.62rem', cursor: 'pointer' }}>{s}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--faint)', marginBottom: '0.4rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>STRATEGIES</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                  {Object.entries(STRATEGIES).map(([id, meta]) => (
                    <button key={id} onClick={() => setAdvStrategies(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])} style={{ padding: '0.3rem 0.6rem', borderRadius: 6, border: '1px solid var(--border)', background: advStrategies.includes(id) ? 'var(--mint)' : 'var(--bg3)', color: advStrategies.includes(id) ? '#000' : 'var(--muted)', fontSize: '0.62rem', cursor: 'pointer', fontWeight: advStrategies.includes(id) ? 700 : 400 }}>{meta.name}</button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--faint)', marginBottom: '0.4rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>PERIOD</label>
                <select value={advPeriod} onChange={e => setAdvPeriod(e.target.value)} style={{ padding: '0.65rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--white)', fontSize: '0.82rem' }}>
                  {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <button onClick={runAdvanced} disabled={advLoading || advSymbols.length === 0 || advStrategies.length === 0} className="btn-primary" style={{ padding: '0.65rem 1.75rem', borderRadius: 10, fontWeight: 700, fontSize: '0.85rem', opacity: advLoading ? 0.6 : 1 }}>
                {advLoading ? 'Running…' : `Run ${advSymbols.length * advStrategies.length} Backtests →`}
              </button>
            </div>
            {advError && <div style={{ marginTop: '0.75rem', color: '#FF5A5F', fontSize: '0.78rem' }}>{advError}</div>}
          </div>

          {Object.keys(advResults).length > 0 && (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg3)' }}>
                    {['Asset · Strategy', 'Return', 'Ann. Return', 'Sharpe', 'Sortino', 'Max DD', 'Win Rate', 'Profit Factor', 'Trades'].map(h => (
                      <th key={h} style={{ padding: '0.7rem 0.85rem', textAlign: h === 'Asset · Strategy' ? 'left' : 'right', color: 'var(--faint)', fontWeight: 600, fontSize: '0.58rem', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(advResults)
                    .sort((a, b) => b[1].stats.sharpeRatio - a[1].stats.sharpeRatio)
                    .map(([key, r]) => (
                      <tr key={key} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.65rem 0.85rem', fontWeight: 600, color: 'var(--white)' }}>{key}</td>
                        <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', color: colorOf(r.stats.totalReturnPct) }}>{fmtPct(r.stats.totalReturnPct)}</td>
                        <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', color: colorOf(r.stats.annualizedReturnPct) }}>{fmtPct(r.stats.annualizedReturnPct)}</td>
                        <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', color: r.stats.sharpeRatio > 1 ? '#00E599' : 'var(--muted)' }}>{fmt2(r.stats.sharpeRatio)}</td>
                        <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', color: r.stats.sortinoRatio > 1 ? '#00E599' : 'var(--muted)' }}>{fmt2(r.stats.sortinoRatio)}</td>
                        <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', color: '#FF5A5F' }}>{fmtPct(-r.stats.maxDrawdownPct)}</td>
                        <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>{r.stats.winRate > 0 ? `${r.stats.winRate.toFixed(0)}%` : '—'}</td>
                        <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', color: r.stats.profitFactor > 1.5 ? '#00E599' : 'var(--muted)' }}>{r.stats.profitFactor >= 999 ? '∞' : fmt2(r.stats.profitFactor)}</td>
                        <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', color: 'var(--muted)' }}>{r.stats.totalTrades}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── CSV UPLOAD MODE ──────────────────────────────────────── */}
      {mode === 'csv' && (
        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '1.5rem', alignItems: 'start' }} className="backtest-grid">
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* File upload */}
            <div>
              <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--faint)', marginBottom: '0.4rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>CSV FILE</label>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{ border: '2px dashed var(--border)', borderRadius: 10, padding: '1.5rem', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s' }}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file && fileInputRef.current) { const dt = new DataTransfer(); dt.items.add(file); fileInputRef.current.files = dt.files; handleFileUpload({ target: fileInputRef.current } as React.ChangeEvent<HTMLInputElement>) } }}
              >
                {csvData ? (
                  <div>
                    <div style={{ color: '#00E599', fontSize: '0.85rem', fontWeight: 600 }}>{csvFileName}</div>
                    <div style={{ color: 'var(--muted)', fontSize: '0.72rem', marginTop: '0.25rem' }}>{csvData.length} bars · {csvData[0].date} → {csvData[csvData.length - 1].date}</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem', color: 'var(--faint)' }}>↑</div>
                    <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Drop CSV or click to upload</div>
                    <div style={{ color: 'var(--faint)', fontSize: '0.68rem', marginTop: '0.25rem' }}>Needs: Date, Close (+ Open, High, Low, Volume)</div>
                  </div>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleFileUpload} style={{ display: 'none' }} />
              {csvError && <div style={{ color: '#FF5A5F', fontSize: '0.72rem', marginTop: '0.4rem' }}>{csvError}</div>}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--faint)', marginBottom: '0.4rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>SYMBOL NAME (display only)</label>
              <input type="text" value={csvSymbolName} onChange={e => setCsvSymbolName(e.target.value.toUpperCase())} style={{ width: '100%', padding: '0.65rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--white)', fontSize: '0.85rem', fontFamily: 'var(--font-mono)', boxSizing: 'border-box' }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--faint)', marginBottom: '0.4rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>STRATEGY</label>
              <select value={csvStrategy} onChange={e => setCsvStrategy(e.target.value)} style={{ width: '100%', padding: '0.65rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--white)', fontSize: '0.82rem', boxSizing: 'border-box' }}>
                {Object.entries(STRATEGIES).map(([id, meta]) => (
                  <option key={id} value={id}>{meta.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--faint)', marginBottom: '0.4rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>FEE + SLIPPAGE (bps)</label>
              <input type="number" min={0} max={100} step={1} value={Math.round(csvFee * 10000)} onChange={e => setCsvFee(Number(e.target.value) / 10000)} style={{ width: '100%', padding: '0.65rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--white)', fontSize: '0.82rem', boxSizing: 'border-box' }} />
            </div>

            <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '0.75rem', fontSize: '0.68rem', color: 'var(--faint)', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--muted)' }}>Supported formats:</strong><br />
              Yahoo Finance (History → Download), Alpha Vantage CSV, any CSV with Date + Close columns. Dates auto-parsed.
            </div>

            <button onClick={runCsvBacktest} disabled={!csvData || csvLoading} className="btn-primary" style={{ width: '100%', padding: '0.85rem', borderRadius: 10, fontSize: '0.88rem', fontWeight: 700, opacity: !csvData || csvLoading ? 0.5 : 1 }}>
              {csvLoading ? 'Running…' : 'Run on CSV Data →'}
            </button>
          </div>

          {/* CSV Results */}
          <div>
            {!csvResult && !csvLoading && (
              <div style={{ background: 'var(--bg2)', border: '1px dashed var(--border)', borderRadius: 16, padding: '4rem 2rem', textAlign: 'center' }}>
                <div style={{ color: 'var(--faint)', fontSize: '0.9rem' }}>Upload a CSV file and run backtest</div>
              </div>
            )}
            {csvLoading && (
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '4rem 2rem', textAlign: 'center' }}>
                <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Running simulation on uploaded data…</div>
              </div>
            )}
            {csvResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.75rem' }}>
                  <StatCard label="Total Return" value={fmtPct(csvResult.stats.totalReturnPct)} color={colorOf(csvResult.stats.totalReturnPct)} />
                  <StatCard label="Ann. Return" value={fmtPct(csvResult.stats.annualizedReturnPct)} color={colorOf(csvResult.stats.annualizedReturnPct)} />
                  <StatCard label="Sharpe" value={fmt2(csvResult.stats.sharpeRatio)} />
                  <StatCard label="Max Drawdown" value={fmtPct(-csvResult.stats.maxDrawdownPct)} color="#FF5A5F" />
                </div>

                {(() => {
                  const csvChartData = csvResult.bars.map((b, i) => ({
                    date: b.date,
                    strategy: Math.round(b.equity),
                    buyHold: csvResult.buyHold?.[i] ? Math.round(csvResult.buyHold[i].equity) : undefined,
                  }))
                  const pos = (csvResult.stats.totalReturnPct ?? 0) >= 0
                  return (
                    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--muted)', marginBottom: '1rem', letterSpacing: '0.1em' }}>EQUITY CURVE — {csvResult.symbol} ({csvResult.period})</div>
                      <ResponsiveContainer width="100%" height={240}>
                        <AreaChart data={csvChartData}>
                          <defs>
                            <linearGradient id="csvGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={pos ? '#00E599' : '#FF5A5F'} stopOpacity={0.25} />
                              <stop offset="100%" stopColor={pos ? '#00E599' : '#FF5A5F'} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="date" tick={{ fill: 'var(--faint)', fontSize: 9 }} tickFormatter={v => v.slice(5)} interval="preserveStartEnd" />
                          <YAxis tick={{ fill: 'var(--faint)', fontSize: 9 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} domain={['auto', 'auto']} />
                          <Tooltip content={<ChartTooltip />} />
                          <ReferenceLine y={10000} stroke="var(--border)" strokeDasharray="3 3" />
                          <Area type="monotone" dataKey="strategy" stroke={pos ? '#00E599' : '#FF5A5F'} strokeWidth={2} fill="url(#csvGrad)" dot={false} />
                          <Area type="monotone" dataKey="buyHold" stroke="rgba(255,255,255,0.2)" strokeWidth={1} fill="none" dot={false} strokeDasharray="4 2" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )
                })()}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.75rem' }}>
                  <StatCard label="Sortino" value={fmt2(csvResult.stats.sortinoRatio)} />
                  <StatCard label="Calmar" value={fmt2(csvResult.stats.calmarRatio)} />
                  <StatCard label="Profit Factor" value={csvResult.stats.profitFactor >= 999 ? '∞' : fmt2(csvResult.stats.profitFactor)} color={csvResult.stats.profitFactor > 1.5 ? '#00E599' : 'var(--white)'} />
                  <StatCard label="Win Rate" value={csvResult.stats.winRate > 0 ? `${csvResult.stats.winRate.toFixed(0)}%` : '—'} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @media(max-width: 900px) { .backtest-grid { grid-template-columns: 1fr !important } }
      `}</style>
    </div>
  )
}
