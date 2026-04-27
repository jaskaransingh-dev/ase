/**
 * lib/kraken-client.ts
 *
 * Kraken REST client using user-supplied API key + secret.
 * Signs private requests with HMAC-SHA512 per Kraken spec.
 *
 * https://docs.kraken.com/rest/#section/Authentication
 *
 * Usage:
 *   const client = await krakenClientForUser(userId)
 *   const balance = await client.getBalance()
 *   const order = await client.placeMarketOrder({ pair: 'XBTUSD', side: 'buy', volume: 0.001 })
 */

import crypto from 'crypto'
import { createAdminClient } from './supabase/admin'
import { decryptAES } from './crypto/encryption'

const KRAKEN_API = 'https://api.kraken.com'

// ── Symbol mapping ───────────────────────────────────────────────────────
// ASE uses "BTC-USD" style (Yahoo). Kraken uses "XBTUSD"/"ETHUSD".
const SYMBOL_TO_KRAKEN: Record<string, string> = {
  'BTC-USD':  'XBTUSD',
  'ETH-USD':  'ETHUSD',
  'SOL-USD':  'SOLUSD',
  'BNB-USD':  'BNBUSD',
  'XRP-USD':  'XRPUSD',
  'ADA-USD':  'ADAUSD',
  'AVAX-USD': 'AVAXUSD',
  'DOT-USD':  'DOTUSD',
  'LINK-USD': 'LINKUSD',
  'UNI-USD':  'UNIUSD',
  'MATIC-USD':'MATICUSD',
  'ATOM-USD': 'ATOMUSD',
  'NEAR-USD': 'NEARUSD',
  'AAVE-USD': 'AAVEUSD',
  'MKR-USD':  'MKRUSD',
  'ARB-USD':  'ARBUSD',
  'OP-USD':   'OPUSD',
}

// Kraken returns balances with "asset names" like "XXBT", "XETH", "ZUSD".
// Map them back to our display names.
const ASSET_FROM_KRAKEN: Record<string, string> = {
  XXBT: 'BTC',  XBT: 'BTC',
  XETH: 'ETH',  ETH: 'ETH',
  ZUSD: 'USD',  USD: 'USD',
  XSOL: 'SOL',  SOL: 'SOL',
  XADA: 'ADA',  ADA: 'ADA',
  XXRP: 'XRP',  XRP: 'XRP',
}

export function aseSymbolToKraken(sym: string): string {
  return SYMBOL_TO_KRAKEN[sym.toUpperCase()] ?? sym.replace(/-/g, '').toUpperCase()
}

export function krakenAssetToBase(a: string): string {
  return ASSET_FROM_KRAKEN[a] ?? a
}

// ── Signing ──────────────────────────────────────────────────────────────

function signRequest(path: string, body: URLSearchParams, secretB64: string): string {
  const nonce = body.get('nonce') ?? ''
  const message = nonce + body.toString()
  const hashDigest = crypto.createHash('sha256').update(message).digest()
  const secretBuf = Buffer.from(secretB64, 'base64')
  const hmac = crypto.createHmac('sha512', secretBuf)
  hmac.update(path, 'binary')
  hmac.update(hashDigest)
  return hmac.digest('base64')
}

// ── Client ───────────────────────────────────────────────────────────────

export interface KrakenCreds {
  apiKey: string
  apiSecret: string
}

export interface KrakenBalance {
  cashUsd: number          // USD value of total holdings (free + locked)
  freeUsd: number          // USD-only balance
  positions: Array<{ asset: string; qty: number; usdValue: number }>
}

export interface KrakenOrderResult {
  orderId: string
  filledQty: number
  filledPriceCents: number
  status: 'filled' | 'pending' | 'rejected'
  error?: string
}

export interface KrakenTrade {
  txid: string
  ordertxid: string
  pair: string
  time: number     // unix seconds
  type: 'buy' | 'sell'
  ordertype: string
  price: number
  cost: number
  fee: number
  vol: number
}

export class KrakenClient {
  constructor(private creds: KrakenCreds) {}

