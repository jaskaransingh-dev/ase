/**
 * lib/quant-docs.ts
 *
 * THE single editable source-of-truth for all ASE quant documentation.
 *
 * Edit this file to:
 *  - Add/remove data sources (DATA_SOURCES)
 *  - Add/remove technical indicators (INDICATORS)
 *  - Add/remove strategy templates (STRATEGY_DOCS)
 *  - Add/remove risk metrics (RISK_METRICS)
 *
 * This file is consumed by:
 *  - app/dashboard/build/docs/page.tsx   → renders the docs UI
 *  - app/api/ai/chat/route.ts            → injects into AI system prompt
 *  - lib/market-data.ts                  → source registry
 */

// ─── Data Sources ────────────────────────────────────────────────────────────

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
    id: 'yahoo',
    name: 'Yahoo Finance',
    badge: 'PRIMARY · EQUITIES',
    badgeColor: '#5B8CFF',
    noKey: true,
    description: 'Covers 30,000+ global equities, ETFs, indices, forex, futures, and crypto. The unofficial Chart API v8 is used in production by many quant libraries. No authentication required. Supports intraday down to 1-minute intervals.',
    endpoint: 'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}',
    rateLimit: '~100 req/min (no hard limit)',
    historyDepth: '20+ years for daily data',
    assetClasses: ['equities','etfs','indices','forex','futures','crypto'],
    symbols: ['SPY','QQQ','TLT','GLD','IWM','VXX','AAPL','MSFT','GOOGL','NVDA','META','AMZN','TSLA','XLK','XLV','XLF','SPLV','BTC-USD','ETH-USD','^VIX','^GSPC','^DJI','^IXIC','GC=F','CL=F'],
    intervals: ['1m','2m','5m','15m','30m','60m','90m','1h','1d','5d','1wk','1mo','3mo'],
    dataFields: ['timestamp','open','high','low','close','adjclose','volume'],
    fetchExample: `// Fetch AAPL daily bars for the last year
const end   = Math.floor(Date.now() / 1000)
const start = end - 365 * 86400
const url   = \`https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&period1=\${start}&period2=\${end}\`

const res  = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
const json = await res.json()
const q    = json.chart.result[0]
const bars = q.timestamp.map((t: number, i: number) => ({
  date:   new Date(t * 1000).toISOString().slice(0, 10),
  open:   q.indicators.quote[0].open[i],
  high:   q.indicators.quote[0].high[i],
  low:    q.indicators.quote[0].low[i],
  close:  q.indicators.quote[0].close[i],
  volume: q.indicators.quote[0].volume[i],
}))

// Symbols: AAPL, MSFT, SPY, QQQ, BTC-USD, etc.
// Crypto: symbol-USD format (BTC-USD, ETH-USD, SOL-USD)`,
  },
  {
    id: 'coingecko',
    name: 'CoinGecko',
    badge: 'CRYPTO · FUNDAMENTALS',
    badgeColor: '#22F0B5',
    noKey: true,
    description: 'Comprehensive crypto market data covering 10,000+ coins. Free tier requires no API key. Provides OHLC bars, market cap, circulating supply, all-time highs, and exchange data. Rate limited to ~10–50 req/min on the public tier.',
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
  {
    id: 'kraken',
    name: 'Kraken',
    badge: 'CRYPTO · RELIABLE',
    badgeColor: '#8B5CF6',
    noKey: true,
    description: 'Professional crypto exchange with clean public OHLC API. Excellent reliability and data quality. OHLC endpoint returns up to 720 candles per request. Useful as a cross-reference or fallback for major crypto pairs.',
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
    id: 'stooq',
    name: 'Stooq',
    badge: 'EQUITIES · FREE',
    badgeColor: '#FFB648',
    noKey: true,
    description: 'Free CSV-based market data covering US stocks, global indices, forex, and commodities. Returns clean OHLCV data in CSV format with no authentication. Particularly useful for S&P 500 components, global indices, and Polish stocks.',
    endpoint: 'https://stooq.com/q/d/l/',
    rateLimit: 'Moderate (no hard limit)',
    historyDepth: '10+ years for major symbols',
    assetClasses: ['equities','indices','forex','crypto'],
    symbols: ['AAPL.US','MSFT.US','GOOGL.US','NVDA.US','^SPX (S&P500)','^NDX (Nasdaq)','^DJI (Dow Jones)','BTC.USD','ETH.USD','EURUSD','GBPUSD'],
    intervals: ['d (daily)','w (weekly)','m (monthly)'],
    dataFields: ['Date','Open','High','Low','Close','Volume'],
    fetchExample: `// AAPL daily — no API key needed, returns CSV
const res  = await fetch('https://stooq.com/q/d/l/?s=AAPL.US&i=d')
const csv  = await res.text()
const rows = csv.trim().split('\\n').slice(1) // skip header
const bars = rows.map(row => {
  const [date, open, high, low, close, volume] = row.split(',')
  return { date, open: +open, high: +high, low: +low, close: +close, volume: +volume }
})

// Symbol formats:
//   US stocks:      AAPL.US, MSFT.US, GOOGL.US
//   Indices:        ^SPX, ^NDX, ^DJI, ^FTSE, ^N225
//   Forex:          EURUSD, GBPUSD, USDJPY
//   Crypto (daily): BTC.USD, ETH.USD
// Date range: ?d1=YYYYMMDD&d2=YYYYMMDD`,
  },
  {
    id: 'fred',
    name: 'FRED (St. Louis Fed)',
    badge: 'MACRO · ECONOMIC',
    badgeColor: '#FF5468',
    noKey: true,
    description: 'Federal Reserve Economic Data — 800,000+ macro time series. The graph CSV endpoint requires zero authentication. Essential for macro factor models: Fed Funds Rate, Treasury yields, CPI, GDP, unemployment, VIX, and credit spreads.',
    endpoint: 'https://fred.stlouisfed.org/graph/fredgraph.csv',
    rateLimit: 'Generous (no hard limit on CSV)',
    historyDepth: 'Decades for most series',
    assetClasses: ['macro','rates','economic'],
    symbols: ['FEDFUNDS (Fed Funds Rate)','DGS10 (10yr Treasury)','DGS2 (2yr Treasury)','T10Y2Y (Yield Curve)','VIXCLS (VIX)','CPIAUCSL (CPI)','UNRATE (Unemployment)','INDPRO (Industrial Prod)','BAMLH0A0HYM2 (HY Spread)','M2SL (Money Supply M2)'],
    intervals: ['daily (most series)','monthly','quarterly'],
    dataFields: ['DATE','VALUE'],
    fetchExample: `// 10-year Treasury yield — no API key needed
const res  = await fetch('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10')
const csv  = await res.text()
const rows = csv.trim().split('\\n').slice(1)
const data = rows
  .filter(r => !r.includes('.'))  // filter missing values
  .map(r => {
    const [date, value] = r.split(',')
    return { date, yield10yr: parseFloat(value) }
  })

// Key series IDs:
//   FEDFUNDS  — Federal Funds Rate (monthly)
//   DGS10     — 10-Year Treasury (daily)
//   DGS2      — 2-Year Treasury (daily)
//   T10Y2Y    — Yield Curve Spread (daily)
//   VIXCLS    — CBOE VIX Index (daily)
//   CPIAUCSL  — Consumer Price Index (monthly)
//   UNRATE    — Unemployment Rate (monthly)
//   M2SL      — M2 Money Supply (monthly)`,
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

// ─── Strategy Documentation ───────────────────────────────────────────────────

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
    description: 'Buys when price falls more than N standard deviations below the rolling mean, and sells when it reverts. Based on the statistical tendency of prices to return to their mean.',
    bestFor: 'Range-bound assets, low-volatility regimes, pairs trading, crypto in consolidation phases',
    avoid: 'Trending markets — strong trends will trigger false buy signals on every new low',
    params: [
      { name: 'window', default: 20, min: 5, max: 60, description: 'Rolling mean/std lookback' },
      { name: 'z_threshold', default: 2.0, min: 0.5, max: 4.0, description: 'Z-score entry threshold' },
      { name: 'exit_z', default: 0.5, min: 0.0, max: 2.0, description: 'Z-score exit threshold' },
    ],
    code: `import pandas as pd
import numpy as np

class MeanReversionStrategy:
    """
    Z-score mean reversion.
    Enter long when z < -threshold, exit when z > -exit_z.
    Enter short when z > +threshold, exit when z < +exit_z.
    """
    def __init__(self, window=20, z_threshold=2.0, exit_z=0.5):
        self.window      = window
        self.z_threshold = z_threshold
        self.exit_z      = exit_z

    def generate_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        rolling_mean = df['close'].rolling(self.window).mean()
        rolling_std  = df['close'].rolling(self.window).std()
        df['zscore']  = (df['close'] - rolling_mean) / rolling_std.replace(0, np.nan)

        df['signal'] = 0
        df.loc[df['zscore'] < -self.z_threshold, 'signal'] =  1  # oversold → buy
        df.loc[df['zscore'] >  self.z_threshold, 'signal'] = -1  # overbought → sell

        # Hold position until z-score reverts to exit threshold
        position = 0
        signals  = []
        for _, row in df.iterrows():
            z = row['zscore']
            if np.isnan(z):
                signals.append(0)
                continue
            if position == 0:
                if z < -self.z_threshold:
                    position = 1
                elif z > self.z_threshold:
                    position = -1
            elif position == 1 and z > -self.exit_z:
                position = 0
            elif position == -1 and z < self.exit_z:
                position = 0
            signals.append(position)

        df['signal'] = signals
        return df`,
  },
  {
    id: 'momentum_crossover',
    name: 'Momentum Crossover (EMA)',
    type: 'momentum',
    description: 'Dual EMA crossover strategy. Enters long on golden cross (fast EMA crosses above slow), exits on death cross. Forward-fills position to stay in trend. Classic trend-following system.',
    bestFor: 'Trending markets, crypto bull runs, macro trends, medium to long-term holding',
    avoid: 'Choppy/sideways markets — frequent whipsaws erode returns',
    params: [
      { name: 'fast_window', default: 20, min: 5, max: 60, description: 'Fast EMA period' },
      { name: 'slow_window', default: 50, min: 20, max: 150, description: 'Slow EMA period' },
    ],
    code: `import pandas as pd
import numpy as np

class MomentumCrossoverStrategy:
    """
    Dual EMA crossover.
    Buy on golden cross (fast > slow), sell on death cross (fast < slow).
    Holds position between crossovers.
    """
    def __init__(self, fast_window=20, slow_window=50):
        self.fast = fast_window
        self.slow = slow_window

    def generate_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        df['ema_fast'] = df['close'].ewm(span=self.fast, adjust=False).mean()
        df['ema_slow'] = df['close'].ewm(span=self.slow, adjust=False).mean()

        cross_up   = (df['ema_fast'] > df['ema_slow']) & \\
                     (df['ema_fast'].shift(1) <= df['ema_slow'].shift(1))
        cross_down = (df['ema_fast'] < df['ema_slow']) & \\
                     (df['ema_fast'].shift(1) >= df['ema_slow'].shift(1))

        df['signal'] = 0
        df.loc[cross_up,   'signal'] =  1
        df.loc[cross_down, 'signal'] = -1
        # Forward-fill to maintain position between crosses
        df['signal'] = df['signal'].replace(0, np.nan).ffill().fillna(0).astype(int)
        return df`,
  },
  {
    id: 'breakout_trend',
    name: 'Breakout Trend (Donchian)',
    type: 'breakout',
    description: 'Enters long when price breaks above the N-day high (Donchian channel). Exits when price drops below the M-day low. Popularized by Richard Dennis and the Turtle Trading system.',
    bestFor: 'Volatile markets with strong trending tendencies, commodities, crypto',
    avoid: 'Low-volatility stocks, very tight ranges — false breakouts are common',
    params: [
      { name: 'breakout_window', default: 20, min: 10, max: 150, description: 'Lookback for entry high' },
      { name: 'exit_window', default: 10, min: 5, max: 60, description: 'Lookback for exit low' },
    ],
    code: `import pandas as pd
import numpy as np

class BreakoutTrendStrategy:
    """
    Donchian channel breakout (Turtle Trading style).
    Enter when close exceeds N-bar high.
    Exit when close drops below M-bar low.
    """
    def __init__(self, breakout_window=20, exit_window=10):
        self.breakout = breakout_window
        self.exit_w   = exit_window

    def generate_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        df['upper'] = df['high'].rolling(self.breakout).max()
        df['lower'] = df['low'].rolling(self.exit_w).min()

        df['signal'] = 0
        # Entry: breakout above N-bar high
        df.loc[df['close'] >= df['upper'].shift(1), 'signal'] =  1
        # Exit: drop below M-bar low
        df.loc[df['close'] <= df['lower'].shift(1), 'signal'] = -1
        df['signal'] = df['signal'].replace(0, np.nan).ffill().fillna(0).astype(int)
        return df`,
  },
  {
    id: 'rsi_trend_filter',
    name: 'RSI + Trend Filter',
    type: 'mean-reversion',
    description: 'RSI mean-reversion entries filtered by long-period moving average trend. Only buys oversold RSI readings in an uptrend; only sells overbought in a downtrend. Reduces false signals in strong trends.',
    bestFor: 'Swing trading, pullback entries in trending markets, equities in bull markets',
    avoid: 'Using without the trend filter in choppy markets — unfiltered RSI reversal signals are unreliable',
    params: [
      { name: 'rsi_period', default: 14, min: 5, max: 30, description: 'RSI calculation period' },
      { name: 'trend_ma', default: 200, min: 50, max: 300, description: 'Long-term trend MA period' },
      { name: 'oversold', default: 30, min: 10, max: 45, description: 'RSI buy threshold' },
      { name: 'overbought', default: 70, min: 55, max: 90, description: 'RSI sell threshold' },
    ],
    code: `import pandas as pd
import numpy as np

class RSITrendFilterStrategy:
    """
    RSI mean-reversion gated by a trend-following MA.
    Long signals: price above trend_ma AND rsi < oversold.
    Short signals: price below trend_ma AND rsi > overbought.
    """
    def __init__(self, rsi_period=14, trend_ma=200, oversold=30, overbought=70):
        self.rsi_p      = rsi_period
        self.trend_ma   = trend_ma
        self.oversold   = oversold
        self.overbought = overbought

    def generate_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        delta  = df['close'].diff()
        gain   = delta.clip(lower=0).ewm(com=self.rsi_p-1, adjust=False).mean()
        loss   = (-delta.clip(upper=0)).ewm(com=self.rsi_p-1, adjust=False).mean()
        df['rsi']      = 100 - (100 / (1 + gain / loss))
        df['trend_ma'] = df['close'].rolling(self.trend_ma).mean()

        in_uptrend   = df['close'] > df['trend_ma']
        in_downtrend = df['close'] < df['trend_ma']

        df['signal'] = 0
        df.loc[in_uptrend   & (df['rsi'] < self.oversold),   'signal'] =  1
        df.loc[in_downtrend & (df['rsi'] > self.overbought), 'signal'] = -1
        return df`,
  },
  {
    id: 'volatility_breakout',
    name: 'Volatility Breakout (ATR)',
    type: 'breakout',
    description: 'Enters on range breakout and uses ATR-based trailing stops for risk management. Adapts stop distance to current volatility — wider stops in volatile markets, tighter in calm ones.',
    bestFor: 'Highly volatile assets like crypto, commodities, earnings plays',
    avoid: 'Low-volatility assets where ATR stops are too tight and whipsaw frequently',
    params: [
      { name: 'breakout_window', default: 20, min: 10, max: 120, description: 'High breakout lookback' },
      { name: 'atr_period', default: 14, min: 5, max: 40, description: 'ATR calculation period' },
      { name: 'atr_mult', default: 2.5, min: 1.0, max: 6.0, description: 'ATR stop multiplier' },
    ],
    code: `import pandas as pd
import numpy as np

class VolatilityBreakoutStrategy:
    """
    Range breakout entry with ATR-based trailing stops.
    Enter long: close > N-bar high.
    Exit: close < close[prev] - (atr_mult × ATR).
    """
    def __init__(self, breakout_window=20, atr_period=14, atr_mult=2.5):
        self.breakout = breakout_window
        self.atr_p    = atr_period
        self.mult     = atr_mult

    def generate_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        df['tr'] = pd.concat([
            df['high'] - df['low'],
            (df['high'] - df['close'].shift(1)).abs(),
            (df['low']  - df['close'].shift(1)).abs()
        ], axis=1).max(axis=1)
        df['atr']     = df['tr'].ewm(com=self.atr_p-1, adjust=False).mean()
        df['high_n']  = df['high'].rolling(self.breakout).max()
        df['atr_stop']= df['close'].shift(1) - self.mult * df['atr']

        df['signal'] = 0
        # Breakout entry
        df.loc[df['close'] > df['high_n'].shift(1), 'signal'] =  1
        # ATR trailing stop exit
        df.loc[df['close'] < df['atr_stop'],        'signal'] = -1
        df['signal'] = df['signal'].replace(0, np.nan).ffill().fillna(0).astype(int)
        return df`,
  },
  {
    id: 'dual_momentum',
    name: 'Dual Momentum (Antonacci)',
    type: 'momentum',
    description: "Gary Antonacci's Dual Momentum: absolute momentum (asset vs cash) AND relative momentum (asset vs other assets). Only holds when BOTH absolute and relative momentum are positive. Historically strong risk-adjusted returns.",
    bestFor: 'Long-term allocation, portfolio-level strategy, equities + bonds rotation',
    avoid: 'Short-term trading — monthly rebalancing frequency, significant lag',
    params: [
      { name: 'lookback', default: 252, min: 20, max: 252, description: 'Return lookback for momentum score' },
      { name: 'ma_window', default: 100, min: 50, max: 300, description: 'Trend confirmation MA' },
    ],
    code: `import pandas as pd
import numpy as np

class DualMomentumStrategy:
    """
    Antonacci's Dual Momentum:
    1. Absolute momentum: N-period return must be positive (asset beats cash)
    2. Relative momentum: price above long-term MA (trend filter)
    Long only — cash when neither condition is met.
    """
    def __init__(self, lookback=252, ma_window=100):
        self.lookback = lookback
        self.ma       = ma_window

    def generate_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        df['abs_mom'] = df['close'].pct_change(self.lookback)
        df['ma']      = df['close'].rolling(self.ma).mean()

        # Both conditions must hold for long position
        abs_positive  = df['abs_mom'] > 0
        trend_confirm = df['close'] > df['ma']

        df['signal'] = 0
        df.loc[abs_positive & trend_confirm, 'signal'] = 1
        return df`,
  },
  {
    id: 'pairs_mean_reversion',
    name: 'Pairs Mean Reversion',
    type: 'arbitrage',
    description: 'Statistical arbitrage on correlated asset pairs. Trades the z-score of the price spread. When the spread widens beyond the threshold, buys the underperformer and sells the outperformer, expecting the spread to converge.',
    bestFor: 'Correlated pairs (BTC/ETH, SPY/QQQ, gold/silver), market-neutral strategies',
    avoid: 'Uncorrelated pairs, regime changes that break historical correlations',
    params: [
      { name: 'short_window', default: 5, min: 3, max: 30, description: 'Fast spread mean (not used in z-score form)' },
      { name: 'long_window', default: 60, min: 20, max: 120, description: 'Slow spread mean/std lookback' },
      { name: 'z_entry', default: 2.0, min: 0.5, max: 4.0, description: 'Z-score entry threshold' },
      { name: 'z_exit', default: 0.5, min: 0.0, max: 2.0, description: 'Z-score exit threshold' },
    ],
    code: `import pandas as pd
import numpy as np

class PairsMeanReversionStrategy:
    """
    Statistical arbitrage on correlated pairs.
    Requires 'close2' column for the second asset.
    Trades z-score of price ratio (asset1 / asset2).
    z < -entry → long spread; z > +entry → short spread.
    """
    def __init__(self, long_window=60, z_entry=2.0, z_exit=0.5):
        self.long_w  = long_window
        self.z_entry = z_entry
        self.z_exit  = z_exit

    def generate_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        if 'close2' not in df.columns:
            df['signal'] = 0
            return df

        spread          = np.log(df['close']) - np.log(df['close2'])
        df['spread_mean']= spread.rolling(self.long_w).mean()
        df['spread_std'] = spread.rolling(self.long_w).std()
        df['zscore']     = (spread - df['spread_mean']) / df['spread_std'].replace(0, np.nan)

        position = 0
        signals  = []
        for z in df['zscore']:
            if np.isnan(z):
                signals.append(0); continue
            if position == 0:
                if z < -self.z_entry:   position =  1
                elif z > self.z_entry:  position = -1
            elif position ==  1 and z > -self.z_exit: position = 0
            elif position == -1 and z <  self.z_exit: position = 0
            signals.append(position)
        df['signal'] = signals
        return df`,
  },
  {
    id: 'factor_rotation',
    name: 'Factor Rotation',
    type: 'multi-factor',
    description: 'Ranks assets by risk-adjusted momentum (return / volatility). Rotates into top performers and exits bottom performers. Adapts to changing market leadership across assets or sectors.',
    bestFor: 'Multi-asset portfolios, sector rotation, crypto market cycles',
    avoid: 'Single-asset backtests — this strategy requires multiple assets to compare',
    params: [
      { name: 'momentum_window', default: 90, min: 20, max: 252, description: 'Return lookback for scoring' },
      { name: 'vol_window', default: 20, min: 5, max: 60, description: 'Volatility normalization period' },
      { name: 'top_quantile', default: 0.7, min: 0.5, max: 0.9, description: 'Score percentile for entry' },
    ],
    code: `import pandas as pd
import numpy as np

class FactorRotationStrategy:
    """
    Risk-adjusted momentum rotation.
    Score = N-period return / N-period volatility (Sharpe-like).
    Long when score is in the top quantile vs its own history.
    """
    def __init__(self, momentum_window=90, vol_window=20, top_quantile=0.7):
        self.mom   = momentum_window
        self.vol   = vol_window
        self.top_q = top_quantile

    def generate_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        returns    = df['close'].pct_change(self.mom)
        volatility = df['close'].pct_change().rolling(self.vol).std()
        df['score']= returns / (volatility + 1e-9)

        # Dynamic percentile threshold (rolling)
        df['threshold'] = df['score'].rolling(self.mom).quantile(self.top_q)

        df['signal'] = 0
        df.loc[df['score'] > df['threshold'], 'signal'] = 1
        return df`,
  },
  {
    id: 'rsi_mean_reversion',
    name: 'RSI Mean Reversion',
    type: 'mean-reversion',
    description: 'Pure RSI-based mean reversion without trend filter. Buys extreme oversold conditions (RSI < 30), sells extreme overbought (RSI > 70). Uses Wilder smoothing for authentic RSI calculation.',
    bestFor: 'Range-bound markets, stable high-cap equities, short-term swing trading',
    avoid: 'Strong trending markets (will buy every dip in a downtrend)',
    params: [
      { name: 'period', default: 14, min: 5, max: 30, description: 'RSI period (Wilder smoothing)' },
      { name: 'buy_below', default: 30, min: 10, max: 45, description: 'RSI oversold entry threshold' },
      { name: 'sell_above', default: 70, min: 55, max: 90, description: 'RSI overbought exit threshold' },
    ],
    code: `import pandas as pd
import numpy as np

class RSIMeanReversionStrategy:
    """
    Pure RSI mean reversion using Wilder smoothing.
    Enter long: RSI < buy_below.
    Exit long:  RSI > sell_above.
    """
    def __init__(self, period=14, buy_below=30, sell_above=70):
        self.period    = period
        self.buy_below = buy_below
        self.sell_above= sell_above

    def generate_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        delta = df['close'].diff()
        gain  = delta.clip(lower=0).ewm(com=self.period-1, adjust=False).mean()
        loss  = (-delta.clip(upper=0)).ewm(com=self.period-1, adjust=False).mean()
        df['rsi'] = 100 - (100 / (1 + gain / loss))

        position = 0
        signals  = []
        for rsi in df['rsi']:
            if np.isnan(rsi):
                signals.append(0); continue
            if position == 0 and rsi < self.buy_below:
                position = 1
            elif position == 1 and rsi > self.sell_above:
                position = 0
            signals.append(position)
        df['signal'] = signals
        return df`,
  },
  {
    id: 'macd_trend',
    name: 'MACD Trend',
    type: 'momentum',
    description: 'MACD line / signal line crossover. Enters long when MACD crosses above signal (bullish), exits on bearish cross. Holds position between crosses. Classic trend-following momentum strategy.',
    bestFor: 'Trending assets, medium-term holding, momentum regimes',
    avoid: 'Ranging markets — MACD generates many false crossovers in consolidation',
    params: [
      { name: 'fast', default: 12, min: 5, max: 30, description: 'Fast EMA period' },
      { name: 'slow', default: 26, min: 15, max: 60, description: 'Slow EMA period' },
      { name: 'signal', default: 9, min: 3, max: 20, description: 'Signal line EMA period' },
    ],
    code: `import pandas as pd
import numpy as np

class MACDTrendStrategy:
    """
    MACD signal line crossover.
    Enter long:  MACD crosses above signal line.
    Exit long:   MACD crosses below signal line.
    """
    def __init__(self, fast=12, slow=26, signal=9):
        self.fast   = fast
        self.slow   = slow
        self.signal = signal

    def generate_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        ema_f       = df['close'].ewm(span=self.fast,   adjust=False).mean()
        ema_s       = df['close'].ewm(span=self.slow,   adjust=False).mean()
        df['macd']  = ema_f - ema_s
        df['sig']   = df['macd'].ewm(span=self.signal,  adjust=False).mean()
        df['hist']  = df['macd'] - df['sig']

        cross_up   = (df['macd'] > df['sig']) & (df['macd'].shift(1) <= df['sig'].shift(1))
        cross_down = (df['macd'] < df['sig']) & (df['macd'].shift(1) >= df['sig'].shift(1))

        df['signal'] = 0
        df.loc[cross_up,   'signal'] =  1
        df.loc[cross_down, 'signal'] = -1
        df['signal'] = df['signal'].replace(0, np.nan).ffill().fillna(0).astype(int)
        return df`,
  },
]

