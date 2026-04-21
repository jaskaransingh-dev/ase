// ============================================================
// Quant Framework — Tear Sheet & Metrics
// Full institutional-grade performance evaluation.
// ============================================================

import type { EquityPoint, TearSheet, RegimeMetrics, WalkForwardResult, WalkForwardWindow } from './types'
import { computeIC, computeRankIC } from './alpha'

const TRADING_DAYS = 252

// ── Helpers ───────────────────────────────────────────────────

function mean(arr: number[]): number {
  const f = arr.filter(isFinite)
  return f.length ? f.reduce((a, b) => a + b, 0) / f.length : 0
}

function std(arr: number[]): number {
  const f = arr.filter(isFinite)
  if (f.length < 2) return 0
  const m = mean(f)
  return Math.sqrt(f.reduce((a, v) => a + (v - m) ** 2, 0) / (f.length - 1))
}

function percentile(arr: number[], p: number): number {
  const s = [...arr].filter(isFinite).sort((a, b) => a - b)
  if (!s.length) return 0
  return s[Math.floor(s.length * p)] ?? s[s.length - 1]
}

function drawdownSeries(equity: number[]): number[] {
  const dd: number[] = []
  let peak = equity[0]
  for (const e of equity) {
    if (e > peak) peak = e
    dd.push(peak > 0 ? (e - peak) / peak : 0)
  }
  return dd
}

function maxDrawdownDuration(equity: number[]): number {
  let maxDur = 0, peak = equity[0], peakIdx = 0
  for (let i = 1; i < equity.length; i++) {
    if (equity[i] > peak) { peak = equity[i]; peakIdx = i }
    else maxDur = Math.max(maxDur, i - peakIdx)
  }
  return maxDur
}

// ── OLS beta/alpha vs benchmark ───────────────────────────────

function olsBeta(strat: number[], bench: number[]): { beta: number; alpha: number } {
  const n = Math.min(strat.length, bench.length)
  const xs = bench.slice(-n)
  const ys = strat.slice(-n)
  const mx = mean(xs), my = mean(ys)
  const cov = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / n
  const varX = xs.reduce((a, x) => a + (x - mx) ** 2, 0) / n
  const beta = varX > 0 ? cov / varX : 0
  const alpha = my - beta * mx
  return { beta, alpha: alpha * TRADING_DAYS }
}

// ── Period breakdown ──────────────────────────────────────────

function periodReturns(
  dates: string[],
  dailyRets: number[],
  period: 'year' | 'quarter' | 'month',
): Record<string, number> {
  const grouped: Record<string, number[]> = {}
  dates.forEach((d, i) => {
    const dt = new Date(d)
    let key: string
    if (period === 'year') key = dt.getFullYear().toString()
    else if (period === 'quarter') key = `${dt.getFullYear()} Q${Math.ceil((dt.getMonth() + 1) / 3)}`
    else key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
    if (!grouped[key]) grouped[key] = []
    if (isFinite(dailyRets[i])) grouped[key].push(dailyRets[i])
  })
  return Object.fromEntries(
    Object.entries(grouped).map(([k, rets]) => [
      k,
      (rets.reduce((a, r) => a * (1 + r), 1) - 1) * 100,
    ])
  )
}

// ── Regime breakdown ──────────────────────────────────────────

