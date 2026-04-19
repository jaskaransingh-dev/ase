/**
 * ASE Strategy Types
 * 
 * Core type definitions for strategies that return actual trade decisions,
 * not just binary positions. Supports multi-asset universes with proper
 * trade simulation.
 */

export type DecisionAction = 'BUY' | 'SELL' | 'HOLD'

export interface AssetDecision {
  asset: string
  action: DecisionAction
  targetPositionPct: number      // 0-1, target exposure after trade
  conviction: number              // 0-1, confidence in the decision
  thesis?: string                 // Human-readable reason
  riskNotes?: string
}

export interface StrategyDecision {
  timestamp: string
  decisions: AssetDecision[]
  globalCommentary?: string
}

export interface StrategyConfig {
  name: string
  version: string
  universe: string[]
  rebalanceFreq: 'daily' | 'weekly' | 'monthly' | 'always'
  longOnly: boolean
  maxPositionPct: number          // Max position size per asset
  minCashPct: number              // Minimum cash buffer
  maxTotalExposure: number        // Max total portfolio exposure
  defaultFee: number              // Fee per trade (0.001 = 0.1%)
  maxTurnoverPerDay: number       // Max portfolio turnover per day
}

export interface FeatureRow {
  asset: string
  timestamp: string
  close: number
  open: number
  high: number
  low: number
  volume: number
  returns_1d: number
  returns_7d: number
  returns_14d: number
  returns_30d: number
  volatility_7d: number
  volatility_30d: number
  rsi_14?: number
  rsi_7?: number
  sma_20?: number
  sma_50?: number
  sma_200?: number
  ema_12?: number
  ema_26?: number
  macd?: number
  macd_signal?: number
  macd_hist?: number
  atr_14?: number
  bb_upper?: number
  bb_lower?: number
  bb_middle?: number
  bb_width?: number
  adx_14?: number
  volume_ratio?: number
}

export interface Position {
  asset: string
  quantity: number
  marketValue: number
  avgEntryPrice: number
  currentPrice: number
  unrealizedPnl: number
  unrealizedPnlPct: number
  weight: number
}

export interface PortfolioState {
  timestamp: string
  equity: number
  cash: number
  startingEquity: number
  drawdownPct: number
  grossExposurePct: number
  netExposurePct: number
  positions: Position[]
  maxPositionPct: number
  longOnly: boolean
  totalFees: number
  totalSlippage: number
}

export interface StrategyContext {
  timestamp: string
  features: FeatureRow[]
  portfolio: PortfolioState
  config: StrategyConfig
}

export interface TradeRecord {
  id: string
  timestamp: string
  asset: string
  action: 'BUY' | 'SELL'
  quantity: number
  price: number
  fee: number
  slippage: number
  totalValue: number
  reason: string
  pnl?: number
  pnlPct?: number
}

export interface PortfolioSnapshot {
  timestamp: string
  equity: number
  cash: number
  positionsValue: number
  totalValue: number
  drawdownPct: number
  positions: Position[]
  dayReturn: number
  dayReturnPct: number
}

export interface BacktestConfig {
  initialCapital: number
  fee: number                      // Per-trade fee (decimal)
  slippage: number                 // Slippage (decimal)
  maxPositionPct: number
  longOnly: boolean
  universe: string[]
  rebalanceFreq: 'daily' | 'weekly' | 'monthly' | 'always'
}

export interface StrategyMetrics {
  totalReturn: number
  totalReturnPct: number
  cagr: number
  sharpeRatio: number
  sortinoRatio: number
  maxDrawdownPct: number
  maxDrawdownDuration: number
  winRate: number
  totalTrades: number
  profitableTrades: number
  losingTrades: number
  profitFactor: number
  avgWin: number
  avgLoss: number
  avgTradeDuration: number
  avgHoldTime: number
  turnover: number
  exposureTime: number
  calmarRatio: number
  bestTrade: number
  worstTrade: number
  avgWinLossRatio: number
  consecutiveWins: number
  consecutiveLosses: number
  largestWin: number
  largestLoss: number
}

export interface BacktestResult {
  config: BacktestConfig
  equityCurve: PortfolioSnapshot[]
  trades: TradeRecord[]
  metrics: StrategyMetrics
  finalPositions: Position[]
  warnings: string[]
}

export interface BaseStrategy {
  config: StrategyConfig
  evaluate(context: StrategyContext): StrategyDecision
}

export function createDefaultConfig(universe: string[]): StrategyConfig {
  return {
    name: 'Untitled Strategy',
    version: '1.0.0',
    universe,
    rebalanceFreq: 'daily',
    longOnly: true,
    maxPositionPct: 0.25,
    minCashPct: 0.05,
    maxTotalExposure: 0.95,
    defaultFee: 0.001,
    maxTurnoverPerDay: 1.0,
  }
}

export interface OHLCV {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export function createEmptyPortfolio(
  timestamp: string,
  initialCapital: number,
  config: StrategyConfig
): PortfolioState {
  return {
    timestamp,
    equity: initialCapital,
    cash: initialCapital,
    startingEquity: initialCapital,
    drawdownPct: 0,
    grossExposurePct: 0,
    netExposurePct: 0,
    positions: [],
    maxPositionPct: config.maxPositionPct,
    longOnly: config.longOnly,
    totalFees: 0,
    totalSlippage: 0,
  }
}