// ─── Standardized Quant File Structure ───────────────────────────────────────

export const QUANT_FILE_GUIDE = `## Quant File Structure

Quants use ONE file per strategy. Each file contains:
- A class that implements the trading logic
- A main function that runs the backtest
- Ledger API calls for buy/sell signals

### Sandbox Environment

All sandbox accounts start with **$100,000 USD** in simulated capital.
- This is paper trading with fake money
- No real money is at risk
- Use this to test strategies before going live

### Required Interface: Ledger

Your quant sends signals via ledger calls:
\`\`\`javascript
ledger.buy(symbol, amount, price)   // Open long position
ledger.sell(symbol, amount, price)  // Close long / open short
ledger.exit(symbol)                   // Flat position (close all)
\`\`\`

### Position Tracking

The agent must know what it currently owns. Use ledger.position(symbol):
\`\`\`javascript
const position = ledger.position(PARAMS.symbol)
// Returns: { open: bool, amount: number, entryPrice: number, pnl: number }
// - open: true if currently holding position
// - amount: number of units owned
// - entryPrice: average entry price
// - pnl: unrealized profit/loss in dollars
\`\`\`

### Posting Trades to Ledger

ALL trades MUST be posted to the ledger for tracking. Use ledger.post():
\`\`\`javascript
// After executing a trade, post to ledger
await ledger.post({
  symbol: 'BTC-USD',
  type: 'buy',           // 'buy' or 'sell'
  amount: 0.5,         // units bought/sold
  price: 45000,          // execution price
  agentId: 'agent-slug',  // your agent identifier
  timestamp: Date.now()
})
\`\`\`
This ensures all trades are recorded in ledger_entries table.

### Required Main Function Signature

Every quant file MUST export this structure:

\`\`\`javascript
// quant.js - Single file containing full strategy

// ─── Strategy Parameters ──────────────────────────────────────────────────────
const PARAMS = {
  symbol: 'BTC-USD',
  timeframe: '1d',
  // Add strategy-specific params here
}

// ─── Indicators ───────────────────────────────────────────────────────────────
function computeIndicators(df) {
  // Compute your indicators here
  // df = { timestamp, open, high, low, close, volume }
  return df
}

// ─── Signal Generation ────────────────────────────────────────────────────────
function generateSignals(df, ledger) {
  // df contains price data + your indicators
  // ledger tracks current positions
  
  const signals = []
  
  for (let i = 0; i < df.length; i++) {
    const bar = df[i]
    const position = ledger.position(PARAMS.symbol)
    
    // Example: Simple RSI mean reversion
    if (!position.open && bar.rsi < 30) {
      signals.push({
        type: 'buy',
        symbol: PARAMS.symbol,
        amount: 1,
        price: bar.close,
        timestamp: bar.timestamp
      })
      ledger.buy(PARAMS.symbol, 1, bar.close)
    }
    else if (position.open && bar.rsi > 70) {
      signals.push({
        type: 'sell',
        symbol: PARAMS.symbol,
        amount: position.amount,
        price: bar.close,
        timestamp: bar.timestamp
      })
      ledger.sell(PARAMS.symbol, position.amount, bar.close)
    }
  }
  
  return signals
}

// ─── Backtest Entry Point ─────────────────────────────────────────────────────
async function main(ledger, dataFetcher) {
  // 1. Fetch historical data
  const df = await dataFetcher(PARAMS.symbol, PARAMS.timeframe)
  
  // 2. Compute indicators
  const data = computeIndicators(df)
  
  // 3. Generate signals
  const signals = generateSignals(data, ledger)
  
  // 4. Return results for backtest engine
  return {
    signals,
    metrics: {
      totalTrades: signals.length,
      equityCurve: ledger.equity
    }
  }
}

module.exports = { main, PARAMS, computeIndicators, generateSignals }
\`\`\`

### Ledger API Reference

\`\`\`javascript
// Initialize ledger with $100k sandbox capital
const ledger = new Ledger(100_000)

// Position check
ledger.position(symbol)        // Returns { open: bool, amount, entryPrice, pnl }

// Trading signals
ledger.buy(symbol, amount, price)
ledger.sell(symbol, amount, price)
ledger.exit(symbol)            // Closes all positions

// Account info
ledger.equity                  // Current portfolio value
ledger.cash                    // Available cash
ledger.positions               // All open positions
ledger.closedTrades            // Trade history
ledger.tradeLog                // Detailed trade log

// Post trade to ledger_entries (REQUIRED for all trades)
await ledger.post({
  symbol: 'BTC-USD',
  type: 'buy',
  amount: 0.5,
  price: 45000,
  agentId: 'my-agent',
  timestamp: Date.now()
})
\`\`\`

**All sandbox accounts get $100,000 USD to start.**

### Complete Example: RSI Mean Reversion

\`\`\`javascript
// rsi-mean-reversion.js

const PARAMS = {
  symbol: 'BTC-USD',
  timeframe: '1d',
  rsiPeriod: 14,
  oversold: 30,
  overbought: 70,
  positionSize: 0.95  // Use 95% of equity per trade
}

function computeIndicators(df) {
  const closes = df.map(b => b.close)
  const deltas = closes.map((c, i) => i === 0 ? 0 : c - closes[i - 1])
  const gains = deltas.map(d => Math.max(0, d))
  const losses = deltas.map(d => Math.abs(Math.min(0, d)))
  
  let avgGain = 0, avgLoss = 0
  const rsi = []
  
  for (let i = 0; i < closes.length; i++) {
    if (i < PARAMS.rsiPeriod) {
      rsi.push(null)
      continue
    }
    
    if (i === PARAMS.rsiPeriod) {
      avgGain = gains.slice(0, PARAMS.rsiPeriod).reduce((a, b) => a + b, 0) / PARAMS.rsiPeriod
      avgLoss = losses.slice(0, PARAMS.rsiPeriod).reduce((a, b) => a + b, 0) / PARAMS.rsiPeriod
    } else {
      avgGain = (avgGain * (PARAMS.rsiPeriod - 1) + gains[i]) / PARAMS.rsiPeriod
      avgLoss = (avgLoss * (PARAMS.rsiPeriod - 1) + losses[i]) / PARAMS.rsiPeriod
    }
    
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
    rsi.push(100 - (100 / (1 + rs)))
  }
  
  return df.map((bar, i) => ({ ...bar, rsi: rsi[i] }))
}

function generateSignals(df, ledger) {
  const signals = []
  
  for (let i = 1; i < df.length; i++) {
    const bar = df[i]
    const prevBar = df[i - 1]
    const position = ledger.position(PARAMS.symbol)
    
    // Buy: RSI crosses below oversold threshold
    if (!position.open && bar.rsi !== null && prevBar.rsi !== null) {
      if (prevBar.rsi >= PARAMS.oversold && bar.rsi < PARAMS.oversold) {
        const amount = (ledger.cash * PARAMS.positionSize) / bar.close
        signals.push({ type: 'buy', symbol: PARAMS.symbol, amount, price: bar.close, timestamp: bar.timestamp })
        ledger.buy(PARAMS.symbol, amount, bar.close)
      }
      // Sell: RSI crosses above overbought threshold
      else if (prevBar.rsi <= PARAMS.overbought && bar.rsi > PARAMS.overbought) {
        signals.push({ type: 'sell', symbol: PARAMS.symbol, amount: position.amount, price: bar.close, timestamp: bar.timestamp })
        ledger.sell(PARAMS.symbol, position.amount, bar.close)
      }
    }
  }
  
  return signals
}

async function main(ledger, dataFetcher) {
  const df = await dataFetcher(PARAMS.symbol, PARAMS.timeframe)
  const data = computeIndicators(df)
  const signals = generateSignals(data, ledger)
  return { signals, equityCurve: ledger.equity }
}

module.exports = { main, PARAMS, computeIndicators, generateSignals }
\`\`\`
`

