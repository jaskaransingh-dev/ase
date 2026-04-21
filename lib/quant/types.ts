// ============================================================
// Quant Framework — Core Type Definitions
// Every layer's I/O contract is defined here.
// ============================================================

// ── Primitives ───────────────────────────────────────────────

export interface OHLCV {
  date: string
  symbol: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  adj_close?: number
}

export interface Bar {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// Panel: symbol → time-series of bars
export type BarPanel = Record<string, Bar[]>

// ── Universe ──────────────────────────────────────────────────

export interface UniverseConfig {
  symbols: string[]
  minAdvUsd: number
  minPriceUsd: number
  maxAssets: number
  rebalanceFreq: 'daily' | 'weekly' | 'monthly'
}

export interface UniverseSnapshot {
  date: string
  symbols: string[]
}

// ── Features ──────────────────────────────────────────────────

export interface FeatureRow {
  date: string
  symbol: string
  // Price-based
  ret_1d: number
  ret_5d: number
  ret_20d: number
  ret_60d: number
  ret_252d: number
  // Volatility
  vol_20d: number
  vol_60d: number
  vol_ratio: number        // vol_20 / vol_60 (vol regime)
  // Moving averages
  ma_fast: number
  ma_slow: number
  trend_spread: number     // ma_fast / ma_slow - 1
  // RSI
  rsi_14: number
  // Volume
  vol_shock: number        // today's volume / 20d avg volume
  amihud: number           // |ret| / dollar_volume (illiquidity)
  // Cross-sectional ranks (0-1, computed across universe on each date)
  rank_ret_20d: number
  rank_vol_20d: number
  rank_vol_shock: number
  // Regime
  regime_vol: 'low' | 'medium' | 'high' | 'extreme'
  regime_trend: 'up' | 'down' | 'flat'
  // z-scores (cross-sectional, on each date)
  z_ret_20d: number
  z_vol_20d: number
  z_trend_spread: number
}

// ── Alpha / Signals ───────────────────────────────────────────

export interface SignalRow {
  date: string
  symbol: string
  raw_score: number       // un-normalized
  z_score: number         // cross-sectionally standardized
  rank_score: number      // cross-sectional percentile rank (0-1, 0.5 centered)
  forecast_ret: number    // expected return (bps)
}

export type SignalSnapshot = Record<string, SignalRow>  // symbol → SignalRow

// ── Risk Model ────────────────────────────────────────────────

export interface CovarianceMatrix {
  symbols: string[]
  matrix: number[][]     // n×n
  method: 'sample' | 'ledoit_wolf' | 'factor'
  lookbackDays: number
}

export interface FactorExposure {
  date: string
  symbol: string
  market_beta: number
  momentum_beta: number
  vol_beta: number
  size_beta: number
  quality_beta: number
}

export interface PortfolioRiskMetrics {
  date: string
  grossExposure: number
  netExposure: number
  concentrationHHI: number
  portfolioVol: number      // annualised
  varPct: number            // 95% VaR as % of portfolio
  cvarPct: number           // 95% CVaR
  topHolding: number        // largest absolute weight
  avgCorrelation: number
}

// ── Portfolio Optimizer ───────────────────────────────────────

export interface OptimizerConfig {
  method: 'mean_variance' | 'equal_weight' | 'risk_parity' | 'min_variance'
  riskAversion: number          // lambda
  turnoverPenalty: number       // gamma
  maxWeight: number             // per-name cap (e.g. 0.10 = 10%)
  minWeight: number             // can be negative for long/short
  leverage: number              // target gross exposure (e.g. 1.0 = fully invested)
  sectorNeutral: boolean
  maxTurnover: number           // max daily turnover fraction
}

export interface AllocationRow {
  date: string
  weights: Record<string, number>   // symbol → weight
  grossExposure: number
  netExposure: number
  turnover: number                  // vs prior day
  cash: number
}

// ── Execution ─────────────────────────────────────────────────

export interface ExecutionConfig {
  orderType: 'market' | 'limit' | 'twap' | 'vwap'
  slippageModel: 'fixed' | 'volatility' | 'market_impact'
  slippageBps: number
  participationRate: number   // max fraction of ADV to trade
  minTradeSizeUsd: number
  roundLots: boolean
}

export interface Order {
  date: string
  symbol: string
  side: 'BUY' | 'SELL'
  targetShares: number
  estimatedPrice: number
  estimatedSlippageBps: number
  estimatedCostUsd: number
  urgency: 'low' | 'medium' | 'high'
}

export interface Fill {
  date: string
  symbol: string
  side: 'BUY' | 'SELL'
  filledShares: number
  avgPrice: number
  commission: number
  slippageBps: number
  totalCostUsd: number
}

// ── Risk Manager ──────────────────────────────────────────────

export interface RiskLimits {
  maxGrossExposure: number
  maxNetExposure: number
  maxPositionWeight: number
  maxSectorExposure: number
  maxDrawdownTrigger: number    // halt at X% drawdown from peak
  varConfidence: number
  varLimitPct: number
  maxDailyTurnover: number
}

export interface RiskCheckResult {
  passed: boolean
  breaches: string[]
  warnings: string[]
  approvedOrders: Order[]
  rejectedOrders: Order[]
}

// ── Backtester ────────────────────────────────────────────────

export interface BacktestConfig {
  startDate: string
  endDate: string
  initialCapital: number
  feeBps: number
  symbols: string[]
  rebalanceFreq: 'daily' | 'weekly' | 'monthly'
  benchmark?: string
}

export interface PortfolioState {
  date: string
  cash: number
  positions: Record<string, number>       // symbol → shares
  equity: number
  peakEquity: number
  currentDrawdown: number
  isHalted: boolean
}

export interface EquityPoint {
  date: string
  equity: number
  cash: number
  invested: number
  drawdown: number
  dailyReturn: number
  grossExposure: number
  turnover: number
}

// ── Metrics / Tear Sheet ──────────────────────────────────────

export interface TearSheet {
  // Return metrics
  totalReturnPct: number
  cagr: number
  annualizedReturnPct: number

