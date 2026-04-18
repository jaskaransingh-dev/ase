// ============================================================
// Quant Framework — Event-Driven Backtester
// Sequential simulation through time with full state tracking.
// Each rebalance date runs all 9 layers in order.
// ============================================================

import type {
  Bar, BarPanel, BacktestConfig, PortfolioState,
  EquityPoint, Order, Fill, AllocationRow, WalkForwardWindow,
} from './types'
import type { QuantStrategyPackage } from './types'
import { FeatureEngine } from './features'
import { createAlphaModel, computeIC, computeRankIC } from './alpha'
import { estimateLedoitWolf } from './risk'
import { computePortfolioRisk } from './risk'
import { PortfolioOptimizer } from './portfolio'
import { ExecutionModel } from './execution'
import { RiskManager, KillSwitch } from './risk_manager'
import { computeTearSheet, computeWalkForward } from './metrics'

// ── Date utilities ────────────────────────────────────────────

function parseDate(s: string): Date { return new Date(s) }
function fmt(d: Date): string { return d.toISOString().slice(0, 10) }
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
function isWeekday(d: Date): boolean { return d.getDay() !== 0 && d.getDay() !== 6 }

function getRebalanceDates(allDates: string[], freq: 'daily' | 'weekly' | 'monthly'): Set<string> {
  if (freq === 'daily') return new Set(allDates)
  const set = new Set<string>()
  let lastRebalance: Date | null = null

  for (const d of allDates) {
    const dt = parseDate(d)
    if (freq === 'weekly') {
      if (!lastRebalance || (dt.getTime() - lastRebalance.getTime()) >= 7 * 86400000) {
        set.add(d); lastRebalance = dt
      }
    } else {  // monthly
      if (!lastRebalance || dt.getMonth() !== lastRebalance.getMonth() || dt.getFullYear() !== lastRebalance.getFullYear()) {
        set.add(d); lastRebalance = dt
      }
    }
  }
  return set
}

// ── Bar helpers ───────────────────────────────────────────────

function getPrices(panel: BarPanel, date: string): Record<string, number> {
  const prices: Record<string, number> = {}
  for (const [sym, bars] of Object.entries(panel)) {
    const bar = bars.find(b => b.date === date)
    if (bar) prices[sym] = bar.close
  }
  return prices
}

function getADV(panel: BarPanel, date: string, window = 20): Record<string, number> {
  const adv: Record<string, number> = {}
  for (const [sym, bars] of Object.entries(panel)) {
    const idx = bars.findIndex(b => b.date >= date)
    if (idx < 0) continue
    const w = bars.slice(Math.max(0, idx - window), idx)
    if (w.length) adv[sym] = w.reduce((a, b) => a + b.close * b.volume, 0) / w.length
  }
  return adv
}

function getVol20d(panel: BarPanel, date: string): Record<string, number> {
  const vols: Record<string, number> = {}
  for (const [sym, bars] of Object.entries(panel)) {
    const idx = bars.findIndex(b => b.date >= date)
    const w = bars.slice(Math.max(0, idx - 21), idx)
    if (w.length < 5) continue
    const rets = w.slice(1).map((b, i) => (b.close - w[i].close) / w[i].close)
    const m = rets.reduce((a, r) => a + r, 0) / rets.length
    const v = Math.sqrt(rets.reduce((a, r) => a + (r - m) ** 2, 0) / rets.length) * Math.sqrt(252)
    vols[sym] = v
  }
  return vols
}

// ── Main Backtester ───────────────────────────────────────────

export class QuantBacktester {
  private featureEngine = new FeatureEngine()
  private optimizer     = new PortfolioOptimizer()

