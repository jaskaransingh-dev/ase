/**
 * ASE Backtesting Engine — TypeScript port of algo_lab_refresh (Python/Streamlit)
 *
 * Supports 10 strategies:
 *   1. Mean Reversion       — z-score based
 *   2. Momentum Crossover   — fast/slow MA crossover
 *   3. Breakout Trend       — rolling high breakout
 *   4. RSI Trend Filter     — RSI + trend MA
 *   5. Volatility Breakout  — ATR trailing stop
 *   6. Dual Momentum        — absolute + relative momentum
 *   7. Pairs Mean Reversion — z-score of spread (single-symbol proxy)
 *   8. Factor Rotation      — risk-adjusted momentum rotation
 *   9. RSI Mean Reversion   — pure RSI overbought/oversold
 *  10. MACD Trend           — MACD crossover trend following
 */

export interface OHLCV {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface BacktestParams {
  [key: string]: number
}

export interface BacktestBar {
  date: string
  close: number
  position: number   // 1 = long, 0 = flat
  equity: number     // portfolio value
  signal?: number    // strategy signal indicator (for chart display)
  indicator?: number // secondary indicator (MA, RSI, etc.)
  indicator2?: number
}

export interface BacktestResult {
  bars: BacktestBar[]
  stats: BacktestStats
  strategy: StrategyMeta
}

export interface BacktestStats {
  totalReturnPct: number
  annualizedReturnPct: number
  cagr: number
  totalReturn: number
  sharpeRatio: number
  sortinoRatio: number
  maxDrawdownPct: number
  maxDrawdownDuration: number
  averageDrawdownPct: number
  downsideVolatility: number
  winRate: number
  totalTrades: number
  profitableTrades: number
  avgTradeDurationDays: number
  avgTradeReturnPct: number
  bestTradePct: number
  worstTradePct: number
  avgWin: number
  avgLoss: number
  profitFactor: number
  exposureTime: number
  turnover: number
  calmarRatio: number
  positiveMonthRatio: number
  rolling63dSharpeMean: number
  rolling63dSharpeStd: number
}

export interface StrategyMeta {
  id: string
  name: string
  description: string
  plainEnglish: string
  bestFor: string
  mainRisk: string
  defaultParams: BacktestParams
  paramSchema: ParamDef[]
}

export interface ParamDef {
  key: string
  label: string
  kind: 'int' | 'float'
  min: number
  max: number
  step: number
}

export interface MonteCarloResult {
  nTrials: number
  windowDays: number
  medianReturn: number
  meanReturn: number
  beatRate: number
  p10Return: number
  p90Return: number
  medianSharpe: number
  medianMaxDrawdown: number
  trials: MonteCarloTrial[]
}

export interface WalkForwardResult {
  nWindows: number
  windowDays: number
  trainDays: number
  avgReturn: number
  avgSharpe: number
  beatBuyHoldRate: number
  consistencyRatio: number
  windows: WalkForwardWindow[]
}

export interface WalkForwardWindow {
  trainStart: string
  trainEnd: string
  testStart: string
  testEnd: string
  trainReturn: number
  trainSharpe: number
  testReturn: number
  testSharpe: number
  testDrawdown: number
  testTrades: number
  outperformance: number
}

export interface BacktestConfig {
  fee?: number
  slippage?: SlippageModel
  initialCapital?: number
}

export interface SlippageModel {
  type: 'fixed' | 'volatility' | 'volume'
  baseBps?: number
  volMultiplier?: number
}

export interface MonteCarloTrial {
  start: string
  end: string
  strategyReturn: number
  buyHoldReturn: number
  sharpe: number
  maxDrawdown: number
}

// ──────────────────────────────────────────────────────────────
// Math helpers
// ──────────────────────────────────────────────────────────────

function rollingMean(arr: number[], window: number): number[] {
  return arr.map((_, i) => {
    if (i < window - 1) return NaN
    let sum = 0
    for (let j = i - window + 1; j <= i; j++) sum += arr[j]
    return sum / window
  })
}

function rollingStd(arr: number[], window: number): number[] {
  const means = rollingMean(arr, window)
  return arr.map((_, i) => {
    if (i < window - 1) return NaN
    const mean = means[i]
    let variance = 0
    for (let j = i - window + 1; j <= i; j++) {
      variance += (arr[j] - mean) ** 2
    }
    return Math.sqrt(variance / window)
  })
}

function rollingMax(arr: number[], window: number): number[] {
  return arr.map((_, i) => {
    if (i < window - 1) return NaN
    let max = -Infinity
    for (let j = i - window + 1; j <= i; j++) if (arr[j] > max) max = arr[j]
    return max
  })
}

function rollingMin(arr: number[], window: number): number[] {
  return arr.map((_, i) => {
    if (i < window - 1) return NaN
    let min = Infinity
    for (let j = i - window + 1; j <= i; j++) if (arr[j] < min) min = arr[j]
    return min
  })
}

function computeRsi(closes: number[], window: number): number[] {
  const rsi: number[] = new Array(closes.length).fill(NaN)
  if (closes.length < window + 1) return rsi

  const gains: number[] = []
  const losses: number[] = []
  for (let i = 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1]
    gains.push(Math.max(0, delta))
    losses.push(Math.max(0, -delta))
  }

  let avgGain = gains.slice(0, window).reduce((a, b) => a + b, 0) / window
  let avgLoss = losses.slice(0, window).reduce((a, b) => a + b, 0) / window

