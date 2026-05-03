import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateQuoteFromNav } from '@/lib/market'
import { mergeHoldingPosition, syncAgentMarketState } from '@/lib/exchange'
import { triggerImmediateAgentRun } from '@/lib/agent-cycle'
import { krakenClientForUser } from '@/lib/kraken-client'
import { sendInvestConfirmation } from '@/lib/email'

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

    // Read wallet balance, then top up from live Kraken cash if the wallet is
    // stale. The dashboard shows Kraken balance directly, so if the user sees
    // $10 there but `wallets` is at 0 we need to refresh before checking — the
    // wallet table is just a cache, the Kraken account is source of truth.
    let { data: wallet } = await admin
      .from('wallets')
      .select('balance_cents')
      .eq('user_id', user.id)
      .single()

    if (!wallet || wallet.balance_cents < amount_cents) {
      try {
        const kraken = await krakenClientForUser(user.id)
        if (kraken) {
          const krakenBalance = await kraken.getBalance()
          const krakenCashCents = Math.round(((krakenBalance.freeUsd ?? krakenBalance.cashUsd ?? 0)) * 100)
          if (krakenCashCents > 0) {
            // Sync wallet to live Kraken cash so subsequent checks are honest.
            if (!wallet) {
              await admin.from('wallets').insert({ user_id: user.id, balance_cents: krakenCashCents })
              wallet = { balance_cents: krakenCashCents }
            } else if (wallet.balance_cents < krakenCashCents) {
              await admin.from('wallets').update({ balance_cents: krakenCashCents, updated_at: new Date().toISOString() }).eq('user_id', user.id)
              wallet = { balance_cents: krakenCashCents }
            }
          }
        }
      } catch (e) {
        console.warn('[invest] kraken sync skipped:', e instanceof Error ? e.message : e)
      }
    }

    if (!wallet || wallet.balance_cents < amount_cents) {
      return NextResponse.json({
        error: `Insufficient balance. Available: $${((wallet?.balance_cents ?? 0) / 100).toFixed(2)}. Connect Kraken or add funds.`,
        balance_cents: wallet?.balance_cents ?? 0,
      }, { status: 400 })
    }

    // Get agent with current share price
    const { data: agent } = await admin
      .from('agents')
      .select('id, slug, name, status, share_price_cents, total_aum_cents, total_shares, max_aum_cents, alert_level')
      .eq('id', agent_id)
      .single()

    if (!agent || agent.status !== 'active') {
      return NextResponse.json({ error: 'Agent not available' }, { status: 400 })
    }

    // Auto-delisting on hard drawdown is disabled — investments accepted
    // for any active agent regardless of alert_level. Manual delist via
    // status='delisted' is the only path that blocks new investments.

    // Check AUM capacity cap (White Paper Section 6)
    const maxAum = agent.max_aum_cents ?? 100_000_000
    const currentAum = agent.total_aum_cents ?? 0
    if (currentAum + amount_cents > maxAum) {
      return NextResponse.json({
        error: 'Agent is at capacity. No new investments accepted.',
        current_aum_cents: currentAum,
        max_aum_cents: maxAum,
      }, { status: 409 })
    }

    // Get latest NAV from agent_stats (most authoritative price source)
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

    // ── Atomic DB operations ────────────────────────────────────────

    // 1. Deduct from wallet
    await admin
      .from('wallets')
      .update({
        balance_cents: wallet.balance_cents - amount_cents,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)

    // 2. Merge into the user's active position for this agent.
    const holdingUpdate = await mergeHoldingPosition(admin, {
      userId: user.id,
      agentId: agent_id,
      shares: newShares,
      executionPriceCents: askCents,
      investedCents: amount_cents,
    })

    // 3. Record transaction
    await admin.from('transactions').insert({
      user_id: user.id,
      type: 'invest',
      amount_cents: -amount_cents,
      reference_id: holdingUpdate.holdingId,
      note: `Invested in ${agent.name}${holdingUpdate.merged ? ' (added to position)' : ''}`,
    })

    // Keep the subscription table in sync with the actual holding so dashboard views update correctly.
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

    // 4. Reprice the agent from actual capital in the pool plus carried P&L.
    const synced = await syncAgentMarketState(admin, {
      agentId: agent_id,
      previousInvestorCapitalCents: Number(agent.total_aum_cents) || 0,
      previousNavCents: navCents,
      volumeShares: newShares,
    })

    await triggerImmediateAgentRun(req, agent_id)

    // Fire-and-forget invest confirmation email
    const displayName = user.user_metadata?.name || user.user_metadata?.full_name || user.email || ''
    void sendInvestConfirmation({
      email: user.email!,
      name: displayName,
      agentName: agent.name,
      agentSlug: (agent as { slug?: string }).slug || agent.id,
      amountCents: amount_cents,
      shares: newShares,
      pricePerShareCents: askCents,
    }).catch(e => console.warn('[invest] email failed:', e instanceof Error ? e.message : e))

    return NextResponse.json({
      ok: true,
      holding_id: holdingUpdate.holdingId,
      shares: parseFloat(newShares.toFixed(6)),
      entry_price_cents: askCents,
      bid_cents: synced.bidCents,
      ask_cents: synced.askCents,
      nav_cents: synced.navCents,
      new_aum_cents: synced.investorCapitalCents,
      total_capital_cents: synced.tradingCapitalCents,
      merged: holdingUpdate.merged,
    })
  } catch (err: unknown) {
    console.error('invest error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
