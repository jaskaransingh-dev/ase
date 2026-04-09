'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import {
  Area, AreaChart, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { STRATEGIES, runBacktest, runBuyAndHold, type OHLCV } from '@/lib/backtest'

// ──────────────────────────────────────────────
// Agent backtest types
// ──────────────────────────────────────────────
interface AgentEntry {
  id: string; slug: string; name: string; description: string; ticker: string
  symbol: string; strategy: string; params: Record<string, number>
}

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
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

// ──────────────────────────────────────────────
// Asset options (mirrored from algo_lab_refresh)
// ──────────────────────────────────────────────
const ASSET_GROUPS = [
  { group: 'Crypto Spot', items: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'DOGE-USD', 'AVAX-USD', 'LINK-USD'] },
  { group: 'US Market ETFs', items: ['SPY', 'QQQ', 'VOO', 'DIA', 'IWM', 'ARKK'] },
  { group: 'Crypto ETFs', items: ['IBIT', 'FBTC', 'ETHA', 'FETH', 'ARKB', 'BITB'] },
  { group: 'Big Tech', items: ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'TSLA'] },
]

const PERIODS = ['6mo', '1y', '2y', '5y']
const STRATEGY_IDS = Object.keys(STRATEGIES)

function fmtPct(v: number) {
  const s = v >= 0 ? '+' : ''
  return `${s}${v.toFixed(2)}%`
}
function fmtNum(v: number, d = 2) { return v.toFixed(d) }
function colorOf(v: number) { return v >= 0 ? 'var(--bt-pos)' : 'var(--bt-neg)' }

// Custom tooltip
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'rgba(20,15,40,0.96)', border: '1px solid rgba(148,130,255,0.2)', borderRadius: 12, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ color: 'rgba(220,210,255,0.5)', marginBottom: 6 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color, fontWeight: 600 }}>
          {p.name}: ${p.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </div>
      ))}
    </div>
  )
}

