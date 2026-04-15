import { SupabaseClient } from '@supabase/supabase-js'
import { createBrokerAPI } from './broker'
import { decryptAES } from './crypto/encryption'

/**
 * Get user's connected Alpaca credentials from connected_accounts table
 */
async function getUserAlpacaCredentials(
  admin: SupabaseClient,
  userId: string
): Promise<{ apiKey: string; apiSecret: string; accountId: string } | null> {
  const { data: connection } = await admin
    .from('connected_accounts')
    .select('id, access_token, refresh_token, api_key, api_secret, account_id')
    .eq('user_id', userId)
    .eq('provider', 'alpaca')
    .single()

  if (!connection) return null

  let apiKey = connection.api_key
  let apiSecret = connection.api_secret ? decryptAES(connection.api_secret) : null

  if (!apiSecret && connection.access_token) {
    apiSecret = decryptAES(connection.access_token)
  }

  if (!apiKey || !apiSecret) return null

  return { apiKey, apiSecret, accountId: connection.account_id }
}

/**
 * Get user's account info directly from Alpaca using their OAuth/API credentials
 */
async function getUserAccountDirect(
  userId: string,
  apiKey: string,
  apiSecret: string
): Promise<{ cash: number; equity: number; buying_power: number } | null> {
  const ALPACA_BASE_URL = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets'
  
  try {
    const res = await fetch(`${ALPACA_BASE_URL}/account`, {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret,
      },
    })

    if (!res.ok) return null

    const data = await res.json()
    return {
      cash: parseFloat(data.cash || '0') * 100,
      equity: parseFloat(data.portfolio_value || '0') * 100,
      buying_power: parseFloat(data.buying_power || '0') * 100,
    }
  } catch (error) {
    console.error('[getUserAccountDirect] Error:', error)
    return null
  }
}

/**
 * Place order directly on user's Alpaca account using their OAuth/API credentials
 */
async function placeOrderDirect(
  userId: string,
  apiKey: string,
  apiSecret: string,
  trade: {
    symbol: string
    side: 'buy' | 'sell'
    qty?: number
    notional?: number
  }
): Promise<{ orderId: string; fillPrice: number; filledQty: number; status: string } | null> {
  const ALPACA_BASE_URL = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets'
  
  const orderParams: Record<string, unknown> = {
    symbol: trade.symbol.replace('/', ''),
    side: trade.side,
    type: 'market',
    time_in_force: 'gtc',
  }

  if (trade.qty != null) {
    orderParams.qty = trade.qty.toFixed(8)
  }
  if (trade.notional != null) {
    orderParams.notional = trade.notional.toFixed(2)
  }

  try {
    const res = await fetch(`${ALPACA_BASE_URL}/orders`, {
      method: 'POST',
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderParams),
    })

    if (!res.ok) {
      console.error('[placeOrderDirect] Order failed:', await res.text())
      return null
    }

    const order = await res.json()
    const filledQty = parseFloat(order.filled_qty || '0')
    const fillPrice = parseFloat(order.filled_avg_price || '0')

    return {
      orderId: order.id,
      fillPrice,
      filledQty,
      status: order.status,
    }
  } catch (error) {
    console.error('[placeOrderDirect] Error:', error)
    return null
  }
}

/**
 * Sync Alpaca account balance and positions to database using user's connected credentials
 */
export async function syncAlpacaBalance(
  admin: SupabaseClient,
  userId: string,
  alpacaAccountId: string
): Promise<{ cash: number; equity: number; positions: any[] }> {
  const ALPACA_BASE_URL = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets'
  
  try {
    const credentials = await getUserAlpacaCredentials(admin, userId)
    if (!credentials) {
      throw new Error('No connected Alpaca account found')
    }

    const [accountRes, positionsRes] = await Promise.all([
      fetch(`${ALPACA_BASE_URL}/account`, {
        headers: {
          'APCA-API-KEY-ID': credentials.apiKey,
          'APCA-API-SECRET-KEY': credentials.apiSecret,
        },
      }),
      fetch(`${ALPACA_BASE_URL}/positions`, {
        headers: {
          'APCA-API-KEY-ID': credentials.apiKey,
          'APCA-API-SECRET-KEY': credentials.apiSecret,
        },
      }),
    ])

    const accountData = accountRes.ok ? await accountRes.json() : { cash: '0', portfolio_value: '0', buying_power: '0' }
    const positionsData = positionsRes.ok ? await positionsRes.json() : []

    const cashCents = Math.round(parseFloat(accountData.cash || '0') * 100)
    const equityCents = Math.round(parseFloat(accountData.portfolio_value || '0') * 100)

    await admin.from('account_balances').upsert({
      user_id: userId,
      provider: 'alpaca',
      equity_cents: equityCents,
      cash_cents: cashCents,
      buying_power_cents: Math.round(parseFloat(accountData.buying_power || '0') * 100),
      portfolio_value_cents: equityCents,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,provider',
    })

    console.log(`[syncAlpacaBalance] User ${userId}: cash=$${(cashCents/100).toFixed(2)}, equity=$${(equityCents/100).toFixed(2)}, positions=${positionsData.length || 0}`)

    return {
      cash: cashCents,
      equity: equityCents,
      positions: positionsData || [],
    }
  } catch (err) {
    console.error('[syncAlpacaBalance] Error syncing for user', userId, ':', err)
    throw err
  }
}

