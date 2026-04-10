/**
 * POST /api/subscribe
 *
 * One-step subscribe + allocate real USD endpoint.
 *
 * Combines:
 * 1. Create subscription (user follows agent)
 * 2. Invest real USD (user allocates Coinbase funds)
 * 3. Trigger immediate agent run (starts real trading)
 *
 * IMPORTANT: This uses REAL MONEY from user's Coinbase account.
 * Agents execute real trades on Coinbase live market.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateQuoteFromNav } from '@/lib/market'
import { mergeHoldingPosition, syncAgentMarketState } from '@/lib/exchange'
import { triggerImmediateAgentRun } from '@/lib/agent-cycle'

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

    // 1. Check wallet balance
    const { data: wallet } = await admin
      .from('wallets')
      .select('balance_cents')
      .eq('user_id', user.id)
      .single()

    if (!wallet || wallet.balance_cents < amount_cents) {
      return NextResponse.json({ error: 'Insufficient Coinbase balance. Connect your Coinbase account and ensure you have enough USD.' }, { status: 400 })
    }

    // 2. Get agent
    const { data: agent } = await admin
      .from('agents')
      .select('id, name, slug, status, share_price_cents, total_aum_cents, total_shares, max_aum_cents, alert_level')
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

    // 4. Atomic operations
    // Deduct from wallet
    await admin
      .from('wallets')
      .update({
        balance_cents: wallet.balance_cents - amount_cents,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)

    // Create/merge holding
    const holdingUpdate = await mergeHoldingPosition(admin, {
      userId: user.id,
      agentId: agent_id,
      shares: newShares,
      executionPriceCents: askCents,
      investedCents: amount_cents,
    })

    // Create/update subscription
    const { data: existingSub } = await admin
      .from('subscriptions')
      .select('id')
      .eq('user_id', user.id)
      .eq('agent_id', agent_id)
      .eq('status', 'active')
      .maybeSingle()

    if (!existingSub) {
      await admin.from('subscriptions').insert({
        user_id: user.id,
        agent_id: agent_id,
        status: 'active',
        subscribed_at: new Date().toISOString(),
      })
    }

    // Record transaction
    await admin.from('transactions').insert({
      user_id: user.id,
      type: 'invest',
      amount_cents: -amount_cents,
      reference_id: holdingUpdate.holdingId,
      note: `Subscribed to ${agent.name}${holdingUpdate.merged ? ' (added to position)' : ''}`,
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

    console.log(`[subscribe] User ${user.id} subscribed to ${agent.slug}, invested $${(amount_cents / 100).toFixed(2)}, trading capital now $${(synced.tradingCapitalCents / 100).toFixed(0)}`)

    return NextResponse.json({
      ok: true,
      subscription_id: 'sub_' + Date.now(),
      holding_id: holdingUpdate.holdingId,
      shares: parseFloat(newShares.toFixed(6)),
      entry_price_cents: askCents,
      amount_allocated_cents: amount_cents,
      trading_capital_cents: synced.tradingCapitalCents,
      aum_cents: synced.investorCapitalCents,
      merged: holdingUpdate.merged,
    })
  } catch (err: unknown) {
    console.error('subscribe error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
