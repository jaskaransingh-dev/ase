/**
 * lib/quant-docs.ts
 *
 * THE single editable source-of-truth for all ASE quant documentation.
 *
 * This file is consumed by:
 *  - app/dashboard/build/docs/page.tsx   → renders the docs UI
 *  - app/api/ai/chat/route.ts            → injects into AI system prompt
 *  - lib/market-data.ts                  → source registry
 *
 * Structure:
 *  - quantDocs.hero (page header & badges)
 *  - quantDocs.sections (all docs sections with content)
 *  - quantDocs.examples (4 reference strategy examples)
 *  - quantDocs.metrics (core performance metrics)
 *  - quantDocs.dataSources (crypto data sources)
 *  - quantDocs.indicators (technical indicators)
 */

// ─── Hero Configuration ───────────────────────────────────────────────────────────────

export interface Badge {
  label: string
  color: string
}

export const quantDocs = {
  hero: {
    title: 'Quant Builder Docs',
    subtitle: 'Crypto agent strategy reference for ASE. Build portfolio-aware agents that return BUY, SELL, or HOLD decisions and produce auditable ledger events.',
    badges: [
      { label: 'Crypto Only', color: '#16C784' },
      { label: 'Portfolio Aware', color: '#4F8CFF' },
      { label: 'Ledger-Based', color: '#8B5CF6' },
      { label: 'Standardized Backtests', color: '#F5B942' },
      { label: 'No Exchange Keys Required', color: '#22F0B5' },
    ] as Badge[],
  },

  sections: [
    {
      id: 'overview',
      title: 'Overview',
      description: 'How ASE strategies work end to end.',
    },
    {
      id: 'strategy-api',
      title: 'Strategy API',
      description: 'The exact contract every strategy must implement.',
    },
    {
      id: 'portfolio-context',
      title: 'Portfolio Context',
      description: 'What your agent knows about current holdings and equity.',
    },
    {
      id: 'market-data',
      title: 'Market Data',
      description: 'Crypto data fields and source notes.',
    },
    {
      id: 'indicators',
      title: 'Indicators',
      description: 'Common features available to strategy authors.',
    },
    {
      id: 'decision-model',
      title: 'Decision Model',
      description: 'How BUY, SELL, and HOLD are interpreted.',
    },
    {
      id: 'ledger-execution',
      title: 'Ledger & Execution',
      description: 'How decisions become auditable events.',
    },
    {
      id: 'validation-backtests',
      title: 'Validation & Backtests',
      description: 'How ASE evaluates strategies without exposing private internals.',
    },
    {
      id: 'metrics-publish-rules',
      title: 'Metrics & Publish Rules',
      description: 'Performance interpretation and publish guidance.',
    },
    {
      id: 'examples',
      title: 'Examples',
      description: 'Reference strategies and sample outputs.',
    },
  ],
}

// ─── Data Sources ───────────────────────────────────────────────────────────────

export interface DataSource {
  id: string
  name: string
  badge: string
  badgeColor: string
  noKey: boolean
  description: string
  endpoint: string
  rateLimit: string
  historyDepth: string
  assetClasses: string[]
  symbols: string[]
  intervals: string[]
  dataFields: string[]
  fetchExample: string
}

export const DATA_SOURCES: DataSource[] = [
  {
    id: 'binance',
    name: 'Binance',
    badge: 'PRIMARY · CRYPTO',
    badgeColor: '#F0B90B',
    noKey: true,
    description: 'World\'s largest crypto exchange. Used as the primary source for all crypto OHLCV data. Zero authentication required for public market data endpoints. Returns up to 1000 candles per request at any interval.',
    endpoint: 'https://api.binance.com/api/v3/klines',
    rateLimit: '1,200 req/min (IP)',
    historyDepth: '5+ years of daily data',
    assetClasses: ['crypto'],
    symbols: ['BTC-USD','ETH-USD','SOL-USD','BNB-USD','XRP-USD','ADA-USD','DOGE-USD','AVAX-USD','MATIC-USD','LINK-USD','UNI-USD','DOT-USD','ATOM-USD','LTC-USD','SHIB-USD','APT-USD','ARB-USD','OP-USD'],
    intervals: ['1m','3m','5m','15m','30m','1h','2h','4h','6h','12h','1d','3d','1w','1M'],
    dataFields: ['timestamp','open','high','low','close','volume','quote_volume','trade_count','taker_buy_volume'],
    fetchExample: `// No API key needed — public endpoint
const res = await fetch(
  'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=365'
)
const candles = await res.json()
// Each candle: [openTime, open, high, low, close, volume, closeTime, ...]
// Example: [1704067200000, "42000.5", "43100.0", "41800.0", "42900.0", "1234.56", ...]

// Available symbols: any USDT pair (ETHUSDT, SOLUSDT, etc.)
// Available intervals: 1m 3m 5m 15m 30m 1h 2h 4h 6h 12h 1d 3d 1w 1M`,
  },
  {
    id: 'kraken',
    name: 'Kraken',
    badge: 'CRYPTO · RELIABLE',
    badgeColor: '#8B5CF6',
    noKey: true,
    description: 'Professional crypto exchange with clean public OHLC API. Excellent reliability and data quality. Used as a fallback or comparison source for supported assets.',
    endpoint: 'https://api.kraken.com/0/public/OHLC',
    rateLimit: '1 req/s (conservative)',
    historyDepth: '5+ years',
    assetClasses: ['crypto'],
    symbols: ['XXBTZUSD (BTC)','XETHZUSD (ETH)','SOLUSDT','XLTCZUSD (LTC)','XXRPZUSD (XRP)','ADAUSD','DOTUSD','LINKUSD'],
    intervals: ['1','5','15','30','60','240','1440','10080','21600'],
    dataFields: ['time','open','high','low','close','vwap','volume','count'],
    fetchExample: `// Fetch BTC/USD daily candles — no key needed
const res  = await fetch(
  'https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440'
)
const json = await res.json()
const bars = json.result['XXBTZUSD'].map((k: number[]) => ({
  time:   new Date(k[0] * 1000).toISOString(),
  open:   parseFloat(k[1].toString()),
  high:   parseFloat(k[2].toString()),
  low:    parseFloat(k[3].toString()),
  close:  parseFloat(k[4].toString()),
  vwap:   parseFloat(k[5].toString()),
  volume: parseFloat(k[6].toString()),
}))
// Intervals (minutes): 1, 5, 15, 30, 60, 240, 1440 (1d), 10080 (1w), 21600 (15d)`,
  },
  {
    id: 'coingecko',
    name: 'CoinGecko',
    badge: 'CRYPTO · FUNDAMENTALS',
    badgeColor: '#22F0B5',
    noKey: true,
    description: 'Comprehensive crypto market data covering 10,000+ coins. Free tier requires no API key. Used for broad crypto asset coverage and supplemental market information.',
    endpoint: 'https://api.coingecko.com/api/v3',
    rateLimit: '10–50 req/min (free tier)',
    historyDepth: 'Full history for major coins',
    assetClasses: ['crypto'],
    symbols: ['bitcoin','ethereum','solana','binancecoin','ripple','cardano','dogecoin','polkadot','matic-network','chainlink','uniswap','avalanche-2','cosmos','litecoin'],
    intervals: ['daily (OHLC)'],
    dataFields: ['timestamp','open','high','low','close','market_cap','total_volume','price_change_pct'],
    fetchExample: `// Fetch BTC OHLC — no API key needed
const res  = await fetch(
  'https://api.coingecko.com/api/v3/coins/bitcoin/ohlc?vs_currency=usd&days=90'
)
const data = await res.json()
// [[timestamp_ms, open, high, low, close], ...]

// Market cap + volume history (200 days)
const mktRes  = await fetch(
  'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=200&interval=daily'
)
const mktData = await mktRes.json()
// { prices: [[ts,price],...], market_caps: [[ts,cap],...], total_volumes: [[ts,vol],...] }

// Coin IDs: bitcoin, ethereum, solana, binancecoin, ripple, cardano, etc.`,
  },
]

