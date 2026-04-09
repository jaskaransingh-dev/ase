/**
 * lib/coinbase-trade.ts
 *
 * Coinbase Exchange (Pro) REST API — replaces Alpaca for order execution.
 *
 * Supports sandbox (default) and production via env vars:
 *
 *   COINBASE_TRADE_KEY          API key from Coinbase Exchange / Advanced Trade
 *   COINBASE_TRADE_SECRET       Base64-encoded signing secret
 *   COINBASE_TRADE_PASSPHRASE   Passphrase set when creating the API key
 *   COINBASE_TRADE_SANDBOX      "false" for production (default: sandbox mode)
 *
 * Sandbox setup:
 *   1. Go to https://public.sandbox.exchange.coinbase.com
 *   2. Create account → request test funds via the "Deposit" feature
 *   3. Go to Settings → API → create key with trade permissions
 *   4. Copy the key / secret / passphrase into .env.local
 *
 * Production:
 *   Set COINBASE_TRADE_SANDBOX=false and use real Coinbase Advanced Trade keys.
 *
 * If no credentials are configured, the library runs in SIMULATION mode:
 *   orders are logged and a realistic fill is simulated using the current
 *   Yahoo Finance price. This is useful for development and testing.
 */

import { createHmac } from 'crypto'

// ─── Config ────────────────────────────────────────────────────────────────────

const SANDBOX_URL = 'https://api-public.sandbox.exchange.coinbase.com'
const PROD_URL    = 'https://api.exchange.coinbase.com'

function getBaseUrl(): string {
  return process.env.COINBASE_TRADE_SANDBOX === 'false' ? PROD_URL : SANDBOX_URL
}

function isConfigured(): boolean {
  return !!(
    process.env.COINBASE_TRADE_KEY &&
    process.env.COINBASE_TRADE_SECRET &&
    process.env.COINBASE_TRADE_PASSPHRASE
  )
}

// ─── Coinbase Pro product ID ────────────────────────────────────────────────────

/**
 * Convert internal symbol format to Coinbase product ID.
 * BTC/USD → BTC-USD, ETH-USD stays ETH-USD, LINK/USD → LINK-USD
 */
function toProductId(symbol: string): string {
  return symbol.replace('/', '-').toUpperCase()
}

// ─── HMAC auth ─────────────────────────────────────────────────────────────────

