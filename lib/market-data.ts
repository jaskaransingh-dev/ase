/**
 * lib/market-data.ts
 *
 * Yahoo Finance price bar fetcher — replaces Alpaca for all market data.
 * Uses the same Yahoo Chart API v8 that the backtest engine uses for consistency.
 *
 * Drop-in compatible with Alpaca types so lib/agents.ts only needs an import swap.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

/** Same field names as AlpacaBar for zero-friction compatibility */
export interface PriceBar {
  t: string   // ISO 8601 timestamp
  o: number   // open
  h: number   // high
  l: number   // low
  c: number   // close
  v: number   // volume
}

/** Alias — code that imported AlpacaBar can swap the import and keep working */
export type AlpacaBar = PriceBar

export interface AlpacaOrder {
  id: string
  status: string
  filled_qty: string
  filled_avg_price: string | null
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Convert slash-format or dash-format to Yahoo Finance ticker */
function toYahooSymbol(sym: string): string {
  // BTC/USD → BTC-USD, ETH-USD stays ETH-USD
  return sym.replace('/', '-')
}

export function isCrypto(symbol: string): boolean {
  return /[/\-](USD|USDT|USDC)$/.test(symbol)
}

// ─── Yahoo Finance fetcher ─────────────────────────────────────────────────────

const YF_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']

function toBinanceSymbol(yahooSymbol: string): string | null {
  const m = yahooSymbol.match(/^([A-Z0-9]+)-USD$/)
  return m ? `${m[1]}USDT` : null
}

async function fetchBinancePrice(symbol: string): Promise<number | null> {
  const binanceSym = toBinanceSymbol(symbol)
  if (!binanceSym) return null
  
  try {
    const url = `https://api.binance.com/api/v3/ticker/price?symbol=${binanceSym}`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const data = await res.json() as { price: string }
    return parseFloat(data.price)
  } catch {
    return null
  }
}

async function fetchYahooBars(
  yahooSym: string,
  interval: string,   // '1d', '1h'
  periodStart: number, // unix seconds
  periodEnd: number    // unix seconds
): Promise<PriceBar[]> {
  for (const host of YF_HOSTS) {
    const url = `https://${host}/v8/finance/chart/${yahooSym}?interval=${interval}&period1=${periodStart}&period2=${periodEnd}`
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (ASE/1.0 market-data)' },
        signal: AbortSignal.timeout(12_000),
      })
      if (!res.ok) continue

      const json = await res.json()
      const result = json?.chart?.result?.[0]
      if (!result?.timestamp?.length) continue

      const q = result.indicators?.quote?.[0]
      if (!q) continue

      const bars: PriceBar[] = []
      for (let i = 0; i < result.timestamp.length; i++) {
        const c = q.close?.[i]
        if (c == null || !isFinite(c) || c <= 0) continue
        bars.push({
          t: new Date(result.timestamp[i] * 1000).toISOString(),
          o: q.open?.[i]   ?? c,
          h: q.high?.[i]   ?? c,
          l: q.low?.[i]    ?? c,
          c,
          v: q.volume?.[i] ?? 0,
        })
      }

      if (bars.length > 0) return bars
    } catch (err) {
      console.warn(`[market-data] Yahoo fetch error (${host}):`, err instanceof Error ? err.message : err)
      continue
    }
  }
  return []
}

// ─── Stooq OHLCV fetch (free equities/indices, no key) ───────────────────────
// Symbol format: AAPL.US, MSFT.US, ^SPX, ^NDX, BTC.USD, EURUSD

const STOOQ_SYMBOL_MAP: Record<string, string> = {
  'SPY':    'SPY.US',
  'QQQ':    'QQQ.US',
  'TLT':    'TLT.US',
  'GLD':    'GLD.US',
  'IWM':    'IWM.US',
  'AAPL':   'AAPL.US',
  'MSFT':   'MSFT.US',
  'GOOGL':  'GOOGL.US',
  'NVDA':   'NVDA.US',
  'META':   'META.US',
  'AMZN':   'AMZN.US',
  'TSLA':   'TSLA.US',
  'SPLV':   'SPLV.US',
  'XLK':    'XLK.US',
  'XLV':    'XLV.US',
  'XLF':    'XLF.US',
  '^GSPC':  '^SPX',
  '^DJI':   '^DJI',
  '^IXIC':  '^NDX',
}

