'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, BarChart, Bar, ReferenceLine, Scatter, ScatterChart } from 'recharts'
import { Loader2, Play, TrendingUp, Activity, Shield, AlertCircle, Plus, X, ChevronDown, Zap, BarChart3, Target, Layers, ArrowRight, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { PERIODS, BENCHMARKS, BACKTEST_STRATEGIES } from '@/lib/backtest-config'
import { createClient } from '@/lib/supabase/client'
import { AGENT_CONFIGS } from '@/lib/agents'

interface AgentData {
  slug: string
  name: string
  ticker: string | null
  primary_symbol: string | null
  backtest_strategy: string | null
  backtest_stats: any
}

type TabId = 'overview' | 'compare' | 'robustness' | 'agents' | 'trades'

interface SavedTab {
  id: string
  name: string
  symbol: string
  strategy: string
  period: string
  feeBps: number
  slippageBps: number
  timestamp: string
}

// 5-row priority metrics with collapsible details — replaces the original
// 16-row dump where everything was visually equal-weighted. The user sees
// the 5 metrics that actually decide whether the strategy is good; the
// rest stay one click away under "Details".
function CompactStatBlock({ stats, feeBps, slippageBps, colors, fmtPct, fmtNum }: {
  stats: any
  feeBps: number
  slippageBps: number
  colors: Record<string, string>
  fmtPct: (v: number) => string
  fmtNum: (v: number, d?: number) => string
}) {
  const [open, setOpen] = useState(false)
  const primary: Array<[string, string, string]> = [
    ['Total Return', fmtPct(stats.totalReturnPct), (stats.totalReturnPct ?? 0) >= 0 ? colors.mint : colors.red],
    ['Sharpe',       fmtNum(stats.sharpeRatio, 2),  (stats.sharpeRatio ?? 0)   >= 1   ? colors.mint : (stats.sharpeRatio ?? 0) >= 0.5 ? colors.orange : colors.red],
    ['Max DD',       fmtPct(-Math.abs(stats.maxDrawdownPct ?? 0)), colors.red],
    ['Trades',       String(stats.totalTrades ?? 0), (stats.totalTrades ?? 0) >= 100 ? colors.text : colors.orange],
    ['Win Rate',     `${(stats.winRate ?? 0).toFixed(1)}%`, colors.text],
  ]
  const secondary: Array<[string, string, string]> = [
    ['CAGR',          fmtPct(stats.annualizedReturnPct), (stats.annualizedReturnPct ?? 0) >= 0 ? colors.mint : colors.red],
    ['Sortino',       fmtNum(stats.sortinoRatio, 2),  colors.blue2],
    ['Calmar',        fmtNum(stats.calmarRatio, 2),   colors.blue2],
    ['Avg DD',        fmtPct(-Math.abs(stats.averageDrawdownPct ?? 0)), colors.orange],
    ['Downside Vol',  `${((stats.downsideVolatility ?? 0) * 100).toFixed(2)}%`, colors.text],
    ['Profit Factor', fmtNum(stats.profitFactor, 2),  colors.text],
    ['Exposure',      `${(stats.exposureTime ?? 0).toFixed(1)}%`, colors.text],
    ['Turnover',      `${(stats.turnover ?? 0).toFixed(2)}x`,     colors.text],
    ['Pos. Months',   `${(stats.positiveMonthRatio ?? 0).toFixed(1)}%`, colors.text],
    ['Roll Sharpe',   `${(stats.rolling63dSharpeMean ?? 0).toFixed(2)} ± ${(stats.rolling63dSharpeStd ?? 0).toFixed(2)}`, colors.text],
    ['Fee Impact',    `${feeBps}bps + ${slippageBps}bps`, colors.faint],
  ]
  const Row = ([label, val, color]: [string, string, string]) => (
    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '.2rem 0', borderBottom: `1px solid ${colors.border}25` }}>
      <span style={{ fontSize: '.5rem', color: colors.muted }}>{label}</span>
      <span style={{ fontSize: '.55rem', color, fontWeight: 600 }}>{val ?? '—'}</span>
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
      {primary.map(Row)}
      <button onClick={() => setOpen(o => !o)}
        style={{ marginTop: '.35rem', padding: '.28rem .5rem', borderRadius: 5, background: 'transparent', border: `1px dashed ${colors.border}`, color: colors.faint, fontFamily: 'var(--font-mono)', fontSize: '.5rem', letterSpacing: '.06em', cursor: 'pointer', textAlign: 'center' }}>
        {open ? '− HIDE DETAILS' : `+ DETAILS (${secondary.length} more)`}
      </button>
      {open && <div style={{ marginTop: '.2rem' }}>{secondary.map(Row)}</div>}
    </div>
  )
}