// ─── Risk Metrics ─────────────────────────────────────────────────────────────

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
    formula: 'Sortino = (R_p − R_f) / σ_downside\nσ_downside = std of returns < target (usually 0)',
    interpretation: '< 1.0 = poor | 1.0–2.0 = acceptable | 2.0–3.0 = good | > 3.0 = excellent',
    goodRange: '≥ 1.5 for live trading consideration',
    code: `daily_returns  = df['equity'].pct_change().dropna()
downside       = daily_returns[daily_returns < 0]
downside_std   = np.sqrt((downside**2).mean()) * np.sqrt(252)
annual_return  = (1 + daily_returns.mean())**252 - 1
sortino        = annual_return / (downside_std + 1e-10)`,
  },
  {
    id: 'max_drawdown',
    name: 'Maximum Drawdown',
    abbrev: 'Max DD',
    category: 'risk',
    description: 'Largest peak-to-trough decline in portfolio value. The most important risk metric for strategy survival. Always report as a percentage. Duration (how long to recover) is equally important.',
    formula: 'MaxDD = min(Equity_t / Peak_t − 1)  for all t\nDuration = longest time from peak to new peak',
    interpretation: '< 10% = low risk | 10–20% = moderate | 20–30% = high | > 30% = extreme',
    goodRange: '< 20% for most retail strategies; < 15% for conservative',
    code: `equity    = df['equity']
peak      = equity.expanding().max()
drawdown  = (equity - peak) / peak
max_dd    = drawdown.min()
# DD duration
underwater = (drawdown < 0).astype(int)
dd_periods = underwater.groupby((underwater != underwater.shift()).cumsum()).cumsum()
max_dd_duration = dd_periods.max()  # in bars`,
  },
  {
    id: 'calmar',
    name: 'Calmar Ratio',
    abbrev: 'Calmar',
    category: 'ratio',
    description: 'CAGR divided by maximum drawdown. Measures how much annual return you get per unit of worst-case risk. Higher is better. Preferred by many CTAs and fund managers over Sharpe.',
    formula: 'Calmar = CAGR / |Max Drawdown|',
    interpretation: '< 0.5 = poor | 0.5–1.0 = acceptable | 1.0–2.0 = good | > 2.0 = excellent',
    goodRange: '≥ 1.0 for live trading; ≥ 2.0 exceptional',
    code: `years       = len(df) / 252
total_ret   = df['equity'].iloc[-1] / df['equity'].iloc[0] - 1
cagr        = (1 + total_ret)**(1/years) - 1
peak        = df['equity'].expanding().max()
max_dd      = ((df['equity'] - peak) / peak).min()
calmar      = cagr / abs(max_dd)`,
  },
  {
    id: 'win_rate',
    name: 'Win Rate',
    abbrev: 'Win%',
    category: 'trade',
    description: 'Percentage of trades that are profitable. Does NOT tell you the strategy is good in isolation — a 30% win rate can be highly profitable with good risk/reward. Must be paired with average win/loss ratio.',
    formula: 'Win Rate = N_winning / N_total × 100',
    interpretation: 'Trend following: 35–45% typical | Mean reversion: 55–70% typical',
    goodRange: 'Win Rate × Avg Win > (1-Win Rate) × Avg Loss → positive expectancy',
    code: `trade_returns = []  # list of individual trade return %
wins = sum(r > 0 for r in trade_returns)
win_rate = wins / len(trade_returns)
avg_win  = np.mean([r for r in trade_returns if r > 0])
avg_loss = abs(np.mean([r for r in trade_returns if r < 0]))
profit_factor = (win_rate * avg_win) / ((1 - win_rate) * avg_loss)`,
  },
  {
    id: 'profit_factor',
    name: 'Profit Factor',
    abbrev: 'PF',
    category: 'trade',
    description: 'Ratio of gross profit to gross loss across all trades. Values above 1.5 suggest a good system. Very sensitive to outlier trades — check for large single wins that skew the result.',
    formula: 'PF = Σ(winning trades) / Σ(losing trades)',
    interpretation: '< 1.0 = losing system | 1.0–1.5 = marginal | 1.5–2.5 = good | > 2.5 = excellent',
    goodRange: '≥ 1.5 for live consideration; > 2.0 with 30+ trades is robust',
    code: `gross_profit = sum(r for r in trade_returns if r > 0)
gross_loss   = abs(sum(r for r in trade_returns if r < 0))
profit_factor = gross_profit / (gross_loss + 1e-10)`,
  },
  {
    id: 'cagr',
    name: 'CAGR — Compound Annual Growth Rate',
    abbrev: 'CAGR',
    category: 'return',
    description: 'Annualized geometric return, accounting for compounding. The standard way to compare returns across strategies with different holding periods. Always report net of all fees and slippage.',
    formula: 'CAGR = (End Value / Start Value)^(1/Years) − 1',
    interpretation: 'Broad market: 8–10% | Good strategy: 15–30% | Exceptional: > 30%',
    goodRange: 'CAGR / Max DD ≥ 1.0 is a basic quality gate',
    code: `years = len(df) / 252  # assumes daily bars
cagr  = (df['equity'].iloc[-1] / df['equity'].iloc[0])**(1/years) - 1`,
  },
  {
    id: 'exposure',
    name: 'Market Exposure',
    abbrev: 'Exposure%',
    category: 'trade',
    description: 'Percentage of time the strategy is invested (position != 0). Low exposure reduces market risk but reduces opportunities. Very high exposure on a long-only strategy provides little market timing benefit.',
    formula: 'Exposure = (bars with position ≠ 0) / total bars × 100',
    interpretation: 'Trend following: 60–80% | Mean reversion: 20–50% | Buy-and-hold: 100%',
    goodRange: 'Evaluate alongside return — high return at low exposure is efficient capital usage',
    code: `exposure_pct = (df['position'] != 0).mean() * 100  # % of time invested`,
  },
]