  private async publicCall(method: string, params: Record<string, string> = {}): Promise<any> {
    const url = new URL(`${KRAKEN_API}/0/public/${method}`)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`Kraken public ${method} failed: ${res.status}`)
    const data = await res.json()
    if (data.error?.length) throw new Error(`Kraken: ${data.error.join(', ')}`)
    return data.result
  }

  private async privateCall(method: string, params: Record<string, string> = {}): Promise<any> {
    const path = `/0/private/${method}`
    const nonce = String(Date.now() * 1000)
    const body = new URLSearchParams({ nonce, ...params })
    const sig = signRequest(path, body, this.creds.apiSecret)

    const res = await fetch(`${KRAKEN_API}${path}`, {
      method: 'POST',
      headers: {
        'API-Key':       this.creds.apiKey,
        'API-Sign':      sig,
        'Content-Type':  'application/x-www-form-urlencoded',
        'User-Agent':    'ASE-Platform/1.0',
      },
      body: body.toString(),
    })

    const text = await res.text()
    let data: any
    try { data = JSON.parse(text) } catch { throw new Error(`Kraken non-JSON response: ${text.slice(0, 200)}`) }
    if (data.error?.length) throw new Error(`Kraken: ${data.error.join(', ')}`)
    return data.result
  }

  // ── Account ────────────────────────────────────────────────────────────

  async ping(): Promise<boolean> {
    try { await this.privateCall('Balance'); return true } catch { return false }
  }

  /**
   * Returns USD-denominated balance plus list of positions.
   * Uses Kraken Ticker to convert non-USD assets to USD.
   */
  async getBalance(): Promise<KrakenBalance> {
    const raw: Record<string, string> = await this.privateCall('Balance')

    const positions: Array<{ asset: string; qty: number; usdValue: number }> = []
    let freeUsd = 0
    const nonUsdAssets: Array<{ raw: string; base: string; qty: number }> = []

    for (const [krakenAsset, qtyStr] of Object.entries(raw)) {
      const qty = parseFloat(qtyStr)
      if (qty <= 0) continue
      const base = krakenAssetToBase(krakenAsset)
      if (base === 'USD') {
        freeUsd += qty
        positions.push({ asset: 'USD', qty, usdValue: qty })
      } else {
        nonUsdAssets.push({ raw: krakenAsset, base, qty })
      }
    }

    if (nonUsdAssets.length > 0) {
      // Build pair list for Ticker call
      const pairs = nonUsdAssets.map(a => aseSymbolToKraken(`${a.base}-USD`))
      try {
        const ticker = await this.publicCall('Ticker', { pair: pairs.join(',') })
        const tickerByBase: Record<string, number> = {}
        for (const [pair, info] of Object.entries(ticker as Record<string, any>)) {
          // Kraken returns pair names like "XXBTZUSD" or "XBTUSD". Match by suffix.
          const last = parseFloat(info.c?.[0] ?? '0')
          for (const a of nonUsdAssets) {
            const expected = aseSymbolToKraken(`${a.base}-USD`)
            if (pair.endsWith(expected) || pair === expected || pair.includes(a.base)) {
              tickerByBase[a.base] = last
            }
          }
        }
        for (const a of nonUsdAssets) {
          const px = tickerByBase[a.base] ?? 0
          const usd = a.qty * px
          positions.push({ asset: a.base, qty: a.qty, usdValue: usd })
        }
      } catch {
        for (const a of nonUsdAssets) positions.push({ asset: a.base, qty: a.qty, usdValue: 0 })
      }
    }

    const cashUsd = positions.reduce((s, p) => s + p.usdValue, 0)
    return { cashUsd, freeUsd, positions }
  }

  // ── Market data ────────────────────────────────────────────────────────

  async getPrice(aseSymbol: string): Promise<number | null> {
    try {
      const pair = aseSymbolToKraken(aseSymbol)
      const ticker = await this.publicCall('Ticker', { pair })
      const first = Object.values(ticker as Record<string, any>)[0] as any
      return parseFloat(first?.c?.[0] ?? '0') || null
    } catch { return null }
  }

  // ── Trading ────────────────────────────────────────────────────────────

  /**
   * Place a market order on a pair, sized in *base* asset units (volume).
   * Pass either `volume` (base units) or `notionalUsd` (USD value).
   */
  async placeMarketOrder(opts: {
    aseSymbol: string
    side: 'buy' | 'sell'
    volume?: number
    notionalUsd?: number
  }): Promise<KrakenOrderResult> {
    const pair = aseSymbolToKraken(opts.aseSymbol)

    let volume = opts.volume ?? 0
    if (!volume && opts.notionalUsd && opts.notionalUsd > 0) {
      const px = await this.getPrice(opts.aseSymbol)
      if (!px || px <= 0) {
        return { orderId: '', filledQty: 0, filledPriceCents: 0, status: 'rejected', error: 'price unavailable' }
      }
      volume = opts.notionalUsd / px
    }

    if (!volume || volume <= 0) {
      return { orderId: '', filledQty: 0, filledPriceCents: 0, status: 'rejected', error: 'invalid volume' }
    }

    try {
      const result = await this.privateCall('AddOrder', {
        pair,
        type:      opts.side,
        ordertype: 'market',
        volume:    volume.toFixed(8),
      })

      const txid = (result?.txid?.[0] as string) ?? ''
      // For market orders we estimate fill; the actual fill comes from QueryOrders/TradesHistory
      const px = await this.getPrice(opts.aseSymbol).catch(() => null)
      return {
        orderId:           txid,
        filledQty:         volume,
        filledPriceCents:  Math.round((px ?? 0) * 100),
        status:            'filled',
      }
    } catch (err) {
      return {
        orderId:          '',
        filledQty:        0,
        filledPriceCents: 0,
        status:           'rejected',
        error:            err instanceof Error ? err.message : 'unknown',
      }
    }
  }

  /**
   * Get recent fills for the account. Used to reconcile NAV after a trade.
   */
  async getRecentTrades(opts: { sinceUnix?: number; limit?: number } = {}): Promise<KrakenTrade[]> {
    try {
      const params: Record<string, string> = {}
      if (opts.sinceUnix) params.start = String(opts.sinceUnix)
      const result = await this.privateCall('TradesHistory', params)
      const trades: KrakenTrade[] = []
      const items = result?.trades ?? {}
      for (const [txid, t] of Object.entries(items as Record<string, any>)) {
        trades.push({
          txid,
          ordertxid: t.ordertxid,
          pair:      t.pair,
          time:      Number(t.time),
          type:      t.type,
          ordertype: t.ordertype,
          price:     parseFloat(t.price),
          cost:      parseFloat(t.cost),
          fee:       parseFloat(t.fee),
          vol:       parseFloat(t.vol),
        })
      }
      const sorted = trades.sort((a, b) => b.time - a.time)
      return opts.limit ? sorted.slice(0, opts.limit) : sorted
    } catch { return [] }
  }
}

// ── Loader from DB ───────────────────────────────────────────────────────

/**
 * Fetch a user's stored Kraken credentials and return a ready-to-use client.
 * Returns null if the user has no keys connected.
 */
export async function krakenClientForUser(userId: string): Promise<KrakenClient | null> {
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('user_kraken_keys')
    .select('encrypted_key, encrypted_secret, status')
    .eq('user_id', userId)
    .maybeSingle()

  if (!row || row.status !== 'active') return null

  try {
    const apiKey    = decryptAES(row.encrypted_key)
    const apiSecret = decryptAES(row.encrypted_secret)
    return new KrakenClient({ apiKey, apiSecret })
  } catch (err) {
    console.error('[kraken] decrypt failed for user', userId, err)
    return null
  }
}

/**
 * Quick helper used by API routes that want to verify keys before storing.
 */
export async function testKrakenCreds(creds: KrakenCreds): Promise<{ ok: boolean; error?: string; balanceUsd?: number }> {
  const client = new KrakenClient(creds)
  try {
    const b = await client.getBalance()
    return { ok: true, balanceUsd: b.cashUsd }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
  }
}