// ─── Technical Indicators ─────────────────────────────────────────────────────

export interface Indicator {
  id: string
  name: string
  abbrev: string
  category: 'trend' | 'momentum' | 'volatility' | 'volume' | 'oscillator'
  description: string
  formula: string
  parameters: { name: string; default: number; description: string }[]
  signals: string[]
  code: string
}

export const INDICATORS: Indicator[] = [
  {
    id: 'ema',
    name: 'Exponential Moving Average',
    abbrev: 'EMA',
    category: 'trend',
    description: 'Weighted moving average that places greater emphasis on recent prices. Reacts faster to price changes than SMA. Used for trend direction and crossover signals.',
    formula: 'EMA_t = α × P_t + (1−α) × EMA_{t−1}   where  α = 2 / (span + 1)',
    parameters: [
      { name: 'span', default: 20, description: 'Number of periods (smoothing window)' },
    ],
    signals: ['Golden cross (fast EMA > slow EMA) → bullish','Death cross (fast EMA < slow EMA) → bearish','Price above EMA → uptrend confirmation'],
    code: `# Single EMA
df['ema_20'] = df['close'].ewm(span=20, adjust=False).mean()

# Dual EMA crossover
df['ema_fast'] = df['close'].ewm(span=12, adjust=False).mean()
df['ema_slow'] = df['close'].ewm(span=26, adjust=False).mean()
golden_cross = (df['ema_fast'] > df['ema_slow']) & (df['ema_fast'].shift(1) <= df['ema_slow'].shift(1))
death_cross  = (df['ema_fast'] < df['ema_slow']) & (df['ema_fast'].shift(1) >= df['ema_slow'].shift(1))`,
  },
  {
    id: 'sma',
    name: 'Simple Moving Average',
    abbrev: 'SMA',
    category: 'trend',
    description: 'Equal-weight average of the last N closes. Smoother than EMA, slower to react. Classic support/resistance levels at 50-day, 100-day, and 200-day MAs.',
    formula: 'SMA_t = (P_{t} + P_{t-1} + ... + P_{t-N+1}) / N',
    parameters: [
      { name: 'window', default: 50, description: 'Lookback period in bars' },
    ],
    signals: ['Price above 200-day SMA → long-term uptrend','50-day SMA > 200-day SMA (Golden Cross) → bull market','Price bounce off SMA → dynamic support/resistance'],
    code: `df['sma_50']  = df['close'].rolling(50).mean()
df['sma_200'] = df['close'].rolling(200).mean()

# Distance from 200-day as a mean-reversion signal
df['pct_from_200'] = (df['close'] - df['sma_200']) / df['sma_200'] * 100`,
  },
  {
    id: 'rsi',
    name: 'Relative Strength Index',
    abbrev: 'RSI',
    category: 'oscillator',
    description: 'Momentum oscillator measuring speed/magnitude of price changes. Ranges 0–100. Classic oversold/overbought levels at 30/70. Divergences signal potential reversals.',
    formula: 'RSI = 100 − 100 / (1 + RS)   where  RS = avg_gain(N) / avg_loss(N)',
    parameters: [
      { name: 'period', default: 14, description: 'Lookback for average gain/loss calculation' },
    ],
    signals: ['RSI < 30 → oversold, potential buy','RSI > 70 → overbought, potential sell','Bullish divergence (price makes lower low, RSI makes higher low) → reversal signal'],
    code: `delta = df['close'].diff()
gain  = delta.clip(lower=0).ewm(com=13, adjust=False).mean()   # Wilder smoothing
loss  = (-delta.clip(upper=0)).ewm(com=13, adjust=False).mean()
df['rsi'] = 100 - (100 / (1 + gain / loss))

# Overbought/oversold signals
df['rsi_signal'] = 0
df.loc[df['rsi'] < 30, 'rsi_signal'] =  1  # oversold
df.loc[df['rsi'] > 70, 'rsi_signal'] = -1  # overbought`,
  },
  {
    id: 'macd',
    name: 'MACD — Moving Average Convergence/Divergence',
    abbrev: 'MACD',
    category: 'momentum',
    description: 'Trend-following momentum indicator showing the relationship between two EMAs. Three components: MACD line, signal line, and histogram. Cross above signal line = bullish.',
    formula: 'MACD = EMA(12) − EMA(26)\nSignal = EMA(MACD, 9)\nHistogram = MACD − Signal',
    parameters: [
      { name: 'fast', default: 12, description: 'Fast EMA period' },
      { name: 'slow', default: 26, description: 'Slow EMA period' },
      { name: 'signal', default: 9, description: 'Signal line EMA period' },
    ],
    signals: ['MACD crosses above signal line → bullish','MACD crosses below signal line → bearish','Histogram expanding → momentum increasing'],
    code: `ema_fast     = df['close'].ewm(span=12, adjust=False).mean()
ema_slow     = df['close'].ewm(span=26, adjust=False).mean()
df['macd']   = ema_fast - ema_slow
df['signal'] = df['macd'].ewm(span=9, adjust=False).mean()
df['hist']   = df['macd'] - df['signal']

# Cross signals
cross_up   = (df['macd'] > df['signal']) & (df['macd'].shift(1) <= df['signal'].shift(1))
cross_down = (df['macd'] < df['signal']) & (df['macd'].shift(1) >= df['signal'].shift(1))`,
  },
  {
    id: 'bb',
    name: 'Bollinger Bands',
    abbrev: 'BB',
    category: 'volatility',
    description: 'Volatility bands placed N standard deviations above and below a moving average. Bands contract during low volatility (squeeze) and expand during high volatility. Price tends to revert to the mean.',
    formula: 'Middle = SMA(N)\nUpper  = Middle + k × σ(N)\nLower  = Middle − k × σ(N)',
    parameters: [
      { name: 'window', default: 20, description: 'SMA and std period' },
      { name: 'k', default: 2, description: 'Standard deviation multiplier' },
    ],
    signals: ['Price touches lower band → potential long (mean reversion)','Price touches upper band → potential short (mean reversion)','Squeeze (bands narrow) → low volatility, big move incoming','%B = (close − lower) / (upper − lower): 0=at lower, 1=at upper'],
    code: `sma = df['close'].rolling(20).mean()
std = df['close'].rolling(20).std()
df['bb_upper']  = sma + 2 * std
df['bb_middle'] = sma
df['bb_lower']  = sma - 2 * std
df['bb_pct']    = (df['close'] - df['bb_lower']) / (df['bb_upper'] - df['bb_lower'])
df['bb_width']  = (df['bb_upper'] - df['bb_lower']) / df['bb_middle']  # squeeze indicator`,
  },
  {
    id: 'atr',
    name: 'Average True Range',
    abbrev: 'ATR',
    category: 'volatility',
    description: 'Measures market volatility by averaging the True Range over N periods. True Range is the largest of: (high−low), |high−prev_close|, |low−prev_close|. Used for position sizing, stop placement, and breakout confirmation.',
    formula: 'TR  = max(H−L, |H−C_{prev}|, |L−C_{prev}|)\nATR = EMA(TR, N)',
    parameters: [
      { name: 'period', default: 14, description: 'Smoothing period for TR average' },
    ],
    signals: ['ATR rising → volatility expanding, widen stops','ATR falling → volatility contracting, tighten stops','Position size = Risk per trade / (ATR × multiplier)'],
    code: `df['tr'] = pd.concat([
    df['high'] - df['low'],
    (df['high'] - df['close'].shift(1)).abs(),
    (df['low']  - df['close'].shift(1)).abs()
], axis=1).max(axis=1)
df['atr'] = df['tr'].ewm(com=13, adjust=False).mean()  # Wilder smoothing

# ATR-based trailing stop
df['trailing_stop'] = df['close'] - 2.5 * df['atr']`,
  },
  {
    id: 'adx',
    name: 'Average Directional Index',
    abbrev: 'ADX',
    category: 'trend',
    description: 'Measures trend strength (not direction). ADX > 25 indicates a strong trend; < 20 indicates a ranging market. Paired with +DI and −DI directional indicators to determine trend direction.',
    formula: 'ADX = EMA(|+DI − −DI| / (+DI + −DI) × 100, N)',
    parameters: [
      { name: 'period', default: 14, description: 'DI and ADX smoothing period' },
    ],
    signals: ['ADX > 25 → strong trend (trade with trend)','ADX < 20 → weak trend / range (trade mean reversion)','+DI > −DI → upward trend direction','ADX rising AND +DI > −DI → strong uptrend, hold long'],
    code: `high, low, close = df['high'], df['low'], df['close']
tr   = pd.concat([high-low, (high-close.shift()).abs(), (low-close.shift()).abs()], axis=1).max(1)
dm_p = (high - high.shift()).clip(lower=0).where((high-high.shift()) > (low.shift()-low), 0)
dm_m = (low.shift() - low).clip(lower=0).where((low.shift()-low) > (high-high.shift()), 0)
atr14 = tr.ewm(com=13, adjust=False).mean()
di_p = 100 * dm_p.ewm(com=13, adjust=False).mean() / atr14
di_m = 100 * dm_m.ewm(com=13, adjust=False).mean() / atr14
dx = 100 * (di_p - di_m).abs() / (di_p + di_m)
df['adx'] = dx.ewm(com=13, adjust=False).mean()`,
  },
  {
    id: 'vwap',
    name: 'Volume-Weighted Average Price',
    abbrev: 'VWAP',
    category: 'volume',
    description: 'Average price weighted by volume. Reset at the start of each trading session. Primary benchmark for institutional execution. Price above VWAP = bullish intraday bias; below = bearish. Commonly used for intraday mean reversion.',
    formula: 'VWAP = Σ(Typical_Price × Volume) / Σ(Volume)\nTP = (High + Low + Close) / 3',
    parameters: [
      { name: 'session', default: 1, description: 'Reset VWAP per session (1) or rolling (0)' },
    ],
    signals: ['Price crosses above VWAP → bullish intraday','Price crosses below VWAP → bearish intraday','Large price-VWAP deviation → mean reversion entry'],
    code: `df['tp']    = (df['high'] + df['low'] + df['close']) / 3
df['vwap']  = (df['tp'] * df['volume']).cumsum() / df['volume'].cumsum()
df['vwap_dev'] = (df['close'] - df['vwap']) / df['vwap'] * 100  # % deviation`,
  },
  {
    id: 'stoch',
    name: 'Stochastic Oscillator',
    abbrev: 'STOCH',
    category: 'oscillator',
    description: 'Compares close to the high-low range over N periods. Ranges 0–100. Slower %D line smooths %K. Readings above 80 are overbought; below 20 are oversold. Cross of %K over %D generates signals.',
    formula: '%K = (Close − LoN) / (HiN − LoN) × 100\n%D = SMA(%K, 3)',
    parameters: [
      { name: 'k_period', default: 14, description: 'Fast %K lookback period' },
      { name: 'd_period', default: 3, description: 'Slow %D smoothing period' },
    ],
    signals: ['%K crosses above %D below 20 → bullish','%K crosses below %D above 80 → bearish','Divergence with price → reversal signal'],
    code: `lo_n = df['low'].rolling(14).min()
hi_n = df['high'].rolling(14).max()
df['stoch_k'] = 100 * (df['close'] - lo_n) / (hi_n - lo_n)
df['stoch_d'] = df['stoch_k'].rolling(3).mean()

# Cross signals
k_cross_up = (df['stoch_k'] > df['stoch_d']) & (df['stoch_k'].shift(1) <= df['stoch_d'].shift(1))`,
  },
  {
    id: 'obv',
    name: 'On-Balance Volume',
    abbrev: 'OBV',
    category: 'volume',
    description: 'Cumulative volume indicator. Adds volume on up days, subtracts on down days. OBV trending up confirms price uptrend. Divergence between OBV and price often precedes reversal.',
    formula: 'OBV_t = OBV_{t-1} + (Volume if Close > Close_{t-1} else −Volume)',
    parameters: [],
    signals: ['OBV rising with price → trend confirmed by volume','OBV diverging from price → potential reversal','OBV breakout before price breakout → leading indicator'],
    code: `direction     = np.sign(df['close'].diff()).fillna(0)
df['obv']     = (direction * df['volume']).cumsum()
df['obv_ema'] = df['obv'].ewm(span=20).mean()   # smoothed OBV trend
df['obv_div'] = df['obv'] - df['obv_ema']        # divergence from trend`,
  },
]