function buildAuthHeaders(
  method: string,
  path: string,
  body = ''
): Record<string, string> {
  const key        = process.env.COINBASE_TRADE_KEY!
  const secret     = process.env.COINBASE_TRADE_SECRET!
  const passphrase = process.env.COINBASE_TRADE_PASSPHRASE!
  const timestamp  = Math.floor(Date.now() / 1000).toString()
  const message    = `${timestamp}${method.toUpperCase()}${path}${body}`
  const secretBuf  = Buffer.from(secret, 'base64')
  const signature  = createHmac('sha256', secretBuf).update(message).digest('base64')

  return {
    'CB-ACCESS-KEY':        key,
    'CB-ACCESS-SIGN':       signature,
    'CB-ACCESS-TIMESTAMP':  timestamp,
    'CB-ACCESS-PASSPHRASE': passphrase,
    'Content-Type':         'application/json',
    'User-Agent':           'ASE-Agent/1.0',
  }
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CoinbaseFill {
  id:           string
  fill_price:   number
  filled_qty:   number
  status:       string   // 'filled' | 'done' | 'open' | 'pending' | 'rejected'
}

interface RawCoinbaseOrder {
  id:             string
  status:         string
  size:           string
  funds:          string
  filled_size:    string
  executed_value: string
  fill_fees:      string
  settled:        boolean
}

// ─── Order submission ──────────────────────────────────────────────────────────

/**
 * Submit a market order on Coinbase Exchange.
 *
 * @param params.symbol    e.g. "BTC/USD" or "ETH-USD"
 * @param params.side      'buy' | 'sell'
 * @param params.notional  USD to spend (buys)
 * @param params.qty       Units to sell (sells)
 */
export async function submitCoinbaseOrder(params: {
  symbol:    string
  side:      'buy' | 'sell'
  notional?: number
  qty?:      number
}): Promise<CoinbaseFill> {
  const productId = toProductId(params.symbol)

  // ── Simulation mode ──────────────────────────────────────────────────────────
  if (!isConfigured()) {
    const { getLatestCryptoPrice } = await import('./market-data')
    const price = (await getLatestCryptoPrice(params.symbol)) ?? 1
    const filledQty = params.qty ?? (params.notional ? params.notional / Math.max(price, 0.000001) : 0)

    console.log(`[coinbase-trade] SIMULATION ${params.side.toUpperCase()} ${filledQty.toFixed(6)} ${productId} @ $${price.toFixed(4)} (no credentials configured)`)

    return { id: `sim-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, fill_price: price, filled_qty: filledQty, status: 'filled' }
  }

  // ── Real order ───────────────────────────────────────────────────────────────
  const body: Record<string, string | boolean> = {
    product_id: productId,
    side:       params.side,
    type:       'market',
  }

  if (params.side === 'buy' && params.notional != null && params.notional > 0) {
    body.funds = params.notional.toFixed(2)
  } else if (params.qty != null && params.qty > 0) {
    body.size = params.qty.toFixed(8)
  } else {
    throw new Error(`submitCoinbaseOrder: must provide notional (buy) or qty (sell) for ${productId}`)
  }

  const bodyStr = JSON.stringify(body)
  const path    = '/orders'

  const res = await fetch(`${getBaseUrl()}${path}`, {
    method:  'POST',
    headers: buildAuthHeaders('POST', path, bodyStr),
    body:    bodyStr,
    signal:  AbortSignal.timeout(20_000),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Coinbase order failed (${res.status}): ${err}`)
  }

  const order: RawCoinbaseOrder = await res.json()
  return normalizeFill(order, params.qty)
}

// ─── Order polling ─────────────────────────────────────────────────────────────

export async function getCoinbaseOrder(orderId: string): Promise<CoinbaseFill> {
  if (orderId.startsWith('sim-')) {
    return { id: orderId, fill_price: 0, filled_qty: 0, status: 'filled' }
  }

  if (!isConfigured()) {
    return { id: orderId, fill_price: 0, filled_qty: 0, status: 'filled' }
  }

  const path = `/orders/${orderId}`
  const res = await fetch(`${getBaseUrl()}${path}`, {
    headers: buildAuthHeaders('GET', path),
    signal:  AbortSignal.timeout(10_000),
  })

  if (!res.ok) throw new Error(`getCoinbaseOrder error: ${res.status}`)
  const order: RawCoinbaseOrder = await res.json()
  return normalizeFill(order)
}

/** Poll until order fills or timeout */
export async function waitForCoinbaseFill(
  orderId: string,
  maxWaitMs = 20_000
): Promise<CoinbaseFill> {
  if (orderId.startsWith('sim-')) {
    return { id: orderId, fill_price: 0, filled_qty: 0, status: 'filled' }
  }

  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    const fill = await getCoinbaseOrder(orderId)
    if (['filled', 'done', 'settled'].includes(fill.status)) return fill
    await new Promise(r => setTimeout(r, 600))
  }
  return getCoinbaseOrder(orderId)
}

// ─── Pricing ───────────────────────────────────────────────────────────────────

/** Get current mid-price from Coinbase ticker (falls back to Yahoo Finance) */
export async function getCoinbasePrice(symbol: string): Promise<number | null> {
  const productId = toProductId(symbol)

  if (isConfigured()) {
    const path = `/products/${productId}/ticker`
    try {
      const res = await fetch(`${getBaseUrl()}${path}`, {
        headers: buildAuthHeaders('GET', path),
        signal:  AbortSignal.timeout(8_000),
      })
      if (res.ok) {
        const data = await res.json()
        const price = parseFloat(data.price)
        if (isFinite(price) && price > 0) return price
      }
    } catch { /* fall through */ }
  }

  // Fallback to Yahoo Finance
  const { getLatestCryptoPrice } = await import('./market-data')
  return getLatestCryptoPrice(symbol)
}

// ─── Health check ──────────────────────────────────────────────────────────────

/** Returns true if Coinbase (or simulation) is accessible */
export async function healthCheckCoinbase(): Promise<boolean> {
  try {
    // Public endpoint — no auth required — checks connectivity
    const res = await fetch(`${getBaseUrl()}/products/BTC-USD/ticker`, {
      signal: AbortSignal.timeout(5_000),
    })
    return res.ok
  } catch {
    return false
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function normalizeFill(order: RawCoinbaseOrder, fallbackQty?: number): CoinbaseFill {
  const filledQty = parseFloat(order.filled_size || '0') || (fallbackQty ?? 0)
  const executed  = parseFloat(order.executed_value || '0')
  const fillPrice = filledQty > 0 ? executed / filledQty : 0

  return {
    id:         order.id,
    fill_price: fillPrice,
    filled_qty: filledQty,
    status:     order.settled ? 'filled' : order.status,
  }
}
