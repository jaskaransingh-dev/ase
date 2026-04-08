/**
 * ASE Backtesting Engine — TypeScript port of algo_lab_refresh (Python/Streamlit)
 *
 * Supports 5 strategies:
 *   1. Mean Reversion       — z-score based
 *   2. Momentum Crossover   — fast/slow MA crossover
 *   3. Breakout Trend       — rolling high breakout
 *   4. RSI Trend Filter     — RSI + trend MA
 *   5. Volatility Breakout  — ATR trailing stop
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

  // shift(1) means use previous bar's rolling max
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

// ──────────────────────────────────────────────────────────────
// Statistics
// ──────────────────────────────────────────────────────────────

function computeStats(equityCurve: number[], positions: number[], bars: OHLCV[]): BacktestStats {
  const n = equityCurve.length
  if (n < 2) {
    return {
      totalReturnPct: 0, annualizedReturnPct: 0, sharpeRatio: 0,
      maxDrawdownPct: 0, winRate: 0, totalTrades: 0, profitableTrades: 0,
      avgTradeDurationDays: 0, bestTradePct: 0, worstTradePct: 0, calmarRatio: 0,
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

  // Max drawdown
  let peak = equityCurve[0]
  let maxDD = 0
  for (const val of equityCurve) {
    if (val > peak) peak = val
    const dd = (peak - val) / peak
    if (dd > maxDD) maxDD = dd
  }
  const maxDrawdownPct = maxDD * 100

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

  const calmarRatio = maxDrawdownPct === 0 ? 0 : annualizedReturnPct / maxDrawdownPct

  return {
    totalReturnPct,
    annualizedReturnPct,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    maxDrawdownPct,
    winRate,
    totalTrades: trades.length,
    profitableTrades,
    avgTradeDurationDays: Math.round(avgDuration),
    bestTradePct,
    worstTradePct,
    calmarRatio: Math.round(calmarRatio * 100) / 100,
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
): BacktestResult {
  if (!bars.length) throw new Error('No bars provided')
  const stratMeta = STRATEGIES[strategyId]
  if (!stratMeta) throw new Error(`Unknown strategy: ${strategyId}`)

  // Get positions from strategy
  let positions: number[]
  switch (strategyId) {
    case 'mean_reversion':     positions = stratMeanReversion(bars, params); break
    case 'momentum_crossover': positions = stratMomentumCrossover(bars, params); break
    case 'breakout_trend':     positions = stratBreakoutTrend(bars, params); break
    case 'rsi_trend_filter':   positions = stratRsiTrendFilter(bars, params); break
    case 'volatility_breakout': positions = stratVolatilityBreakout(bars, params); break
    default: throw new Error(`No runner for ${strategyId}`)
  }

  // Simulate equity curve with trading fees
  const equityCurve: number[] = []
  let equity = INITIAL_CAPITAL
  let prevPosition = 0

  for (let i = 0; i < bars.length; i++) {
    const pos = positions[i]

    // Apply fee on position change
    if (pos !== prevPosition && i > 0) {
      equity *= (1 - fee)
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
