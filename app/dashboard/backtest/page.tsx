'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, BarChart, Bar } from 'recharts'
import { Loader2, Play, TrendingUp, Activity, Shield, BookOpen, AlertCircle, FileText, Plus, X, ChevronDown, Zap, BarChart3, Target, Layers, HelpCircle, ArrowRight, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { PERIODS, BENCHMARKS, BACKTEST_STRATEGIES } from '@/lib/backtest-config'

interface AgentData {
  slug: string
  name: string
  ticker: string | null
  primary_symbol: string | null
  backtest_strategy: string | null
  backtest_stats: any
}

type TabId = 'overview' | 'compare' | 'robustness' | 'agents'

export default function BacktestComparePage() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [agents, setAgents] = useState<AgentData[]>([])
  const [loadingAgents, setLoadingAgents] = useState(true)
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [symbol, setSymbol] = useState(searchParams.get('symbol') || 'BTC-USD')
  const [strategy, setStrategy] = useState(searchParams.get('strategy') || 'momentum_crossover')
  const [period, setPeriod] = useState('1y')
  const [feeBps, setFeeBps] = useState(10)
  const [slippageBps, setSlippageBps] = useState(3)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<Record<string, any>>({})
  const [benchmarks, setBenchmarks] = useState<Record<string, any>>({})
  const [error, setError] = useState('')
  const [enableMonteCarlo, setEnableMonteCarlo] = useState(false)
  const [enableWalkForward, setEnableWalkForward] = useState(false)
  const [mcTrials, setMcTrials] = useState(100)
  const [mcResults, setMcResults] = useState<any>(null)
  const [wfResults, setWfResults] = useState<any>(null)
  const [showReport, setShowReport] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [showStrategyPicker, setShowStrategyPicker] = useState(false)

  const toBacktestSymbol = (value: string) => value.replace(/\//g, '-')

  const colors = {
    bg: '#06111F', bg2: '#0B1728', bg3: '#101A2D', border: '#1E2A3D',
    blue: '#4F8CFF', blue2: '#6BA3FF', mint: '#16C784', red: '#FF5468', orange: '#F5B942',
    text: '#B7C4D5', muted: '#7F8CA3', faint: '#55657A', white: '#F7FAFF',
  }

  const agentColors = ['#5B8CFF', '#19E6A7', '#FFB648', '#FF6B7A', '#8B5CF6', '#F472B6', '#34D399', '#FBBF24']

  useEffect(() => {
    async function fetchAgents() {
      try {
        const res = await fetch('/api/agents')
        const json = await res.json()
        const agentsData = json.data || json.agents || []
        const mappedAgents: AgentData[] = agentsData.map((a: any) => ({
          slug: a.slug,
          name: a.name,
          ticker: a.ticker,
          primary_symbol: toBacktestSymbol(a.primary_symbol || 'BTC-USD'),
          backtest_strategy: a.backtest_strategy || 'momentum_crossover',
          backtest_stats: a.backtest_stats,
        }))
        setAgents(mappedAgents)
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

  const runBacktest = useCallback(async () => {
    setLoading(true)
    setError('')
    setResults({})
    setBenchmarks({})
    try {
      const newResults: Record<string, any> = {}
      const newBenchmarks: Record<string, any> = {}
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
            fee: feeBps / 10000,
            slippage: slippageBps / 10000,
            agent_slug: slug,
          }),
        })
        const data = await res.json()
        if (!res.ok || data.error) return
        newResults[slug] = data
      })
      await Promise.all(agentPromises)
      setResults(newResults)

      const benchSymbols = ['BTC-USD', 'ETH-USD', 'SOL-USD'].filter(s => s !== symbol)
      const benchPromises = benchSymbols.map(async (bench) => {
        try {
          const bRes = await fetch('/api/backtest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol: bench, strategy: 'momentum_crossover', period, fee: feeBps / 10000, slippage: slippageBps / 10000 }),
          })
          const bData = await bRes.json()
          if (bRes.ok && !bData.error) newBenchmarks[bench] = bData
        } catch {}
      })
      await Promise.all(benchPromises)
      setBenchmarks(newBenchmarks)

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
                period, fee: feeBps / 10000, slippage: slippageBps / 10000,
                monteCarlo: true, nTrials: mcTrials, windowDays: 30,
              }),
            })
            const mcData = await mcRes.json()
            if (mcRes.ok && mcData.monteCarlo) setMcResults(mcData.monteCarlo)
          } catch (e) { console.error('Monte Carlo failed:', e) }
        }
      }

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
                period, fee: feeBps / 10000, slippage: slippageBps / 10000,
                walkForward: true, trainDays: 252, testDays: 63,
              }),
            })
            const wfData = await wfRes.json()
            if (wfRes.ok && wfData.walkForward) setWfResults(wfData.walkForward)
          } catch (e) { console.error('Walk-forward failed:', e) }
        }
      }
    } catch (e: any) {
      setError(e.message || 'Backtest failed')
    }
    setLoading(false)
  }, [selectedAgents, agents, symbol, strategy, period, feeBps, slippageBps, enableMonteCarlo, enableWalkForward, mcTrials])

  useEffect(() => {
    if (!loadingAgents && selectedAgents.length > 0) runBacktest()
  }, [loadingAgents])

  useEffect(() => {
    if (!loading) { setElapsed(0); return }
    const start = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500)
    return () => clearInterval(id)
  }, [loading])

  const estimateSeconds = () => {
    const periodMap: Record<string, number> = { '14d': 2, '30d': 3, '90d': 5, '180d': 8, '270d': 11, '1y': 14, '2y': 22, '5y': 45 }
    return Math.ceil((periodMap[period] || 10) * Math.max(1, selectedAgents.length) * (enableMonteCarlo ? 1 + mcTrials / 50 : 1) * (enableWalkForward ? 2.5 : 1))
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
      selectedAgents.forEach(slug => {
        if (results[slug]?.bars?.[i]) {
          point[slug] = ((results[slug].bars[i].equity - startEquity) / startEquity) * 100
        }
      })
      Object.keys(benchmarks).forEach(bench => {
        if (benchmarks[bench]?.bars?.[i]) {
          point[bench] = ((benchmarks[bench].bars[i].equity - startEquity) / startEquity) * 100
        }
      })
      return point
    })
  }, [results, benchmarks, selectedAgents])

  const fmtPct = (v: number) => v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '\u2014'
  const fmtNum = (v: number, d = 2) => v != null ? v.toFixed(d) : '\u2014'

  const computeScorecard = (stats: any) => {
    if (!stats) return null
    const cagr = stats.annualizedReturnPct ?? 0
    const sharpe = stats.sharpeRatio ?? 0
    const sortino = stats.sortinoRatio ?? 0
    const pf = stats.profitFactor ?? 0
    const perfScore = 100 * (0.30 * Math.min(1, Math.max(0, cagr / 30)) + 0.30 * Math.min(1, Math.max(0, sharpe / 2.5)) + 0.20 * Math.min(1, Math.max(0, sortino / 3.5)) + 0.20 * Math.min(1, Math.max(0, (pf - 1) / 1.5)))
    const maxDD = Math.abs(stats.maxDrawdownPct ?? 0)
    const calmar = stats.calmarRatio ?? 0
    const downVol = stats.downsideVolatility ?? 0
    const riskScore = 100 * (0.45 * Math.min(1, Math.max(0, 1 - (maxDD - 5) / 35)) + 0.35 * Math.min(1, Math.max(0, calmar / 2.5)) + 0.20 * Math.min(1, Math.max(0, 1 - (downVol - 0.05) / 0.30)))
    const posMonth = stats.positiveMonthRatio ?? 0
    const rollSharpeMean = stats.rolling63dSharpeMean ?? 0
    const rollSharpeStd = stats.rolling63dSharpeStd ?? 0
    const robustScore = 100 * (0.40 * Math.min(1, Math.max(0, rollSharpeMean / 2)) + 0.30 * Math.min(1, Math.max(0, (posMonth - 40) / 50)) + 0.30 * Math.min(1, Math.max(0, 1 - rollSharpeStd)))
    const trades = stats.totalTrades ?? 0
    const turnover = stats.turnover ?? 0
    const execScore = 100 * (0.35 * Math.min(1, Math.max(0, (trades - 10) / 90)) + 0.30 * Math.min(1, Math.max(0, 1 - (turnover - 1) / 19)) + 0.35 * 0.8)
    const composite = 0.30 * perfScore + 0.25 * riskScore + 0.30 * robustScore + 0.15 * execScore
    const getGrade = (s: number) => s >= 93 ? 'A+' : s >= 85 ? 'A' : s >= 78 ? 'B+' : s >= 70 ? 'B' : s >= 60 ? 'C' : s >= 50 ? 'D' : 'F'
    return { perfScore, riskScore, robustScore, execScore, composite, grade: getGrade(composite) }
  }

  const tabs: { id: TabId; label: string; icon: any }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'compare', label: 'Compare', icon: Layers },
    { id: 'robustness', label: 'Robustness', icon: Target },
    { id: 'agents', label: 'Agents', icon: Zap },
  ]

  const hasResults = Object.keys(results).length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: colors.bg, color: colors.text }}>

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.5rem', borderBottom: `1px solid ${colors.border}`, background: colors.bg2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, rgba(79,140,255,.2), rgba(22,199,132,.15))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BarChart3 size={16} style={{ color: colors.blue }} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.1rem', fontWeight: 700, color: colors.white, margin: 0 }}>Backtest Studio</h1>
            <p style={{ fontSize: '.65rem', color: colors.muted, margin: '2px 0 0' }}>Run, compare, and validate strategies before deploying live</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {loading && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: colors.muted, textAlign: 'right' }}>
              <div>{elapsed}s elapsed</div>
              <div style={{ color: colors.faint }}>~{estimateSeconds()}s est.</div>
            </div>
          )}
          {hasResults && !loading && (
            <button onClick={() => setShowReport(true)} style={{ padding: '.35rem .7rem', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bg3, color: colors.muted, fontSize: '.65rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <FileText size={12} />Report
            </button>
          )}
          <Link href="/dashboard/backtest/guide" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '.35rem .6rem', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bg3, color: colors.faint, fontSize: '.6rem', textDecoration: 'none' }}>
            <HelpCircle size={12} />Guide
          </Link>
          <button onClick={runBacktest} disabled={loading || selectedAgents.length === 0} style={{ padding: '.4rem 1rem', borderRadius: 8, border: 'none', background: loading ? colors.bg3 : `linear-gradient(135deg, ${colors.blue}, #3B7BEE)`, color: '#fff', fontSize: '.7rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 5, boxShadow: loading ? 'none' : `0 2px 12px ${colors.blue}40` }}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {loading ? 'Running...' : 'Run Backtest'}
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', gap: '.5rem', padding: '0.6rem 1.5rem', borderBottom: `1px solid ${colors.border}`, background: `${colors.bg2}EE` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <span style={{ fontSize: '.55rem', color: colors.faint, letterSpacing: '.08em', fontFamily: 'var(--font-mono)' }}>PERIOD</span>
          <select value={period} onChange={e => setPeriod(e.target.value)} style={{ padding: '.3rem .5rem', borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.bg3, color: colors.text, fontSize: '.65rem' }}>
            {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <span style={{ fontSize: '.55rem', color: colors.faint, letterSpacing: '.08em', fontFamily: 'var(--font-mono)' }}>FEE</span>
          <input type="number" value={feeBps} onChange={e => setFeeBps(Number(e.target.value))} min={0} max={100} step={1} style={{ width: 50, padding: '.25rem .4rem', borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.bg3, color: colors.text, fontSize: '.65rem', textAlign: 'center' }} />
          <span style={{ fontSize: '.5rem', color: colors.faint }}>bps</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <span style={{ fontSize: '.55rem', color: colors.faint, letterSpacing: '.08em', fontFamily: 'var(--font-mono)' }}>SLIPPAGE</span>
          <input type="number" value={slippageBps} onChange={e => setSlippageBps(Number(e.target.value))} min={0} max={50} step={1} style={{ width: 50, padding: '.25rem .4rem', borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.bg3, color: colors.text, fontSize: '.65rem', textAlign: 'center' }} />
          <span style={{ fontSize: '.5rem', color: colors.faint }}>bps</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '.3rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={enableMonteCarlo} onChange={e => setEnableMonteCarlo(e.target.checked)} style={{ accentColor: colors.blue }} />
            <span style={{ fontSize: '.55rem', color: colors.faint }}>Monte Carlo</span>
          </label>
          {enableMonteCarlo && (
            <select value={mcTrials} onChange={e => setMcTrials(Number(e.target.value))} style={{ padding: '.2rem .35rem', borderRadius: 4, border: `1px solid ${colors.border}`, background: colors.bg3, color: colors.text, fontSize: '.5rem' }}>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={500}>500</option>
              <option value={1000}>1000</option>
            </select>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: '.3rem', cursor: 'pointer', marginLeft: '.5rem' }}>
            <input type="checkbox" checked={enableWalkForward} onChange={e => setEnableWalkForward(e.target.checked)} style={{ accentColor: colors.mint }} />
            <span style={{ fontSize: '.55rem', color: colors.faint }}>Walk-Forward</span>
          </label>
        </div>
        <div style={{ borderLeft: `1px solid ${colors.border}`, paddingLeft: '.5rem', display: 'flex', alignItems: 'center', gap: '.3rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '.55rem', color: colors.faint, letterSpacing: '.08em', fontFamily: 'var(--font-mono)' }}>AGENTS</span>
          {loadingAgents ? (
            <span style={{ fontSize: '.6rem', color: colors.muted }}>Loading...</span>
          ) : (
            agents.slice(0, 6).map((agent, idx) => (
              <button key={agent.slug} onClick={() => toggleAgent(agent.slug)} style={{ padding: '.2rem .45rem', borderRadius: 4, border: `1px solid ${selectedAgents.includes(agent.slug) ? agentColors[idx % agentColors.length] : colors.border}`, background: selectedAgents.includes(agent.slug) ? `${agentColors[idx % agentColors.length]}20` : 'transparent', color: selectedAgents.includes(agent.slug) ? agentColors[idx % agentColors.length] : colors.muted, fontSize: '.5rem', cursor: 'pointer' }}>
                {agent.ticker || agent.slug}
              </button>
            ))
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '.5rem', padding: '0 1.5rem', borderBottom: `1px solid ${colors.border}` }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ display: 'flex', alignItems: 'center', gap: '.35rem', padding: '.55rem .8rem', border: 'none', borderBottom: activeTab === tab.id ? `2px solid ${colors.blue}` : '2px solid transparent', background: 'transparent', color: activeTab === tab.id ? colors.white : colors.muted, fontSize: '.72rem', fontWeight: activeTab === tab.id ? 600 : 400, cursor: 'pointer' }}>
            <tab.icon size={13} />
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ margin: '0.75rem 1.5rem', padding: '.6rem .8rem', background: 'rgba(255,107,122,.1)', border: '1px solid rgba(255,107,122,.3)', borderRadius: 8, color: colors.red, fontSize: '.72rem', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
          <AlertCircle size={14} />{error}
        </div>
      )}

      {showReport && results[selectedAgents[0]]?.stats && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }} onClick={() => setShowReport(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: colors.bg2, border: `1px solid ${colors.border}`, borderRadius: 16, padding: '2rem', width: 640, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: colors.white }}>Full Backtest Report</div>
                <div style={{ fontSize: '0.65rem', color: colors.muted, marginTop: 2 }}>{period}  |  Fee: {feeBps}bps  |  Slippage: {slippageBps}bps  |  {selectedAgents.length} agent{selectedAgents.length !== 1 ? 's' : ''}</div>
              </div>
              <button onClick={() => setShowReport(false)} style={{ background: 'none', border: 'none', color: colors.faint, cursor: 'pointer', fontSize: '1.2rem' }}>\u2715</button>
            </div>
            {selectedAgents.map((slug, idx) => {
              const agent = agents.find(a => a.slug === slug)
              const s = results[slug]?.stats
              if (!s) return null
              return (
                <div key={slug} style={{ marginBottom: '1.5rem', padding: '1rem', background: colors.bg3, borderRadius: 12, borderLeft: `3px solid ${agentColors[idx % agentColors.length]}` }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: colors.white, marginBottom: '1rem' }}>{agent?.name || slug} ({agent?.ticker || slug})</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                    {[
                      ['Total Return', fmtPct(s.totalReturnPct), (s.totalReturnPct ?? 0) >= 0 ? colors.mint : colors.red],
                      ['CAGR', fmtPct(s.annualizedReturnPct), (s.annualizedReturnPct ?? 0) >= 0 ? colors.mint : colors.red],
                      ['Sharpe', fmtNum(s.sharpeRatio, 3), colors.blue2],
                      ['Sortino', fmtNum(s.sortinoRatio, 3), colors.blue2],
                      ['Calmar', fmtNum(s.calmarRatio, 3), colors.blue2],
                      ['Max DD', fmtPct(-s.maxDrawdownPct), colors.red],
                      ['Avg DD', fmtPct(-s.averageDrawdownPct), colors.orange],
                      ['Downside Vol', `${(s.downsideVolatility * 100)?.toFixed(2)}%`, colors.text],
                      ['Win Rate', `${s.winRate?.toFixed(1)}%`, colors.text],
                      ['Profit Factor', fmtNum(s.profitFactor, 3), colors.text],
                      ['Trades', String(s.totalTrades), colors.text],
                      ['Exposure', `${s.exposureTime?.toFixed(1)}%`, colors.text],
                      ['Turnover', `${s.turnover?.toFixed(2)}x`, colors.text],
                      ['Pos. Months', `${s.positiveMonthRatio?.toFixed(1)}%`, colors.text],
                      ['Roll Sharpe', `${s.rolling63dSharpeMean?.toFixed(3)} \u00b1 ${s.rolling63dSharpeStd?.toFixed(3)}`, colors.text],
                    ].map(([label, val, color]) => (
                      <div key={label as string} style={{ padding: '0.5rem', background: colors.bg, borderRadius: 6 }}>
                        <div style={{ fontSize: '0.48rem', color: colors.faint, marginBottom: 3, letterSpacing: '0.04em' }}>{label as string}</div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: color as string }}>{val ?? '\u2014'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
            {mcResults && (
              <div style={{ padding: '1rem', background: colors.bg3, borderRadius: 12, marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: colors.white, marginBottom: '0.75rem' }}>Monte Carlo ({mcResults.nTrials} trials)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                  {[
                    ['Median Return', fmtPct(mcResults.medianReturn), (mcResults.medianReturn ?? 0) >= 0 ? colors.mint : colors.red],
                    ['p10 Return', fmtPct(mcResults.p10Return), colors.red],
                    ['p90 Return', fmtPct(mcResults.p90Return), colors.mint],
                    ['Median Max DD', fmtPct(-(mcResults.medianMaxDrawdown ?? 0)), colors.orange],
                    ['Beat B&H Rate', `${((mcResults.beatRate ?? 0) * 100).toFixed(1)}%`, colors.blue2],
                  ].map(([label, val, color]) => (
                    <div key={label as string} style={{ padding: '0.5rem', background: colors.bg, borderRadius: 6 }}>
                      <div style={{ fontSize: '0.48rem', color: colors.faint }}>{label as string}</div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: color as string }}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {wfResults && (
              <div style={{ padding: '1rem', background: colors.bg3, borderRadius: 12 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: colors.white, marginBottom: '0.75rem' }}>Walk-Forward ({wfResults.nWindows} windows)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                  {[
                    ['Avg Return', fmtPct(wfResults.avgReturn), (wfResults.avgReturn ?? 0) >= 0 ? colors.mint : colors.red],
                    ['Avg Sharpe', fmtNum(wfResults.avgSharpe, 3), colors.blue2],
                    ['Consistency', `${((wfResults.consistencyRatio ?? 0) * 100).toFixed(1)}%`, colors.mint],
                  ].map(([label, val, color]) => (
                    <div key={label as string} style={{ padding: '0.5rem', background: colors.bg, borderRadius: 6 }}>
                      <div style={{ fontSize: '0.48rem', color: colors.faint }}>{label as string}</div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: color as string }}>{val ?? '\u2014'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', gap: '1rem', padding: '1rem 1.5rem', overflow: 'auto' }}>

        {activeTab === 'overview' && (
          <>
            <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
              <div style={{ flex: 1, background: colors.bg2, border: `1px solid ${colors.border}`, borderRadius: 12, padding: '1rem', minHeight: 280 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '.82rem', color: colors.white }}>Performance</div>
                  <div style={{ display: 'flex', gap: '.75rem', fontFamily: 'var(--font-mono)', fontSize: '.5rem', flexWrap: 'wrap' }}>
                    {selectedAgents.map((slug, idx) => {
                      const agent = agents.find(a => a.slug === slug)
                      return <span key={slug} style={{ color: agentColors[idx % agentColors.length] }}>\u25CF {agent?.ticker || agent?.name || slug}</span>
                    })}
                    {Object.keys(benchmarks).map(bench => (
                      <span key={bench} style={{ color: BENCHMARKS[bench as keyof typeof BENCHMARKS]?.color || colors.muted }}>\u25CF {BENCHMARKS[bench as keyof typeof BENCHMARKS]?.label || bench}</span>
                    ))}
                  </div>
                </div>
                {loading ? (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.faint }}>
                    <Loader2 size={24} className="animate-spin" style={{ marginRight: 8 }} />Running backtests...
                  </div>
                ) : chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                      <XAxis dataKey="date" tick={{ fill: colors.faint, fontSize: 9 }} tickFormatter={v => v.slice(0, 5)} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: colors.faint, fontSize: 9 }} tickFormatter={v => `${v.toFixed(0)}%`} domain={['auto', 'auto']} />
                      <Tooltip contentStyle={{ background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 8, fontSize: '.62rem' }} />
                      {selectedAgents.map((slug, idx) => (
                        <Line key={slug} type="monotone" dataKey={slug} stroke={agentColors[idx % agentColors.length]} strokeWidth={2} dot={false} />
                      ))}
                      {Object.keys(benchmarks).map(bench => (
                        <Line key={bench} type="monotone" dataKey={bench} stroke={BENCHMARKS[bench as keyof typeof BENCHMARKS]?.color || colors.muted} strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: colors.faint, gap: '.5rem' }}>
                    <BarChart3 size={32} style={{ opacity: 0.3 }} />
                    <span style={{ fontSize: '.72rem' }}>Select agents and run a backtest to see results</span>
                  </div>
                )}
              </div>

              {results[selectedAgents[0]]?.bars && (
                <div style={{ height: 130, background: colors.bg2, border: `1px solid ${colors.border}`, borderRadius: 12, padding: '.75rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '.7rem', color: colors.white, marginBottom: '.35rem' }}>Drawdown</div>
                  <ResponsiveContainer width="100%" height={95}>
                    <AreaChart data={(() => {
                      const bars = results[selectedAgents[0]]?.bars || []
                      let peak = bars[0]?.equity || 100000
                      return bars.map((b: any) => {
                        if (b.equity > peak) peak = b.equity
                        return { date: b.date?.slice(5) || '', drawdown: ((peak - b.equity) / peak) * 100 }
                      })
                    })()} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                      <XAxis dataKey="date" tick={{ fill: colors.faint, fontSize: 8 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: colors.faint, fontSize: 8 }} tickFormatter={v => `${v.toFixed(0)}%`} domain={['auto', 0]} />
                      <Tooltip contentStyle={{ background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 6, fontSize: '.5rem' }} />
                      <Area type="monotone" dataKey="drawdown" stroke={colors.red} fill={colors.red} fillOpacity={0.15} strokeWidth={1.5} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {results[selectedAgents[0]]?.bars && (
                <div style={{ background: colors.bg2, border: `1px solid ${colors.border}`, borderRadius: 12, padding: '.75rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '.7rem', color: colors.white, marginBottom: '.5rem' }}>Monthly Returns</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 2 }}>
                    {(() => {
                      const bars = results[selectedAgents[0]]?.bars || []
                      const monthlyData: Record<string, number[]> = {}
                      bars.forEach((b: any, i: number) => {
                        if (i === 0) return
                        const monthKey = b.date?.slice(0, 7) || ''
                        if (!monthlyData[monthKey]) monthlyData[monthKey] = []
                        const ret = (b.equity - bars[i - 1]?.equity) / bars[i - 1]?.equity
                        monthlyData[monthKey].push(ret)
                      })
                      const months = Object.keys(monthlyData).sort().slice(-12)
                      const monthNames = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
                      return months.map((m) => {
                        const monthRet = monthlyData[m].reduce((a: number, b: number) => a + b, 0) * 100
                        const isPos = monthRet >= 0
                        const intensity = Math.min(1, Math.abs(monthRet) / 20)
                        return (
                          <div key={m} style={{ padding: '4px 2px', borderRadius: 3, background: isPos ? `rgba(25, 230, 167, ${intensity * 0.6})` : `rgba(255, 107, 122, ${intensity * 0.6})`, textAlign: 'center', fontSize: '.45rem', color: colors.white }}>
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

            <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: '.65rem' }}>
              {selectedAgents.map((slug, idx) => {
                const agent = agents.find(a => a.slug === slug)
                const stats = results[slug]?.stats
                const sc = computeScorecard(stats)
                const isPositive = (stats?.totalReturnPct ?? 0) >= 0
                return (
                  <div key={slug} style={{ background: colors.bg2, border: `1px solid ${colors.border}`, borderRadius: 10, padding: '.75rem', borderLeft: `3px solid ${agentColors[idx % agentColors.length]}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
                      <div>
                        <div style={{ fontSize: '.72rem', fontWeight: 600, color: colors.white }}>{agent?.name || slug}</div>
                        <div style={{ fontSize: '.5rem', color: colors.faint }}>{agent?.ticker}  |  {agent?.backtest_strategy?.replace(/_/g, ' ')}</div>
                      </div>
                      {sc && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem', padding: '.2rem .5rem', borderRadius: 6, background: `${sc.grade.startsWith('A') ? colors.mint : sc.grade.startsWith('B') ? colors.blue : sc.grade === 'C' ? colors.orange : colors.red}18` }}>
                          <span style={{ fontSize: '.85rem', fontWeight: 800, color: sc.grade.startsWith('A') ? colors.mint : sc.grade.startsWith('B') ? colors.blue : sc.grade === 'C' ? colors.orange : colors.red }}>{sc.grade}</span>
                          <span style={{ fontSize: '.55rem', color: colors.muted }}>{sc.composite.toFixed(0)}</span>
                        </div>
                      )}
                    </div>
                    {stats ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.3rem', fontSize: '.52rem', color: colors.muted }}>
                        <span>Return <b style={{ color: isPositive ? colors.mint : colors.red, fontWeight: 600 }}>{fmtPct(stats.totalReturnPct)}</b></span>
                        <span>Sharpe <b style={{ color: colors.white }}>{fmtNum(stats.sharpeRatio)}</b></span>
                        <span>Max DD <b style={{ color: colors.red }}>{fmtPct(-stats.maxDrawdownPct)}</b></span>
                        <span>Win Rate <b style={{ color: colors.white }}>{stats.winRate?.toFixed(0)}%</b></span>
                        <span>Trades <b style={{ color: colors.white }}>{stats.totalTrades}</b></span>
                        <span>Profit Factor <b style={{ color: colors.white }}>{fmtNum(stats.profitFactor)}</b></span>
                        <span>Exposure <b style={{ color: colors.white }}>{stats.exposureTime?.toFixed(0)}%</b></span>
                        <span>Calmar <b style={{ color: colors.white }}>{fmtNum(stats.calmarRatio)}</b></span>
                      </div>
                    ) : (
                      <div style={{ fontSize: '.6rem', color: colors.faint }}>No data yet</div>
                    )}
                  </div>
                )
              })}

              {Object.keys(benchmarks).map(bench => {
                const stats = benchmarks[bench]?.stats
                const isPositive = (stats?.totalReturnPct ?? 0) >= 0
                return (
                  <div key={bench} style={{ padding: '.4rem .6rem', background: colors.bg3, borderRadius: 6, display: 'flex', justifyContent: 'space-between', fontSize: '.6rem' }}>
                    <span style={{ color: BENCHMARKS[bench as keyof typeof BENCHMARKS]?.color || colors.muted }}>{BENCHMARKS[bench as keyof typeof BENCHMARKS]?.label || bench}</span>
                    <span style={{ color: isPositive ? colors.mint : colors.red, fontWeight: 600 }}>{stats ? fmtPct(stats.totalReturnPct) : '\u2014'}</span>
                  </div>
                )
              })}

              {hasResults && (
                <button onClick={() => router.push(`/agents/submit?symbol=${symbol}&strategy=${strategy}`)} style={{ padding: '.65rem', borderRadius: 10, border: 'none', background: `linear-gradient(135deg, ${colors.mint}, #10b981)`, color: colors.bg, fontSize: '.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <TrendingUp size={15} />Deploy Agent
                </button>
              )}

              {results[selectedAgents[0]]?.stats && (() => {
                const sc2 = computeScorecard(results[selectedAgents[0]].stats)
                if (!sc2) return null
                const gradeColor = sc2.grade.startsWith('A') ? colors.mint : sc2.grade.startsWith('B') ? colors.blue : sc2.grade === 'C' ? colors.orange : colors.red
                return (
                  <div style={{ background: colors.bg2, border: `1px solid ${colors.border}`, borderRadius: 10, padding: '.75rem' }}>
                    <div style={{ fontSize: '.5rem', color: colors.faint, letterSpacing: '.1em', marginBottom: '.6rem', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Shield size={11} />STRATEGY SCORECARD
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem', marginBottom: '.5rem' }}>
                      {[
                        ['Performance', sc2.perfScore, colors.blue],
                        ['Risk', sc2.riskScore, colors.orange],
                        ['Robustness', sc2.robustScore, colors.mint],
                        ['Execution', sc2.execScore, colors.text],
                      ].map(([label, score, color]) => (
                        <div key={label as string} style={{ padding: '.4rem', background: colors.bg3, borderRadius: 6 }}>
                          <div style={{ fontSize: '.42rem', color: colors.faint }}>{label as string}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '.3rem' }}>
                            <div style={{ flex: 1, height: 3, borderRadius: 2, background: colors.bg, overflow: 'hidden' }}>
                              <div style={{ width: `${(score as number)}%`, height: '100%', background: color as string, borderRadius: 2, transition: 'width 0.5s' }} />
                            </div>
                            <span style={{ fontSize: '.68rem', fontWeight: 700, color: color as string }}>{(score as number).toFixed(0)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem', padding: '.5rem', background: colors.bg3, borderRadius: 6 }}>
                      <span style={{ fontSize: '.42rem', color: colors.faint }}>COMPOSITE</span>
                      <span style={{ fontSize: '1rem', fontWeight: 800, color: colors.white }}>{sc2.composite.toFixed(0)}</span>
                      <span style={{ fontSize: '.8rem', fontWeight: 800, padding: '1px 6px', background: `${gradeColor}20`, color: gradeColor, borderRadius: 4 }}>{sc2.grade}</span>
                    </div>
                  </div>
                )
              })()}
            </div>
          </>
        )}

        {activeTab === 'compare' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
            <div style={{ background: colors.bg2, border: `1px solid ${colors.border}`, borderRadius: 12, padding: '1rem' }}>
              <div style={{ fontWeight: 600, fontSize: '.82rem', color: colors.white, marginBottom: '.75rem' }}>Strategy Comparison Matrix</div>
              {hasResults ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.6rem' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '.4rem .5rem', borderBottom: `1px solid ${colors.border}`, color: colors.faint, fontWeight: 600 }}>Metric</th>
                        {selectedAgents.map((slug, idx) => {
                          const agent = agents.find(a => a.slug === slug)
                          return <th key={slug} style={{ textAlign: 'right', padding: '.4rem .5rem', borderBottom: `1px solid ${colors.border}`, color: agentColors[idx % agentColors.length], fontWeight: 600 }}>{agent?.ticker || slug}</th>
                        })}
                        {Object.keys(benchmarks).map(bench => (
                          <th key={bench} style={{ textAlign: 'right', padding: '.4rem .5rem', borderBottom: `1px solid ${colors.border}`, color: BENCHMARKS[bench as keyof typeof BENCHMARKS]?.color || colors.muted, fontWeight: 400 }}>{BENCHMARKS[bench as keyof typeof BENCHMARKS]?.label || bench}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['Return', 'totalReturnPct', '%', true],
                        ['CAGR', 'annualizedReturnPct', '%', true],
                        ['Sharpe', 'sharpeRatio', '', false],
                        ['Sortino', 'sortinoRatio', '', false],
                        ['Max DD', 'maxDrawdownPct', '%', true],
                        ['Win Rate', 'winRate', '%', false],
                        ['Profit Factor', 'profitFactor', '', false],
                        ['Trades', 'totalTrades', '', false],
                        ['Exposure', 'exposureTime', '%', false],
                      ].map(([label, field, suffix, isPct]: any) => (
                        <tr key={label}>
                          <td style={{ padding: '.3rem .5rem', borderBottom: `1px solid ${colors.border}30`, color: colors.muted }}>{label}</td>
                          {selectedAgents.map(slug => {
                            const val = results[slug]?.stats?.[field]
                            const formatted = field === 'totalReturnPct' || field === 'annualizedReturnPct' || field === 'maxDrawdownPct'
                              ? (field === 'maxDrawdownPct' ? fmtPct(-val) : fmtPct(val))
                              : field === 'winRate' || field === 'exposureTime'
                                ? `${val?.toFixed(1)}%`
                                : `${val?.toFixed(2)}`
                            return <td key={slug} style={{ textAlign: 'right', padding: '.3rem .5rem', borderBottom: `1px solid ${colors.border}30`, color: colors.white, fontWeight: 500 }}>{formatted}</td>
                          })}
                          {Object.keys(benchmarks).map(bench => {
                            const val = benchmarks[bench]?.stats?.[field]
                            const formatted = field === 'totalReturnPct' || field === 'annualizedReturnPct' || field === 'maxDrawdownPct'
                              ? (field === 'maxDrawdownPct' ? fmtPct(-val) : fmtPct(val))
                              : field === 'winRate' || field === 'exposureTime'
                                ? `${val?.toFixed(1)}%`
                                : `${val?.toFixed(2)}`
                            return <td key={bench} style={{ textAlign: 'right', padding: '.3rem .5rem', borderBottom: `1px solid ${colors.border}30`, color: colors.muted }}>{formatted}</td>
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '3rem', color: colors.faint }}>
                  <Layers size={32} style={{ opacity: 0.3, marginBottom: '.5rem' }} />
                  <div>Run a backtest to compare strategies side by side</div>
                </div>
              )}
            </div>

            {mcResults && (
              <div style={{ background: colors.bg2, border: `1px solid ${colors.border}`, borderRadius: 12, padding: '1rem' }}>
                <div style={{ fontSize: '.55rem', color: colors.faint, letterSpacing: '.1em', marginBottom: '.6rem' }}>MONTE CARLO SIMULATION ({mcResults?.nTrials} runs)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem' }}>
                  {[
                    ['Median Return', fmtPct(mcResults?.medianReturn ?? 0), (mcResults?.medianReturn ?? 0) >= 0 ? colors.mint : colors.red],
                    ['Median Drawdown', fmtPct(-(mcResults?.medianMaxDrawdown ?? 0)), colors.orange],
                    ['p10 Return', fmtPct(mcResults?.p10Return ?? 0), colors.red],
                    ['p90 Return', fmtPct(mcResults?.p90Return ?? 0), colors.mint],
                  ].map(([label, val, color]) => (
                    <div key={label as string} style={{ padding: '.45rem', background: colors.bg3, borderRadius: 6 }}>
                      <div style={{ fontSize: '.42rem', color: colors.faint }}>{label as string}</div>
                      <div style={{ fontSize: '.78rem', fontWeight: 700, color: color as string }}>{val}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '.6rem', padding: '.45rem', background: colors.bg3, borderRadius: 6 }}>
                  <div style={{ fontSize: '.42rem', color: colors.faint, marginBottom: '.25rem' }}>BEAT BUY-AND-HOLD RATE</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                    <div style={{ flex: 1, height: 6, background: colors.bg, borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${((mcResults?.beatRate ?? 0) * 100)}%`, height: '100%', background: colors.mint, borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: '.6rem', color: colors.muted }}>{((mcResults?.beatRate ?? 0) * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'robustness' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
            {!wfResults ? (
              <div style={{ background: colors.bg2, border: `1px solid ${colors.border}`, borderRadius: 12, padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '.75rem', color: colors.faint }}>
                <Target size={32} style={{ opacity: 0.3 }} />
                <span style={{ fontSize: '.75rem' }}>Enable Walk-Forward analysis to see robustness data</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', cursor: 'pointer', padding: '.4rem .8rem', borderRadius: 8, border: `1px solid ${colors.blue}40`, background: `${colors.blue}10` }}>
                  <input type="checkbox" checked={enableWalkForward} onChange={e => setEnableWalkForward(e.target.checked)} style={{ accentColor: colors.mint }} />
                  <span style={{ fontSize: '.65rem', color: colors.blue2 }}>Enable Walk-Forward</span>
                </label>
              </div>
            ) : (
              <>
                <div style={{ background: colors.bg2, border: `1px solid ${colors.border}`, borderRadius: 12, padding: '1rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '.82rem', color: colors.white, marginBottom: '.75rem' }}>Walk-Forward Analysis ({wfResults?.nWindows} windows)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.5rem', marginBottom: '.75rem' }}>
                    {[
                      ['Avg Return', fmtPct(wfResults?.avgReturn ?? 0), (wfResults?.avgReturn ?? 0) >= 0 ? colors.mint : colors.red],
                      ['Avg Sharpe', fmtNum(wfResults?.avgSharpe), colors.blue2],
                      ['Consistency', `${((wfResults?.consistencyRatio ?? 0) * 100).toFixed(1)}%`, (wfResults?.consistencyRatio ?? 0) > 0.5 ? colors.mint : colors.orange],
                    ].map(([label, val, color]) => (
                      <div key={label as string} style={{ padding: '.5rem', background: colors.bg3, borderRadius: 8, textAlign: 'center' }}>
                        <div style={{ fontSize: '.42rem', color: colors.faint }}>{label as string}</div>
                        <div style={{ fontSize: '.85rem', fontWeight: 700, color: color as string }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={wfResults?.windows?.map((w: any, i: number) => ({ window: i + 1, return: w.testReturn, out: w.outperformance })) ?? []} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                      <XAxis dataKey="window" tick={{ fill: colors.faint, fontSize: 8 }} />
                      <YAxis tick={{ fill: colors.faint, fontSize: 8 }} tickFormatter={v => `${v.toFixed(0)}%`} />
                      <Tooltip contentStyle={{ background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 6, fontSize: '.5rem' }} />
                      <Bar dataKey="return" fill={colors.blue} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {mcResults && (
                  <div style={{ background: colors.bg2, border: `1px solid ${colors.border}`, borderRadius: 12, padding: '1rem' }}>
                    <div style={{ fontSize: '.55rem', color: colors.faint, letterSpacing: '.1em', marginBottom: '.6rem' }}>MONTE CARLO ({mcResults?.nTrials} trials)</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.4rem' }}>
                      {[
                        ['Median Return', fmtPct(mcResults?.medianReturn ?? 0), (mcResults?.medianReturn ?? 0) >= 0 ? colors.mint : colors.red],
                        ['p10', fmtPct(mcResults?.p10Return ?? 0), colors.red],
                        ['p90', fmtPct(mcResults?.p90Return ?? 0), colors.mint],
                        ['Median Max DD', fmtPct(-(mcResults?.medianMaxDrawdown ?? 0)), colors.orange],
                        ['Beat B&H', `${((mcResults?.beatRate ?? 0) * 100).toFixed(1)}%`, colors.blue2],
                      ].map(([label, val, color]) => (
                        <div key={label as string} style={{ padding: '.5rem', background: colors.bg3, borderRadius: 6, textAlign: 'center' }}>
                          <div style={{ fontSize: '.42rem', color: colors.faint }}>{label as string}</div>
                          <div style={{ fontSize: '.75rem', fontWeight: 700, color: color as string }}>{val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {results[selectedAgents[0]]?.stats && (
              <div style={{ background: colors.bg2, border: `1px solid ${colors.border}`, borderRadius: 12, padding: '1rem' }}>
                <div style={{ fontSize: '.55rem', color: colors.faint, letterSpacing: '.1em', marginBottom: '.6rem', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Activity size={11} />EXTENDED METRICS
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.35rem' }}>
                  {(() => {
                    const s = results[selectedAgents[0]]?.stats
                    return [
                      ['CAGR', fmtPct(s?.annualizedReturnPct)],
                      ['Total Return', fmtPct(s?.totalReturnPct)],
                      ['Sortino', fmtNum(s?.sortinoRatio)],
                      ['Calmar', fmtNum(s?.calmarRatio)],
                      ['Max DD', fmtPct(-s?.maxDrawdownPct)],
                      ['Avg DD', fmtPct(-s?.averageDrawdownPct)],
                      ['Downside Vol', `${(s?.downsideVolatility * 100)?.toFixed(2)}%`],
                      ['Win Rate', `${s?.winRate?.toFixed(1)}%`],
                      ['Profit Factor', fmtNum(s?.profitFactor)],
                      ['Exposure', `${s?.exposureTime?.toFixed(1)}%`],
                      ['Turnover', `${s?.turnover?.toFixed(1)}x`],
                      ['Pos. Months', `${s?.positiveMonthRatio?.toFixed(1)}%`],
                      ['Roll Sharpe (63d)', `${s?.rolling63dSharpeMean?.toFixed(2)} \u00b1 ${s?.rolling63dSharpeStd?.toFixed(2)}`],
                      ['Fee Impact', `${feeBps}bps + ${slippageBps}bps`],
                    ].map(([label, val]) => (
                      <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '.25rem 0', borderBottom: `1px solid ${colors.border}30` }}>
                        <span style={{ fontSize: '.5rem', color: colors.muted }}>{label as string}</span>
                        <span style={{ fontSize: '.5rem', color: colors.white, fontWeight: 500 }}>{val ?? '\u2014'}</span>
                      </div>
                    ))
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'agents' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
            <div style={{ fontSize: '.82rem', fontWeight: 600, color: colors.white, marginBottom: '.25rem' }}>Select Agents to Backtest</div>
            <div style={{ fontSize: '.6rem', color: colors.muted, marginBottom: '.5rem' }}>Choose agents and run backtests to compare their strategies. Each agent uses a different quant approach.</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '.5rem' }}>
              {agents.map((agent, idx) => {
                const isSelected = selectedAgents.includes(agent.slug)
                const stats = results[agent.slug]?.stats
                const sc = computeScorecard(stats)
                return (
                  <div key={agent.slug} onClick={() => toggleAgent(agent.slug)} style={{ padding: '.6rem', background: isSelected ? `${agentColors[idx % agentColors.length]}10` : colors.bg2, border: `1px solid ${isSelected ? agentColors[idx % agentColors.length] : colors.border}`, borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.3rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: isSelected ? agentColors[idx % agentColors.length] : colors.border }} />
                        <span style={{ fontSize: '.72rem', fontWeight: 600, color: isSelected ? colors.white : colors.muted }}>{agent.name}</span>
                      </div>
                      {stats && (
                        <span style={{ fontSize: '.5rem', color: colors.muted }}>
                          {fmtPct(stats.totalReturnPct)} | Sharpe {fmtNum(stats.sharpeRatio)}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '.5rem', color: colors.faint, lineHeight: 1.4, maxHeight: 36, overflow: 'hidden' }}>{agent.backtest_strategy?.replace(/_/g, ' ')}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}