// ─── Strategy API Contract ────────────────────────────────────────────────────

export const STRATEGY_API_CODE = `export type Decision = 'BUY' | 'SELL' | 'HOLD'

export type AssetDecision = {
  asset: string
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

export type StrategyConfig = {
  name: string
  version: string
  universe: string[]
  rebalanceFreq: 'daily' | 'weekly' | 'monthly'
  longOnly: boolean
  maxPositionPct: number
  maxNewPositionsPerRun: number
  minCashPct: number
}

export type StrategyContext = {
  features: FeatureRow[]
  portfolio: PortfolioState
}

export interface StrategyModule {
  config: StrategyConfig
  evaluate(context: StrategyContext): StrategyOutput
}`

// ─── Portfolio Context ────────────────────────────────────────────────

export const PORTFOLIO_CONTEXT_CODE = `export type Position = {
  asset: string
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
}`

// ─── Ledger Event Schema ────────────────────────────────────────────────

export const LEDGER_SCHEMA_CODE = `export type LedgerEvent = {
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

// Common status meanings:
//   EXECUTED: request was applied as intended
//   PARTIAL: request was only partly filled under constraints
//   SKIPPED: request was valid but resulted in no change
//   REJECTED: request could not be processed`

// ─── Strategy Examples ────────────────────────────────────────────

