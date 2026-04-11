'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import {
  Area, AreaChart, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { STRATEGIES, runBacktest, runBuyAndHold, type OHLCV } from '@/lib/backtest'

interface AgentEntry {
  id: string; slug: string; name: string; description: string; ticker: string
  symbol: string; strategy: string; params: Record<string, number>
}

interface BacktestBar { date: string; equity: number; position: number }
interface BuyHoldBar  { date: string; equity: number }
interface BacktestStats {
  totalReturnPct: number
  annualizedReturnPct: number
  sharpeRatio: number
  maxDrawdownPct: number
  winRate: number
  totalTrades: number
  profitableTrades: number
  avgTradeDurationDays: number
  bestTradePct: number
  worstTradePct: number
  calmarRatio: number
}
interface BacktestResult {
  symbol: string
  period: string
  strategy: { name: string; description: string; plainEnglish: string; bestFor: string; mainRisk: string }
  stats: BacktestStats
  bars: BacktestBar[]
  buyHold: BuyHoldBar[]
}

const ASSET_GROUPS = [
  { group: 'Crypto', items: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'DOGE-USD', 'AVAX-USD', 'LINK-USD'] },
  { group: 'US ETFs', items: ['SPY', 'QQQ', 'VOO', 'DIA', 'IWM', 'ARKK'] },
  { group: 'Crypto ETFs', items: ['IBIT', 'FBTC', 'ETHA', 'FETH', 'ARKB', 'BITB'] },
  { group: 'Tech', items: ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'TSLA'] },
]

const PERIODS = ['1mo', '3mo', '6mo', '1y']
const STRATEGY_IDS = Object.keys(STRATEGIES)

function fmtPct(v: number) {
  const s = v >= 0 ? '+' : ''
  return `${s}${v.toFixed(2)}%`
}
function fmtNum(v: number, d = 2) { return v.toFixed(d) }
function colorOf(v: number) { return v >= 0 ? 'var(--mint)' : 'var(--red)' }

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ color: 'var(--muted)', marginBottom: 6 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color, fontWeight: 600 }}>
          {p.name}: ${p.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </div>
      ))}
    </div>
  )
}

const CUSTOM_CODE_TEMPLATE = `// bars: Array<{ date, open, high, low, close, volume }>
// Return: number[] — 1 = long, 0 = flat
function strategy(bars) {
  const closes = bars.map(b => b.close)
  const window = 20
  const positions = new Array(bars.length).fill(0)

  for (let i = window; i < bars.length; i++) {
    const fast = closes.slice(i - 10, i).reduce((a, b) => a + b, 0) / 10
    const slow = closes.slice(i - window, i).reduce((a, b) => a + b, 0) / window
    positions[i] = fast > slow ? 1 : 0
  }

  return positions
}`