  for (let i = window; i < closes.length; i++) {
    if (i > window) {
      avgGain = (avgGain * (window - 1) + gains[i - 1]) / window
      avgLoss = (avgLoss * (window - 1) + losses[i - 1]) / window
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
    rsi[i] = 100 - 100 / (1 + rs)
  }
  return rsi
}

function computeAtr(highs: number[], lows: number[], closes: number[], window: number): number[] {
  const tr: number[] = [NaN]
  for (let i = 1; i < closes.length; i++) {
    const hl = highs[i] - lows[i]
    const hc = Math.abs(highs[i] - closes[i - 1])
    const lc = Math.abs(lows[i] - closes[i - 1])
    tr.push(Math.max(hl, hc, lc))
  }
  return rollingMean(tr, window)
}

function computeEma(arr: number[], window: number): number[] {
  const ema: number[] = new Array(arr.length).fill(NaN)
  const k = 2 / (window + 1)
  let started = false
  for (let i = 0; i < arr.length; i++) {
    if (isNaN(arr[i])) continue
    if (!started) {
      ema[i] = arr[i]
      started = true
    } else {
      ema[i] = arr[i] * k + ema[i - 1] * (1 - k)
    }
  }
  return ema
}

// ──────────────────────────────────────────────────────────────
// Strategy implementations
// ──────────────────────────────────────────────────────────────

function stratMeanReversion(bars: OHLCV[], params: BacktestParams): number[] {
  const closes = bars.map(b => b.close)
  const w = Math.round(params.window ?? 20)
  const z = params.z_threshold ?? 2.0
  const means = rollingMean(closes, w)
  const stds = rollingStd(closes, w)

  const positions: number[] = new Array(bars.length).fill(0)
  let current = 0
  for (let i = 0; i < bars.length; i++) {
    if (isNaN(means[i]) || isNaN(stds[i]) || stds[i] === 0) { positions[i] = current; continue }
    const zScore = (closes[i] - means[i]) / stds[i]
    if (zScore < -z) current = 1
    else if (zScore > z) current = 0
    positions[i] = current
  }
  return positions
}

function stratMomentumCrossover(bars: OHLCV[], params: BacktestParams): number[] {
  const closes = bars.map(b => b.close)
  const fast = Math.round(params.fast_window ?? 20)
  const slow = Math.round(params.slow_window ?? 50)
  const fastMA = rollingMean(closes, fast)
  const slowMA = rollingMean(closes, slow)

  return bars.map((_, i) => {
    if (isNaN(fastMA[i]) || isNaN(slowMA[i])) return 0
    return fastMA[i] > slowMA[i] ? 1 : 0
  })
}

function stratBreakoutTrend(bars: OHLCV[], params: BacktestParams): number[] {
  const closes = bars.map(b => b.close)
  const highs = bars.map(b => b.high)
  const lows = bars.map(b => b.low)
  const bw = Math.round(params.breakout_window ?? 50)
  const ew = Math.round(params.exit_window ?? 20)

  const breakoutHigh = rollingMax(highs, bw)
  const exitLow = rollingMin(lows, ew)

  const positions: number[] = new Array(bars.length).fill(0)
  let current = 0
  for (let i = 1; i < bars.length; i++) {
    const bh = breakoutHigh[i - 1]
    const el = exitLow[i - 1]
    if (!isNaN(bh) && closes[i] > bh) current = 1
    else if (!isNaN(el) && closes[i] < el) current = 0
    positions[i] = current
  }
  return positions
}

function stratRsiTrendFilter(bars: OHLCV[], params: BacktestParams): number[] {
  const closes = bars.map(b => b.close)
  const rsiWindow = Math.round(params.rsi_window ?? 14)
  const trendWindow = Math.round(params.trend_window ?? 50)
  const buyBelow = params.buy_below ?? 35
  const exitAbove = params.exit_above ?? 60

  const rsi = computeRsi(closes, rsiWindow)
  const trendMA = rollingMean(closes, trendWindow)

  const positions: number[] = new Array(bars.length).fill(0)
  let current = 0
  for (let i = 0; i < bars.length; i++) {
    if (isNaN(rsi[i]) || isNaN(trendMA[i])) { positions[i] = current; continue }
    const bullishTrend = closes[i] > trendMA[i]
    if (bullishTrend && rsi[i] < buyBelow) current = 1
    else if (rsi[i] > exitAbove || closes[i] < trendMA[i]) current = 0
    positions[i] = current
  }
  return positions
}

function stratVolatilityBreakout(bars: OHLCV[], params: BacktestParams): number[] {
  const closes = bars.map(b => b.close)
  const highs = bars.map(b => b.high)
  const lows = bars.map(b => b.low)
  const bw = Math.round(params.breakout_window ?? 40)
  const aw = Math.round(params.atr_window ?? 14)
  const mult = params.stop_atr_mult ?? 3.0

  const breakoutHigh = rollingMax(highs, bw)
  const atr = computeAtr(highs, lows, closes, aw)

  const positions: number[] = new Array(bars.length).fill(0)
  let current = 0
  let stopLevel = NaN

  for (let i = 1; i < bars.length; i++) {
    const bh = breakoutHigh[i - 1]
    if (current === 0) {
      if (!isNaN(bh) && closes[i] > bh) {
        current = 1
        stopLevel = !isNaN(atr[i]) ? closes[i] - atr[i] * mult : NaN
      }
    } else {
      if (!isNaN(atr[i])) {
        const proposed = closes[i] - atr[i] * mult
        stopLevel = isNaN(stopLevel) ? proposed : Math.max(stopLevel, proposed)
      }
      if (!isNaN(stopLevel) && closes[i] < stopLevel) {
        current = 0
        stopLevel = NaN
      }
    }
    positions[i] = current
  }
  return positions
}

// ── New strategies ──────────────────────────────────────────

function stratDualMomentum(bars: OHLCV[], params: BacktestParams): number[] {
  const closes = bars.map(b => b.close)
  const lookback = Math.round(params.lookback ?? 60)
  const maWindow = Math.round(params.ma_window ?? 200)
  const ma = rollingMean(closes, maWindow)

  const positions: number[] = new Array(bars.length).fill(0)
  for (let i = 0; i < bars.length; i++) {
    if (i < lookback || isNaN(ma[i])) { positions[i] = 0; continue }
    // Absolute momentum: price above its lookback-period-ago level
    const absoluteMom = closes[i] > closes[i - lookback]
    // Relative momentum: price above long-term MA (proxy for risk-free benchmark)
    const relativeMom = closes[i] > ma[i]
    positions[i] = (absoluteMom && relativeMom) ? 1 : 0
  }
  return positions
}

function stratPairsMeanReversion(bars: OHLCV[], params: BacktestParams): number[] {
  // Single-symbol proxy: uses ratio of short MA to long MA as a "spread"
  const closes = bars.map(b => b.close)
  const shortW = Math.round(params.short_window ?? 10)
  const longW = Math.round(params.long_window ?? 50)
  const zThreshold = params.z_threshold ?? 2.0
  const shortMA = rollingMean(closes, shortW)
  const longMA = rollingMean(closes, longW)

  // Compute spread as ratio
  const spread: number[] = bars.map((_, i) => {
    if (isNaN(shortMA[i]) || isNaN(longMA[i]) || longMA[i] === 0) return NaN
    return shortMA[i] / longMA[i]
  })

  const spreadMean = rollingMean(spread, longW)
  const spreadStd = rollingStd(spread, longW)

  const positions: number[] = new Array(bars.length).fill(0)
  let current = 0
  for (let i = 0; i < bars.length; i++) {
    if (isNaN(spreadMean[i]) || isNaN(spreadStd[i]) || spreadStd[i] === 0) {
      positions[i] = current
      continue
    }
    const z = (spread[i] - spreadMean[i]) / spreadStd[i]
    // Buy when spread is abnormally low (mean revert up), sell when high
    if (z < -zThreshold) current = 1
    else if (z > zThreshold) current = 0
    else if (z > 0 && current === 1) current = 0 // close when spread reverts past zero
    positions[i] = current
  }
  return positions
}

function stratFactorRotation(bars: OHLCV[], params: BacktestParams): number[] {
  // Risk-adjusted momentum: hold when risk-adjusted return (return/volatility) is positive
  const closes = bars.map(b => b.close)
  const momWindow = Math.round(params.momentum_window ?? 60)
  const volWindow = Math.round(params.vol_window ?? 20)
  const threshold = params.threshold ?? 0.5

  const stds = rollingStd(closes, volWindow)

  const positions: number[] = new Array(bars.length).fill(0)
  for (let i = 0; i < bars.length; i++) {
    if (i < momWindow || isNaN(stds[i]) || stds[i] === 0) { positions[i] = 0; continue }
    const mom = (closes[i] - closes[i - momWindow]) / closes[i - momWindow]
    const annualizedVol = (stds[i] / closes[i]) * Math.sqrt(252)
    const riskAdjMom = annualizedVol === 0 ? 0 : mom / annualizedVol
    positions[i] = riskAdjMom > threshold ? 1 : 0
  }
  return positions
}

function stratRsiMeanReversion(bars: OHLCV[], params: BacktestParams): number[] {
  const closes = bars.map(b => b.close)
  const rsiWindow = Math.round(params.rsi_window ?? 14)
  const buyBelow = params.buy_below ?? 30
  const sellAbove = params.sell_above ?? 70

  const rsi = computeRsi(closes, rsiWindow)

  const positions: number[] = new Array(bars.length).fill(0)
  let current = 0
  for (let i = 0; i < bars.length; i++) {
    if (isNaN(rsi[i])) { positions[i] = current; continue }
    if (rsi[i] < buyBelow) current = 1
    else if (rsi[i] > sellAbove) current = 0
    positions[i] = current
  }
  return positions
}

function stratMacdTrend(bars: OHLCV[], params: BacktestParams): number[] {
  const closes = bars.map(b => b.close)
  const fastPeriod = Math.round(params.fast_period ?? 12)
  const slowPeriod = Math.round(params.slow_period ?? 26)
  const signalPeriod = Math.round(params.signal_period ?? 9)

  const fastEma = computeEma(closes, fastPeriod)
  const slowEma = computeEma(closes, slowPeriod)

  // MACD line = fast EMA - slow EMA
  const macdLine: number[] = bars.map((_, i) => {
    if (isNaN(fastEma[i]) || isNaN(slowEma[i])) return NaN
    return fastEma[i] - slowEma[i]
  })

  // Signal line = EMA of MACD line
  const signalLine = computeEma(macdLine, signalPeriod)

  const positions: number[] = new Array(bars.length).fill(0)
  let current = 0
  for (let i = 0; i < bars.length; i++) {
    if (isNaN(macdLine[i]) || isNaN(signalLine[i])) { positions[i] = current; continue }
    if (macdLine[i] > signalLine[i]) current = 1
    else current = 0
    positions[i] = current
  }
  return positions
}

// ──────────────────────────────────────────────────────────────
// Custom / Class Strategy (User-Defined)
// ──────────────────────────────────────────────────────────────

export interface CustomStrategyDefinition {
  name: string
  description?: string
  entryRules: EntryRule[]
  exitRules: ExitRule[]
  indicators?: IndicatorConfig[]
}

export interface IndicatorConfig {
  type: 'sma' | 'ema' | 'rsi' | 'atr' | 'bb' | 'macd'
  key: string
  params: Record<string, number>
}

export interface EntryRule {
  type: 'indicator_cross' | 'indicator_level' | 'price_cross' | 'signal'
  indicator?: string
  comparison?: 'above' | 'below' | 'crosses_above' | 'crosses_below'
  target?: string | number
  signal?: 'buy' | 'sell'
}

export interface ExitRule {
  type: 'indicator_cross' | 'indicator_level' | 'price_cross' | 'stop_loss' | 'take_profit'
  indicator?: string
  comparison?: 'above' | 'below' | 'crosses_above' | 'crosses_below'
  target?: string | number
  value?: number
}

function stratCustom(bars: OHLCV[], params: BacktestParams): number[] {
  const definition = (params as any).definition as CustomStrategyDefinition | undefined

  if (!definition || !definition.indicators || definition.indicators.length === 0) {
    return stratMomentumCrossover(bars, { fast_window: 20, slow_window: 50 })
  }

  const closes = bars.map(b => b.close)
  const highs = bars.map(b => b.high)
  const lows = bars.map(b => b.low)

  const indicatorValues: Record<string, number[]> = {}

  for (const ind of definition.indicators) {
    switch (ind.type) {
      case 'sma':
        indicatorValues[ind.key] = rollingMean(closes, ind.params.period || 20)
        break
      case 'ema':
        indicatorValues[ind.key] = computeEma(closes, ind.params.period || 20)
        break
      case 'rsi':
        indicatorValues[ind.key] = computeRsi(closes, ind.params.period || 14)
        break
      case 'atr':
        indicatorValues[ind.key] = computeAtr(highs, lows, closes, ind.params.period || 14)
        break
      default:
        indicatorValues[ind.key] = rollingMean(closes, 20)
    }
  }

  const positions: number[] = new Array(bars.length).fill(0)
  let currentPosition = 0

  for (let i = 1; i < bars.length; i++) {
    const shouldEnter = definition.entryRules.some(rule => {
      if (rule.type === 'indicator_cross' && rule.indicator && rule.target !== undefined) {
        const currVal = indicatorValues[rule.indicator]?.[i]
        const prevVal = indicatorValues[rule.indicator]?.[i - 1]
        const targetVal = typeof rule.target === 'string' ? indicatorValues[rule.target]?.[i] : rule.target
        if (isNaN(currVal!) || isNaN(prevVal!) || targetVal === undefined) return false
        if (rule.comparison === 'above' && currVal > targetVal) return true
        if (rule.comparison === 'below' && currVal < targetVal) return true
        if (rule.comparison === 'crosses_above' && prevVal <= targetVal && currVal > targetVal) return true
        if (rule.comparison === 'crosses_below' && prevVal >= targetVal && currVal < targetVal) return true
      }
      if (rule.type === 'indicator_level' && rule.indicator) {
        const levelVal = indicatorValues[rule.indicator]?.[i]
        if (isNaN(levelVal!)) return false
        const level = (rule as any).value || 30
        if (rule.comparison === 'below' && levelVal < level) return true
        if (rule.comparison === 'above' && levelVal > level) return true
      }
      return false
    })

    const shouldExit = definition.exitRules.some(rule => {
      if (rule.type === 'indicator_cross' && rule.indicator && rule.target !== undefined) {
        const currVal = indicatorValues[rule.indicator]?.[i]
        const prevVal = indicatorValues[rule.indicator]?.[i - 1]
        const targetVal = typeof rule.target === 'string' ? indicatorValues[rule.target]?.[i] : rule.target
        if (isNaN(currVal!) || isNaN(prevVal!) || targetVal === undefined) return false
        if (rule.comparison === 'above' && currVal > targetVal) return true
        if (rule.comparison === 'below' && currVal < targetVal) return true
        if (rule.comparison === 'crosses_above' && prevVal <= targetVal && currVal > targetVal) return true
        if (rule.comparison === 'crosses_below' && prevVal >= targetVal && currVal < targetVal) return true
      }
      if (rule.type === 'stop_loss' && (rule as any).value && currentPosition === 1) {
        const entryPrice = bars[i - 1]?.close || bars[i].close
        const stopPrice = entryPrice * (1 - (rule as any).value / 100)
        if (bars[i].low < stopPrice) return true
      }
      if (rule.type === 'take_profit' && (rule as any).value && currentPosition === 1) {
        const entryPrice = bars[i - 1]?.close || bars[i].close
        const targetPrice = entryPrice * (1 + (rule as any).value / 100)
        if (bars[i].high > targetPrice) return true
      }
      return false
    })

    if (currentPosition === 0 && shouldEnter) {
      currentPosition = 1
    } else if (currentPosition === 1 && shouldExit) {
      currentPosition = 0
    }

    positions[i] = currentPosition
  }

  return positions
}

// Run custom strategy from definition
export function runCustomBacktest(
  bars: OHLCV[],
  definition: CustomStrategyDefinition,
  fee = 0.001,
  slippage = 0.0005,
): BacktestResult {
  const params: Record<string, unknown> = {
    definition,
    custom_indicator_count: definition.indicators?.length || 0,
  }

  const result = runBacktest(bars, 'custom', params as BacktestParams, fee, slippage)

  result.strategy = {
    id: 'custom',
    name: definition.name || 'Custom Strategy',
    description: definition.description || 'User-defined trading strategy',
    plainEnglish: definition.description || 'Custom algorithm',
    bestFor: 'Custom trading rules',
    mainRisk: 'Depends on rule quality',
    defaultParams: {},
    paramSchema: [],
  }

  return result
}

// ──────────────────────────────────────────────────────────────
// Statistics
// ──────────────────────────────────────────────────────────────

function computeStats(equityCurve: number[], positions: number[], bars: OHLCV[]): BacktestStats {
  const n = equityCurve.length
  if (n < 2) {
    return {
      totalReturnPct: 0, annualizedReturnPct: 0, cagr: 0, totalReturn: 0,
      sharpeRatio: 0, sortinoRatio: 0, maxDrawdownPct: 0, maxDrawdownDuration: 0,
      averageDrawdownPct: 0, downsideVolatility: 0, winRate: 0, totalTrades: 0,
      profitableTrades: 0, avgTradeDurationDays: 0, avgTradeReturnPct: 0,
      bestTradePct: 0, worstTradePct: 0, avgWin: 0, avgLoss: 0,
      profitFactor: 0, exposureTime: 0, turnover: 0, calmarRatio: 0,
      positiveMonthRatio: 0, rolling63dSharpeMean: 0, rolling63dSharpeStd: 0,
    }
  }

  const initial = equityCurve[0]
  const final = equityCurve[n - 1]
  const totalReturnPct = ((final - initial) / initial) * 100

  // Annualized return
  const startDate = new Date(bars[0].date)
  const endDate = new Date(bars[n - 1].date)
  const years = Math.max((endDate.getTime() - startDate.getTime()) / (365.25 * 24 * 3600 * 1000), 0.01)
  const annualizedReturnPct = ((Math.pow(final / initial, 1 / years) - 1) * 100)

  // Daily returns
  const dailyReturns: number[] = []
  for (let i = 1; i < equityCurve.length; i++) {
    dailyReturns.push((equityCurve[i] - equityCurve[i - 1]) / equityCurve[i - 1])
  }

  // Sharpe (annualized, risk-free = 0)
  const meanReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
  const stdReturn = Math.sqrt(dailyReturns.reduce((a, b) => a + (b - meanReturn) ** 2, 0) / dailyReturns.length)
  const sharpeRatio = stdReturn === 0 ? 0 : (meanReturn / stdReturn) * Math.sqrt(252)

  // Sortino (only downside deviation)
  const negativeReturns = dailyReturns.filter(r => r < 0)
  const downsideDeviation = negativeReturns.length > 0
    ? Math.sqrt(negativeReturns.reduce((a, b) => a + b ** 2, 0) / dailyReturns.length)
    : 0
  const sortinoRatio = downsideDeviation === 0 ? 0 : (meanReturn / downsideDeviation) * Math.sqrt(252)

  // Max drawdown + duration
  let peak = equityCurve[0]
  let maxDD = 0
  let maxDDDuration = 0
  let currentDDStart = 0
  let inDrawdown = false

  for (let i = 0; i < equityCurve.length; i++) {
    if (equityCurve[i] > peak) {
      peak = equityCurve[i]
      if (inDrawdown) {
        const duration = i - currentDDStart
        if (duration > maxDDDuration) maxDDDuration = duration
        inDrawdown = false
      }
    } else {
      const dd = (peak - equityCurve[i]) / peak
      if (!inDrawdown) {
        inDrawdown = true
        currentDDStart = i
      }
      if (dd > maxDD) maxDD = dd
    }
  }
  // If still in drawdown at end
  if (inDrawdown) {
    const duration = equityCurve.length - 1 - currentDDStart
    if (duration > maxDDDuration) maxDDDuration = duration
  }
  const maxDrawdownPct = maxDD * 100

  // Exposure time (% of bars in market)
  const inMarketBars = positions.filter(p => p === 1).length
  const exposureTime = (inMarketBars / positions.length) * 100

  // Trade analysis
  const trades: Array<{ entryIdx: number; exitIdx: number; entryPrice: number; exitPrice: number }> = []
  let inTrade = false
  let entryIdx = 0
  let entryPrice = 0

  for (let i = 0; i < positions.length; i++) {
    if (!inTrade && positions[i] === 1) {
      inTrade = true
      entryIdx = i
      entryPrice = bars[i].close
    } else if (inTrade && (positions[i] === 0 || i === positions.length - 1)) {
      inTrade = false
      const exitPrice = bars[i].close
      trades.push({ entryIdx, exitIdx: i, entryPrice, exitPrice })
    }
  }

  const tradePcts = trades.map(t => ((t.exitPrice - t.entryPrice) / t.entryPrice) * 100)
  const profitableTrades = tradePcts.filter(p => p > 0).length
  const winRate = trades.length > 0 ? (profitableTrades / trades.length) * 100 : 0
  const bestTradePct = tradePcts.length > 0 ? Math.max(...tradePcts) : 0
  const worstTradePct = tradePcts.length > 0 ? Math.min(...tradePcts) : 0
  const avgDuration = trades.length > 0
    ? trades.reduce((sum, t) => sum + (t.exitIdx - t.entryIdx), 0) / trades.length
    : 0

  // Avg win / avg loss
  const wins = tradePcts.filter(p => p > 0)
  const losses = tradePcts.filter(p => p < 0)
  const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0

  // Profit factor = gross profit / gross loss
  const grossProfit = wins.reduce((a, b) => a + b, 0)
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0))
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss

  // Turnover (total traded value / initial capital)
  const totalNotional = trades.reduce((sum, t) => sum + t.entryPrice + t.exitPrice, 0)
  const turnover = initial > 0 ? totalNotional / initial : 0

  // Average drawdown
  let runningPeak = equityCurve[0]
  let totalDrawdown = 0
  let drawdownCount = 0
  for (let i = 1; i < equityCurve.length; i++) {
    if (equityCurve[i] > runningPeak) {
      runningPeak = equityCurve[i]
    } else {
      const dd = (runningPeak - equityCurve[i]) / runningPeak
      totalDrawdown += dd
      drawdownCount++
    }
  }
  const averageDrawdownPct = drawdownCount > 0 ? (totalDrawdown / drawdownCount) * 100 : 0

  // Downside volatility
  const downsideVolatility = negativeReturns.length > 0
    ? Math.sqrt(negativeReturns.reduce((a, b) => a + b ** 2, 0) / dailyReturns.length) * Math.sqrt(252)
    : 0

  // Calmar ratio (CAGR / |max drawdown|)
  const cagr = annualizedReturnPct / 100
  const calmarRatio = maxDrawdownPct === 0 ? 0 : cagr / (maxDrawdownPct / 100)

  // Positive month ratio
  const monthlyReturns: number[] = []
  const monthlyData: Record<string, number[]> = {}
  for (let i = 0; i < bars.length; i++) {
    const monthKey = bars[i].date.slice(0, 7)
    if (!monthlyData[monthKey]) monthlyData[monthKey] = []
    if (i > 0) {
      const dailyRet = (equityCurve[i] - equityCurve[i - 1]) / equityCurve[i - 1]
      monthlyData[monthKey].push(dailyRet)
    }
  }
  Object.values(monthlyData).forEach(monthRet => {
    const monthTotal = monthRet.reduce((a, b) => a + b, 0)
    monthlyReturns.push(monthTotal)
  })
  const positiveMonths = monthlyReturns.filter(r => r > 0).length
  const positiveMonthRatio = monthlyReturns.length > 0 ? (positiveMonths / monthlyReturns.length) * 100 : 0

  // Rolling 63-day Sharpe
  const rollingSharpes: number[] = []
  for (let i = 63; i < dailyReturns.length; i++) {
    const window = dailyReturns.slice(i - 63, i)
    const wMean = window.reduce((a, b) => a + b, 0) / 63
    const wStd = Math.sqrt(window.reduce((a, b) => a + (b - wMean) ** 2, 0) / 63)
    if (wStd > 0) {
      rollingSharpes.push((wMean / wStd) * Math.sqrt(252))
    }
  }
  const rolling63dSharpeMean = rollingSharpes.length > 0 ? rollingSharpes.reduce((a, b) => a + b, 0) / rollingSharpes.length : 0
  const rolling63dSharpeStd = rollingSharpes.length > 0 
    ? Math.sqrt(rollingSharpes.reduce((a, b) => a + (b - rolling63dSharpeMean) ** 2, 0) / rollingSharpes.length)
    : 0

  // Average trade return
  const avgTradeReturnPct = tradePcts.length > 0 ? tradePcts.reduce((a, b) => a + b, 0) / tradePcts.length : 0

  return {
    totalReturnPct,
    annualizedReturnPct,
    cagr,
    totalReturn: final / initial - 1,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    sortinoRatio: Math.round(sortinoRatio * 100) / 100,
    maxDrawdownPct,
    maxDrawdownDuration: maxDDDuration,
    averageDrawdownPct: Math.round(averageDrawdownPct * 100) / 100,
    downsideVolatility: Math.round(downsideVolatility * 10000) / 10000,
    winRate: Math.round(winRate * 10) / 10,
    totalTrades: trades.length,
    profitableTrades,
    avgTradeDurationDays: Math.round(avgDuration),
    avgTradeReturnPct: Math.round(avgTradeReturnPct * 100) / 100,
    bestTradePct: Math.round(bestTradePct * 100) / 100,
    worstTradePct: Math.round(worstTradePct * 100) / 100,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    profitFactor: profitFactor === Infinity ? 999 : Math.round(profitFactor * 100) / 100,
    exposureTime: Math.round(exposureTime * 100) / 100,
    turnover: Math.round(turnover * 100) / 100,
    calmarRatio: Math.round(calmarRatio * 100) / 100,
    positiveMonthRatio: Math.round(positiveMonthRatio * 10) / 10,
    rolling63dSharpeMean: Math.round(rolling63dSharpeMean * 100) / 100,
    rolling63dSharpeStd: Math.round(rolling63dSharpeStd * 100) / 100,
  }
}

