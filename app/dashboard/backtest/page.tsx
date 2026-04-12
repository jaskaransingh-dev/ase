'use client'

import { useState, useEffect, useCallback } from 'react'
import { Area, AreaChart, XAxis, YAxis, Tooltip, ResponsiveContainer, Line, ComposedChart, Bar } from 'recharts'
import { STRATEGIES } from '@/lib/backtest'

interface BacktestResult {
  stats: {
    totalReturnPct: number
    annualizedReturnPct: number
    sharpeRatio: number
    maxDrawdownPct: number
    winRate: number
    totalTrades: number
  }
  equity: number[]
  dates: string[]
}

const POPULAR_ASSETS = [
  { group: 'Crypto', symbols: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'DOGE-USD', 'AVAX-USD', 'LINK-USD', 'MATIC-USD'] },
  { group: 'Tech Stocks', symbols: ['NVDA', 'AAPL', 'MSFT', 'META', 'GOOGL', 'AMZN', 'TSLA'] },
  { group: 'ETFs', symbols: ['SPY', 'QQQ', 'VOO', 'DIA', 'IWM', 'ARKK'] },
  { group: 'Crypto ETFs', symbols: ['IBIT', 'FBTC', 'ARKB', 'BITB'] },
  { group: 'Finance', symbols: ['JPM', 'BAC', 'WFC', 'GS', 'MS'] },
  { group: 'Energy', symbols: ['XOM', 'CVX', 'COP'] },
]

const ALL_ASSETS = [...new Set(POPULAR_ASSETS.flatMap(g => g.symbols))].sort()

const PERIODS = ['1mo', '3mo', '6mo', '1y', '2y']

function fmtPct(v: number) {
  const s = v >= 0 ? '+' : ''
  return `${s}${v.toFixed(2)}%`
}

function colorOf(v: number) {
  return v >= 0 ? '#00E599' : '#FF5A5F'
}

function TooltipContent({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  const item = payload[0]
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
      <div style={{ color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ color: item.value >= 0 ? '#00E599' : '#FF5A5F', fontWeight: 600, fontSize: 14 }}>
        {item.value >= 0 ? '+' : ''}{item.value.toFixed(2)}%
      </div>
    </div>
  )
}