export interface StrategyExample {
  id: string
  name: string
  description: string
  whenItWorks: string
  whenItFails: string
  code: string
  sampleOutput: string
}

export const STRATEGY_EXAMPLES: StrategyExample[] = [
  {
    id: 'momentum-with-trend',
    name: 'Momentum with Trend Filter',
    description: 'Uses medium-term returns and moving-average confirmation to increase exposure only when trend and momentum align.',
    whenItWorks: 'Trending markets with strong directional momentum. Works well in crypto bull runs and clear trending phases.',
    whenItFails: 'Choppy, ranging markets where trend signals flip frequently. Mean reversion during trend reversals.',
    code: `import pandas as pd
import numpy as np

def evaluate(context):
    features = context['features']
    portfolio = context['portfolio']
    
    decisions = []
    
    for feat in features:
        asset = feat['asset']
        price = feat['close']
        returns_20d = feat.get('returns_20d', 0)
        sma_50 = feat.get('sma_50', price)
        sma_200 = feat.get('sma_200', price)
        
        # Current position weight
        current_weight = 0
        for pos in portfolio['positions']:
            if pos['asset'] == asset:
                current_weight = pos['weight']
                break
        
        # Trend filter: price above 200-day SMA
        in_uptrend = price > sma_200
        
        # Momentum: 20d return > 0
        has_momentum = returns_20d > 0
        
        # Only buy when trend is up AND momentum positive
        if in_uptrend and has_momentum:
            # Add to position if underweight
            target = 0.20  # 20% target
            if current_weight < target:
                decisions.append({
                    'asset': asset,
                    'decision': 'BUY',
                    'conviction': 0.75,
                    'targetPositionPct': target,
                    'thesis': 'Momentum positive and price above 200-day SMA'
                })
        elif current_weight > 0:
            # Exit if trend breaks
            if price < sma_200 * 0.95:
                decisions.append({
                    'asset': asset,
                    'decision': 'SELL',
                    'conviction': 0.85,
                    'targetPositionPct': 0,
                    'thesis': 'Trend broken — price below 200-day SMA'
                })
            elif not has_momentum:
                # Trim if momentum weakens but trend intact
                decisions.append({
                    'asset': asset,
                    'decision': 'SELL',
                    'conviction': 0.5,
                    'targetPositionPct': current_weight * 0.5,
                    'thesis': 'Momentum softened — reducing exposure'
                })
        else:
            decisions.append({
                'asset': asset,
                'decision': 'HOLD',
                'conviction': 0,
                'thesis': 'No signal — waiting for alignment'
            })
    
    return {
        'timestamp': features[0]['timestamp'],
        'decisions': decisions
    }`,
    sampleOutput: `{
  "timestamp": "2024-01-15T00:00:00Z",
  "decisions": [
    {
      "asset": "BTC-USD",
      "decision": "BUY",
      "conviction": 0.75,
      "targetPositionPct": 0.20,
      "thesis": "Momentum positive and price above 200-day SMA"
    },
    {
      "asset": "ETH-USD",
      "decision": "HOLD",
      "conviction": 0,
      "thesis": "No signal — waiting for alignment"
    }
  ]
}`,
  },
  {
    id: 'mean-reversion-aware',
    name: 'Mean Reversion with Position Awareness',
    description: 'Buys oversold pullbacks only when the portfolio is underweight and risk conditions are acceptable.',
    whenItWorks: 'Range-bound markets, consolidating phases, crypto volatility compressions.',
    whenItFails: 'Strong trending markets where oversold conditions continue to worsen. May buy the dip in a downtrend.',
    code: `import pandas as pd
import numpy as np

def evaluate(context):
    features = context['features']
    portfolio = context['portfolio']
    
    decisions = []
    
    # Calculate portfolio-level risk
    drawdown = portfolio.get('drawdownPct', 0)
    
    for feat in features:
        asset = feat['asset']
        price = feat['close']
        rsi = feat.get('rsi_14', 50)
        
        # Get current position
        current_weight = 0
        for pos in portfolio['positions']:
            if pos['asset'] == asset:
                current_weight = pos['weight']
                break
        
        # Only buy if oversold and portfolio not in high drawdown
        oversold = rsi < 35
        acceptable_risk = drawdown < 0.15  # < 15% drawdown
        
        if oversold and acceptable_risk and current_weight < 0.15:
            # Underweight — add position
            target = 0.15
            decisions.append({
                'asset': asset,
                'decision': 'BUY',
                'conviction': 0.7,
                'targetPositionPct': target,
                'thesis': f'RSI oversold at {rsi:.0f}, position underweight'
            })
        elif rsi > 65 and current_weight > 0:
            # Overbought — trim/exit
            decisions.append({
                'asset': asset,
                'decision': 'SELL',
                'conviction': 0.8,
                'targetPositionPct': 0,
                'thesis': f'RSI overbought at {rsi:.0f}'
            })
        elif drawdown >= 0.20:
            # High drawdown — reduce all exposure
            decisions.append({
                'asset': asset,
                'decision': 'SELL',
                'conviction': 0.9,
                'targetPositionPct': current_weight * 0.5,
                'thesis': f'Portfolio drawdown elevated at {drawdown*100:.0f}% — reducing risk'
            })
        else:
            decisions.append({
                'asset': asset,
                'decision': 'HOLD',
                'conviction': 0.3,
                'thesis': 'Signal neutral'
            })
    
    return {
        'timestamp': features[0]['timestamp'],
        'decisions': decisions
    }`,
    sampleOutput: `{
  "timestamp": "2024-01-15T00:00:00Z",
  "decisions": [
    {
      "asset": "SOL-USD",
      "decision": "BUY",
      "conviction": 0.7,
      "targetPositionPct": 0.15,
      "thesis": "RSI oversold at 28, position underweight"
    }
  ]
}`,
  },
  {
    id: 'breakout-volatility-cap',
    name: 'Breakout with Volatility Cap',
    description: 'Adds exposure during range breaks but limits position size when volatility expands.',
    whenItWorks: 'Volatile crypto markets with clear range breaks. Captures large moves after consolidation.',
    whenItFails: 'False breakouts in ranging markets. Tight ranges with low volume.',
    code: `import pandas as pd
import numpy as np

def evaluate(context):
    features = context['features']
    portfolio = context['portfolio']
    
    decisions = []
    
    for feat in features:
        asset = feat['asset']
        price = feat['close']
        high_20 = feat.get('high_20', price)
        atr = feat.get('atr_14', 0)
        atr_pct = atr / price  # ATR as % of price
        
        # Current position
        current_weight = 0
        for pos in portfolio['positions']:
            if pos['asset'] == asset:
                current_weight = pos['weight']
                break
        
        # Breakout: price breaks 20-day high
        breakout = price > high_20
        
        # Volatility cap: cap position at 10% if ATR > 5%
        max_position = 0.10 if atr_pct > 0.05 else 0.20
        
        if breakout and current_weight < max_position:
            decisions.append({
                'asset': asset,
                'decision': 'BUY',
                'conviction': 0.8,
                'targetPositionPct': max_position,
                'thesis': f'Breakout above 20d high, volatility {atr_pct*100:.1f}%'
            })
        elif not breakout and current_weight > 0:
            # Exit if range breaks fail
            decisions.append({
                'asset': asset,
                'decision': 'SELL',
                'conviction': 0.6,
                'targetPositionPct': 0,
                'thesis': 'Range breakout failed'
            })
        else:
            decisions.append({
                'asset': asset,
                'decision': 'HOLD',
                'conviction': 0,
                'thesis': 'Waiting for breakout'
            })
    
    return {
        'timestamp': features[0]['timestamp'],
        'decisions': decisions
    }`,
    sampleOutput: `{
  "timestamp": "2024-01-15T00:00:00Z",
  "decisions": [
    {
      "asset": "BTC-USD",
      "decision": "BUY",
      "conviction": 0.8,
      "targetPositionPct": 0.10,
      "thesis": "Breakout above 20d high, volatility 6.2%"
    }
  ]
}`,
  },
  {
    id: 'relative-strength-rotation',
    name: 'Relative Strength Rotation',
    description: 'Ranks a small crypto universe and allocates toward the strongest candidates while enforcing diversification rules.',
    whenItWorks: 'Bull markets with leadership rotation. Works well in crypto market cycles.',
    whenItFails: 'Bear markets where everything declines. Highly correlated moves.',
    code: `import pandas as pd
import numpy as np

def evaluate(context):
    features = context['features']
    portfolio = context['portfolio']
    
    # Score all assets by momentum
    scores = []
    for feat in features:
        returns_20d = feat.get('returns_20d', 0)
        volatility = feat.get('vol_20d', 0.01)
        # Risk-adjusted momentum
        score = returns_20d / (volatility + 0.001)
        scores.append({
            'asset': feat['asset'],
            'score': score,
            'returns_20d': returns_20d,
            'price': feat['close']
        })
    
    # Rank by score
    scores.sort(key=lambda x: x['score'], reverse=True)
    
    # Current portfolio positions
    current_positions = {pos['asset']: pos['weight'] 
                    for pos in portfolio['positions']}
    
    decisions = []
    top_n = 3  # Top 3 positions
    position_size = 0.20  # 20% each
    
    for i, item in enumerate(scores):
        asset = item['asset']
        current_w = current_positions.get(asset, 0)
        
        if i < top_n:
            # Top performers — add/keep
            if current_w < position_size:
                decisions.append({
                    'asset': asset,
                    'decision': 'BUY',
                    'conviction': 0.8,
                    'targetPositionPct': position_size,
                    'thesis': f'Rank #{i+1} by momentum, score {item["score"]:.2f}'
                })
        else:
            # Lower performers — exit
            if current_w > 0:
                decisions.append({
                    'asset': asset,
                    'decision': 'SELL',
                    'conviction': 0.7,
                    'targetPositionPct': 0,
                    'thesis': f'Rank #{i+1} — rotating out'
                })
    
    return {
        'timestamp': features[0]['timestamp'],
        'decisions': decisions
    }`,
    sampleOutput: `{
  "timestamp": "2024-01-15T00:00:00Z",
  "decisions": [
    {
      "asset": "SOL-USD",
      "decision": "BUY",
      "conviction": 0.8,
      "targetPositionPct": 0.20,
      "thesis": "Rank #1 by momentum, score 3.42"
    },
    {
      "asset": "ETH-USD",
      "decision": "BUY",
      "conviction": 0.8,
      "targetPositionPct": 0.20,
      "thesis": "Rank #2 by momentum, score 2.18"
    },
    {
      "asset": "BNB-USD",
      "decision": "SELL",
      "conviction": 0.7,
      "targetPositionPct": 0,
      "thesis": "Rank #6 — rotating out"
    }
  ]
}`,
  },
]

