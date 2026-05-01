import { STRATEGIES } from './backtest'

export const C = {
  bg: '#06111F', bg2: '#0B1728', bg3: '#101A2D', bg4: '#162438',
  border: '#1E2A3D', border2: '#2A3A50',
  blue: '#4F8CFF', blue2: '#6BA3FF',
  mint: '#16C784', red: '#FF5468', orange: '#F5B942', purple: '#8B5CF6',
  text: '#B7C4D5', muted: '#7F8CA3', faint: '#55657A', white: '#F7FAFF',
}

export const TEMPLATES = [
  { id: 'momentum_conservative', name: 'Momentum Conservative', dot: C.blue },
  { id: 'mean_reversion_active', name: 'Mean Reversion Active', dot: C.mint },
  { id: 'composite_balanced',    name: 'Composite Balanced',    dot: C.purple },
  { id: 'ml_aggressive',         name: 'ML Aggressive',         dot: C.orange },
  { id: 'risk_parity',           name: 'Risk Parity',           dot: C.red },
]

export const UNIVERSES: Record<string, { label: string; symbols: string[] }> = {
  crypto_top5:  { label: 'Crypto Top 5',  symbols: ['BTC-USD','ETH-USD','SOL-USD','BNB-USD','ADA-USD'] },
  crypto_top10: { label: 'Crypto Top 10', symbols: ['BTC-USD','ETH-USD','SOL-USD','BNB-USD','XRP-USD','ADA-USD','AVAX-USD','DOT-USD','LINK-USD','UNI-USD'] },
  crypto_defi:  { label: 'DeFi',          symbols: ['UNI-USD','LINK-USD','AVAX-USD','DOT-USD','ATOM-USD','MKR-USD','AAVE-USD'] },
  crypto_l1:    { label: 'Layer 1',        symbols: ['ETH-USD','SOL-USD','ADA-USD','AVAX-USD','DOT-USD','NEAR-USD'] },
  crypto_l2:    { label: 'Layer 2',        symbols: ['MATIC-USD','ARB-USD','OP-USD','IMX-USD','METIS-USD'] },
  btc_eth:      { label: 'BTC + ETH',     symbols: ['BTC-USD','ETH-USD'] },
}

export const REBALANCE_OPTIONS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
}

export const CONFIG_FIELD_META: Record<string, {
  label: string
  min?: number
  max?: number
  step?: number
  options?: Record<string, string>
  fmt?: (v: unknown) => string
}> = {
  template: {
    label: 'TEMPLATE',
    options: Object.fromEntries(TEMPLATES.map(t => [t.id, t.name])),
  },
  symbols: {
    label: 'SYMBOLS',
    fmt: (v: unknown) => Array.isArray(v) ? `${(v as string[]).length} assets` : '—',
  },
  rebalanceFreq: {
    label: 'REBALANCE',
    options: REBALANCE_OPTIONS,
  },
  riskAversion: {
    label: 'RISK AVERSION (λ)',
    min: 1,
    max: 20,
    fmt: (v: unknown) => String(v),
  },
  maxWeight: {
    label: 'MAX WEIGHT / ASSET',
    min: 5,
    max: 60,
    fmt: (v: unknown) => `${Number(v) * 100}%`,
  },
  walkForward: {
    label: 'WALK-FORWARD',
  },
  initialCapital: {
    label: 'INITIAL CAPITAL',
    min: 10000,
    max: 100000000,
    step: 10000,
  },
  feeBps: {
    label: 'FEE (BPS)',
    min: 0,
    max: 100,
  },
  killSwitch: {
    label: 'KILL SWITCH',
    min: 0,
    max: 1,
    fmt: (v: unknown) => `${Number(v) * 100}%`,
  },
  benchmark: {
    label: 'BENCHMARK',
    options: {
      'BTC-USD': 'Bitcoin',
      'ETH-USD': 'Ethereum',
      'SOL-USD': 'Solana',
    },
  },
}