  async run(
    pkg: QuantStrategyPackage,
    panel: BarPanel,
    config: BacktestConfig,
  ): Promise<BacktestRunResult> {
    const alpha       = createAlphaModel(pkg.alphaType, pkg.alphaWeights)
    const execModel   = new ExecutionModel(pkg.executionConfig)
    const riskManager = new RiskManager(pkg.riskLimits)
    const killSwitch  = new KillSwitch()

    // All unique dates across the panel, within [start, end]
    const allDates = [...new Set(
      Object.values(panel).flatMap(bars => bars.map(b => b.date))
    )].filter(d => d >= config.startDate && d <= config.endDate).sort()

    if (allDates.length < 60) throw new Error('Not enough data for backtest (need ≥ 60 bars)')

    const rebalanceDates = getRebalanceDates(allDates, config.rebalanceFreq)

    // ── State ──────────────────────────────────────────────────
    let state: PortfolioState = {
      date:            allDates[0],
      cash:            config.initialCapital,
      positions:       {},
      equity:          config.initialCapital,
      peakEquity:      config.initialCapital,
      currentDrawdown: 0,
      isHalted:        false,
    }

    const equityCurve: EquityPoint[] = []
    const allOrders:   Order[]       = []
    const allFills:    Fill[]        = []
    const signalSnapshots: Array<{ date: string; signals: Record<string, number> }> = []
    const icSeries:    Array<{ date: string; ic: number; rank_ic: number }> = []
    const allocationHistory: AllocationRow[] = []

    let prevWeights:  Record<string, number> = {}
    let prevSignals:  Record<string, number> = {}

    // Pre-compute features for entire panel
    const allFeatureRows = this.featureEngine.computeFeatures(panel)
    const featuresByDate: Record<string, typeof allFeatureRows> = {}
    for (const row of allFeatureRows) {
      if (!featuresByDate[row.date]) featuresByDate[row.date] = []
      featuresByDate[row.date].push(row)
    }

    // ── Main event loop ────────────────────────────────────────
    for (let di = 0; di < allDates.length; di++) {
      const date   = allDates[di]
      const prices = getPrices(panel, date)

      if (Object.keys(prices).length === 0) continue

      // Mark to market
      const invested = Object.entries(state.positions).reduce((sum, [sym, shares]) => {
        return sum + shares * (prices[sym] ?? 0)
      }, 0)
      state.equity = state.cash + invested
      if (state.equity > state.peakEquity) state.peakEquity = state.equity
      state.currentDrawdown = state.peakEquity > 0 ? (state.equity - state.peakEquity) / state.peakEquity : 0

      const dailyRet = equityCurve.length > 0
        ? (state.equity - equityCurve[equityCurve.length - 1].equity) / equityCurve[equityCurve.length - 1].equity
        : 0

      const grossExposure = state.equity > 0 ? invested / state.equity : 0
      const prevAlloc = allocationHistory[allocationHistory.length - 1]
      const turnover = prevAlloc ? Math.abs(grossExposure - prevAlloc.grossExposure) : 0

      equityCurve.push({
        date,
        equity:       state.equity,
        cash:         state.cash,
        invested,
        drawdown:     state.currentDrawdown,
        dailyReturn:  dailyRet,
        grossExposure,
        turnover,
      })

      // IC computation (lagged 1 day: compare yesterday's signals to today's returns)
      if (prevSignals && Object.keys(prevSignals).length > 0 && isFinite(dailyRet)) {
        const todayRets: Record<string, number> = {}
        for (const sym of Object.keys(prevSignals)) {
          const p = prices[sym]
          const bars = panel[sym]
          if (!p || !bars) continue
          const idx = bars.findIndex(b => b.date >= date)
          if (idx > 0) todayRets[sym] = (bars[idx].close - bars[idx - 1].close) / bars[idx - 1].close
        }
        const ic     = computeIC(prevSignals, todayRets)
        const rankIC = computeRankIC(prevSignals, todayRets)
        if (isFinite(ic)) icSeries.push({ date, ic, rank_ic: rankIC })
      }

      // Kill switch check
      if (killSwitch.isActive) break
      const { shouldHalt } = riskManager.intradayCheck(state, {
        date, grossExposure, netExposure: grossExposure * 0.1,
        concentrationHHI: 0, portfolioVol: 0, varPct: 0, cvarPct: 0,
        topHolding: 0, avgCorrelation: 0,
      })
      if (shouldHalt) {
        killSwitch.trigger(`Drawdown limit hit on ${date}`)
        state.isHalted = true
        continue
      }

      // Only rebalance on scheduled dates
      if (!rebalanceDates.has(date)) continue

      // ── Layer 1: Features (already computed) ──────────────
      const featRows = featuresByDate[date] ?? []
      if (featRows.length < 2) continue

      // Filter to tradable universe
      const universe = pkg.universeConfig.symbols.filter(s => prices[s] != null)
      const univFeats = featRows.filter(r => universe.includes(r.symbol))
      if (univFeats.length < 2) continue

      // ── Layer 2: Alpha signals ────────────────────────────
      const signalSnapshot = alpha.computeSignals(univFeats, pkg.signalScaleBps)
      const forecasts: Record<string, number> = {}
      const rawSignals: Record<string, number> = {}
      for (const [sym, sig] of Object.entries(signalSnapshot)) {
        forecasts[sym]   = sig.forecast_ret
        rawSignals[sym]  = sig.z_score
      }
      prevSignals = rawSignals

      signalSnapshots.push({
        date,
        signals: Object.fromEntries(Object.entries(signalSnapshot).map(([s, v]) => [s, v.z_score])),
      })

      // ── Layer 3: Risk model ───────────────────────────────
      const priceHistory: Record<string, number[]> = {}
      for (const sym of universe) {
        priceHistory[sym] = (panel[sym] ?? []).filter(b => b.date <= date).slice(-config.initialCapital).map(b => b.close)
      }
      const marketRets = (panel[universe[0]] ?? [])
        .filter(b => b.date <= date).slice(-120)
        .slice(1).map((b, i) => {
          const prev = panel[universe[0]]!.filter(x => x.date <= date)[i]
          return prev ? (b.close - prev.close) / prev.close : 0
        })

      const cov = estimateLedoitWolf(
        Object.fromEntries(universe.map(s => [s, (priceHistory[s] ?? []).slice(1).map((p, i) => (p - (priceHistory[s]![i] ?? p)) / (priceHistory[s]![i] ?? p))])),
        Math.min(60, allDates.indexOf(date)),
      )

      // ── Layer 4: Portfolio optimization ──────────────────
      const allocation = this.optimizer.optimize(
        forecasts,
        cov,
        pkg.optimizerConfig,
        prevWeights,
        date,
      )

      // Apply risk manager scaling
      const safeWeights = riskManager.scaleToGrossLimit(allocation.weights)
      allocation.weights = safeWeights
      allocationHistory.push({ ...allocation, weights: safeWeights })
      prevWeights = safeWeights

      // ── Layer 5: Execution ────────────────────────────────
      const adv    = getADV(panel, date)
      const vol20d = getVol20d(panel, date)
      const barMap = Object.fromEntries(
        universe.map(sym => {
          const b = panel[sym]?.find(b => b.date === date)
          return [sym, b!]
        }).filter(([, b]) => b != null)
      ) as Record<string, Bar>

      const orders = execModel.generateOrders(
        state.positions,
        safeWeights,
        prices,
        adv,
        state.equity,
        date,
        vol20d,
      )

      // ── Layer 6: Risk pre-trade check ─────────────────────
      const riskResult = riskManager.preTrade(
        orders,
        state,
        computePortfolioRisk(safeWeights, cov, date),
        safeWeights,
      )

      const approvedOrders = riskResult.approvedOrders
      allOrders.push(...approvedOrders)

      // ── Layer 7: Simulate fills ───────────────────────────
      const fills = execModel.simulateFills(
        approvedOrders,
        barMap,
        adv,
        config.feeBps,
      )

      for (const fill of fills) {
        const sign = fill.side === 'BUY' ? 1 : -1
        state.positions[fill.symbol] = (state.positions[fill.symbol] ?? 0) + sign * fill.filledShares
        if (state.positions[fill.symbol] === 0) delete state.positions[fill.symbol]
        state.cash -= sign * fill.filledShares * fill.avgPrice + fill.commission
      }
      allFills.push(...fills)
    }

    // ── Compute benchmark (equal-weight buy & hold) ────────────
    const benchSymbol = pkg.universeConfig.symbols[0] ?? 'BTC-USD'
    const benchBars   = panel[benchSymbol] ?? []
    const benchStart  = benchBars.find(b => b.date >= config.startDate)?.close ?? 1
    const benchEquity = benchBars
      .filter(b => b.date >= config.startDate && b.date <= config.endDate)
      .map(b => config.initialCapital * b.close / benchStart)

    // ── Tear sheet ─────────────────────────────────────────────
    const tearSheet = computeTearSheet(equityCurve, benchEquity, icSeries)

    return {
      equityCurve,
      benchmarkEquity: benchEquity,
      tearSheet,
      icSeries,
      orders:       allOrders,
      fills:        allFills,
      signalHistory: signalSnapshots,
      allocationHistory,
      finalPositions: state.positions,
    }
  }

