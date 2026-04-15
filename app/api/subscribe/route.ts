/**
 * POST /api/subscribe
 *
 * One-step subscribe + allocate USD endpoint.
 *
 * 1. Verifies Alpaca account is connected
 * 2. Creates/updates a holding position
 * 3. Records the transaction
 * 4. Reprices the agent
 * 5. Triggers an immediate agent run
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateQuoteFromNav } from '@/lib/market'
import { mergeHoldingPosition, syncAgentMarketState, reserveCapitalAllocation } from '@/lib/exchange'
import { triggerImmediateAgentRun } from '@/lib/agent-cycle'
import { createBrokerAPI } from '@/lib/broker'
import { distributeTradeToUsers, getUsersWithHoldings } from '@/lib/user-trading'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { agent_id, amount_cents } = await req.json()
    if (!agent_id || !amount_cents || amount_cents < 1000) {
      return NextResponse.json({ error: 'Minimum investment is $10' }, { status: 400 })
    }

    const admin = createAdminClient()

    // 1. Check user's Alpaca account has sufficient balance
    const { data: brokerAccount } = await admin
      .from('broker_accounts')
      .select('alpaca_account_id')
      .eq('user_id', user.id)
      .single()

    if (!brokerAccount?.alpaca_account_id) {
      return NextResponse.json({
        error: 'No Alpaca account connected. Connect your Alpaca account before investing.',
      }, { status: 400 })
    }

    let alpacaCashCents = 0
    let alpacaCryptoStatus = 'INACTIVE'
    try {
      const brokerAPI = createBrokerAPI()
      const trading = await brokerAPI.getTradingAccount(brokerAccount.alpaca_account_id)
      alpacaCashCents = Math.round(parseFloat(trading.cash || '0') * 100)
      alpacaCryptoStatus = trading.crypto_status || 'INACTIVE'
      console.log(`[Subscribe] User ${user.id} Alpaca cash: $${(alpacaCashCents / 100).toFixed(2)}, crypto_status: ${alpacaCryptoStatus}`)
    } catch (e) {
      console.log('[Subscribe] Could not fetch Alpaca balance:', e)
      // Don't fail here - allow proceed with warning
    }

    // Verify sufficient balance - require exact match or require funding
    if (alpacaCashCents > 0 && alpacaCashCents < amount_cents) {
      const shortfall = (amount_cents - alpacaCashCents) / 100
      return NextResponse.json({
        error: `Insufficient Alpaca balance. You have $${(alpacaCashCents / 100).toFixed(2)} but need $${(amount_cents / 100).toFixed(2)}. Fund your Alpaca account by $${shortfall.toFixed(2)}.`,
        alpaca_balance_cents: alpacaCashCents,
        required_cents: amount_cents,
      }, { status: 400 })
    }

    // 2. Get agent
    const { data: agent } = await admin
      .from('agents')
      .select('id, name, slug, status, share_price_cents, total_aum_cents, total_shares, max_aum_cents, alert_level, primary_symbol')
      .eq('id', agent_id)
      .single()

    if (!agent || agent.status !== 'active') {
      return NextResponse.json({ error: 'Agent not available' }, { status: 400 })
    }

    // Check drawdown/alert level
    if (agent.alert_level === 'hard') {
      return NextResponse.json({ error: 'Agent is under hard drawdown alert — new investments suspended.' }, { status: 409 })
    }

    // Check AUM capacity
    const maxAum = agent.max_aum_cents ?? 100_000_000
    const currentAum = agent.total_aum_cents ?? 0
    if (currentAum + amount_cents > maxAum) {
      return NextResponse.json({ error: 'Agent is at capacity.' }, { status: 409 })
    }

    // Note: crypto_status is checked but not blocking - trades will execute when account is crypto-enabled
    const isCryptoAgent = agent.primary_symbol?.includes('/')

    // 3. Get latest NAV
    const { data: latestStats } = await admin
      .from('agent_stats')
      .select('nav_cents, bid_cents, ask_cents')
      .eq('agent_id', agent_id)
      .order('snapshot_at', { ascending: false })
      .limit(1)
      .single()

    const navCents = latestStats?.nav_cents ?? agent.share_price_cents ?? 10_000
    const quote = latestStats?.ask_cents && latestStats?.bid_cents
      ? { askCents: Number(latestStats.ask_cents), bidCents: Number(latestStats.bid_cents) }
      : calculateQuoteFromNav({
          navCents,
          totalPoolCents: Math.round((navCents / 10_000) * 1_000_000),
        })
    const askCents = quote.askCents
    const newShares = amount_cents / askCents

    // 3. Create/merge holding (no wallet deduction — Alpaca is the funding source)
    const holdingUpdate = await mergeHoldingPosition(admin, {
      userId: user.id,
      agentId: agent_id,
      shares: newShares,
      executionPriceCents: askCents,
      investedCents: amount_cents,
    })

    // Reserve capital allocation - this locks the capital in Alpaca for this agent
    // This is optional - if the migration hasn't run, we continue anyway
    let allocationId: string | null = null
    try {
      const allocation = await reserveCapitalAllocation(admin, {
        userId: user.id,
        agentId: agent_id,
        amountCents: amount_cents,
        alpacaAccountId: brokerAccount.alpaca_account_id,
      })
      allocationId = allocation.id
      console.log(`[Subscribe] Reserved capital allocation: ${allocation.id} for $${(amount_cents / 100).toFixed(2)}`)

      // Link capital allocation to holding if migration exists
      await admin
        .from('holdings')
        .update({
          capital_allocation_id: allocation.id,
        })
        .eq('id', holdingUpdate.holdingId)
    } catch (allocErr) {
      console.warn('[Subscribe] Capital allocation table may not exist yet (migration pending):', allocErr instanceof Error ? allocErr.message : allocErr)
      // Continue without it - the system works without capital allocations
    }

    // Create/update subscription so the agent appears immediately in dashboard views.
    await admin
      .from('subscriptions')
      .upsert({
        user_id: user.id,
        agent_id: agent_id,
        status: 'active',
        subscribed_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,agent_id',
      })

    // Record transaction
    await admin.from('transactions').insert({
      user_id: user.id,
      type: 'invest',
      amount_cents: -amount_cents,
      reference_id: holdingUpdate.holdingId,
      note: `Subscribed to ${agent.name}${holdingUpdate.merged ? ' (added to position)' : ''}${allocationId ? ` - Capital allocation: ${allocationId}` : ''}`,
    })

    // Reprice agent
    const synced = await syncAgentMarketState(admin, {
      agentId: agent_id,
      previousInvestorCapitalCents: Number(agent.total_aum_cents) || 0,
      previousNavCents: navCents,
      volumeShares: newShares,
    })

    // Trigger immediate agent run
    await triggerImmediateAgentRun(req, agent_id)

    // Execute a buy trade on user's account
    try {
      const users = await getUsersWithHoldings(admin, agent_id)
      const currentUser = users.find(u => u.user_id === user.id)
      if (currentUser && amount_cents >= 1000 && agent.primary_symbol) {
        console.log(`[subscribe] Executing immediate trade for user ${user.id} - ${agent.primary_symbol}`)
        const results = await distributeTradeToUsers(admin, agent_id, {
          symbol: agent.primary_symbol,
          side: 'buy',
          notional: amount_cents / 100,
        }, synced.tradingCapitalCents)
        console.log(`[subscribe] Trade results:`, results)
      }
    } catch (tradeErr) {
      console.error('[subscribe] Immediate trade failed, will retry in cron:', tradeErr)
    }

    console.log(`[subscribe] User ${user.id} subscribed to ${agent.slug}, invested $${(amount_cents / 100).toFixed(2)}, trading capital now $${(synced.tradingCapitalCents / 100).toFixed(0)}`)

    const response: Record<string, unknown> = {
      ok: true,
      subscription_id: 'sub_' + Date.now(),
      holding_id: holdingUpdate.holdingId,
      shares: parseFloat(newShares.toFixed(6)),
      entry_price_cents: askCents,
      amount_allocated_cents: amount_cents,
      trading_capital_cents: synced.tradingCapitalCents,
      aum_cents: synced.investorCapitalCents,
      merged: holdingUpdate.merged,
    }

    if (isCryptoAgent && alpacaCryptoStatus !== 'ACTIVE') {
      response.crypto_warning = 'Crypto trading is not enabled on your account. Trades will execute when enabled.'
      response.crypto_status = alpacaCryptoStatus
    }

    return NextResponse.json(response)
  } catch (err: unknown) {
    console.error('subscribe error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