// ─── Risk Metrics ─────────────────────────────────────────────────────────

export interface RiskMetric {
  id: string
  name: string
  abbrev: string
  category: 'return' | 'risk' | 'ratio' | 'trade'
  description: string
  formula: string
  interpretation: string
  goodRange: string
  code: string
}

export const RISK_METRICS: RiskMetric[] = [
  {
    id: 'sharpe',
    name: 'Sharpe Ratio',
    abbrev: 'Sharpe',
    category: 'ratio',
    description: 'Risk-adjusted return measure. Divides excess return over the risk-free rate by return volatility. Most widely used single metric for strategy quality.',
    formula: 'Sharpe = (R_p − R_f) / σ_p\nAnnualized: √252 × mean(daily_excess) / std(daily_excess)',
    interpretation: '< 0.5 = poor | 0.5–1.0 = acceptable | 1.0–2.0 = good | > 2.0 = excellent',
    goodRange: '≥ 1.0 for publication; ≥ 1.5 for live trading',
    code: `daily_returns = df['equity'].pct_change().dropna()
risk_free_daily = 0.05 / 252  # 5% annual risk-free rate
excess = daily_returns - risk_free_daily
sharpe = np.sqrt(252) * excess.mean() / excess.std()`,
  },
  {
    id: 'sortino',
    name: 'Sortino Ratio',
    abbrev: 'Sortino',
    category: 'ratio',
    description: 'Like Sharpe but only penalizes downside volatility (returns below target), not total volatility. Better for strategies with asymmetric return distributions or positive skew.',
    formula: 'Sortino = (R_p − R_f) / σ_down\nDownside = std(negative returns only)',
    interpretation: '< 0.5 = poor | 0.5–1.0 = acceptable | 1.0–2.0 = good | > 2.0 = excellent',
    goodRange: '≥ 1.0 for publication; ≥ 1.5 for live trading',
    code: `daily_returns = df['equity'].pct_change().dropna()
target_return = 0.0  # or MAR (minimum acceptable return)
downside = daily_returns[daily_returns < target_return]
sortino = np.sqrt(252) * (daily_returns.mean() - target_return) / downside.std()`,
  },
  {
    id: 'max-drawdown',
    name: 'Maximum Drawdown',
    abbrev: 'Max DD',
    category: 'risk',
    description: 'Largest peak-to-trough decline over the test period. Most important risk metric — measures worst-case survival scenario.',
    formula: 'Max DD = (Trough − Peak) / Peak\nacross all peaks',
    interpretation: '< 5% = minimal | 5–10% = low | 10–20% = moderate | 20–30% = elevated | > 30% = severe',
    goodRange: '≤ 20% for conservative; ≤ 30% for aggressive',
    code: `equity = df['equity']
running_max = equity.cummax()
drawdown = (equity - running_max) / running_max
max_drawdown = drawdown.min()`,
  },
  {
    id: 'cagr',
    name: 'Compound Annual Growth Rate',
    abbrev: 'CAGR',
    category: 'return',
    description: 'Annualized geometric return. Smooths the equity curve into a consistent annual growth rate.',
    formula: 'CAGR = (End / Start)^(252/N) − 1\nwhere N = trading days',
    interpretation: '< 5% = poor | 5–10% = modest | 10–20% = good | 20–50% = strong | > 50% = exceptional',
    goodRange: '≥ 10% for publication; ≥ 15% for competitive',
    code: `start_val = equity.iloc[0]
end_val = equity.iloc[-1]
n_days = len(equity)
cagr = (end_val / start_val) ** (252 / n_days) - 1`,
  },
  {
    id: 'profit-factor',
    name: 'Profit Factor',
    abbrev: 'PF',
    category: 'trade',
    description: 'Gross profits divided by gross losses. Best interpreted alongside trade count.',
    formula: 'PF = Σ(gross profits) / Σ(gross losses)\n(ignores win rate)',
    interpretation: '< 1.0 = losing | 1.0–1.5 = marginal | 1.5–2.0 = good | > 2.0 = excellent',
    goodRange: '≥ 1.5 for publication',
    code: `trades = ledger.closedTrades
gross_profit = trades[trades['pnl'] > 0]['pnl'].sum()
gross_loss = abs(trades[trades['pnl'] < 0]['pnl'].sum())
profit_factor = gross_profit / gross_loss if gross_loss > 0 else np.inf`,
  },
  {
    id: 'win-rate',
    name: 'Win Rate',
    abbrev: 'WR',
    category: 'trade',
    description: 'Percentage of profitable trades. Should never be interpreted in isolation — a 90% win rate with tiny wins and rare huge losses can be a losing strategy.',
    formula: 'Win Rate = Winning Trades / Total Trades\n(percentage)',
    interpretation: '< 40% = low | 40–50% = moderate | 50–60% = good | > 60% = high',
    goodRange: 'Context-dependent; interpret with profit factor',
    code: `trades = ledger.closedTrades
winning_trades = (trades['pnl'] > 0).sum()
total_trades = len(trades)
win_rate = winning_trades / total_trades if total_trades > 0 else 0`,
  },
  {
    id: 'turnover',
    name: 'Turnover',
    abbrev: 'Turnover',
    category: 'trade',
    description: 'How aggressively the strategy changes positions. High turnover can make results fragile under fees and slippage.',
    formula: 'Turnover = Σ|bought| + Σ|sold| / (2 × equity × days)\n(annualized)',
    interpretation: '< 1x = low turnover | 1–5x = moderate | 5–10x = high | > 10x = very high',
    goodRange: '≤ 5x for publication; ≤ 10x for live',
    code: `trades = ledger.closedTrades
total_volume = trades['amount'].sum()
avg_equity = df['equity'].mean()
n_days = len(df)
turnover = total_volume / (2 * avg_equity * n_days / 252)`,
  },
  {
    id: 'exposure',
    name: 'Exposure',
    abbrev: 'Exposure',
    category: 'risk',
    description: 'Average amount of capital actually deployed. Important for contextualizing returns.',
    formula: 'Exposure = mean(equity × weight) / mean(total equity)\n(percentage of time in market)',
    interpretation: '< 20% = low | 20–50% = partial | 50–80% = moderate | > 80% = high',
    goodRange: '≥ 50% indicates active strategy',
    code: `positions = df['positions']
avg_weight = positions.apply(
  lambda p: sum(pos['weight'] for pos in p)
).mean()
exposure = avg_weight`,
  },
]

