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

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch OHLCV bars for a crypto or stock symbol.
 *
 * @param symbol    e.g. "BTC/USD", "ETH-USD", "SOL/USD", "LINK-USD"
 * @param timeframe '1Day' | '1Hour'
 * @param limit     how many bars to return (most recent N)
 */
export async function getCryptoBars(
  symbol: string,
  timeframe: '1Day' | '1Hour' = '1Day',
  limit = 60
): Promise<PriceBar[]> {
  const yahooSym  = toYahooSymbol(symbol)
  const interval  = timeframe === '1Hour' ? '1h' : '1d'
  const daysBack  = timeframe === '1Hour'
    ? Math.ceil(limit / 20) + 5   // ~20 hourly bars per trading day
    : limit + 15                   // daily — add buffer for weekends/holidays

  const end   = Math.floor(Date.now() / 1000)
  const start = end - daysBack * 86_400

  const bars = await fetchYahooBars(yahooSym, interval, start, end)

  if (bars.length === 0) {
    console.warn(`[market-data] No bars returned for ${symbol} (${timeframe}, limit=${limit})`)
  }

  return bars.slice(-limit)
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
// These use Alpaca for order execution.

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
