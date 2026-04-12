/**
 * lib/alpaca-user.ts
 *
 * Alpaca Trading API for user-connected accounts.
 * Uses the user's stored access token from connected_accounts table.
 */

import { createAdminClient } from './supabase/admin'
import { decryptAES } from './crypto/encryption'

const ALPACA_BASE_URL = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets'

export interface AlpacaPosition {
  asset_id: string
  symbol: string
  qty: string
  avg_entry_price: string
  side: string
  market_value: string
  cost_basis: string
  unrealized_pl: string
  unrealized_plpc: string
  current_price: string
  change_at: string
}

export interface AlpacaOrder {
  id: string
  client_order_id: string
  symbol: string
  side: 'buy' | 'sell'
  type: 'market' | 'limit' | 'stop' | 'stop_limit'
  time_in_force: 'day' | 'gtc' | 'ioc' | 'fok'
  qty: string
  filled_qty: string
  filled_avg_price: string
  status: 'new' | 'partially_filled' | 'filled' | 'canceled' | 'expired' | 'rejected' | 'pending_new'
  created_at: string
  updated_at: string
}

export interface AlpacaAccount {
  id: string
  account_number: string
  status: string
  currency: string
  cash: string
  portfolio_value: string
  buying_power: string
  pattern_day_trader: boolean
  trading_blocked: boolean
  transfers_blocked: boolean
  account_blocked: boolean
  equity: string
  last_equity: string
  long_market_value: string
  short_market_value: string
  initial_margin: string
  maintenance_margin: string
  daytrade_count_limit: number
  daytrade_count: number
}

async function getUserConnection(userId: string) {
  const admin = createAdminClient()
  
  const { data: connection } = await admin
    .from('connected_accounts')
    .select('id, access_token, refresh_token, api_key, api_secret, account_id')
    .eq('user_id', userId)
    .eq('provider', 'alpaca')
    .single()

  if (!connection) {
    throw new Error('No connected Alpaca account found')
  }

  // Check for direct API key first, then fall back to access token
  let apiKey = connection.api_key
  let apiSecret = connection.api_secret ? decryptAES(connection.api_secret) : null
  
  if (!apiSecret && connection.access_token) {
    apiSecret = decryptAES(connection.access_token)
  }
  
  if (!apiKey || !apiSecret) {
    throw new Error('Missing credentials')
  }
  
  return { apiKey, apiSecret, accountId: connection.account_id }
}

export async function getAccountInfo(userId: string): Promise<AlpacaAccount | null> {
  try {
    const { apiKey, apiSecret } = await getUserConnection(userId)
    
    const res = await fetch(`${ALPACA_BASE_URL}/v2/account`, {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret,
      },
    })

    if (!res.ok) {
      console.error('[Alpaca] Failed to get account:', await res.text())
      return null
    }

    return res.json()
  } catch (error) {
    console.error('[Alpaca] getAccountInfo error:', error)
    return null
  }
}

export async function getPositions(userId: string): Promise<AlpacaPosition[]> {
  try {
    const { apiKey, apiSecret } = await getUserConnection(userId)
    
    const res = await fetch(`${ALPACA_BASE_URL}/v2/positions`, {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret,
      },
    })

    if (!res.ok) {
      console.error('[Alpaca] Failed to get positions:', await res.text())
      return []
    }

    return res.json()
  } catch (error) {
    console.error('[Alpaca] getPositions error:', error)
    return []
  }
}

export async function placeOrder(params: {
  userId: string
  symbol: string
  side: 'buy' | 'sell'
  qty?: number
  notional?: number
  type?: 'market' | 'limit'
  limitPrice?: number
  timeInForce?: 'day' | 'gtc' | 'ioc'
}): Promise<AlpacaOrder | null> {
  try {
    const { apiKey, apiSecret } = await getUserConnection(params.userId)

    const orderParams: Record<string, unknown> = {
      symbol: params.symbol,
      side: params.side,
      type: params.type || 'market',
      time_in_force: params.timeInForce || 'day',
    }

    if (params.qty != null) {
      orderParams.qty = params.qty.toString()
    }

    if (params.notional != null) {
      orderParams.notional = params.notional.toString()
    }

    if (params.limitPrice != null) {
      orderParams.limit_price = params.limitPrice.toString()
    }

    const res = await fetch(`${ALPACA_BASE_URL}/v2/orders`, {
      method: 'POST',
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderParams),
    })

    if (!res.ok) {
      const error = await res.text()
      console.error('[Alpaca] Failed to place order:', error)
      return null
    }

    return res.json()
  } catch (error) {
    console.error('[Alpaca] placeOrder error:', error)
    return null
  }
}

export async function cancelOrder(userId: string, orderId: string): Promise<boolean> {
  try {
    const { apiKey, apiSecret } = await getUserConnection(userId)

    const res = await fetch(`${ALPACA_BASE_URL}/v2/orders/${orderId}`, {
      method: 'DELETE',
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret,
      },
    })

    return res.ok
  } catch (error) {
    console.error('[Alpaca] cancelOrder error:', error)
    return false
  }
}

export async function getOrders(userId: string, status?: 'open' | 'closed' | 'all'): Promise<AlpacaOrder[]> {
  try {
    const { apiKey, apiSecret } = await getUserConnection(userId)

    const url = new URL(`${ALPACA_BASE_URL}/v2/orders`)
    if (status) {
      url.searchParams.set('status', status)
    }

    const res = await fetch(url.toString(), {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret,
      },
    })

    if (!res.ok) {
      console.error('[Alpaca] Failed to get orders:', await res.text())
      return []
    }

    return res.json()
  } catch (error) {
    console.error('[Alpaca] getOrders error:', error)
    return []
  }
}

export async function healthCheckAlpaca(): Promise<boolean> {
  try {
    const res = await fetch(`${ALPACA_BASE_URL}/v2/account`, {
      method: 'HEAD',
    })
    return res.ok
  } catch {
    return false
  }
}