// ──────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────
const CUSTOM_CODE_TEMPLATE = `// bars: Array<{ date, open, high, low, close, volume }>
// Return: number[] — same length as bars, 1 = long, 0 = flat
function strategy(bars) {
  const closes = bars.map(b => b.close)
  const window = 20
  const positions = new Array(bars.length).fill(0)

  for (let i = window; i < bars.length; i++) {
    // Simple moving average crossover (fast 10 vs slow 20)
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
  const [agentPeriod, setAgentPeriod] = useState('1y')
  const [agentError, setAgentError] = useState('')

  useEffect(() => {
    fetch('/api/backtest/agents').then(r => r.json()).then(d => setAgents(d.agents ?? []))
  }, [])

  async function runAgentBacktest(agent: AgentEntry) {
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
      setAgentResult(data as BacktestResult)
    } catch (e) {
      setAgentError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setAgentLoading(false)
    }
  }

  // ── Custom Code Lab state ──
  const [customCode, setCustomCode] = useState(CUSTOM_CODE_TEMPLATE)
  const [customSymbol, setCustomSymbol] = useState('BTC-USD')
  const [customPeriod, setCustomPeriod] = useState('2y')
  const [customLoading, setCustomLoading] = useState(false)
  const [customError, setCustomError] = useState('')
  const [customResult, setCustomResult] = useState<BacktestResult | null>(null)

  async function runCustomBacktest() {
    setCustomLoading(true)
    setCustomError('')
    setCustomResult(null)
    try {
      // 1. Fetch OHLCV from our API
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: customSymbol, strategy: 'momentum_crossover', period: customPeriod }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? 'Failed to fetch market data')

      // 2. Reconstruct bare OHLCV bars from the returned bars
      const bars: OHLCV[] = data.bars.map((b: { date: string; close: number; equity: number }) => ({
        date: b.date,
        open: b.close, high: b.close, low: b.close, close: b.close, volume: 0,
      }))

      // 3. Execute user code in a sandboxed Function
      let userFn: (bars: OHLCV[]) => number[]
      try {
        // Wrap in try/catch so syntax errors surface nicely
        // eslint-disable-next-line no-new-func
        userFn = new Function('bars', `
          "use strict";
          ${customCode}
          if (typeof strategy !== 'function') throw new Error('Define a function named strategy(bars)');
          return strategy(bars);
        `) as (bars: OHLCV[]) => number[]
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
        throw new Error(`strategy() must return an array of length ${bars.length} (got ${Array.isArray(positions) ? positions.length : typeof positions})`)
      }

      // 4. Simulate equity curve locally
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

      // 5. Compute stats inline (mirrors lib/backtest computeStats)
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

  // ── Strategy Lab state ──
  const [symbol, setSymbol] = useState('BTC-USD')
  const [strategyId, setStrategyId] = useState('momentum_crossover')
  const [period, setPeriod] = useState('2y')
  const [params, setParams] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<BacktestResult | null>(null)

  const strategy = STRATEGIES[strategyId]
  const mergedParams = { ...strategy.defaultParams, ...params }

  const setParam = useCallback((key: string, val: number) => {
    setParams(prev => ({ ...prev, [key]: val }))
  }, [])

  // Reset params when strategy changes
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

  // Build chart data (sample every N bars to keep it fast)
  const chartData = result
    ? result.bars
        .filter((_, i) => i % Math.max(1, Math.floor(result.bars.length / 300)) === 0)
        .map((b, i) => ({
          date: b.date.slice(5),
          strategy: Math.round(b.equity),
          buyHold: Math.round(result.buyHold[Math.min(i * Math.max(1, Math.floor(result.bars.length / 300)), result.buyHold.length - 1)]?.equity ?? 0),
        }))
    : []

  const s = result?.stats

  return (
    <div className="bt-page">
      <style>{`
        .bt-page {
          min-height: 100vh;
          padding: 2rem 2.5rem;
          max-width: 1400px;
          margin: 0 auto;
        }
        .bt-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem; }
        .bt-chip {
          display: inline-flex; align-items: center; gap: .4rem;
          font-size: .65rem; font-family: var(--font-mono); letter-spacing: .1em; font-weight: 700; text-transform: uppercase;
          padding: .3rem .8rem; border-radius: 999px;
          background: rgba(148,130,255,.1); border: 1px solid rgba(148,130,255,.25); color: #b8a8ff;
        }
        .bt-title { font-size: 1.75rem; font-weight: 800; letter-spacing: -.025em; margin-top: .3rem; }
        .bt-sub   { font-size: .88rem; color: rgba(220,210,255,.5); margin-top: .3rem; }

        .bt-grid { display: grid; grid-template-columns: 320px 1fr; gap: 1.5rem; align-items: start; }
        @media (max-width: 900px) { .bt-grid { grid-template-columns: 1fr; } }

        .bt-panel {
          background: rgba(148,130,255,.04);
          border: 1px solid rgba(148,130,255,.12);
          border-radius: 20px;
          padding: 1.5rem;
        }
        .bt-panel-title { font-size: .75rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: rgba(220,210,255,.45); margin-bottom: 1rem; font-family: var(--font-mono); }

        .bt-label { display: block; font-size: .72rem; font-family: var(--font-mono); letter-spacing: .06em; color: rgba(220,210,255,.45); margin-bottom: .4rem; text-transform: uppercase; }
        .bt-select {
          width: 100%; padding: .65rem .9rem; border-radius: 12px;
          background: rgba(148,130,255,.06); border: 1px solid rgba(148,130,255,.15);
          color: #e8e0ff; font-size: .88rem; outline: none;
          transition: border-color .2s;
          appearance: none;
          cursor: pointer;
        }
        .bt-select:focus { border-color: rgba(148,130,255,.4); }

        .bt-optgroup { color: rgba(148,130,255,.6); font-weight: 700; }

        .bt-field { margin-bottom: 1.1rem; }
        .bt-range-row { display: flex; align-items: center; gap: .75rem; }
        .bt-range { flex: 1; accent-color: #9482ff; cursor: pointer; }
        .bt-range-val {
          min-width: 52px; text-align: right; font-family: var(--font-mono);
          font-size: .82rem; font-weight: 700; color: #b8a8ff;
        }

        .bt-period-row { display: flex; gap: .45rem; flex-wrap: wrap; }
        .bt-period-btn {
          padding: .38rem .85rem; border-radius: 10px; font-size: .8rem; font-weight: 600;
          border: 1px solid rgba(148,130,255,.18); color: rgba(220,210,255,.5);
          background: transparent; cursor: pointer; transition: all .18s;
          font-family: var(--font-mono); letter-spacing: .04em;
        }
        .bt-period-btn:hover { border-color: rgba(148,130,255,.35); color: #e8e0ff; }
        .bt-period-btn.is-active { background: rgba(148,130,255,.12); border-color: rgba(148,130,255,.4); color: #c8b8ff; }

        .bt-run-btn {
          width: 100%; padding: .8rem; border-radius: 14px; font-size: .95rem; font-weight: 700;
          background: linear-gradient(135deg, #9482ff, #c8a0ff, #82c8ff);
          color: #0a0818; border: 0; cursor: pointer; margin-top: 1rem;
          transition: all .2s cubic-bezier(.16,1,.3,1); letter-spacing: -.01em;
        }
        .bt-run-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 10px 32px rgba(148,130,255,.4); }
        .bt-run-btn:disabled { opacity: .5; cursor: not-allowed; transform: none; }

        .bt-strategy-desc {
          margin-top: 1rem; padding: 1rem; border-radius: 12px;
          background: rgba(148,130,255,.05); border: 1px solid rgba(148,130,255,.1);
          font-size: .82rem; color: rgba(220,210,255,.65); line-height: 1.55;
        }
        .bt-strategy-desc strong { color: #c8b8ff; display: block; margin-bottom: .35rem; font-size: .75rem; text-transform: uppercase; letter-spacing: .06em; font-family: var(--font-mono); }

        .bt-right { display: flex; flex-direction: column; gap: 1.5rem; }

        .bt-stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: .75rem; }
        .bt-stat {
          background: rgba(148,130,255,.05); border: 1px solid rgba(148,130,255,.1);
          border-radius: 14px; padding: 1rem 1.1rem;
        }
        .bt-stat-label { font-size: .65rem; font-family: var(--font-mono); letter-spacing: .08em; color: rgba(220,210,255,.4); text-transform: uppercase; margin-bottom: .35rem; }
        .bt-stat-value { font-size: 1.15rem; font-weight: 800; letter-spacing: -.02em; }
        :root { --bt-pos: #6ee7b7; --bt-neg: #f87171; }

        .bt-chart-wrap { height: 300px; }

        .bt-error {
          padding: 1rem 1.2rem; border-radius: 12px;
          background: rgba(248,113,113,.08); border: 1px solid rgba(248,113,113,.2);
          color: #fca5a5; font-size: .88rem;
        }
        .bt-docs-link { font-size: .82rem; color: rgba(148,130,255,.7); text-decoration: underline; }

        .bt-empty {
          height: 300px; display: flex; flex-direction: column; align-items: center; justify-content: center;
          color: rgba(220,210,255,.3); font-size: .9rem; gap: .75rem;
        }
        .bt-empty-icon { font-size: 2.5rem; opacity: .5; }

        .bt-tag-row { display: flex; gap: .5rem; margin-top: .75rem; flex-wrap: wrap; }
        .bt-tag {
          font-size: .68rem; font-family: var(--font-mono); letter-spacing: .06em;
          padding: .22rem .6rem; border-radius: 999px;
          background: rgba(130,200,255,.08); border: 1px solid rgba(130,200,255,.18); color: #8ac8ff;
        }
        .bt-tag.danger { background: rgba(248,113,113,.08); border-color: rgba(248,113,113,.2); color: #fca5a5; }

        .bt-tab-row { display: flex; gap: .5rem; margin-bottom: 1.75rem; }
        .bt-tab {
          padding: .45rem 1.1rem; border-radius: 10px; font-size: .85rem; font-weight: 600;
          border: 1px solid rgba(148,130,255,.18); color: rgba(220,210,255,.5);
          background: transparent; cursor: pointer; transition: all .18s;
        }
        .bt-tab:hover { color: #e8e0ff; border-color: rgba(148,130,255,.35); }
        .bt-tab.is-active { background: rgba(148,130,255,.12); border-color: rgba(148,130,255,.4); color: #c8b8ff; }

        .bt-agent-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; }
        .bt-agent-card {
          background: rgba(148,130,255,.04); border: 1px solid rgba(148,130,255,.1);
          border-radius: 16px; padding: 1.1rem 1.25rem; cursor: pointer;
          transition: all .2s cubic-bezier(.16,1,.3,1);
        }
        .bt-agent-card:hover { border-color: rgba(148,130,255,.3); transform: translateY(-2px); background: rgba(148,130,255,.08); }
        .bt-agent-card.is-selected { border-color: rgba(148,130,255,.5); background: rgba(148,130,255,.1); }
        .bt-agent-name { font-weight: 700; font-size: .92rem; margin-bottom: .25rem; }
        .bt-agent-ticker { font-family: var(--font-mono); font-size: .65rem; color: #b8a8ff; margin-bottom: .5rem; letter-spacing: .08em; }
        .bt-agent-desc { font-size: .78rem; color: rgba(220,210,255,.5); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .bt-agent-meta { display: flex; gap: .5rem; margin-top: .75rem; flex-wrap: wrap; }
        .bt-agent-badge {
          font-size: .65rem; font-family: var(--font-mono); letter-spacing: .04em;
          padding: .18rem .55rem; border-radius: 999px;
          background: rgba(130,200,255,.08); border: 1px solid rgba(130,200,255,.18); color: #8ac8ff;
        }
      `}</style>

      <div className="bt-header">
        <div>
          <div className="bt-chip">Algo Lab</div>
          <div className="bt-title">Strategy Backtester</div>
          <div className="bt-sub">Port of algo_lab_refresh — test any strategy on real historical data</div>
        </div>
        <Link href="/dashboard/backtest/docs" className="bt-docs-link">API Documentation →</Link>
      </div>

      {/* Tab switcher */}
      <div className="bt-tab-row">
        <button className={`bt-tab ${tab === 'lab' ? 'is-active' : ''}`} onClick={() => setTab('lab')}>Strategy Lab</button>
        <button className={`bt-tab ${tab === 'agents' ? 'is-active' : ''}`} onClick={() => setTab('agents')}>Agent Backtest</button>
        <button className={`bt-tab ${tab === 'custom' ? 'is-active' : ''}`} onClick={() => setTab('custom')}>Custom Code</button>
      </div>

      {/* ─── AGENT BACKTEST TAB ─── */}
      {tab === 'agents' && (
        <div>
          <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '.88rem', color: 'rgba(220,210,255,.5)' }}>
              Backtest the 10 live ASE agents using their primary strategy mapped to historical data
            </div>
            <div className="bt-period-row" style={{ marginLeft: 'auto' }}>
              {PERIODS.map(p => (
                <button key={p} className={`bt-period-btn ${agentPeriod === p ? 'is-active' : ''}`} onClick={() => setAgentPeriod(p)}>{p}</button>
              ))}
            </div>
          </div>

          {agentError && <div className="bt-error" style={{ marginBottom: '1rem' }}>{agentError}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
            {/* Agent cards */}
            <div>
              <div className="bt-agent-grid">
                {agents.map(agent => (
                  <div
                    key={agent.id}
                    className={`bt-agent-card ${selectedAgent?.id === agent.id ? 'is-selected' : ''}`}
                    onClick={() => runAgentBacktest(agent)}
                  >
                    <div className="bt-agent-ticker">{agent.ticker}</div>
                    <div className="bt-agent-name">{agent.name}</div>
                    <div className="bt-agent-desc">{agent.description}</div>
                    <div className="bt-agent-meta">
                      <span className="bt-agent-badge" title="Symbol locked — agent strategy is designed for this asset only" style={{ borderColor: 'rgba(110,231,183,.25)', color: '#6EE7B7', background: 'rgba(110,231,183,.06)' }}>
                        🔒 {agent.symbol}
                      </span>
                      <span className="bt-agent-badge">{STRATEGIES[agent.strategy]?.name ?? agent.strategy}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Agent result panel */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {agentLoading && (
                <div className="bt-panel" style={{ textAlign: 'center', padding: '2rem', color: 'rgba(220,210,255,.4)' }}>
                  Running backtest for {selectedAgent?.name}…
                </div>
              )}
              {agentResult && !agentLoading && (() => {
                const sa = agentResult.stats
                const agentChartData = agentResult.bars
                  .filter((_, i) => i % Math.max(1, Math.floor(agentResult.bars.length / 300)) === 0)
                  .map((b, i) => ({
                    date: b.date.slice(5),
                    strategy: Math.round(b.equity),
                    buyHold: Math.round(agentResult.buyHold[Math.min(i * Math.max(1, Math.floor(agentResult.bars.length / 300)), agentResult.buyHold.length - 1)]?.equity ?? 0),
                  }))
                return (
                  <>
                    <div className="bt-panel">
                      <div className="bt-panel-title">{selectedAgent?.name} · {agentResult.symbol} · {agentPeriod}</div>
                      <div className="bt-stats-grid">
                        <div className="bt-stat"><div className="bt-stat-label">Total Return</div><div className="bt-stat-value" style={{ color: colorOf(sa.totalReturnPct) }}>{fmtPct(sa.totalReturnPct)}</div></div>
                        <div className="bt-stat"><div className="bt-stat-label">Ann. Return</div><div className="bt-stat-value" style={{ color: colorOf(sa.annualizedReturnPct) }}>{fmtPct(sa.annualizedReturnPct)}</div></div>
                        <div className="bt-stat"><div className="bt-stat-label">Sharpe</div><div className="bt-stat-value" style={{ color: sa.sharpeRatio >= 1 ? 'var(--bt-pos)' : '#fde68a' }}>{fmtNum(sa.sharpeRatio)}</div></div>
                        <div className="bt-stat"><div className="bt-stat-label">Max Drawdown</div><div className="bt-stat-value" style={{ color: 'var(--bt-neg)' }}>-{fmtNum(sa.maxDrawdownPct)}%</div></div>
                        <div className="bt-stat"><div className="bt-stat-label">Win Rate</div><div className="bt-stat-value" style={{ color: sa.winRate >= 50 ? 'var(--bt-pos)' : 'var(--bt-neg)' }}>{fmtNum(sa.winRate)}%</div></div>
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
                                <stop offset="5%" stopColor="#9482ff" stopOpacity={0.35} />
                                <stop offset="95%" stopColor="#9482ff" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="ag2" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6ee7b7" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#6ee7b7" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="date" tick={{ fill: 'rgba(220,210,255,.3)', fontSize: 10 }} tickLine={false} axisLine={false} />
                            <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: 'rgba(220,210,255,.3)', fontSize: 10 }} tickLine={false} axisLine={false} width={52} />
                            <Tooltip content={<ChartTooltip />} />
                            <Legend wrapperStyle={{ fontSize: 11, color: 'rgba(220,210,255,.5)' }} />
                            <Area type="monotone" dataKey="buyHold" name="Buy & Hold" stroke="#6ee7b7" strokeWidth={1.5} fill="url(#ag2)" dot={false} />
                            <Area type="monotone" dataKey="strategy" name="Agent Strategy" stroke="#9482ff" strokeWidth={2.2} fill="url(#ag1)" dot={false} />
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
                    <div>Click an agent card to run its backtest</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── CUSTOM CODE TAB ─── */}
      {tab === 'custom' && (
        <div>
          <style>{`
            .bt-editor {
              width: 100%; min-height: 320px; resize: vertical;
              font-family: var(--font-mono); font-size: .8rem; line-height: 1.6;
              background: rgba(10,8,24,0.95); border: 1px solid rgba(148,130,255,.2);
              border-radius: 14px; color: #c8b8ff; padding: 1rem 1.2rem;
              outline: none; tab-size: 2;
            }
            .bt-editor:focus { border-color: rgba(148,130,255,.45); }
          `}</style>

          <div style={{ marginBottom: '1rem', fontSize: '.88rem', color: 'rgba(220,210,255,.5)', lineHeight: 1.6 }}>
            Write a <code style={{ color: '#b8a8ff', fontFamily: 'var(--font-mono)', fontSize: '.8rem' }}>strategy(bars)</code> function that receives OHLCV bars and returns a{' '}
            <code style={{ color: '#b8a8ff', fontFamily: 'var(--font-mono)', fontSize: '.8rem' }}>number[]</code> of positions (1 = long, 0 = flat).
            Code runs locally in your browser — no data leaves the page.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem', alignItems: 'start' }} className="custom-grid">
            {/* Code editor */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <textarea
                className="bt-editor"
                value={customCode}
                onChange={e => setCustomCode(e.target.value)}
                spellCheck={false}
                onKeyDown={e => {
                  // Tab key inserts spaces instead of changing focus
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
              {customError && <div className="bt-error">{customError}</div>}
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
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

              <div className="bt-panel" style={{ fontSize: '.78rem', color: 'rgba(220,210,255,.5)', lineHeight: 1.65 }}>
                <div className="bt-panel-title">Available Helpers</div>
                <div style={{ fontFamily: 'var(--font-mono)', display: 'flex', flexDirection: 'column', gap: '.4rem', fontSize: '.72rem' }}>
                  <div><span style={{ color: '#b8a8ff' }}>bars[i].close</span> — closing price</div>
                  <div><span style={{ color: '#b8a8ff' }}>bars[i].open/high/low</span> — OHLC</div>
                  <div><span style={{ color: '#b8a8ff' }}>bars[i].volume</span> — volume</div>
                  <div><span style={{ color: '#b8a8ff' }}>bars[i].date</span> — ISO date string</div>
                  <div style={{ marginTop: '.5rem', color: 'rgba(220,210,255,.35)' }}>Standard JS Math, Array methods available. No fetch or DOM access.</div>
                </div>
              </div>
            </div>
          </div>

          {/* Custom code results */}
          {customResult && !customLoading && (() => {
            const cs = customResult.stats
            const customChartData = customResult.bars
              .filter((_, i) => i % Math.max(1, Math.floor(customResult.bars.length / 300)) === 0)
              .map((b, i) => ({
                date: b.date.slice(5),
                strategy: Math.round(b.equity),
                buyHold: Math.round(customResult.buyHold[Math.min(i * Math.max(1, Math.floor(customResult.bars.length / 300)), customResult.buyHold.length - 1)]?.equity ?? 0),
              }))
            return (
              <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div className="bt-panel">
                  <div className="bt-panel-title">Custom Strategy · {customResult.symbol} · {customResult.period}</div>
                  <div className="bt-stats-grid">
                    <div className="bt-stat"><div className="bt-stat-label">Total Return</div><div className="bt-stat-value" style={{ color: colorOf(cs.totalReturnPct) }}>{fmtPct(cs.totalReturnPct)}</div></div>
                    <div className="bt-stat"><div className="bt-stat-label">Ann. Return</div><div className="bt-stat-value" style={{ color: colorOf(cs.annualizedReturnPct) }}>{fmtPct(cs.annualizedReturnPct)}</div></div>
                    <div className="bt-stat"><div className="bt-stat-label">Sharpe</div><div className="bt-stat-value" style={{ color: cs.sharpeRatio >= 1 ? 'var(--bt-pos)' : cs.sharpeRatio >= 0 ? '#fde68a' : 'var(--bt-neg)' }}>{fmtNum(cs.sharpeRatio)}</div></div>
                    <div className="bt-stat"><div className="bt-stat-label">Max Drawdown</div><div className="bt-stat-value" style={{ color: 'var(--bt-neg)' }}>-{fmtNum(cs.maxDrawdownPct)}%</div></div>
                    <div className="bt-stat"><div className="bt-stat-label">Win Rate</div><div className="bt-stat-value" style={{ color: cs.winRate >= 50 ? 'var(--bt-pos)' : 'var(--bt-neg)' }}>{fmtNum(cs.winRate)}%</div></div>
                    <div className="bt-stat"><div className="bt-stat-label">Trades</div><div className="bt-stat-value">{cs.totalTrades}</div></div>
                    <div className="bt-stat"><div className="bt-stat-label">Best Trade</div><div className="bt-stat-value" style={{ color: 'var(--bt-pos)' }}>{fmtPct(cs.bestTradePct)}</div></div>
                    <div className="bt-stat"><div className="bt-stat-label">Worst Trade</div><div className="bt-stat-value" style={{ color: 'var(--bt-neg)' }}>{fmtPct(cs.worstTradePct)}</div></div>
                    <div className="bt-stat"><div className="bt-stat-label">Calmar</div><div className="bt-stat-value" style={{ color: colorOf(cs.calmarRatio) }}>{fmtNum(cs.calmarRatio)}</div></div>
                  </div>
                </div>
                <div className="bt-panel">
                  <div className="bt-panel-title">Equity Curve · $100K initial capital</div>
                  <div className="bt-chart-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={customChartData}>
                        <defs>
                          <linearGradient id="csGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#9482ff" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#9482ff" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="csBh" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6ee7b7" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#6ee7b7" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" tick={{ fill: 'rgba(220,210,255,.3)', fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: 'rgba(220,210,255,.3)', fontSize: 10 }} tickLine={false} axisLine={false} width={52} />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 11, color: 'rgba(220,210,255,.5)' }} />
                        <Area type="monotone" dataKey="buyHold" name="Buy & Hold" stroke="#6ee7b7" strokeWidth={1.5} fill="url(#csBh)" dot={false} />
                        <Area type="monotone" dataKey="strategy" name="Custom Strategy" stroke="#9482ff" strokeWidth={2.2} fill="url(#csGrad)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )
          })()}

          <style>{`
            @media (max-width: 900px) { .custom-grid { grid-template-columns: 1fr !important; } }
          `}</style>
        </div>
      )}

      {/* ─── STRATEGY LAB TAB ─── */}
      {tab === 'lab' && <div className="bt-grid">
        {/* ─── Left panel: controls ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
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
                  <button key={p} className={`bt-period-btn ${period === p ? 'is-active' : ''}`} onClick={() => setPeriod(p)}>
                    {p}
                  </button>
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
                <span className="bt-tag">Best for: {strategy.bestFor}</span>
                <span className="bt-tag danger">Risk: {strategy.mainRisk}</span>
              </div>
            </div>

            <button className="bt-run-btn" onClick={runBacktest} disabled={loading}>
              {loading ? 'Running backtest…' : `Run ${strategy.name}`}
            </button>
          </div>
        </div>

        {/* ─── Right panel: results ─── */}
        <div className="bt-right">
          {error && <div className="bt-error">{error}</div>}

          {/* Stats grid */}
          {s && (
            <div className="bt-panel">
              <div className="bt-panel-title">
                {result!.strategy.name} · {result!.symbol} · {result!.period}
              </div>
              <div className="bt-stats-grid">
                <div className="bt-stat">
                  <div className="bt-stat-label">Total Return</div>
                  <div className="bt-stat-value" style={{ color: colorOf(s.totalReturnPct) }}>{fmtPct(s.totalReturnPct)}</div>
                </div>
                <div className="bt-stat">
                  <div className="bt-stat-label">Ann. Return</div>
                  <div className="bt-stat-value" style={{ color: colorOf(s.annualizedReturnPct) }}>{fmtPct(s.annualizedReturnPct)}</div>
                </div>
                <div className="bt-stat">
                  <div className="bt-stat-label">Sharpe</div>
                  <div className="bt-stat-value" style={{ color: s.sharpeRatio >= 1 ? 'var(--bt-pos)' : s.sharpeRatio >= 0 ? '#fde68a' : 'var(--bt-neg)' }}>{fmtNum(s.sharpeRatio)}</div>
                </div>
                <div className="bt-stat">
                  <div className="bt-stat-label">Max Drawdown</div>
                  <div className="bt-stat-value" style={{ color: 'var(--bt-neg)' }}>-{fmtNum(s.maxDrawdownPct)}%</div>
                </div>
                <div className="bt-stat">
                  <div className="bt-stat-label">Win Rate</div>
                  <div className="bt-stat-value" style={{ color: s.winRate >= 50 ? 'var(--bt-pos)' : 'var(--bt-neg)' }}>{fmtNum(s.winRate)}%</div>
                </div>
                <div className="bt-stat">
                  <div className="bt-stat-label">Total Trades</div>
                  <div className="bt-stat-value">{s.totalTrades}</div>
                </div>
                <div className="bt-stat">
                  <div className="bt-stat-label">Best Trade</div>
                  <div className="bt-stat-value" style={{ color: 'var(--bt-pos)' }}>{fmtPct(s.bestTradePct)}</div>
                </div>
                <div className="bt-stat">
                  <div className="bt-stat-label">Worst Trade</div>
                  <div className="bt-stat-value" style={{ color: 'var(--bt-neg)' }}>{fmtPct(s.worstTradePct)}</div>
                </div>
                <div className="bt-stat">
                  <div className="bt-stat-label">Calmar</div>
                  <div className="bt-stat-value" style={{ color: colorOf(s.calmarRatio) }}>{fmtNum(s.calmarRatio)}</div>
                </div>
                <div className="bt-stat">
                  <div className="bt-stat-label">Avg Duration</div>
                  <div className="bt-stat-value">{s.avgTradeDurationDays}d</div>
                </div>
              </div>
            </div>
          )}

          {/* Equity chart */}
          <div className="bt-panel">
            <div className="bt-panel-title">Equity Curve · $100K initial capital</div>
            {chartData.length > 0 ? (
              <div className="bt-chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="stratGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#9482ff" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#9482ff" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="bhGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6ee7b7" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#6ee7b7" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fill: 'rgba(220,210,255,.3)', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis
                      tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                      tick={{ fill: 'rgba(220,210,255,.3)', fontSize: 10 }}
                      tickLine={false} axisLine={false} width={52}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, color: 'rgba(220,210,255,.5)' }} />
                    <Area type="monotone" dataKey="buyHold" name="Buy & Hold" stroke="#6ee7b7" strokeWidth={1.5} fill="url(#bhGrad)" dot={false} />
                    <Area type="monotone" dataKey="strategy" name={result?.strategy.name ?? 'Strategy'} stroke="#9482ff" strokeWidth={2.2} fill="url(#stratGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="bt-empty">
                <div className="bt-empty-icon">📊</div>
                <div>Configure a strategy and click Run to see results</div>
              </div>
            )}
          </div>
        </div>
      </div>}
    </div>
  )
}
