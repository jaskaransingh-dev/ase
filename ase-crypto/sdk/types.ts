export type Asset = string
export type Decision = 'BUY' | 'SELL' | 'HOLD'

export type FeatureRow = {
  timestamp: string
  asset: Asset
  close: number
  volume?: number
  ret_1d?: number
  ret_5d?: number
  ret_20d?: number
  ret_60d?: number
  vol_20d?: number
  vol_60d?: number
  rsi_14?: number
  sma_20?: number
  sma_50?: number
  sma_200?: number
}

export type Position = {
  asset: Asset
  quantity: number
  marketValue: number
  avgEntryPrice: number
  unrealizedPnlPct: number
  weight: number
}

export type PortfolioState = {
  timestamp: string
  equity: number
  cash: number
  drawdownPct: number
  grossExposurePct: number
  netExposurePct: number
  positions: Position[]
  maxPositionPct: number
  longOnly: boolean
}

export type StrategyConfig = {
  name: string
  version: string
  universe: Asset[]
  rebalanceFreq: 'daily' | 'weekly' | 'monthly'
  longOnly: boolean
  maxPositionPct: number
  maxNewPositionsPerRun: number
  minCashPct: number
}

export type AssetDecision = {
  asset: Asset
  decision: Decision
  conviction: number
  targetPositionPct?: number
  thesis: string
  riskNotes?: string
}

export type StrategyOutput = {
  timestamp: string
  decisions: AssetDecision[]
  globalCommentary?: string
}

export type StrategyContext = {
  features: FeatureRow[]
  portfolio: PortfolioState
}

export interface StrategyModule {
  config: StrategyConfig
  evaluate(context: StrategyContext): StrategyOutput
}

export type LedgerEvent = {
  timestamp: string
  asset: string
  action: 'BUY' | 'SELL' | 'HOLD'
  requestedTargetPositionPct?: number
  executedTargetPositionPct?: number
  requestedQuantity?: number
  executedQuantity?: number
  fillPrice?: number
  feePaid?: number
  slippagePaid?: number
  status: 'EXECUTED' | 'PARTIAL' | 'SKIPPED' | 'REJECTED'
  reason: string
  thesis?: string
  riskNotes?: string
}

export type AssetRunResult = {
  asset: string
  decision: 'BUY' | 'SELL' | 'HOLD'
  conviction: number
  targetPositionPct?: number
  explanation: {
    summary: string
    drivers: string[]
    portfolioContext: string[]
    risks: string[]
  }
}

export type BacktestMetrics = {
  cagr: number
  sharpe: number
  sortino: number
  maxDrawdown: number
  volatility: number
  winRate: number
  turnover: number
  totalTrades: number
  benchmarkReturn: number
}

export type ValidationStatus = {
  label: string
  status: 'PASS' | 'WARN' | 'FAIL'
  message: string
}

export type RunResult = {
  runId: string
  strategyName: string
  metrics: BacktestMetrics
  validations: ValidationStatus[]
  assetResults: AssetRunResult[]
  ledger: LedgerEvent[]
  publishable: boolean
}