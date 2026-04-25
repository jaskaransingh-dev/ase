const ALPACA_BASE_URL = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets'
const ALPACA_DATA_URL = 'https://data.alpaca.markets'

export interface AlpacaOrder {
  id: string
  symbol: string
  side: 'buy' | 'sell'
  qty: string
  notional: string | null
  filled_qty: string
  filled_avg_price: string | null
  status: string
  created_at: string
  filled_at: string | null
}

export interface AlpacaPosition {
  symbol: string
  qty: string
  avg_entry_price: string
  current_price: string
  market_value: string
  unrealized_pl: string
  unrealized_plpc: string
}

export interface AlpacaPortfolio {
  equity: string
  cash: string
  portfolio_value: string
  last_equity: string
  buying_power: string
}

export interface AlpacaBar {
  t: string // timestamp ISO
  o: number // open
  h: number // high
  l: number // low
  c: number // close
  v: number // volume
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastError = ''
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, { ...options })
    if (res.ok || res.status !== 401) return res
    lastError = await res.text()
    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
    }
  }
  throw new Error(`Request failed after ${maxRetries + 1} attempts: ${lastError}`)
}

function getHeaders(apiKey?: string, secretKey?: string) {
  return {
    'APCA-API-KEY-ID': apiKey || process.env.ALPACA_KEY_ID!,
    'APCA-API-SECRET-KEY': secretKey || process.env.ALPACA_SECRET_KEY!,
    'Content-Type': 'application/json',
  }
}

export function isCrypto(symbol: string): boolean {
  return symbol.includes('/')
}

function toTradingSymbol(symbol: string): string {
  return isCrypto(symbol) ? symbol.replace('/', '') : symbol
}

// ── ACCOUNT ────────────────────────────────────────────────────────────────
export async function getAccount(apiKey?: string, secretKey?: string): Promise<AlpacaPortfolio> {
  const res = await fetch(`${ALPACA_BASE_URL}/v2/account`, {
    headers: getHeaders(apiKey, secretKey),
  })
  if (!res.ok) throw new Error(`Alpaca account error: ${res.status}`)
  return res.json()
}

// ── POSITIONS ──────────────────────────────────────────────────────────────
export async function getPositions(apiKey?: string, secretKey?: string): Promise<AlpacaPosition[]> {
  const res = await fetch(`${ALPACA_BASE_URL}/v2/positions`, {
    headers: getHeaders(apiKey, secretKey),
  })
  if (!res.ok) return []
  return res.json()
}

// ── ORDERS ─────────────────────────────────────────────────────────────────
export async function getOpenOrders(apiKey?: string, secretKey?: string): Promise<AlpacaOrder[]> {
  const res = await fetch(`${ALPACA_BASE_URL}/v2/orders?status=open`, {
    headers: getHeaders(apiKey, secretKey),
  })
  if (!res.ok) return []
  return res.json()
}

export async function getRecentOrders(apiKey?: string, secretKey?: string, limit = 20): Promise<AlpacaOrder[]> {
  const res = await fetch(`${ALPACA_BASE_URL}/v2/orders?status=closed&limit=${limit}`, {
    headers: getHeaders(apiKey, secretKey),
  })
  if (!res.ok) return []
  return res.json()
}

export async function getOrderHistory(apiKey?: string, secretKey?: string, status = 'all', limit = 100): Promise<AlpacaOrder[]> {
  const statusParam = status === 'all' ? '' : `&status=${status}`
  const res = await fetch(`${ALPACA_BASE_URL}/v2/orders?limit=${limit}${statusParam}`, {
    headers: getHeaders(apiKey, secretKey),
  })
  if (!res.ok) return []
  return res.json()
}

// Fetch a single order by ID (used to get fill price after submission)
export async function getOrder(orderId: string, apiKey?: string, secretKey?: string): Promise<AlpacaOrder> {
  const res = await fetch(`${ALPACA_BASE_URL}/v2/orders/${orderId}`, {
    headers: getHeaders(apiKey, secretKey),
  })
  if (!res.ok) throw new Error(`Get order ${orderId} error: ${res.status}`)
  return res.json()
}