export const PERIODS = [
  { value: '14d', label: '2 Weeks' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '3 Months' },
  { value: '180d', label: '6 Months' },
  { value: '270d', label: '9 Months' },
  { value: '1y', label: '1 Year' },
  { value: '2y', label: '2 Years' },
  { value: '5y', label: '5 Years' },
]

export const BENCHMARKS: Record<string, { label: string; color: string }> = {
  'BTC-USD': { label: 'Bitcoin (BTC)', color: '#f7931a' },
  'ETH-USD': { label: 'Ethereum (ETH)', color: '#627eea' },
  'SPY':     { label: 'S&P 500 (SPY)', color: '#34d399' },
  'TBILL':   { label: 'Risk-free T-Bill (3M)', color: '#94a3b8' },
}

// Only expose the standardized Active Swing engine. Other internal strategies
// remain in lib/backtest.ts but are no longer user-selectable.
export const BACKTEST_STRATEGIES = [
  {
    id: 'active_swing',
    label: STRATEGIES.active_swing.name,
    description: STRATEGIES.active_swing.description,
    bestFor: STRATEGIES.active_swing.bestFor,
    mainRisk: STRATEGIES.active_swing.mainRisk,
    paramSchema: STRATEGIES.active_swing.paramSchema,
  },
]

export const DATA_APIS = [
  { id: 'binance',    name: 'Binance',       cat: 'crypto',  auth: 'none',     limit: '1200/hr',   desc: "World's largest exchange — OHLCV, orderbook, funding" },
  { id: 'coingecko',  name: 'CoinGecko',     cat: 'crypto',  auth: 'none',     limit: '50/min',    desc: 'Market data, DeFi, NFTs — 13k+ coins' },
  { id: 'coincap',    name: 'CoinCap',       cat: 'crypto',  auth: 'none',     limit: 'unlimited', desc: 'Real-time prices, history, markets for 3000+ assets' },
  { id: 'kraken',     name: 'Kraken',        cat: 'crypto',  auth: 'none',     limit: 'unlimited', desc: 'OHLCV, orderbook, trades — institutional-grade data' },
  { id: 'coinbase',   name: 'Coinbase Adv.', cat: 'crypto',  auth: 'optional', limit: '10/s',      desc: 'Level 2 orderbook, candles, portfolio data' },
  { id: 'bybit',      name: 'Bybit',         cat: 'crypto',  auth: 'none',     limit: '120/min',   desc: 'Perps, spot OHLCV, open interest, funding rates' },
  { id: 'okx',        name: 'OKX',           cat: 'crypto',  auth: 'none',     limit: '20/2s',     desc: 'Spot + derivatives OHLCV, funding, liquidations' },
  { id: 'huobi',      name: 'HTX / Huobi',   cat: 'crypto',  auth: 'none',     limit: '100/s',     desc: 'Deep historical data, klines, market depth' },
  { id: 'bitfinex',   name: 'Bitfinex',      cat: 'crypto',  auth: 'none',     limit: '90/min',    desc: 'OHLCV, margin, lending rates, order flow' },
  { id: 'dydx',       name: 'dYdX',          cat: 'defi',    auth: 'none',     limit: 'unlimited', desc: 'Perpetual futures — funding, OI, liquidations on-chain' },
  { id: 'defillama',  name: 'DeFiLlama',     cat: 'defi',    auth: 'none',     limit: 'unlimited', desc: 'TVL, fees, volume across 3000+ protocols' },
  { id: 'uniswap',    name: 'Uniswap',       cat: 'defi',    auth: 'none',     limit: 'unlimited', desc: 'Pool liquidity, volume, price impact via The Graph' },
  { id: 'aave',       name: 'Aave',          cat: 'defi',    auth: 'none',     limit: 'unlimited', desc: 'Lending/borrowing rates, utilization, reserves' },
  { id: 'curve',      name: 'Curve',         cat: 'defi',    auth: 'none',     limit: 'unlimited', desc: 'Stablecoin pool balances, volume, APY' },
  { id: 'thegraph',   name: 'The Graph',     cat: 'defi',    auth: 'optional', limit: '1000/day',  desc: 'Query any indexed contract via GraphQL — free tier' },
  { id: 'glassnode',  name: 'Glassnode',     cat: 'onchain', auth: 'optional', limit: '100/day',   desc: 'SOPR, NUPL, MVRV, active addresses, miner flows' },
  { id: 'coinmetrics', name: 'CoinMetrics',  cat: 'onchain', auth: 'optional', limit: '1000/day',  desc: 'Community API — realized cap, NVT, hash rate' },
  { id: 'santiment',  name: 'Santiment',     cat: 'onchain', auth: 'optional', limit: '200/day',   desc: 'Social volume, dev activity, whale transactions' },
  { id: 'lunarcrush', name: 'LunarCrush',   cat: 'social',  auth: 'optional', limit: '10/min',    desc: 'Social engagement, influencer metrics, altrank' },
  { id: 'fng',        name: 'Fear & Greed',  cat: 'sentiment', auth: 'none',   limit: 'unlimited', desc: 'Crypto F&G index — 365-day history, daily updates' },
  { id: 'messari',    name: 'Messari',       cat: 'research', auth: 'optional', limit: '20/min',   desc: 'Fundamentals, asset profiles, market data' },
  { id: 'alternative', name: 'Alternative.me', cat: 'sentiment', auth: 'none', limit: 'unlimited', desc: 'F&G index, trending coins, exchange volumes' },
  { id: 'fred',       name: 'FRED',          cat: 'macro',   auth: 'optional', limit: '120/hr',    desc: 'GDP, CPI, rates, DXY — Federal Reserve data' },
  { id: 'worldbank',  name: 'World Bank',    cat: 'macro',   auth: 'none',     limit: 'unlimited', desc: 'Global economic indicators, country data' },
  { id: 'tardis',     name: 'Tardis',        cat: 'deriv',   auth: 'optional', limit: 'delay-free', desc: 'Options, perps — historical tick data with delay' },
  { id: 'coinglass',  name: 'CoinGlass',     cat: 'deriv',   auth: 'none',     limit: '30/min',    desc: 'Open interest, liquidations, long/short ratio' },
  { id: 'laevitas',   name: 'Laevitas',      cat: 'deriv',   auth: 'optional', limit: '60/min',    desc: 'Options flow, implied vol, put/call ratio' },
  { id: 'etherscan',  name: 'Etherscan',     cat: 'network', auth: 'optional', limit: '5/s',       desc: 'Gas prices, contract calls, wallet balances' },
  { id: 'mempool',    name: 'Mempool.space', cat: 'network', auth: 'none',     limit: 'unlimited', desc: 'Bitcoin mempool, fee rates, block data' },
]

