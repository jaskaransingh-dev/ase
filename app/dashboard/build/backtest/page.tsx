'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { 
  LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, ComposedChart, ScatterChart, Scatter
} from 'recharts'
import { 
  ArrowLeft, TrendingUp, TrendingDown, Target, Shield, Award, 
  BarChart3, PieChart, Activity, DollarSign, Percent, Clock,
  RefreshCw, Download, Maximize2, X, ChevronDown
} from 'lucide-react'

const C = {
  bg: '#0D0F14', bg2: '#13151A', bg3: '#181B21', bg4: '#1E2228',
  border: '#2A2E38', border2: '#3B4250',
  blue: '#5B8CFF', blue2: '#78A2FF',
  mint: '#22F0B5', mint2: '#3EF5C5', mintDark: 'rgba(34,240,181,0.12)',
  red: '#FF5468', red2: '#FF7885',
  orange: '#FFB648', orange2: '#FFC570',
  purple: '#A78BFA',
  text: '#C9D1E0', muted: '#8E9AB0', faint: '#6A7890',
  white: '#F5F7FB', gold: '#FFD700',
}

interface BacktestResult {
  symbol: string
  strategy: string
  period: string
  stats: {
    totalReturnPct: number
    annualizedReturnPct: number
    sharpeRatio: number
    sortinoRatio: number
    maxDrawdownPct: number
    maxDrawdownDuration: number
    winRate: number
    totalTrades: number
    profitFactor: number
    calmarRatio: number
    exposureTime: number
    cagr: number
    avgTradeReturn: number
    bestTrade: number
    worstTrade: number
    avgWin: number
    avgLoss: number
    avgTradeDuration: number
  }
  equityCurve: { date: string; strategy: number; buyHold: number; spy?: number }[]
  trades: { date: string; action: string; price: number; return?: number; pnl?: number }[]
  benchmarks: {
    spy: { return: number; sharpe: number; maxDD: number }
    qqq: { return: number; sharpe: number; maxDD: number }
    btc: { return: number; sharpe: number; maxDD: number }
  }
}

const RISK_RANGES = [
  { label: 'Sharpe Ratio', value: 'sharpeRatio', good: '> 1.5', color: C.mint },
  { label: 'Sortino Ratio', value: 'sortinoRatio', good: '> 1.5', color: C.mint },
  { label: 'Max Drawdown', value: 'maxDrawdownPct', good: '< 15%', color: C.red },
  { label: 'Calmar Ratio', value: 'calmarRatio', good: '> 1.0', color: C.mint },
  { label: 'Win Rate', value: 'winRate', good: '> 50%', color: C.mint },
  { label: 'Profit Factor', value: 'profitFactor', good: '> 1.5', color: C.mint },
]

const BENCHMARKS = [
  { id: 'spy', name: 'S&P 500', color: C.blue, icon: '📈' },
  { id: 'qqq', name: 'NASDAQ', color: C.purple, icon: '💻' },
  { id: 'btc', name: 'Bitcoin', color: C.orange, icon: '₿' },
]

