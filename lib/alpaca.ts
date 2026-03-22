const ALPACA_BASE_URL = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets'
const ALPACA_DATA_URL = 'https://data.alpaca.markets'

export interface AlpacaOrder {
  id: string
  symbol: string
  side: 'buy' | 'sell'
  qty: string
  filled_qty: string
  filled_avg_price: string
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
}

export interface AlpacaBar {
  t: string // timestamp
  o: number
  h: number
  l: number
  c: number
  v: number
}

function getHeaders(apiKey?: string, secretKey?: string) {
  return {
    'APCA-API-KEY-ID': apiKey || process.env.ALPACA_KEY_ID!,
    'APCA-API-SECRET-KEY': secretKey || process.env.ALPACA_SECRET_KEY!,
    'Content-Type': 'application/json',
  }
}

export async function getAccount(apiKey?: string, secretKey?: string): Promise<AlpacaPortfolio> {
  const res = await fetch(`${ALPACA_BASE_URL}/v2/account`, {
    headers: getHeaders(apiKey, secretKey),
  })
  if (!res.ok) throw new Error(`Alpaca account error: ${res.status}`)
  return res.json()
}

export async function getPositions(apiKey?: string, secretKey?: string): Promise<AlpacaPosition[]> {
  const res = await fetch(`${ALPACA_BASE_URL}/v2/positions`, {
    headers: getHeaders(apiKey, secretKey),
  })
  if (!res.ok) return []
  return res.json()
}

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

export async function submitOrder(params: {
  symbol: string
  qty: number
  side: 'buy' | 'sell'
  type?: string
  time_in_force?: string
}, apiKey?: string, secretKey?: string): Promise<AlpacaOrder> {
  const res = await fetch(`${ALPACA_BASE_URL}/v2/orders`, {
    method: 'POST',
    headers: getHeaders(apiKey, secretKey),
    body: JSON.stringify({
      symbol: params.symbol,
      qty: params.qty,
      side: params.side,
      type: params.type || 'market',
      time_in_force: params.time_in_force || 'day',
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Alpaca order error: ${err}`)
  }
  return res.json()
}

export async function closePosition(symbol: string, apiKey?: string, secretKey?: string): Promise<void> {
  await fetch(`${ALPACA_BASE_URL}/v2/positions/${symbol}`, {
    method: 'DELETE',
    headers: getHeaders(apiKey, secretKey),
  })
}

export async function getBars(symbol: string, timeframe = '1Day', limit = 252): Promise<AlpacaBar[]> {
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
