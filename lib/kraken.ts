/**
 * lib/kraken.ts
 *
 * Kraken Trading API for user-connected accounts.
 * Uses user's stored access token from connected_accounts table.
 */

import { createAdminClient } from './supabase/admin'
import { decryptAES, encryptAES } from './crypto/encryption'

const KRAKEN_API_BASE = 'https://api.kraken.com'

export interface KrakenPosition {
  pair: string
  type: 'long' | 'short'
  volume: string
  cost: string
  fee: string
  profit: string
  price: string
}

export interface KrakenOrder {
  id: string
  descr: string
  status: string
  type: string
  side: string
  volume: string
  price: string
  price2: string
  starttm: string
  expiretm: string
  ogen: string
  odrf: string
  trades: string[]
}

export interface KrakenBalance {
  [asset: string]: string
}

async function getUserConnection(userId: string) {
  const admin = createAdminClient()
  
  const { data: connection } = await admin
    .from('connected_accounts')
    .select('id, access_token, refresh_token, account_id')
    .eq('user_id', userId)
    .eq('provider', 'kraken')
    .single()

  if (!connection) {
    throw new Error('No connected Kraken account found')
  }

  const accessToken = connection.access_token ? decryptAES(connection.access_token) : null
  
  if (!accessToken) {
    throw new Error('Missing Kraken access token')
  }
  
  return { accessToken, accountId: connection.account_id }
}

export async function getAccountInfo(userId: string): Promise<{
  balance: number
  equity: number
  free: number
} | null> {
  try {
    const { accessToken } = await getUserConnection(userId)
    
    const res = await fetch(`${KRAKEN_API_BASE}/0/private/Balance`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    if (!res.ok) {
      console.error('[Kraken] Failed to get balance:', await res.text())
      return null
    }

    const data = await res.json()
    
    if (data.error && data.error.length > 0) {
      console.error('[Kraken] Balance error:', data.error)
      return null
    }

    // Calculate total balance in USD (simplified - use BTC as base)
    let totalBalance = 0
    for (const [asset, amount] of Object.entries(data.result || {})) {
      totalBalance += parseFloat(amount as string)
    }

    return {
      balance: Math.round(totalBalance * 100),
      equity: Math.round(totalBalance * 100),
      free: Math.round(totalBalance * 100),
    }
  } catch (error) {
    console.error('[Kraken] getAccountInfo error:', error)
    return null
  }
}

export async function getPositions(userId: string): Promise<KrakenPosition[]> {
  try {
    const { accessToken } = await getUserConnection(userId)
    
    const res = await fetch(`${KRAKEN_API_BASE}/0/private/OpenPositions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    if (!res.ok) {
      console.error('[Kraken] Failed to get positions:', await res.text())
      return []
    }

    const data = await res.json()
    
    if (data.error && data.error.length > 0) {
      console.error('[Kraken] Positions error:', data.error)
      return []
    }

    const positions: KrakenPosition[] = []
    for (const [txid, pos] of Object.entries(data.result || {})) {
      positions.push({
        pair: (pos as any).pair,
        type: (pos as any).type,
        volume: (pos as any).vol,
        cost: (pos as any).cost,
        fee: (pos as any).fee,
        profit: (pos as any).profit,
        price: (pos as any).price,
      })
    }

    return positions
  } catch (error) {
    console.error('[Kraken] getPositions error:', error)
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
}): Promise<{ orderId: string; filledPrice: number; filledQty: number } | null> {
  try {
    const { accessToken } = await getUserConnection(params.userId)
    
    // Convert symbol to Kraken pair format
    const pair = params.symbol.replace('/', '').toUpperCase() + 'USD'
    const volume = params.notional 
      ? (params.notional / 100).toString()  // USD to volume
      : params.qty?.toString() ?? '0'

    const orderType = params.type === 'limit' ? 'limit' : 'market'
    const price = params.limitPrice?.toString() ?? ''

    const res = await fetch(`${KRAKEN_API_BASE}/0/private/AddOrder`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        pair,
        type: params.side,
        ordertype: orderType,
        volume,
        ...(price && { price }),
      }),
    })

    if (!res.ok) {
      const error = await res.text()
      console.error('[Kraken] Failed to place order:', error)
      return null
    }

    const data = await res.json()
    
    if (data.error && data.error.length > 0) {
      console.error('[Kraken] Order error:', data.error)
      return null
    }

    const txid = Object.keys(data.result || {})[0]
    return {
      orderId: txid || '',
      filledPrice: parseFloat(price) || 0,
      filledQty: parseFloat(volume) || 0,
    }
  } catch (error) {
    console.error('[Kraken] placeOrder error:', error)
    return null
  }
}

export async function cancelOrder(userId: string, orderId: string): Promise<boolean> {
  try {
    const { accessToken } = await getUserConnection(userId)

    const res = await fetch(`${KRAKEN_API_BASE}/0/private/CancelOrder`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ txid: orderId }),
    })

    return res.ok
  } catch (error) {
    console.error('[Kraken] cancelOrder error:', error)
    return false
  }
}

export async function getOrders(userId: string): Promise<KrakenOrder[]> {
  try {
    const { accessToken } = await getUserConnection(userId)

    const res = await fetch(`${KRAKEN_API_BASE}/0/private/ClosedOrders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    if (!res.ok) {
      console.error('[Kraken] Failed to get orders:', await res.text())
      return []
    }

    const data = await res.json()
    
    if (data.error && data.error.length > 0) {
      console.error('[Kraken] Orders error:', data.error)
      return []
    }

    const orders: KrakenOrder[] = []
    for (const [txid, order] of Object.entries(data.result?.closed || {})) {
      orders.push({
        id: txid,
        ...(order as any),
      })
    }

    return orders
  } catch (error) {
    console.error('[Kraken] getOrders error:', error)
    return []
  }
}

export async function refreshToken(userId: string): Promise<boolean> {
  try {
    const admin = createAdminClient()
    
    const { data: connection } = await admin
      .from('connected_accounts')
      .select('id, refresh_token')
      .eq('user_id', userId)
      .eq('provider', 'kraken')
      .single()

    if (!connection?.refresh_token) return false

    const refreshToken = decryptAES(connection.refresh_token)
    const clientId = process.env.KRAKEN_CLIENT_ID
    const clientSecret = process.env.KRAKEN_CLIENT_SECRET

    if (!clientId || !clientSecret) return false

    const res = await fetch('https://auth.kraken.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })

    if (!res.ok) return false

    const tokens = await res.json()
    const encryptedAccess = encryptAES(tokens.access_token)
    const encryptedRefresh = encryptAES(tokens.refresh_token || refreshToken)

    await admin
      .from('connected_accounts')
      .update({
        access_token: encryptedAccess,
        refresh_token: encryptedRefresh,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id)

    return true
  } catch (error) {
    console.error('[Kraken] refreshToken error:', error)
    return false
  }
}