// ─── Decision Flow ─────────────────────────────────────────────────

export const DECISION_FLOW = [
  { step: 'Data', description: 'ASE loads normalized crypto data and derived features' },
  { step: 'Strategy', description: 'Your strategy receives features and portfolio state' },
  { step: 'Request', description: 'Strategy returns BUY/SELL/HOLD decisions' },
  { step: 'Execution', description: 'ASE applies platform risk rules and constraints' },
  { step: 'Ledger', description: 'ASE writes decision and execution events to ledger' },
  { step: 'Metrics', description: 'ASE updates positions, equity, and validation status' },
]

// ─── Publish Guidance ────────────────────────────────────────────────

export const PUBLISH_GUIDANCE = [
  'Return is concentrated in a narrow period',
  'Costs materially degrade results',
  'Out-of-sample behavior is unstable',
  'Drawdowns are too severe for the strategy profile',
  'Sample size is too small to trust',
]

// ─── Validation Philosophy ─────────────────────────────────────────

export const VALIDATION_PHILOSOPHY = {
  intro: 'ASE evaluates strategies under standardized conditions to ensure fair comparison and prevent overfitting.',
  contract: 'ASE checks that the strategy exports required fields, returns valid decisions, keeps conviction in bounds, and handles portfolio context correctly.',
  baseline: 'ASE simulates strategy behavior over historical crypto data with standardized accounting and execution assumptions.',
  robustness: 'ASE evaluates strategies across multiple stress conditions, including out-of-sample windows, cost sensitivity, unstable concentration, insufficient history, and poor behavior under noisy periods.',
  publish: 'A strategy may be blocked from publishing if validation quality is too weak, even when one backtest window looks strong.',
  principle: 'Users can understand the methodology and categories of tests, but ASE retains private implementation details to keep evaluation fair and harder to game.',
}

