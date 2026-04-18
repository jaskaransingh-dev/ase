'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, BarChart, Bar } from 'recharts'
import { Loader2, Play, TrendingUp, Activity, Shield, BookOpen, GitBranch, AlertCircle } from 'lucide-react'
import Link from 'next/link'

const PERIODS = [
  { value: '14d', label: '2 Weeks' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '3 Months' },
  { value: '180d', label: '6 Months' },
  { value: '270d', label: '9 Months' },
  { value: '1y', label: '1 Year' },
  { value: '2y', label: '2 Years' },
  { value: '5y', label: '5 Years' },
]

const BENCHMARKS: Record<string, { label: string; color: string }> = {
  'BTC-USD': { label: 'Bitcoin', color: '#f7931a' },
  'ETH-USD': { label: 'Ethereum', color: '#627eea' },
  'SOL-USD': { label: 'Solana', color: '#19E6A7' },
}

const STRATEGIES = [
  { id: 'momentum_crossover', label: 'Momentum' },
  { id: 'mean_reversion', label: 'Mean Reversion' },
  { id: 'rsi_trend_filter', label: 'RSI' },
  { id: 'volatility_breakout', label: 'Breakout' },
  { id: 'dual_momentum', label: 'Dual Momentum' },
]

interface AgentData {
  slug: string
  name: string
  ticker: string | null
  primary_symbol: string | null
  backtest_strategy: string | null
  backtest_stats: any
}