// ── SUBMIT ORDER ───────────────────────────────────────────────────────────
export async function submitOrder(
  params: {
    symbol: string
    qty?: number       // fractional units (for sells)
    notional?: number  // USD value (for buys)
    side: 'buy' | 'sell'
    type?: string
    time_in_force?: string
  },
  apiKey?: string,
  secretKey?: string
): Promise<AlpacaOrder> {
  if (params.qty === undefined && params.notional === undefined) {
    throw new Error('submitOrder: must specify qty or notional')
  }

  const payload: Record<string, unknown> = {
    symbol: toTradingSymbol(params.symbol),
    side: params.side,
    type: params.type || 'market',
    time_in_force: params.time_in_force || 'gtc',
  }

  if (params.qty !== undefined) {
    payload.qty = Number(params.qty.toFixed(8))
  } else if (params.notional !== undefined) {
    payload.notional = Number(params.notional.toFixed(2))
  }

  const res = await fetchWithRetry(`${ALPACA_BASE_URL}/v2/orders`, {
    method: 'POST',
    headers: getHeaders(apiKey, secretKey),
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Alpaca order error: ${res.status} ${err}`)
  }

  return res.json()
}

// Cancel a single order
export async function cancelOrder(orderId: string, apiKey?: string, secretKey?: string): Promise<void> {
  await fetch(`${ALPACA_BASE_URL}/v2/orders/${orderId}`, {
    method: 'DELETE',
    headers: getHeaders(apiKey, secretKey),
  })
}

// Close an entire position by symbol
export async function closePosition(symbol: string, apiKey?: string, secretKey?: string): Promise<void> {
  await fetch(`${ALPACA_BASE_URL}/v2/positions/${symbol}`, {
    method: 'DELETE',
    headers: getHeaders(apiKey, secretKey),
  })
}

// ── PRICE DATA ─────────────────────────────────────────────────────────────

// ── SYNTHETIC BAR GENERATION ───────────────────────────────────────────────
// Alpaca paper trading often returns only 1–2 daily bars. When this happens,
// all strategies fail their minimum-bar checks and return SKIP. This function
// fills in the history with a realistic random walk anchored to the real price,
// allowing technical indicators (EMA, RSI, Bollinger, ATR, ADX, etc.) to compute.
//
// Method: Geometric Brownian Motion backwards from the earliest real bar.
//   • 2% daily volatility (0.8% hourly) — matches typical crypto vol
//   • 0.03% daily upward drift (small positive to avoid deflationary bias)
//   • OHLCV shaped realistically from the close price
//
// The synthetic bars are PREPENDED so the real bar(s) are always at the end,
// ensuring indicators are anchored to real current market prices.
function generateSyntheticBars(realBars: AlpacaBar[], totalNeeded: number, timeframe: string): AlpacaBar[] {
  if (realBars.length === 0) return []
  if (realBars.length >= totalNeeded) return realBars

  const synthCount = totalNeeded - realBars.length
  const anchorBar  = realBars[0]  // earliest real bar — work backwards from here
  const anchorTime = new Date(anchorBar.t).getTime()

  // Volatility depends on timeframe — NO DRIFT to avoid directional bias.
  // Previous bug: positive drift + backward division created systematic downtrend
  // in synthetic history, making strategies always see uptrends → always buy.
  const vol = timeframe === '1Hour' ? 0.008 : 0.02   // per-bar σ
  const msPerBar = timeframe === '1Hour' ? 3_600_000 : 86_400_000

  // Use seeded PRNG for deterministic bars (same symbol → same history each run)
  // This prevents indicators from flip-flopping between runs due to random noise.
  let seed = 0
  for (let i = 0; i < (realBars[0]?.t || '').length; i++) {
    seed = ((seed << 5) - seed + (realBars[0]?.t || 'x').charCodeAt(i % (realBars[0]?.t || 'x').length)) | 0
  }
  function seededRandom() {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff
    return seed / 0x7fffffff
  }

  const synthetic: AlpacaBar[] = []
  let price = anchorBar.o  // start from anchor open, walk backwards

  // Walk backwards: synthCount bars before the anchor
  // Use multiplicative model: price_{t-1} = price_t * exp(-vol * z)
  // With zero drift, this creates unbiased random walk — equal chance of
  // historical prices being above or below current price.
  for (let i = synthCount; i >= 1; i--) {
    // Box-Muller for a ~normal random variable
    const u1 = seededRandom() || 1e-10
    const u2 = seededRandom() || 1e-10
    const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)

    // Zero-drift geometric walk backward (unbiased)
    price = price * Math.exp(-vol * z)
    price = Math.max(price, 0.01)  // floor to prevent negatives

    // Shape OHLCV realistically around the close
    const swing = Math.abs(z) * vol * price * 0.5
    const high  = price + swing + price * 0.002
    const low   = Math.max(0.01, price - swing - price * 0.002)
    const open  = price + (seededRandom() - 0.5) * swing * 0.4
    const vol_  = 50 + seededRandom() * 500  // synthetic volume

    synthetic.push({
      t: new Date(anchorTime - i * msPerBar).toISOString(),
      o: +open.toFixed(6),
      h: +high.toFixed(6),
      l: +low.toFixed(6),
      c: +price.toFixed(6),
      v: +vol_.toFixed(2),
    })
  }

  // Sort ascending by time
  synthetic.sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime())

  const result = [...synthetic, ...realBars]
  console.log(`generateSyntheticBars: added ${synthCount} synthetic bars (unbiased) before ${realBars.length} real bars for total ${result.length}`)
  return result
}

// Crypto bars: uses v1beta3/crypto endpoint (NOT the stocks endpoint)
// Symbol: 'BTC/USD', 'ETH/USD', etc.
// Response: { bars: { 'BTC/USD': [ {t,o,h,l,c,v}, ... ] } }
//
// Uses data.alpaca.markets (the real-data API, not the paper trading API) which
// provides full historical crypto OHLCV going back years. A start date is calculated
// from `limit` so we always retrieve the requested number of bars.
//
// If Alpaca returns fewer bars than requested we return only the real bars we have.
// Trading decisions should never be based on synthetic price history.
export async function getCryptoBars(symbol: string, timeframe = '1Day', limit = 60): Promise<AlpacaBar[]> {
  const encodedSymbol = encodeURIComponent(symbol) // BTC/USD → BTC%2FUSD

  // Build a start date so the API returns enough bars.
  // Crypto trades 24/7 so every calendar day has a bar — pad by 20% to be safe.
  const start = new Date()
  if (timeframe === '1Day') {
    start.setDate(start.getDate() - Math.ceil(limit * 1.2))
  } else if (timeframe === '1Hour') {
    start.setHours(start.getHours() - Math.ceil(limit * 1.2))
  } else {
    // For any other timeframe just rely on limit
  }
  const startParam = `&start=${encodeURIComponent(start.toISOString())}`

  const res = await fetch(
    `${ALPACA_DATA_URL}/v1beta3/crypto/us/bars?symbols=${encodedSymbol}&timeframe=${timeframe}&limit=${limit}${startParam}&sort=asc`,
    {
      headers: {
        'APCA-API-KEY-ID': process.env.ALPACA_KEY_ID!,
        'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY!,
      },
    }
  )

  if (!res.ok) {
    const err = await res.text()
    console.error(`getCryptoBars error for ${symbol}:`, err)
    // Even on API error, if we have a known recent price we could generate
    // entirely synthetic bars. For now return empty — callers handle this.
    return []
  }

  const data = await res.json()
  const bars: AlpacaBar[] = data.bars?.[symbol] || []

  if (bars.length < limit) {
    console.warn(`[alpaca] ${symbol}: only ${bars.length}/${limit} real bars — ${bars.length < 10 ? 'indicators may be unreliable with synthetic history' : 'partial data returned'}`)
  }

  return bars
}

// Stock bars: uses v2/stocks endpoint
export async function getStockBars(symbol: string, timeframe = '1Day', limit = 252): Promise<AlpacaBar[]> {
  const res = await fetch(
    `${ALPACA_DATA_URL}/v2/stocks/${symbol}/bars?timeframe=${timeframe}&limit=${limit}&adjustment=raw`,
    {
      headers: {
        'APCA-API-KEY-ID': process.env.ALPACA_KEY_ID!,
        'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY!,
      },
    }
  )
  if (!res.ok) return []
  const data = await res.json()
  return data.bars || []
}

// Auto-dispatches to crypto or stock endpoint based on symbol format
export async function getBars(symbol: string, timeframe = '1Day', limit = 60): Promise<AlpacaBar[]> {
  return isCrypto(symbol)
    ? getCryptoBars(symbol, timeframe, limit)
    : getStockBars(symbol, timeframe, limit)
}

// Get latest quote for a crypto symbol
export async function getLatestCryptoPrice(symbol: string): Promise<number | null> {
  const bars = await getCryptoBars(symbol, '1Min', 1)
  return bars.length > 0 ? bars[bars.length - 1].c : null
}

// Retrieve a filled order from Alpaca, polling briefly for market fills.
export async function waitForFill(
  orderId: string,
  apiKey?: string,
  secretKey?: string,
  maxWaitMs = 15000
): Promise<AlpacaOrder> {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    const order = await getOrder(orderId, apiKey, secretKey)
    if (order.status === 'filled' || order.status === 'partially_filled') {
      return order
    }
    await new Promise(r => setTimeout(r, 500))
  }
  return getOrder(orderId, apiKey, secretKey)
}

// Market hours check (for equities — crypto is always open)
export function isTradingHours(): boolean {
  const now = new Date()
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const day = et.getDay()
  const hour = et.getHours()
  const minute = et.getMinutes()
  const timeInMinutes = hour * 60 + minute
  const marketOpen = 9 * 60 + 30
  const marketClose = 16 * 60
  return day >= 1 && day <= 5 && timeInMinutes >= marketOpen && timeInMinutes < marketClose
}