export default function BacktestResultsPage() {
  const router = useRouter()
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'trades' | 'risk' | 'monthly'>('overview')
  const [showBenchmarks, setShowBenchmarks] = useState(true)
  const [loading, setLoading] = useState(true)

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    setLoading(false)
    const stored = localStorage.getItem('backtest_result')
    if (!stored) return
    try {
      setResult(JSON.parse(stored))
    } catch (e) {
      console.error('Failed to parse backtest result', e)
    }
  }, [])

  const performanceScore = useMemo(() => {
    if (!result) return 0
    const { stats } = result
    let score = 0
    if (stats.sharpeRatio >= 1.5) score += 25
    else if (stats.sharpeRatio >= 1.0) score += 15
    else if (stats.sharpeRatio >= 0.5) score += 5
    
    if (stats.maxDrawdownPct <= 10) score += 25
    else if (stats.maxDrawdownPct <= 20) score += 15
    else if (stats.maxDrawdownPct <= 30) score += 5
    
    if (stats.winRate >= 60) score += 20
    else if (stats.winRate >= 50) score += 15
    else if (stats.winRate >= 40) score += 10
    
    if (stats.profitFactor >= 2.0) score += 15
    else if (stats.profitFactor >= 1.5) score += 10
    else if (stats.profitFactor >= 1.0) score += 5
    
    if (stats.calmarRatio >= 2.0) score += 15
    else if (stats.calmarRatio >= 1.0) score += 10
    return Math.min(100, score)
  }, [result])

  const drawdownData = useMemo(() => {
    if (!result?.equityCurve) return []
    const peak = result.equityCurve.reduce((max, p) => Math.max(max, p.strategy), 0)
    return result.equityCurve.map(p => ({
      date: p.date,
      drawdown: ((p.strategy - peak) / peak) * 100
    }))
  }, [result])

  const monthlyReturns = useMemo(() => {
    if (!result?.equityCurve) return []
    const monthly: Record<string, { month: string; returns: number }> = {}
    result.equityCurve.forEach((p, i) => {
      if (i === 0) return
      const prev = result.equityCurve[i - 1].strategy
      const ret = ((p.strategy - prev) / prev) * 100
      const month = p.date.substring(0, 7)
      if (monthly[month]) {
        monthly[month].returns = (1 + monthly[month].returns / 100) * (1 + ret / 100) * 100 - 100
      } else {
        monthly[month] = { month, returns: ret }
      }
    })
    return Object.values(monthly).slice(-24)
  }, [result])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: C.bg }}>
        <div style={{ color: C.muted }}>Loading results...</div>
      </div>
    )
  }

  if (!result) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: C.bg }}>
        <div style={{ color: C.muted, marginBottom: '1rem' }}>No backtest results found</div>
        <button 
          onClick={() => router.push('/dashboard/build')}
          style={{ 
            padding: '0.75rem 1.5rem', 
            borderRadius: 8, 
            border: 'none', 
            background: C.blue, 
            color: C.white, 
            cursor: 'pointer',
            fontWeight: 600
          }}
        >
          Back to Build
        </button>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text }}>
      {/* Header */}
      <header style={{ 
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '1rem 1.5rem', borderBottom: `1px solid ${C.border}`, background: C.bg2 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button 
            onClick={() => router.push('/dashboard/build')}
            style={{ 
              padding: '0.5rem', 
              borderRadius: 6, 
              border: `1px solid ${C.border}`, 
              background: 'transparent', 
              color: C.muted, 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 style={{ fontSize: '1.1rem', fontWeight: 700, color: C.white, margin: 0 }}>
              {result.strategy} on {result.symbol}
            </h1>
            <div style={{ fontSize: '0.75rem', color: C.faint }}>
              Period: {result.period} • {result.equityCurve.length} data points
            </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button style={{ 
            padding: '0.5rem 1rem', 
            borderRadius: 6, 
            border: `1px solid ${C.border}`, 
            background: 'transparent', 
            color: C.muted, 
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '0.8rem'
          }}>
            <Download size={14} />Export
          </button>
          <button 
            onClick={() => router.push('/dashboard/build')}
            style={{ 
              padding: '0.5rem 1rem', 
              borderRadius: 6, 
              border: 'none', 
              background: C.mint, 
              color: C.bg, 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontWeight: 600,
              fontSize: '0.8rem'
            }}
          >
            <RefreshCw size={14} />New Backtest
          </button>
        </div>
      </header>

      {/* Performance Score Banner */}
      <div style={{ 
        padding: '1.5rem', 
        background: `linear-gradient(135deg, ${C.bg2} 0%, ${C.bg3} 100%)`,
        borderBottom: `1px solid ${C.border}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: '2rem' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: C.faint, marginBottom: 4 }}>Total Return</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: result.stats.totalReturnPct >= 0 ? C.mint : C.red }}>
                {result.stats.totalReturnPct >= 0 ? '+' : ''}{result.stats.totalReturnPct.toFixed(1)}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: C.faint, marginBottom: 4 }}>Sharpe Ratio</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: result.stats.sharpeRatio >= 1 ? C.mint : result.stats.sharpeRatio >= 0 ? C.orange : C.red }}>
                {result.stats.sharpeRatio.toFixed(2)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: C.faint, marginBottom: 4 }}>Max Drawdown</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: C.red }}>
                -{result.stats.maxDrawdownPct.toFixed(1)}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: C.faint, marginBottom: 4 }}>Win Rate</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: result.stats.winRate >= 50 ? C.mint : C.orange }}>
                {result.stats.winRate.toFixed(0)}%
              </div>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            {/* Benchmark Comparison */}
            {showBenchmarks && (
              <div style={{ display: 'flex', gap: '1rem' }}>
                {result.benchmarks && Object.entries(result.benchmarks).map(([key, b]: [string, any]) => (
                  <div key={key} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.65rem', color: C.faint, marginBottom: 2 }}>
                      {key.toUpperCase()}
                    </div>
                    <div style={{ 
                      fontSize: '1.2rem', 
                      fontWeight: 700, 
                      color: b.return >= result.stats.totalReturnPct ? C.mint : C.red 
                    }}>
                      {b.return >= 0 ? '+' : ''}{b.return.toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {/* Performance Score */}
            <div style={{ 
              padding: '1rem 1.5rem', 
              borderRadius: 12, 
              background: performanceScore >= 75 ? `${C.mint}15` : 
                          performanceScore >= 50 ? `${C.orange}15` : `${C.red}15`,
              border: `1px solid ${performanceScore >= 75 ? C.mint : performanceScore >= 50 ? C.orange : C.red}`
            }}>
              <div style={{ fontSize: '0.7rem', color: C.faint, marginBottom: 4 }}>Score</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: performanceScore >= 75 ? C.mint : performanceScore >= 50 ? C.orange : C.red }}>
                {performanceScore}/100
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ 
        display: 'flex', 
        gap: '0.25rem', 
        padding: '0.75rem 1.5rem', 
        borderBottom: `1px solid ${C.border}`,
        background: C.bg2
      }}>
        {(['overview', 'trades', 'risk', 'monthly'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 6,
              border: 'none',
              background: activeTab === tab ? C.blue : 'transparent',
              color: activeTab === tab ? C.white : C.muted,
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: activeTab === tab ? 600 : 400,
              textTransform: 'capitalize'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: '1.5rem', maxWidth: 1400, margin: '0 auto' }}>
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
            {/* Equity Curve */}
            <div style={{ 
              background: C.bg2, 
              borderRadius: 12, 
              padding: '1.25rem',
              border: `1px solid ${C.border}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: C.white, margin: 0 }}>
                  Equity Curve
                </h3>
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 12, height: 3, background: C.mint, borderRadius: 2 }} />
                    Strategy
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 12, height: 3, background: C.faint, borderRadius: 2, borderStyle: 'dashed' }} />
                    Buy & Hold
                  </span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={350}>
                <ComposedChart data={result.equityCurve}>
                  <defs>
                    <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.mint} stopOpacity={0.2}/>
                      <stop offset="95%" stopColor={C.mint} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.faint }} tickFormatter={(v) => v.substring(5)} interval={Math.floor(result.equityCurve.length / 8)} />
                  <YAxis tick={{ fontSize: 11, fill: C.faint }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} width={65} />
                  <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: '0.8rem' }} />
                  <Area type="monotone" dataKey="strategy" stroke={C.mint} fill="url(#equityGradient)" strokeWidth={2} name="Strategy" />
                  <Line type="monotone" dataKey="buyHold" stroke={C.faint} strokeDasharray="5 5" strokeWidth={2} name="Buy & Hold" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Key Stats */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ background: C.bg2, borderRadius: 12, padding: '1.25rem', border: `1px solid ${C.border}` }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: C.white, margin: '0 0 1rem 0' }}>Risk-Adjusted Returns</h3>
                {RISK_RANGES.slice(0, 4).map(metric => (
                  <div key={metric.value} style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.8rem', color: C.muted }}>{metric.label}</span>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600, color: C.white }}>
                        {(result.stats as any)[metric.value]?.toFixed(2) || '0.00'}
                      </span>
                    </div>
                    <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ 
                        height: '100%', 
                        width: `${Math.min(100, ((result.stats as any)[metric.value] || 0) * 20)}%`,
                        background: metric.color,
                        borderRadius: 2
                      }} />
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ background: C.bg2, borderRadius: 12, padding: '1.25rem', border: `1px solid ${C.border}` }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: C.white, margin: '0 0 1rem 0' }}>Trade Statistics</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: C.faint }}>Total Trades</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600, color: C.white }}>{result.stats.totalTrades}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: C.faint }}>Profit Factor</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600, color: result.stats.profitFactor >= 1.5 ? C.mint : result.stats.profitFactor >= 1 ? C.orange : C.red }}>
                      {result.stats.profitFactor.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: C.faint }}>Avg Win</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600, color: C.mint }}>+{result.stats.avgWin?.toFixed(2) || 0}%</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: C.faint }}>Avg Loss</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600, color: C.red }}>{result.stats.avgLoss?.toFixed(2) || 0}%</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: C.faint }}>Best Trade</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600, color: C.mint }}>+{result.stats.bestTrade?.toFixed(2) || 0}%</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: C.faint }}>Worst Trade</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600, color: C.red }}>{result.stats.worstTrade?.toFixed(2) || 0}%</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'trades' && (
          <div style={{ background: C.bg2, borderRadius: 12, border: `1px solid ${C.border}` }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: `1px solid ${C.border}` }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: C.white, margin: 0 }}>Trade History</h3>
            </div>
            <div style={{ maxHeight: 500, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: C.bg3 }}>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: C.faint, fontWeight: 500 }}>Date</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: C.faint, fontWeight: 500 }}>Action</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: C.faint, fontWeight: 500 }}>Price</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: C.faint, fontWeight: 500 }}>Return</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: C.faint, fontWeight: 500 }}>P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {result.trades.map((trade, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '0.75rem 1rem', color: C.muted }}>{trade.date}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ 
                          padding: '0.25rem 0.5rem', 
                          borderRadius: 4, 
                          background: trade.action === 'BUY' ? `${C.mint}20` : `${C.red}20`,
                          color: trade.action === 'BUY' ? C.mint : C.red,
                          fontSize: '0.75rem',
                          fontWeight: 600
                        }}>
                          {trade.action}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'monospace' }}>
                        ${trade.price.toFixed(2)}
                      </td>
                      <td style={{ 
                        padding: '0.75rem 1rem', 
                        textAlign: 'right', 
                        color: (trade.return || 0) >= 0 ? C.mint : C.red,
                        fontFamily: 'monospace'
                      }}>
                        {trade.return !== undefined ? `${trade.return >= 0 ? '+' : ''}${trade.return.toFixed(2)}%` : '-'}
                      </td>
                      <td style={{ 
                        padding: '0.75rem 1rem', 
                        textAlign: 'right', 
                        color: (trade.pnl || 0) >= 0 ? C.mint : C.red,
                        fontFamily: 'monospace'
                      }}>
                        {trade.pnl !== undefined ? `$${trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'risk' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {/* Drawdown Chart */}
            <div style={{ background: C.bg2, borderRadius: 12, padding: '1.25rem', border: `1px solid ${C.border}` }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: C.white, margin: '0 0 1rem 0' }}>Drawdown</h3>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={drawdownData}>
                  <defs>
                    <linearGradient id="ddGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.red} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={C.red} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.faint }} tickFormatter={(v) => v.substring(5)} interval={Math.floor(drawdownData.length / 6)} />
                  <YAxis tick={{ fontSize: 10, fill: C.faint }} tickFormatter={(v) => `${v.toFixed(0)}%`} width={50} />
                  <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: '0.8rem' }} />
                  <Area type="monotone" dataKey="drawdown" stroke={C.red} fill="url(#ddGradient)" strokeWidth={1} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Risk Metrics */}
            <div style={{ background: C.bg2, borderRadius: 12, padding: '1.25rem', border: `1px solid ${C.border}` }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: C.white, margin: '0 0 1rem 0' }}>Risk Metrics</h3>
              {[
                { label: 'Max Drawdown', value: `${result.stats.maxDrawdownPct.toFixed(2)}%`, color: C.red },
                { label: 'Drawdown Duration', value: `${result.stats.maxDrawdownDuration || 0} days`, color: C.orange },
                { label: 'Calmar Ratio', value: result.stats.calmarRatio.toFixed(2), color: result.stats.calmarRatio >= 1 ? C.mint : C.red },
                { label: 'Sortino Ratio', value: result.stats.sortinoRatio.toFixed(2), color: result.stats.sortinoRatio >= 1.5 ? C.mint : C.orange },
                { label: 'Exposure Time', value: `${(result.stats.exposureTime * 100).toFixed(1)}%`, color: C.blue },
                { label: 'CAGR', value: `${result.stats.cagr?.toFixed(2) || result.stats.annualizedReturnPct.toFixed(2)}%`, color: C.mint },
              ].map(metric => (
                <div key={metric.label} style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  padding: '0.75rem 0',
                  borderBottom: `1px solid ${C.border}`
                }}>
                  <span style={{ color: C.muted, fontSize: '0.85rem' }}>{metric.label}</span>
                  <span style={{ color: metric.color, fontWeight: 600, fontSize: '0.9rem' }}>{metric.value}</span>
                </div>
              ))}
            </div>

            {/* Benchmark Comparison */}
            {result.benchmarks && (
              <div style={{ gridColumn: '1 / -1', background: C.bg2, borderRadius: 12, padding: '1.25rem', border: `1px solid ${C.border}` }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: C.white, margin: '0 0 1rem 0' }}>Benchmark Comparison</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                  <div style={{ 
                    padding: '1rem', 
                    borderRadius: 8, 
                    background: C.bg3,
                    border: `1px solid ${C.border}`
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600, color: C.white }}>Strategy</span>
                    </div>
                    <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.8rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: C.faint }}>Return</span>
                        <span style={{ color: result.stats.totalReturnPct >= 0 ? C.mint : C.red, fontWeight: 600 }}>
                          {result.stats.totalReturnPct >= 0 ? '+' : ''}{result.stats.totalReturnPct.toFixed(1)}%
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: C.faint }}>Sharpe</span>
                        <span style={{ color: C.white, fontWeight: 600 }}>{result.stats.sharpeRatio.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: C.faint }}>Max DD</span>
                        <span style={{ color: C.red, fontWeight: 600 }}>-{result.stats.maxDrawdownPct.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                  
                  {Object.entries(result.benchmarks).map(([key, b]: [string, any]) => {
                    const outperformance = result.stats.totalReturnPct - b.return
                    return (
                      <div key={key} style={{ 
                        padding: '1rem', 
                        borderRadius: 8, 
                        background: C.bg3,
                        border: `1px solid ${C.border}`
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: C.white }}>{key.toUpperCase()}</span>
                          <span style={{ 
                            fontSize: '0.75rem', 
                            padding: '0.2rem 0.5rem',
                            borderRadius: 4,
                            background: outperformance >= 0 ? `${C.mint}20` : `${C.red}20`,
                            color: outperformance >= 0 ? C.mint : C.red
                          }}>
                            {outperformance >= 0 ? '+' : ''}{outperformance.toFixed(1)}%
                          </span>
                        </div>
                        <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.8rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: C.faint }}>Return</span>
                            <span style={{ color: b.return >= 0 ? C.mint : C.red, fontWeight: 600 }}>
                              {b.return >= 0 ? '+' : ''}{b.return.toFixed(1)}%
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: C.faint }}>Sharpe</span>
                            <span style={{ color: C.white, fontWeight: 600 }}>{b.sharpe.toFixed(2)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: C.faint }}>Max DD</span>
                            <span style={{ color: C.red, fontWeight: 600 }}>-{b.maxDD.toFixed(1)}%</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'monthly' && (
          <div style={{ background: C.bg2, borderRadius: 12, border: `1px solid ${C.border}`, padding: '1.25rem' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: C.white, margin: '0 0 1rem 0' }}>Monthly Returns</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyReturns}>
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: C.faint }} />
                <YAxis tick={{ fontSize: 10, fill: C.faint }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
                <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: '0.8rem' }} />
                <Bar dataKey="returns" radius={[4, 4, 0, 0]}>
                  {monthlyReturns.map((entry, index) => (
                    <rect key={`bar-${index}`} fill={entry.returns >= 0 ? C.mint : C.red} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
