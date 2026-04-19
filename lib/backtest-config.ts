import { STRATEGIES } from './backtest'

export const C = {
  bg: '#06111F', bg2: '#0B1728', bg3: '#101A2D', bg4: '#162438',
  border: '#1E2A3D', border2: '#2A3A50',
  blue: '#4F8CFF', blue2: '#6BA3FF',
  mint: '#16C784', red: '#FF5468', orange: '#F5B942', purple: '#8B5CF6',
  text: '#B7C4D5', muted: '#7F8CA3', faint: '#55657A', white: '#F7FAFF',
}

export const TEMPLATES = Object.entries(STRATEGIES)
  .filter(([id]) => id !== 'custom')
  .map(([id, meta]) => ({
    id,
    name: meta.name,
    dot: id.includes('momentum') ? C.blue
      : id.includes('mean_rev') || id.includes('rsi_mean') ? C.mint
      : id.includes('breakout') || id.includes('volatility') ? C.orange
      : id.includes('factor') ? C.purple
      : id.includes('dual') ? C.blue2
      : id.includes('macd') ? C.orange
      : C.muted,
  }))

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
  'BTC-USD': { label: 'Bitcoin', color: '#f7931a' },
  'ETH-USD': { label: 'Ethereum', color: '#627eea' },
  'SOL-USD': { label: 'Solana', color: '#19E6A7' },
}

export const BACKTEST_STRATEGIES = Object.entries(STRATEGIES)
  .filter(([id]) => id !== 'custom')
  .map(([id, meta]) => ({
    id,
    label: meta.name,
    description: meta.description,
    bestFor: meta.bestFor,
    mainRisk: meta.mainRisk,
    paramSchema: meta.paramSchema,
  }))

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

export const DEFAULT_STRATEGY_TS = `// ─── ASE Quant Strategy ─────────────────────────────────────────────────────
// This file defines your alpha signal logic.
// generate_signals() receives cross-sectional features for every
// asset and returns a raw conviction score (higher = stronger long).
//
// The ASE engine handles: portfolio optimization, position sizing,
// rebalancing, transaction costs, risk controls & live execution.

import type { FeatureRow } from '@ase/quant'

export const config = {
  name:          'Crypto Momentum',
  universe:      ['BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'ADA-USD'],
  rebalanceFreq: 'daily' as const,
  riskAversion:  7,         // λ: higher = more risk-averse (1–20)
  maxWeight:     0.30,      // max allocation per asset
  feeBps:        7,         // round-trip fee in basis points
  killSwitch:    0.20,      // halt trading if drawdown exceeds 20%
}

export function generateSignals(features: FeatureRow[]): Record<string, number> {
  const signals: Record<string, number> = {}

  for (const row of features) {
    // ── Momentum ─────────────────────────────────────────────────────────────
    const mom20  = row.ret_20d  ?? 0
    const mom60  = row.ret_60d  ?? 0
    const mom120 = row.ret_120d ?? 0

    // Blend short, medium, and long-term momentum (decay-weighted)
    const momentum = mom20 * 0.50 + mom60 * 0.35 + mom120 * 0.15

    // ── Volume confirmation ───────────────────────────────────────────────────
    const volShock  = row.vol_shock ?? 1
    const volBoost  = volShock > 1.25 ? 1.20 : volShock > 1.10 ? 1.08 : 1.0

    // ── Volatility regime filter ─────────────────────────────────────────────
    const vol20     = row.vol_20d ?? 0
    const volPenalty = vol20 > 2.0 ? 0.65 : vol20 > 1.5 ? 0.85 : 1.0

    // ── On-chain signal (if available) ───────────────────────────────────────
    const onChain  = row.nupl ?? 0      // NUPL: Net Unrealized Profit/Loss
    const onChainBoost = onChain > 0 ? 1.0 + (onChain * 0.15) : 1.0

    signals[row.symbol] = momentum * volBoost * volPenalty * onChainBoost
  }

  return signals
}
`

export const DEFAULT_CONFIG_JSON = JSON.stringify({
  template: 'composite_balanced',
  alpha_type: 'momentum',
  symbols: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'ADA-USD'],
  rebalanceFreq: 'daily',
  riskAversion: 7,
  maxWeight: 0.30,
  walkForward: true,
  initialCapital: 1000000,
  feeBps: 7,
  killSwitch: 0.20,
  benchmark: 'BTC-USD',
}, null, 2)

export const DEFAULT_DOCS = `# ASE Quant Engine — Developer Reference

## Overview
The ASE backtest engine is a 9-layer institutional pipeline:
\`\`\`
Data Ingestion → Feature Engineering → Signal Generation →
Portfolio Optimization → Risk Controls → Execution Simulation →
Performance Attribution → Walk-Forward Validation → Live Deployment
\`\`\`

## generate_signals(features: FeatureRow[])
Returns a score per symbol (no normalization needed — engine handles it).

### Available Features (FeatureRow)
| Field         | Description                        | Type   |
|---------------|------------------------------------|--------|
| symbol        | Asset ticker (e.g. BTC-USD)        | string |
| ret_1d        | 1-day return                        | number |
| ret_5d        | 5-day return                        | number |
| ret_20d       | 20-day return                       | number |
| ret_60d       | 60-day return                       | number |
| ret_120d      | 120-day return                      | number |
| vol_20d       | 20-day realized volatility (ann.)   | number |
| vol_shock     | Volume relative to 30-day avg       | number |
| rsi_14        | 14-period RSI (0–100)               | number |
| bb_pct        | Bollinger Band %B (0–1)             | number |
| nupl          | Net Unrealized Profit/Loss          | number |
| sopr          | Spent Output Profit Ratio           | number |
| mvrv          | Market Value / Realized Value       | number |
| fear_greed    | Fear & Greed index (0–100)          | number |
| defi_tvl_chg  | DeFi TVL 7d change                  | number |

## config.json Fields
| Field          | Type              | Default            |
|----------------|-------------------|--------------------|
| template       | string            | composite_balanced |
| symbols        | string[]          | Top-5 crypto       |
| rebalanceFreq  | daily/weekly/monthly | daily           |
| riskAversion   | 1–20              | 7                  |
| maxWeight      | 0.05–0.60         | 0.30               |
| walkForward    | boolean           | true               |
| initialCapital | number            | 1000000            |
| feeBps         | number            | 7                  |
| killSwitch     | 0–1               | 0.20               |

## Templates
- **momentum_conservative** — trend-following, low turnover
- **mean_reversion_active** — buy dips, sell rips, higher freq
- **composite_balanced** — blends momentum + mean-reversion
- **ml_aggressive** — gradient-boosted signals, higher Sharpe target
- **risk_parity** — equal volatility contribution per asset

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