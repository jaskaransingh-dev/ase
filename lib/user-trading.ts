/**
 * lib/user-trading.ts
 *
 * Per-user trade distribution and Kraken execution layer.
 * Uses HMAC-signed API keys from user_kraken_keys table.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { krakenClientForUser } from './kraken-client'

export async function syncAlpacaBalance(
  admin: SupabaseClient,
  userId: string,
  _alpacaAccountId?: string
): Promise<{ cash: number; equity: number; positions: Array<{ symbol: string; qty: number; marketValue: number }> }> {
  try {
    const client = await krakenClientForUser(userId)
    if (!client) throw new Error('No active Kraken keys')
    const balance = await client.getBalance()

    const positions = balance.positions
      .filter(p => p.asset !== 'USD')
      .map(p => ({
        symbol: p.asset,
        qty:    p.qty,
        marketValue: Math.round(p.usdValue * 100),
      }))

    const cashCents  = Math.round(balance.freeUsd * 100)
    const totalCents = Math.round(balance.cashUsd * 100)

    // Write both the kraken keys cache AND the wallets table so every
    // dashboard component reading `wallets` gets a live balance.
    await Promise.all([
      admin.from('user_kraken_keys').update({
        last_balance_usd: balance.cashUsd,
        updated_at: new Date().toISOString(),
      }).eq('user_id', userId),
      admin.from('wallets').upsert({
        user_id:       userId,
        balance_cents: cashCents,
        updated_at:    new Date().toISOString(),
      }, { onConflict: 'user_id' }),
    ])

    return { cash: cashCents, equity: totalCents, positions }
  } catch (err) {
    console.warn(`[syncAlpacaBalance] Failed for user ${userId}:`, err instanceof Error ? err.message : err)
    return { cash: 0, equity: 0, positions: [] }
  }
}

export interface TradeParams {
  symbol: string
  qty?: number
  notional?: number
  side: 'buy' | 'sell'
  type?: 'market' | 'limit'
  limit_price?: string
}

export interface UserPosition {
  user_id: string
  account_id: string
  shares: number
  invested_cents: number
  trading_enabled?: boolean
}

export async function getUsersWithHoldings(
  admin: SupabaseClient,
  agentId: string
): Promise<UserPosition[]> {
  const { data: holdings, error } = await admin
    .from('holdings')
    .select('user_id, shares, invested_cents, status')
    .eq('agent_id', agentId)
    .eq('status', 'active')

  if (error || !holdings?.length) return []

  const userIds = holdings.map(h => h.user_id)
  const { data: krakenKeys } = await admin
    .from('user_kraken_keys')
    .select('user_id, status')
    .eq('status', 'active')
    .in('user_id', userIds)

  // All holders are returned; trading_enabled marks whether live Kraken
  // execution is possible. Users without active keys get paper-logged.
  const activeKeySet = new Set((krakenKeys ?? []).map(k => k.user_id))

  return holdings.map(h => ({
    user_id: h.user_id,
    account_id: 'kraken',
    shares: Number(h.shares) || 0,
    invested_cents: Number(h.invested_cents) || 0,
    trading_enabled: activeKeySet.has(h.user_id),
  }))
}

export async function logUserTrade(
  admin: SupabaseClient,
  params: {
    userId: string
    agentId: string
    orderId: string
    symbol: string
    side: 'buy' | 'sell'
    qty: number
    fillPrice: number
    filledAt: string
    pnlCents?: number
    note?: string
    krakenTxid?: string
    broker?: string
  }
) {
  await admin.from('user_trades').insert({
    user_id:          params.userId,
    agent_id:         params.agentId,
    alpaca_order_id:  params.orderId,
    symbol:           params.symbol,
    side:             params.side,
    qty:              params.qty,
    fill_price:       params.fillPrice,
    filled_at:        params.filledAt,
    pnl_cents:        params.pnlCents,
    note:             params.note,
    kraken_txid:      params.krakenTxid ?? params.orderId,
    broker:           params.broker ?? 'kraken',
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
    const curr = positions.get(t.symbol) || { qty: 0, cost: 0 }
    if (t.side === 'buy') {
      curr.qty  += Number(t.qty)
      curr.cost += Number(t.qty) * Number(t.fill_price)
    } else {
      curr.qty  -= Number(t.qty)
      if (curr.qty <= 0) curr.cost = 0
    }
    positions.set(t.symbol, curr)
  }

  return Array.from(positions.entries())
    .filter(([, v]) => v.qty > 0)
    .map(([symbol, v]) => ({
      symbol,
      qty: v.qty,
      avg_entry: v.qty > 0 ? v.cost / v.qty : 0,
    }))
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
  account_id: string
  success: boolean
  orderId?: string
  filledQty?: number
  fillPrice?: number
  error?: string
  note?: string
}>> {
  const users = await getUsersWithHoldings(admin, agentId)
  if (!users.length) return []

  const totalInvested = users.reduce((s, u) => s + u.invested_cents, 0)
  if (totalInvested <= 0) return []

  const results: Array<{
    user_id: string
    account_id: string
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
      const userTrade = { ...tradeAction }

      if (tradeAction.notional) {
        userTrade.notional = Math.round(tradeAction.notional * allocationPct)
      } else if (tradeAction.qty) {
        userTrade.qty = tradeAction.qty * allocationPct
      }

      const minNotional = 1
      if (userTrade.notional !== undefined && userTrade.notional < minNotional) {
        await logUserTrade(admin, {
          userId:   user.user_id,
          agentId,
          orderId:  'pending-' + Date.now(),
          symbol:   userTrade.symbol,
          side:     userTrade.side,
          qty:      0,
          fillPrice: 0,
          filledAt: new Date().toISOString(),
          note:     `Allocation $${userTrade.notional?.toFixed(2)} queued`,
          broker:   'kraken',
        })
        results.push({ user_id: user.user_id, account_id: 'kraken', success: true, note: 'Queued' })
        continue
      }
      if (userTrade.qty !== undefined && userTrade.qty < 0.0001) continue

      // ── Execute on Kraken (or paper-log if no keys connected) ────────
      if (!user.trading_enabled) {
        // User has no active Kraken keys — record as a paper trade so their
        // position value tracking still works, but skip live execution.
        await logUserTrade(admin, {
          userId:   user.user_id,
          agentId,
          orderId:  'paper-' + Date.now(),
          symbol:   userTrade.symbol,
          side:     userTrade.side,
          qty:      userTrade.qty ?? 0,
          fillPrice: userTrade.fill_price ?? 0,
          filledAt: new Date().toISOString(),
          note:     'Paper trade — no Kraken keys connected',
          broker:   'paper',
        })
        results.push({ user_id: user.user_id, account_id: 'paper', success: true, note: 'Paper trade logged' })
        continue
      }

      const krakenClient = await krakenClientForUser(user.user_id)
      if (!krakenClient) {
        console.warn(`[distributeTradeToUsers] No active Kraken keys for user ${user.user_id}`)
        results.push({ user_id: user.user_id, account_id: 'kraken', success: false, error: 'No active Kraken keys' })
        continue
      }

      const order = await krakenClient.placeMarketOrder({
        aseSymbol: userTrade.symbol,
        side:      userTrade.side,
        volume:    userTrade.qty,
        notionalUsd: userTrade.notional ? userTrade.notional / 100 : undefined,
      })

      if (!order || order.status === 'rejected') {
        const rejErr = order?.error ?? 'Order rejected'
        const isTooSmall = rejErr.toLowerCase().includes('too small') || rejErr.toLowerCase().includes('minimum') || rejErr.toLowerCase().includes('eorder:below')
        if (isTooSmall) {
          console.log(`[distributeTradeToUsers] Order below Kraken minimum for user ${user.user_id} ($${(userTrade.notional ?? 0) / 100}). Queued for next cron run.`)
          await logUserTrade(admin, {
            userId:   user.user_id,
            agentId,
            orderId:  'queued-' + Date.now(),
            symbol:   userTrade.symbol,
            side:     userTrade.side,
            qty:      0,
            fillPrice: 0,
            filledAt: new Date().toISOString(),
            note:     `Below Kraken minimum — queued`,
            broker:   'kraken',
          })
          results.push({ user_id: user.user_id, account_id: 'kraken', success: true, note: 'Below Kraken minimum — queued for next run' })
        } else {
          console.error(`[distributeTradeToUsers] Order rejected for user ${user.user_id}: ${rejErr}`)
          results.push({ user_id: user.user_id, account_id: 'kraken', success: false, error: rejErr })
        }
        continue
      }

      const fillPriceUsd = order.filledPriceCents / 100
      console.log(`[distributeTradeToUsers] Kraken fill for user ${user.user_id}: ${order.filledQty}@${fillPriceUsd} txid=${order.orderId}`)

      await logUserTrade(admin, {
        userId:      user.user_id,
        agentId,
        orderId:     order.orderId,
        symbol:      userTrade.symbol,
        side:        userTrade.side,
        qty:         order.filledQty,
        fillPrice:   fillPriceUsd,
        filledAt:    new Date().toISOString(),
        note:        `${(allocationPct * 100).toFixed(1)}% allocation`,
        krakenTxid:  order.orderId,
        broker:      'kraken',
      })

      results.push({
        user_id:    user.user_id,
        account_id: 'kraken',
        success:    true,
        orderId:    order.orderId,
        filledQty:  order.filledQty,
        fillPrice:  fillPriceUsd,
      })
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      console.error(`[distributeTradeToUsers] Failed for user ${user.user_id}:`, error)
      results.push({ user_id: user.user_id, account_id: 'kraken', success: false, error })
    }
  }

  return results
}

// ── Aliases for backward compat ───────────────────────────────────────────
export const syncKrakenBalance = syncAlpacaBalance

export async function closeUserPosition(
  admin: SupabaseClient,
  _brokerAPI: unknown,
  _accountId: string,
  userId: string,
  agentId: string,
  symbol: string
): Promise<{ filledQty: number; fillPrice: number; pnlCents: number } | null> {
  const client = await krakenClientForUser(userId)
  if (!client) throw new Error('No active Kraken keys for this user')

  // Check DB records first
  const positions = await getUserPositions(admin, userId, agentId)
  const pos = positions.find(p => p.symbol === symbol)

  let qtyToSell = 0
  let avgEntry = 0

  if (pos && pos.qty > 0) {
    qtyToSell = pos.qty
    avgEntry = pos.avg_entry
  } else {
    // Fallback: read actual Kraken balance for this asset
    console.log(`[closeUserPosition] No DB record for ${symbol}, falling back to live Kraken balance`)
    const base = symbol.replace(/-USD$/, '').replace(/-.*$/, '')
    const balance = await client.getBalance()
    const krakenPos = balance.positions.find(p =>
      p.asset === base ||
      p.asset === `X${base}` ||
      p.asset.replace(/^X/, '') === base
    )
    if (!krakenPos || krakenPos.qty <= 0) {
      console.log(`[closeUserPosition] No position for ${symbol} (${base}) in Kraken for user ${userId}`)
      return null
    }
    qtyToSell = krakenPos.qty
    console.log(`[closeUserPosition] Kraken fallback: selling ${qtyToSell} ${base}`)
  }

  const order = await client.placeMarketOrder({ aseSymbol: symbol, side: 'sell', volume: qtyToSell })
  if (!order || order.status === 'rejected') {
    throw new Error(`Kraken market sell rejected: ${order?.error ?? 'unknown error'}`)
  }

  const fillPrice = order.filledPriceCents / 100
  const pnlCents = avgEntry > 0 ? Math.round(qtyToSell * (fillPrice - avgEntry) * 100) : 0

  await logUserTrade(admin, {
    userId, agentId,
    orderId: order.orderId,
    symbol, side: 'sell',
    qty: order.filledQty,
    fillPrice,
    filledAt: new Date().toISOString(),
    pnlCents,
    krakenTxid: order.orderId,
    broker: 'kraken',
    note: pos ? 'Position closed' : 'Position closed (Kraken balance fallback)',
  })

  return { filledQty: order.filledQty, fillPrice, pnlCents }
}