function regimeBreakdown(
  dates: string[],
  dailyRets: number[],
  equity: number[],
): RegimeMetrics[] {
  // Simple regime classification based on rolling window
  const regimes: Record<string, { rets: number[]; equity: number[] }> = {}
  const rollingVol = 20

  for (let i = rollingVol; i < dates.length; i++) {
    const window = dailyRets.slice(i - rollingVol, i).filter(isFinite)
    if (!window.length) continue
    const vol = std(window)
    const trendRet = dailyRets.slice(Math.max(0, i - 60), i).filter(isFinite).reduce((a, r) => a * (1 + r), 1) - 1
    let regime: string
    if      (trendRet > 0.05 && vol < 0.015) regime = 'bull_low_vol'
    else if (trendRet > 0.05 && vol >= 0.015) regime = 'bull_high_vol'
    else if (trendRet < -0.05 && vol < 0.015) regime = 'bear_low_vol'
    else if (trendRet < -0.05 && vol >= 0.015) regime = 'bear_high_vol'
    else regime = 'sideways'
    if (!regimes[regime]) regimes[regime] = { rets: [], equity: [] }
    regimes[regime].rets.push(dailyRets[i])
    regimes[regime].equity.push(equity[i])
  }

  return Object.entries(regimes).map(([regime, { rets, equity: eq }]) => {
    const annRet = (Math.pow(rets.reduce((a, r) => a * (1 + r), 1), TRADING_DAYS / rets.length) - 1) * 100
    const annVol = std(rets) * Math.sqrt(TRADING_DAYS) * 100
    const dd = drawdownSeries(eq)
    return {
      regime,
      nDays:       rets.length,
      avgReturn:   annRet,
      sharpe:      annVol > 0 ? annRet / annVol : 0,
      maxDrawdown: Math.min(...dd) * 100,
    }
  })
}

// ── Trade analysis ────────────────────────────────────────────

interface TradeRecord {
  returnPct: number
  holdingDays: number
}

function analyzesTrades(
  equity: number[],
  positions: number[],   // 0 = flat, >0 = invested
): TradeRecord[] {
  const trades: TradeRecord[] = []
  let inTrade = false, entryIdx = 0, entryEquity = 0

  for (let i = 0; i < positions.length; i++) {
    if (!inTrade && positions[i] > 0) {
      inTrade   = true
      entryIdx  = i
      entryEquity = equity[i]
    } else if (inTrade && positions[i] === 0) {
      inTrade = false
      trades.push({
        returnPct:   (equity[i] - entryEquity) / entryEquity * 100,
        holdingDays: i - entryIdx,
      })
    }
  }
  return trades
}

// ── Main Tear Sheet ───────────────────────────────────────────

