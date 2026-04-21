// ============================================================
// Quant Framework — Strategy Composition Root
// Assembles all layers into the QuantStrategy pipeline.
// This is the entry point for running a full quant strategy.
// ============================================================

import type { QuantStrategyPackage, OptimizerConfig, ExecutionConfig, RiskLimits, UniverseConfig } from './types'

// ── Built-in platform universes ───────────────────────────────

export const PLATFORM_UNIVERSES: Record<string, string[]> = {
  crypto_top10: ['BTC-USD','ETH-USD','SOL-USD','BNB-USD','XRP-USD','ADA-USD','AVAX-USD','DOT-USD','LINK-USD','UNI-USD'],
  crypto_defi:  ['UNI-USD','LINK-USD','AVAX-USD','DOT-USD','ATOM-USD'],
  crypto_l1:    ['ETH-USD','SOL-USD','ADA-USD','AVAX-USD','DOT-USD'],
  crypto_core:  ['BTC-USD','ETH-USD','SOL-USD'],
}

// ── Default configs per alpha type ───────────────────────────

const DEFAULT_UNIVERSE: UniverseConfig = {
  symbols:       ['BTC-USD','ETH-USD','SOL-USD','BNB-USD','ADA-USD'],
  minAdvUsd:     1_000_000,
  minPriceUsd:   0.001,
  maxAssets:     10,
  rebalanceFreq: 'daily',
}

const DEFAULT_OPTIMIZER: OptimizerConfig = {
  method:          'mean_variance',
  riskAversion:    8.0,
  turnoverPenalty: 0.5,
  maxWeight:       0.30,
  minWeight:       0.0,    // long-only
  leverage:        1.0,
  sectorNeutral:   false,
  maxTurnover:     0.30,
}

const DEFAULT_EXECUTION: ExecutionConfig = {
  orderType:         'market',
  slippageModel:     'market_impact',
  slippageBps:       5,
  participationRate: 0.10,
  minTradeSizeUsd:   50,
  roundLots:         false,
}

const DEFAULT_RISK_LIMITS: RiskLimits = {
  maxGrossExposure:   1.0,
  maxNetExposure:     0.20,
  maxPositionWeight:  0.40,
  maxSectorExposure:  0.50,
  maxDrawdownTrigger:  0.35,
  varConfidence:      0.95,
  varLimitPct:        25.0,
  maxDailyTurnover:   0.40,
}

// ── Pre-built strategy templates ──────────────────────────────

