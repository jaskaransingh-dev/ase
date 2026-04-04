import { SupabaseClient } from '@supabase/supabase-js'
import {
  BASE_SHARE_PRICE_CENTS,
  calculateHoldingValueCents,
  calculateNavFromState,
  calculateQuoteFromNav,
  estimatePnlFromNav,
} from './market'

type AdminClient = SupabaseClient

export async function mergeHoldingPosition(
  admin: AdminClient,
  params: {
    userId: string
    agentId: string
    shares: number
    executionPriceCents: number
    investedCents: number
  }
) {
  const shares = Number(params.shares) || 0
  const investedCents = Math.max(0, Math.round(params.investedCents || 0))
  const executionPriceCents = Math.max(1, Math.round(params.executionPriceCents || BASE_SHARE_PRICE_CENTS))

  const { data: existingHolding } = await admin
    .from('holdings')
    .select('id, shares, invested_cents')
    .eq('user_id', params.userId)
    .eq('agent_id', params.agentId)
    .eq('status', 'active')
    .maybeSingle()

  if (existingHolding) {
    const totalShares = Number(existingHolding.shares || 0) + shares
    const totalInvested = Number(existingHolding.invested_cents || 0) + investedCents
    const entryNavCents = totalShares > 0
      ? Math.round(totalInvested / totalShares)
      : executionPriceCents

    await admin
      .from('holdings')
      .update({
        shares: totalShares,
        invested_cents: totalInvested,
        entry_nav_cents: entryNavCents,
      })
      .eq('id', existingHolding.id)

    return { holdingId: existingHolding.id, merged: true, shares: totalShares, investedCents: totalInvested, entryNavCents }
  }

  const { data: inserted, error } = await admin
    .from('holdings')
    .insert({
      user_id: params.userId,
      agent_id: params.agentId,
      shares,
      entry_nav_cents: executionPriceCents,
      invested_cents: investedCents,
      current_value_cents: investedCents,
      status: 'active',
    })
    .select('id')
    .single()

  if (error) throw error

  return { holdingId: inserted.id, merged: false, shares, investedCents, entryNavCents: executionPriceCents }
}

export async function reduceHoldingPosition(
  admin: AdminClient,
  params: {
    holdingId: string
    sharesToSell: number
  }
) {
  const { data: holding, error } = await admin
    .from('holdings')
    .select('id, user_id, agent_id, shares, invested_cents, entry_nav_cents, status')
    .eq('id', params.holdingId)
    .eq('status', 'active')
    .single()

  if (error || !holding) {
    throw new Error('Holding not found or already closed')
  }

  const totalShares = Number(holding.shares || 0)
  const sharesToSell = Math.min(totalShares, Math.max(0, Number(params.sharesToSell) || 0))

  if (sharesToSell <= 0) {
    throw new Error('Sell quantity must be greater than zero')
  }

  const isFullSell = sharesToSell >= totalShares - 1e-8
  const costBasisCents = Math.round((sharesToSell / totalShares) * Number(holding.invested_cents || 0))

  if (isFullSell) {
    await admin
      .from('holdings')
      .update({
        status: 'sold',
        sold_at: new Date().toISOString(),
        shares: 0,
        invested_cents: 0,
        current_value_cents: 0,
      })
      .eq('id', holding.id)
  } else {
    const remainingShares = totalShares - sharesToSell
    const remainingInvested = Math.max(0, Number(holding.invested_cents || 0) - costBasisCents)
    const remainingEntryNavCents = remainingShares > 0
      ? Math.round(remainingInvested / remainingShares)
      : Number(holding.entry_nav_cents || 0)

    await admin
      .from('holdings')
      .update({
        shares: remainingShares,
        invested_cents: remainingInvested,
        entry_nav_cents: remainingEntryNavCents,
      })
      .eq('id', holding.id)
  }

  return {
    holding,
    totalShares,
    sharesToSell,
    costBasisCents,
    partial: !isFullSell,
  }
}

export async function syncAgentMarketState(
  admin: AdminClient,
  params: {
    agentId: string
    previousInvestorCapitalCents: number
    previousNavCents: number
    volumeShares?: number
  }
) {
  const [{ data: holdings }, { data: openOrders }] = await Promise.all([
    admin
      .from('holdings')
      .select('id, shares, invested_cents')
      .eq('agent_id', params.agentId)
      .eq('status', 'active'),
    admin
      .from('limit_orders')
      .select('side, notional_cents, shares')
      .eq('agent_id', params.agentId)
      .eq('status', 'open'),
  ])

  const investorCapitalCents = (holdings ?? []).reduce(
    (sum, holding) => sum + Math.max(0, Number(holding.invested_cents) || 0),
    0
  )
  const totalShares = (holdings ?? []).reduce((sum, holding) => sum + (Number(holding.shares) || 0), 0)
  const totalPnlCents = estimatePnlFromNav(params.previousNavCents, params.previousInvestorCapitalCents)
  const navState = calculateNavFromState({ investorCapitalCents, totalPnlCents })

  const pendingBuyCents = (openOrders ?? [])
    .filter(order => order.side === 'buy')
    .reduce((sum, order) => {
      if (order.notional_cents) return sum + Number(order.notional_cents)
      return sum + calculateHoldingValueCents(Number(order.shares) || 0, navState.navCents)
    }, 0)

  const pendingSellCents = (openOrders ?? [])
    .filter(order => order.side === 'sell')
    .reduce((sum, order) => {
      if (order.notional_cents) return sum + Number(order.notional_cents)
      return sum + calculateHoldingValueCents(Number(order.shares) || 0, navState.navCents)
    }, 0)

  const quote = calculateQuoteFromNav({
    navCents: navState.navCents,
    totalPoolCents: navState.totalPoolCents,
    pendingBuyCents,
    pendingSellCents,
  })

  await Promise.all([
    admin
      .from('agents')
      .update({
        total_aum_cents: investorCapitalCents,
        share_price_cents: navState.navCents,
        total_shares: totalShares,
      })
      .eq('id', params.agentId),
    Promise.all(
      (holdings ?? []).map(holding =>
        admin
          .from('holdings')
          .update({
            current_value_cents: calculateHoldingValueCents(Number(holding.shares) || 0, navState.navCents),
          })
          .eq('id', holding.id)
      )
    ),
    admin
      .from('price_ticks')
      .upsert({
        agent_id: params.agentId,
        tick_at: new Date().toISOString(),
        price_cents: navState.navCents,
        bid_cents: quote.bidCents,
        ask_cents: quote.askCents,
        volume: Number(params.volumeShares || 0),
      }, { onConflict: 'agent_id,tick_at' }),
  ])

  return {
    investorCapitalCents,
    totalShares,
    tradingCapitalCents: navState.tradingCapitalCents,
    navCents: navState.navCents,
    bidCents: quote.bidCents,
    askCents: quote.askCents,
    totalPoolCents: navState.totalPoolCents,
    totalPnlCents,
  }
}
