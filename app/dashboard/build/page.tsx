'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg: '#06111F', bg2: '#0B1728', bg3: '#101A2D', bg4: '#162438',
  border: '#1E2A3D', border2: '#2A3A50',
  blue: '#4F8CFF', blue2: '#6BA3FF',
  mint: '#16C784', red: '#FF5468', orange: '#F5B942', purple: '#8B5CF6',
  text: '#B7C4D5', muted: '#7F8CA3', faint: '#55657A', white: '#F7FAFF',
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Strategy { id: string; name: string; files: Record<string, string>; createdAt: number }
interface ChatMsg { role: 'user' | 'ai'; text: string; edits?: FileEdit[] }
interface FileEdit { filename: string; content: string; lang: string }

// ── Default files ─────────────────────────────────────────────────────────────
const DEFAULT_STRATEGY_TS = `// ─── ASE Quant Strategy ─────────────────────────────────────────────────────
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

const DEFAULT_CONFIG = `{
  "template":       "composite_balanced",
  "alpha_type":     "momentum",
  "symbols":        ["BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "ADA-USD"],
  "rebalanceFreq":  "daily",
  "riskAversion":   7,
  "maxWeight":      0.30,
  "walkForward":    true,
  "initialCapital": 1000000,
  "feeBps":         7,
  "killSwitch":     0.20,
  "benchmark":      "BTC-USD"
}`

const DEFAULT_DOCS = `# ASE Quant Engine — Developer Reference

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

const DEFAULT_DATA_LOADERS = `"""
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

const DEFAULT_FILES: Record<string, string> = {
  'strategy.ts':    DEFAULT_STRATEGY_TS,
  'config.json':    DEFAULT_CONFIG,
  'data_loaders.py': DEFAULT_DATA_LOADERS,
  'DOCS.md':        DEFAULT_DOCS,
}

// ── Data APIs ─────────────────────────────────────────────────────────────────
const DATA_APIS = [
  // Crypto Price/OHLCV
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
  // DeFi / On-chain
  { id: 'defillama',  name: 'DeFiLlama',     cat: 'defi',    auth: 'none',     limit: 'unlimited', desc: 'TVL, fees, volume across 3000+ protocols' },
  { id: 'uniswap',    name: 'Uniswap',       cat: 'defi',    auth: 'none',     limit: 'unlimited', desc: 'Pool liquidity, volume, price impact via The Graph' },
  { id: 'aave',       name: 'Aave',          cat: 'defi',    auth: 'none',     limit: 'unlimited', desc: 'Lending/borrowing rates, utilization, reserves' },
  { id: 'curve',      name: 'Curve',         cat: 'defi',    auth: 'none',     limit: 'unlimited', desc: 'Stablecoin pool balances, volume, APY' },
  { id: 'thegraph',   name: 'The Graph',     cat: 'defi',    auth: 'optional', limit: '1000/day',  desc: 'Query any indexed contract via GraphQL — free tier' },
  // On-chain analytics
  { id: 'glassnode',  name: 'Glassnode',     cat: 'onchain', auth: 'optional', limit: '100/day',   desc: 'SOPR, NUPL, MVRV, active addresses, miner flows' },
  { id: 'coinmetrics', name: 'CoinMetrics',  cat: 'onchain', auth: 'optional', limit: '1000/day',  desc: 'Community API — realized cap, NVT, hash rate' },
  { id: 'santiment',  name: 'Santiment',     cat: 'onchain', auth: 'optional', limit: '200/day',   desc: 'Social volume, dev activity, whale transactions' },
  { id: 'lunarcrush', name: 'LunarCrush',   cat: 'social',  auth: 'optional', limit: '10/min',    desc: 'Social engagement, influencer metrics, altrank' },
  // Sentiment
  { id: 'fng',        name: 'Fear & Greed',  cat: 'sentiment', auth: 'none',   limit: 'unlimited', desc: 'Crypto F&G index — 365-day history, daily updates' },
  { id: 'messari',    name: 'Messari',       cat: 'research', auth: 'optional', limit: '20/min',   desc: 'Fundamentals, asset profiles, market data' },
  { id: 'alternative', name: 'Alternative.me', cat: 'sentiment', auth: 'none', limit: 'unlimited', desc: 'F&G index, trending coins, exchange volumes' },
  // Macro
  { id: 'fred',       name: 'FRED',          cat: 'macro',   auth: 'optional', limit: '120/hr',    desc: 'GDP, CPI, rates, DXY — Federal Reserve data' },
  { id: 'worldbank',  name: 'World Bank',    cat: 'macro',   auth: 'none',     limit: 'unlimited', desc: 'Global economic indicators, country data' },
  // Derivatives
  { id: 'tardis',     name: 'Tardis',        cat: 'deriv',   auth: 'optional', limit: 'delay-free', desc: 'Options, perps — historical tick data with delay' },
  { id: 'coinglass',  name: 'CoinGlass',     cat: 'deriv',   auth: 'none',     limit: '30/min',    desc: 'Open interest, liquidations, long/short ratio' },
  { id: 'laevitas',   name: 'Laevitas',      cat: 'deriv',   auth: 'optional', limit: '60/min',    desc: 'Options flow, implied vol, put/call ratio' },
  // Network / Infrastructure
  { id: 'etherscan',  name: 'Etherscan',     cat: 'network', auth: 'optional', limit: '5/s',       desc: 'Gas prices, contract calls, wallet balances' },
  { id: 'mempool',    name: 'Mempool.space', cat: 'network', auth: 'none',     limit: 'unlimited', desc: 'Bitcoin mempool, fee rates, block data' },
]

const TEMPLATES = [
  { id: 'momentum_conservative', name: 'Momentum Conservative', dot: C.blue },
  { id: 'mean_reversion_active', name: 'Mean Reversion Active', dot: C.mint },
  { id: 'composite_balanced',    name: 'Composite Balanced',    dot: C.purple },
  { id: 'ml_aggressive',         name: 'ML Aggressive',         dot: C.orange },
  { id: 'risk_parity',           name: 'Risk Parity',           dot: C.red },
]

const UNIVERSES: Record<string, string[]> = {
  crypto_top5:  ['BTC-USD','ETH-USD','SOL-USD','BNB-USD','ADA-USD'],
  crypto_top10: ['BTC-USD','ETH-USD','SOL-USD','BNB-USD','XRP-USD','ADA-USD','AVAX-USD','DOT-USD','LINK-USD','UNI-USD'],
  crypto_defi:  ['UNI-USD','LINK-USD','AVAX-USD','DOT-USD','ATOM-USD','MKR-USD','AAVE-USD'],
  crypto_l1:    ['ETH-USD','SOL-USD','ADA-USD','AVAX-USD','DOT-USD','NEAR-USD'],
  crypto_l2:    ['MATIC-USD','ARB-USD','OP-USD','IMX-USD','METIS-USD'],
  btc_eth:      ['BTC-USD','ETH-USD'],
}

const GRADE_CLR: Record<string, string> = {
  'A+': C.mint, A: C.mint, B: C.blue, C: C.orange, D: '#F59E0B', F: C.red,
}

const DEFAULT_CONFIG_JSON = `{
  "template":       "composite_balanced",
  "alpha_type":     "momentum",
  "symbols":        ["BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "ADA-USD"],
  "rebalanceFreq":  "daily",
  "riskAversion":   7,
  "maxWeight":      0.30,
  "walkForward":    true,
  "initialCapital": 1000000,
  "feeBps":         7,
  "killSwitch":    0.20,
  "benchmark":     "BTC-USD"
}`

function extractConfigFields(jsonStr: string): Record<string, { value: string | number | boolean; type: 'string' | 'number' | 'boolean' | 'array' }> {
  const fields: Record<string, { value: string | number | boolean; type: 'string' | 'number' | 'boolean' | 'array' }> = {}
  try {
    const parsed = JSON.parse(jsonStr)
    for (const [k, v] of Object.entries(parsed)) {
      if (Array.isArray(v)) {
        fields[k] = { value: JSON.stringify(v), type: 'array' }
      } else if (typeof v === 'boolean') {
        fields[k] = { value: v, type: 'boolean' }
      } else if (typeof v === 'number') {
        fields[k] = { value: v, type: 'number' }
      } else if (typeof v === 'string') {
        fields[k] = { value: v, type: 'string' }
      }
    }
  } catch {}
  return fields
}

const CONFIG_FIELD_META: Record<string, { label: string; min?: number; max?: number; step?: number; options?: Record<string, string>; fmt?: (v: unknown) => string }> = {
  template: { label: 'TEMPLATE', options: { momentum_conservative: 'Momentum Conservative', mean_reversion_active: 'Mean Reversion', composite_balanced: 'Composite Balanced', ml_aggressive: 'ML Aggressive', risk_parity: 'Risk Parity' } },
  symbols: { label: 'SYMBOLS', fmt: (v: unknown) => Array.isArray(v) ? `${(v as string[]).length} assets` : '—' },
  rebalanceFreq: { label: 'REBALANCE', options: { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' } },
  riskAversion: { label: 'RISK AVERSION (λ)', min: 1, max: 20, fmt: (v: unknown) => String(v) },
  maxWeight: { label: 'MAX WEIGHT / ASSET', min: 5, max: 60, fmt: (v: unknown) => `${Number(v) * 100}%` },
  walkForward: { label: 'WALK-FORWARD' },
  initialCapital: { label: 'INITIAL CAPITAL', min: 10000, max: 100000000, step: 10000 },
  feeBps: { label: 'FEE (BPS)', min: 0, max: 100 },
  killSwitch: { label: 'KILL SWITCH', min: 0, max: 1, fmt: (v: unknown) => `${Number(v) * 100}%` },
  benchmark: { label: 'BENCHMARK' },
}

const AGENT_ICONS = ['◉', '◎', '⟐', '◈', '⬡', '⬢', '◆', '◇', '◉', '◎']

const ML_TOOLS = [
  { id: 'sklearn', name: 'scikit-learn', desc: 'RandomForest, XGBoost signals', icon: '🤖' },
  { id: 'lightgbm', name: 'LightGBM', desc: 'Fast gradient boosting', icon: '⚡' },
  { id: 'pytorch', name: 'PyTorch', desc: 'LSTM, Transformer price models', icon: '🔥' },
  { id: 'statsmodels', name: 'statsmodels', desc: 'GARCH, VAR, cointegration', icon: '📊' },
  { id: 'hurst', name: 'Hurst Exponent', desc: 'Mean-reversion detection', icon: '📈' },
  { id: 'pyportfolioopt', name: 'PyPortfolioOpt', desc: 'Black-Litterman, HRP', icon: '⚖️' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
const fP = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
const col = (v: number) => v >= 0 ? C.mint : C.red

function Tag({ text, color = C.blue }: { text: string; color?: string }) {
  return <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', padding: '.1rem .42rem', borderRadius: 4, background: `${color}14`, color, border: `1px solid ${color}28` }}>{text}</span>
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, padding: '.5rem .65rem' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.44rem', color: C.faint, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '.15rem' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.82rem', fontWeight: 700, color: color ?? C.white }}>{value}</div>
    </div>
  )
}

// ── Simple markdown renderer ───────────────────────────────────────────────────
function MdText({ text, onApply }: { text: string; onApply?: (edit: FileEdit) => void }) {
  const parts: React.ReactNode[] = []
  let remaining = text
  let key = 0

  // Extract code blocks first
  const codeBlockRe = /```(\w+)?\n([\s\S]*?)```/g
  let lastIndex = 0
  let m: RegExpExecArray | null

  while ((m = codeBlockRe.exec(text)) !== null) {
    // Text before block
    if (m.index > lastIndex) {
      parts.push(<InlineText key={key++} text={text.slice(lastIndex, m.index)} />)
    }
    const lang = m[1] || 'text'
    const code = m[2]
    // Detect FILE directive
    const fileMatch = code.match(/^\/\/ FILE: ([^\n]+)\n/)
    const filename = fileMatch ? fileMatch[1].trim() : null
    const displayCode = fileMatch ? code.slice(fileMatch[0].length) : code

    parts.push(
      <div key={key++} style={{ margin: '.5rem 0', borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.border2}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.25rem .6rem', background: C.bg3, borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.faint }}>{filename || lang}</span>
          {filename && onApply && (
            <button
              onClick={() => onApply({ filename, content: displayCode, lang })}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', fontWeight: 700, padding: '.15rem .45rem', borderRadius: 5, background: `${C.mint}20`, border: `1px solid ${C.mint}40`, color: C.mint, cursor: 'pointer' }}
            >
              ✓ Apply
            </button>
          )}
        </div>
        <pre style={{ margin: 0, padding: '.6rem .75rem', background: C.bg, fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: C.text, lineHeight: 1.55, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {displayCode.trimEnd()}
        </pre>
      </div>
    )
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < text.length) {
    parts.push(<InlineText key={key++} text={text.slice(lastIndex)} />)
  }

  return <div>{parts}</div>
  void remaining
}

function InlineText({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <>
      {lines.map((line, i) => {
        if (line.startsWith('# ')) return <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', fontWeight: 700, color: C.white, marginTop: '.5rem', marginBottom: '.2rem' }}>{line.slice(2)}</div>
        if (line.startsWith('## ')) return <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '.66rem', fontWeight: 700, color: C.blue2, marginTop: '.4rem', marginBottom: '.15rem' }}>{line.slice(3)}</div>
        if (line.startsWith('- ') || line.startsWith('* ')) return <div key={i} style={{ display: 'flex', gap: '.3rem', color: C.text, fontSize: '.68rem', lineHeight: 1.6 }}><span style={{ color: C.faint, flexShrink: 0 }}>·</span><span>{applyInline(line.slice(2))}</span></div>
        if (line.trim() === '') return <div key={i} style={{ height: '.35rem' }} />
        return <div key={i} style={{ color: C.text, fontSize: '.68rem', lineHeight: 1.65 }}>{applyInline(line)}</div>
      })}
    </>
  )
}

function applyInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  const re = /(\*\*(.+?)\*\*|`(.+?)`|\*(.+?)\*)/g
  let last = 0, m: RegExpExecArray | null, k = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={k++}>{text.slice(last, m.index)}</span>)
    if (m[2]) parts.push(<strong key={k++} style={{ color: C.white }}>{m[2]}</strong>)
    else if (m[3]) parts.push(<code key={k++} style={{ fontFamily: 'var(--font-mono)', fontSize: '.64rem', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 3, padding: '0 .25rem', color: C.blue2 }}>{m[3]}</code>)
    else if (m[4]) parts.push(<em key={k++} style={{ color: C.muted }}>{m[4]}</em>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(<span key={k++}>{text.slice(last)}</span>)
  return parts
}

// ── Code editor ───────────────────────────────────────────────────────────────
function CodeEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const lines = value.split('\n')
  const handleTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    e.preventDefault()
    const ta = taRef.current!
    const s = ta.selectionStart, end = ta.selectionEnd
    const next = value.substring(0, s) + '  ' + value.substring(end)
    onChange(next)
    requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = s + 2 })
  }
  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ userSelect: 'none', pointerEvents: 'none', padding: '.85rem 0', background: C.bg, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 42 }}>
        {lines.map((_, i) => <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '.68rem', lineHeight: '1.55rem', color: C.faint, paddingRight: '.55rem' }}>{i + 1}</div>)}
      </div>
      <textarea ref={taRef} value={value} onChange={e => onChange(e.target.value)} onKeyDown={handleTab} spellCheck={false}
        style={{ flex: 1, resize: 'none', border: 'none', outline: 'none', background: C.bg, color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.68rem', lineHeight: '1.55rem', padding: '.85rem .85rem .85rem .6rem', overflowY: 'auto' }} />
    </div>
  )
}

// ── Terminal ──────────────────────────────────────────────────────────────────
function TerminalPanel({ lines, input, onInput, onSubmit, loading }: { lines: string[]; input: string; onInput: (v: string) => void; onSubmit: () => void; loading: boolean }) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [lines])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bg }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '.4rem .85rem', fontFamily: 'var(--font-mono)', fontSize: '.68rem' }}>
        {lines.map((l, i) => <div key={i} style={{ color: l.startsWith('✗') ? C.red : l.startsWith('✓') ? C.mint : l.startsWith('>') ? C.blue2 : l.startsWith('●') ? C.orange : C.muted, lineHeight: '1.55rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{l}</div>)}
        {loading && <div style={{ color: C.orange, lineHeight: '1.55rem' }}>● running…</div>}
        <div ref={endRef} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', borderTop: `1px solid ${C.border}`, padding: '.28rem .65rem', gap: '.35rem' }}>
        <span style={{ color: C.mint, fontFamily: 'var(--font-mono)', fontSize: '.7rem' }}>›</span>
        <input value={input} onChange={e => onInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && onSubmit()} placeholder="type a command (help)…" style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.68rem' }} />
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function QuantLabPage() {
  // Strategy manager
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [activeStrategyId, setActiveStrategyId] = useState<string>('')

  // Editor state
  const [openFiles, setOpenFiles]       = useState(['strategy.ts', 'config.json'])
  const [activeFile, setActiveFile]     = useState('strategy.ts')
  const [fileContents, setFileContents] = useState<Record<string, string>>(DEFAULT_FILES)
  const [saved, setSaved]               = useState(true)

  // Layout
  const [sideOpen, setSideOpen]   = useState(true)
  const [rightTab, setRightTab]   = useState<'backtest'|'data'|'docs'>('backtest')
  const [bottomMode, setBottomMode] = useState<'terminal'|'chat'>('terminal')

  // Terminal
  const [termLines, setTermLines]     = useState(['● ASE Quant Lab ready', '● ⌘+Enter run  ·  ⌘+S save  ·  ⌘+K focus AI', ''])
  const [termInput, setTermInput]     = useState('')

  // Backtest config (synced from config.json)
  const [template, setTemplate]       = useState('composite_balanced')
  const [universe, setUniverse]       = useState('crypto_top5')
  const [startDate, setStartDate]     = useState('2021-01-01')
  const [endDate]                     = useState(new Date().toISOString().slice(0, 10))
  const [rebalFreq, setRebalFreq]     = useState<'daily'|'weekly'|'monthly'>('daily')
  const [riskAversion, setRiskAversion] = useState(7)
  const [maxWeight, setMaxWeight]     = useState(0.30)
  const [walkFwd, setWalkFwd]         = useState(true)
  const [initCapital, setInitCapital] = useState(1000000)
  const [feeBps, setFeeBps]           = useState(7)
  const [btLoading, setBtLoading]     = useState(false)
  const [btResult, setBtResult]       = useState<Record<string, unknown> | null>(null)
  const [btError, setBtError]         = useState('')
  const [btStartTime, setBtStartTime] = useState<number|null>(null)
  const [btElapsed, setBtElapsed]     = useState(0)

  // Data panel
  const [dataSearch, setDataSearch]   = useState('')
  const [selAPI, setSelAPI]           = useState<typeof DATA_APIS[0] | null>(null)
  const [dataView, setDataView]       = useState<'apis'|'ml'>('apis')

  // AI chat
  const [chatMsgs, setChatMsgs]       = useState<ChatMsg[]>([
    { role: 'ai', text: "I'm your quant AI assistant. I can **design alpha models**, **analyze backtest results**, **suggest optimizations**, and **write code** directly to your files.\n\nTry asking:\n- *Improve my Sharpe ratio*\n- *Add on-chain signals (NUPL, SOPR)*\n- *Explain my backtest results*\n- *Optimize the risk aversion parameter*" },
  ])
  const [chatInput, setChatInput]     = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)
  const chatEndRef   = useRef<HTMLDivElement>(null)
  useEffect(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), [chatMsgs])

  // Strategy name / publish
  const [agentName, setAgentName]     = useState('Crypto Momentum')
  const [publishing, setPublishing]   = useState(false)
  const [published, setPublished]     = useState(false)

  // Dynamic config fields (from codebase)
  const [configFields, setConfigFields] = useState<Record<string, { value: string | number | boolean; type: string }>>({})
  const [agentIconIdx, setAgentIconIdx]   = useState(Math.floor(Math.random() * AGENT_ICONS.length))

  // Update config fields from config.json
  useEffect(() => {
    const cfg = fileContents['config.json']
    if (cfg) {
      setConfigFields(extractConfigFields(cfg))
    }
  }, [fileContents['config.json']])

  // ── Load strategies from localStorage ────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('ase-strategies') || '[]') as Strategy[]
      if (saved.length > 0) {
        setStrategies(saved)
        const first = saved[0]
        setActiveStrategyId(first.id)
        setFileContents(first.files)
        setAgentName(first.name)
      } else {
        const id = Date.now().toString()
        const defaultStrat: Strategy = { id, name: 'Crypto Momentum', files: DEFAULT_FILES, createdAt: Date.now() }
        setStrategies([defaultStrat])
        setActiveStrategyId(id)
        localStorage.setItem('ase-strategies', JSON.stringify([defaultStrat]))
      }
    } catch {}
  }, [])

  const saveStrategies = useCallback((strats: Strategy[]) => {
    setStrategies(strats)
    try { localStorage.setItem('ase-strategies', JSON.stringify(strats)) } catch {}
  }, [])

  const switchStrategy = useCallback((id: string) => {
    const strat = strategies.find(s => s.id === id)
    if (!strat) return
    setActiveStrategyId(id)
    setFileContents(strat.files)
    setAgentName(strat.name)
    setOpenFiles(['strategy.ts', 'config.json'])
    setActiveFile('strategy.ts')
    setSaved(true)
    setBtResult(null)
  }, [strategies])

  const createStrategy = useCallback(() => {
    const name = prompt('Strategy name:')
    if (!name) return
    const id = Date.now().toString()
    const strat: Strategy = { id, name, files: { ...DEFAULT_FILES }, createdAt: Date.now() }
    const updated = [...strategies, strat]
    saveStrategies(updated)
    switchStrategy(id)
  }, [strategies, saveStrategies, switchStrategy])

  const deleteStrategy = useCallback((id: string) => {
    if (!confirm('Delete this strategy?')) return
    const updated = strategies.filter(s => s.id !== id)
    if (updated.length === 0) {
      const newId = Date.now().toString()
      const strat: Strategy = { id: newId, name: 'Crypto Momentum', files: { ...DEFAULT_FILES }, createdAt: Date.now() }
      saveStrategies([strat])
      switchStrategy(newId)
    } else {
      saveStrategies(updated)
      if (id === activeStrategyId) switchStrategy(updated[0].id)
    }
  }, [strategies, activeStrategyId, saveStrategies, switchStrategy])

  const persistCurrentFiles = useCallback((files: Record<string, string>) => {
    const updated = strategies.map(s => s.id === activeStrategyId ? { ...s, files } : s)
    saveStrategies(updated)
  }, [strategies, activeStrategyId, saveStrategies])

  // ── Config.json → backtest sync ───────────────────────────────────────────────
  useEffect(() => {
    const raw = fileContents['config.json']
    if (!raw) return
    try {
      const cfg = JSON.parse(raw)
      if (cfg.template) setTemplate(cfg.template)
      if (Array.isArray(cfg.symbols)) {
        const syms = cfg.symbols.join(',')
        const found = Object.entries(UNIVERSES).find(([, v]) => v.join(',') === syms)
        setUniverse(found ? found[0] : 'crypto_top5')
      }
      if (cfg.rebalanceFreq) setRebalFreq(cfg.rebalanceFreq)
      if (typeof cfg.riskAversion === 'number') setRiskAversion(cfg.riskAversion)
      if (typeof cfg.maxWeight === 'number') setMaxWeight(cfg.maxWeight)
      if (typeof cfg.walkForward === 'boolean') setWalkFwd(cfg.walkForward)
      if (typeof cfg.initialCapital === 'number') setInitCapital(cfg.initialCapital)
      if (typeof cfg.feeBps === 'number') setFeeBps(cfg.feeBps)
    } catch {}
  }, [fileContents['config.json']]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live API tracking ─────────────────────────────────────────────────────────
  const usedAPIIds = useMemo(() => {
    const all = Object.values(fileContents).join('\n').toLowerCase()
    return new Set(DATA_APIS.filter(a => all.includes(a.id) || all.includes(a.name.toLowerCase())).map(a => a.id))
  }, [fileContents])

  // ── Backtest timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!btLoading || !btStartTime) return
    const id = setInterval(() => setBtElapsed(Math.round((Date.now() - btStartTime) / 1000)), 500)
    return () => clearInterval(id)
  }, [btLoading, btStartTime])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void runBacktest() }
      if ((e.ctrlKey || e.metaKey) && e.key === 's')     { e.preventDefault(); handleSave() }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k')     { e.preventDefault(); setBottomMode('chat'); setTimeout(() => chatInputRef.current?.focus(), 50) }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  })

  // ── File helpers ──────────────────────────────────────────────────────────────
  const handleSave = () => {
    setSaved(true)
    persistCurrentFiles(fileContents)
    addTerm(`✓ ${activeFile} saved`)
  }

  const openFile = (name: string) => {
    if (!openFiles.includes(name)) setOpenFiles(p => [...p, name])
    setActiveFile(name)
  }

  const closeFile = (name: string) => {
    const next = openFiles.filter(f => f !== name)
    setOpenFiles(next)
    if (activeFile === name) setActiveFile(next[next.length - 1] ?? '')
  }

  const updateFile = (name: string, content: string) => {
    setFileContents(p => {
      const updated = { ...p, [name]: content }
      return updated
    })
    setSaved(false)
  }

  const addTerm = useCallback((line: string) => setTermLines(p => [...p, line]), [])

  // ── Terminal commands ─────────────────────────────────────────────────────────
  const handleTermSubmit = useCallback(() => {
    const cmd = termInput.trim()
    if (!cmd) return
    addTerm(`> ${cmd}`)
    setTermInput('')
    if      (cmd === 'help')    addTerm('Commands: backtest · clear · ls · save · grade · version · apis')
    else if (cmd === 'clear')   setTermLines([])
    else if (cmd === 'ls')      Object.keys(fileContents).forEach(f => addTerm(`  ${f}`))
    else if (cmd === 'save')    handleSave()
    else if (cmd === 'backtest') void runBacktest()
    else if (cmd === 'version') addTerm('ASE Quant Lab v3.0.0 · 9-layer pipeline')
    else if (cmd === 'apis')    DATA_APIS.forEach(a => addTerm(`  ${a.id.padEnd(12)} ${a.name} (${a.auth === 'none' ? 'free' : a.auth})`))
    else if (cmd === 'grade') {
      if (btResult) {
        const ts = btResult.tear_sheet as Record<string, number>
        addTerm(`Grade: ${btResult.grade}  CAGR: ${((ts.cagr ?? 0) * 100).toFixed(1)}%  Sharpe: ${ts.sharpeRatio?.toFixed(2)}  MaxDD: ${ts.maxDrawdownPct?.toFixed(1)}%`)
      } else addTerm('✗ No backtest results. Run one first.')
    }
    else addTerm(`✗ Unknown: ${cmd}. Type "help".`)
    addTerm('')
  }, [termInput, btResult, fileContents, addTerm])

  // ── Backtest ──────────────────────────────────────────────────────────────────
  async function runBacktest() {
    setBtLoading(true); setBtError(''); setBtResult(null)
    setBtStartTime(Date.now()); setBtElapsed(0)
    addTerm('● Running backtest…')
    const syms = UNIVERSES[universe] ?? UNIVERSES.crypto_top5
    try {
      const res = await fetch('/api/quant/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, symbols: syms, start_date: startDate, end_date: endDate, rebalance_freq: rebalFreq, risk_aversion: riskAversion, max_weight: maxWeight, walk_forward: walkFwd, initial_capital: initCapital, fee_bps: feeBps, save: false }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Backtest failed')
      setBtResult(data)
      const ts = data.tear_sheet as Record<string, number>
      addTerm(`✓ Grade: ${data.grade}  CAGR: ${((ts.cagr ?? 0) * 100).toFixed(1)}%  Sharpe: ${ts.sharpeRatio?.toFixed(2)}  MaxDD: ${ts.maxDrawdownPct?.toFixed(1)}%`)
      setRightTab('backtest')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error'
      setBtError(msg); addTerm(`✗ ${msg}`)
    } finally { setBtLoading(false); setBtStartTime(null) }
  }

  // ── Publish ───────────────────────────────────────────────────────────────────
  async function handlePublish() {
    if (!btResult) { addTerm('✗ Run a backtest first before publishing.'); return }
    if (published) { addTerm('✓ Already live.'); return }
    setPublishing(true)
    await new Promise(r => setTimeout(r, 1400))
    setPublished(true); setPublishing(false)
    addTerm(`✓ "${agentName}" published to exchange`)
  }

  // ── AI Chat ───────────────────────────────────────────────────────────────────
  async function sendChat() {
    const msg = chatInput.trim()
    if (!msg || chatLoading) return
    setChatInput('')
    setChatMsgs(p => [...p, { role: 'user', text: msg }])
    setChatLoading(true)
    const ts = (btResult?.tear_sheet ?? {}) as Record<string, number>
    const context = `You are an expert quant strategy AI for the ASE platform (crypto & DeFi trading only — NO stocks).

Current file: ${activeFile}
--- FILE CONTENT ---
${fileContents[activeFile] ?? '(empty)'}
---

Config:
${fileContents['config.json'] ?? '(none)'}

Backtest results: ${btResult ? `Grade: ${btResult.grade}, CAGR: ${((ts.cagr??0)*100).toFixed(1)}%, Sharpe: ${(ts.sharpeRatio??0).toFixed(2)}, MaxDD: ${(ts.maxDrawdownPct??0).toFixed(1)}%` : 'No backtest run yet.'}

Used APIs: ${Array.from(usedAPIIds).join(', ') || 'none detected'}

IMPORTANT: When suggesting code changes, output them with this exact format so the user can apply with one click:
\`\`\`typescript
// FILE: strategy.ts
// [complete file content here]
\`\`\`

Focus exclusively on crypto, DeFi, and macro signals. Be technical and precise.`
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [
          { role: 'system', content: context },
          { role: 'user', content: msg },
        ]}),
      })
      const d = await res.json()
      const aiText = d.content ?? d.message ?? d.text ?? "I'm ready to help optimize your strategy. What would you like to improve?"
      setChatMsgs(p => [...p, { role: 'ai', text: aiText }])
    } catch {
      setChatMsgs(p => [...p, { role: 'ai', text: "I'm ready to help with alpha research, signal design, and strategy optimization." }])
    } finally { setChatLoading(false) }
  }

  const applyEdit = useCallback((edit: FileEdit) => {
    updateFile(edit.filename, edit.content)
    if (!openFiles.includes(edit.filename)) setOpenFiles(p => [...p, edit.filename])
    setActiveFile(edit.filename)
    addTerm(`✓ Applied edit to ${edit.filename}`)
  }, [openFiles, addTerm])

  // ── Derived ───────────────────────────────────────────────────────────────────
  const ts       = (btResult?.tear_sheet ?? {}) as Record<string, number>
  const equity   = (btResult?.equity_curve ?? []) as Array<{ date: string; equity: number }>
  const icSeries = (btResult?.ic_series ?? []) as Array<{ date: string; ic: number }>
  const grade    = (btResult?.grade as string) ?? ''
  const gradeCLR = grade ? (GRADE_CLR[grade] ?? C.muted) : C.faint
  const bmEquity = (btResult?.benchmark_equity ?? []) as Array<{ equity: number }>

  const chartData = useMemo(() => {
    if (!equity.length) return []
    const step = Math.max(1, Math.floor(equity.length / 280))
    return equity.filter((_, i) => i % step === 0).map((p, i) => ({
      date: p.date?.slice(5) ?? '',
      strategy: Math.round(p.equity),
      benchmark: Math.round(bmEquity[Math.min(i * step, bmEquity.length - 1)]?.equity ?? p.equity),
    }))
  }, [equity, bmEquity])

  const filteredAPIs = useMemo(() =>
    DATA_APIS.filter(a => !dataSearch || a.name.toLowerCase().includes(dataSearch.toLowerCase()) || a.cat.includes(dataSearch.toLowerCase()) || a.desc.toLowerCase().includes(dataSearch.toLowerCase())),
  [dataSearch])

  const fileLang = { ts: 'TypeScript', py: 'Python', json: 'JSON', md: 'Markdown' }[activeFile.split('.').pop() ?? ''] ?? 'Text'

  const estimateBtTime = () => {
    const yr = (new Date().getFullYear() - parseInt(startDate.slice(0, 4))) + 1
    const base = walkFwd ? yr * 3 : yr * 1.5
    return Math.round(base) + '–' + Math.round(base * 2) + 's'
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', margin: '-1.5rem', width: 'calc(100% + 3rem)', background: C.bg, overflow: 'hidden' }}>

        {/* ── TOP BAR ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.4rem .75rem', borderBottom: `1px solid ${C.border}`, background: C.bg2, flexShrink: 0, height: 42 }}>
          <button onClick={() => setSideOpen(v => !v)} style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, padding: '.25rem .38rem', cursor: 'pointer', color: C.faint, display: 'flex', alignItems: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          </button>
          <button onClick={() => setAgentIconIdx(i => (i + 1) % AGENT_ICONS.length)} title="Change agent icon" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.blue2, display: 'flex', alignItems: 'center', fontSize: '1.1rem', padding: '0 .15rem' }}>
            {AGENT_ICONS[agentIconIdx]}
          </button>
          <div style={{ width: 1, height: 16, background: C.border }} />
          <input value={agentName} onChange={e => setAgentName(e.target.value)} style={{ background: 'transparent', border: 'none', outline: 'none', fontWeight: 700, fontSize: '.86rem', color: C.white, minWidth: 100, maxWidth: 220 }} />
          {grade && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', fontWeight: 700, padding: '.15rem .5rem', borderRadius: 5, background: `${gradeCLR}18`, color: gradeCLR, border: `1px solid ${gradeCLR}30` }}>{grade}</div>}
          {published && <Tag text="LIVE" color={C.mint} />}
          {!saved    && <Tag text="UNSAVED" color={C.orange} />}
          <div style={{ flex: 1 }} />
          <button onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: '.28rem', padding: '.28rem .62rem', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontFamily: 'var(--font-mono)', fontSize: '.58rem', cursor: 'pointer', fontWeight: 600 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            SAVE
          </button>
          <button onClick={() => void runBacktest()} disabled={btLoading} style={{ display: 'flex', alignItems: 'center', gap: '.35rem', padding: '.28rem .7rem', borderRadius: 6, border: 'none', background: btLoading ? `${C.blue}55` : C.blue, color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '.58rem', fontWeight: 700, cursor: btLoading ? 'not-allowed' : 'pointer' }}>
            {btLoading
              ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0"/></svg>
              : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>}
            {btLoading ? `${btElapsed}s…` : 'RUN'}
          </button>
          <button onClick={() => void handlePublish()} style={{ display: 'flex', alignItems: 'center', gap: '.28rem', padding: '.28rem .62rem', borderRadius: 6, border: `1px solid ${published ? C.mint + '45' : C.border}`, background: published ? `${C.mint}14` : 'transparent', color: published ? C.mint : C.muted, fontFamily: 'var(--font-mono)', fontSize: '.58rem', cursor: 'pointer', fontWeight: 600 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            {published ? 'LIVE' : 'PUBLISH'}
          </button>
          <div style={{ display: 'flex', borderRadius: 6, background: C.bg3, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
            {(['terminal','chat'] as const).map(mode => (
              <button key={mode} onClick={() => setBottomMode(mode)} style={{ padding: '.25rem .5rem', border: 'none', background: bottomMode === mode ? C.bg4 : 'transparent', color: bottomMode === mode ? (mode === 'chat' ? C.blue2 : C.mint) : C.faint, fontFamily: 'var(--font-mono)', fontSize: '.54rem', fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                {mode === 'chat' ? '⌘K AI' : '›_'}
              </button>
            ))}
          </div>
        </div>

        {/* ── BODY ── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* LEFT SIDEBAR */}
          {sideOpen && (
            <div style={{ width: 210, flexShrink: 0, borderRight: `1px solid ${C.border}`, background: C.bg2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

              {/* Strategy list */}
              <div style={{ borderBottom: `1px solid ${C.border}`, padding: '.45rem .65rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.3rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, letterSpacing: '.1em' }}>STRATEGIES</span>
                  <button onClick={createStrategy} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.faint, fontSize: '.85rem', lineHeight: 1, padding: '0 .15rem' }} title="New strategy">+</button>
                </div>
                {strategies.map(s => (
                  <div key={s.id} onClick={() => switchStrategy(s.id)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.22rem .38rem', borderRadius: 5, cursor: 'pointer', background: s.id === activeStrategyId ? `${C.blue}14` : 'transparent', marginBottom: '.05rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem', minWidth: 0 }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: s.id === activeStrategyId ? C.blue : C.faint, flexShrink: 0 }} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: s.id === activeStrategyId ? C.white : C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                    </div>
                    {strategies.length > 1 && (
                      <button onClick={e => { e.stopPropagation(); deleteStrategy(s.id) }}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.faint, fontSize: '.65rem', opacity: 0.6, lineHeight: 1, padding: '0 .1rem', flexShrink: 0 }}>×</button>
                    )}
                  </div>
                ))}
              </div>

              {/* File explorer */}
              <div style={{ padding: '.4rem .65rem .3rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, letterSpacing: '.1em' }}>EXPLORER</span>
                <button onClick={() => { const n = prompt('New file name (e.g. signals.ts):'); if (n) { updateFile(n, ''); openFile(n) } }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.faint, fontSize: '.85rem', lineHeight: 1 }}>+</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '.25rem .3rem' }}>
                {Object.keys(fileContents).map(name => {
                  const ext = name.split('.').pop() ?? ''
                  const clr = { ts: C.blue, py: C.mint, json: C.orange, md: C.muted }[ext] ?? C.faint
                  const isActive = activeFile === name
                  return (
                    <button key={name} onClick={() => openFile(name)} style={{ display: 'flex', alignItems: 'center', gap: '.4rem', width: '100%', padding: '.25rem .45rem', borderRadius: 5, background: isActive ? `${C.blue}12` : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', marginBottom: '.03rem' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: clr, fontWeight: 700, flexShrink: 0, width: 16 }}>{ext.toUpperCase().slice(0,2)}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.63rem', color: isActive ? C.white : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{name}</span>
                    </button>
                  )
                })}
              </div>

              {/* Upload custom data */}
              <div style={{ padding: '.45rem .65rem', borderTop: `1px solid ${C.border}` }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, letterSpacing: '.1em', marginBottom: '.3rem' }}>CUSTOM DATA</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '.35rem', padding: '.28rem .45rem', borderRadius: 6, border: `1px dashed ${C.border2}`, cursor: 'pointer', fontSize: '.58rem', color: C.muted, fontFamily: 'var(--font-mono)' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                  Upload CSV / JSON
                  <input type="file" accept=".csv,.json,.py,.ts" style={{ display: 'none' }} onChange={e => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    const reader = new FileReader()
                    reader.onload = ev => { updateFile(f.name, ev.target?.result as string ?? ''); openFile(f.name) }
                    reader.readAsText(f)
                  }} />
                </label>
              </div>

              {/* Data connections live status */}
              <div style={{ padding: '.45rem .65rem', borderTop: `1px solid ${C.border}` }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, letterSpacing: '.1em', marginBottom: '.28rem' }}>DATA CONNECTIONS</div>
                {DATA_APIS.filter(a => usedAPIIds.has(a.id)).map(api => (
                  <div key={api.id} style={{ display: 'flex', alignItems: 'center', gap: '.3rem', padding: '.15rem 0' }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.mint, animation: 'pulse 2s infinite', flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: C.mint }}>{api.name}</span>
                  </div>
                ))}
                {usedAPIIds.size === 0 && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.56rem', color: C.faint }}>No APIs detected in code</div>}
                <button onClick={() => { setRightTab('data'); }} style={{ marginTop: '.3rem', padding: '.18rem .45rem', border: `1px solid ${C.border}`, borderRadius: 5, background: 'transparent', color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '.54rem', cursor: 'pointer', width: '100%' }}>+ Add data source</button>
              </div>
            </div>
          )}

          {/* CODE EDITOR */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
            {/* File tabs */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, background: C.bg2, flexShrink: 0, overflowX: 'auto' }}>
              {openFiles.map(name => (
                <div key={name} onClick={() => setActiveFile(name)} style={{ display: 'flex', alignItems: 'center', gap: '.35rem', padding: '.35rem .75rem', cursor: 'pointer', borderRight: `1px solid ${C.border}`, background: activeFile === name ? C.bg : C.bg2, borderBottom: activeFile === name ? `2px solid ${C.blue}` : '2px solid transparent', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.63rem', color: activeFile === name ? C.white : C.faint }}>{name}</span>
                  <button onClick={e => { e.stopPropagation(); closeFile(name) }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.faint, fontSize: '.68rem', padding: '0', lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {activeFile
                ? <CodeEditor value={fileContents[activeFile] ?? ''} onChange={v => updateFile(activeFile, v)} />
                : <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '.7rem' }}>Select a file</div>
              }
            </div>
            {/* Status bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '.85rem', padding: '.18rem .85rem', background: C.bg3, borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.faint }}>{fileLang}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.faint }}>{(fileContents[activeFile] ?? '').split('\n').length} lines</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: saved ? C.faint : C.orange }}>{saved ? 'Saved' : '● Unsaved'}</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.faint }}>⌘↩ run · ⌘S save · ⌘K ai</span>
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div style={{ width: 370, flexShrink: 0, borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg2 }}>
            <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
              {(['backtest','data','docs'] as const).map(t => (
                <button key={t} onClick={() => setRightTab(t)} style={{ flex: 1, padding: '.38rem .1rem', border: 'none', borderBottom: `2px solid ${rightTab === t ? C.blue : 'transparent'}`, background: 'transparent', color: rightTab === t ? C.blue2 : C.faint, fontFamily: 'var(--font-mono)', fontSize: '.54rem', fontWeight: 700, letterSpacing: '.06em', cursor: 'pointer', textTransform: 'uppercase' }}>{t}</button>
              ))}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '.8rem' }}>

              {/* ── BACKTEST TAB ── */}
              {rightTab === 'backtest' && (
                <div>
                  {/* Time estimate */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.6rem', padding: '.35rem .6rem', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 7 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.faint }}>EST. TIME: ~{estimateBtTime()}</span>
                    {btLoading && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.orange }}>{btElapsed}s elapsed</span>}
                  </div>

                  {/* All config fields - from codebase */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.42rem', marginBottom: '.65rem' }}>
                    {Object.keys(configFields).length === 0 && (
                      <>
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.45rem', color: C.faint, letterSpacing: '.08em', marginBottom: '.22rem' }}>TEMPLATE</div>
                          <select value={String(configFields.template?.value ?? '')} onChange={e => {
                            const newFields = { ...configFields, template: { value: e.target.value, type: 'string' } }
                            updateFile('config.json', JSON.stringify(Object.fromEntries(Object.entries(newFields).map(([k, v]) => [k, v.value])), null, 2))
                          }} style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, padding: '.32rem .45rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.6rem', outline: 'none' }}>
                            {TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.45rem', color: C.faint, letterSpacing: '.08em', marginBottom: '.22rem' }}>START DATE</div>
                          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, padding: '.32rem .45rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.6rem', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.45rem', color: C.faint, letterSpacing: '.08em', marginBottom: '.22rem' }}>INITIAL CAPITAL</div>
                          <input type="number" value={initCapital} onChange={e => setInitCapital(+e.target.value)} style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, padding: '.32rem .45rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.6rem', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.45rem', color: C.faint, letterSpacing: '.08em', marginBottom: '.22rem' }}>FEE (BPS)</div>
                          <input type="number" min={0} max={100} value={feeBps} onChange={e => setFeeBps(+e.target.value)} style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, padding: '.32rem .45rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.6rem', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                      </>
                    )}
                    {Object.keys(configFields).map((key, idx) => {
                      const meta = CONFIG_FIELD_META[key]
                      const field = configFields[key]
                      const label = meta?.label ?? key.toUpperCase()
                      if (key === 'symbols' || key === 'alpha_type') return null
                      if (field.type === 'boolean') {
                        return (
                          <div key={key} style={{ gridColumn: '1 / -1' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '.35rem', cursor: 'pointer' }}>
                              <input type="checkbox" checked={Boolean(field.value)} onChange={e => {
                                const newFields = { ...configFields, [key]: { value: e.target.checked, type: 'boolean' } }
                                updateFile('config.json', JSON.stringify(Object.fromEntries(Object.entries(newFields).map(([k, v]) => [k, v.value])), null, 2))
                              }} style={{ accentColor: C.blue }} />
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: C.muted }}>{label}</span>
                            </label>
                          </div>
                        )
                      }
                      if (meta?.options) {
                        return (
                          <div key={key}>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.45rem', color: C.faint, letterSpacing: '.08em', marginBottom: '.22rem' }}>{label}</div>
                            <select value={String(field.value)} onChange={e => {
                              const newFields = { ...configFields, [key]: { value: e.target.value, type: 'string' } }
                              updateFile('config.json', JSON.stringify(Object.fromEntries(Object.entries(newFields).map(([k, v]) => [k, v.value])), null, 2))
                            }} style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, padding: '.32rem .45rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.6rem', outline: 'none' }}>
                              {Object.entries(meta.options).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                          </div>
                        )
                      }
                      if (meta?.min !== undefined && meta?.max !== undefined) {
                        return (
                          <div key={key} style={{ gridColumn: '1 / -1' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.15rem' }}>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.45rem', color: C.faint, letterSpacing: '.08em' }}>{label}</span>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: C.blue2 }}>{meta.fmt ? meta.fmt(field.value) : String(field.value)}</span>
                            </div>
                            <input type="range" min={meta.min} max={meta.max} step={meta.step ?? 1} value={Number(field.value)} onChange={e => {
                              const newFields = { ...configFields, [key]: { value: Number(e.target.value), type: 'number' } }
                              updateFile('config.json', JSON.stringify(Object.fromEntries(Object.entries(newFields).map(([k, v]) => [k, v.value])), null, 2))
                            }} style={{ width: '100%', accentColor: C.blue }} />
                          </div>
                        )
                      }
                      return (
                        <div key={key}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.45rem', color: C.faint, letterSpacing: '.08em', marginBottom: '.22rem' }}>{label}</div>
                          <input type={field.type === 'number' ? 'number' : 'text'} value={String(field.value)} onChange={e => {
                            const newVal = field.type === 'number' ? Number(e.target.value) : e.target.value
                            const newFields = { ...configFields, [key]: { value: newVal, type: field.type } }
                            updateFile('config.json', JSON.stringify(Object.fromEntries(Object.entries(newFields).map(([k, v]) => [k, v.value])), null, 2))
                          }} style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, padding: '.32rem .45rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.6rem', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                      )
                    })}
                  </div>

                  {/* Sliders */}
                  <div style={{ marginBottom: '.65rem' }}>
                    {[
                      { label: 'RISK AVERSION (λ)', value: riskAversion, min: 1, max: 20, set: setRiskAversion, fmt: (v: number) => String(v) },
                      { label: 'MAX WEIGHT / ASSET', value: maxWeight * 100, min: 5, max: 60, set: (v: number) => setMaxWeight(v / 100), fmt: (v: number) => `${v.toFixed(0)}%` },
                    ].map(s => (
                      <div key={s.label} style={{ marginBottom: '.45rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.15rem' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.45rem', color: C.faint, letterSpacing: '.08em' }}>{s.label}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: C.blue2 }}>{s.fmt(s.value)}</span>
                        </div>
                        <input type="range" min={s.min} max={s.max} value={s.value} onChange={e => s.set(+e.target.value)} style={{ width: '100%', accentColor: C.blue }} />
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '.65rem', marginBottom: '.65rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '.35rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={walkFwd} onChange={e => setWalkFwd(e.target.checked)} style={{ accentColor: C.blue }} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: C.muted }}>Walk-forward</span>
                    </label>
                  </div>

                  <button onClick={() => void runBacktest()} disabled={btLoading} style={{ width: '100%', padding: '.52rem', borderRadius: 8, border: 'none', background: btLoading ? `${C.blue}55` : C.blue, color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '.68rem', fontWeight: 700, cursor: btLoading ? 'not-allowed' : 'pointer', marginBottom: '.75rem' }}>
                    {btLoading ? `▶ Running… ${btElapsed}s` : '▶  Run Backtest  (⌘ Enter)'}
                  </button>

                  {btError && <div style={{ padding: '.55rem .7rem', background: `${C.red}08`, border: `1px solid ${C.red}20`, borderRadius: 7, color: C.red, fontFamily: 'var(--font-mono)', fontSize: '.62rem', marginBottom: '.75rem' }}>{btError}</div>}

                  {btResult && (
                    <>
                      {/* Grade banner */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.65rem', padding: '.6rem .8rem', borderRadius: 9, background: `${gradeCLR}10`, border: `1px solid ${gradeCLR}28`, marginBottom: '.75rem' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.8rem', fontWeight: 900, color: gradeCLR, lineHeight: 1 }}>{grade}</div>
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.54rem', color: gradeCLR, letterSpacing: '.08em', fontWeight: 700 }}>STRATEGY GRADE</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: C.faint }}>Score {String(btResult.score ?? 0)}/100</div>
                        </div>
                        <div style={{ flex: 1 }} />
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.82rem', fontWeight: 800, color: col(ts.cagr ?? 0) }}>{((ts.cagr ?? 0) * 100).toFixed(1)}%</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.46rem', color: C.faint }}>CAGR</div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.35rem', marginBottom: '.75rem' }}>
                        {[
                          { l: 'Total Return',  v: fP(ts.totalReturnPct ?? 0),                c: col(ts.totalReturnPct ?? 0) },
                          { l: 'Sharpe Ratio',  v: (ts.sharpeRatio ?? 0).toFixed(2),         c: (ts.sharpeRatio ?? 0) >= 1.5 ? C.mint : C.orange },
                          { l: 'Max Drawdown',  v: `${(ts.maxDrawdownPct ?? 0).toFixed(1)}%`, c: C.red },
                          { l: 'Calmar Ratio',  v: (ts.calmarRatio ?? 0).toFixed(2),         c: col(ts.calmarRatio ?? 0) },
                          { l: 'Sortino',       v: (ts.sortinoRatio ?? 0).toFixed(2),        c: C.text },
                          { l: 'Win Rate',      v: `${(ts.winRatePct ?? 0).toFixed(1)}%`,    c: (ts.winRatePct ?? 0) >= 55 ? C.mint : C.orange },
                          { l: 'Avg IC',        v: (ts.icMean ?? 0).toFixed(3),               c: C.text },
                          { l: 'Rebalances',    v: String(btResult.n_rebalances ?? '—'),     c: C.text },
                        ].map(({ l, v, c }) => <Stat key={l} label={l} value={v} color={c} />)}
                      </div>

                      {chartData.length > 1 && (
                        <div style={{ marginBottom: '.75rem' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.46rem', color: C.faint, letterSpacing: '.08em', marginBottom: '.32rem' }}>EQUITY vs BENCHMARK</div>
                          <ResponsiveContainer width="100%" height={145}>
                            <AreaChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: -22 }}>
                              <defs>
                                <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.blue} stopOpacity={0.25}/><stop offset="95%" stopColor={C.blue} stopOpacity={0}/></linearGradient>
                                <linearGradient id="bmg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.muted} stopOpacity={0.08}/><stop offset="95%" stopColor={C.muted} stopOpacity={0}/></linearGradient>
                              </defs>
                              <XAxis dataKey="date" tick={{ fill: C.faint, fontSize: 8, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                              <YAxis tick={{ fill: C.faint, fontSize: 8, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                              <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 7, fontFamily: 'var(--font-mono)', fontSize: 9 }} formatter={(v: unknown, n: unknown) => [`$${Number(v).toLocaleString()}`, n === 'strategy' ? 'Strategy' : 'Benchmark']} />
                              <Area type="monotone" dataKey="benchmark" stroke={C.muted} strokeWidth={1} fill="url(#bmg)" dot={false} />
                              <Area type="monotone" dataKey="strategy"  stroke={C.blue} strokeWidth={2} fill="url(#sg)"  dot={false} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      {icSeries.length > 1 && (
                        <div style={{ marginBottom: '.75rem' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.46rem', color: C.faint, letterSpacing: '.08em', marginBottom: '.32rem' }}>INFORMATION COEFFICIENT</div>
                          <ResponsiveContainer width="100%" height={85}>
                            <BarChart data={icSeries.filter((_, i) => i % Math.max(1, Math.floor(icSeries.length / 55)) === 0)} margin={{ top: 2, right: 2, bottom: 2, left: -22 }}>
                              <XAxis dataKey="date" tick={false} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fill: C.faint, fontSize: 8, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                              <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 7, fontFamily: 'var(--font-mono)', fontSize: 9 }} formatter={(v: unknown) => [Number(v).toFixed(3), 'IC']} />
                              <Bar dataKey="ic" fill={C.blue} opacity={0.75} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      {btResult.walk_forward && (() => {
                        const wf = btResult.walk_forward as Record<string, unknown>
                        return (
                          <div style={{ padding: '.6rem .75rem', background: `${C.purple}08`, border: `1px solid ${C.purple}22`, borderRadius: 8, marginBottom: '.6rem' }}>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: C.purple, letterSpacing: '.08em', fontWeight: 700, marginBottom: '.38rem' }}>WALK-FORWARD</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.28rem' }}>
                              {[['Windows', String(wf.nWindows ?? '—')], ['OOS Sharpe', (wf.avgTestSharpe as number ?? 0).toFixed(2)], ['Degradation', `${((wf.avgDegradation as number ?? 0) * 100).toFixed(0)}%`]].map(([l, v]) => (
                                <div key={l} style={{ textAlign: 'center' }}>
                                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.68rem', fontWeight: 700, color: C.white }}>{v}</div>
                                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.42rem', color: C.faint }}>{l}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })()}

                      {/* Full report link */}
                      <a href="/dashboard/backtest" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.35rem', padding: '.42rem', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontFamily: 'var(--font-mono)', fontSize: '.58rem', cursor: 'pointer', textDecoration: 'none', marginTop: '.1rem' }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
                        View Full Report
                      </a>
                    </>
                  )}
                </div>
              )}

              {/* ── DATA TAB ── */}
              {rightTab === 'data' && (
                <div>
                  <div style={{ display: 'flex', gap: '.3rem', marginBottom: '.6rem' }}>
                    {(['apis','ml'] as const).map(v => (
                      <button key={v} onClick={() => setDataView(v)} style={{ flex: 1, padding: '.28rem', borderRadius: 6, border: `1px solid ${dataView === v ? C.blue + '40' : C.border}`, background: dataView === v ? `${C.blue}10` : 'transparent', color: dataView === v ? C.blue2 : C.faint, fontFamily: 'var(--font-mono)', fontSize: '.54rem', fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                        {v === 'apis' ? 'Data APIs' : 'ML Tools'}
                      </button>
                    ))}
                  </div>

                  {dataView === 'apis' && (
                    <>
                      <input placeholder="Search data sources…" value={dataSearch} onChange={e => setDataSearch(e.target.value)} style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 7, padding: '.4rem .6rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.63rem', outline: 'none', marginBottom: '.6rem', boxSizing: 'border-box' }} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
                        {filteredAPIs.map(api => {
                          const isUsed = usedAPIIds.has(api.id)
                          return (
                            <div key={api.id} onClick={() => setSelAPI(selAPI?.id === api.id ? null : api)} style={{ background: selAPI?.id === api.id ? `${C.blue}10` : isUsed ? `${C.mint}07` : C.bg3, border: `1px solid ${selAPI?.id === api.id ? C.blue + '35' : isUsed ? C.mint + '30' : C.border}`, borderRadius: 9, padding: '.55rem .68rem', cursor: 'pointer', transition: 'all .12s' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.15rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
                                  {isUsed && <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.mint, animation: 'pulse 2s infinite', flexShrink: 0 }} />}
                                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', fontWeight: 700, color: isUsed ? C.mint : C.white }}>{api.name}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '.25rem' }}>
                                  <Tag text={api.cat} color={C.blue} />
                                  <Tag text={api.auth === 'none' ? 'FREE' : api.auth === 'optional' ? 'OPT' : 'KEY'} color={api.auth === 'none' ? C.mint : api.auth === 'optional' ? C.orange : C.muted} />
                                </div>
                              </div>
                              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: C.muted }}>{api.desc}</div>
                              {selAPI?.id === api.id && (
                                <div style={{ marginTop: '.5rem', paddingTop: '.5rem', borderTop: `1px solid ${C.border}` }}>
                                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, marginBottom: '.28rem' }}>Rate limit: {api.limit}</div>
                                  <div style={{ display: 'flex', gap: '.32rem' }}>
                                    <button onClick={e => { e.stopPropagation(); const loader = `data_loaders.py`; updateFile(loader, (fileContents[loader] ?? '') + `\n# ── ${api.name} ──────────────────────────────────────────────\n# Added from Data panel\n`); openFile(loader); addTerm(`✓ ${api.name} added to data_loaders.py`) }}
                                      style={{ flex: 1, padding: '.28rem', borderRadius: 5, background: C.blue, color: '#fff', border: 'none', fontFamily: 'var(--font-mono)', fontSize: '.54rem', fontWeight: 700, cursor: 'pointer' }}>Add to project</button>
                                    <button onClick={e => { e.stopPropagation(); setChatInput(`How do I use ${api.name} data for crypto alpha generation?`); setBottomMode('chat'); setTimeout(() => chatInputRef.current?.focus(), 50) }}
                                      style={{ flex: 1, padding: '.28rem', borderRadius: 5, background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, fontFamily: 'var(--font-mono)', fontSize: '.54rem', cursor: 'pointer' }}>Ask AI</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}

                  {dataView === 'ml' && (
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.faint, marginBottom: '.5rem', lineHeight: 1.65 }}>
                        Drag tools to the explorer or click to add a starter file to your project.
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
                        {ML_TOOLS.map(tool => (
                          <div key={tool.id}
                            draggable
                            onDragEnd={() => { updateFile(`${tool.id}_signals.py`, `"""${tool.name} signal generator\n${tool.desc}\n"""\n# TODO: implement\n`); openFile(`${tool.id}_signals.py`); addTerm(`✓ Created ${tool.id}_signals.py`) }}
                            onClick={() => { const fname = `${tool.id}_signals.py`; updateFile(fname, `"""${tool.name} signal generator\n${tool.desc}\n"""\n\n# pip install ${tool.id}\n# import ${tool.id === 'sklearn' ? 'sklearn' : tool.id}\n\ndef generate_ml_signals(features):\n    \"\"\"TODO: implement ${tool.name} signal logic\"\"\"\n    pass\n`); openFile(fname); addTerm(`✓ Added ${fname}`) }}
                            style={{ display: 'flex', alignItems: 'center', gap: '.55rem', padding: '.5rem .65rem', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'grab' }}>
                            <span style={{ fontSize: '1.1rem' }}>{tool.icon}</span>
                            <div>
                              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.63rem', fontWeight: 700, color: C.white, marginBottom: '.1rem' }}>{tool.name}</div>
                              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.54rem', color: C.muted }}>{tool.desc}</div>
                            </div>
                            <div style={{ marginLeft: 'auto', color: C.faint, fontSize: '.7rem' }}>⋮⋮</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── DOCS TAB ── */}
              {rightTab === 'docs' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.55rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.faint, letterSpacing: '.06em' }}>ENGINE DOCUMENTATION</span>
                    <button onClick={() => { openFile('DOCS.md') }} style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.blue2, background: 'transparent', border: 'none', cursor: 'pointer' }}>Open in editor</button>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: C.text, lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
                    <MdText text={fileContents['DOCS.md'] ?? DEFAULT_DOCS} />
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

        {/* ── BOTTOM: TERMINAL or AI CHAT ── */}
        <div style={{ height: 210, flexShrink: 0, borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column' }}>
          {/* Bottom header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', padding: '.25rem .65rem', borderBottom: `1px solid ${C.border}`, background: C.bg2, flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: '.22rem' }}>
              {[C.red, C.orange, C.mint].map(c => <div key={c} style={{ width: 7, height: 7, borderRadius: '50%', background: c, opacity: 0.75 }} />)}
            </div>
            {(['terminal','chat'] as const).map(mode => (
              <button key={mode} onClick={() => setBottomMode(mode)} style={{ padding: '.18rem .45rem', borderRadius: 5, border: `1px solid ${bottomMode === mode ? C.blue + '40' : 'transparent'}`, background: bottomMode === mode ? `${C.blue}10` : 'transparent', color: bottomMode === mode ? C.blue2 : C.faint, fontFamily: 'var(--font-mono)', fontSize: '.54rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '.04em' }}>
                {mode === 'terminal' ? 'TERMINAL' : 'AI CHAT'}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            {bottomMode === 'terminal' && <button onClick={() => setTermLines([])} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '.52rem' }}>clear</button>}
            {bottomMode === 'chat' && <button onClick={() => setChatMsgs(chatMsgs.slice(0, 1))} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '.52rem' }}>clear</button>}
          </div>

          {/* Terminal */}
          {bottomMode === 'terminal' && (
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <TerminalPanel lines={termLines} input={termInput} onInput={setTermInput} onSubmit={handleTermSubmit} loading={btLoading} />
            </div>
          )}

          {/* AI Chat */}
          {bottomMode === 'chat' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>
              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '.5rem .75rem', display: 'flex', flexDirection: 'column', gap: '.45rem' }}>
                {chatMsgs.map((m, i) => (
                  <div key={i} style={{ display: 'flex', gap: '.4rem', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    {m.role === 'ai' && (
                      <div style={{ width: 20, height: 20, borderRadius: 6, background: `${C.blue}20`, border: `1px solid ${C.blue}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '.05rem' }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.blue2} strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
                      </div>
                    )}
                    <div style={{ maxWidth: '88%', padding: '.4rem .6rem', borderRadius: m.role === 'user' ? '9px 9px 2px 9px' : '9px 9px 9px 2px', background: m.role === 'user' ? `${C.blue}20` : C.bg3, border: `1px solid ${m.role === 'user' ? C.blue + '28' : C.border}`, fontFamily: 'var(--font-mono)', fontSize: '.63rem', color: C.text, lineHeight: 1.6, maxHeight: 160, overflowY: 'auto' }}>
                      {m.role === 'ai' ? <MdText text={m.text} onApply={applyEdit} /> : <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span>}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div style={{ display: 'flex', gap: '.28rem', paddingLeft: '.4rem' }}>
                    {[0,1,2].map(j => <div key={j} style={{ width: 4, height: 4, borderRadius: '50%', background: C.blue, opacity: 0.6, animation: `bounce ${0.6 + j * 0.15}s ease-in-out infinite` }} />)}
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              {/* Quick prompts */}
              <div style={{ display: 'flex', gap: '.28rem', overflowX: 'auto', padding: '0 .65rem .28rem', flexShrink: 0 }}>
                {['Improve Sharpe', 'Add NUPL signal', 'Reduce drawdown', 'Explain results', 'Optimize λ'].map(s => (
                  <button key={s} onClick={() => { setChatInput(s); chatInputRef.current?.focus() }} style={{ padding: '.15rem .42rem', borderRadius: 20, border: `1px solid ${C.border}`, background: 'transparent', color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '.52rem', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>{s}</button>
                ))}
              </div>
              {/* Input */}
              <div style={{ display: 'flex', gap: '.32rem', borderTop: `1px solid ${C.border}`, padding: '.35rem .65rem', alignItems: 'flex-end', flexShrink: 0 }}>
                <textarea ref={chatInputRef} value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendChat() } }} placeholder="Ask AI about your strategy… (Enter to send, Shift+Enter for newline)" rows={1} style={{ flex: 1, background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 7, padding: '.38rem .58rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.63rem', outline: 'none', resize: 'none', lineHeight: 1.5, maxHeight: 80, overflowY: 'auto' }} />
                <button onClick={() => void sendChat()} disabled={!chatInput.trim() || chatLoading} style={{ padding: '.38rem .5rem', borderRadius: 7, background: chatInput.trim() ? C.blue : `${C.blue}40`, border: 'none', color: '#fff', cursor: chatInput.trim() ? 'pointer' : 'default', alignSelf: 'flex-end', flexShrink: 0 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin   { to { transform: rotate(360deg) } }
        @keyframes bounce { 0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)} }
        @keyframes pulse  { 0%,100%{opacity:1}50%{opacity:.3} }
      `}</style>
    </>
  )
}