// ─── Legacy Backtest Guide ───────────────────────────────────────────

export const BACKTEST_GUIDE = {
  pitfalls: [
    {
      name: 'Lookahead Bias',
      severity: 'CRITICAL',
      description: 'Using future information in signal generation.',
      fix: 'Always shift signals by 1 bar. Compute indicators on lagged data.',
    },
    {
      name: 'Survivorship Bias',
      severity: 'HIGH',
      description: 'Only backtesting assets that survived to today.',
      fix: 'Include all assets historically available, not just current survivors.',
    },
    {
      name: 'Over-fitting',
      severity: 'HIGH',
      description: 'Optimizing parameters too heavily on in-sample data.',
      fix: 'Use walk-forward validation or out-of-sample testing.',
    },
    {
      name: 'Transaction Costs Ignored',
      severity: 'MEDIUM',
      description: 'Backtests excluding fees, slippage, or spread.',
      fix: 'Apply realistic costs: 0.1% per trade + spread.',
    },
    {
      name: 'Liquidity Ignored',
      severity: 'MEDIUM',
      description: 'Assuming any position size can be filled.',
      fix: 'Cap position size based on average volume.',
    },
  ],
  walkForward: `train, test = data[:split], data[split:]
params = optimize(train)
performance = backtest(test, params)`,
  monteCarlo: `returns = []
for _ in range(1000):
    sample = resample(returns)
    returns.append(calc(sample))`,
}

// ─── Strategy Docs (Legacy - for backward compatibility) ─────────────

export interface StrategyDoc {
  id: string
  name: string
  type: 'momentum' | 'mean-reversion' | 'breakout' | 'multi-factor' | 'arbitrage'
  description: string
  bestFor: string
  avoid: string
  params: { name: string; default: number; min: number; max: number; description: string }[]
  code: string
}