export interface TradeParams {
  symbol: string
  qty?: number
  notional?: number
  side: 'buy' | 'sell'
  type?: 'market' | 'limit' | 'stop' | 'stop_limit'
  time_in_force?: 'day' | 'gtc' | 'ioc' | 'fok'
  limit_price?: string
  stop_price?: string
}

export interface UserPosition {
  user_id: string
  alpaca_account_id: string
  shares: number
  invested_cents: number
  trading_enabled?: boolean
}

export async function getUsersWithHoldings(
  admin: SupabaseClient,
  agentId: string
): Promise<UserPosition[]> {
  console.log('[getUsersWithHoldings] Looking for holdings for agent:', agentId)
  const { data: holdings, error } = await admin
    .from('holdings')
    .select('user_id, shares, invested_cents, status')
    .eq('agent_id', agentId)
    .eq('status', 'active')

  console.log('[getUsersWithHoldings] Holdings found:', holdings?.length, 'error:', error)
  if (holdings) {
    console.log('[getUsersWithHoldings] Holdings details:', holdings.map(h => ({ user: h.user_id, shares: h.shares, invested: h.invested_cents, status: h.status })))
  }

  if (error || !holdings?.length) return []

  const userIds = holdings.map(h => h.user_id)
  const { data: accounts } = await admin
    .from('broker_accounts')
    .select('user_id, alpaca_account_id, status, trading_enabled')
    .in('user_id', userIds)

  console.log('[getUsersWithHoldings] Broker accounts found:', accounts?.length)
  if (accounts) {
    console.log('[getUsersWithHoldings] Accounts:', accounts.map(a => ({ user: a.user_id, alpaca: a.alpaca_account_id, status: a.status, enabled: a.trading_enabled })))
  }

  if (!accounts?.length) return []

  const accountMap = new Map(accounts.map(a => [a.user_id, a]))

  return holdings
    .filter(h => accountMap.has(h.user_id))
    .map(h => {
      const account = accountMap.get(h.user_id)!
      return {
        user_id: h.user_id,
        alpaca_account_id: account.alpaca_account_id,
        shares: Number(h.shares) || 0,
        invested_cents: Number(h.invested_cents) || 0,
        trading_enabled: account.trading_enabled,
      }
    })
}

export async function executeTradeOnUserAccount(
  brokerAPI: ReturnType<typeof createBrokerAPI>,
  accountId: string,
  trade: TradeParams
): Promise<{ orderId: string; fillPrice: number; filledQty: number; status: string }> {
  console.log(`[executeTradeOnUserAccount] Creating ${trade.side} order for ${trade.symbol}:`, {
    qty: trade.qty,
    notional: trade.notional,
    accountId,
  })

  const order = await brokerAPI.createOrder(accountId, {
    symbol: trade.symbol,
    qty: trade.qty?.toFixed(8),
    notional: trade.notional?.toFixed(2),
    side: trade.side,
    type: trade.type || 'market',
    time_in_force: trade.time_in_force || 'gtc',
    limit_price: trade.limit_price,
    stop_price: trade.stop_price,
  })

  console.log(`[executeTradeOnUserAccount] Order created:`, {
    orderId: order.id,
    status: order.status,
    filled_qty: order.filled_qty,
    filled_avg_price: order.filled_avg_price,
  })

  let fillPrice = 0
  let filledQty = 0
  let status = order.status

  if (order.filled_qty && parseFloat(order.filled_qty) > 0) {
    fillPrice = parseFloat(order.filled_avg_price || '0')
    filledQty = parseFloat(order.filled_qty)
    console.log(`[executeTradeOnUserAccount] Order immediately filled: ${filledQty}@${fillPrice}`)
  } else if (order.status === 'pending_new' || order.status === 'accepted') {
    // Order not immediately filled, wait a bit and check again
    await new Promise(r => setTimeout(r, 500))
    const closed = await brokerAPI.listOrders(accountId, { status: 'closed', limit: 50 })
    const filled = closed.orders?.find((o: any) => o.id === order.id)
    if (filled) {
      fillPrice = parseFloat(filled.filled_avg_price || '0')
      filledQty = parseFloat(filled.filled_qty || '0')
      status = filled.status
      console.log(`[executeTradeOnUserAccount] Order filled after check: ${filledQty}@${fillPrice}`)
    }
  }

  return { orderId: order.id, fillPrice, filledQty, status }
}