// ─── Backtesting Best Practices ───────────────────────────────────────────────

export const BACKTEST_GUIDE = {
  pitfalls: [
    {
      name: 'Look-Ahead Bias',
      severity: 'CRITICAL',
      description: 'Using future data in signal calculation. Occurs when indicators are computed on the full dataset before signal generation. Always use .shift(1) to ensure signals use only past data.',
      fix: 'Ensure entry signals are based on previous bar data: df.loc[condition.shift(1), "signal"] = 1',
    },
    {
      name: 'Survivorship Bias',
      severity: 'HIGH',
      description: 'Only backtesting on assets that survived (winners). Assets that went bankrupt or were delisted are excluded, inflating returns. Major issue when selecting stocks from today\'s index.',
      fix: 'Use point-in-time constituent lists, not current index membership. Accept that crypto backtests on "top 100" have survivorship bias.',
    },
    {
      name: 'Overfitting / Data Snooping',
      severity: 'HIGH',
      description: 'Optimizing parameters on all available data, then reporting those in-sample results as realistic. The more parameters you test, the more likely you find spurious fits.',
      fix: 'Use walk-forward analysis. Reserve the last 20–30% of data as out-of-sample test set, never optimize on it.',
    },
    {
      name: 'Ignoring Transaction Costs',
      severity: 'HIGH',
      description: 'Most strategies look excellent without fees. Crypto: ~0.1% per trade, Equities: ~0.01-0.05% + slippage. High-frequency strategies with 100+ trades/year are particularly sensitive.',
      fix: 'Include realistic fee + slippage. For crypto: 0.1% + 0.1% slippage = 0.2% round-trip. For equities: 0.05% + 0.05% slippage.',
    },
    {
      name: 'Insufficient History',
      severity: 'MEDIUM',
      description: 'Backtesting only on bull markets or a single regime. Strategies must survive different market conditions: bull runs, bear markets, crashes, and sideways periods.',
      fix: 'Minimum 2 years of data; prefer 5+ years covering at least one full market cycle.',
    },
    {
      name: 'Ignoring Slippage',
      severity: 'MEDIUM',
      description: 'Market impact from large orders or illiquid assets causes executed price to differ from signal price. More severe on smaller-cap assets and larger position sizes.',
      fix: 'Add 0.05–0.2% slippage per trade depending on asset liquidity. For crypto < top 20, use 0.3%+.',
    },
  ],
  walkForward: `Walk-Forward Analysis splits data into rolling train/test windows:

# Example: 252-bar train, 63-bar test (1yr train, 1 quarter test)
train_size = 252
test_size  = 63
results    = []

for start in range(0, len(df) - train_size - test_size, test_size):
    train = df.iloc[start : start + train_size]
    test  = df.iloc[start + train_size : start + train_size + test_size]

    # Optimize on train
    best_params = optimize_strategy(train)

    # Evaluate on test (out-of-sample)
    test_result = run_strategy(test, best_params)
    results.append(test_result)

# Aggregate out-of-sample results
oos_sharpe = np.mean([r.sharpe for r in results])
consistency = sum(1 for r in results if r.total_return > 0) / len(results)`,
  monteCarlo: `Monte Carlo simulation tests strategy robustness by running many random samples:

import numpy as np

def monte_carlo_backtest(daily_returns, n_sims=1000, sample_days=252):
    results = []
    returns_array = daily_returns.values

    for _ in range(n_sims):
        # Random contiguous time window
        start = np.random.randint(0, len(returns_array) - sample_days)
        sample = returns_array[start : start + sample_days]

        # Compute equity curve
        equity = np.cumprod(1 + sample)
        total_ret = equity[-1] - 1

        peak = np.maximum.accumulate(equity)
        max_dd = ((equity - peak) / peak).min()

        results.append({'return': total_ret, 'max_dd': max_dd})

    p5, p50, p95 = np.percentile([r['return'] for r in results], [5, 50, 95])
    return { 'p5': p5, 'median': p50, 'p95': p95,
             'beat_rate': sum(1 for r in results if r['return'] > 0) / n_sims }`,
}

