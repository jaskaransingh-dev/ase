/**
 * ASE Multi-Asset Backtest Engine
 * 
 * Runs user-defined strategies that produce actual trade decisions,
 * not just binary positions. The equity curve comes from simulated
 * trades, making results feel legitimate.
 * 
 * Strategy contract:
 * - config: strategy metadata and constraints
 * - evaluate(context): returns decisions for each asset
 */

import type {
  StrategyContext,
  StrategyDecision,
  AssetDecision,
  PortfolioState,
  PortfolioSnapshot,
  TradeRecord,
  BacktestConfig,
  BacktestResult,
  StrategyMetrics,
  FeatureRow,
  Position,
  StrategyConfig,
  OHLCV,
} from './strategy-types'

const DEFAULT_CONFIG: Partial<BacktestConfig> = {
  initialCapital: 100000,
  fee: 0.001,
  slippage: 0.0005,
  maxPositionPct: 0.25,
  longOnly: true,
  rebalanceFreq: 'daily',
}

export function runStrategyBacktest(
  barsByAsset: Record<string, OHLCV[]>,
  strategy: { config: StrategyConfig; evaluate: (ctx: StrategyContext) => StrategyDecision },
  overrides?: Partial<BacktestConfig>
): BacktestResult {
  const config: BacktestConfig = {
    ...DEFAULT_CONFIG,
    ...overrides,
    universe: strategy.config.universe,
  } as BacktestConfig

  const { initialCapital, fee, slippage } = config

  const equityCurve: PortfolioSnapshot[] = []
  const trades: TradeRecord[] = []
  const warnings: string[] = []

  let portfolio = createPortfolio(
    new Date().toISOString(),
    initialCapital,
    strategy.config
  )

  const allDates = getAllDates(barsByAsset, config.rebalanceFreq)
  
  if (allDates.length < 30) {
    warnings.push(`Only ${allDates.length} data points — results may not be reliable`)
  }

  for (let dayIdx = 0; dayIdx < allDates.length; dayIdx++) {
    const timestamp = allDates[dayIdx]

    const features: FeatureRow[] = []
    for (const asset of config.universe) {
      const bars = barsByAsset[asset]
      if (!bars || bars.length === 0) continue

      const barIdx = bars.findIndex(b => b.date >= timestamp)
      if (barIdx < 0) continue

      const bar = bars[barIdx]
      const historicalBars = bars.slice(0, barIdx + 1)

      if (historicalBars.length < 2) continue

      const featureRow = computeFeatures(asset, historicalBars, barIdx)
      features.push(featureRow)
    }

    if (features.length === 0) continue

    portfolio.timestamp = timestamp

    const context: StrategyContext = {
      timestamp,
      features,
      portfolio,
      config: strategy.config,
    }

    let strategyDecision: StrategyDecision
    try {
      strategyDecision = strategy.evaluate(context)
    } catch (err) {
      warnings.push(`Strategy error on ${timestamp}: ${err instanceof Error ? err.message : 'Unknown'}`)
      continue
    }

    if (!strategyDecision?.decisions) {
      warnings.push(`No decisions on ${timestamp}`)
      continue
    }

    const tradesThisDay = executeTrades(
      strategyDecision.decisions,
      portfolio,
      features,
      config,
      timestamp,
      fee,
      slippage
    )

    trades.push(...tradesThisDay.trades)
    portfolio = tradesThisDay.portfolio

    const snapshot = createSnapshot(portfolio, dayIdx > 0 ? equityCurve[dayIdx - 1] : null)
    equityCurve.push(snapshot)
  }

  if (equityCurve.length === 0) {
    throw new Error('No trading days completed - check data coverage')
  }

  const metrics = computeMetrics(equityCurve, trades, initialCapital)

  return {
    config,
    equityCurve,
    trades,
    metrics,
    finalPositions: portfolio.positions,
    warnings,
  }
}