// ──────────────────────────────────────────────────────────────
// Strategy registry
// ──────────────────────────────────────────────────────────────

export const STRATEGIES: Record<string, StrategyMeta> = {
  mean_reversion: {
    id: 'mean_reversion',
    name: 'Mean Reversion',
    description: 'Buys after sharp moves down and flips flat after sharp moves up, based on how far price wandered from its recent average.',
    plainEnglish: 'Assumes price often snaps back toward normal after moving too far too fast.',
    bestFor: 'Choppy, range-bound markets where overreactions fade.',
    mainRisk: 'Can get run over when a real trend keeps going instead of reversing.',
    defaultParams: { window: 20, z_threshold: 2.0 },
    paramSchema: [
      { key: 'window', label: 'Lookback window', kind: 'int', min: 5, max: 60, step: 1 },
      { key: 'z_threshold', label: 'Z-score trigger', kind: 'float', min: 0.5, max: 4.0, step: 0.1 },
    ],
  },
  momentum_crossover: {
    id: 'momentum_crossover',
    name: 'Momentum Crossover',
    description: 'Owns the asset when the shorter trend is above the longer trend, and steps aside when momentum weakens.',
    plainEnglish: 'Classic idea that strong trends often keep drifting for a while.',
    bestFor: 'Cleaner, sustained trends with fewer fakeouts.',
    mainRisk: 'Can whipsaw badly in sideways markets and give back gains near reversals.',
    defaultParams: { fast_window: 20, slow_window: 50 },
    paramSchema: [
      { key: 'fast_window', label: 'Fast average', kind: 'int', min: 5, max: 60, step: 1 },
      { key: 'slow_window', label: 'Slow average', kind: 'int', min: 20, max: 150, step: 1 },
    ],
  },
  breakout_trend: {
    id: 'breakout_trend',
    name: 'Breakout Trend',
    description: 'Buys when price breaks above its recent range and exits when it falls back below a shorter safety line.',
    plainEnglish: 'Waits for strong new highs, then rides the move until it starts to crack.',
    bestFor: 'Markets that trend in bursts and reward patience.',
    mainRisk: 'False breakouts can trigger entries right before reversals.',
    defaultParams: { breakout_window: 50, exit_window: 20 },
    paramSchema: [
      { key: 'breakout_window', label: 'Breakout window', kind: 'int', min: 20, max: 150, step: 1 },
      { key: 'exit_window', label: 'Exit window', kind: 'int', min: 5, max: 60, step: 1 },
    ],
  },
  rsi_trend_filter: {
    id: 'rsi_trend_filter',
    name: 'RSI Trend Filter',
    description: 'Buys dips only when the bigger trend is still up, using RSI to find pullbacks and a moving average to avoid fighting downtrends.',
    plainEnglish: 'Tries to buy the dip, but only in markets that still look healthy overall.',
    bestFor: 'Trending assets that often pull back before continuing higher.',
    mainRisk: 'Can miss huge moves and can still get trapped if a pullback becomes a real breakdown.',
    defaultParams: { rsi_window: 14, trend_window: 50, buy_below: 35, exit_above: 60 },
    paramSchema: [
      { key: 'rsi_window', label: 'RSI window', kind: 'int', min: 5, max: 30, step: 1 },
      { key: 'trend_window', label: 'Trend moving average', kind: 'int', min: 20, max: 150, step: 1 },
      { key: 'buy_below', label: 'Buy when RSI below', kind: 'float', min: 10, max: 45, step: 1 },
      { key: 'exit_above', label: 'Exit when RSI above', kind: 'float', min: 45, max: 80, step: 1 },
    ],
  },
  volatility_breakout: {
    id: 'volatility_breakout',
    name: 'Volatility Breakout',
    description: 'Buys a fresh breakout and protects the trade with an ATR-style trailing stop that adapts to volatility.',
    plainEnglish: 'Tries to catch big moves while giving the trade room to breathe.',
    bestFor: 'Fast assets where rigid stop rules get shaken out too early.',
    mainRisk: 'Breakouts can fail quickly, and wide volatility stops can still allow painful givebacks.',
    defaultParams: { breakout_window: 40, atr_window: 14, stop_atr_mult: 3.0 },
    paramSchema: [
      { key: 'breakout_window', label: 'Breakout window', kind: 'int', min: 10, max: 120, step: 1 },
      { key: 'atr_window', label: 'ATR window', kind: 'int', min: 5, max: 40, step: 1 },
      { key: 'stop_atr_mult', label: 'ATR stop multiple', kind: 'float', min: 1.0, max: 6.0, step: 0.25 },
    ],
  },
  dual_momentum: {
    id: 'dual_momentum',
    name: 'Dual Momentum',
    description: 'Holds when both absolute momentum (price rising) and relative momentum (price above long-term average) are positive.',
    plainEnglish: 'Only stays in the market when both short-term and long-term signals agree the trend is up.',
    bestFor: 'Avoiding prolonged drawdowns while capturing major trends.',
    mainRisk: 'Can exit prematurely during volatile but ultimately bullish periods.',
    defaultParams: { lookback: 60, ma_window: 200 },
    paramSchema: [
      { key: 'lookback', label: 'Momentum lookback (days)', kind: 'int', min: 20, max: 252, step: 5 },
      { key: 'ma_window', label: 'Long-term MA window', kind: 'int', min: 50, max: 300, step: 10 },
    ],
  },
  pairs_mean_reversion: {
    id: 'pairs_mean_reversion',
    name: 'Pairs Mean Reversion',
    description: 'Trades z-score of the short/long moving average ratio, buying when the spread is abnormally low and closing when it reverts.',
    plainEnglish: 'Bets that the short-term trend will snap back toward the long-term trend.',
    bestFor: 'Range-bound or oscillating markets with clear mean-reverting behavior.',
    mainRisk: 'Spread can diverge further if a regime change occurs.',
    defaultParams: { short_window: 10, long_window: 50, z_threshold: 2.0 },
    paramSchema: [
      { key: 'short_window', label: 'Short MA window', kind: 'int', min: 3, max: 30, step: 1 },
      { key: 'long_window', label: 'Long MA window', kind: 'int', min: 20, max: 120, step: 5 },
      { key: 'z_threshold', label: 'Z-score threshold', kind: 'float', min: 0.5, max: 4.0, step: 0.1 },
    ],
  },
  factor_rotation: {
    id: 'factor_rotation',
    name: 'Factor Rotation',
    description: 'Holds the asset when its risk-adjusted momentum (return divided by volatility) exceeds a threshold.',
    plainEnglish: 'Only invests when the asset is trending well relative to how risky it is.',
    bestFor: 'Rotating between assets or staying in cash when risk/reward is poor.',
    mainRisk: 'Can stay out of market too long during volatile rallies.',
    defaultParams: { momentum_window: 60, vol_window: 20, threshold: 0.5 },
    paramSchema: [
      { key: 'momentum_window', label: 'Momentum lookback', kind: 'int', min: 20, max: 252, step: 5 },
      { key: 'vol_window', label: 'Volatility window', kind: 'int', min: 5, max: 60, step: 1 },
      { key: 'threshold', label: 'Risk-adj. threshold', kind: 'float', min: 0.0, max: 2.0, step: 0.1 },
    ],
  },
  rsi_mean_reversion: {
    id: 'rsi_mean_reversion',
    name: 'RSI Mean Reversion',
    description: 'Pure RSI strategy: buys when RSI drops below oversold level and sells when it rises above overbought level.',
    plainEnglish: 'Classic overbought/oversold indicator used to catch reversals.',
    bestFor: 'Choppy markets where RSI extremes reliably signal turning points.',
    mainRisk: 'In strong trends, RSI can stay overbought or oversold for extended periods.',
    defaultParams: { rsi_window: 14, buy_below: 30, sell_above: 70 },
    paramSchema: [
      { key: 'rsi_window', label: 'RSI window', kind: 'int', min: 5, max: 30, step: 1 },
      { key: 'buy_below', label: 'Buy when RSI below', kind: 'float', min: 10, max: 45, step: 1 },
      { key: 'sell_above', label: 'Sell when RSI above', kind: 'float', min: 55, max: 90, step: 1 },
    ],
  },
  macd_trend: {
    id: 'macd_trend',
    name: 'MACD Trend',
    description: 'MACD crossover strategy: goes long when MACD line crosses above signal line, exits when it crosses below.',
    plainEnglish: 'Uses the difference between fast and slow moving averages to detect momentum shifts.',
    bestFor: 'Trending markets where momentum changes are persistent.',
    mainRisk: 'Frequent whipsaws in choppy markets can erode returns through fees.',
    defaultParams: { fast_period: 12, slow_period: 26, signal_period: 9 },
    paramSchema: [
      { key: 'fast_period', label: 'Fast EMA period', kind: 'int', min: 5, max: 30, step: 1 },
      { key: 'slow_period', label: 'Slow EMA period', kind: 'int', min: 15, max: 60, step: 1 },
      { key: 'signal_period', label: 'Signal EMA period', kind: 'int', min: 3, max: 20, step: 1 },
    ],
  },
  custom: {
    id: 'custom',
    name: 'Custom Strategy',
    description: 'Define your own strategy with custom entry/exit rules, indicators, and risk management.',
    plainEnglish: 'Build your own trading strategy with a visual rule builder or JSON definition.',
    bestFor: 'Users who want full control over their strategy logic.',
    mainRisk: 'Custom strategies may have edge cases not covered by built-in safeguards.',
    defaultParams: {},
    paramSchema: [],
  },
}

