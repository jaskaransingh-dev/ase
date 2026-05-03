/**
 * Block registry — extends BLOCKS with runtime status + documentation.
 *
 * The Build canvas pulls from here for hover-describe. Anything flagged
 * `live` has a working loader in lib/market-data.ts (or equivalent);
 * `stub` is acknowledged-not-implemented; `static` is config-only (e.g.
 * risk controls, signal combinators that don't fetch external data).
 *
 * Keep this file in sync with /api/ai/chat LOADER_CONTRACT.
 */

import { BLOCKS, type Block } from './blocks'

export type BlockStatus = 'live' | 'stub' | 'static'

export interface BlockMeta {
  status: BlockStatus
  doc: string         // 1–2 sentence description shown on hover
  usage?: string      // example call signature
  loader?: string     // how to invoke the loader from strategy code
  notes?: string      // gotchas, caveats
}

const META: Record<string, BlockMeta> = {
  // ── Data sources ──────────────────────────────────────────────────────────
  'data.binance': {
    status: 'live',
    doc: 'Spot OHLCV bars across all USDT pairs. The default data source; works without an API key.',
    loader: 'await ctx.data.binance(symbol, "1h", 200)',
    notes: 'Rate-limited at 1200 req/min weight; cache aggressively.',
  },
  'data.coingecko': {
    status: 'stub',
    doc: 'Market cap, dominance, volume rank — useful for regime gating. Loader not yet wired in production.',
    loader: 'await ctx.data.coingecko("bitcoin", 90) // stub',
    notes: 'Falls back to ctx.data.binance until wired. Free tier is 30 req/min.',
  },
  'data.yahoo': {
    status: 'live',
    doc: 'Daily bars fallback for non-crypto (SPY, DXY, TLT). Auto-falls back to Binance for BTC/ETH.',
    loader: 'await ctx.data.yahoo("SPY", "2y")',
    notes: 'Yahoo throttles aggressively on Vercel; prefer FRED/Stooq for macro.',
  },
  'data.onchain': {
    status: 'stub',
    doc: 'Glassnode-style on-chain metrics: NUPL, SOPR, MVRV, dormancy. Loader not yet wired.',
    loader: 'await ctx.data.onchain("nupl") // stub',
    notes: 'Until wired, derive a proxy from price action + volume.',
  },
  'data.funding': {
    status: 'stub',
    doc: 'Perpetual funding rates as a positioning bias proxy. Negative funding ⇒ shorts pay longs.',
    loader: 'await ctx.data.funding("BTC-USD") // stub',
    notes: 'Use Binance OHLCV and a momentum proxy until live.',
  },

  // ── Indicators (all static — pure functions on bars) ──────────────────────
  'ind.rsi':       { status: 'static', doc: 'Relative Strength Index. <30 = oversold (long bias), >70 = overbought (trim).', usage: 'rsi(close, 14)' },
  'ind.macd':      { status: 'static', doc: 'MACD line crossing the signal line confirms trend direction.', usage: 'macd(close, 12, 26, 9)' },
  'ind.bb':        { status: 'static', doc: 'Bollinger Bands. Bandwidth widens during volatility regimes; squeezes precede breakouts.', usage: 'bollinger(close, 20, 2)' },
  'ind.atr':       { status: 'static', doc: 'Average True Range — best signal for volatility-aware position sizing.', usage: 'atr(high, low, close, 14)' },
  'ind.ema_cross': { status: 'static', doc: 'Fast/slow EMA cross. Classic trend-following entry; pair with ADX > 25 to filter chop.', usage: 'emaCross(close, 12, 26)' },
  'ind.zscore':    { status: 'static', doc: 'Rolling z-score of returns. |z| > 2 = stretched, mean-reversion candidate.', usage: 'zscore(returns, 60)' },

  // ── ML — all stub right now (no in-repo trainer) ──────────────────────────
  'ml.gbm':         { status: 'stub', doc: 'Gradient-boosted tabular forecaster. Trainer not yet in the runtime; emit a static heuristic that approximates the same edge.' },
  'ml.lstm':        { status: 'stub', doc: 'LSTM sequence model on price. Trainer not in runtime; use as a placeholder for sequence-aware logic.' },
  'ml.regime':      { status: 'stub', doc: 'Hidden Markov regime detector. Approximate via volatility quintile + 200d trend until live.' },

  // ── External APIs ─────────────────────────────────────────────────────────
  'api.fear_greed': {
    status: 'live',
    doc: 'Alternative.me crypto Fear & Greed index, 0–100. Fade extremes (<25 = buy fear, >75 = trim greed).',
    loader: 'await ctx.data.fearGreed()',
  },
  'api.alternative':{ status: 'live', doc: 'Alternative.me sentiment + macro composite. Same endpoint family as Fear & Greed.' },
  'api.kraken':     { status: 'live', doc: 'Live execution venue. Trades route through ctx.exec.kraken at maker/taker 0.10%.', loader: 'await ctx.exec.kraken({ symbol, side, qty })' },
  'api.news':       { status: 'stub', doc: 'CryptoPanic/CryptoNews aggregator. Until wired, use SYNE block for similar coverage.' },
  'api.satellite':  { status: 'stub', doc: 'Alt-data feeds (exchange reserve flows, miner outflows). Stub.' },
  'api.syne':       { status: 'live', doc: 'ASE SYNE terminal — geo-macro, on-chain alerts, news catalysts. Blend at ~20% weight in composite alphas.' },

  // ── Risk / Execution (static — they bind config knobs) ────────────────────
  'risk.killswitch':{ status: 'static', doc: 'Halt all positions when drawdown exceeds threshold. Sets config.killSwitch.' },
  'risk.parity':    { status: 'static', doc: 'Equal-risk-contribution weighting across symbols. Tune risk_aversion and max_weight.' },
  'exec.twap':      { status: 'static', doc: 'Time-weighted execution — splits orders evenly across N intervals to minimize slippage.' },
  'exec.vwap':      { status: 'static', doc: 'Volume-weighted execution — concentrates fills around volume peaks.' },

  // ── Signal combinators ────────────────────────────────────────────────────
  'sig.composite':  { status: 'static', doc: 'Weighted blend of multiple alpha types. The default for diversified signal combinations.' },
  'sig.consensus':  { status: 'static', doc: 'Trade only when N-of-M models agree. Cuts whipsaws but reduces frequency.' },
  'sig.majority':   { status: 'static', doc: '2-of-3 or 3-of-5 vote across models. Stricter than composite, looser than unanimous.' },
  'sig.unanimous':  { status: 'static', doc: 'All models must agree. Maximum precision, minimum frequency — pair with a small floor conviction so always-trade is preserved.' },
  'sig.weighted':   { status: 'static', doc: 'Fixed-weight ensemble (e.g. 40/30/30). Stable but ignores recent regime shifts.' },
  'sig.stacking':   { status: 'static', doc: 'Meta-learner over base predictions. Hard to backtest cleanly without leakage controls.' },
}

const FALLBACK: BlockMeta = {
  status: 'static',
  doc: 'No extended documentation yet. See agentHint for usage cues.',
}

export function blockMeta(id: string): BlockMeta {
  return META[id] ?? FALLBACK
}

export function blockStatus(id: string): BlockStatus {
  return blockMeta(id).status
}

export function statusColor(s: BlockStatus): string {
  return s === 'live' ? '#16c784' : s === 'stub' ? '#f59e0b' : '#94a3b8'
}

export function statusLabel(s: BlockStatus): string {
  return s === 'live' ? 'LIVE' : s === 'stub' ? 'STUB' : 'STATIC'
}

/** Coverage report — used by tests + the docs page. */
export function coverage(): { total: number; live: number; stub: number; static: number; missing: string[] } {
  let live = 0, stub = 0, st = 0
  const missing: string[] = []
  for (const b of BLOCKS) {
    const m = META[b.id]
    if (!m) { missing.push(b.id); continue }
    if (m.status === 'live') live++
    else if (m.status === 'stub') stub++
    else st++
  }
  return { total: BLOCKS.length, live, stub, static: st, missing }
}

export type { Block }