  // ── Walk-Forward Wrapper ──────────────────────────────────────

  async walkForward(
    pkg: QuantStrategyPackage,
    panel: BarPanel,
    fullStartDate: string,
    fullEndDate:   string,
    trainDays = 252,
    testDays  = 63,
    initialCapital = 1_000_000,
  ): Promise<import('./types').WalkForwardResult> {
    const windows: WalkForwardWindow[] = []
    const allDates = [...new Set(Object.values(panel).flatMap(b => b.map(x => x.date)))].sort()

    let cursor = 0
    while (cursor + trainDays + testDays < allDates.length) {
      const trainStart = allDates[cursor]
      const trainEnd   = allDates[cursor + trainDays - 1]
      const testStart  = allDates[cursor + trainDays]
      const testEnd    = allDates[cursor + trainDays + testDays - 1]

      const [trainResult, testResult] = await Promise.all([
        this.run(pkg, panel, { startDate: trainStart, endDate: trainEnd, initialCapital, feeBps: 10, symbols: pkg.universeConfig.symbols, rebalanceFreq: pkg.rebalanceFreq }),
        this.run(pkg, panel, { startDate: testStart,  endDate: testEnd,  initialCapital, feeBps: 10, symbols: pkg.universeConfig.symbols, rebalanceFreq: pkg.rebalanceFreq }),
      ])

      const tTS = trainResult.tearSheet
      const vTS = testResult.tearSheet

      windows.push({
        trainStart, trainEnd, testStart, testEnd,
        trainSharpe:  tTS.sharpeRatio,
        testSharpe:   vTS.sharpeRatio,
        trainReturn:  tTS.totalReturnPct,
        testReturn:   vTS.totalReturnPct,
        testMaxDrawdown: vTS.maxDrawdownPct,
        degradation: tTS.sharpeRatio > 0 ? vTS.sharpeRatio / tTS.sharpeRatio - 1 : 0,
      })

      cursor += testDays
      if (cursor + trainDays + testDays >= allDates.length) break
    }

    return computeWalkForward(windows)
  }
}

export interface BacktestRunResult {
  equityCurve:       EquityPoint[]
  benchmarkEquity:   number[]
  tearSheet:         import('./types').TearSheet
  icSeries:          Array<{ date: string; ic: number; rank_ic: number }>
  orders:            Order[]
  fills:             Fill[]
  signalHistory:     Array<{ date: string; signals: Record<string, number> }>
  allocationHistory: AllocationRow[]
  finalPositions:    Record<string, number>
}

export const quantBacktester = new QuantBacktester()