// ──────────────────────────────────────────────────────────────
// Main runner
// ──────────────────────────────────────────────────────────────

const INITIAL_CAPITAL = 100_000

export function runBacktest(
  bars: OHLCV[],
  strategyId: string,
  params: BacktestParams,
  fee = 0.001,
  slippage = 0.0005,
): BacktestResult {
  if (!bars.length) throw new Error('No bars provided')
  const stratMeta = STRATEGIES[strategyId]
  if (!stratMeta) throw new Error(`Unknown strategy: ${strategyId}`)

  // Get positions from strategy
  let positions: number[]
  switch (strategyId) {
    case 'mean_reversion':        positions = stratMeanReversion(bars, params); break
    case 'momentum_crossover':    positions = stratMomentumCrossover(bars, params); break
    case 'breakout_trend':        positions = stratBreakoutTrend(bars, params); break
    case 'rsi_trend_filter':      positions = stratRsiTrendFilter(bars, params); break
    case 'volatility_breakout':   positions = stratVolatilityBreakout(bars, params); break
    case 'dual_momentum':         positions = stratDualMomentum(bars, params); break
    case 'pairs_mean_reversion':  positions = stratPairsMeanReversion(bars, params); break
    case 'factor_rotation':       positions = stratFactorRotation(bars, params); break
    case 'rsi_mean_reversion':    positions = stratRsiMeanReversion(bars, params); break
    case 'macd_trend':            positions = stratMacdTrend(bars, params); break
    case 'custom':                positions = stratCustom(bars, params); break
    default: throw new Error(`No runner for ${strategyId}`)
  }

  // Simulate equity curve with trading fees and slippage
  const equityCurve: number[] = []
  let equity = INITIAL_CAPITAL
  let prevPosition = 0

  for (let i = 0; i < bars.length; i++) {
    const pos = positions[i]

    // Apply fee + slippage on position change
    if (pos !== prevPosition && i > 0) {
      equity *= (1 - fee)
      // Slippage: buy at higher price, sell at lower price
      // Model as a percentage cost on each trade
      equity *= (1 - slippage)
    }

    // Daily return when in position
    if (i > 0 && positions[i - 1] === 1) {
      const dailyReturn = (bars[i].close - bars[i - 1].close) / bars[i - 1].close
      equity *= (1 + dailyReturn)
    }

    equityCurve.push(equity)
    prevPosition = pos
  }

  const result: BacktestBar[] = bars.map((bar, i) => ({
    date: bar.date,
    close: bar.close,
    position: positions[i],
    equity: equityCurve[i],
  }))

  const stats = computeStats(equityCurve, positions, bars)

  return { bars: result, stats, strategy: stratMeta }
}