function getAllDates(barsByAsset: Record<string, OHLCV[]>, freq: string): string[] {
  const dateSets = new Set<string>()

  for (const bars of Object.values(barsByAsset)) {
    for (const bar of bars) {
      if (freq === 'always' || freq === 'daily') {
        dateSets.add(bar.date.substring(0, 10))
      } else if (freq === 'weekly') {
        const d = new Date(bar.date)
        const weekStart = new Date(d)
        weekStart.setDate(d.getDate() - d.getDay())
        dateSets.add(weekStart.toISOString().substring(0, 10))
      } else if (freq === 'monthly') {
        dateSets.add(bar.date.substring(0, 7))
      }
    }
  }

  return Array.from(dateSets).sort()
}

function createPortfolio(timestamp: string, initialCapital: number, strategyConfig: StrategyConfig): PortfolioState {
  return {
    timestamp,
    equity: initialCapital,
    cash: initialCapital,
    startingEquity: initialCapital,
    drawdownPct: 0,
    grossExposurePct: 0,
    netExposurePct: 0,
    positions: [],
    maxPositionPct: strategyConfig.maxPositionPct,
    longOnly: strategyConfig.longOnly,
    totalFees: 0,
    totalSlippage: 0,
  }
}

function createSnapshot(portfolio: PortfolioState, prevSnapshot: PortfolioSnapshot | null): PortfolioSnapshot {
  const positionsValue = portfolio.positions.reduce((sum, p) => sum + p.marketValue, 0)
  const totalValue = portfolio.cash + positionsValue
  const equity = totalValue

  let dayReturn = 0
  let dayReturnPct = 0
  if (prevSnapshot) {
    dayReturn = equity - prevSnapshot.totalValue
    dayReturnPct = prevSnapshot.totalValue > 0 ? (dayReturn / prevSnapshot.totalValue) * 100 : 0
  }

  const peak = prevSnapshot 
    ? Math.max(prevSnapshot.totalValue, equity) 
    : equity
  const drawdownPct = peak > 0 ? ((peak - equity) / peak) * 100 : 0

  const grossExposure = positionsValue / equity
  const netExposure = grossExposure

  return {
    timestamp: portfolio.timestamp,
    equity,
    cash: portfolio.cash,
    positionsValue,
    totalValue,
    drawdownPct,
    positions: [...portfolio.positions],
    dayReturn,
    dayReturnPct,
  }
}

function computeFeatures(asset: string, bars: OHLCV[], currentIdx: number): FeatureRow {
  const bar = bars[currentIdx]
  const closes = bars.map(b => b.close)
  const highs = bars.map(b => b.high)
  const lows = bars.map(b => b.low)
  const volumes = bars.map(b => b.volume)

  const returns_1d = currentIdx > 0 
    ? (closes[currentIdx] - closes[currentIdx - 1]) / closes[currentIdx - 1] 
    : 0

  const returns_7d = currentIdx >= 7 
    ? (closes[currentIdx] - closes[currentIdx - 7]) / closes[currentIdx - 7] 
    : 0

  const returns_30d = currentIdx >= 30 
    ? (closes[currentIdx] - closes[currentIdx - 30]) / closes[currentIdx - 30] 
    : 0

  const returns_14d = currentIdx >= 14 
    ? (closes[currentIdx] - closes[currentIdx - 14]) / closes[currentIdx - 14] 
    : 0

  const volatility_7d = currentIdx >= 7
    ? computeVolatility(closes.slice(currentIdx - 7, currentIdx + 1))
    : 0

  const volatility_30d = currentIdx >= 30
    ? computeVolatility(closes.slice(currentIdx - 30, currentIdx + 1))
    : 0

  return {
    asset,
    timestamp: bar.date,
    close: bar.close,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    volume: bar.volume,
    returns_1d,
    returns_7d,
    returns_14d,
    returns_30d,
    volatility_7d,
    volatility_30d,
    rsi_14: computeRsi(closes, 14, currentIdx),
    rsi_7: computeRsi(closes, 7, currentIdx),
    sma_20: computeSma(closes, 20, currentIdx),
    sma_50: computeSma(closes, 50, currentIdx),
    sma_200: computeSma(closes, 200, currentIdx),
    ema_12: computeEma(closes, 12, currentIdx),
    ema_26: computeEma(closes, 26, currentIdx),
    macd: undefined,
    macd_signal: undefined,
    macd_hist: undefined,
    atr_14: computeAtr(highs, lows, closes, 14, currentIdx),
    bb_upper: undefined,
    bb_lower: undefined,
    bb_middle: undefined,
    bb_width: undefined,
    adx_14: undefined,
    volume_ratio: computeVolumeRatio(volumes, currentIdx),
  }
}