export const ML_TOOLS = [
  { id: 'sklearn', name: 'scikit-learn', desc: 'RandomForest, XGBoost signals', icon: '🤖' },
  { id: 'lightgbm', name: 'LightGBM', desc: 'Fast gradient boosting', icon: '⚡' },
  { id: 'pytorch', name: 'PyTorch', desc: 'LSTM, Transformer price models', icon: '🔥' },
  { id: 'statsmodels', name: 'statsmodels', desc: 'GARCH, VAR, cointegration', icon: '📊' },
  { id: 'hurst', name: 'Hurst Exponent', desc: 'Mean-reversion detection', icon: '📈' },
  { id: 'pyportfolioopt', name: 'PyPortfolioOpt', desc: 'Black-Litterman, HRP', icon: '⚖️' },
]

export const AGENT_ICONS = ['◉', '◎', '⟐', '◈', '⬡', '⬢', '◆', '◇', '◉', '◎']

export const GRADE_CLR: Record<string, string> = {
  'A+': C.mint, A: C.mint, B: C.blue, C: C.orange, D: '#F59E0B', F: C.red,
}

export const DEFAULT_STRATEGY_TS = `// ─── ASE Multi-Factor Crypto Strategy ───────────────────────────────
// Template : composite_balanced (grade C, score 46)
// Alpha    : momentum × trend × mean-reversion × volatility × volume
// Risk     : vol-targeting | mean-variance optimizer | ATR stop
//
// Backtest Features:
//   Walk-Forward  - Rolling train/test to prevent overfitting
//   Monte Carlo    - 200 random-window trials for robustness
//   Benchmark      - vs Buy & Hold (BTC, ETH, SOL)
//   Fill Model     - slippage, participation rate, commission
//   Risk Metrics   - Sharpe, Sortino, Calmar, VaR 95/99, CVaR
//   Trade Ledger   - every fill with P&L attribution
//
// Target   : Sharpe > 0.5 | Max DD < 25% | positive years > 50%
// Engine   : POST /api/quant/run  |  Cmd+Enter to backtest
// ─────────────────────────────────────────────────────────────────────

import type { FeatureRow } from '@ase/quant'

export const config = {
  name:          'Composite Balanced',
  universe:      ['BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'XRP-USD'],
  rebalanceFreq: 'weekly' as const,
  riskAversion:  4,
  maxWeight:     0.30,
  killSwitch:    0.25,
}

// ── Signal weights ────────────────────────────────────────────────────
const W = {
  momentum:     0.45,   // cross-sectional momentum
  meanRev:     0.30,   // mean-reversion (RSI/Bollinger)
  volatility:  0.15,   // vol breakouts
  volume:     0.10,   // volume confirmation
}

// ── RSI z-score: convert RSI to a mean-reversion signal ───────────────
// RSI < 30 → strong long signal (+1), RSI > 70 → strong short (–1)
function rsiSignal(rsi: number): number {
  const normalized = (50 - rsi) / 25          // [-1, +1] mapped
  return Math.max(-1, Math.min(1, normalized))
}

// ── EMA trend filter ──────────────────────────────────────────────────
// ema_fast > ema_slow → bull regime (+1), else bear (–1)
function emaFilter(row: FeatureRow): number {
  const fast = row.ema_8  ?? 0
  const slow = row.ema_21 ?? 0
  if (fast === 0 || slow === 0) return 0
  const spread = (fast - slow) / slow
  if (spread >  0.015) return  1.0
  if (spread < -0.015) return -1.0
  return spread / 0.015                       // linear in transition band
}

// ── On-chain composite ────────────────────────────────────────────────
// Blend NUPL market sentiment + Fear & Greed
function onchainSignal(row: FeatureRow): number {
  const nupl = row.nupl        ?? 0.3         // 0=bottom, 1=euphoria
  const fg   = (row.fear_greed ?? 50) / 100   // 0=extreme fear, 1=greed

  const nuplSig = nupl < 0.2  ?  0.8          // capitulation → buy
               :  nupl > 0.75 ? -0.8          // euphoria → sell
               :  (nupl - 0.45) * 2           // linear mid-range

  const fgSig   = fg < 0.25  ?  0.6           // extreme fear → contrarian buy
               :  fg > 0.80  ? -0.4           // extreme greed → trim
               :  0

  return nuplSig * 0.6 + fgSig * 0.4
}

// ── Volatility-adjusted position size ────────────────────────────────
// Scale raw signal by inverse vol to target 15% annualized portfolio vol
function volAdjust(signal: number, vol20d: number, targetVol = 0.15): number {
  const annVol = Math.max(vol20d, 0.05)       // floor at 5% to avoid blow-up
  return signal * (targetVol / annVol)
}

// ── ATR trailing stop ─────────────────────────────────────────────────
// Returns 0 (flat) if price has fallen more than 2× ATR from recent peak
function atrStopFilter(row: FeatureRow): boolean {
  const atr   = row.atr_14    ?? 0
  const close = row.close     ?? 0
  const high  = row.high_20d  ?? close
  if (atr === 0 || close === 0) return true
  return (high - close) <= 2.0 * atr
}

// ── Volume shock boost ────────────────────────────────────────────────
// Elevated volume on an up-day = liquidity confirmation → boost signal
function volShockBoost(row: FeatureRow): number {
  const shock = row.vol_shock ?? 1.0
  const ret1d = row.ret_1d   ?? 0
  if (shock > 1.5 && ret1d > 0) return 1.15   // bullish volume spike
  if (shock > 1.5 && ret1d < 0) return 0.80   // bearish volume spike = caution
  return 1.0
}

// ── Main signal generator ─────────────────────────────────────────────
export function generateSignals(features: FeatureRow[]): Record<string, number> {
  const raw: Record<string, number> = {}

  for (const row of features) {
    const rsi    = row.rsi_14  ?? 50
    const ret5d  = row.ret_5d  ?? 0
    const ret20d = row.ret_20d ?? 0
    const ret60d = row.ret_60d ?? 0
    const vol20d = row.vol_20d ?? 0.5

    // Skip if ATR trailing stop triggered
    if (!atrStopFilter(row)) {
      raw[row.symbol] = 0
      continue
    }

    // Composite alpha score
    const alpha =
      W.mom5    * Math.tanh(ret5d  * 8)   +   // bounded momentum
      W.mom20   * Math.tanh(ret20d * 5)   +
      W.mom60   * Math.tanh(ret60d * 3)   +
      W.rsi     * rsiSignal(rsi)          +
      W.ema     * emaFilter(row)          +
      W.onchain * onchainSignal(row)

    // Volume confirmation multiplier
    const boosted = alpha * volShockBoost(row)

    // Volatility targeting — scale to 15% target annualized vol
    raw[row.symbol] = volAdjust(boosted, vol20d)
  }

  // ── Cross-sectional normalization ─────────────────────────────────
  // Convert to z-scores so portfolio is market-neutral in expectation
  const vals   = Object.values(raw).filter(v => v !== 0)
  if (vals.length === 0) return raw
  const mean   = vals.reduce((s, v) => s + v, 0) / vals.length
  const std    = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length) || 1

  const signals: Record<string, number> = {}
  for (const [sym, v] of Object.entries(raw)) {
    signals[sym] = (v - mean) / std           // z-score: long top-z, short/flat bottom-z
  }

  return signals
}

// ── Optional: LLM signal overlay ─────────────────────────────────────
// Uncomment to blend in Claude news-sentiment (see llm_signals.ts)
//
// import { newsSentiment } from './llm_signals'
//
// export async function generateSignalsWithLLM(
//   features: FeatureRow[]
// ): Promise<Record<string, number>> {
//   const base    = generateSignals(features)
//   const symbols = features.map(r => r.symbol)
//   const llm     = await newsSentiment(symbols)     // {BTC-USD: 0.4, …}
//   for (const sym of Object.keys(base)) {
//     const llmScore = llm[sym] ?? 0
//     base[sym] = base[sym] * 0.80 + llmScore * 0.20  // 20% LLM blend
//   }
//   return base
// }
`