async function fetchStooqBars(symbol: string, limit: number): Promise<PriceBar[]> {
  const stooqSym = STOOQ_SYMBOL_MAP[symbol] ?? symbol
  try {
    const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSym)}&i=d`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (ASE/1.0 market-data)' },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return []
    const csv = await res.text()
    const rows = csv.trim().split('\n').slice(1) // skip header
    if (rows.length === 0 || rows[0].startsWith('No data')) return []
    const bars: PriceBar[] = []
    for (const row of rows) {
      const parts = row.split(',')
      if (parts.length < 5) continue
      const c = parseFloat(parts[4])
      if (!isFinite(c) || c <= 0) continue
      bars.push({
        t: new Date(parts[0]).toISOString(),
        o: parseFloat(parts[1]) || c,
        h: parseFloat(parts[2]) || c,
        l: parseFloat(parts[3]) || c,
        c,
        v: parts[5] ? parseFloat(parts[5]) : 0,
      })
    }
    // Stooq returns newest-first, so reverse
    bars.reverse()
    return bars.slice(-limit)
  } catch {
    return []
  }
}

// ─── FRED macro data (no key, CSV endpoint) ───────────────────────────────────
// Series: DGS10 (10yr yield), VIXCLS (VIX), FEDFUNDS, CPIAUCSL, etc.

export interface MacroBar {
  t: string    // date ISO
  v: number    // value
}

export async function getFREDSeries(seriesId: string, limit = 252): Promise<MacroBar[]> {
  try {
    const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (ASE/1.0 macro-data)' },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return []
    const csv = await res.text()
    const rows = csv.trim().split('\n').slice(1)
    const bars: MacroBar[] = []
    for (const row of rows) {
      const [date, value] = row.split(',')
      const v = parseFloat(value)
      if (!isFinite(v)) continue
      bars.push({ t: new Date(date).toISOString(), v })
    }
    return bars.slice(-limit)
  } catch {
    return []
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

/** Fetch OHLCV bars for a symbol - tries multiple sources */
export async function getCryptoBars(
  symbol: string,
  timeframe: '1Day' | '1Hour' = '1Day',
  limit = 60
): Promise<PriceBar[]> {
  // Try Binance first for crypto pairs (more reliable)
  if (toBinanceSymbol(symbol)) {
    const binanceBars = await fetchBinanceBars(symbol, timeframe, limit)
    if (binanceBars.length > 0) return binanceBars
  }
  
  // Fallback to Yahoo Finance
  const yahooSym  = toYahooSymbol(symbol)
  const interval  = timeframe === '1Hour' ? '1h' : '1d'
  const daysBack  = timeframe === '1Hour'
    ? Math.ceil(limit / 20) + 5
    : limit + 15

  const end   = Math.floor(Date.now() / 1000)
  const start = end - daysBack * 86_400

  const bars = await fetchYahooBars(yahooSym, interval, start, end)
  if (bars.length > 0) return bars.slice(-limit)

  // For crypto: try CoinGecko
  if (toBinanceSymbol(symbol)) {
    const cgBars = await fetchCoinGeckoBars(symbol, limit)
    if (cgBars.length > 0) return cgBars
  }

  // For equities/indices: try Stooq
  if (!toBinanceSymbol(symbol) && timeframe === '1Day') {
    const stooqBars = await fetchStooqBars(symbol, limit)
    if (stooqBars.length > 0) return stooqBars
  }

  console.warn(`[market-data] No bars returned for ${symbol} (${timeframe}, limit=${limit})`)
  return []
}

// ─── Binance OHLCV fetch ─────────────────────────────────────────────────

async function fetchBinanceBars(symbol: string, timeframe: '1Day' | '1Hour', limit: number): Promise<PriceBar[]> {
  const binanceSym = toBinanceSymbol(symbol)
  if (!binanceSym) return []
  
  const interval = timeframe === '1Hour' ? '1h' : '1d'
  const end = Math.floor(Date.now() / 1000)
  const start = end - (limit + 20) * (timeframe === '1Hour' ? 3600 : 86400)
  
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSym}&interval=${interval}&startTime=${start * 1000}&endTime=${end * 1000}&limit=${limit + 20}`
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return []
    
    const data = await res.json() as Array<Array<number | string>>
    if (!Array.isArray(data) || data.length === 0) return []
    
    return data.slice(0, limit).map(k => ({
      t: new Date(k[0] as number).toISOString(),
      o: parseFloat(k[1] as string),
      h: parseFloat(k[2] as string),
      l: parseFloat(k[3] as string),
      c: parseFloat(k[4] as string),
      v: parseFloat(k[5] as string),
    }))
  } catch {
    return []
  }
}

