/**
 * Drag-drop block catalog for the Quant Lab agentic builder.
 * Each block is a typed primitive the AI (and user) can compose into a strategy.
 */

export type BlockKind = 'data' | 'indicator' | 'ml' | 'api' | 'risk' | 'execution' | 'signal'

export interface Block {
  id: string
  kind: BlockKind
  label: string
  description: string
  /** Hint the AI consumes when this block is dropped: "uses RSI on top10 crypto" */
  agentHint: string
  /** What field of AgentSpec this block influences */
  affects?: Array<'symbols' | 'alpha_type' | 'alpha_weights' | 'rebalance_freq' | 'forecast_horizon' | 'signal_scale_bps' | 'risk_aversion' | 'max_weight'>
}

export const BLOCKS: Block[] = [
  // ─── Data sources ────────────────────────────────────────
  { id: 'data.binance',    kind: 'data',   label: 'Binance OHLCV',    description: 'Spot OHLCV, 1m–1d',          agentHint: 'use Binance OHLCV bars',                 affects: ['symbols'] },
  { id: 'data.coingecko',  kind: 'data',   label: 'CoinGecko',        description: 'Market cap, volume, ranks',  agentHint: 'use CoinGecko market data',              affects: ['symbols'] },
  { id: 'data.yahoo',      kind: 'data',   label: 'Yahoo Finance',    description: 'Daily bars (fallback)',      agentHint: 'fall back to Yahoo Finance daily bars',  affects: ['symbols'] },
  { id: 'data.onchain',    kind: 'data',   label: 'On-chain (NUPL/SOPR)', description: 'Glassnode-style on-chain', agentHint: 'incorporate on-chain NUPL/SOPR signals', affects: ['alpha_type'] },
  { id: 'data.funding',    kind: 'data',   label: 'Funding Rates',    description: 'Perp funding (bias proxy)',  agentHint: 'consider perp funding rates as bias',    affects: ['alpha_type'] },

  // ─── Indicators ───────────────────────────────────────────
  { id: 'ind.rsi',         kind: 'indicator', label: 'RSI(14)',       description: 'Relative Strength Index',    agentHint: 'use RSI(14) for mean-reversion entries', affects: ['alpha_type'] },
  { id: 'ind.macd',        kind: 'indicator', label: 'MACD',          description: 'Moving Avg Convergence',     agentHint: 'use MACD for trend confirmation',        affects: ['alpha_type'] },
  { id: 'ind.bb',          kind: 'indicator', label: 'Bollinger',     description: '20σ Bollinger Bands',        agentHint: 'use Bollinger Bands (20σ) for vol breakouts', affects: ['alpha_type'] },
  { id: 'ind.atr',         kind: 'indicator', label: 'ATR',           description: 'Avg True Range',             agentHint: 'use ATR for position sizing',            affects: ['risk_aversion'] },
  { id: 'ind.ema_cross',   kind: 'indicator', label: 'EMA Cross',     description: 'Fast/Slow EMA crossover',    agentHint: 'EMA(12)/EMA(26) crossover for trend',    affects: ['alpha_type'] },
  { id: 'ind.zscore',      kind: 'indicator', label: 'Z-Score',       description: 'Rolling z-score (mean-rev)', agentHint: 'rolling z-score for mean-reversion',     affects: ['alpha_type'] },

  // ─── ML / Forecast ────────────────────────────────────────
  { id: 'ml.gbm',          kind: 'ml',     label: 'Gradient Boosted', description: 'Tabular tree ensemble',      agentHint: 'use a gradient-boosted forecaster',      affects: ['alpha_type', 'forecast_horizon'] },
  { id: 'ml.lstm',         kind: 'ml',     label: 'LSTM Forecaster',  description: 'Sequence model on prices',   agentHint: 'use an LSTM sequence forecaster',        affects: ['alpha_type', 'forecast_horizon'] },
  { id: 'ml.regime',       kind: 'ml',     label: 'HMM Regime',       description: 'Hidden Markov regime gate',  agentHint: 'gate signals through an HMM regime detector', affects: ['alpha_type'] },

  // ─── External APIs ────────────────────────────────────────
  { id: 'api.fear_greed',  kind: 'api',    label: 'Fear & Greed',     description: 'Crypto sentiment index',     agentHint: 'fade extremes on the Crypto Fear & Greed Index; use contrarian mean-reversion entries when index < 25 or > 75', affects: ['alpha_type'] },
  { id: 'api.alternative', kind: 'api',    label: 'Alternative.me',   description: 'Sentiment + macro',          agentHint: 'pull sentiment from alternative.me',     affects: ['alpha_type'] },
  { id: 'api.kraken',      kind: 'api',    label: 'Kraken Exec',      description: 'Live execution venue',       agentHint: 'route execution through Kraken',         affects: [] },
  { id: 'api.news',        kind: 'api',    label: 'Crypto News',      description: 'Live crypto news headlines', agentHint: 'incorporate real-time crypto news sentiment: positive headlines boost momentum signals, negative headlines trigger mean-reversion or de-risk', affects: ['alpha_type', 'signal_scale_bps'] },
  { id: 'api.satellite',   kind: 'api',    label: 'Satellite Data',   description: 'Alt-data: exchange flows',   agentHint: 'integrate satellite alternative data (exchange reserve flows, miner outflows); use as a macro signal layer to gate position sizing', affects: ['alpha_type', 'risk_aversion'] },
  { id: 'api.syne',        kind: 'api',    label: 'SYNE Terminal',    description: 'ASE live market intelligence', agentHint: 'pull live market data from ASE SYNE terminal: geo-macro events, news catalysts, on-chain alerts; blend into composite signal with 20% weight', affects: ['alpha_type', 'alpha_weights'] },

  // ─── Risk / Execution ────────────────────────────────────
  { id: 'risk.killswitch', kind: 'risk',   label: 'Kill Switch',      description: 'Halt at drawdown threshold', agentHint: 'add a max-drawdown kill switch',         affects: ['risk_aversion'] },
  { id: 'risk.parity',     kind: 'risk',   label: 'Risk Parity',      description: 'Equal-risk-contribution',    agentHint: 'use risk-parity weighting',              affects: ['risk_aversion', 'max_weight'] },
  { id: 'exec.twap',       kind: 'execution', label: 'TWAP',          description: 'Time-weighted execution',    agentHint: 'use TWAP execution',                     affects: [] },
  { id: 'exec.vwap',       kind: 'execution', label: 'VWAP',          description: 'Volume-weighted execution',  agentHint: 'use VWAP execution',                     affects: [] },

  // ─── Signal combinators ──────────────────────────────────
  { id: 'sig.composite',   kind: 'signal', label: 'Composite Blend',  description: 'Weighted alpha mixing',      agentHint: 'use a composite alpha blend (momentum + mean-reversion + volume)', affects: ['alpha_type', 'alpha_weights'] },
  { id: 'sig.consensus',   kind: 'signal', label: 'AI Consensus',     description: 'N-model consensus vote',     agentHint: 'gate signals through multi-model consensus voting', affects: ['alpha_type'] },
]

export const BLOCKS_BY_KIND: Record<BlockKind, Block[]> = BLOCKS.reduce((acc, b) => {
  (acc[b.kind] ||= []).push(b)
  return acc
}, {} as Record<BlockKind, Block[]>)

export function blocksToHints(ids: string[]): string {
  if (!ids.length) return ''
  const found = ids.map(id => BLOCKS.find(b => b.id === id)).filter(Boolean) as Block[]
  if (!found.length) return ''
  return `Selected building blocks (the user dragged these — incorporate them into the spec):\n${found.map(b => `- [${b.kind}] ${b.label}: ${b.agentHint}`).join('\n')}`
}
