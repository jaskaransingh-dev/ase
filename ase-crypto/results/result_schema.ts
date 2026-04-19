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