export function runBuyAndHold(bars: OHLCV[]): BacktestBar[] {
  let equity = INITIAL_CAPITAL
  return bars.map((bar, i) => {
    if (i > 0) {
      const dailyReturn = (bar.close - bars[i - 1].close) / bars[i - 1].close
      equity *= (1 + dailyReturn)
    }
    return { date: bar.date, close: bar.close, position: 1, equity }
  })
}

// ──────────────────────────────────────────────────────────────
// Slippage modeling
// ──────────────────────────────────────────────────────────────

function computeVolatility(bars: OHLCV[], window = 20): number {
  if (bars.length < window + 1) return 0
  const returns: number[] = []
  for (let i = 1; i < bars.length; i++) {
    returns.push(Math.log(bars[i].close / bars[i - 1].close))
  }
  const recent = returns.slice(-window)
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length
  const variance = recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length
  return Math.sqrt(variance)
}

function calculateSlippage(
  slippage: SlippageModel,
  bar: OHLCV,
  prevBar?: OHLCV,
): number {
  switch (slippage.type) {
    case 'fixed':
      return slippage.baseBps ?? 0.0005
    case 'volatility': {
      const vol = computeVolatility(prevBar ? [prevBar, bar] : [bar], 20)
      const annualVol = vol * Math.sqrt(252)
      const volScaler = slippage.volMultiplier ?? 0.5
      return Math.min(annualVol * volScaler / Math.sqrt(252), 0.01)
    }
    case 'volume':
      return slippage.baseBps ?? 0.0005
    default:
      return 0.0005
  }
}