// ─── Exports for AI system prompt ─────────────────────────────────────────────

export function buildAIContext(): string {
  const sources = DATA_SOURCES.map(s =>
    `- ${s.name}: ${s.description} Endpoint: ${s.endpoint} Rate limit: ${s.rateLimit}`
  ).join('\n')

  const strategies = STRATEGY_DOCS.map(s =>
    `- ${s.name} (${s.type}): ${s.description} Params: ${s.params.map(p => p.name).join(', ')}`
  ).join('\n')

  const metrics = RISK_METRICS.map(m =>
    `- ${m.name} (${m.abbrev}): ${m.goodRange}`
  ).join('\n')

  return `DATA SOURCES (all no-API-key required):
${sources}

STRATEGIES:
${strategies}

KEY METRICS:
${metrics}

SEAMLESS DATA INTEGRATION:
Use these APIs directly in code examples. All endpoints support CORS and return JSON:
- Binance: https://api.binance.com/api/v3/klines
- Yahoo: https://query1.finance.yahoo.com/v8/finance/chart/{symbol}
- CoinGecko: https://api.coingecko.com/api/v3/coins/{id}/ohlc
- Kraken: https://api.kraken.com/0/public/OHLC
- FRED: https://fred.stlouisfed.org/graph/fredgraph.csv
Example: const res = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=365')
}`
}