export default function BacktestPage() {
  const [mode, setMode] = useState<'simple' | 'advanced'>('simple')
  
  // Simple mode state
  const [simpleSymbol, setSimpleSymbol] = useState('BTC-USD')
  const [simpleStrategy, setSimpleStrategy] = useState('momentum_crossover')
  const [simplePeriod, setSimplePeriod] = useState('3mo')
  const [simpleLoading, setSimpleLoading] = useState(false)
  const [simpleResult, setSimpleResult] = useState<BacktestResult | null>(null)
  const [simpleError, setSimpleError] = useState('')
  const [simpleSearch, setSimpleSearch] = useState('')

  // Advanced mode state
  const [advSymbols, setAdvSymbols] = useState<string[]>(['BTC-USD'])
  const [advStrategies, setAdvStrategies] = useState<string[]>(['momentum_crossover'])
  const [advPeriod, setAdvPeriod] = useState('1y')
  const [advLoading, setAdvLoading] = useState(false)
  const [advResults, setAdvResults] = useState<Record<string, BacktestResult>>({})
  const [advError, setAdvError] = useState('')
  const [advSymbolInput, setAdvSymbolInput] = useState('')

  const filteredAssets = ALL_ASSETS.filter(a => 
    a.toLowerCase().includes(simpleSearch.toLowerCase())
  ).slice(0, 20)

  const runSimpleBacktest = useCallback(async () => {
    setSimpleLoading(true)
    setSimpleError('')
    setSimpleResult(null)
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: simpleSymbol, strategy: simpleStrategy, period: simplePeriod }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Failed')
      
      setSimpleResult({
        stats: data.stats,
        equity: data.stats.equityCurve || [],
        dates: data.stats.dates || [],
      })
    } catch (e) {
      setSimpleError(e instanceof Error ? e.message : 'Error')
    } finally {
      setSimpleLoading(false)
    }
  }, [simpleSymbol, simpleStrategy, simplePeriod])

  const runAdvancedBacktest = useCallback(async () => {
    setAdvLoading(true)
    setAdvError('')
    const results: Record<string, BacktestResult> = {}
    
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
            results[`${sym}:${strat}`] = {
              stats: data.stats,
              equity: data.stats.equityCurve || [],
              dates: data.stats.dates || [],
            }
          }
        } catch {}
      }
    }
    setAdvResults(results)
    setAdvLoading(false)
  }, [advSymbols, advStrategies, advPeriod])

  // Quick stats cards
  const simpleStats = simpleResult ? [
    { label: 'Total Return', value: fmtPct(simpleResult.stats.totalReturnPct), color: colorOf(simpleResult.stats.totalReturnPct) },
    { label: 'Ann. Return', value: fmtPct(simpleResult.stats.annualizedReturnPct), color: colorOf(simpleResult.stats.annualizedReturnPct) },
    { label: 'Sharpe', value: simpleResult.stats.sharpeRatio?.toFixed(2) || '—', color: 'var(--white)' },
    { label: 'Max DD', value: fmtPct(-simpleResult.stats.maxDrawdownPct), color: 'var(--red)' },
    { label: 'Win Rate', value: simpleResult.stats.winRate ? `${simpleResult.stats.winRate.toFixed(0)}%` : '—', color: 'var(--white)' },
    { label: 'Trades', value: simpleResult.stats.totalTrades?.toString() || '—', color: 'var(--white)' },
  ] : []

  const chartData = simpleResult?.equity.map((v, i) => ({
    date: simpleResult.dates[i]?.slice(0, 10) || '',
    value: v,
  })) || []

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem', fontFamily: 'var(--font-serif)' }}>
          Strategy Backtest
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          Test trading strategies against historical data. Past performance does not guarantee future results.
        </p>
      </div>

      {/* Mode Tabs */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
        <button
          onClick={() => setMode('simple')}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: 8,
            border: 'none',
            background: mode === 'simple' ? 'var(--blue)' : 'transparent',
            color: 'white',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Simple
        </button>
        <button
          onClick={() => setMode('advanced')}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: 8,
            border: 'none',
            background: mode === 'advanced' ? 'var(--blue)' : 'transparent',
            color: 'white',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Advanced
        </button>
      </div>

      {/* SIMPLE MODE */}
      {mode === 'simple' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          {/* Controls */}
          <div>
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem' }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--muted)' }}>CONFIGURE</h3>
              
              {/* Asset Selector with Search */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--faint)', marginBottom: '0.5rem' }}>ASSET (search or select)</label>
                <input
                  type="text"
                  value={simpleSearch}
                  onChange={(e) => { setSimpleSearch(e.target.value); if (ALL_ASSETS.includes(e.target.value.toUpperCase())) setSimpleSymbol(e.target.value.toUpperCase()) }}
                  placeholder="Search asset (e.g. BTC, SPY, AAPL...)"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--bg3)',
                    color: 'white',
                    fontSize: '0.875rem',
                    marginBottom: '0.5rem',
                  }}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', maxHeight: '120px', overflowY: 'auto' }}>
                  {filteredAssets.map((sym) => (
                    <button
                      key={sym}
                      onClick={() => { setSimpleSymbol(sym); setSimpleSearch('') }}
                      style={{
                        padding: '0.3rem 0.6rem',
                        borderRadius: 6,
                        border: simpleSymbol === sym ? '1px solid var(--blue)' : '1px solid var(--border)',
                        background: simpleSymbol === sym ? 'rgba(59,127,255,0.2)' : 'var(--bg3)',
                        color: simpleSymbol === sym ? 'var(--blue)' : 'var(--muted)',
                        fontSize: '0.7rem',
                        cursor: 'pointer',
                        fontWeight: simpleSymbol === sym ? 600 : 400,
                      }}
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              </div>

              {/* Strategy Selector */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--faint)', marginBottom: '0.5rem' }}>STRATEGY</label>
                <select
                  value={simpleStrategy}
                  onChange={(e) => setSimpleStrategy(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--bg3)',
                    color: 'white',
                    fontSize: '0.875rem',
                  }}
                >
                  {Object.entries(STRATEGIES).map(([id, meta]) => (
                    <option key={id} value={id}>{meta.name} - {meta.bestFor}</option>
                  ))}
                </select>
                <p style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
                  {STRATEGIES[simpleStrategy as keyof typeof STRATEGIES]?.description}
                </p>
              </div>

              {/* Period Selector */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--faint)', marginBottom: '0.5rem' }}>TIME PERIOD</label>
                <select
                  value={simplePeriod}
                  onChange={(e) => setSimplePeriod(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--bg3)',
                    color: 'white',
                    fontSize: '0.875rem',
                  }}
                >
                  {PERIODS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* Run Button */}
              <button
                onClick={runSimpleBacktest}
                disabled={simpleLoading}
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  borderRadius: 10,
                  border: 'none',
                  background: simpleLoading ? 'var(--border)' : 'var(--blue)',
                  color: 'white',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  cursor: simpleLoading ? 'not-allowed' : 'pointer',
                  opacity: simpleLoading ? 0.6 : 1,
                }}
              >
                {simpleLoading ? 'Running...' : 'Run Backtest'}
              </button>

              {simpleError && (
                <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: 8, background: 'rgba(255,90,95,0.1)', border: '1px solid rgba(255,90,95,0.3)', color: '#FF5A5F', fontSize: '0.8rem' }}>
                  {simpleError}
                </div>
              )}
            </div>
          </div>

          {/* Results */}
          <div>
            {!simpleResult && !simpleLoading && !simpleError && (
              <div style={{ background: 'var(--bg2)', border: '1px dashed var(--border)', borderRadius: 16, padding: '3rem', textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.5 }}>📊</div>
                <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Select an asset and strategy, then run backtest</div>
              </div>
            )}

            {simpleResult && (
              <>
                {/* Stats Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
                  {simpleStats.map((stat) => (
                    <div key={stat.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem' }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--faint)', marginBottom: '0.25rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
                        {stat.label.toUpperCase()}
                      </div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: stat.color }}>
                        {stat.value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Equity Chart */}
                <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem', height: 350 }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--faint)', marginBottom: '1rem', fontFamily: 'var(--font-mono)' }}>EQUITY CURVE</div>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#00E599" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#00E599" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={{ fill: 'var(--faint)', fontSize: 10 }} tickFormatter={(v) => v.slice(5)} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: 'var(--faint)', fontSize: 10 }} tickFormatter={(v) => `${(v/10000).toFixed(1)}x`} domain={['auto', 'auto']} />
                      <Tooltip content={<TooltipContent />} />
                      <Area type="monotone" dataKey="value" stroke="#00E599" strokeWidth={2} fill="url(#equityGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ADVANCED MODE */}
      {mode === 'advanced' && (
        <div>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem', marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--muted)' }}>CROSS-ASSET & STRATEGY COMPARISON</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--faint)', marginBottom: '1.5rem' }}>
              Compare multiple assets and strategies to find what works best. Enter symbols separated by commas.
            </p>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
              {/* Symbols */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--faint)', marginBottom: '0.5rem' }}>ASSETS</label>
                <input
                  type="text"
                  value={advSymbolInput}
                  onChange={(e) => { setAdvSymbolInput(e.target.value); const list = e.target.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean); if (list.length > 0) setAdvSymbols(list) }}
                  placeholder="BTC-USD, ETH-USD, SPY, AAPL..."
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--bg3)',
                    color: 'white',
                    fontSize: '0.875rem',
                    fontFamily: 'var(--font-mono)',
                  }}
                />
                <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                  {POPULAR_ASSETS.slice(0, 3).flatMap(g => g.symbols).slice(0, 10).map(sym => (
                    <button
                      key={sym}
                      onClick={() => { const newList = advSymbols.includes(sym) ? advSymbols.filter(x => x !== sym) : [...advSymbols, sym]; setAdvSymbols(newList); setAdvSymbolInput(newList.join(', ')) }}
                      style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: 4,
                        border: '1px solid var(--border)',
                        background: advSymbols.includes(sym) ? 'var(--blue)' : 'var(--bg3)',
                        color: advSymbols.includes(sym) ? 'white' : 'var(--muted)',
                        fontSize: '0.65rem',
                        cursor: 'pointer',
                      }}
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              </div>

              {/* Strategies */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--faint)', marginBottom: '0.5rem' }}>STRATEGIES</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                  {Object.keys(STRATEGIES).slice(0, 8).map(strat => (
                    <button
                      key={strat}
                      onClick={() => { const newList = advStrategies.includes(strat) ? advStrategies.filter(x => x !== strat) : [...advStrategies, strat]; setAdvStrategies(newList) }}
                      style={{
                        padding: '0.3rem 0.6rem',
                        borderRadius: 4,
                        border: '1px solid var(--border)',
                        background: advStrategies.includes(strat) ? 'var(--mint)' : 'var(--bg3)',
                        color: advStrategies.includes(strat) ? '#000' : 'var(--muted)',
                        fontSize: '0.6rem',
                        cursor: 'pointer',
                        fontWeight: advStrategies.includes(strat) ? 600 : 400,
                      }}
                    >
                      {strat.replace(/_/g, ' ').slice(0, 12)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--faint)', marginBottom: '0.5rem' }}>TIME PERIOD</label>
                <select
                  value={advPeriod}
                  onChange={(e) => setAdvPeriod(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--bg3)',
                    color: 'white',
                    fontSize: '0.875rem',
                  }}
                >
                  {PERIODS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={runAdvancedBacktest}
                disabled={advLoading || advSymbols.length === 0 || advStrategies.length === 0}
                style={{
                  padding: '0.875rem 2rem',
                  borderRadius: 10,
                  border: 'none',
                  background: advLoading ? 'var(--border)' : 'var(--blue)',
                  color: 'white',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  cursor: advLoading ? 'not-allowed' : 'pointer',
                  opacity: advLoading ? 0.6 : 1,
                }}
              >
                {advLoading ? 'Running...' : 'Run Comparison'}
              </button>
            </div>

            {advError && (
              <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: 8, background: 'rgba(255,90,95,0.1)', border: '1px solid rgba(255,90,95,0.3)', color: '#FF5A5F', fontSize: '0.8rem' }}>
                {advError}
              </div>
            )}
          </div>

          {/* Results Table */}
          {Object.keys(advResults).length > 0 && (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: 'var(--faint)', fontWeight: 600 }}>Asset:Strategy</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--faint)', fontWeight: 600 }}>Return</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--faint)', fontWeight: 600 }}>Ann. Return</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--faint)', fontWeight: 600 }}>Sharpe</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--faint)', fontWeight: 600 }}>Max DD</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--faint)', fontWeight: 600 }}>Trades</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(advResults).map(([key, result]) => (
                    <tr key={key} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{key}</td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: colorOf(result.stats.totalReturnPct) }}>
                        {fmtPct(result.stats.totalReturnPct)}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: colorOf(result.stats.annualizedReturnPct) }}>
                        {fmtPct(result.stats.annualizedReturnPct)}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        {result.stats.sharpeRatio?.toFixed(2) || '—'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--red)' }}>
                        {fmtPct(-result.stats.maxDrawdownPct)}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        {result.stats.totalTrades || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}