export default function BacktestComparePage() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [agents, setAgents] = useState<AgentData[]>([])
  const [loadingAgents, setLoadingAgents] = useState(true)
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [symbol, setSymbol] = useState(searchParams.get('symbol') || 'BTC-USD')
  const [strategy, setStrategy] = useState(searchParams.get('strategy') || 'active_swing')
  const [period, setPeriod] = useState('2y')
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
  const [elapsed, setElapsed] = useState(0)
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [showStrategyPicker, setShowStrategyPicker] = useState(false)
  const [goodStrategies, setGoodStrategies] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('ase_good_strategies') ?? '[]') } catch { return [] }
  })
  const [compareInput, setCompareInput] = useState('')
  const [compareSymbols, setCompareSymbols] = useState<string[]>([])
  const [compareData, setCompareData] = useState<Record<string, { date: string; returnPct: number }[]>>({})
  const [compareLoading, setCompareLoading] = useState<Record<string, boolean>>({})
  const [userAgents, setUserAgents] = useState<Array<{ id: string; name: string; ticker: string; strategy?: string; symbol?: string }>>([])
  const [userId, setUserId] = useState('')

  const [savedTabs, setSavedTabs] = useState<SavedTab[]>(() => {
    try { return JSON.parse(localStorage.getItem('ase_backtest_tabs') ?? '[]') } catch { return [] }
  })
  const [activeTabId, setActiveTabId] = useState<string>('default')
  const [savedResults, setSavedResults] = useState<Record<string, any>>({})

  const toBacktestSymbol = (value: string) => value.replace(/\//g, '-')

  const colors = {
    bg: '#06111F', bg2: '#0B1728', bg3: '#101A2D', border: '#1E2A3D',
    blue: '#4F8CFF', blue2: '#6BA3FF', mint: '#16C784', red: '#FF5468', orange: '#F5B942',
    text: '#B7C4D5', muted: '#7F8CA3', faint: '#55657A', white: '#F7FAFF',
  }

  const agentColors = ['#5B8CFF', '#19E6A7', '#FFB648', '#FF6B7A', '#8B5CF6', '#F472B6', '#34D399', '#FBBF24']

  function saveCurrentTab() {
    const name = `${symbol.replace('/', '-')} ${strategy.replace(/_/g, ' ')} ${period}`
    const tab: SavedTab = {
      id: `tab_${Date.now()}`,
      name,
      symbol,
      strategy,
      period,
      feeBps,
      slippageBps,
      timestamp: new Date().toISOString(),
    }
    const next = [...savedTabs, tab]
    setSavedTabs(next)
    localStorage.setItem('ase_backtest_tabs', JSON.stringify(next))
  }

  function loadTab(tab: SavedTab) {
    setSymbol(tab.symbol)
    setStrategy(tab.strategy)
    setPeriod(tab.period)
    setFeeBps(tab.feeBps)
    setSlippageBps(tab.slippageBps)
    setActiveTabId(tab.id)
  }

  function deleteTab(tabId: string) {
    const next = savedTabs.filter(t => t.id !== tabId)
    setSavedTabs(next)
    localStorage.setItem('ase_backtest_tabs', JSON.stringify(next))
    if (activeTabId === tabId) setActiveTabId('default')
  }

  // Save results to localStorage
  function saveResultsToStorage(key: string, res: Record<string, any>, bench: Record<string, any>) {
    try {
      const data = { results: res, benchmarks: bench, timestamp: new Date().toISOString() }
      localStorage.setItem(key, JSON.stringify(data))
    } catch {}
  }

  // Load results from localStorage
  function loadResultsFromStorage(key: string) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return null
      const data = JSON.parse(raw)
      // Only use if less than 1 hour old
      if (data.timestamp && Date.now() - new Date(data.timestamp).getTime() < 3600000) {
        return data
      }
    } catch {}
    return null
  }

  // Autoload last results on mount
  useEffect(() => {
    const cached = loadResultsFromStorage('ase_backtest_cache')
    if (cached) {
      if (cached.results && Object.keys(cached.results).length > 0) {
        setResults(cached.results)
        setBenchmarks(cached.benchmarks || {})
      }
      const cachedResults = loadResultsFromStorage('ase_backtest_saved_cache')
      if (cachedResults) {
        setSavedResults(cachedResults.results || {})
      }
    }
  }, [])

  // Auto-save results when they update
  useEffect(() => {
    if (Object.keys(results).length > 0) {
      saveResultsToStorage('ase_backtest_cache', results, benchmarks)
    }
  }, [results, benchmarks])

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

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? 'anonymous'
      setUserId(id)
      try {
        const saves = JSON.parse(localStorage.getItem(`ase_agent_saves_${id}`) ?? '{}') as Record<string, { id: string; name: string; ticker: string; status: string }>
        const merged = AGENT_CONFIGS.map(base => {
          const save = saves[base.id]
          return {
            id: base.id,
            name: save?.name ?? base.name,
            ticker: save?.ticker ?? base.ticker,
            strategy: base.strategyType,
            symbol: base.asset === 'crypto' ? 'BTC-USD' : 'SPY',
          }
        })
        setUserAgents(merged)
      } catch {}
    })
  }, [])

  const fetchBenchmark = async (symbol: string) => {
    if (compareData[symbol]) return
    setCompareLoading(p => ({ ...p, [symbol]: true }))
    try {
      const res = await fetch(`/api/benchmark?symbol=${encodeURIComponent(symbol)}&period=${period}`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) setCompareData(p => ({ ...p, [symbol]: data }))
      }
    } catch {}
    setCompareLoading(p => ({ ...p, [symbol]: false }))
  }

  const addCompareSymbol = async () => {
    const sym = compareInput.toUpperCase().trim().replace(/\s/g, '')
    if (!sym || compareSymbols.includes(sym)) return
    setCompareSymbols(p => [...p, sym])
    setCompareInput('')
    await fetchBenchmark(sym)
  }

  const removeCompareSymbol = (sym: string) => {
    setCompareSymbols(p => p.filter(s => s !== sym))
    setCompareData(p => { const n = { ...p }; delete n[sym]; return n })
  }

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

      // Add Buy & Hold benchmark for the primary symbol
      try {
        const bhRes = await fetch('/api/backtest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: toBacktestSymbol(symbol), strategy: 'momentum_crossover', period, fee: feeBps / 10000, slippage: slippageBps / 10000 }),
        })
        const bhData = await bhRes.json()
        if (bhRes.ok && !bhData.error && bhData.buyHold) {
          newBenchmarks['buy_hold'] = { bars: bhData.buyHold, stats: bhData.buyHold }
        }
      } catch {}
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

    const primaryBars = results[firstAgent].bars as any[]
    let prevPos = 0

    return firstBars.map((bar: any, i: number) => {
      const point: any = { date: bar.date?.slice(5) || '', barIndex: i }
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
      const curPos = primaryBars[i]?.position ?? 0
      if (prevPos === 0 && curPos === 1) point._entry = point[firstAgent]
      if (prevPos === 1 && curPos === 0) point._exit = point[firstAgent]
      compareSymbols.forEach(sym => {
        const cData = compareData[sym]
        if (!cData?.length) return
        const dateStr = bar.date?.slice(0, 10) || ''
        const match = cData.find((d: any) => d.date === dateStr)
        if (match != null) point[`cmp_${sym}`] = match.returnPct
      })
      prevPos = curPos
      return point
    })
  }, [results, benchmarks, selectedAgents, compareData, compareSymbols])

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

  const toggleGoodStrategy = (slug: string) => {
    setGoodStrategies(prev => {
      const next = prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
      try { localStorage.setItem('ase_good_strategies', JSON.stringify(next)) } catch {}
      return next
    })
  }

  const extractTrades = (slug: string) => {
    const bars = results[slug]?.bars
    if (!bars?.length) return []
    const trades: Array<{ entry: string; exit: string; entryPrice: number; exitPrice: number; returnPct: number; bars: number }> = []
    let inTrade = false; let entryIdx = 0; let entryPrice = 0
    for (let i = 0; i < bars.length; i++) {
      if (!inTrade && bars[i].position === 1) {
        inTrade = true; entryIdx = i; entryPrice = bars[i].close
      } else if (inTrade && (bars[i].position === 0 || i === bars.length - 1)) {
        inTrade = false
        const exitPrice = bars[i].close
        trades.push({ entry: bars[entryIdx].date, exit: bars[i].date, entryPrice, exitPrice, returnPct: ((exitPrice - entryPrice) / entryPrice) * 100, bars: i - entryIdx })
      }
    }
    return trades
  }

  const tabs: { id: TabId; label: string; icon: any }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'compare', label: 'Compare', icon: Layers },
    { id: 'robustness', label: 'Robustness', icon: Target },
    { id: 'trades', label: 'Trades', icon: Activity },
    { id: 'agents', label: 'Agents', icon: Zap },
  ]

  const hasResults = Object.keys(results).length > 0

  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props
    if (payload._entry != null) {
      return <circle cx={cx} cy={cy} r={3.5} fill={colors.mint} stroke={colors.bg} strokeWidth={1} />
    }
    if (payload._exit != null) {
      return <circle cx={cx} cy={cy} r={3.5} fill={colors.red} stroke={colors.bg} strokeWidth={1} />
    }
    return null
  }

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
          <button onClick={runBacktest} disabled={loading || selectedAgents.length === 0} style={{ padding: '.4rem 1rem', borderRadius: 8, border: 'none', background: loading ? colors.bg3 : `linear-gradient(135deg, ${colors.blue}, #3B7BEE)`, color: '#fff', fontSize: '.7rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 5, boxShadow: loading ? 'none' : `0 2px 12px ${colors.blue}40` }}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {loading ? 'Running...' : 'Run Backtest'}
          </button>
        </div>
      </header>

      {/* Saved Tabs */}
      {savedTabs.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.5rem 1.5rem', borderBottom: `1px solid ${colors.border}`, background: colors.bg, overflowX: 'auto' }}>
          <button
            onClick={() => { setActiveTabId('default'); setSymbol(searchParams.get('symbol') || 'BTC-USD'); setStrategy(searchParams.get('strategy') || 'active_swing'); setPeriod('2y') }}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.62rem', padding: '0.3rem 0.65rem', borderRadius: 6,
              background: activeTabId === 'default' ? colors.blue + '18' : 'transparent',
              border: `1px solid ${activeTabId === 'default' ? colors.blue + '55' : colors.border}`,
              color: activeTabId === 'default' ? colors.blue : colors.muted,
              cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
            }}
          >
            + New
          </button>
          {savedTabs.map(tab => (
            <div key={tab.id} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <button
                onClick={() => loadTab(tab)}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.62rem', padding: '0.3rem 0.65rem', borderRadius: 6,
                  background: activeTabId === tab.id ? colors.mint + '15' : 'transparent',
                  border: `1px solid ${activeTabId === tab.id ? colors.mint + '55' : colors.border}`,
                  color: activeTabId === tab.id ? colors.mint : colors.muted,
                  cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
                }}
              >
                {tab.name.length > 28 ? tab.name.slice(0, 28) + '...' : tab.name}
              </button>
              <button
                onClick={() => deleteTab(tab.id)}
                style={{ background: 'transparent', border: 'none', color: colors.faint, cursor: 'pointer', fontSize: '0.6rem', padding: '0.1rem', lineHeight: 1 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '.5rem', padding: '0.6rem 1.5rem', borderBottom: `1px solid ${colors.border}`, background: `${colors.bg2}EE` }}>
        <button
          onClick={saveCurrentTab}
          style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.6rem', padding: '0.25rem 0.6rem', borderRadius: 6,
            background: 'transparent', border: `1px solid ${colors.border}`, color: colors.muted, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          💾 Save
        </button>
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
            agents.map((agent, idx) => (
              <button key={agent.slug} onClick={() => toggleAgent(agent.slug)} style={{ padding: '.2rem .45rem', borderRadius: 4, border: `1px solid ${selectedAgents.includes(agent.slug) ? agentColors[idx % agentColors.length] : colors.border}`, background: selectedAgents.includes(agent.slug) ? `${agentColors[idx % agentColors.length]}20` : 'transparent', color: selectedAgents.includes(agent.slug) ? agentColors[idx % agentColors.length] : colors.muted, fontSize: '.5rem', cursor: 'pointer' }}>
                {agent.ticker || agent.slug}
              </button>
            ))
          )}
        </div>
        <div style={{ borderLeft: `1px solid ${colors.border}`, paddingLeft: '.5rem', display: 'flex', alignItems: 'center', gap: '.3rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '.55rem', color: colors.faint, letterSpacing: '.08em', fontFamily: 'var(--font-mono)' }}>COMPARE</span>
          {compareSymbols.map((sym, idx) => (
            <div key={sym} style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '.15rem .35rem', borderRadius: 4, background: `${['#a78bfa','#fb923c','#38bdf8','#f472b6','#facc15'][idx % 5]}18`, border: `1px solid ${['#a78bfa','#fb923c','#38bdf8','#f472b6','#facc15'][idx % 5]}50` }}>
              <span style={{ fontSize: '.5rem', color: ['#a78bfa','#fb923c','#38bdf8','#f472b6','#facc15'][idx % 5] }}>{sym}</span>
              <button onClick={() => removeCompareSymbol(sym)} style={{ background: 'none', border: 'none', color: colors.faint, cursor: 'pointer', fontSize: '.6rem', lineHeight: 1, padding: 0 }}>×</button>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <input
              value={compareInput}
              onChange={e => setCompareInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && addCompareSymbol()}
              placeholder="SPY, QQQ, AAPL..."
              style={{ width: 110, padding: '.2rem .35rem', borderRadius: 4, border: `1px solid ${colors.border}`, background: colors.bg3, color: colors.text, fontSize: '.5rem', fontFamily: 'var(--font-mono)', outline: 'none' }}
            />
            <button onClick={addCompareSymbol} style={{ padding: '.2rem .4rem', borderRadius: 4, border: `1px solid ${colors.border}`, background: colors.bg3, color: colors.muted, fontSize: '.5rem', cursor: 'pointer' }}>+</button>
          </div>
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

      <div style={{ flex: 1, display: 'flex', gap: '1rem', padding: '1rem 1.5rem', overflow: 'auto' }}>

        {activeTab === 'overview' && (
          <>
            <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '.75rem' }}>

              {/* ── HEADLINE VERDICT CARD ── one number, one verdict line.
                  Replaces the wall-of-metrics-with-no-priority that the user
                  pasted in chat. The full metric grid is still available in
                  the per-agent card on the right under "Details". */}
              {(() => {
                const slug = selectedAgents[0]
                const stats = results[slug]?.stats
                if (!stats || !slug) return null
                const sharpe = stats.sharpeRatio ?? 0
                const trades = stats.totalTrades ?? 0
                const totalRet = stats.totalReturnPct ?? 0
                const maxDD = stats.maxDrawdownPct ?? 0
                // Pick the asset-class buy-and-hold benchmark already loaded
                // and compare Sharpe / total return against it.
                const benchKeys = Object.keys(benchmarks)
                const primaryBench = benchKeys.find(k => k === symbol) ?? benchKeys[0]
                const bStats = primaryBench ? benchmarks[primaryBench]?.stats : null
                const bSharpe = bStats?.sharpeRatio ?? null
                const bRet = bStats?.totalReturnPct ?? null
                const beatsSharpe = bSharpe != null && sharpe > bSharpe
                const beatsReturn = bRet != null && totalRet > bRet
                const TRADE_FLOOR = 100
                const lowSample = trades < TRADE_FLOOR

                let verdict: string; let verdictColor: string
                if (lowSample) {
                  verdict = `Only ${trades} trades — sample too small to trust. Need ≥${TRADE_FLOOR} before any metric below is meaningful.`
                  verdictColor = colors.orange
                } else if (beatsSharpe && beatsReturn) {
                  verdict = `Beats ${BENCHMARKS[primaryBench as keyof typeof BENCHMARKS]?.label ?? primaryBench} on Sharpe AND return. Promising.`
                  verdictColor = colors.mint
                } else if (beatsSharpe) {
                  verdict = `Beats benchmark on Sharpe (${sharpe.toFixed(2)} vs ${bSharpe?.toFixed(2)}) but lags on return.`
                  verdictColor = colors.blue
                } else if (bSharpe != null) {
                  verdict = `Loses to ${primaryBench} buy-and-hold on Sharpe (${sharpe.toFixed(2)} vs ${bSharpe.toFixed(2)}). Strategy is not adding alpha.`
                  verdictColor = colors.red
                } else {
                  verdict = 'No benchmark loaded — add a buy-and-hold comparison to evaluate.'
                  verdictColor = colors.faint
                }

                return (
                  <div style={{ background: colors.bg2, border: `1px solid ${verdictColor}40`, borderLeft: `3px solid ${verdictColor}`, borderRadius: 12, padding: '.85rem 1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: colors.faint, letterSpacing: '.1em' }}>SHARPE</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.85rem', fontWeight: 800, color: verdictColor, lineHeight: 1, letterSpacing: '-.02em' }}>{sharpe.toFixed(2)}</div>
                        {bSharpe != null && (
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: colors.faint, marginTop: '.18rem' }}>
                            vs {primaryBench} {bSharpe.toFixed(2)}
                          </div>
                        )}
                      </div>
                      <div style={{ width: 1, alignSelf: 'stretch', background: colors.border }} />
                      <div style={{ display: 'flex', gap: '1rem', flex: 1, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: colors.faint, letterSpacing: '.1em' }}>RETURN</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.95rem', fontWeight: 700, color: totalRet >= 0 ? colors.mint : colors.red }}>{totalRet >= 0 ? '+' : ''}{totalRet.toFixed(1)}%</div>
                        </div>
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: colors.faint, letterSpacing: '.1em' }}>MAX DD</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.95rem', fontWeight: 700, color: colors.red }}>{(-Math.abs(maxDD)).toFixed(1)}%</div>
                        </div>
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: colors.faint, letterSpacing: '.1em' }}>TRADES</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.95rem', fontWeight: 700, color: lowSample ? colors.orange : colors.text }}>{trades}</div>
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: '.55rem', paddingTop: '.55rem', borderTop: `1px solid ${colors.border}`, fontSize: '.66rem', color: verdictColor, fontWeight: 600, lineHeight: 1.45 }}>
                      {verdict}
                    </div>
                  </div>
                )
              })()}

              <div style={{ background: colors.bg2, border: `1px solid ${colors.border}`, borderRadius: 12, padding: '1rem', minHeight: 280 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '.82rem', color: colors.white }}>Performance</div>
                  <div style={{ display: 'flex', gap: '.75rem', fontFamily: 'var(--font-mono)', fontSize: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    {selectedAgents.map((slug, idx) => {
                      const agent = agents.find(a => a.slug === slug)
                      return <span key={slug} style={{ color: agentColors[idx % agentColors.length] }}>{'\u25CF'} {agent?.ticker || agent?.name || slug}</span>
                    })}
                    {Object.keys(benchmarks).map(bench => (
                      <span key={bench} style={{ color: BENCHMARKS[bench as keyof typeof BENCHMARKS]?.color || colors.muted }}>{'\u25CF'} {BENCHMARKS[bench as keyof typeof BENCHMARKS]?.label || bench}</span>
                    ))}
                    {compareSymbols.map((sym, idx) => (
                      <span key={sym} style={{ color: ['#a78bfa','#fb923c','#38bdf8','#f472b6','#facc15'][idx % 5] }}>
                        {'\u25A0'} {sym}
                        {compareLoading[sym] && <span style={{ color: colors.faint }}> ...</span>}
                      </span>
                    ))}
                    {chartData.length > 0 && (
                      <span style={{ color: colors.faint, marginLeft: '.5rem' }}>
                        <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: colors.mint, marginRight: 3 }} />entry
                        <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: colors.red, marginLeft: 8, marginRight: 3 }} />exit
                      </span>
                    )}
                  </div>
                </div>
                {loading ? (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.faint }}>
                    <Loader2 size={24} className="animate-spin" style={{ marginRight: 8 }} />Running backtests...
                  </div>
                ) : chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                      <XAxis dataKey="date" tick={{ fill: colors.faint, fontSize: 9 }} tickFormatter={v => v.slice(0, 5)} interval={Math.max(0, Math.floor(chartData.length / 8))} minTickGap={28} />
                      <YAxis tick={{ fill: colors.faint, fontSize: 9 }} tickFormatter={v => `${v.toFixed(0)}%`} domain={['auto', 'auto']} />
                      <Tooltip contentStyle={{ background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 8, fontSize: '.62rem' }} />
                      {selectedAgents.map((slug, idx) => (
                        <Line
                          key={slug}
                          type="monotone"
                          dataKey={slug}
                          stroke={agentColors[idx % agentColors.length]}
                          strokeWidth={2}
                          dot={idx === 0 ? <CustomDot /> : false}
                          activeDot={{ r: 4 }}
                        />
                      ))}
                      {Object.keys(benchmarks).map(bench => (
                        <Line key={bench} type="monotone" dataKey={bench} stroke={BENCHMARKS[bench as keyof typeof BENCHMARKS]?.color || colors.muted} strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                      ))}
                      {compareSymbols.map((sym, idx) => (
                        <Line key={`cmp_${sym}`} type="monotone" dataKey={`cmp_${sym}`} stroke={['#a78bfa','#fb923c','#38bdf8','#f472b6','#facc15'][idx % 5]} strokeWidth={1.5} strokeDasharray="2 3" dot={false} name={sym} />
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

              <div style={{ height: 130, background: colors.bg2, border: `1px solid ${colors.border}`, borderRadius: 12, padding: '.75rem' }}>
                <div style={{ fontWeight: 600, fontSize: '.7rem', color: colors.white, marginBottom: '.35rem' }}>Drawdown</div>
                {results[selectedAgents[0]]?.bars ? (
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
                ) : (
                  <div style={{ height: 95, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.faint, fontSize: '.6rem' }}>No data</div>
                )}
              </div>

              <div style={{ background: colors.bg2, border: `1px solid ${colors.border}`, borderRadius: 12, padding: '.75rem' }}>
                <div style={{ fontWeight: 600, fontSize: '.7rem', color: colors.white, marginBottom: '.5rem' }}>Monthly Returns</div>
                {results[selectedAgents[0]]?.bars ? (
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
                ) : (
                  <div style={{ textAlign: 'center', padding: '1rem', color: colors.faint, fontSize: '.6rem' }}>No data</div>
                )}
              </div>

              {hasResults && selectedAgents[0] && extractTrades(selectedAgents[0]).length > 0 && (
                <div style={{ background: colors.bg2, border: `1px solid ${colors.border}`, borderRadius: 12, padding: '.75rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '.7rem', color: colors.white, marginBottom: '.5rem' }}>Full Trade Log — {agents.find(a => a.slug === selectedAgents[0])?.name || selectedAgents[0]}</div>
                  {(() => {
                    const trades = extractTrades(selectedAgents[0])
                    const wins = trades.filter(t => t.returnPct >= 0)
                    const losses = trades.filter(t => t.returnPct < 0)
                    const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0
                    const avgReturn = trades.length > 0 ? trades.reduce((a, t) => a + t.returnPct, 0) / trades.length : 0
                    const best = trades.length > 0 ? Math.max(...trades.map(t => t.returnPct)) : 0
                    const worst = trades.length > 0 ? Math.min(...trades.map(t => t.returnPct)) : 0
                    const totalPnL = trades.reduce((a, t) => a + t.returnPct, 0)
                    return (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '.3rem', marginBottom: '.6rem' }}>
                          {[
                            ['Trades', String(trades.length), colors.text],
                            ['Win Rate', `${winRate.toFixed(1)}%`, winRate >= 50 ? colors.mint : colors.red],
                            ['Avg Return', `${avgReturn >= 0 ? '+' : ''}${avgReturn.toFixed(2)}%`, avgReturn >= 0 ? colors.mint : colors.red],
                            ['Best', `+${best.toFixed(2)}%`, colors.mint],
                            ['Worst', `${worst.toFixed(2)}%`, colors.red],
                          ].map(([label, val, color]) => (
                            <div key={label as string} style={{ padding: '.35rem .4rem', background: colors.bg3, borderRadius: 6, textAlign: 'center' }}>
                              <div style={{ fontSize: '.42rem', color: colors.faint, marginBottom: 2 }}>{label as string}</div>
                              <div style={{ fontSize: '.65rem', fontWeight: 700, color: color as string }}>{val}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ overflowX: 'auto', maxHeight: 260, overflowY: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.55rem' }}>
                            <thead style={{ position: 'sticky', top: 0, background: colors.bg2 }}>
                              <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                                {['#', 'Entry', 'Exit', 'Entry $', 'Exit $', 'Return', 'Bars'].map(h => (
                                  <th key={h} style={{ textAlign: h === '#' ? 'left' : 'right', padding: '.2rem .35rem', color: colors.faint, fontWeight: 600, fontSize: '.45rem' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {trades.map((t, i) => {
                                const isWin = t.returnPct >= 0
                                return (
                                  <tr key={i} style={{ borderBottom: `1px solid ${colors.border}15` }}>
                                    <td style={{ padding: '.15rem .35rem', color: colors.faint }}>{i + 1}</td>
                                    <td style={{ padding: '.15rem .35rem', textAlign: 'right', color: colors.text }}>{t.entry.slice(0, 10)}</td>
                                    <td style={{ padding: '.15rem .35rem', textAlign: 'right', color: colors.text }}>{t.exit.slice(0, 10)}</td>
                                    <td style={{ padding: '.15rem .35rem', textAlign: 'right', color: colors.text }}>${t.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                    <td style={{ padding: '.15rem .35rem', textAlign: 'right', color: colors.text }}>${t.exitPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                    <td style={{ padding: '.15rem .35rem', textAlign: 'right', fontWeight: 700, color: isWin ? colors.mint : colors.red }}>{isWin ? '+' : ''}{t.returnPct.toFixed(2)}%</td>
                                    <td style={{ padding: '.15rem .35rem', textAlign: 'right', color: colors.muted }}>{t.bars}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )
                  })()}
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
                      <CompactStatBlock
                        stats={stats}
                        feeBps={feeBps}
                        slippageBps={slippageBps}
                        colors={colors}
                        fmtPct={fmtPct}
                        fmtNum={fmtNum}
                      />
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
              {compareSymbols.map((sym, idx) => {
                const cData = compareData[sym]
                const last = cData?.[cData.length - 1]
                const ret = last?.returnPct ?? null
                const accent = ['#a78bfa','#fb923c','#38bdf8','#f472b6','#facc15'][idx % 5]
                return (
                  <div key={sym} style={{ padding: '.4rem .6rem', background: colors.bg3, borderRadius: 6, display: 'flex', justifyContent: 'space-between', fontSize: '.6rem', borderLeft: `2px solid ${accent}` }}>
                    <span style={{ color: accent }}>{sym} (hold)</span>
                    <span style={{ color: ret != null ? (ret >= 0 ? colors.mint : colors.red) : colors.faint, fontWeight: 600 }}>
                      {ret != null ? fmtPct(ret) : compareLoading[sym] ? '...' : '\u2014'}
                    </span>
                  </div>
                )
              })}

              {hasResults && selectedAgents.length > 0 && (
                <div style={{ display: 'flex', gap: '.4rem' }}>
                  <button onClick={() => {
                    saveResultsToStorage('ase_backtest_saved_cache', results, benchmarks)
                    setSavedResults(results)
                  }} style={{ flex: 1, padding: '.5rem', borderRadius: 10, border: `1px solid ${colors.blue}55`, background: `${colors.blue}15`, color: colors.blue, fontSize: '.65rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    Save Results
                  </button>
                  <button onClick={() => toggleGoodStrategy(selectedAgents[0])} style={{ flex: 1, padding: '.5rem', borderRadius: 10, border: `1px solid ${goodStrategies.includes(selectedAgents[0]) ? colors.mint : colors.border}`, background: goodStrategies.includes(selectedAgents[0]) ? `${colors.mint}15` : colors.bg3, color: goodStrategies.includes(selectedAgents[0]) ? colors.mint : colors.muted, fontSize: '.65rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <CheckCircle2 size={12} />{goodStrategies.includes(selectedAgents[0]) ? '[SAVED]' : 'Mark Good'}
                  </button>
                  <button onClick={() => router.push(`/agents/submit?symbol=${symbol}&strategy=${strategy}`)} style={{ flex: 1, padding: '.5rem', borderRadius: 10, border: 'none', background: `linear-gradient(135deg, ${colors.blue}, #3B7BEE)`, color: '#fff', fontSize: '.65rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <TrendingUp size={12} />Deploy
                  </button>
                </div>
              )}

              {Object.keys(savedResults).length > 0 && (
                <div style={{ marginTop: '.4rem', padding: '.4rem .6rem', background: `${colors.mint}10`, border: `1px solid ${colors.mint}30`, borderRadius: 8, fontSize: '.58rem', color: colors.mint, display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                  Results saved to browser
                </div>
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

              {mcResults && (
                <div style={{ background: colors.bg2, border: `1px solid ${colors.border}`, borderRadius: 10, padding: '.75rem' }}>
                  <div style={{ fontSize: '.48rem', color: colors.faint, letterSpacing: '.1em', marginBottom: '.5rem' }}>MONTE CARLO ({mcResults.nTrials} trials)</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
                    {[
                      ['Median Return', fmtPct(mcResults.medianReturn), (mcResults.medianReturn ?? 0) >= 0 ? colors.mint : colors.red],
                      ['p10 Return', fmtPct(mcResults.p10Return), colors.red],
                      ['p90 Return', fmtPct(mcResults.p90Return), colors.mint],
                      ['Median Max DD', fmtPct(-(mcResults.medianMaxDrawdown ?? 0)), colors.orange],
                      ['Beat B&H Rate', `${((mcResults.beatRate ?? 0) * 100).toFixed(1)}%`, colors.blue2],
                    ].map(([label, val, color]) => (
                      <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '.18rem 0', borderBottom: `1px solid ${colors.border}25` }}>
                        <span style={{ fontSize: '.48rem', color: colors.muted }}>{label as string}</span>
                        <span style={{ fontSize: '.5rem', color: color as string, fontWeight: 600 }}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {wfResults && (
                <div style={{ background: colors.bg2, border: `1px solid ${colors.border}`, borderRadius: 10, padding: '.75rem' }}>
                  <div style={{ fontSize: '.48rem', color: colors.faint, letterSpacing: '.1em', marginBottom: '.5rem' }}>WALK-FORWARD ({wfResults.nWindows} windows)</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
                    {[
                      ['Avg Return', fmtPct(wfResults.avgReturn), (wfResults.avgReturn ?? 0) >= 0 ? colors.mint : colors.red],
                      ['Avg Sharpe', fmtNum(wfResults.avgSharpe, 3), colors.blue2],
                      ['Consistency', `${((wfResults.consistencyRatio ?? 0) * 100).toFixed(1)}%`, colors.mint],
                    ].map(([label, val, color]) => (
                      <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '.18rem 0', borderBottom: `1px solid ${colors.border}25` }}>
                        <span style={{ fontSize: '.48rem', color: colors.muted }}>{label as string}</span>
                        <span style={{ fontSize: '.5rem', color: color as string, fontWeight: 600 }}>{val ?? '\u2014'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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

        {activeTab === 'trades' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
            {selectedAgents.map((slug, idx) => {
              const agent = agents.find(a => a.slug === slug)
              const trades = extractTrades(slug)
              const isGood = goodStrategies.includes(slug)
              const wins = trades.filter(t => t.returnPct >= 0)
              const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0
              const avgReturn = trades.length > 0 ? trades.reduce((a, t) => a + t.returnPct, 0) / trades.length : 0
              const best = trades.length > 0 ? Math.max(...trades.map(t => t.returnPct)) : 0
              const worst = trades.length > 0 ? Math.min(...trades.map(t => t.returnPct)) : 0
              const totalPnL = trades.reduce((a, t) => a + t.returnPct, 0)
              return (
                <div key={slug} style={{ background: colors.bg2, border: `1px solid ${colors.border}`, borderRadius: 12, padding: '1rem', borderLeft: `3px solid ${agentColors[idx % agentColors.length]}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.6rem' }}>
                    <div>
                      <div style={{ fontSize: '.82rem', fontWeight: 700, color: colors.white }}>{agent?.name || slug}</div>
                      <div style={{ fontSize: '.52rem', color: colors.muted }}>{trades.length} trades  |  {agent?.backtest_strategy?.replace(/_/g, ' ')}</div>
                    </div>
                    <button onClick={() => toggleGoodStrategy(slug)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '.3rem .6rem', borderRadius: 7, border: `1px solid ${isGood ? colors.mint : colors.border}`, background: isGood ? `${colors.mint}18` : 'transparent', color: isGood ? colors.mint : colors.muted, fontSize: '.58rem', cursor: 'pointer', fontWeight: isGood ? 700 : 400 }}>
                      <CheckCircle2 size={12} />
                      {isGood ? '[SAVED]' : 'Mark as Good'}
                    </button>
                  </div>
                  {trades.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '.3rem', marginBottom: '.65rem' }}>
                      {[
                        ['Total Trades', String(trades.length), colors.text],
                        ['Win Rate', `${winRate.toFixed(1)}%`, winRate >= 50 ? colors.mint : colors.red],
                        ['Avg Return', `${avgReturn >= 0 ? '+' : ''}${avgReturn.toFixed(2)}%`, avgReturn >= 0 ? colors.mint : colors.red],
                        ['Best Trade', `+${best.toFixed(2)}%`, colors.mint],
                        ['Worst Trade', `${worst.toFixed(2)}%`, colors.red],
                      ].map(([label, val, color]) => (
                        <div key={label as string} style={{ padding: '.35rem .4rem', background: colors.bg3, borderRadius: 6, textAlign: 'center' }}>
                          <div style={{ fontSize: '.42rem', color: colors.faint, marginBottom: 2 }}>{label as string}</div>
                          <div style={{ fontSize: '.65rem', fontWeight: 700, color: color as string }}>{val}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {trades.length > 0 ? (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.58rem' }}>
                        <thead>
                          <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                            {['#', 'Entry Date', 'Exit Date', 'Entry $', 'Exit $', 'Return', 'Bars', 'P&L'].map(h => (
                              <th key={h} style={{ textAlign: h === '#' ? 'left' : 'right', padding: '.25rem .4rem', color: colors.faint, fontWeight: 600, fontSize: '.5rem' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {trades.map((t, i) => {
                            const isWin = t.returnPct >= 0
                            return (
                              <tr key={i} style={{ borderBottom: `1px solid ${colors.border}20` }}>
                                <td style={{ padding: '.2rem .4rem', color: colors.faint }}>{i + 1}</td>
                                <td style={{ padding: '.2rem .4rem', textAlign: 'right', color: colors.text }}>{t.entry.slice(0, 10)}</td>
                                <td style={{ padding: '.2rem .4rem', textAlign: 'right', color: colors.text }}>{t.exit.slice(0, 10)}</td>
                                <td style={{ padding: '.2rem .4rem', textAlign: 'right', color: colors.text }}>${t.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                <td style={{ padding: '.2rem .4rem', textAlign: 'right', color: colors.text }}>${t.exitPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                <td style={{ padding: '.2rem .4rem', textAlign: 'right', fontWeight: 700, color: isWin ? colors.mint : colors.red }}>{isWin ? '+' : ''}{t.returnPct.toFixed(2)}%</td>
                                <td style={{ padding: '.2rem .4rem', textAlign: 'right', color: colors.muted }}>{t.bars}</td>
                                <td style={{ padding: '.2rem .4rem', textAlign: 'right', color: isWin ? colors.mint : colors.red }}>
                                  {isWin ? '+' : ''}{Math.abs(t.returnPct).toFixed(1)}%
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '2rem', color: colors.faint, fontSize: '.65rem' }}>Run a backtest to see trade history</div>
                  )}
                </div>
              )
            })}
            {goodStrategies.length > 0 && (
              <div style={{ background: colors.bg2, border: `1px solid ${colors.border}`, borderRadius: 12, padding: '.75rem' }}>
                <div style={{ fontSize: '.55rem', color: colors.mint, letterSpacing: '.1em', marginBottom: '.5rem' }}>SAVED STRATEGIES</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
                  {goodStrategies.map(slug => {
                    const agent = agents.find(a => a.slug === slug)
                    return (
                      <div key={slug} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '.25rem .5rem', borderRadius: 6, border: `1px solid ${colors.mint}40`, background: `${colors.mint}10` }}>
                        <span style={{ fontSize: '.58rem', color: colors.mint }}>{agent?.name || slug}</span>
                        <button onClick={() => toggleGoodStrategy(slug)} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontSize: '.55rem', lineHeight: 1 }}>x</button>
                      </div>
                    )
                  })}
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