export async function logUserTrade(
  admin: SupabaseClient,
  params: {
    userId: string
    agentId: string
    alpacaOrderId: string
    symbol: string
    side: 'buy' | 'sell'
    qty: number
    fillPrice: number
    filledAt: string
    pnlCents?: number
    note?: string
  }
) {
  await admin.from('user_trades').insert({
    user_id: params.userId,
    agent_id: params.agentId,
    alpaca_order_id: params.alpacaOrderId,
    symbol: params.symbol,
    side: params.side,
    qty: params.qty,
    fill_price: params.fillPrice,
    filled_at: params.filledAt,
    pnl_cents: params.pnlCents,
    note: params.note,
  })
}

export async function getUserPositions(
  admin: SupabaseClient,
  userId: string,
  agentId: string
): Promise<Array<{ symbol: string; qty: number; avg_entry: number }>> {
  const { data: trades } = await admin
    .from('user_trades')
    .select('symbol, side, qty, fill_price')
    .eq('user_id', userId)
    .eq('agent_id', agentId)
    .not('filled_at', 'is', null)

  if (!trades?.length) return []

  const positions = new Map<string, { qty: number; cost: number }>()

  for (const t of trades) {
    const current = positions.get(t.symbol) || { qty: 0, cost: 0 }
    if (t.side === 'buy') {
      current.qty += Number(t.qty) || 0
      current.cost += (Number(t.qty) || 0) * Number(t.fill_price)
    } else {
      current.qty -= Number(t.qty) || 0
      current.cost = current.qty > 0 ? (current.cost * current.qty) / (current.qty + Number(t.qty)) : 0
    }
    positions.set(t.symbol, current)
  }

  return Array.from(positions.entries())
    .filter(([_, v]) => v.qty > 0)
    .map(([symbol, v]) => ({
      symbol,
      qty: v.qty,
      avg_entry: v.qty > 0 ? v.cost / v.qty : 0,
    }))
}

export async function closeUserPosition(
  admin: SupabaseClient,
  brokerAPI: ReturnType<typeof createBrokerAPI>,
  accountId: string,
  userId: string,
  agentId: string,
  symbol: string
): Promise<{ filledQty: number; fillPrice: number; pnlCents: number } | null> {
  const positions = await getUserPositions(admin, userId, agentId)
  const pos = positions.find(p => p.symbol === symbol)
  if (!pos || pos.qty <= 0) return null

  const { orderId, fillPrice, filledQty } = await executeTradeOnUserAccount(brokerAPI, accountId, {
    symbol,
    qty: pos.qty,
    side: 'sell',
  })

  const pnlCents = Math.round(filledQty * (fillPrice - pos.avg_entry) * 100)

  await logUserTrade(admin, {
    userId,
    agentId,
    alpacaOrderId: orderId,
    symbol,
    side: 'sell',
    qty: filledQty,
    fillPrice,
    filledAt: new Date().toISOString(),
    pnlCents,
    note: 'Position closed on user sell',
  })

  return { filledQty, fillPrice, pnlCents }
}

export async function getUserAccountBalance(
  admin: SupabaseClient,
  userId: string
): Promise<{ cash: number; equity: number; buying_power: number } | null> {
  const credentials = await getUserAlpacaCredentials(admin, userId)
  if (!credentials) return null

  const accountInfo = await getUserAccountDirect(userId, credentials.apiKey, credentials.apiSecret)
  if (!accountInfo) return null

  return {
    cash: accountInfo.cash,
    equity: accountInfo.equity,
    buying_power: accountInfo.buying_power,
  }
}