export default function BacktestPage() {
  const [tab, setTab] = useState<'lab' | 'agents' | 'custom'>('lab')
  const [agents, setAgents] = useState<AgentEntry[]>([])
  const [agentLoading, setAgentLoading] = useState(false)
  const [agentResult, setAgentResult] = useState<BacktestResult | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<AgentEntry | null>(null)
  const [agentPeriod, setAgentPeriod] = useState('3mo')
  const [agentError, setAgentError] = useState('')
  const [cachedResults, setCachedResults] = useState<Record<string, BacktestResult | null>>({})

  useEffect(() => {
    fetch('/api/backtest/agents').then(r => r.json()).then(d => setAgents(d.agents ?? []))
  }, [])

  useEffect(() => {
    if (agents.length === 0) return
    const results: Record<string, BacktestResult | null> = {}
    const batchSize = 2
    let processed = 0
    
    const processBatch = async () => {
      while (processed < agents.length) {
        const batch = agents.slice(processed, processed + batchSize)
        const batchResults = await Promise.allSettled(
          batch.map(async (agent) => {
            try {
              const res = await fetch('/api/backtest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol: agent.symbol, strategy: agent.strategy, params: agent.params, period: agentPeriod, agent_slug: agent.slug }),
              })
              if (res.ok) {
                const data = await res.json()
                return { agentId: agent.id, result: data as BacktestResult }
              }
            } catch (e) {
              console.warn(`Prefetch failed for ${agent.id}:`, e)
            }
            return { agentId: agent.id, result: null }
          })
        )
        
        for (const r of batchResults) {
          if (r.status === 'fulfilled' && r.value.result) {
            results[r.value.agentId] = r.value.result
          }
        }
        
        processed += batchSize
        setCachedResults({ ...results })
        
        const firstWithResult = agents.slice(processed - batchSize, processed).find(a => results[a.id])
        if (firstWithResult && !selectedAgent) {
          setSelectedAgent(firstWithResult)
          setAgentResult(results[firstWithResult.id])
        }
      }
    }
    
    void processBatch()
  }, [agents, agentPeriod])

  async function runAgentBacktest(agent: AgentEntry) {
    if (cachedResults[agent.id]) {
      setSelectedAgent(agent)
      setAgentResult(cachedResults[agent.id])
      return
    }
    
    setSelectedAgent(agent)
    setAgentLoading(true)
    setAgentError('')
    setAgentResult(null)
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: agent.symbol, strategy: agent.strategy, params: agent.params, period: agentPeriod, agent_slug: agent.slug }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? 'Backtest failed')
      const result = data as BacktestResult
      setAgentResult(result)
      setCachedResults(prev => ({ ...prev, [agent.id]: result }))
    } catch (e) {
      setAgentError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setAgentLoading(false)
    }
  }

  const [customCode, setCustomCode] = useState(CUSTOM_CODE_TEMPLATE)
  const [customSymbol, setCustomSymbol] = useState('BTC-USD')
  const [customPeriod, setCustomPeriod] = useState('1y')
  const [customLoading, setCustomLoading] = useState(false)
  const [customError, setCustomError] = useState('')
  const [customResult, setCustomResult] = useState<BacktestResult | null>(null)

  async function runCustomBacktest() {
    setCustomLoading(true)
    setCustomError('')
    setCustomResult(null)
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: customSymbol, strategy: 'momentum_crossover', period: customPeriod }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? 'Failed to fetch market data')

      const bars: OHLCV[] = data.bars.map((b: { date: string; close: number }) => ({
        date: b.date, open: b.close, high: b.close, low: b.close, close: b.close, volume: 0,
      }))

      let userFn: (bars: OHLCV[]) => number[]
      try {
        userFn = new Function('bars', `"use strict"; ${customCode}; if (typeof strategy !== 'function') throw new Error('Define strategy(bars)'); return strategy(bars);`) as (bars: OHLCV[]) => number[]
      } catch (e) {
        throw new Error(`Code error: ${e instanceof Error ? e.message : String(e)}`)
      }

      let positions: number[]
      try {
        positions = userFn(bars)
      } catch (e) {
        throw new Error(`Runtime error: ${e instanceof Error ? e.message : String(e)}`)
      }

      if (!Array.isArray(positions) || positions.length !== bars.length) {
        throw new Error(`strategy() must return array of length ${bars.length}`)
      }

      const INITIAL = 100_000
      const fee = 0.001
      let equity = INITIAL
      let prevPos = 0
      const equityCurve: number[] = []
      for (let i = 0; i < bars.length; i++) {
        const pos = positions[i] ? 1 : 0
        if (pos !== prevPos && i > 0) equity *= (1 - fee)
        if (i > 0 && positions[i - 1]) {
          equity *= (1 + (bars[i].close - bars[i - 1].close) / bars[i - 1].close)
        }
        equityCurve.push(equity)
        prevPos = pos
      }

      const n = equityCurve.length
      const initial = equityCurve[0], final = equityCurve[n - 1]
      const totalReturnPct = ((final - initial) / initial) * 100
      const years = Math.max((new Date(bars[n - 1].date).getTime() - new Date(bars[0].date).getTime()) / (365.25 * 864e5), 0.01)
      const annualizedReturnPct = (Math.pow(final / initial, 1 / years) - 1) * 100
      const dailyRets = equityCurve.slice(1).map((v, i) => (v - equityCurve[i]) / equityCurve[i])
      const meanR = dailyRets.reduce((a, b) => a + b, 0) / dailyRets.length
      const stdR = Math.sqrt(dailyRets.reduce((s, r) => s + (r - meanR) ** 2, 0) / dailyRets.length)
      const sharpeRatio = stdR === 0 ? 0 : (meanR / stdR) * Math.sqrt(252)
      let peak = equityCurve[0], maxDD = 0
      for (const v of equityCurve) { if (v > peak) peak = v; const dd = (peak - v) / peak; if (dd > maxDD) maxDD = dd }
      const trades: { entry: number; exit: number }[] = []
      let inT = false, entryP = 0
      for (let i = 0; i < positions.length; i++) {
        const p = positions[i] ? 1 : 0
        if (!inT && p === 1) { inT = true; entryP = bars[i].close }
        else if (inT && (p === 0 || i === positions.length - 1)) { inT = false; trades.push({ entry: entryP, exit: bars[i].close }) }
      }
      const tradePcts = trades.map(t => ((t.exit - t.entry) / t.entry) * 100)
      const profitableTrades = tradePcts.filter(p => p > 0).length
      const winRate = trades.length > 0 ? (profitableTrades / trades.length) * 100 : 0
      const stats = {
        totalReturnPct, annualizedReturnPct,
        sharpeRatio: Math.round(sharpeRatio * 100) / 100,
        maxDrawdownPct: maxDD * 100, winRate,
        totalTrades: trades.length, profitableTrades,
        avgTradeDurationDays: 0,
        bestTradePct: tradePcts.length > 0 ? Math.max(...tradePcts) : 0,
        worstTradePct: tradePcts.length > 0 ? Math.min(...tradePcts) : 0,
        calmarRatio: maxDD === 0 ? 0 : Math.round((annualizedReturnPct / (maxDD * 100)) * 100) / 100,
      }

      const resultBars = bars.map((bar, i) => ({ date: bar.date, close: bar.close, position: positions[i] ? 1 : 0, equity: equityCurve[i] }))
      const buyHold = runBuyAndHold(bars)

      setCustomResult({
        symbol: customSymbol,
        period: customPeriod,
        strategy: { name: 'Custom Strategy', description: '', plainEnglish: '', bestFor: '', mainRisk: '' },
        stats,
        bars: resultBars,
        buyHold,
      })
    } catch (e) {
      setCustomError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setCustomLoading(false)
    }
  }

  const [symbol, setSymbol] = useState('BTC-USD')
  const [strategyId, setStrategyId] = useState('momentum_crossover')
  const [period, setPeriod] = useState('1y')
  const [params, setParams] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<BacktestResult | null>(null)

  const strategy = STRATEGIES[strategyId]
  const mergedParams = { ...strategy.defaultParams, ...params }

  const setParam = useCallback((key: string, val: number) => {
    setParams(prev => ({ ...prev, [key]: val }))
  }, [])

  const handleStrategyChange = (id: string) => {
    setStrategyId(id)
    setParams({})
  }

  async function runBacktest() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, strategy: strategyId, params: mergedParams, period }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? 'Backtest failed')
      setResult(data as BacktestResult)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const chartData = result
    ? result.bars.filter((_, i) => i % Math.max(1, Math.floor(result.bars.length / 200)) === 0)
        .map((b, i) => ({
          date: b.date.slice(5),
          strategy: Math.round(b.equity),
          buyHold: Math.round(result.buyHold[Math.min(i * Math.max(1, Math.floor(result.bars.length / 200)), result.buyHold.length - 1)]?.equity ?? 0),
        }))
    : []

  const s = result?.stats

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1400, margin: '0 auto' }}>
      <style>{`
        .bt-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem; }
        .bt-chip {
          display: inline-flex; align-items: center; gap: .4rem;
          font-size: .65rem; font-family: var(--font-mono); letter-spacing: .1em; font-weight: 700; text-transform: uppercase;
          padding: .3rem .8rem; border-radius: 999px;
          background: var(--ivory-dim); border: 1px solid var(--ivory-glow); color: var(--ivory);
        }
        .bt-title { font-family: var(--font-serif); font-size: 1.5rem; font-weight: 700; letter-spacing: -.025em; margin-top: .3rem; }
        .bt-sub   { font-size: .82rem; color: var(--muted); margin-top: .3rem; }

        .bt-grid { display: grid; grid-template-columns: 300px 1fr; gap: 1.25rem; alignItems: start; }
        @media (max-width: 900px) { .bt-grid { grid-template-columns: 1fr; } }

        .bt-panel {
          background: var(--bg2);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 1.25rem;
        }
        .bt-panel-title { font-size: .72rem; font-weight: 700; letterSpacing: .08em; text-transform: uppercase; color: var(--muted); margin-bottom: 1rem; font-family: var(--font-mono); }

        .bt-label { display: block; font-size: .68rem; font-family: var(--font-mono); letterSpacing: .06em; color: var(--muted); margin-bottom: .35rem; text-transform: uppercase; }
        .bt-select {
          width: 100%; padding: .6rem .8rem; border-radius: 10px;
          background: var(--bg); border: 1px solid var(--border);
          color: var(--white); font-size: .85rem; outline: none;
          transition: border-color .2s;
          appearance: none;
          cursor: pointer;
        }
        .bt-select:focus { border-color: var(--ivory-glow); }

        .bt-optgroup { color: var(--ivory); font-weight: 700; }

        .bt-field { margin-bottom: 1rem; }
        .bt-range-row { display: flex; alignItems: center; gap: .75rem; }
        .bt-range { flex: 1; accent-color: var(--ivory); cursor: pointer; }
        .bt-range-val {
          min-width: 48px; text-align: right; font-family: var(--font-mono);
          fontSize: .78rem; font-weight: 700; color: var(--ivory);
        }

        .bt-period-row { display: flex; gap: .4rem; flex-wrap: wrap; }
        .bt-period-btn {
          padding: .35rem .75rem; border-radius: 10px; font-size: .75rem; font-weight: 600;
          border: 1px solid var(--border); color: var(--muted);
          background: transparent; cursor: pointer; transition: all .18s;
          font-family: var(--font-mono); letter-spacing: .04em;
        }
        .bt-period-btn:hover { border-color: var(--ivory-glow); color: var(--white); }
        .bt-period-btn.is-active { background: var(--ivory-dim); border-color: var(--ivory-glow); color: var(--ivory); }

        .bt-run-btn {
          width: 100%; padding: .75rem; border-radius: 100px; font-size: .9rem; font-weight: 700;
          background: var(--ivory);
          color: var(--bg); border: 0; cursor: pointer; margin-top: 1rem;
          transition: all .2s cubic-bezier(.16,1,.3,1);
        }
        .bt-run-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(244,239,230,0.3); }
        .bt-run-btn:disabled { opacity: .5; cursor: not-allowed; }

        .bt-strategy-desc {
          margin-top: 1rem; padding: .9rem; border-radius: 12px;
          background: var(--bg); border: 1px solid var(--border);
          font-size: .78rem; color: var(--muted); line-height: 1.55;
        }
        .bt-strategy-desc strong { color: var(--ivory); display: block; margin-bottom: .3rem; font-size: .7rem; text-transform: uppercase; letter-spacing: .06em; font-family: var(--font-mono); }

        .bt-right { display: flex; flex-direction: column; gap: 1.25rem; }

        .bt-stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: .65rem; }
        .bt-stat {
          background: var(--bg); border: 1px solid var(--border);
          border-radius: 12px; padding: .85rem 1rem;
        }
        .bt-stat-label { font-size: .6rem; font-family: var(--font-mono); letterSpacing: .08em; color: var(--faint); text-transform: uppercase; margin-bottom: .3rem; }
        .bt-stat-value { font-size: 1.1rem; font-weight: 800; letterSpacing: -.02em; }

        .bt-chart-wrap { height: 260px; }

        .bt-error {
          padding: 1rem 1.2rem; borderRadius: 12px;
          background: var(--red-dim); border: 1px solid var(--red-border);
          color: var(--red); font-size: .85rem;
        }
        .bt-docs-link { font-size: .8rem; color: var(--ivory); text-decoration: underline; }

        .bt-empty {
          height: 260px; display: flex; flex-direction: column; alignItems: center; justify-content: center;
          color: var(--muted); font-size: .85rem; gap: .75rem;
        }
        .bt-empty-icon { font-size: 2rem; opacity: .5; }

        .bt-tag-row { display: flex; gap: .45rem; margin-top: .65rem; flex-wrap: wrap; }
        .bt-tag {
          font-size: .62rem; font-family: var(--font-mono); letter-spacing: .06em;
          padding: .2rem .55rem; borderRadius: 999px;
          background: var(--mint-dim); border: 1px solid var(--mint-border); color: var(--mint);
        }
        .bt-tag.danger { background: var(--red-dim); border-color: var(--red-border); color: var(--red); }

        .bt-tab-row { display: flex; gap: .4rem; margin-bottom: 1.5rem; }
        .bt-tab {
          padding: .4rem 1rem; border-radius: 10px; font-size: .8rem; font-weight: 600;
          border: 1px solid var(--border); color: var(--muted);
          background: transparent; cursor: pointer; transition: all .18s;
        }
        .bt-tab:hover { color: var(--white); border-color: var(--ivory-glow); }
        .bt-tab.is-active { background: var(--ivory-dim); border-color: var(--ivory-glow); color: var(--ivory); }

        .bt-agent-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: .85rem; }
        .bt-agent-card {
          background: var(--bg2); border: 1px solid var(--border);
          border-radius: 14px; padding: 1rem 1.1rem; cursor: pointer;
          transition: all .2s cubic-bezier(.16,1,.3,1);
        }
        .bt-agent-card:hover { border-color: var(--ivory-glow); transform: translateY(-2px); background: var(--bg3); }
        .bt-agent-card.is-selected { border-color: var(--ivory); background: var(--ivory-dim); }
        .bt-agent-name { font-weight: 700; fontSize: .88rem; margin-bottom: .2rem; }
        .bt-agent-ticker { font-family: var(--font-mono); font-size: .6rem; color: var(--ivory); margin-bottom: .4rem; letter-spacing: .08em; }
        .bt-agent-desc { font-size: .74rem; color: var(--muted); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .bt-agent-meta { display: flex; gap: .4rem; margin-top: .65rem; flex-wrap: wrap; }
        .bt-agent-badge {
          font-size: .6rem; font-family: var(--font-mono); letter-spacing: .04em;
          padding: .15rem .5rem; border-radius: 999px;
          background: var(--mint-dim); border: 1px solid var(--mint-border); color: var(--mint);
        }
        
        .bt-editor {
          width: 100%; min-height: 280px; resize: vertical;
          font-family: var(--font-mono); fontSize: .78rem; line-height: 1.6;
          background: var(--bg); border: 1px solid var(--border);
          border-radius: 12px; color: var(--white); padding: 1rem;
          outline: none;
        }
        .bt-editor:focus { border-color: var(--ivory-glow); }
        
        @media (max-width: 900px) { .custom-grid { grid-template-columns: 1fr !important; } }
      `}</style>

      <div className="bt-header">
        <div>
          <div className="bt-chip">Algo Lab</div>
          <div className="bt-title">Strategy Backtester</div>
          <div className="bt-sub">Test strategies on real historical data</div>
        </div>
        <Link href="/dashboard/backtest/docs" className="bt-docs-link">API Docs →</Link>
      </div>

      <div className="bt-tab-row">
        <button className={`bt-tab ${tab === 'lab' ? 'is-active' : ''}`} onClick={() => setTab('lab')}>Strategy Lab</button>
        <button className={`bt-tab ${tab === 'agents' ? 'is-active' : ''}`} onClick={() => setTab('agents')}>Agents</button>
        <button className={`bt-tab ${tab === 'custom' ? 'is-active' : ''}`} onClick={() => setTab('custom')}>Custom Code</button>
      </div>

      {tab === 'agents' && (
        <div>
          <div style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
              Backtest live ASE agents on historical data
            </div>
            <div className="bt-period-row" style={{ marginLeft: 'auto' }}>
              {PERIODS.map(p => (
                <button key={p} className={`bt-period-btn ${agentPeriod === p ? 'is-active' : ''}`} onClick={() => setAgentPeriod(p)}>{p}</button>
              ))}
            </div>
          </div>

          {agentError && <div className="bt-error" style={{ marginBottom: '1rem' }}>{agentError}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', alignItems: 'start' }}>
            <div>
              <div className="bt-agent-grid">
                {agents.map(agent => {
                  const hasCached = !!cachedResults[agent.id]
                  return (
                    <div
                      key={agent.id}
                      className={`bt-agent-card ${selectedAgent?.id === agent.id ? 'is-selected' : ''}`}
                      onClick={() => cachedResults[agent.id] ? (setSelectedAgent(agent), setAgentResult(cachedResults[agent.id])) : runAgentBacktest(agent)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div className="bt-agent-ticker">{agent.ticker}</div>
                        {hasCached && (
                          <span style={{ fontSize: '.52rem', fontFamily: 'var(--font-mono)', color: 'var(--mint)', background: 'var(--mint-dim)', padding: '.12rem .35rem', borderRadius: 4 }}>
                            READY
                          </span>
                        )}
                      </div>
                      <div className="bt-agent-name">{agent.name}</div>
                      <div className="bt-agent-desc">{agent.description}</div>
                      <div className="bt-agent-meta">
                        <span className="bt-agent-badge">🔒 {agent.symbol}</span>
                        <span className="bt-agent-badge">{STRATEGIES[agent.strategy]?.name ?? agent.strategy}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {agentLoading && (
                <div className="bt-panel" style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
                  Running backtest for {selectedAgent?.name}…
                </div>
              )}
              {agentResult && !agentLoading && (() => {
                const sa = agentResult.stats
                const agentChartData = agentResult.bars
                  .filter((_, i) => i % Math.max(1, Math.floor(agentResult.bars.length / 200)) === 0)
                  .map((b, i) => ({
                    date: b.date.slice(5),
                    strategy: Math.round(b.equity),
                    buyHold: Math.round(agentResult.buyHold[Math.min(i * Math.max(1, Math.floor(agentResult.bars.length / 200)), agentResult.buyHold.length - 1)]?.equity ?? 0),
                  }))
                return (
                  <>
                    <div className="bt-panel">
                      <div className="bt-panel-title">{selectedAgent?.name} · {agentResult.symbol} · {agentPeriod}</div>
                      <div className="bt-stats-grid">
                        <div className="bt-stat"><div className="bt-stat-label">Return</div><div className="bt-stat-value" style={{ color: colorOf(sa.totalReturnPct) }}>{fmtPct(sa.totalReturnPct)}</div></div>
                        <div className="bt-stat"><div className="bt-stat-label">Ann.</div><div className="bt-stat-value" style={{ color: colorOf(sa.annualizedReturnPct) }}>{fmtPct(sa.annualizedReturnPct)}</div></div>
                        <div className="bt-stat"><div className="bt-stat-label">Sharpe</div><div className="bt-stat-value" style={{ color: sa.sharpeRatio >= 1 ? 'var(--mint)' : 'var(--ivory)' }}>{fmtNum(sa.sharpeRatio)}</div></div>
                        <div className="bt-stat"><div className="bt-stat-label">Max DD</div><div className="bt-stat-value" style={{ color: 'var(--red)' }}>-{fmtNum(sa.maxDrawdownPct)}%</div></div>
                        <div className="bt-stat"><div className="bt-stat-label">Win Rate</div><div className="bt-stat-value" style={{ color: sa.winRate >= 50 ? 'var(--mint)' : 'var(--red)' }}>{fmtNum(sa.winRate)}%</div></div>
                        <div className="bt-stat"><div className="bt-stat-label">Trades</div><div className="bt-stat-value">{sa.totalTrades}</div></div>
                      </div>
                    </div>
                    <div className="bt-panel">
                      <div className="bt-panel-title">Equity Curve</div>
                      <div className="bt-chart-wrap">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={agentChartData}>
                            <defs>
                              <linearGradient id="ag1" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--ivory)" stopOpacity={0.35} />
                                <stop offset="95%" stopColor="var(--ivory)" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="ag2" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--mint)" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="var(--mint)" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="date" tick={{ fill: 'var(--faint)', fontSize: 10 }} tickLine={false} axisLine={false} />
                            <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: 'var(--faint)', fontSize: 10 }} tickLine={false} axisLine={false} width={48} />
                            <Tooltip content={<ChartTooltip />} />
                            <Legend wrapperStyle={{ fontSize: 11, color: 'var(--muted)' }} />
                            <Area type="monotone" dataKey="buyHold" name="Buy & Hold" stroke="var(--mint)" strokeWidth={1.5} fill="url(#ag2)" dot={false} />
                            <Area type="monotone" dataKey="strategy" name="Agent" stroke="var(--ivory)" strokeWidth={2} fill="url(#ag1)" dot={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </>
                )
              })()}
              {!agentResult && !agentLoading && (
                <div className="bt-panel">
                  <div className="bt-empty">
                    <div className="bt-empty-icon">🤖</div>
                    <div>Click an agent to run backtest</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'custom' && (
        <div>
          <div style={{ marginBottom: '.85rem', fontSize: '.82rem', color: 'var(--muted)', lineHeight: 1.6 }}>
            Write a <code style={{ color: 'var(--ivory)', fontFamily: 'var(--font-mono)', fontSize: '.78rem' }}>strategy(bars)</code> function that returns positions (1 = long, 0 = flat).
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.25rem', alignItems: 'start' }} className="custom-grid">
            <div>
              <textarea
                className="bt-editor"
                value={customCode}
                onChange={e => setCustomCode(e.target.value)}
                spellCheck={false}
                onKeyDown={e => {
                  if (e.key === 'Tab') {
                    e.preventDefault()
                    const el = e.currentTarget
                    const start = el.selectionStart
                    const end = el.selectionEnd
                    const next = customCode.substring(0, start) + '  ' + customCode.substring(end)
                    setCustomCode(next)
                    requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 2 })
                  }
                }}
              />
              {customError && <div className="bt-error" style={{ marginTop: '.75rem' }}>{customError}</div>}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="bt-panel">
                <div className="bt-panel-title">Asset & Timeframe</div>
                <div className="bt-field">
                  <label className="bt-label">Symbol</label>
                  <select className="bt-select" value={customSymbol} onChange={e => setCustomSymbol(e.target.value)}>
                    {ASSET_GROUPS.map(g => (
                      <optgroup key={g.group} label={g.group} className="bt-optgroup">
                        {g.items.map(t => <option key={t} value={t}>{t}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div className="bt-field">
                  <label className="bt-label">Period</label>
                  <div className="bt-period-row">
                    {PERIODS.map(p => (
                      <button key={p} className={`bt-period-btn ${customPeriod === p ? 'is-active' : ''}`} onClick={() => setCustomPeriod(p)}>{p}</button>
                    ))}
                  </div>
                </div>
                <button className="bt-run-btn" onClick={runCustomBacktest} disabled={customLoading}>
                  {customLoading ? 'Running…' : 'Run Strategy ▶'}
                </button>
              </div>

              <div className="bt-panel" style={{ fontSize: '.72rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                <div className="bt-panel-title">Helpers</div>
                <div style={{ fontFamily: 'var(--font-mono)', display: 'flex', flexDirection: 'column', gap: '.35rem', fontSize: '.68rem' }}>
                  <div><span style={{ color: 'var(--ivory)' }}>bars[i].close</span> — price</div>
                  <div><span style={{ color: 'var(--ivory)' }}>bars[i].date</span> — date</div>
                  <div style={{ marginTop: '.4rem', color: 'var(--faint)' }}>Standard JS Math, Array methods.</div>
                </div>
              </div>
            </div>
          </div>

          {customResult && !customLoading && (() => {
            const cs = customResult.stats
            const customChartData = customResult.bars
              .filter((_, i) => i % Math.max(1, Math.floor(customResult.bars.length / 200)) === 0)
              .map((b, i) => ({
                date: b.date.slice(5),
                strategy: Math.round(b.equity),
                buyHold: Math.round(customResult.buyHold[Math.min(i * Math.max(1, Math.floor(customResult.bars.length / 200)), customResult.buyHold.length - 1)]?.equity ?? 0),
              }))
            return (
              <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="bt-panel">
                  <div className="bt-panel-title">Custom · {customResult.symbol} · {customResult.period}</div>
                  <div className="bt-stats-grid">
                    <div className="bt-stat"><div className="bt-stat-label">Return</div><div className="bt-stat-value" style={{ color: colorOf(cs.totalReturnPct) }}>{fmtPct(cs.totalReturnPct)}</div></div>
                    <div className="bt-stat"><div className="bt-stat-label">Ann.</div><div className="bt-stat-value" style={{ color: colorOf(cs.annualizedReturnPct) }}>{fmtPct(cs.annualizedReturnPct)}</div></div>
                    <div className="bt-stat"><div className="bt-stat-label">Sharpe</div><div className="bt-stat-value" style={{ color: cs.sharpeRatio >= 1 ? 'var(--mint)' : 'var(--ivory)' }}>{fmtNum(cs.sharpeRatio)}</div></div>
                    <div className="bt-stat"><div className="bt-stat-label">Max DD</div><div className="bt-stat-value" style={{ color: 'var(--red)' }}>-{fmtNum(cs.maxDrawdownPct)}%</div></div>
                    <div className="bt-stat"><div className="bt-stat-label">Win Rate</div><div className="bt-stat-value" style={{ color: cs.winRate >= 50 ? 'var(--mint)' : 'var(--red)' }}>{fmtNum(cs.winRate)}%</div></div>
                    <div className="bt-stat"><div className="bt-stat-label">Trades</div><div className="bt-stat-value">{cs.totalTrades}</div></div>
                  </div>
                </div>
                <div className="bt-panel">
                  <div className="bt-panel-title">Equity · $100K</div>
                  <div className="bt-chart-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={customChartData}>
                        <defs>
                          <linearGradient id="csGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--ivory)" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="var(--ivory)" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="csBh" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--mint)" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="var(--mint)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" tick={{ fill: 'var(--faint)', fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: 'var(--faint)', fontSize: 10 }} tickLine={false} axisLine={false} width={48} />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 11, color: 'var(--muted)' }} />
                        <Area type="monotone" dataKey="buyHold" name="Buy & Hold" stroke="var(--mint)" strokeWidth={1.5} fill="url(#csBh)" dot={false} />
                        <Area type="monotone" dataKey="strategy" name="Custom" stroke="var(--ivory)" strokeWidth={2} fill="url(#csGrad)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {tab === 'lab' && <div className="bt-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="bt-panel">
            <div className="bt-panel-title">Asset & Timeframe</div>
            <div className="bt-field">
              <label className="bt-label">Symbol</label>
              <select className="bt-select" value={symbol} onChange={e => setSymbol(e.target.value)}>
                {ASSET_GROUPS.map(g => (
                  <optgroup key={g.group} label={g.group} className="bt-optgroup">
                    {g.items.map(t => <option key={t} value={t}>{t}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="bt-field">
              <label className="bt-label">Period</label>
              <div className="bt-period-row">
                {PERIODS.map(p => (
                  <button key={p} className={`bt-period-btn ${period === p ? 'is-active' : ''}`} onClick={() => setPeriod(p)}>{p}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="bt-panel">
            <div className="bt-panel-title">Strategy</div>
            <div className="bt-field">
              <label className="bt-label">Strategy</label>
              <select className="bt-select" value={strategyId} onChange={e => handleStrategyChange(e.target.value)}>
                {STRATEGY_IDS.map(id => (
                  <option key={id} value={id}>{STRATEGIES[id].name}</option>
                ))}
              </select>
            </div>

            {strategy.paramSchema.map(def => (
              <div className="bt-field" key={def.key}>
                <label className="bt-label">{def.label}</label>
                <div className="bt-range-row">
                  <input
                    type="range"
                    className="bt-range"
                    min={def.min}
                    max={def.max}
                    step={def.step}
                    value={mergedParams[def.key] ?? def.min}
                    onChange={e => setParam(def.key, parseFloat(e.target.value))}
                  />
                  <span className="bt-range-val">
                    {def.kind === 'float' ? (mergedParams[def.key] ?? def.min).toFixed(1) : mergedParams[def.key] ?? def.min}
                  </span>
                </div>
              </div>
            ))}

            <div className="bt-strategy-desc">
              <strong>How it works</strong>
              {strategy.plainEnglish}
              <div className="bt-tag-row">
                <span className="bt-tag">Best: {strategy.bestFor}</span>
                <span className="bt-tag danger">Risk: {strategy.mainRisk}</span>
              </div>
            </div>

            <button className="bt-run-btn" onClick={runBacktest} disabled={loading}>
              {loading ? 'Running…' : `Run ${strategy.name}`}
            </button>
          </div>
        </div>

        <div className="bt-right">
          {error && <div className="bt-error">{error}</div>}

          {s && (
            <div className="bt-panel">
              <div className="bt-panel-title">{result!.strategy.name} · {result!.symbol} · {result!.period}</div>
              <div className="bt-stats-grid">
                <div className="bt-stat"><div className="bt-stat-label">Return</div><div className="bt-stat-value" style={{ color: colorOf(s.totalReturnPct) }}>{fmtPct(s.totalReturnPct)}</div></div>
                <div className="bt-stat"><div className="bt-stat-label">Ann.</div><div className="bt-stat-value" style={{ color: colorOf(s.annualizedReturnPct) }}>{fmtPct(s.annualizedReturnPct)}</div></div>
                <div className="bt-stat"><div className="bt-stat-label">Sharpe</div><div className="bt-stat-value" style={{ color: s.sharpeRatio >= 1 ? 'var(--mint)' : 'var(--ivory)' }}>{fmtNum(s.sharpeRatio)}</div></div>
                <div className="bt-stat"><div className="bt-stat-label">Max DD</div><div className="bt-stat-value" style={{ color: 'var(--red)' }}>-{fmtNum(s.maxDrawdownPct)}%</div></div>
                <div className="bt-stat"><div className="bt-stat-label">Win Rate</div><div className="bt-stat-value" style={{ color: s.winRate >= 50 ? 'var(--mint)' : 'var(--red)' }}>{fmtNum(s.winRate)}%</div></div>
                <div className="bt-stat"><div className="bt-stat-label">Trades</div><div className="bt-stat-value">{s.totalTrades}</div></div>
                <div className="bt-stat"><div className="bt-stat-label">Best</div><div className="bt-stat-value" style={{ color: 'var(--mint)' }}>{fmtPct(s.bestTradePct)}</div></div>
                <div className="bt-stat"><div className="bt-stat-label">Worst</div><div className="bt-stat-value" style={{ color: 'var(--red)' }}>{fmtPct(s.worstTradePct)}</div></div>
                <div className="bt-stat"><div className="bt-stat-label">Calmar</div><div className="bt-stat-value" style={{ color: colorOf(s.calmarRatio) }}>{fmtNum(s.calmarRatio)}</div></div>
              </div>
            </div>
          )}

          <div className="bt-panel">
            <div className="bt-panel-title">Equity Curve · $100K</div>
            {chartData.length > 0 ? (
              <div className="bt-chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="stratGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--ivory)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--ivory)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="bhGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--mint)" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="var(--mint)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fill: 'var(--faint)', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: 'var(--faint)', fontSize: 10 }} tickLine={false} axisLine={false} width={48} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, color: 'var(--muted)' }} />
                    <Area type="monotone" dataKey="buyHold" name="Buy & Hold" stroke="var(--mint)" strokeWidth={1.5} fill="url(#bhGrad)" dot={false} />
                    <Area type="monotone" dataKey="strategy" name={result?.strategy.name ?? 'Strategy'} stroke="var(--ivory)" strokeWidth={2} fill="url(#stratGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="bt-empty">
                <div className="bt-empty-icon">📊</div>
                <div>Configure and run to see results</div>
              </div>
            )}
          </div>
        </div>
      </div>}
    </div>
  )
}