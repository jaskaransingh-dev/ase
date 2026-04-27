/**
 * POST /api/subscribe
 *
 * One-step subscribe + allocate USD from Kraken account.
 *
 * 1. Verifies user has active Kraken API keys
 * 2. Checks Kraken balance is sufficient
 * 3. Creates/updates holding position
 * 4. Records transaction
 * 5. Reprices the agent
 * 6. Executes an immediate buy trade on the user's Kraken account
 * 7. Triggers next cron agent run
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateQuoteFromNav } from '@/lib/market'
import { mergeHoldingPosition, syncAgentMarketState } from '@/lib/exchange'
import { triggerImmediateAgentRun } from '@/lib/agent-cycle'
import { krakenClientForUser } from '@/lib/kraken-client'
import { distributeTradeToUsers, getUsersWithHoldings } from '@/lib/user-trading'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { agent_id, amount_cents } = await req.json()
    if (!agent_id || !amount_cents || amount_cents < 100) {
      return NextResponse.json({ error: 'Minimum investment is $1' }, { status: 400 })
    }

    const admin = createAdminClient()

    // ── 1. Verify user has active Kraken keys ─────────────────────────────
    const { data: krakenRow } = await admin
      .from('user_kraken_keys')
      .select('status, last_balance_usd')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!krakenRow || krakenRow.status !== 'active') {
      return NextResponse.json({
        error: 'No Kraken API keys connected. Connect your Kraken account before investing.',
        redirect: '/dashboard/connect/kraken',
      }, { status: 400 })
    }

    // ── 2. Check Kraken balance ───────────────────────────────────────────
    let krakenFreeUsd = 0
    const client = await krakenClientForUser(user.id)
    if (client) {
      try {
        const balance = await client.getBalance()
        krakenFreeUsd = balance.freeUsd
        // Update cached balance
        await admin.from('user_kraken_keys').update({
          last_balance_usd: balance.cashUsd,
          updated_at: new Date().toISOString(),
        }).eq('user_id', user.id)
      } catch (e) {
        console.warn('[Subscribe] Could not fetch live Kraken balance, using cached:', e)
        krakenFreeUsd = Number(krakenRow.last_balance_usd ?? 0)
      }
    }

    const requiredUsd = amount_cents / 100
    if (krakenFreeUsd > 0 && krakenFreeUsd < requiredUsd) {
      return NextResponse.json({
        error: `Insufficient Kraken balance. You have $${krakenFreeUsd.toFixed(2)} but need $${requiredUsd.toFixed(2)}. Add funds to your Kraken account.`,
        kraken_balance_cents: Math.round(krakenFreeUsd * 100),
        required_cents: amount_cents,
      }, { status: 400 })
    }

    // ── 3. Get agent ──────────────────────────────────────────────────────
    const { data: agent } = await admin
      .from('agents')
      .select('id, name, slug, status, share_price_cents, total_aum_cents, total_shares, max_aum_cents, alert_level, primary_symbol')
      .eq('id', agent_id)
      .single()

    if (!agent || agent.status !== 'active') {
      return NextResponse.json({ error: 'Agent not available' }, { status: 400 })
    }

    if (agent.alert_level === 'hard') {
      return NextResponse.json({ error: 'Agent is under hard drawdown alert — new investments suspended.' }, { status: 409 })
    }

    const maxAum = agent.max_aum_cents ?? 100_000_000
    const currentAum = agent.total_aum_cents ?? 0
    if (currentAum + amount_cents > maxAum) {
      return NextResponse.json({ error: 'Agent is at capacity.' }, { status: 409 })
    }

    // ── 4. NAV + quote pricing ────────────────────────────────────────────
    const { data: latestStats } = await admin
      .from('agent_stats')
      .select('nav_cents, bid_cents, ask_cents')
      .eq('agent_id', agent_id)
      .order('snapshot_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const navCents = latestStats?.nav_cents ?? agent.share_price_cents ?? 10_000
    const quote = latestStats?.ask_cents && latestStats?.bid_cents
      ? { askCents: Number(latestStats.ask_cents), bidCents: Number(latestStats.bid_cents) }
      : calculateQuoteFromNav({
          navCents,
          totalPoolCents: Math.round((navCents / 10_000) * 1_000_000),
        })
    const askCents = quote.askCents
    const newShares = amount_cents / askCents

    // ── 5. Create/merge holding ───────────────────────────────────────────
    const holdingUpdate = await mergeHoldingPosition(admin, {
      userId: user.id,
      agentId: agent_id,
      shares: newShares,
      executionPriceCents: askCents,
      investedCents: amount_cents,
    })

    // ── 6. Upsert subscription ────────────────────────────────────────────
    await admin.from('subscriptions').upsert({
      user_id: user.id,
      agent_id,
      status: 'active',
      subscribed_at: new Date().toISOString(),
    }, { onConflict: 'user_id,agent_id' })

    // ── 7. Record transaction ─────────────────────────────────────────────
    await admin.from('transactions').insert({
      user_id: user.id,
      type: 'invest',
      amount_cents: -amount_cents,
      reference_id: holdingUpdate.holdingId,
      note: `Subscribed to ${agent.name}${holdingUpdate.merged ? ' (added to position)' : ''} via Kraken`,
    })

    // ── 8. Reprice agent ──────────────────────────────────────────────────
    const synced = await syncAgentMarketState(admin, {
      agentId: agent_id,
      previousInvestorCapitalCents: Number(agent.total_aum_cents) || 0,
      previousNavCents: navCents,
      volumeShares: newShares,
    })

    // ── 9. Execute immediate buy trade on Kraken ──────────────────────────
    let tradeResult: { orderId?: string; filledQty?: number; fillPrice?: number } = {}
    if (agent.primary_symbol && amount_cents >= 100) {
      try {
        const users = await getUsersWithHoldings(admin, agent_id)
        const isSubscribed = users.find(u => u.user_id === user.id)
        if (isSubscribed) {
          const results = await distributeTradeToUsers(admin, agent_id, {
            symbol: agent.primary_symbol,
            side: 'buy',
            notional: amount_cents,
          }, synced.tradingCapitalCents)
          const myResult = results.find(r => r.user_id === user.id)
          if (myResult?.success) {
            tradeResult = { orderId: myResult.orderId, filledQty: myResult.filledQty, fillPrice: myResult.fillPrice }
            console.log(`[Subscribe] Kraken trade executed: ${myResult.filledQty}@${myResult.fillPrice} txid=${myResult.orderId}`)
          }
        }
      } catch (tradeErr) {
        console.error('[Subscribe] Immediate trade failed, will retry in cron:', tradeErr)
      }
    }

    // ── 10. Trigger cron agent run ────────────────────────────────────────
    void triggerImmediateAgentRun(req, agent_id)

    console.log(`[Subscribe] ${user.id} → ${agent.slug}: $${requiredUsd.toFixed(2)} invested, ${newShares.toFixed(6)} shares @ $${(askCents / 100).toFixed(4)}`)

    return NextResponse.json({
      ok: true,
      holding_id: holdingUpdate.holdingId,
      shares: parseFloat(newShares.toFixed(6)),
      entry_price_cents: askCents,
      amount_allocated_cents: amount_cents,
      trading_capital_cents: synced.tradingCapitalCents,
      aum_cents: synced.investorCapitalCents,
      merged: holdingUpdate.merged,
      trade: tradeResult.orderId ? {
        order_id: tradeResult.orderId,
        filled_qty: tradeResult.filledQty,
        fill_price: tradeResult.fillPrice,
        broker: 'kraken',
      } : null,
    })
  } catch (err: unknown) {
    console.error('[subscribe] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
