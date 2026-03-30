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
// Supports both qty-based and notional (dollar-based) orders.
// Crypto requires time_in_force = 'gtc' (markets run 24/7).
export async function submitOrder(
  params: {
    symbol: string
    qty?: number       // fractional units (for sells)
    notional?: number  // USD value (for buys — Alpaca calculates qty)
    side: 'buy' | 'sell'
    type?: string
    time_in_force?: string
  },
  apiKey?: string,
  secretKey?: string
): Promise<AlpacaOrder> {
  const crypto = isCrypto(params.symbol)
  const body: Record<string, unknown> = {
    symbol: params.symbol,
    side: params.side,
    type: params.type || 'market',
    // Crypto is 24/7 — must use 'gtc', not 'day'
    time_in_force: params.time_in_force || (crypto ? 'gtc' : 'day'),
  }

  if (params.notional !== undefined && params.side === 'buy') {
    // Dollar-amount buy: e.g. buy $3000 of BTC/USD
    body.notional = params.notional.toFixed(2)
  } else if (params.qty !== undefined) {
    // Quantity-based: used for sells and small qty buys
    body.qty = String(params.qty)
  } else {
    throw new Error('submitOrder: must specify qty or notional')
  }

  const res = await fetch(`${ALPACA_BASE_URL}/v2/orders`, {
    method: 'POST',
    headers: getHeaders(apiKey, secretKey),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Alpaca order error: ${err}`)
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

// Crypto bars: uses v1beta3/crypto endpoint (NOT the stocks endpoint)
// Symbol: 'BTC/USD', 'ETH/USD', etc.
// Response: { bars: { 'BTC/USD': [ {t,o,h,l,c,v}, ... ] } }
//
// Uses data.alpaca.markets (the real-data API, not the paper trading API) which
// provides full historical crypto OHLCV going back years. A start date is calculated
// from `limit` so we always retrieve the requested number of bars.
export async function getCryptoBars(symbol: string, timeframe = '1Day', limit = 60): Promise<AlpacaBar[]> {
  const encodedSymbol = encodeURIComponent(symbol) // BTC/USD → BTC%2FUSD

  // Build a start date so the API returns enough bars.
  // Crypto trades 24/7 so every calendar day has a bar — pad by 10% to be safe.
  const start = new Date()
  if (timeframe === '1Day') {
    start.setDate(start.getDate() - Math.ceil(limit * 1.1))
  } else if (timeframe === '1Hour') {
    start.setHours(start.getHours() - Math.ceil(limit * 1.1))
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
    return []
  }

  const data = await res.json()
  const bars: AlpacaBar[] = data.bars?.[symbol] || []

  if (bars.length < 5) {
    console.warn(`getCryptoBars: only ${bars.length} bars returned for ${symbol} (requested ${limit})`)
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

// Wait briefly and fetch the filled order (paper trading fills in <1s usually)
export async function waitForFill(
  orderId: string,
  apiKey?: string,
  secretKey?: string,
  maxWaitMs = 3000
): Promise<AlpacaOrder> {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    const order = await getOrder(orderId, apiKey, secretKey)
    if (order.status === 'filled' || order.status === 'partially_filled') {
      return order
    }
    await new Promise(r => setTimeout(r, 500))
  }
  return getOrder(orderId, apiKey, secretKey) // Return whatever we have
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