function computeVolatility(closes: number[]): number {
  if (closes.length < 2) return 0
  const returns = closes.slice(1).map((c, i) => (c - closes[i]) / closes[i])
  if (returns.length === 0) return 0
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length
  return Math.sqrt(variance)
}

function computeRsi(closes: number[], period: number, currentIdx: number): number | undefined {
  if (currentIdx < period) return undefined

  let avgGain = 0
  let avgLoss = 0

  for (let i = currentIdx - period + 1; i <= currentIdx; i++) {
    const change = closes[i] - closes[i - 1]
    if (change > 0) avgGain += change
    else avgLoss += Math.abs(change)
  }

  avgGain /= period
  avgLoss /= period

  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

function computeSma(closes: number[], period: number, currentIdx: number): number | undefined {
  if (currentIdx < period - 1) return undefined
  const slice = closes.slice(currentIdx - period + 1, currentIdx + 1)
  return slice.reduce((a, b) => a + b, 0) / period
}

function computeEma(closes: number[], period: number, currentIdx: number): number | undefined {
  if (currentIdx < period - 1) return undefined
  const k = 2 / (period + 1)
  let ema = closes[0]
  for (let i = 1; i <= currentIdx; i++) {
    ema = closes[i] * k + ema * (1 - k)
  }
  return ema
}

function computeAtr(highs: number[], lows: number[], closes: number[], period: number, currentIdx: number): number | undefined {
  if (currentIdx < period) return undefined

  const trValues: number[] = []
  for (let i = currentIdx - period + 1; i <= currentIdx; i++) {
    if (i === 0) continue
    const hl = highs[i] - lows[i]
    const hc = Math.abs(highs[i] - closes[i - 1])
    const lc = Math.abs(lows[i] - closes[i - 1])
    trValues.push(Math.max(hl, hc, lc))
  }

  return trValues.reduce((a, b) => a + b, 0) / trValues.length
}

function computeVolumeRatio(volumes: number[], currentIdx: number, period = 20): number | undefined {
  if (currentIdx < period) return undefined
  const currentVol = volumes[currentIdx]
  const avgVol = volumes.slice(currentIdx - period, currentIdx).reduce((a, b) => a + b, 0) / period
  return currentVol / avgVol
}

function executeTrades(
  decisions: AssetDecision[],
  portfolio: PortfolioState,
  features: FeatureRow[],
  config: BacktestConfig,
  timestamp: string,
  fee: number,
  slippage: number
): { trades: TradeRecord[]; portfolio: PortfolioState } {
  const newTrades: TradeRecord[] = []
  const newPortfolio = { ...portfolio, positions: [...portfolio.positions] }

  const priceMap = new Map(features.map(f => [f.asset, f.close || (f as any).c]))

  for (const decision of decisions) {
    if (decision.action === 'HOLD') continue

    const price = priceMap.get(decision.asset)
    if (!price) continue

    let currentPosition = newPortfolio.positions.find(p => p.asset === decision.asset)
    const currentWeight = currentPosition ? currentPosition.weight : 0
    const currentQty = currentPosition ? currentPosition.quantity : 0

    const targetWeight = Math.max(0, Math.min(1, decision.targetPositionPct))
    const maxWeight = config.longOnly 
      ? config.maxPositionPct 
      : config.maxPositionPct

    const clampedTarget = Math.min(targetWeight, maxWeight)

    const weightDiff = clampedTarget - currentWeight
    
    if (Math.abs(weightDiff) < 0.001) continue

    const tradeValue = Math.abs(weightDiff) * newPortfolio.equity
    const isBuy = weightDiff > 0

    if (isBuy && newPortfolio.cash < tradeValue * (1 + fee + slippage)) {
      continue
    }

    const actualPrice = isBuy 
      ? price * (1 + slippage) 
      : price * (1 - slippage)
    const actualFee = tradeValue * fee
    const quantity = tradeValue / actualPrice

    if (!isBuy && currentQty < quantity * 0.99) {
      continue
    }

    if (isBuy) {
      newPortfolio.cash -= tradeValue + actualFee
      newPortfolio.totalFees += actualFee
      newPortfolio.totalSlippage += tradeValue * slippage

      if (currentPosition) {
        const totalValue = currentPosition.marketValue + tradeValue
        const totalQty = currentPosition.quantity + quantity
        currentPosition.quantity = totalQty
        currentPosition.avgEntryPrice = totalValue / totalQty
        currentPosition.marketValue = quantity * actualPrice
        currentPosition.currentPrice = actualPrice
        currentPosition.weight = (totalValue - actualFee) / newPortfolio.equity
      } else {
        newPortfolio.positions.push({
          asset: decision.asset,
          quantity,
          marketValue: tradeValue - actualFee,
          avgEntryPrice: actualPrice,
          currentPrice: actualPrice,
          unrealizedPnl: 0,
          unrealizedPnlPct: 0,
          weight: clampedTarget,
        })
      }
    } else {
      const saleValue = quantity * actualPrice
      newPortfolio.cash += saleValue - actualFee
      newPortfolio.totalFees += actualFee
      newPortfolio.totalSlippage += tradeValue * slippage

      if (currentPosition) {
        const exitPnl = (actualPrice - currentPosition.avgEntryPrice) * quantity
        
        newTrades.push({
          id: `${timestamp}-${decision.asset}-SELL`,
          timestamp,
          asset: decision.asset,
          action: 'SELL',
          quantity,
          price: actualPrice,
          fee: actualFee,
          slippage: tradeValue * slippage,
          totalValue: saleValue,
          reason: decision.thesis || 'Signal',
          pnl: exitPnl,
          pnlPct: ((actualPrice - currentPosition.avgEntryPrice) / currentPosition.avgEntryPrice) * 100,
        })

        if (currentQty - quantity < 0.001) {
          newPortfolio.positions = newPortfolio.positions.filter(p => p.asset !== decision.asset)
        } else {
          currentPosition.quantity -= quantity
          currentPosition.marketValue = currentPosition.quantity * actualPrice
          currentPosition.currentPrice = actualPrice
          currentPosition.weight = (currentPosition.marketValue / newPortfolio.equity)
        }
      }
    }

    if (weightDiff > 0) {
      newTrades.push({
        id: `${timestamp}-${decision.asset}-BUY`,
        timestamp,
        asset: decision.asset,
        action: 'BUY',
        quantity,
        price: actualPrice,
        fee: actualFee,
        slippage: tradeValue * slippage,
        totalValue: tradeValue,
        reason: decision.thesis || 'Signal',
      })
    }
  }

  for (const pos of newPortfolio.positions) {
    const currentPrice = priceMap.get(pos.asset)
    if (currentPrice) {
      pos.currentPrice = currentPrice
      pos.marketValue = pos.quantity * currentPrice
      pos.unrealizedPnl = (currentPrice - pos.avgEntryPrice) * pos.quantity
      pos.unrealizedPnlPct = ((currentPrice - pos.avgEntryPrice) / pos.avgEntryPrice) * 100
      pos.weight = pos.marketValue / newPortfolio.equity
    }
  }

  const positionsValue = newPortfolio.positions.reduce((sum, p) => sum + p.marketValue, 0)
  newPortfolio.equity = newPortfolio.cash + positionsValue

  const peak = Math.max(newPortfolio.startingEquity, newPortfolio.equity)
  newPortfolio.drawdownPct = ((peak - newPortfolio.equity) / peak) * 100

  const grossExposure = positionsValue / newPortfolio.equity
  newPortfolio.grossExposurePct = grossExposure * 100
  newPortfolio.netExposurePct = grossExposure * 100

  return { trades: newTrades, portfolio: newPortfolio }
}

function computeMetrics(
  equityCurve: PortfolioSnapshot[],
  trades: TradeRecord[],
  initialCapital: number
): StrategyMetrics {
  if (equityCurve.length === 0) {
    return createEmptyMetrics()
  }

  const finalEquity = equityCurve[equityCurve.length - 1].totalValue
  const totalReturn = finalEquity - initialCapital
  const totalReturnPct = (totalReturn / initialCapital) * 100

  const years = equityCurve.length / 252
  const cagr = years > 0 
    ? (Math.pow(finalEquity / initialCapital, 1 / years) - 1) * 100 
    : 0

  const dailyReturns = equityCurve.slice(1).map((s, i) => 
    (s.totalValue - equityCurve[i].totalValue) / equityCurve[i].totalValue
  )

  const meanReturn = dailyReturns.length > 0 
    ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length 
    : 0
  const stdReturn = dailyReturns.length > 1
    ? Math.sqrt(dailyReturns.reduce((sum, r) => sum + (r - meanReturn) ** 2, 0) / dailyReturns.length)
    : 0

  const sharpeRatio = stdReturn > 0 ? (meanReturn / stdReturn) * Math.sqrt(252) : 0

  const negativeReturns = dailyReturns.filter(r => r < 0)
  const downsideDev = negativeReturns.length > 0
    ? Math.sqrt(negativeReturns.reduce((sum, r) => sum + r ** 2, 0) / negativeReturns.length)
    : 0
  const sortinoRatio = downsideDev > 0 ? (meanReturn / downsideDev) * Math.sqrt(252) : 0

  let maxDrawdownPct = 0
  let peak = equityCurve[0].totalValue
  for (const snapshot of equityCurve) {
    if (snapshot.totalValue > peak) peak = snapshot.totalValue
    const dd = ((peak - snapshot.totalValue) / peak) * 100
    if (dd > maxDrawdownPct) maxDrawdownPct = dd
  }

  const buyTrades = trades.filter(t => t.action === 'BUY')
  const sellTrades = trades.filter(t => t.action === 'SELL' && t.pnl !== undefined)
  
  const totalTrades = buyTrades.length + sellTrades.length
  const profitableTrades = sellTrades.filter(t => (t.pnl || 0) > 0).length
  const losingTrades = sellTrades.filter(t => (t.pnl || 0) < 0).length
  const winRate = totalTrades > 0 ? (profitableTrades / Math.max(1, sellTrades.length)) * 100 : 0

  const pnlValues = sellTrades.map(t => t.pnl || 0)
  const grossProfit = pnlValues.filter(p => p > 0).reduce((a, b) => a + b, 0)
  const grossLoss = Math.abs(pnlValues.filter(p => p < 0).reduce((a, b) => a + b, 0))
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0

  const wins = pnlValues.filter(p => p > 0)
  const losses = pnlValues.filter(p => p < 0)
  const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0

  const avgWinLossRatio = Math.abs(avgLoss) > 0 ? avgWin / Math.abs(avgLoss) : 0

  let consecutiveWins = 0
  let consecutiveLosses = 0
  let maxConsecutiveWins = 0
  let maxConsecutiveLosses = 0

  for (const pnl of pnlValues) {
    if (pnl > 0) {
      consecutiveWins++
      consecutiveLosses = 0
      if (consecutiveWins > maxConsecutiveWins) maxConsecutiveWins = consecutiveWins
    } else if (pnl < 0) {
      consecutiveLosses++
      consecutiveWins = 0
      if (consecutiveLosses > maxConsecutiveLosses) maxConsecutiveLosses = consecutiveLosses
    }
  }

  const pnlPcts = sellTrades.map(t => t.pnlPct || 0).filter(p => p !== 0)
  const bestTrade = pnlPcts.length > 0 ? Math.max(...pnlPcts) : 0
  const worstTrade = pnlPcts.length > 0 ? Math.min(...pnlPcts) : 0

  const totalVolume = trades.reduce((sum, t) => sum + t.totalValue, 0)
  const turnover = totalVolume / (initialCapital * (equityCurve.length / 252))

  const exposureTime = equityCurve.filter(s => s.positionsValue > 0).length / equityCurve.length * 100

  const calmarRatio = maxDrawdownPct > 0 ? cagr / maxDrawdownPct : 0

  return {
    totalReturn,
    totalReturnPct,
    cagr,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    sortinoRatio: Math.round(sortinoRatio * 100) / 100,
    maxDrawdownPct: Math.round(maxDrawdownPct * 100) / 100,
    maxDrawdownDuration: 0,
    winRate: Math.round(winRate * 10) / 10,
    totalTrades,
    profitableTrades,
    losingTrades,
    profitFactor: Math.round(profitFactor * 100) / 100,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    avgTradeDuration: 0,
    avgHoldTime: 0,
    turnover: Math.round(turnover * 100) / 100,
    exposureTime: Math.round(exposureTime * 100) / 100,
    calmarRatio: Math.round(calmarRatio * 100) / 100,
    bestTrade: Math.round(bestTrade * 100) / 100,
    worstTrade: Math.round(worstTrade * 100) / 100,
    avgWinLossRatio: Math.round(avgWinLossRatio * 100) / 100,
    consecutiveWins: maxConsecutiveWins,
    consecutiveLosses: maxConsecutiveLosses,
    largestWin: Math.round(avgWin * 100) / 100,
    largestLoss: Math.round(avgLoss * 100) / 100,
  }
}

function createEmptyMetrics(): StrategyMetrics {
  return {
    totalReturn: 0,
    totalReturnPct: 0,
    cagr: 0,
    sharpeRatio: 0,
    sortinoRatio: 0,
    maxDrawdownPct: 0,
    maxDrawdownDuration: 0,
    winRate: 0,
    totalTrades: 0,
    profitableTrades: 0,
    losingTrades: 0,
    profitFactor: 0,
    avgWin: 0,
    avgLoss: 0,
    avgTradeDuration: 0,
    avgHoldTime: 0,
    turnover: 0,
    exposureTime: 0,
    calmarRatio: 0,
    bestTrade: 0,
    worstTrade: 0,
    avgWinLossRatio: 0,
    consecutiveWins: 0,
    consecutiveLosses: 0,
    largestWin: 0,
    largestLoss: 0,
  }
}

export function runStrategyFromConfig(
  barsByAsset: Record<string, OHLCV[]>,
  universe: string[],
  config: {
    lookbackDays?: number
    topN?: number
    positionSize?: number
    stopLossPct?: number
    takeProfitPct?: number
    momentumWeight?: number
    trendWeight?: number
    rsiWeight?: number
    rebalanceFreq?: 'daily' | 'weekly' | 'monthly'
    fee?: number
    slippage?: number
  } = {}
): BacktestResult {
  const {
    lookbackDays = 14,
    topN = 3,
    positionSize = 0.33,
    stopLossPct = 0.05,
    takeProfitPct = 0.15,
    momentumWeight = 1.0,
    trendWeight = 0.3,
    rsiWeight = 0.2,
    rebalanceFreq = 'daily',
    fee = 0.001,
    slippage = 0.0005,
  } = config

  const strategy = {
    config: {
      name: 'Custom Strategy',
      version: '1.0.0',
      universe,
      rebalanceFreq: rebalanceFreq as 'daily' | 'weekly' | 'monthly',
      longOnly: true,
      maxPositionPct: positionSize,
      minCashPct: 0.05,
      maxTotalExposure: 0.95,
      defaultFee: fee,
      maxTurnoverPerDay: 1.0,
    },
    evaluate(context: StrategyContext): StrategyDecision {
      const { features, portfolio } = context
      const currentPositions = new Map(
        portfolio.positions.map(p => [p.asset, p])
      )

      const scored = features.map(feat => {
        const mom7d = (feat.returns_7d || 0) * 100
        const mom30d = (feat.returns_30d || 0) * 50
        const momScore = (mom7d + mom30d) * momentumWeight

        const trendScore = feat.sma_20 && feat.sma_50 
          ? (feat.close > feat.sma_20 ? 1.5 : -1) * trendWeight
          : 0

        const rsiScore = feat.rsi_14 
          ? (feat.rsi_14 < 30 ? 2 : feat.rsi_14 < 40 ? 1 : feat.rsi_14 > 70 ? -2 : feat.rsi_14 > 60 ? -0.5 : 0) * rsiWeight
          : 0

        const totalScore = momScore + trendScore + rsiScore
        
        return { asset: feat.asset, score: totalScore, feat }
      }).sort((a, b) => b.score - a.score)

      const topAssets = new Set(scored.slice(0, topN).map(s => s.asset))

      const decisions: AssetDecision[] = []

      for (const feat of features) {
        const pos = currentPositions.get(feat.asset)
        const currentWeight = pos?.weight || 0
        const entryPrice = pos?.avgEntryPrice || 0
        const currentPrice = feat.close
        const pnlPct = entryPrice > 0 ? (currentPrice - entryPrice) / entryPrice : 0

        const isTopAsset = topAssets.has(feat.asset)
        const isStopLoss = pnlPct < -stopLossPct
        const isTakeProfit = pnlPct > takeProfitPct && !isTopAsset
        const inStrongBuyZone = scored.find(s => s.asset === feat.asset && s.score > 0.5)

        if (isStopLoss) {
          decisions.push({
            asset: feat.asset,
            action: 'SELL',
            targetPositionPct: 0,
            conviction: 0.95,
            thesis: `Stop-loss: ${(pnlPct * 100).toFixed(1)}%`,
          })
        } else if (isTakeProfit) {
          decisions.push({
            asset: feat.asset,
            action: 'SELL',
            targetPositionPct: 0,
            conviction: 0.8,
            thesis: `Take profit: ${(pnlPct * 100).toFixed(1)}%`,
          })
        } else if (inStrongBuyZone && currentWeight < positionSize - 0.02) {
          decisions.push({
            asset: feat.asset,
            action: 'BUY',
            targetPositionPct: positionSize,
            conviction: 0.85,
            thesis: `Score: ${scored.find(s => s.asset === feat.asset)?.score.toFixed(1)}`,
          })
        } else if (!isTopAsset && currentWeight > 0.01) {
          decisions.push({
            asset: feat.asset,
            action: 'SELL',
            targetPositionPct: 0,
            conviction: 0.7,
            thesis: `Rotate: score ${scored.find(s => s.asset === feat.asset)?.score.toFixed(1)}`,
          })
        } else if (currentWeight > 0) {
          decisions.push({
            asset: feat.asset,
            action: 'HOLD',
            targetPositionPct: currentWeight,
            conviction: 0.3,
            thesis: 'Hold',
          })
        }
      }

      return {
        timestamp: context.timestamp,
        decisions,
      }
    },
  }

  return runStrategyBacktest(barsByAsset, strategy, {
    initialCapital: 100000,
    fee,
    slippage,
  })
}