// ─── CoinGecko OHLCV fetch (last resort) ─────────────────────────────────

const COINGECKO_IDS: Record<string, string> = {
  'BTC-USD': 'bitcoin',
  'ETH-USD': 'ethereum',
  'SOL-USD': 'solana',
  'BNB-USD': 'binancecoin',
  'XRP-USD': 'ripple',
  'ADA-USD': 'cardano',
  'DOGE-USD': 'dogecoin',
  'DOT-USD': 'polkadot',
  'MATIC-USD': 'matic-network',
  'LINK-USD': 'chainlink',
  'UNI-USD': 'uniswap',
  'AVAX-USD': 'avalanche-2',
}

async function fetchCoinGeckoBars(symbol: string, limit: number): Promise<PriceBar[]> {
  const cgId = COINGECKO_IDS[symbol]
  if (!cgId) return []
  
  const days = Math.ceil(limit / 2) + 10
  try {
    const url = `https://api.coingecko.com/api/v3/coins/${cgId}/ohlc?vs_currency=usd&days=${days}`
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return []
    
    const data = await res.json() as number[][]
    if (!Array.isArray(data) || data.length === 0) return []
    
    return data.slice(-limit).map(k => ({
      t: new Date(k[0]).toISOString(),
      o: k[1],
      h: k[2],
      l: k[3],
      c: k[4],
      v: 0,
    }))
  } catch {
    return []
  }
}

/** Alias for stocks (same implementation, different name for clarity) */
export const getStockBars = getCryptoBars

/** Unified dispatcher — same as Alpaca's getBars */
export const getBars = getCryptoBars

/** Latest closing price for a symbol */
export async function getLatestCryptoPrice(symbol: string): Promise<number | null> {
  // Try Binance first for crypto pairs
  if (toBinanceSymbol(symbol)) {
    const binancePrice = await fetchBinancePrice(symbol)
    if (binancePrice) return binancePrice
  }
  
  // Fallback to Yahoo Finance bars
  const bars = await getCryptoBars(symbol, '1Day', 2)
  return bars.length > 0 ? bars[bars.length - 1].c : null
}

// ─── Order Functions ─────────────────────────────────────────────────
// These now use Kraken for order execution.

export async function submitOrder(
  params: {
    symbol: string
    side: 'buy' | 'sell'
    qty?: number
    notional?: number
    type?: string
    time_in_force?: string
  },
  apiKey?: string,
  secretKey?: string
): Promise<AlpacaOrder> {
  const { submitOrder: alpacaSubmitOrder } = await import('./alpaca')
  const result = await alpacaSubmitOrder(params, apiKey, secretKey)
  return {
    id:               result.id,
    status:           result.status,
    filled_qty:       result.filled_qty,
    filled_avg_price: result.filled_avg_price,
  }
}

export async function waitForFill(
  orderId: string,
  apiKey?: string,
  secretKey?: string,
  maxWaitMs = 15_000
): Promise<AlpacaOrder> {
  const { waitForFill: alpacaWaitForFill } = await import('./alpaca')
  const result = await alpacaWaitForFill(orderId, apiKey, secretKey, maxWaitMs)
  return {
    id:               result.id,
    status:           result.status,
    filled_qty:       result.filled_qty,
    filled_avg_price: result.filled_avg_price,
  }
}

export function isTradingHours(): boolean {
  return true
}

/** Returns true if Yahoo Finance is accessible */
export async function healthCheckMarketData(): Promise<boolean> {
  for (const host of YF_HOSTS) {
    try {
      const url = `https://${host}/v8/finance/chart/BTC-USD?interval=1d&period1=0&period2=1`
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (ASE/1.0 health-check)' },
        signal: AbortSignal.timeout(8_000),
      })
      if (res.ok) return true
    } catch { continue }
  }
  return false
}