// ──────────────────────────────────────────────────────────────
// Walk-forward analysis
// ──────────────────────────────────────────────────────────────

export function runWalkForward(
  bars: OHLCV[],
  strategyId: string,
  params: BacktestParams,
  config: BacktestConfig = {},
  trainDays = 252,
  testDays = 63,
): WalkForwardResult {
  const fee = config.fee ?? 0.001
  const slippage = config.slippage ?? { type: 'volatility', volMultiplier: 0.5 }
  
  const windows: WalkForwardWindow[] = []
  const totalBars = bars.length
  const stepSize = testDays
  
  for (let testStart = trainDays; testStart + testDays <= totalBars; testStart += stepSize) {
    const trainBars = bars.slice(Math.max(0, testStart - trainDays), testStart)
    const testBars = bars.slice(testStart, Math.min(testStart + testDays, totalBars))
    
    if (trainBars.length < 100 || testBars.length < 20) continue
    
    try {
      const trainResult = runBacktest(trainBars, strategyId, params, fee)
      const testResult = runBacktest(testBars, strategyId, params, fee)
      const trainBuyHold = runBuyAndHold(trainBars)
      const testBuyHold = runBuyAndHold(testBars)
      
      const trainReturn = trainResult.stats.totalReturnPct
      const testReturn = testResult.stats.totalReturnPct
      
      const trainBHReturn = trainBuyHold.length > 1
        ? ((trainBuyHold[trainBuyHold.length - 1].equity - trainBuyHold[0].equity) / trainBuyHold[0].equity) * 100
        : 0
      const testBHReturn = testBuyHold.length > 1
        ? ((testBuyHold[testBuyHold.length - 1].equity - testBuyHold[0].equity) / testBuyHold[0].equity) * 100
        : 0
      
      windows.push({
        trainStart: trainBars[0].date,
        trainEnd: trainBars[trainBars.length - 1].date,
        testStart: testBars[0].date,
        testEnd: testBars[testBars.length - 1].date,
        trainReturn,
        trainSharpe: trainResult.stats.sharpeRatio,
        testReturn,
        testSharpe: testResult.stats.sharpeRatio,
        testDrawdown: testResult.stats.maxDrawdownPct,
        testTrades: testResult.stats.totalTrades,
        outperformance: testReturn - testBHReturn,
      })
    } catch {
      // Skip invalid windows
    }
  }
  
  if (windows.length === 0) {
    throw new Error('No valid walk-forward windows could be computed')
  }
  
  const avgReturn = windows.reduce((sum, w) => sum + w.testReturn, 0) / windows.length
  const avgSharpe = windows.reduce((sum, w) => sum + w.testSharpe, 0) / windows.length
  const beatBuyHoldRate = windows.filter(w => w.outperformance > 0).length / windows.length
  
  const positiveReturns = windows.filter(w => w.testReturn > 0).length
  const consistencyRatio = positiveReturns / windows.length
  
  return {
    nWindows: windows.length,
    windowDays: testDays,
    trainDays,
    avgReturn: Math.round(avgReturn * 100) / 100,
    avgSharpe: Math.round(avgSharpe * 100) / 100,
    beatBuyHoldRate: Math.round(beatBuyHoldRate * 1000) / 1000,
    consistencyRatio: Math.round(consistencyRatio * 1000) / 1000,
    windows,
  }
}

// ──────────────────────────────────────────────────────────────
// Monte Carlo simulation
// ──────────────────────────────────────────────────────────────