export const STRATEGY_DOCS: StrategyDoc[] = [
  {
    id: 'mean_reversion',
    name: 'Mean Reversion (Z-Score)',
    type: 'mean-reversion',
    description: 'Buys when price falls more than N standard deviations below the rolling mean, and sells when it reverts.',
    bestFor: 'Range-bound assets, low-volatility regimes, crypto in consolidation phases',
    avoid: 'Trending markets — strong trends will trigger false buy signals on every new low',
    params: [
      { name: 'window', default: 20, min: 5, max: 60, description: 'Rolling mean/std lookback' },
      { name: 'z_threshold', default: 2.0, min: 0.5, max: 4.0, description: 'Z-score entry threshold' },
    ],
    code: `def generate_signals(self, df):
    rolling_mean = df['close'].rolling(self.window).mean()
    rolling_std  = df['close'].rolling(self.window).std()
    df['zscore']  = (df['close'] - rolling_mean) / rolling_std
    
    df['signal'] = 0
    df.loc[df['zscore'] < -self.z_threshold, 'signal'] =  1
    df.loc[df['zscore'] >  self.z_threshold, 'signal'] = -1
    return df`,
  },
  {
    id: 'momentum_crossover',
    name: 'Momentum Crossover (EMA)',
    type: 'momentum',
    description: 'Dual EMA crossover strategy. Enters long on golden cross, exits on death cross.',
    bestFor: 'Trending markets, crypto bull runs, medium to long-term holding',
    avoid: 'Choppy/sideways markets — frequent whipsaws erode returns',
    params: [
      { name: 'fast_window', default: 20, min: 5, max: 60, description: 'Fast EMA period' },
      { name: 'slow_window', default: 50, min: 20, max: 150, description: 'Slow EMA period' },
    ],
    code: `def generate_signals(self, df):
    df['ema_fast'] = df['close'].ewm(span=self.fast).mean()
    df['ema_slow'] = df['close'].ewm(span=self.slow).mean()
    cross_up   = (df['ema_fast'] > df['ema_slow']) & (df['ema_fast'].shift(1) <= df['ema_slow'].shift(1))
    cross_down = (df['ema_fast'] < df['ema_slow']) & (df['ema_fast'].shift(1) >= df['ema_slow'].shift(1))
    df.loc[cross_up,   'signal'] =  1
    df.loc[cross_down, 'signal'] = -1
    return df`,
  },
  {
    id: 'breakout_trend',
    name: 'Breakout Trend (Donchian)',
    type: 'breakout',
    description: 'Enters long when price breaks above the N-day high. Exits when price drops below the M-day low.',
    bestFor: 'Volatile markets with strong trending tendencies, crypto',
    avoid: 'Low-volatility markets — false breakouts are common',
    params: [
      { name: 'breakout_window', default: 20, min: 10, max: 150, description: 'Lookback for entry high' },
      { name: 'exit_window', default: 10, min: 5, max: 60, description: 'Lookback for exit low' },
    ],
    code: `def generate_signals(self, df):
    df['upper'] = df['high'].rolling(self.breakout).max()
    df['lower'] = df['low'].rolling(self.exit_w).min()
    df.loc[df['close'] >= df['upper'].shift(1), 'signal'] =  1
    df.loc[df['close'] <= df['lower'].shift(1), 'signal'] = -1
    return df`,
  },
  {
    id: 'rsi_trend_filter',
    name: 'RSI + Trend Filter',
    type: 'mean-reversion',
    description: 'RSI mean-reversion entries filtered by long-period moving average trend.',
    bestFor: 'Swing trading, pullback entries in trending markets',
    avoid: 'Using without the trend filter in choppy markets',
    params: [
      { name: 'rsi_period', default: 14, min: 5, max: 30, description: 'RSI calculation period' },
      { name: 'trend_ma', default: 200, min: 50, max: 300, description: 'Long-term trend MA period' },
    ],
    code: `def generate_signals(self, df):
    df['rsi'] = self.calc_rsi(df, self.rsi_p)
    df['trend_ma'] = df['close'].rolling(self.trend_ma).mean()
    in_uptrend = df['close'] > df['trend_ma']
    df.loc[in_uptrend & (df['rsi'] < 30),  'signal'] =  1
    df.loc[~in_uptrend & (df['rsi'] > 70), 'signal'] = -1
    return df`,
  },
  {
    id: 'volatility_breakout',
    name: 'Volatility Breakout (ATR)',
    type: 'breakout',
    description: 'Enters on range breakout and uses ATR-based trailing stops.',
    bestFor: 'Highly volatile assets like crypto',
    avoid: 'Low-volatility assets where ATR stops are too tight',
    params: [
      { name: 'breakout_window', default: 20, min: 10, max: 120, description: 'High breakout lookback' },
      { name: 'atr_mult', default: 2.5, min: 1.0, max: 6.0, description: 'ATR stop multiplier' },
    ],
    code: `def generate_signals(self, df):
    df['atr'] = self.calc_atr(df)
    df['high_n'] = df['high'].rolling(self.breakout).max()
    df.loc[df['close'] > df['high_n'].shift(1), 'signal'] =  1
    df.loc[df['close'] < df['close'].shift(1) - self.mult * df['atr'], 'signal'] = -1
    return df`,
  },
  {
    id: 'dual_momentum',
    name: 'Dual Momentum (Antonacci)',
    type: 'momentum',
    description: "Gary Antonacci's Dual Momentum: absolute AND relative momentum.",
    bestFor: 'Long-term allocation, portfolio-level strategy',
    avoid: 'Short-term trading — significant lag',
    params: [
      { name: 'lookback', default: 252, min: 20, max: 252, description: 'Return lookback for momentum score' },
    ],
    code: `def generate_signals(self, df):
    df['abs_mom'] = df['close'].pct_change(self.lookback)
    df['ma'] = df['close'].rolling(100).mean()
    abs_positive = df['abs_mom'] > 0
    trend_confirm = df['close'] > df['ma']
    df.loc[abs_positive & trend_confirm, 'signal'] = 1
    return df`,
  },
  {
    id: 'factor_rotation',
    name: 'Factor Rotation',
    type: 'multi-factor',
    description: 'Ranks assets by risk-adjusted momentum and rotates positions.',
    bestFor: 'Multi-asset portfolios, crypto market cycles',
    avoid: 'Single-asset backtests',
    params: [
      { name: 'momentum_window', default: 90, min: 20, max: 252, description: 'Return lookback for scoring' },
    ],
    code: `def evaluate(self, context):
    returns = context['features'].pct_change(self.momentum_window)
    volatility = context['features'].pct_change().rolling(20).std()
    scores = returns / (volatility + 1e-9)
    # Rank and allocate to top performers
    return decisions`,
  },
  {
    id: 'rsi_mean_reversion',
    name: 'RSI Mean Reversion',
    type: 'mean-reversion',
    description: 'Pure RSI-based mean reversion. Buys oversold, sells overbought.',
    bestFor: 'Range-bound markets, stable high-cap crypto',
    avoid: 'Strong trending markets',
    params: [
      { name: 'period', default: 14, min: 5, max: 30, description: 'RSI period' },
    ],
    code: `def generate_signals(self, df):
    df['rsi'] = self.calc_rsi(df, self.period)
    df.loc[df['rsi'] < 30, 'signal'] =  1
    df.loc[df['rsi'] > 70, 'signal'] = -1
    return df`,
  },
  {
    id: 'macd_trend',
    name: 'MACD Trend',
    type: 'momentum',
    description: 'MACD signal line crossover.',
    bestFor: 'Trending assets, medium-term holding',
    avoid: 'Ranging markets — many false crossovers',
    params: [
      { name: 'fast', default: 12, min: 5, max: 30, description: 'Fast EMA period' },
      { name: 'slow', default: 26, min: 15, max: 60, description: 'Slow EMA period' },
    ],
    code: `def generate_signals(self, df):
    df['macd']  = df['close'].ewm(span=self.fast).mean() - df['close'].ewm(span=self.slow).mean()
    df['signal'] = df['macd'].ewm(span=9).mean()
    cross_up   = (df['macd'] > df['signal']) & (df['macd'].shift(1) <= df['signal'].shift(1))
    cross_down = (df['macd'] < df['signal']) & (df['macd'].shift(1) >= df['signal'].shift(1))
    df.loc[cross_up,   'signal'] =  1
    df.loc[cross_down, 'signal'] = -1
    return df`,
  },
]

// ─── Backward Compatibility ───────────────────────────────────────────────

export function buildAIContext(): string {
  const dataSources = DATA_SOURCES.map(s => s.name).join(', ')
  const indicators = INDICATORS.map(i => i.name).join(', ')
  const metrics = RISK_METRICS.map(m => m.name).join(', ')
  
  return `
ASE Quant Builder Documentation Summary:

Data Sources: ${dataSources}
Indicators: ${indicators}
Metrics: ${metrics}

Key Points:
- Crypto-only platform (BTC, ETH, SOL, etc.)
- Strategies return BUY/SELL/HOLD decisions
- Portfolio-aware evaluation
- Standardized backtests with ledger events
- Risk metrics: Sharpe, Sortino, Max Drawdown, CAGR
`
}