  // Risk-adjusted
  sharpeRatio: number
  sortinoRatio: number
  calmarRatio: number
  informationRatio: number    // vs buy-hold benchmark

  // Drawdown
  maxDrawdownPct: number
  maxDrawdownDurationDays: number
  avgDrawdownPct: number
  recoveryFactor: number      // total return / max drawdown

  // Volatility
  annualizedVolPct: number
  downsideVolPct: number
  betaToMarket: number
  alphaAnnualizedPct: number

  // Trade metrics
  totalTrades: number
  winRate: number
  profitFactor: number
  avgWinPct: number
  avgLossPct: number
  avgHoldingDays: number
  avgTurnover: number

  // Exposure
  avgGrossExposure: number
  avgNetExposure: number

  // Cost analysis
  totalFeePct: number
  totalSlippagePct: number
  implementationShortfallPct: number

  // IC (signal quality)
  meanIC: number
  icStd: number
  icIR: number              // IC / std(IC)
  icHitRate: number         // fraction of periods with positive IC

  // Regime breakdown
  regimeBreakdown: RegimeMetrics[]

  // Subperiod consistency
  yearlyReturns: Record<string, number>
  quarterlyReturns: Record<string, number>
  monthlyReturns: Record<string, number>

  // Decile analysis
  decileReturns: number[]   // alpha-sorted decile avg returns
}

export interface RegimeMetrics {
  regime: string
  nDays: number
  avgReturn: number
  sharpe: number
  maxDrawdown: number
}

// ── Walk-Forward ──────────────────────────────────────────────

export interface WalkForwardWindow {
  trainStart: string
  trainEnd: string
  testStart: string
  testEnd: string
  trainSharpe: number
  testSharpe: number
  trainReturn: number
  testReturn: number
  testMaxDrawdown: number
  degradation: number       // testSharpe / trainSharpe - 1
}

export interface WalkForwardResult {
  nWindows: number
  avgTrainSharpe: number
  avgTestSharpe: number
  avgDegradation: number
  consistencyRatio: number  // fraction of windows with positive test return
  windows: WalkForwardWindow[]
}

// ── Quant Strategy Package ────────────────────────────────────
// This is the full strategy definition that users submit.
// Platform controls execution; users define logic via these hooks.

export interface QuantStrategyPackage {
  id: string
  name: string

  // User-defined module configs
  universeConfig: UniverseConfig
  optimizerConfig: OptimizerConfig
  executionConfig: ExecutionConfig
  riskLimits: RiskLimits

  // Builtin alpha selection
  alphaType: 'momentum' | 'mean_reversion' | 'composite' | 'ml' | 'volatility'
  alphaWeights?: {
    momentum?: number
    mean_reversion?: number
    volatility?: number
    volume?: number
  }
  forecastHorizon: number     // days
  signalScaleBps: number      // bps per unit of z-score

  // Rebalance
  rebalanceFreq: 'daily' | 'weekly' | 'monthly'
  lookbackDays: number
}