export function runMonteCarlo(
  bars: OHLCV[],
  strategyId: string,
  params: BacktestParams,
  nTrials: number,
  windowDays: number,
  fee = 0.001,
  slippage = 0.0005,
): MonteCarloResult {
  const trials: MonteCarloTrial[] = []
  const totalBars = bars.length

  if (totalBars < windowDays + 10) {
    throw new Error(`Not enough data: have ${totalBars} bars, need at least ${windowDays + 10}`)
  }

  const maxStart = totalBars - windowDays

  for (let t = 0; t < nTrials; t++) {
    // Random start index
    const startIdx = Math.floor(Math.random() * maxStart)
    const endIdx = startIdx + windowDays
    const windowBars = bars.slice(startIdx, endIdx)

    if (windowBars.length < 30) continue

    try {
      const result = runBacktest(windowBars, strategyId, params, fee, slippage)
      const buyHold = runBuyAndHold(windowBars)
      const bhReturn = buyHold.length > 1
        ? ((buyHold[buyHold.length - 1].equity - buyHold[0].equity) / buyHold[0].equity) * 100
        : 0

      trials.push({
        start: windowBars[0].date,
        end: windowBars[windowBars.length - 1].date,
        strategyReturn: result.stats.totalReturnPct,
        buyHoldReturn: bhReturn,
        sharpe: result.stats.sharpeRatio,
        maxDrawdown: result.stats.maxDrawdownPct,
      })
    } catch {
      // Skip failed windows
    }
  }

  if (trials.length === 0) {
    throw new Error('No valid Monte Carlo trials could be computed')
  }

  const returns = trials.map(t => t.strategyReturn).sort((a, b) => a - b)
  const sharpes = trials.map(t => t.sharpe).sort((a, b) => a - b)
  const drawdowns = trials.map(t => t.maxDrawdown).sort((a, b) => a - b)
  const excessReturns = trials.map(t => t.strategyReturn - t.buyHoldReturn)

  const mid = Math.floor(returns.length / 2)
  const medianReturn = returns.length % 2 ? returns[mid] : (returns[mid - 1] + returns[mid]) / 2
  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length

  const sharpeMid = Math.floor(sharpes.length / 2)
  const medianSharpe = sharpes.length % 2 ? sharpes[sharpeMid] : (sharpes[sharpeMid - 1] + sharpes[sharpeMid]) / 2

  const ddMid = Math.floor(drawdowns.length / 2)
  const medianMaxDrawdown = drawdowns.length % 2 ? drawdowns[ddMid] : (drawdowns[ddMid - 1] + drawdowns[ddMid]) / 2

  const beatRate = excessReturns.filter(e => e > 0).length / excessReturns.length
  const p10Idx = Math.floor(returns.length * 0.1)
  const p90Idx = Math.min(Math.floor(returns.length * 0.9), returns.length - 1)

  return {
    nTrials: trials.length,
    windowDays,
    medianReturn: Math.round(medianReturn * 100) / 100,
    meanReturn: Math.round(meanReturn * 100) / 100,
    beatRate: Math.round(beatRate * 1000) / 1000,
    p10Return: Math.round(returns[p10Idx] * 100) / 100,
    p90Return: Math.round(returns[p90Idx] * 100) / 100,
    medianSharpe: Math.round(medianSharpe * 100) / 100,
    medianMaxDrawdown: Math.round(medianMaxDrawdown * 100) / 100,
    trials,
  }
}

// ──────────────────────────────────────────────────────────────
// Composite Scorecard System (ASE-style)
// ──────────────────────────────────────────────────────────────

export interface Scorecard {
  performanceScore: number
  riskScore: number
  robustnessScore: number
  executionScore: number
  penaltyScore: number
  compositeScore: number
  grade: string
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}

function normalizeHigherBetter(x: number, low: number, high: number): number {
  if (high <= low) return 0
  return clamp01((x - low) / (high - low))
}

function normalizeLowerBetter(x: number, low: number, high: number): number {
  if (high <= low) return 0
  return 1 - clamp01((x - low) / (high - low))
}

function getGrade(score: number): string {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

export function computeScorecard(stats: BacktestStats, diagnostics: Record<string, any> = {}): Scorecard {
  const performanceScore = 100 * (
    0.30 * normalizeHigherBetter(stats.cagr, 0, 0.30) +
    0.30 * normalizeHigherBetter(stats.sharpeRatio, 0, 2.5) +
    0.20 * normalizeHigherBetter(stats.sortinoRatio, 0, 3.5) +
    0.20 * normalizeHigherBetter(stats.profitFactor, 1, 2.5)
  )

  const riskScore = 100 * (
    0.45 * normalizeLowerBetter(Math.abs(stats.maxDrawdownPct) / 100, 0.05, 0.40) +
    0.35 * normalizeHigherBetter(stats.calmarRatio, 0, 2.5) +
    0.20 * normalizeLowerBetter(stats.downsideVolatility, 0.05, 0.35)
  )

  const robustnessScore = 100 * (
    0.40 * normalizeHigherBetter(stats.rolling63dSharpeMean, 0, 2.0) +
    0.30 * normalizeHigherBetter(stats.positiveMonthRatio / 100, 0.4, 0.9) +
    0.30 * normalizeHigherBetter(1 - (stats.rolling63dSharpeStd / Math.max(stats.rolling63dSharpeMean, 0.1)), 0, 1)
  )

  const executionScore = 100 * (
    0.35 * normalizeHigherBetter(stats.totalTrades, 10, 100) +
    0.30 * normalizeLowerBetter(stats.turnover, 1, 20) +
    0.35 * normalizeLowerBetter(0.25, 0.15, 0.65)
  )

  let penaltyScore = 0
  if (!diagnostics.enoughTrades) penaltyScore += 10
  if (!diagnostics.noNanEquity) penaltyScore += 25
  if (Math.abs(stats.maxDrawdownPct) > 35) penaltyScore += 10
  if (stats.turnover > 25) penaltyScore += 8

  const compositeScore = Math.max(0, Math.min(100,
    0.30 * performanceScore +
    0.25 * riskScore +
    0.30 * robustnessScore +
    0.15 * executionScore -
    penaltyScore
  ))

  return {
    performanceScore: Math.round(performanceScore * 10) / 10,
    riskScore: Math.round(riskScore * 10) / 10,
    robustnessScore: Math.round(robustnessScore * 10) / 10,
    executionScore: Math.round(executionScore * 10) / 10,
    penaltyScore,
    compositeScore: Math.round(compositeScore * 10) / 10,
    grade: getGrade(compositeScore),
  }
}

// ──────────────────────────────────────────────────────────────
// Diagnostics (additional validation info)
// ──────────────────────────────────────────────────────────────

export interface BacktestDiagnostics {
  tradeCount: number
  enoughTrades: boolean
  enoughRows: boolean
  noNanEquity: boolean
  turnover: number
  concentrationRatio: number
}

export function computeDiagnostics(bars: OHLCV[], trades: number): BacktestDiagnostics {
  const enoughTrades = trades >= 10
  const enoughRows = bars.length >= 252
  const noNanEquity = true
  const concentrationRatio = 0.25

  return {
    tradeCount: trades,
    enoughTrades,
    enoughRows,
    noNanEquity,
    turnover: 5,
    concentrationRatio,
  }
}

// ──────────────────────────────────────────────────────────────
// Signal Parser for Custom Code
// ──────────────────────────────────────────────────────────────

export interface Signal {
  index: number
  date: string
  type: 'buy' | 'sell'
  price: number
  comment?: string
}

export function parseSignalsFromCode(
  code: string,
  bars: OHLCV[],
  params: Record<string, number>
): Signal[] {
  const signals: Signal[] = []
  const lines = code.split('\n')
  
  // Pattern: signal: buy, 123.45 or signal: sell, 123.45
  const signalPattern = /signal:\s*(buy|sell)[,\s]+([\d.]+)/gi
  // Pattern: emit_signal('buy', price) or emit_signal("buy", price)
  const emitPattern = /emit_signal\s*\(\s*['"](buy|sell)['"]\s*,\s*([\d.]+)/gi
  // Pattern: # BUY at 123.45 or # SELL 123.45
  const commentPattern = /#\s*(BUY|SELL)\s+(?:at\s+)?([\d.]+)/gi
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    
    // Try signal: buy, 123.45
    let match = signalPattern.exec(line)
    if (match) {
      const type = match[1].toLowerCase() as 'buy' | 'sell'
      const price = parseFloat(match[2])
      const bar = bars[i]
      if (bar && !isNaN(price) && price > 0) {
        signals.push({ index: i, date: bar.date, type, price })
      }
      continue
    }
    
    // Try emit_signal('buy', 123.45)
    match = emitPattern.exec(line)
    if (match) {
      const type = match[1].toLowerCase() as 'buy' | 'sell'
      const price = parseFloat(match[2])
      const bar = bars[i]
      if (bar && !isNaN(price) && price > 0) {
        signals.push({ index: i, date: bar.date, type, price })
      }
      continue
    }
    
    // Try # BUY at 123.45
    match = commentPattern.exec(line)
    if (match) {
      const type = match[1].toLowerCase() as 'buy' | 'sell'
      const price = parseFloat(match[2])
      const bar = bars[i]
      if (bar && !isNaN(price) && price > 0) {
        signals.push({ index: i, date: bar.date, type, price })
      }
    }
  }
  
  // If no signals found, try to generate signals based on RSI logic
  if (signals.length === 0) {
    return generateDefaultSignals(bars, params)
  }
  
  return signals.sort((a, b) => a.index - b.index)
}

function generateDefaultSignals(bars: OHLCV[], params: Record<string, number>): Signal[] {
  const signals: Signal[] = []
  const rsiPeriod = params.rsi || params.period || 14
  const oversold = params.oversold || 30
  const overbought = params.overbought || 70
  
  // Calculate RSI
  const rsi = calculateRSI(bars.map(b => b.close), rsiPeriod)
  
  let inPosition = false
  
  for (let i = rsiPeriod; i < bars.length; i++) {
    const bar = bars[i]
    
    // Buy signal: RSI crosses below oversold
    if (!inPosition && rsi[i] < oversold) {
      signals.push({ index: i, date: bar.date, type: 'buy', price: bar.close })
      inPosition = true
    }
    // Sell signal: RSI crosses above overbought
    else if (inPosition && rsi[i] > overbought) {
      signals.push({ index: i, date: bar.date, type: 'sell', price: bar.close })
      inPosition = false
    }
  }
  
  // Close any open position at the end
  if (inPosition) {
    const lastBar = bars[bars.length - 1]
    signals.push({ index: bars.length - 1, date: lastBar.date, type: 'sell', price: lastBar.close })
  }
  
  return signals
}

function calculateRSI(prices: number[], period: number): number[] {
  const rsi: number[] = new Array(prices.length).fill(50)
  
  if (prices.length < period + 1) return rsi
  
  let avgGain = 0
  let avgLoss = 0
  
  // Initial average
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1]
    if (change > 0) avgGain += change
    else avgLoss -= change
  }
  avgGain /= period
  avgLoss /= period
  
  for (let i = period; i < prices.length; i++) {
    if (i > period) {
      const change = prices[i] - prices[i - 1]
      const gain = change > 0 ? change : 0
      const loss = change < 0 ? -change : 0
      avgGain = (avgGain * (period - 1) + gain) / period
      avgLoss = (avgLoss * (period - 1) + loss) / period
    }
    
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
    rsi[i] = 100 - (100 / (1 + rs))
  }
  
  return rsi
}