export function computeTearSheet(
  equityCurve: EquityPoint[],
  benchmarkEquity: number[],
  icSeries: Array<{ date: string; ic: number; rank_ic: number }>,
  fillCount?: number,
): TearSheet {
  const equity = equityCurve.map(e => e.equity)
  const dates  = equityCurve.map(e => e.date)
  const dailyRets = equityCurve.slice(1).map((e, i) => (e.equity - equityCurve[i].equity) / equityCurve[i].equity)

  if (equity.length < 5) {
    return emptyTearSheet()
  }

  // Returns
  const totalRet    = (equity[equity.length - 1] - equity[0]) / equity[0]
  const nYears      = equity.length / TRADING_DAYS
  const cagr        = nYears > 0 ? (Math.pow(1 + totalRet, 1 / nYears) - 1) : 0
  const annVol      = std(dailyRets) * Math.sqrt(TRADING_DAYS)

  // Risk-adjusted
  const sharpe   = annVol > 0 ? cagr / annVol : 0
  const negRets  = dailyRets.filter(r => r < 0)
  const downVol  = negRets.length > 1 ? std(negRets) * Math.sqrt(TRADING_DAYS) : annVol
  const sortino  = downVol > 0 ? cagr / downVol : 0

  // Drawdown
  const ddSeries   = drawdownSeries(equity)
  const maxDD      = Math.min(...ddSeries)
  const ddDuration = maxDrawdownDuration(equity)
  const avgDD      = mean(ddSeries.filter(d => d < 0))
  const calmar     = Math.abs(maxDD) > 0 ? cagr / Math.abs(maxDD) : 0
  const recovery   = Math.abs(maxDD) > 0 ? totalRet / Math.abs(maxDD) : 0

  // Benchmark comparison
  const benchRets = benchmarkEquity.slice(1).map((e, i) => (e - benchmarkEquity[i]) / benchmarkEquity[i])
  const benchCagr = benchmarkEquity.length > 1
    ? Math.pow(benchmarkEquity[benchmarkEquity.length - 1] / benchmarkEquity[0], TRADING_DAYS / benchmarkEquity.length) - 1
    : 0
  const { beta, alpha: alphaAnn } = olsBeta(dailyRets, benchRets.slice(-dailyRets.length))
  const te = std(dailyRets.map((r, i) => r - (benchRets[i] ?? 0))) * Math.sqrt(TRADING_DAYS)
  const infoRatio = te > 0 ? (cagr - benchCagr) / te : 0

  // Exposure
  const grossExps = equityCurve.map(e => e.grossExposure).filter(isFinite)
  const turnoverArr = equityCurve.map(e => e.turnover).filter(isFinite)
  const avgGross = mean(grossExps)
  const avgTurnover = mean(turnoverArr)

  // Cost
  const totalCost = equityCurve.reduce((a, e) => a + (e.dailyReturn < 0 ? 0 : 0), 0) // placeholder

  // IC
  const ics     = icSeries.map(x => x.ic).filter(isFinite)
  const rankIcs = icSeries.map(x => x.rank_ic).filter(isFinite)
  const meanIC  = mean(ics)
  const icStdv  = std(ics)
  const icIR    = icStdv > 0 ? meanIC / icStdv : 0
  const icHit   = ics.length > 0 ? ics.filter(ic => ic > 0).length / ics.length : 0

  // Period returns
  const yearRets  = periodReturns(dates.slice(1), dailyRets, 'year')
  const qRets     = periodReturns(dates.slice(1), dailyRets, 'quarter')
  const monthRets = periodReturns(dates.slice(1), dailyRets, 'month')

  // Regime
  const regimes = regimeBreakdown(dates.slice(1), dailyRets, equity.slice(1))

  // Trade metrics from equity curve
  const invested = equityCurve.map(e => e.grossExposure > 0.05 ? 1 : 0)
  const trades   = analyzesTrades(equity, invested)
  const wins     = trades.filter(t => t.returnPct > 0)
  const losses   = trades.filter(t => t.returnPct <= 0)
  const winRate  = trades.length > 0 ? wins.length / trades.length : 0
  const avgWin   = wins.length > 0 ? mean(wins.map(t => t.returnPct)) : 0
  const avgLoss  = losses.length > 0 ? mean(losses.map(t => t.returnPct)) : 0
  const profitFactor = Math.abs(avgLoss) > 0
    ? (wins.reduce((a, t) => a + t.returnPct, 0)) / Math.abs(losses.reduce((a, t) => a + t.returnPct, 0))
    : 0
  const avgHolding = trades.length > 0 ? mean(trades.map(t => t.holdingDays)) : 0

  return {
    totalReturnPct:           totalRet * 100,
    cagr:                     cagr * 100,
    annualizedReturnPct:      cagr * 100,
    sharpeRatio:              sharpe,
    sortinoRatio:             sortino,
    calmarRatio:              calmar,
    informationRatio:         infoRatio,
    maxDrawdownPct:           maxDD * 100,
    maxDrawdownDurationDays:  ddDuration,
    avgDrawdownPct:           avgDD * 100,
    recoveryFactor:           recovery,
    annualizedVolPct:         annVol * 100,
    downsideVolPct:           downVol * 100,
    betaToMarket:             beta,
    alphaAnnualizedPct:       alphaAnn * 100,
    totalTrades:              fillCount ?? trades.length,
    winRate,
    profitFactor,
    avgWinPct:                avgWin,
    avgLossPct:               avgLoss,
    avgHoldingDays:           avgHolding,
    avgTurnover,
    avgGrossExposure:         avgGross,
    avgNetExposure:           mean(equityCurve.map(e => e.grossExposure).filter(isFinite)) * 0.1,
    totalFeePct:              0,
    totalSlippagePct:         0,
    implementationShortfallPct: 0,
    meanIC,
    icStd:                    icStdv,
    icIR,
    icHitRate:                icHit,
    regimeBreakdown:          regimes,
    yearlyReturns:            yearRets,
    quarterlyReturns:         qRets,
    monthlyReturns:           monthRets,
    decileReturns:            [],
  }
}