export async function distributeTradeToUsers(
  admin: SupabaseClient,
  agentId: string,
  tradeAction: {
    symbol: string
    side: 'buy' | 'sell'
    qty?: number
    notional?: number
    fill_price?: number
  },
  totalPoolCents: number
): Promise<Array<{
  user_id: string
  alpaca_account_id: string
  success: boolean
  orderId?: string
  filledQty?: number
  fillPrice?: number
  error?: string
  note?: string
}>> {
  console.log('[distributeTradeToUsers] Starting distribution for agent', agentId)
  const users = await getUsersWithHoldings(admin, agentId)
  console.log('[distributeTradeToUsers] Users found:', users.map(u => ({ user_id: u.user_id, invested: u.invested_cents, alpaca: u.alpaca_account_id })))
  if (!users.length) return []

  const totalInvested = users.reduce((sum, u) => sum + u.invested_cents, 0)
  console.log('[distributeTradeToUsers] Total invested:', totalInvested)
  if (totalInvested <= 0) return []

  const results: Array<{
    user_id: string
    alpaca_account_id: string
    success: boolean
    orderId?: string
    filledQty?: number
    fillPrice?: number
    error?: string
    note?: string
  }> = []

  for (const user of users) {
    try {
      const allocationPct = user.invested_cents / totalInvested
      console.log('[distributeTradeToUsers] User', user.user_id, 'allocation pct:', allocationPct, 'invested:', user.invested_cents)
      const userTrade = { ...tradeAction }

      if (tradeAction.notional) {
        userTrade.notional = Math.round(tradeAction.notional * allocationPct)
      } else if (tradeAction.qty) {
        userTrade.qty = tradeAction.qty * allocationPct
      }

      if (userTrade.notional && userTrade.notional < 1) {
        console.log(`[distributeTradeToUsers] User ${user.user_id} - notional $${userTrade.notional} < $1, logging allocation for cron`)
        await logUserTrade(admin, {
          userId: user.user_id,
          agentId,
          alpacaOrderId: 'pending-' + Date.now(),
          symbol: userTrade.symbol,
          side: userTrade.side,
          qty: 0,
          fillPrice: 0,
          filledAt: new Date().toISOString(),
          note: 'Allocated $' + userTrade.notional + ' pending trade',
        })
        results.push({
          user_id: user.user_id,
          alpaca_account_id: user.alpaca_account_id,
          success: true,
          note: 'Queued for cron execution',
        })
        continue
      }
      if (userTrade.qty && userTrade.qty < 0.0001) {
        console.log(`[distributeTradeToUsers] User ${user.user_id} - qty ${userTrade.qty} too small`)
        continue
      }

      const credentials = await getUserAlpacaCredentials(admin, user.user_id)
      if (!credentials) {
        console.error(`[distributeTradeToUsers] No credentials found for user ${user.user_id}`)
        results.push({
          user_id: user.user_id,
          alpaca_account_id: user.alpaca_account_id,
          success: false,
          error: 'No connected Alpaca account found',
        })
        continue
      }

      const result = await placeOrderDirect(user.user_id, credentials.apiKey, credentials.apiSecret, {
        symbol: userTrade.symbol,
        qty: userTrade.qty,
        notional: userTrade.notional,
        side: userTrade.side,
      })

      if (!result) {
        results.push({
          user_id: user.user_id,
          alpaca_account_id: user.alpaca_account_id,
          success: false,
          error: 'Failed to place order',
        })
        continue
      }

      // Only log trade if it actually executed
      if (result.filledQty > 0) {
        console.log(`[distributeTradeToUsers] Trade executed for user ${user.user_id}: ${result.filledQty}@${result.fillPrice}`)
        await logUserTrade(admin, {
          userId: user.user_id,
          agentId,
          alpacaOrderId: result.orderId,
          symbol: userTrade.symbol,
          side: userTrade.side,
          qty: result.filledQty,
          fillPrice: result.fillPrice,
          filledAt: new Date().toISOString(),
          note: `Distributed trade - ${(allocationPct * 100).toFixed(1)}% allocation (status: ${result.status})`,
        })
        results.push({
          user_id: user.user_id,
          alpaca_account_id: user.alpaca_account_id,
          success: true,
          orderId: result.orderId,
          filledQty: result.filledQty,
          fillPrice: result.fillPrice,
        })
      } else {
        console.warn(`[distributeTradeToUsers] Trade not filled for user ${user.user_id}:`, result)
        results.push({
          user_id: user.user_id,
          alpaca_account_id: user.alpaca_account_id,
          success: false,
          error: `Order not filled (status: ${result.status})`,
          orderId: result.orderId,
          filledQty: 0,
          fillPrice: 0,
        })
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      console.error(`[distributeTrade] Failed for user ${user.user_id}:`, error)
      results.push({
        user_id: user.user_id,
        alpaca_account_id: user.alpaca_account_id,
        success: false,
        error,
      })
    }
  }

  return results
}