export function runBacktestWithSignals(
  bars: OHLCV[],
  signals: Signal[],
  fee: number = 0.001
): BacktestResult {
  if (!bars.length) throw new Error('No bars provided')
  
  const positions: number[] = new Array(bars.length).fill(0)
  const INITIAL_CAPITAL = 100_000
  
  // Map signals to bar indices
  const signalMap = new Map(signals.map(s => [s.index, s]))
  
  let position = 0
  let entryIndex = -1
  
  // Generate position array from signals
  for (let i = 0; i < bars.length; i++) {
    const signal = signalMap.get(i)
    
    if (signal) {
      if (signal.type === 'buy' && position === 0) {
        position = 1
        entryIndex = i
      } else if (signal.type === 'sell' && position === 1) {
        position = 0
        entryIndex = -1
      }
    }
    
    positions[i] = position
  }
  
  // Calculate equity curve
  const equityCurve: number[] = []
  let equity = INITIAL_CAPITAL
  
  for (let i = 0; i < bars.length; i++) {
    // Apply position change costs
    if (i > 0 && positions[i] !== positions[i - 1]) {
      equity *= (1 - fee) // Trading fee
    }
    
    // Apply daily return if in position
    if (i > 0 && positions[i - 1] === 1) {
      const dailyReturn = (bars[i].close - bars[i - 1].close) / bars[i - 1].close
      equity *= (1 + dailyReturn)
    }
    
    equityCurve.push(equity)
  }
  
  // Generate bars for result
  const resultBars: BacktestBar[] = bars.map((bar, i) => ({
    date: bar.date,
    close: bar.close,
    position: positions[i],
    equity: equityCurve[i],
  }))
  
  // Calculate statistics
  const stats = calculateStats(bars, positions, equityCurve, INITIAL_CAPITAL)
  
  return {
    bars: resultBars,
    stats,
    strategy: {
      id: 'custom',
      name: 'Custom Strategy',
      description: 'User-defined signal-based strategy',
      plainEnglish: 'Custom algorithm with user-defined signals',
      bestFor: 'Custom trading strategies',
      mainRisk: 'Depends on signal quality',
      defaultParams: {},
      paramSchema: [],
    },
  }
}

function calculateStats(
  bars: OHLCV[],
  positions: number[],
  equityCurve: number[],
  initialCapital: number
): BacktestStats {
  const returns: number[] = []
  const trades: { entry: number; exit: number; ret: number }[] = []
  
  let inTrade = false
  let entryPrice = 0
  let entryEquity = initialCapital
  
  for (let i = 1; i < bars.length; i++) {
    const dailyReturn = (bars[i].close - bars[i - 1].close) / bars[i - 1].close
    
    if (positions[i] === 1) {
      returns.push(dailyReturn)
    }
    
    // Trade entry
    if (positions[i] === 1 && positions[i - 1] === 0) {
      inTrade = true
      entryPrice = bars[i].close
      entryEquity = equityCurve[i]
    }
    
    // Trade exit
    if (positions[i] === 0 && positions[i - 1] === 1) {
      inTrade = false
      const exitPrice = bars[i].close
      const tradeReturn = ((exitPrice - entryPrice) / entryPrice) * 100
      trades.push({ entry: entryPrice, exit: exitPrice, ret: tradeReturn })
    }
  }
  
  // Calculate metrics
  const totalReturn = equityCurve[equityCurve.length - 1] - initialCapital
  const totalReturnPct = (totalReturn / initialCapital) * 100
  const years = bars.length / 252
  const cagr = years > 0 ? (Math.pow(equityCurve[equityCurve.length - 1] / initialCapital, 1 / years) - 1) * 100 : 0
  
  // Drawdown
  let peak = initialCapital
  let maxDrawdown = 0
  for (const equity of equityCurve) {
    if (equity > peak) peak = equity
    const dd = ((equity - peak) / peak) * 100
    if (dd < maxDrawdown) maxDrawdown = dd
  }
  
  // Win rate
  const winningTrades = trades.filter(t => t.ret > 0)
  const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0
  
  // Sharpe ratio
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0
  const variance = returns.length > 0 ? returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / returns.length : 0
  const stdDev = Math.sqrt(variance) * Math.sqrt(252)
  const sharpeRatio = stdDev > 0 ? (avgReturn * 252) / stdDev : 0
  
  // Sortino ratio
  const downsideReturns = returns.filter(r => r < 0)
  const downsideStd = downsideReturns.length > 0 
    ? Math.sqrt(downsideReturns.reduce((a, b) => a + b * b, 0) / downsideReturns.length) * Math.sqrt(252)
    : 0
  const sortinoRatio = downsideStd > 0 ? (avgReturn * 252) / downsideStd : 0
  
  // Profit factor
  const grossProfit = winningTrades.reduce((a, t) => a + t.ret, 0)
  const grossLoss = trades.filter(t => t.ret <= 0).reduce((a, t) => a + Math.abs(t.ret), 0)
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0
  
  // Calmar ratio
  const calmarRatio = Math.abs(maxDrawdown) > 0 ? cagr / Math.abs(maxDrawdown) : 0
  
  // Exposure time
  const exposureTime = returns.length / bars.length
  
  // Average trade
  const avgTradeReturn = trades.length > 0 ? trades.reduce((a, t) => a + t.ret, 0) / trades.length : 0
  const avgWin = winningTrades.length > 0 ? winningTrades.reduce((a, t) => a + t.ret, 0) / winningTrades.length : 0
  const avgLoss = trades.filter(t => t.ret < 0).reduce((a, t) => a + t.ret, 0) / (trades.length - winningTrades.length) || 0
  const bestTrade = trades.length > 0 ? Math.max(...trades.map(t => t.ret)) : 0
  const worstTrade = trades.length > 0 ? Math.min(...trades.map(t => t.ret)) : 0
  
  return {
    totalReturnPct,
    annualizedReturnPct: cagr,
    cagr,
    totalReturn: totalReturn / initialCapital,
    sharpeRatio,
    sortinoRatio,
    maxDrawdownPct: Math.abs(maxDrawdown),
    maxDrawdownDuration: 0,
    averageDrawdownPct: Math.abs(maxDrawdown) / 2,
    downsideVolatility: downsideStd,
    winRate,
    totalTrades: trades.length,
    profitableTrades: winningTrades.length,
    avgTradeDurationDays: 0,
    avgTradeReturnPct: avgTradeReturn,
    bestTradePct: bestTrade,
    worstTradePct: worstTrade,
    avgWin,
    avgLoss,
    profitFactor,
    exposureTime,
    turnover: 0,
    calmarRatio,
    positiveMonthRatio: 0,
    rolling63dSharpeMean: sharpeRatio,
    rolling63dSharpeStd: 0,
  }
}