export const STRATEGY_TEMPLATES: Record<string, Omit<QuantStrategyPackage, 'id' | 'name'>> = {
  'momentum_conservative': {
    universeConfig: { ...DEFAULT_UNIVERSE, symbols: ['BTC-USD','ETH-USD','SOL-USD','BNB-USD','ADA-USD'] },
    optimizerConfig: { ...DEFAULT_OPTIMIZER, riskAversion: 12, maxWeight: 0.25, maxTurnover: 0.20 },
    executionConfig: { ...DEFAULT_EXECUTION, slippageBps: 8 },
    riskLimits:      { ...DEFAULT_RISK_LIMITS, maxDrawdownTrigger: 0.15, maxGrossExposure: 0.90 },
    alphaType:       'momentum',
    forecastHorizon: 20,
    signalScaleBps:  15,
    rebalanceFreq:   'weekly',
    lookbackDays:    60,
  },
  'mean_reversion_active': {
    universeConfig:  { ...DEFAULT_UNIVERSE, symbols: PLATFORM_UNIVERSES.crypto_top10 },
    optimizerConfig: { ...DEFAULT_OPTIMIZER, riskAversion: 5, maxWeight: 0.20, turnoverPenalty: 0.2, maxTurnover: 0.40 },
    executionConfig: { ...DEFAULT_EXECUTION, slippageBps: 6 },
    riskLimits:      { ...DEFAULT_RISK_LIMITS, maxDrawdownTrigger: 0.20 },
    alphaType:       'mean_reversion',
    forecastHorizon: 5,
    signalScaleBps:  25,
    rebalanceFreq:   'daily',
    lookbackDays:    30,
  },
  'composite_balanced': {
    universeConfig:  { ...DEFAULT_UNIVERSE, symbols: PLATFORM_UNIVERSES.crypto_top10 },
    optimizerConfig: { ...DEFAULT_OPTIMIZER, riskAversion: 8, maxWeight: 0.20, maxTurnover: 0.30 },
    executionConfig: { ...DEFAULT_EXECUTION, slippageModel: 'volatility', slippageBps: 7 },
    riskLimits:      DEFAULT_RISK_LIMITS,
    alphaType:       'composite',
    alphaWeights:    { momentum: 0.40, mean_reversion: 0.35, volatility: 0.15, volume: 0.10 },
    forecastHorizon: 10,
    signalScaleBps:  20,
    rebalanceFreq:   'daily',
    lookbackDays:    60,
  },
  'ml_aggressive': {
    universeConfig:  { ...DEFAULT_UNIVERSE, symbols: PLATFORM_UNIVERSES.crypto_top10, maxAssets: 10 },
    optimizerConfig: { ...DEFAULT_OPTIMIZER, riskAversion: 4, maxWeight: 0.25, turnoverPenalty: 0.1 },
    executionConfig: { ...DEFAULT_EXECUTION, participationRate: 0.15 },
    riskLimits:      { ...DEFAULT_RISK_LIMITS, maxDrawdownTrigger: 0.30, maxGrossExposure: 1.20 },
    alphaType:       'ml',
    forecastHorizon: 10,
    signalScaleBps:  30,
    rebalanceFreq:   'daily',
    lookbackDays:    90,
  },
  'risk_parity': {
    universeConfig:  { ...DEFAULT_UNIVERSE, symbols: ['BTC-USD','ETH-USD','SOL-USD','BNB-USD','ADA-USD'] },
    optimizerConfig: { ...DEFAULT_OPTIMIZER, method: 'risk_parity', riskAversion: 1, maxWeight: 0.40, maxTurnover: 0.15 },
    executionConfig: { ...DEFAULT_EXECUTION, slippageBps: 5 },
    riskLimits:      { ...DEFAULT_RISK_LIMITS, maxDrawdownTrigger: 0.20 },
    alphaType:       'volatility',
    forecastHorizon: 20,
    signalScaleBps:  10,
    rebalanceFreq:   'weekly',
    lookbackDays:    60,
  },
}

// ── Strategy builder ──────────────────────────────────────────

export function buildStrategyPackage(
  id: string,
  name: string,
  template: keyof typeof STRATEGY_TEMPLATES,
  overrides: Partial<Omit<QuantStrategyPackage, 'id' | 'name'>> = {},
): QuantStrategyPackage {
  const base = STRATEGY_TEMPLATES[template]
  return {
    ...base,
    ...overrides,
    id,
    name,
    universeConfig: { ...base.universeConfig, ...overrides.universeConfig },
    optimizerConfig: { ...base.optimizerConfig, ...overrides.optimizerConfig },
    executionConfig: { ...base.executionConfig, ...overrides.executionConfig },
    riskLimits:     { ...base.riskLimits,      ...overrides.riskLimits },
  }
}

// ── Human-readable strategy summary ──────────────────────────

export function describeStrategy(pkg: QuantStrategyPackage): string {
  const n = pkg.universeConfig.symbols.length
  return [
    `Alpha: ${pkg.alphaType}`,
    `Universe: ${n} assets (${pkg.universeConfig.symbols.slice(0, 3).join(', ')}${n > 3 ? '…' : ''})`,
    `Optimizer: ${pkg.optimizerConfig.method} | λ=${pkg.optimizerConfig.riskAversion} | max ${(pkg.optimizerConfig.maxWeight * 100).toFixed(0)}%/name`,
    `Rebalance: ${pkg.rebalanceFreq} | horizon ${pkg.forecastHorizon}d | signal scale ${pkg.signalScaleBps}bps`,
    `Risk: max DD ${(pkg.riskLimits.maxDrawdownTrigger * 100).toFixed(0)}% | gross ≤${(pkg.riskLimits.maxGrossExposure * 100).toFixed(0)}%`,
    `Execution: ${pkg.executionConfig.orderType} | slippage ${pkg.executionConfig.slippageModel} ${pkg.executionConfig.slippageBps}bps`,
  ].join('\n')
}