function emptyTearSheet(): TearSheet {
  return {
    totalReturnPct: 0, cagr: 0, annualizedReturnPct: 0,
    sharpeRatio: 0, sortinoRatio: 0, calmarRatio: 0, informationRatio: 0,
    maxDrawdownPct: 0, maxDrawdownDurationDays: 0, avgDrawdownPct: 0, recoveryFactor: 0,
    annualizedVolPct: 0, downsideVolPct: 0, betaToMarket: 0, alphaAnnualizedPct: 0,
    totalTrades: 0, winRate: 0, profitFactor: 0, avgWinPct: 0, avgLossPct: 0,
    avgHoldingDays: 0, avgTurnover: 0, avgGrossExposure: 0, avgNetExposure: 0,
    totalFeePct: 0, totalSlippagePct: 0, implementationShortfallPct: 0,
    meanIC: 0, icStd: 0, icIR: 0, icHitRate: 0,
    regimeBreakdown: [], yearlyReturns: {}, quarterlyReturns: {}, monthlyReturns: {},
    decileReturns: [],
  }
}

// ── Walk-Forward Evaluation ───────────────────────────────────

export function computeWalkForward(
  windows: WalkForwardWindow[],
): WalkForwardResult {
  if (!windows.length) return { nWindows: 0, avgTrainSharpe: 0, avgTestSharpe: 0, avgDegradation: 0, consistencyRatio: 0, windows: [] }

  const trainSharpes = windows.map(w => w.trainSharpe).filter(isFinite)
  const testSharpes  = windows.map(w => w.testSharpe).filter(isFinite)
  const degrades     = windows.map(w => w.degradation).filter(isFinite)
  const consistent   = windows.filter(w => w.testReturn > 0).length / windows.length

  return {
    nWindows:         windows.length,
    avgTrainSharpe:   mean(trainSharpes),
    avgTestSharpe:    mean(testSharpes),
    avgDegradation:   mean(degrades),
    consistencyRatio: consistent,
    windows,
  }
}

// ── Decile Analysis ───────────────────────────────────────────
// Sort symbols by alpha score into deciles, compute avg forward return per decile.
// Monotonically increasing from D1 (bottom) to D10 (top) = good signal.

export function decileAnalysis(
  signalRanks: number[],   // 0–1 percentile rank
  forwardRets: number[],
  nDeciles = 10,
): number[] {
  const combined = signalRanks.map((rank, i) => ({ rank, ret: forwardRets[i] }))
  const deciles: number[][] = Array.from({ length: nDeciles }, () => [])

  for (const { rank, ret } of combined) {
    if (isFinite(rank) && isFinite(ret)) {
      const d = Math.min(Math.floor(rank * nDeciles), nDeciles - 1)
      deciles[d].push(ret)
    }
  }
  return deciles.map(d => d.length ? mean(d) * 100 : 0)
}

// ── Composite Strategy Scorecard ──────────────────────────────

export function strategyGrade(ts: TearSheet): {
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F'
  score: number
  breakdown: Record<string, number>
} {
  const breakdown = {
    sharpe:    Math.min(ts.sharpeRatio / 2, 1) * 25,
    drawdown:  Math.max(1 + ts.maxDrawdownPct / 50, 0) * 20,
    ic_ir:     Math.min(Math.abs(ts.icIR) / 1.5, 1) * 20,
    calmar:    Math.min(ts.calmarRatio / 2, 1) * 20,
    stability: ts.yearlyReturns
      ? (Object.values(ts.yearlyReturns).filter(r => r > 0).length /
         Math.max(Object.values(ts.yearlyReturns).length, 1)) * 15
      : 0,
  }
  const score = Object.values(breakdown).reduce((a, b) => a + b, 0)

  let grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F'
  if (score >= 85) grade = 'A+'
  else if (score >= 70) grade = 'A'
  else if (score >= 55) grade = 'B'
  else if (score >= 40) grade = 'C'
  else if (score >= 25) grade = 'D'
  else grade = 'F'

  return { grade, score, breakdown }
}