export default function BacktestComparePage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  
  const [agents, setAgents] = useState<AgentData[]>([])
  const [loadingAgents, setLoadingAgents] = useState(true)
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [symbol, setSymbol] = useState(searchParams.get('symbol') || 'BTC-USD')
  const [strategy, setStrategy] = useState(searchParams.get('strategy') || 'momentum_crossover')
  const [period, setPeriod] = useState('1y')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<Record<string, any>>({})
  const [benchmarks, setBenchmarks] = useState<Record<string, any>>({})
  const [error, setError] = useState('')
  
  // Monte Carlo options
  const [enableMonteCarlo, setEnableMonteCarlo] = useState(false)
  const [enableWalkForward, setEnableWalkForward] = useState(false)
  const [mcTrials, setMcTrials] = useState(100)
  const [mcResults, setMcResults] = useState<any>(null)
  const [wfResults, setWfResults] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'agents' | 'data'>('agents')
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvData, setCsvData] = useState<any[]>([])

  const toBacktestSymbol = (value: string) => value.replace(/\//g, '-')
  
  const colors = {
    bg: '#06111F', bg2: '#0B1728', bg3: '#101A2D', border: '#1E2A3D',
    blue: '#4F8CFF', blue2: '#6BA3FF', mint: '#16C784', red: '#FF5468', orange: '#F5B942',
    text: '#B7C4D5', muted: '#7F8CA3', faint: '#55657A', white: '#F7FAFF'
  }

  // Load agents from Supabase
  useEffect(() => {
    async function fetchAgents() {
      try {
        const res = await fetch('/api/agents')
        const json = await res.json()
        const agentsData = json.data || json.agents || []
        
        // Map to our format - fetch primary_symbol and backtest_strategy
        const mappedAgents: AgentData[] = agentsData.map((a: any) => ({
          slug: a.slug,
          name: a.name,
          ticker: a.ticker,
          primary_symbol: toBacktestSymbol(a.primary_symbol || 'BTC-USD'),
          backtest_strategy: a.backtest_strategy || 'momentum_crossover',
          backtest_stats: a.backtest_stats,
        }))
        
        setAgents(mappedAgents)
        
        // Auto-select first 2 agents
        if (mappedAgents.length >= 2) {
          setSelectedAgents([mappedAgents[0].slug, mappedAgents[1].slug])
        } else if (mappedAgents.length === 1) {
          setSelectedAgents([mappedAgents[0].slug])
        }
      } catch (e) {
        console.error('Failed to load agents:', e)
      }
      setLoadingAgents(false)
    }
    fetchAgents()
  }, [])

  const runBacktest = async () => {
    setLoading(true)
    setError('')
    setResults({})
    setBenchmarks({})
    
    try {
      // Run backtests for selected agents in parallel
      const newResults: Record<string, any> = {}
      const newBenchmarks: Record<string, any> = {}
      
      // Fetch agent backtests
      const agentPromises = selectedAgents.map(async (slug) => {
        const agent = agents.find(a => a.slug === slug)
        if (!agent) return
        
        const res = await fetch('/api/backtest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            symbol: toBacktestSymbol(agent.primary_symbol || 'BTC-USD'), 
            strategy: agent.backtest_strategy || 'momentum_crossover', 
            period,
            fee: 0.001,
            agent_slug: slug
          })
        })
        const data = await res.json()
        if (!res.ok || data.error) {
          console.error(`Backtest failed for ${slug}:`, data.error)
          return
        }
        newResults[slug] = data
      })
      
      await Promise.all(agentPromises)
      setResults(newResults)
      
      // Fetch benchmarks in parallel
      const benchSymbols = ['BTC-USD', 'ETH-USD', 'SOL-USD'].filter(s => s !== symbol)
      const benchPromises = benchSymbols.map(async (bench) => {
        try {
          const bRes = await fetch('/api/backtest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol: bench, strategy: 'momentum_crossover', period, fee: 0.001 })
          })
          const bData = await bRes.json()
          if (bRes.ok && !bData.error) {
            newBenchmarks[bench] = bData
          }
        } catch {}
      })
      
      await Promise.all(benchPromises)
      setBenchmarks(newBenchmarks)
      
      // Run Monte Carlo if enabled (for first selected agent)
      if (enableMonteCarlo && selectedAgents.length > 0) {
        const firstAgent = agents.find(a => a.slug === selectedAgents[0])
        if (firstAgent) {
          try {
            const mcRes = await fetch('/api/backtest', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                symbol: toBacktestSymbol(firstAgent.primary_symbol || 'BTC-USD'),
                strategy: firstAgent.backtest_strategy || 'momentum_crossover',
                period,
                fee: 0.001,
                monteCarlo: true,
                nTrials: mcTrials,
                windowDays: 30,
              })
            })
            const mcData = await mcRes.json()
            if (mcRes.ok && mcData.monteCarlo) {
              setMcResults(mcData.monteCarlo)
            }
          } catch (e) {
            console.error('Monte Carlo failed:', e)
          }
        }
      }
      
      // Run Walk-Forward if enabled
      if (enableWalkForward && selectedAgents.length > 0) {
        const firstAgent = agents.find(a => a.slug === selectedAgents[0])
        if (firstAgent) {
          try {
            const wfRes = await fetch('/api/backtest', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                symbol: toBacktestSymbol(firstAgent.primary_symbol || 'BTC-USD'),
                strategy: firstAgent.backtest_strategy || 'momentum_crossover',
                period,
                fee: 0.001,
                walkForward: true,
                trainDays: 252,
                testDays: 63,
              })
            })
            const wfData = await wfRes.json()
            if (wfRes.ok && wfData.walkForward) {
              setWfResults(wfData.walkForward)
            }
          } catch (e) {
            console.error('Walk-forward failed:', e)
          }
        }
      }
      
    } catch (e: any) {
      setError(e.message || 'Backtest failed')
    }
    setLoading(false)
  }

  // Auto-run on mount if agents are loaded
  useEffect(() => {
    if (!loadingAgents && selectedAgents.length > 0 && activeTab === 'agents') {
      runBacktest()
    }
  }, [loadingAgents, activeTab])

  const handleCsvUpload = async (file: File) => {
    setCsvFile(file)
    const text = await file.text()
    const lines = text.split('\n').filter(l => l.trim())
    const headers = lines[0].split(',').map(h => h.trim())
    const data = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim())
      return headers.reduce((obj: any, h, i) => ({ ...obj, [h]: isNaN(Number(values[i])) ? values[i] : Number(values[i]) }), {})
    })
    setCsvData(data)
  }

  const toggleAgent = (slug: string) => {
    if (selectedAgents.includes(slug)) {
      setSelectedAgents(selectedAgents.filter(s => s !== slug))
    } else {
      setSelectedAgents([...selectedAgents, slug])
    }
  }

  const chartData = useMemo(() => {
    if (Object.keys(results).length === 0 || !results[selectedAgents[0]]?.bars) return []
    
    const firstAgent = selectedAgents[0]
    const firstBars = results[firstAgent].bars
    if (!firstBars?.length) return []
    
    const startEquity = firstBars[0]?.equity || 10000
    
    return firstBars.map((bar: any, i: number) => {
      const point: any = { date: bar.date?.slice(5) || '' }
      
      // Normalize agent results to percentage
      selectedAgents.forEach(slug => {
        if (results[slug]?.bars?.[i]) {
          const equity = results[slug].bars[i].equity
          point[slug] = ((equity - startEquity) / startEquity) * 100
        }
      })
      
      // Normalize benchmarks
      Object.keys(benchmarks).forEach(bench => {
        if (benchmarks[bench]?.bars?.[i]) {
          const equity = benchmarks[bench].bars[i].equity
          point[bench] = ((equity - startEquity) / startEquity) * 100
        }
      })
      
      return point
    })
  }, [results, benchmarks, selectedAgents])

  const fmtPct = (v: number) => v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '—'
  
  const agentColors = ['#5B8CFF', '#19E6A7', '#FFB648', '#FF6B7A', '#8B5CF6', '#F472B6', '#34D399', '#FBBF24']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)', background: colors.bg, color: colors.text }}>
      
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: `1px solid ${colors.border}`, background: colors.bg2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: colors.white, margin: 0 }}>Crypto Backtest Studio</h1>
            <p style={{ fontSize: '.7rem', color: colors.muted, margin: '4px 0 0' }}>Compare crypto agents, run robustness checks, and publish winners to the exchange</p>
          </div>
          <Link href="/dashboard/backtest/guide" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '.25rem .6rem', borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.bg3, color: colors.faint, fontSize: '.6rem', textDecoration: 'none' }}>
            <BookOpen size={12} />Guide
          </Link>
        </div>
        <button onClick={runBacktest} disabled={loading || selectedAgents.length === 0} style={{ padding: '.45rem 1rem', borderRadius: 8, border: 'none', background: loading ? colors.bg3 : colors.blue, color: '#fff', fontSize: '.7rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {loading ? 'Running...' : 'Run Backtest'}
        </button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.75rem', padding: '1rem 1.5rem', borderBottom: `1px solid ${colors.border}`, background: 'linear-gradient(180deg, rgba(79,140,255,.06), rgba(11,23,40,.98))' }}>
        {[
          ['1', 'Select', 'Choose agents and market data'],
          ['2', 'Run', 'Launch backtests, Monte Carlo, or walk-forward'],
          ['3', 'Compare', 'Inspect returns, drawdown, and robustness'],
          ['4', 'Deploy', 'Move the best setup into live trading'],
        ].map(([step, title, desc]) => (
          <div key={title} style={{ padding: '.9rem 1rem', borderRadius: 14, border: `1px solid ${colors.border}`, background: colors.bg2 }}>
            <div style={{ fontSize: '.58rem', color: colors.blue2, letterSpacing: '.12em', marginBottom: '.35rem' }}>{step}</div>
            <div style={{ fontSize: '.84rem', fontWeight: 700, color: colors.white, marginBottom: '.2rem' }}>{title}</div>
            <div style={{ fontSize: '.72rem', color: colors.muted, lineHeight: 1.5 }}>{desc}</div>
          </div>
        ))}
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '0.25rem', padding: '0.75rem 1.5rem', borderBottom: `1px solid ${colors.border}`, background: colors.bg2 }}>
        <button onClick={() => setActiveTab('agents')} style={{ padding: '0.5rem 1rem', borderRadius: 6, border: 'none', background: activeTab === 'agents' ? colors.blue : 'transparent', color: activeTab === 'agents' ? colors.white : colors.muted, cursor: 'pointer', fontSize: '0.8rem', fontWeight: activeTab === 'agents' ? 600 : 400 }}>Agents</button>
        <button onClick={() => setActiveTab('data')} style={{ padding: '0.5rem 1rem', borderRadius: 6, border: 'none', background: activeTab === 'data' ? colors.blue : 'transparent', color: activeTab === 'data' ? colors.white : colors.muted, cursor: 'pointer', fontSize: '0.8rem', fontWeight: activeTab === 'data' ? 600 : 400 }}>Data</button>
      </div>

      {/* Controls */}
      {activeTab === 'agents' && (
      <div style={{ display: 'flex', gap: '.75rem', padding: '1rem 1.5rem', borderBottom: `1px solid ${colors.border}`, background: colors.bg2, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
          <span style={{ fontSize: '.55rem', color: colors.faint, letterSpacing: '.1em' }}>PERIOD</span>
          <select value={period} onChange={e => setPeriod(e.target.value)} style={{ padding: '.35rem .5rem', borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.bg3, color: colors.text, fontSize: '.65rem' }}>
            {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '.3rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={enableMonteCarlo} onChange={e => setEnableMonteCarlo(e.target.checked)} style={{ accentColor: colors.blue }} />
            <span style={{ fontSize: '.55rem', color: colors.faint }}>Monte Carlo</span>
          </label>
          {enableMonteCarlo && (
            <select value={mcTrials} onChange={e => setMcTrials(Number(e.target.value))} style={{ padding: '.25rem .4rem', borderRadius: 4, border: `1px solid ${colors.border}`, background: colors.bg3, color: colors.text, fontSize: '.55rem' }}>
              <option value={50}>50 runs</option>
              <option value={100}>100 runs</option>
              <option value={500}>500 runs</option>
              <option value={1000}>1000 runs</option>
            </select>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '.3rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={enableWalkForward} onChange={e => setEnableWalkForward(e.target.checked)} style={{ accentColor: colors.mint }} />
            <span style={{ fontSize: '.55rem', color: colors.faint }}>Walk-Forward</span>
          </label>
        </div>
        
        <div style={{ borderLeft: `1px solid ${colors.border}`, paddingLeft: '.75rem', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
          <span style={{ fontSize: '.55rem', color: colors.faint, letterSpacing: '.1em' }}>AGENTS</span>
          {loadingAgents ? (
            <span style={{ fontSize: '.65rem', color: colors.muted }}>Loading...</span>
          ) : (
            <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
              {agents.map((agent, idx) => (
                <button key={agent.slug} onClick={() => toggleAgent(agent.slug)} style={{ padding: '.25rem .5rem', borderRadius: 4, border: `1px solid ${selectedAgents.includes(agent.slug) ? agentColors[idx % agentColors.length] : colors.border}`, background: selectedAgents.includes(agent.slug) ? `${agentColors[idx % agentColors.length]}20` : 'transparent', color: selectedAgents.includes(agent.slug) ? agentColors[idx % agentColors.length] : colors.muted, fontSize: '.55rem', cursor: 'pointer' }}>
                  {agent.ticker || agent.slug}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Data Tab */}
      {activeTab === 'data' && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem', background: colors.bg2, borderBottom: `1px solid ${colors.border}` }}>
        <div>
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: colors.white }}>CSV Data Upload</h3>
          <p style={{ margin: '0 0 1rem', fontSize: '0.75rem', color: colors.muted }}>Upload historical price data (date, open, high, low, close, volume)</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.75rem 1.5rem', borderRadius: 8,
            border: `2px dashed ${colors.border}`,
            background: colors.bg3,
            color: colors.muted,
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: 600,
            transition: 'all 0.2s'
          }}>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => e.target.files?.[0] && handleCsvUpload(e.target.files[0])}
              style={{ display: 'none' }}
            />
            📤 Choose CSV File
          </label>
          {csvFile && <span style={{ fontSize: '0.8rem', color: colors.mint }}>{csvFile.name}</span>}
        </div>

        {csvData.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
            <div style={{ padding: '0.75rem', background: colors.bg3, borderRadius: 6, border: `1px solid ${colors.border}` }}>
              <div style={{ fontSize: '0.65rem', color: colors.faint }}>Rows</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: colors.white }}>{csvData.length}</div>
            </div>
            <div style={{ padding: '0.75rem', background: colors.bg3, borderRadius: 6, border: `1px solid ${colors.border}` }}>
              <div style={{ fontSize: '0.65rem', color: colors.faint }}>Columns</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: colors.white }}>{Object.keys(csvData[0]).length}</div>
            </div>
            <div style={{ padding: '0.75rem', background: colors.bg3, borderRadius: 6, border: `1px solid ${colors.border}` }}>
              <div style={{ fontSize: '0.65rem', color: colors.faint }}>Date Range</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: colors.white }}>{csvData[0]?.date || 'N/A'} → {csvData[csvData.length-1]?.date || 'N/A'}</div>
            </div>
          </div>
        )}

        {csvData.length > 0 && (
          <div style={{ maxHeight: 300, overflowY: 'auto', background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 8 }}>
            <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                <tr>
                  {Object.keys(csvData[0]).map(k => <th key={k} style={{ padding: '0.5rem', textAlign: 'left', color: colors.muted, fontWeight: 500 }}>{k}</th>)}
                </tr>
              </thead>
              <tbody>
                {csvData.slice(0, 10).map((row, i) => <tr key={i} style={{ borderBottom: `1px solid ${colors.border}` }}>
                  {Object.values(row).map((v: any, j) => <td key={j} style={{ padding: '0.5rem', color: colors.text }}>{typeof v === 'number' ? v.toFixed(2) : v}</td>)}
                </tr>)}
              </tbody>
            </table>
            {csvData.length > 10 && <div style={{ padding: '0.5rem', textAlign: 'center', fontSize: '0.7rem', color: colors.muted }}>... {csvData.length - 10} more rows</div>}
          </div>
        )}
      </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ margin: '1rem 1.5rem', padding: '.75rem 1rem', background: 'rgba(255,107,122,.1)', border: '1px solid rgba(255,107,122,.3)', borderRadius: 8, color: colors.red, fontSize: '.75rem' }}>
          {error}
        </div>
      )}

      {/* Main Content - Agents Tab */}
      {activeTab === 'agents' && (
      <div style={{ flex: 1, display: 'flex', gap: '1.5rem', padding: '1.5rem', overflow: 'auto' }}>
        
        {/* Chart Section */}
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* Performance Chart */}
          <div style={{ flex: 1, background: colors.bg2, border: `1px solid ${colors.border}`, borderRadius: 12, padding: '1.25rem', minHeight: 300 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 600, fontSize: '.85rem', color: colors.white }}>Performance vs Benchmarks</div>
              <div style={{ display: 'flex', gap: '1rem', fontFamily: 'var(--font-mono)', fontSize: '.55rem', flexWrap: 'wrap' }}>
                {selectedAgents.map((slug, idx) => {
                  const agent = agents.find(a => a.slug === slug)
                  return (
                    <span key={slug} style={{ color: agentColors[idx % agentColors.length] }}>
                      ● {agent?.ticker || agent?.name || slug}
                    </span>
                  )
                })}
                {Object.keys(benchmarks).map(bench => (
                  <span key={bench} style={{ color: BENCHMARKS[bench as keyof typeof BENCHMARKS]?.color || colors.muted }}>
                    ● {BENCHMARKS[bench as keyof typeof BENCHMARKS]?.label || bench}
                  </span>
                ))}
              </div>
            </div>
            
            {loading ? (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.faint }}>
                <Loader2 size={24} className="animate-spin" style={{ marginRight: 8 }} />Running backtests...
              </div>
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <XAxis dataKey="date" tick={{ fill: colors.faint, fontSize: 9 }} tickFormatter={v => v.slice(0, 5)} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: colors.faint, fontSize: 9 }} tickFormatter={v => `${v.toFixed(0)}%`} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 8, fontSize: '.65rem' }} />
                  {selectedAgents.map((slug, idx) => (
                    <Line key={slug} type="monotone" dataKey={slug} stroke={agentColors[idx % agentColors.length]} strokeWidth={2} dot={false} />
                  ))}
                  {Object.keys(benchmarks).map(bench => (
                    <Line key={bench} type="monotone" dataKey={bench} stroke={BENCHMARKS[bench as keyof typeof BENCHMARKS]?.color || colors.muted} strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.faint }}>
                Select agents and run backtest to see comparison
              </div>
            )}
          </div>
          
          {/* Drawdown Chart */}
          {results[selectedAgents[0]]?.bars && (
            <div style={{ height: 150, background: colors.bg2, border: `1px solid ${colors.border}`, borderRadius: 12, padding: '1rem' }}>
              <div style={{ fontWeight: 600, fontSize: '.75rem', color: colors.white, marginBottom: '.5rem' }}>Drawdown</div>
              <ResponsiveContainer width="100%" height={110}>
                <AreaChart data={(() => {
                  const bars = results[selectedAgents[0]]?.bars || []
                  let peak = bars[0]?.equity || 100000
                  return bars.map((b: any, i: number) => {
                    if (b.equity > peak) peak = b.equity
                    const dd = (peak - b.equity) / peak
                    return { date: b.date?.slice(5) || '', drawdown: dd * 100 }
                  })
                })()} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <XAxis dataKey="date" tick={{ fill: colors.faint, fontSize: 8 }} tickFormatter={v => v.slice(0, 5)} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: colors.faint, fontSize: 8 }} tickFormatter={v => `${v.toFixed(0)}%`} domain={['auto', 0]} />
                  <Tooltip contentStyle={{ background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 6, fontSize: '.55rem' }} />
                  <Area type="monotone" dataKey="drawdown" stroke={colors.red} fill={colors.red} fillOpacity={0.2} strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          
          {/* Monthly Returns Heatmap */}
          {results[selectedAgents[0]]?.bars && (
            <div style={{ background: colors.bg2, border: `1px solid ${colors.border}`, borderRadius: 12, padding: '1rem' }}>
              <div style={{ fontWeight: 600, fontSize: '.75rem', color: colors.white, marginBottom: '.5rem' }}>Monthly Returns</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 2 }}>
                {(() => {
                  const bars = results[selectedAgents[0]]?.bars || []
                  const monthlyData: Record<string, number[]> = {}
                  bars.forEach((b: any, i: number) => {
                    if (i === 0) return
                    const monthKey = b.date?.slice(0, 7) || ''
                    if (!monthlyData[monthKey]) monthlyData[monthKey] = []
                    const ret = (b.equity - bars[i-1]?.equity) / bars[i-1]?.equity
                    monthlyData[monthKey].push(ret)
                  })
                  const months = Object.keys(monthlyData).sort().slice(-12)
                  const monthNames = ['J','F','M','A','M','J','J','A','S','O','N','D']
                  return months.map((m, idx) => {
                    const monthRet = monthlyData[m].reduce((a: number, b: number) => a + b, 0) * 100
                    const isPos = monthRet >= 0
                    const intensity = Math.min(1, Math.abs(monthRet) / 20)
                    return (
                      <div key={m} style={{ 
                        padding: '4px 2px', 
                        borderRadius: 3, 
                        background: isPos ? `rgba(25, 230, 167, ${intensity * 0.6})` : `rgba(255, 107, 122, ${intensity * 0.6})`,
                        textAlign: 'center',
                        fontSize: '.45rem',
                        color: colors.white,
                      }}>
                        {monthNames[new Date(m + '-01').getMonth()]}
                        <div style={{ fontWeight: 600 }}>{monthRet >= 0 ? '+' : ''}{monthRet.toFixed(0)}%</div>
                      </div>
                    )
                  })
                })()}
              </div>
            </div>
          )}
        </div>

        {/* Stats Panel */}
        <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
          <div style={{ background: colors.bg2, border: `1px solid ${colors.border}`, borderRadius: 10, padding: '1rem' }}>
            <div style={{ fontSize: '.55rem', color: colors.faint, letterSpacing: '.1em', marginBottom: '.75rem' }}>PERFORMANCE SUMMARY</div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
              {selectedAgents.map((slug, idx) => {
                const agent = agents.find(a => a.slug === slug)
                const stats = results[slug]?.stats
                const isPositive = (stats?.totalReturnPct ?? 0) >= 0
                
                return (
                  <div key={slug} style={{ padding: '.6rem', background: colors.bg3, borderRadius: 8, borderLeft: `3px solid ${agentColors[idx % agentColors.length]}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.3rem' }}>
                      <span style={{ fontSize: '.7rem', fontWeight: 600, color: colors.white }}>{agent?.ticker || agent?.name || slug}</span>
                      <span style={{ fontSize: '.75rem', fontWeight: 700, color: isPositive ? colors.mint : colors.red }}>
                        {stats ? fmtPct(stats.totalReturnPct) : '—'}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.3rem', fontSize: '.5rem', color: colors.muted }}>
                      <span>Sharpe: {stats?.sharpeRatio?.toFixed(2) ?? '—'}</span>
                      <span>Max DD: {stats ? fmtPct(-stats.maxDrawdownPct) : '—'}</span>
                      <span>Trades: {stats?.totalTrades ?? '—'}</span>
                      <span>Win: {stats?.winRate ? `${stats.winRate.toFixed(0)}%` : '—'}</span>
                    </div>
                  </div>
                )
              })}
              
              {/* Benchmarks */}
              {Object.keys(benchmarks).map(bench => {
                const stats = benchmarks[bench]?.stats
                const isPositive = (stats?.totalReturnPct ?? 0) >= 0
                return (
                  <div key={bench} style={{ padding: '.5rem', background: colors.bg3, borderRadius: 6, opacity: 0.8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '.65rem', color: BENCHMARKS[bench as keyof typeof BENCHMARKS]?.color || colors.muted }}>
                        {BENCHMARKS[bench as keyof typeof BENCHMARKS]?.label || bench}
                      </span>
                      <span style={{ fontSize: '.7rem', color: isPositive ? colors.mint : colors.red }}>
                        {stats ? fmtPct(stats.totalReturnPct) : '—'}
                      </span>
                    </div>
                  </div>
                )
              })}
</div>
          
          {/* Walk-Forward Results */}
          {wfResults && (
            <div style={{ background: colors.bg2, border: `1px solid ${colors.border}`, borderRadius: 12, padding: '1rem' }}>
              <div style={{ fontWeight: 600, fontSize: '.75rem', color: colors.white, marginBottom: '.75rem' }}>Walk-Forward Analysis</div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.5rem', marginBottom: '.75rem' }}>
                <div style={{ padding: '.5rem', background: colors.bg3, borderRadius: 6, textAlign: 'center' }}>
                  <div style={{ fontSize: '.4rem', color: colors.faint }}>AVG RETURN</div>
                  <div style={{ fontSize: '.8rem', fontWeight: 700, color: (wfResults?.avgReturn ?? 0) >= 0 ? colors.mint : colors.red }}>{fmtPct(wfResults?.avgReturn ?? 0)}</div>
                </div>
                <div style={{ padding: '.5rem', background: colors.bg3, borderRadius: 6, textAlign: 'center' }}>
                  <div style={{ fontSize: '.4rem', color: colors.faint }}>AVG SHARPE</div>
                  <div style={{ fontSize: '.8rem', fontWeight: 700, color: colors.white }}>{wfResults?.avgSharpe?.toFixed(2) ?? '—'}</div>
                </div>
                <div style={{ padding: '.5rem', background: colors.bg3, borderRadius: 6, textAlign: 'center' }}>
                  <div style={{ fontSize: '.4rem', color: colors.faint }}>CONSISTENCY</div>
                  <div style={{ fontSize: '.8rem', fontWeight: 700, color: (wfResults?.consistencyRatio ?? 0) > 0.5 ? colors.mint : colors.orange }}>{((wfResults?.consistencyRatio ?? 0) * 100)?.toFixed(0) ?? '—'}%</div>
                </div>
              </div>
              
              <div style={{ fontSize: '.5rem', color: colors.faint, marginBottom: '.5rem' }}>Rolling Windows ({wfResults?.nWindows} windows)</div>
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={wfResults?.windows?.map((w: any, i: number) => ({ window: i + 1, return: w.testReturn, out: w.outperformance })) ?? []} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <XAxis dataKey="window" tick={{ fill: colors.faint, fontSize: 8 }} />
                  <YAxis tick={{ fill: colors.faint, fontSize: 8 }} tickFormatter={v => `${v.toFixed(0)}%`} />
                  <Tooltip contentStyle={{ background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 6, fontSize: '.55rem' }} />
                  <Bar dataKey="return" fill={colors.blue} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
          
          {/* Monte Carlo Results */}
          {mcResults && (
            <div style={{ background: colors.bg2, border: `1px solid ${colors.border}`, borderRadius: 10, padding: '1rem' }}>
              <div style={{ fontSize: '.55rem', color: colors.faint, letterSpacing: '.1em', marginBottom: '.75rem' }}>MONTE CARLO SIMULATION ({mcResults?.nTrials ?? mcTrials} runs)</div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
                <div style={{ padding: '.5rem', background: colors.bg3, borderRadius: 6 }}>
                  <div style={{ fontSize: '.45rem', color: colors.faint }}>MEDIAN RETURN</div>
                  <div style={{ fontSize: '.8rem', fontWeight: 700, color: (mcResults?.medianReturn ?? 0) >= 0 ? colors.mint : colors.red }}>
                    {fmtPct(mcResults?.medianReturn ?? 0)}
                  </div>
                </div>
                <div style={{ padding: '.5rem', background: colors.bg3, borderRadius: 6 }}>
                  <div style={{ fontSize: '.45rem', color: colors.faint }}>MEDIAN DRAWDOWN</div>
                  <div style={{ fontSize: '.8rem', fontWeight: 700, color: colors.red }}>
                    {fmtPct(-(mcResults?.medianMaxDrawdown ?? 0))}
                  </div>
                </div>
                <div style={{ padding: '.5rem', background: colors.bg3, borderRadius: 6 }}>
                  <div style={{ fontSize: '.45rem', color: colors.faint }}>10TH PERCENTILE</div>
                  <div style={{ fontSize: '.8rem', fontWeight: 700, color: colors.red }}>
                    {fmtPct(mcResults?.p10Return ?? 0)}
                  </div>
                </div>
                <div style={{ padding: '.5rem', background: colors.bg3, borderRadius: 6 }}>
                  <div style={{ fontSize: '.45rem', color: colors.faint }}>90TH PERCENTILE</div>
                  <div style={{ fontSize: '.8rem', fontWeight: 700, color: colors.mint }}>
                    {fmtPct(mcResults?.p90Return ?? 0)}
                  </div>
                </div>
              </div>
              
              <div style={{ marginTop: '.75rem', padding: '.5rem', background: colors.bg3, borderRadius: 6 }}>
                <div style={{ fontSize: '.45rem', color: colors.faint, marginBottom: '.3rem' }}>BEAT BUY-AND-HOLD RATE</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                  <div style={{ flex: 1, height: 6, background: colors.bg, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${((mcResults?.beatRate ?? 0) * 100)}%`, height: '100%', background: colors.mint }} />
                  </div>
                  <span style={{ fontSize: '.65rem', color: colors.muted }}>{((mcResults?.beatRate ?? 0) * 100).toFixed(1)}%</span>
                </div>
              </div>
            </div>
          )}

          {/* Deploy Button */}
          {Object.keys(results).length > 0 && (
            <button onClick={() => router.push(`/agents/submit?symbol=${symbol}&strategy=${strategy}`)} style={{ padding: '.75rem', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #19E6A7, #10b981)', color: colors.bg, fontSize: '.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <TrendingUp size={16} />Deploy Agent
            </button>
          )}
          
          {Object.keys(results).length > 0 && period === '1y' && (
            <div style={{ padding: '.6rem', background: 'rgba(91,140,255,.06)', border: '1px solid rgba(91,140,255,.12)', borderRadius: 8, fontSize: '.55rem', color: colors.muted }}>
              1 year backtest records trades to ledger for live tracking
            </div>
          )}

          {/* Scorecard */}
          {results[selectedAgents[0]]?.stats && (
            <div style={{ background: colors.bg2, border: `1px solid ${colors.border}`, borderRadius: 10, padding: '1rem' }}>
              <div style={{ fontSize: '.55rem', color: colors.faint, letterSpacing: '.1em', marginBottom: '.75rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Shield size={12} />STRATEGY SCORECARD
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem', marginBottom: '.75rem' }}>
                {(() => {
                  const stats = results[selectedAgents[0]]?.stats
                  const cagr = stats?.annualizedReturnPct ?? 0
                  const sharpe = stats?.sharpeRatio ?? 0
                  const sortino = stats?.sortinoRatio ?? 0
                  const pf = stats?.profitFactor ?? 0
                  
                  const perfScore = 100 * (
                    0.30 * Math.min(1, Math.max(0, cagr / 30)) +
                    0.30 * Math.min(1, Math.max(0, sharpe / 2.5)) +
                    0.20 * Math.min(1, Math.max(0, sortino / 3.5)) +
                    0.20 * Math.min(1, Math.max(0, (pf - 1) / 1.5))
                  )
                  
                  const maxDD = Math.abs(stats?.maxDrawdownPct ?? 0)
                  const calmar = stats?.calmarRatio ?? 0
                  const downVol = stats?.downsideVolatility ?? 0
                  
                  const riskScore = 100 * (
                    0.45 * Math.min(1, Math.max(0, 1 - (maxDD - 5) / 35)) +
                    0.35 * Math.min(1, Math.max(0, calmar / 2.5)) +
                    0.20 * Math.min(1, Math.max(0, 1 - (downVol - 0.05) / 0.30))
                  )
                  
                  const posMonth = stats?.positiveMonthRatio ?? 0
                  const rollSharpeMean = stats?.rolling63dSharpeMean ?? 0
                  const rollSharpeStd = stats?.rolling63dSharpeStd ?? 0
                  
                  const robustScore = 100 * (
                    0.40 * Math.min(1, Math.max(0, rollSharpeMean / 2)) +
                    0.30 * Math.min(1, Math.max(0, (posMonth - 40) / 50)) +
                    0.30 * Math.min(1, Math.max(0, 1 - rollSharpeStd))
                  )
                  
                  const trades = stats?.totalTrades ?? 0
                  const turnover = stats?.turnover ?? 0
                  
                  const execScore = 100 * (
                    0.35 * Math.min(1, Math.max(0, (trades - 10) / 90)) +
                    0.30 * Math.min(1, Math.max(0, 1 - (turnover - 1) / 19)) +
                    0.35 * 0.8
                  )
                  
                  const composite = 0.30 * perfScore + 0.25 * riskScore + 0.30 * robustScore + 0.15 * execScore
                  
                  const getGrade = (s: number) => s >= 90 ? 'A' : s >= 80 ? 'B' : s >= 70 ? 'C' : s >= 60 ? 'D' : 'F'
                  const grade = getGrade(composite)
                  
                  return (
                    <>
                      <div style={{ padding: '.5rem', background: colors.bg3, borderRadius: 6, textAlign: 'center' }}>
                        <div style={{ fontSize: '.45rem', color: colors.faint, marginBottom: 4 }}>PERFORMANCE</div>
                        <div style={{ fontSize: '.9rem', fontWeight: 700, color: colors.blue }}>{perfScore.toFixed(0)}</div>
                      </div>
                      <div style={{ padding: '.5rem', background: colors.bg3, borderRadius: 6, textAlign: 'center' }}>
                        <div style={{ fontSize: '.45rem', color: colors.faint, marginBottom: 4 }}>RISK</div>
                        <div style={{ fontSize: '.9rem', fontWeight: 700, color: colors.orange }}>{riskScore.toFixed(0)}</div>
                      </div>
                      <div style={{ padding: '.5rem', background: colors.bg3, borderRadius: 6, textAlign: 'center' }}>
                        <div style={{ fontSize: '.45rem', color: colors.faint, marginBottom: 4 }}>ROBUSTNESS</div>
                        <div style={{ fontSize: '.9rem', fontWeight: 700, color: colors.mint }}>{robustScore.toFixed(0)}</div>
                      </div>
                      <div style={{ padding: '.5rem', background: colors.bg3, borderRadius: 6, textAlign: 'center' }}>
                        <div style={{ fontSize: '.45rem', color: colors.faint, marginBottom: 4 }}>EXECUTION</div>
                        <div style={{ fontSize: '.9rem', fontWeight: 700, color: colors.text }}>{execScore.toFixed(0)}</div>
                      </div>
                    </>
                  )
                })()}
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem', padding: '.6rem', background: colors.bg3, borderRadius: 6 }}>
                <span style={{ fontSize: '.45rem', color: colors.faint }}>COMPOSITE SCORE</span>
                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: colors.white }}>
                  {(() => {
                    const stats = results[selectedAgents[0]]?.stats
                    const cagr = stats?.annualizedReturnPct ?? 0
                    const sharpe = stats?.sharpeRatio ?? 0
                    const sortino = stats?.sortinoRatio ?? 0
                    const pf = stats?.profitFactor ?? 0
                    const perfScore = 100 * (0.30 * Math.min(1, Math.max(0, cagr / 30)) + 0.30 * Math.min(1, Math.max(0, sharpe / 2.5)) + 0.20 * Math.min(1, Math.max(0, sortino / 3.5)) + 0.20 * Math.min(1, Math.max(0, (pf - 1) / 1.5)))
                    const maxDD = Math.abs(stats?.maxDrawdownPct ?? 0)
                    const calmar = stats?.calmarRatio ?? 0
                    const downVol = stats?.downsideVolatility ?? 0
                    const riskScore = 100 * (0.45 * Math.min(1, Math.max(0, 1 - (maxDD - 5) / 35)) + 0.35 * Math.min(1, Math.max(0, calmar / 2.5)) + 0.20 * Math.min(1, Math.max(0, 1 - (downVol - 0.05) / 0.30)))
                    const posMonth = stats?.positiveMonthRatio ?? 0
                    const rollSharpeMean = stats?.rolling63dSharpeMean ?? 0
                    const rollSharpeStd = stats?.rolling63dSharpeStd ?? 0
                    const robustScore = 100 * (0.40 * Math.min(1, Math.max(0, rollSharpeMean / 2)) + 0.30 * Math.min(1, Math.max(0, (posMonth - 40) / 50)) + 0.30 * Math.min(1, Math.max(0, 1 - rollSharpeStd)))
                    const trades = stats?.totalTrades ?? 0
                    const turnover = stats?.turnover ?? 0
                    const execScore = 100 * (0.35 * Math.min(1, Math.max(0, (trades - 10) / 90)) + 0.30 * Math.min(1, Math.max(0, 1 - (turnover - 1) / 19)) + 0.35 * 0.8)
                    return (0.30 * perfScore + 0.25 * riskScore + 0.30 * robustScore + 0.15 * execScore).toFixed(0)
                  })()}
                </span>
                <span style={{ fontSize: '.9rem', fontWeight: 700, color: colors.mint, padding: '2px 8px', background: `${colors.mint}20`, borderRadius: 4 }}>
                  {(() => {
                    const stats = results[selectedAgents[0]]?.stats
                    const cagr = stats?.annualizedReturnPct ?? 0
                    const sharpe = stats?.sharpeRatio ?? 0
                    const sortino = stats?.sortinoRatio ?? 0
                    const pf = stats?.profitFactor ?? 0
                    const perfScore = 100 * (0.30 * Math.min(1, Math.max(0, cagr / 30)) + 0.30 * Math.min(1, Math.max(0, sharpe / 2.5)) + 0.20 * Math.min(1, Math.max(0, sortino / 3.5)) + 0.20 * Math.min(1, Math.max(0, (pf - 1) / 1.5)))
                    const maxDD = Math.abs(stats?.maxDrawdownPct ?? 0)
                    const calmar = stats?.calmarRatio ?? 0
                    const downVol = stats?.downsideVolatility ?? 0
                    const riskScore = 100 * (0.45 * Math.min(1, Math.max(0, 1 - (maxDD - 5) / 35)) + 0.35 * Math.min(1, Math.max(0, calmar / 2.5)) + 0.20 * Math.min(1, Math.max(0, 1 - (downVol - 0.05) / 0.30)))
                    const posMonth = stats?.positiveMonthRatio ?? 0
                    const rollSharpeMean = stats?.rolling63dSharpeMean ?? 0
                    const rollSharpeStd = stats?.rolling63dSharpeStd ?? 0
                    const robustScore = 100 * (0.40 * Math.min(1, Math.max(0, rollSharpeMean / 2)) + 0.30 * Math.min(1, Math.max(0, (posMonth - 40) / 50)) + 0.30 * Math.min(1, Math.max(0, 1 - rollSharpeStd)))
                    const trades = stats?.totalTrades ?? 0
                    const turnover = stats?.turnover ?? 0
                    const execScore = 100 * (0.35 * Math.min(1, Math.max(0, (trades - 10) / 90)) + 0.30 * Math.min(1, Math.max(0, 1 - (turnover - 1) / 19)) + 0.35 * 0.8)
                    const composite = 0.30 * perfScore + 0.25 * riskScore + 0.30 * robustScore + 0.15 * execScore
                    return composite >= 90 ? 'A' : composite >= 80 ? 'B' : composite >= 70 ? 'C' : composite >= 60 ? 'D' : 'F'
                  })()}
                </span>
              </div>
            </div>
          )}

          {/* Extended Metrics */}
          {results[selectedAgents[0]]?.stats && (
            <div style={{ background: colors.bg2, border: `1px solid ${colors.border}`, borderRadius: 10, padding: '1rem' }}>
              <div style={{ fontSize: '.55rem', color: colors.faint, letterSpacing: '.1em', marginBottom: '.75rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Activity size={12} />EXTENDED METRICS
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem' }}>
                {(() => {
                  const s = results[selectedAgents[0]]?.stats
                  return (
                    <>
                      <div style={{ fontSize: '.5rem', color: colors.muted }}>CAGR</div>
                      <div style={{ fontSize: '.5rem', color: colors.white, textAlign: 'right' }}>{fmtPct(s?.annualizedReturnPct)}</div>
                      <div style={{ fontSize: '.5rem', color: colors.muted }}>Total Return</div>
                      <div style={{ fontSize: '.5rem', color: colors.white, textAlign: 'right' }}>{fmtPct(s?.totalReturnPct)}</div>
                      <div style={{ fontSize: '.5rem', color: colors.muted }}>Sortino</div>
                      <div style={{ fontSize: '.5rem', color: colors.white, textAlign: 'right' }}>{s?.sortinoRatio?.toFixed(2)}</div>
                      <div style={{ fontSize: '.5rem', color: colors.muted }}>Calmar</div>
                      <div style={{ fontSize: '.5rem', color: colors.white, textAlign: 'right' }}>{s?.calmarRatio?.toFixed(2)}</div>
                      <div style={{ fontSize: '.5rem', color: colors.muted }}>Max DD</div>
                      <div style={{ fontSize: '.5rem', color: colors.red, textAlign: 'right' }}>{fmtPct(-s?.maxDrawdownPct)}</div>
                      <div style={{ fontSize: '.5rem', color: colors.muted }}>Avg DD</div>
                      <div style={{ fontSize: '.5rem', color: colors.red, textAlign: 'right' }}>{fmtPct(-s?.averageDrawdownPct)}</div>
                      <div style={{ fontSize: '.5rem', color: colors.muted }}>Downside Vol</div>
                      <div style={{ fontSize: '.5rem', color: colors.white, textAlign: 'right' }}>{(s?.downsideVolatility * 100)?.toFixed(2)}%</div>
                      <div style={{ fontSize: '.5rem', color: colors.muted }}>Win Rate</div>
                      <div style={{ fontSize: '.5rem', color: colors.white, textAlign: 'right' }}>{s?.winRate?.toFixed(1)}%</div>
                      <div style={{ fontSize: '.5rem', color: colors.muted }}>Profit Factor</div>
                      <div style={{ fontSize: '.5rem', color: colors.white, textAlign: 'right' }}>{s?.profitFactor?.toFixed(2)}</div>
                      <div style={{ fontSize: '.5rem', color: colors.muted }}>Exposure</div>
                      <div style={{ fontSize: '.5rem', color: colors.white, textAlign: 'right' }}>{s?.exposureTime?.toFixed(1)}%</div>
                      <div style={{ fontSize: '.5rem', color: colors.muted }}>Turnover</div>
                      <div style={{ fontSize: '.5rem', color: colors.white, textAlign: 'right' }}>{s?.turnover?.toFixed(1)}x</div>
                      <div style={{ fontSize: '.5rem', color: colors.muted }}>Pos. Months</div>
                      <div style={{ fontSize: '.5rem', color: colors.white, textAlign: 'right' }}>{s?.positiveMonthRatio?.toFixed(1)}%</div>
                      <div style={{ fontSize: '.5rem', color: colors.muted }}>Roll Sharpe (63d)</div>
                      <div style={{ fontSize: '.5rem', color: colors.white, textAlign: 'right' }}>{s?.rolling63dSharpeMean?.toFixed(2)} ± {s?.rolling63dSharpeStd?.toFixed(2)}</div>
                    </>
                  )
                })()}
              </div>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  )
}