export const DEFAULT_CONFIG_JSON = JSON.stringify({
  template: 'composite_balanced',
  alpha_type: 'composite',
  symbols: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'XRP-USD'],
  rebalanceFreq: 'daily',
  riskAversion: 8,
  maxWeight: 0.25,
  walkForward: true,
  monteCarlo: true,
  nTrials: 200,
  initialCapital: 1000000,
  feeBps: 7,
  killSwitch: 0.20,
  benchmark: 'BTC-USD',
  slippageBps: 5,
  participationRate: 0.1,
  alphaWeights: { momentum: 0.45, mean_reversion: 0.30, volatility: 0.15, volume: 0.10 },
  forecastHorizon: 10,
}, null, 2)

export const DEFAULT_DOCS = `# ASE Quant Engine — Developer Reference

## Overview
ASE runs **one standardized backtest engine** — Active Swing — tuned for
high-frequency swing trading on liquid crypto pairs. A 9-layer pipeline:
\`\`\`
Data Ingestion → Feature Engineering → Signal Generation →
Portfolio Optimization → Risk Controls → Execution Simulation →
Performance Attribution → Walk-Forward Validation → Live Deployment
\`\`\`

## The Engine
| Property        | Value                                                   |
|-----------------|---------------------------------------------------------|
| Strategy ID     | \`active_swing\`                                        |
| Trades / 6 mo   | ~200 round-trips                                        |
| Target Return   | ~30% (trending crypto)                                  |
| Signals         | RSI(7) + EMA(8/21) trend filter + ATR(10) trailing stop |
| Rebalance       | Daily                                                   |

## active_swing Parameters
| Param       | Default | Range    | Description              |
|-------------|---------|----------|--------------------------|
| rsi_window  | 7       | 3–21     | RSI period (shorter = more sensitive) |
| buy_below   | 38      | 20–50    | Enter when RSI < this    |
| sell_above  | 64      | 50–85    | Exit when RSI > this     |
| atr_window  | 10      | 5–30     | ATR period for stops     |
| atr_mult    | 2.0     | 0.5–5.0  | Stop = price − ATR × mult |
| fast_ema    | 8       | 3–20     | Fast EMA (trend filter)  |
| slow_ema    | 21      | 10–50    | Slow EMA (trend filter)  |

## generate_signals(features: FeatureRow[])
Returns a conviction score per symbol. Engine normalizes and allocates.

### Available Features (FeatureRow)
| Field        | Description                       | Type   |
|--------------|-----------------------------------|--------|
| symbol       | Asset ticker (e.g. BTC-USD)       | string |
| ret_1d       | 1-day return                      | number |
| ret_5d       | 5-day return                      | number |
| ret_20d      | 20-day return                     | number |
| ret_60d      | 60-day return                     | number |
| vol_20d      | 20-day realized volatility (ann.) | number |
| vol_shock    | Volume vs 30-day avg              | number |
| rsi_14       | 14-period RSI (0–100)             | number |
| bb_pct       | Bollinger Band %B (0–1)           | number |
| nupl         | Net Unrealized Profit/Loss        | number |
| fear_greed   | Fear & Greed index (0–100)        | number |

## config.json Fields
| Field           | Type                    | Default      |
|-----------------|-------------------------|--------------|
| template        | string                  | active_swing |
| symbols         | string[]                | BTC/ETH/SOL  |
| rebalanceFreq   | daily/weekly/monthly    | daily        |
| riskAversion    | 1–20                    | 5            |
| maxWeight       | 0.05–1.0                | 0.50         |
| walkForward     | boolean                 | true         |
| initialCapital  | number                  | 100000       |
| feeBps          | number                  | 7            |
| killSwitch      | 0–1                     | 0.25         |
| strategy_params | object                  | see above    |

## Keyboard Shortcuts
| Shortcut   | Action              |
|------------|---------------------|
| ⌘ Enter    | Run backtest        |
| ⌘ S        | Save current file   |
| ⌘ K        | Focus AI chat       |

## Data Sources
Load free market data via the built-in connectors in \`data_loaders.py\`.
Add new sources by importing from the Data panel → Add to project.
`

export const DEFAULT_DATA_LOADERS = `"""
ASE Data Connectors — free & open data sources for crypto strategies.
Import these functions in strategy.py or signal generators.
"""
import requests, pandas as pd

# ── Binance (klines, no auth) ─────────────────────────────────────────────────
def binance(symbol='BTCUSDT', interval='1d', limit=1000):
    r = requests.get('https://api.binance.com/api/v3/klines',
        params={'symbol': symbol, 'interval': interval, 'limit': limit}).json()
    df = pd.DataFrame(r, columns=['ts','open','high','low','close','volume',
                                   'close_ts','q_vol','n_trades','tb_base','tb_quote','_'])
    for c in ['open','high','low','close','volume']:
        df[c] = df[c].astype(float)
    return df[['open','high','low','close','volume']]

# ── CoinGecko (market data, no auth) ─────────────────────────────────────────
def coingecko_ohlc(coin_id='bitcoin', days=365):
    r = requests.get(f'https://api.coingecko.com/api/v3/coins/{coin_id}/ohlc',
        params={'vs_currency': 'usd', 'days': days}).json()
    df = pd.DataFrame(r, columns=['ts','open','high','low','close'])
    df['ts'] = pd.to_datetime(df['ts'], unit='ms')
    return df.set_index('ts')

# ── CoinCap (free, no auth) ───────────────────────────────────────────────────
def coincap(asset='bitcoin', interval='d1', limit=365):
    r = requests.get(f'https://api.coincap.io/v2/assets/{asset}/history',
        params={'interval': interval, 'limit': limit}).json()
    df = pd.DataFrame(r['data'])
    df['date'] = pd.to_datetime(df['time'], unit='ms')
    df['price'] = df['priceUsd'].astype(float)
    return df[['date','price']].set_index('date')

# ── FRED (macro data, optional API key) ──────────────────────────────────────
def fred(series_id='DGS10', api_key=None):
    params = {'series_id': series_id, 'file_type': 'json'}
    if api_key:
        params['api_key'] = api_key
    r = requests.get('https://api.stlouisfed.org/fred/series/observations', params=params).json()
    df = pd.DataFrame(r['observations'])[['date','value']]
    df['value'] = pd.to_numeric(df['value'], errors='coerce')
    df['date'] = pd.to_datetime(df['date'])
    return df.set_index('date').dropna()

# ── Fear & Greed Index (free, unlimited) ──────────────────────────────────────
def fear_greed(limit=365):
    r = requests.get('https://api.alternative.me/fng/', params={'limit': limit}).json()
    df = pd.DataFrame(r['data'])
    df['date'] = pd.to_datetime(df['timestamp'].astype(int), unit='s')
    df['fg'] = df['value'].astype(int)
    return df[['date','fg']].set_index('date')

# ── DeFiLlama (TVL data, free) ────────────────────────────────────────────────
def defillama_tvl(protocol='uniswap'):
    r = requests.get(f'https://api.llama.fi/protocol/{protocol}').json()
    df = pd.DataFrame(r['tvl'])
    df['date'] = pd.to_datetime(df['date'], unit='s')
    df['tvl'] = df['totalLiquidityUSD'].astype(float)
    return df[['date','tvl']].set_index('date')

# ── Kraken OHLC (free, no auth) ──────────────────────────────────────────────
def kraken(pair='XBTUSD', interval=1440):
    r = requests.get('https://api.kraken.com/0/public/OHLC',
        params={'pair': pair, 'interval': interval}).json()
    bars = list(r['result'].values())[0]
    df = pd.DataFrame(bars, columns=['ts','open','high','low','close','vwap','volume','count'])
    for c in ['open','high','low','close','volume']:
        df[c] = df[c].astype(float)
    df['date'] = pd.to_datetime(df['ts'].astype(int), unit='s')
    return df.set_index('date')[['open','high','low','close','volume']]
`

export const DEFAULT_FILES: Record<string, string> = {
  'strategy.ts':    DEFAULT_STRATEGY_TS,
  'config.json':    DEFAULT_CONFIG_JSON,
  'data_loaders.py': DEFAULT_DATA_LOADERS,
  'DOCS.md':        DEFAULT_DOCS,
}