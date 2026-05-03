/**
 * POST /api/holdings/sell
 *
 * Sell some or all shares in a holding.
 * 1. Validates holding belongs to user
 * 2. Prices at current bid
 * 3. Closes user's open Kraken positions proportionally
 * 4. Reduces or closes the holding record
 * 5. Reprices the agent market state
 * 6. Triggers cron run
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateQuoteFromNav } from '@/lib/market'
import { reduceHoldingPosition, syncAgentMarketState } from '@/lib/exchange'
import { triggerImmediateAgentRun } from '@/lib/agent-cycle'
import { getUserPositions, closeUserPosition } from '@/lib/user-trading'
import { sendSellConfirmation } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { holding_id, shares_to_sell } = body
    if (!holding_id) return NextResponse.json({ error: 'Missing holding_id' }, { status: 400 })

    const admin = createAdminClient()

    const { data: holding, error: holdingErr } = await admin
      .from('holdings')
      .select('*, agents(id, name, slug, share_price_cents, total_aum_cents, primary_symbol)')
      .eq('id', holding_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (holdingErr || !holding) {
      return NextResponse.json({ error: 'Holding not found or already closed' }, { status: 404 })
    }

    const agentId = holding.agent_id
    const totalShares = Number(holding.shares)
    const sellShares = shares_to_sell ? Math.min(Number(shares_to_sell), totalShares) : totalShares

    const { data: latestStats } = await admin
      .from('agent_stats')
      .select('nav_cents, bid_cents, ask_cents')
      .eq('agent_id', agentId)
      .order('snapshot_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const navCents = latestStats?.nav_cents ?? holding.agents?.share_price_cents ?? 10_000
    const quote = latestStats?.ask_cents && latestStats?.bid_cents
      ? { askCents: Number(latestStats.ask_cents), bidCents: Number(latestStats.bid_cents) }
      : calculateQuoteFromNav({
          navCents,
          totalPoolCents: Math.round((navCents / 10_000) * 1_000_000),
        })
    const bidCents = quote.bidCents
    const sellValue = Math.round(sellShares * bidCents)

    const reduction = await reduceHoldingPosition(admin, {
      holdingId: holding_id,
      sharesToSell: sellShares,
    })
    const pnlCents = sellValue - reduction.costBasisCents

    // Close open Kraken positions for this user/agent
    const closedPositions: Array<{ symbol: string; filledQty: number; fillPrice: number; pnlCents: number }> = []
    const { data: krakenRow } = await admin
      .from('user_kraken_keys')
      .select('status')
      .eq('user_id', user.id)
      .maybeSingle()

    if (krakenRow?.status === 'active') {
      const userPositions = await getUserPositions(admin, user.id, agentId)
      const openPositions = userPositions.filter(p => p.qty > 0)

      if (openPositions.length > 0) {
        for (const pos of openPositions) {
          try {
            const result = await closeUserPosition(admin, null, '', user.id, agentId, pos.symbol)
            if (result) {
              closedPositions.push({
                symbol: pos.symbol,
                filledQty: result.filledQty,
                fillPrice: result.fillPrice,
                pnlCents: result.pnlCents,
              })
            }
          } catch (posErr) {
            console.error(`[sell] Could not close Kraken position ${pos.symbol}:`, posErr instanceof Error ? posErr.message : posErr)
          }
        }
      } else {
        // No DB records — fall back to agent's primary symbol in Kraken balance
        const primarySymbol = holding.agents?.primary_symbol
        if (primarySymbol) {
          console.log(`[sell] No DB positions for user ${user.id} / agent ${agentId} — trying Kraken fallback on ${primarySymbol}`)
          try {
            const result = await closeUserPosition(admin, null, '', user.id, agentId, primarySymbol)
            if (result) {
              closedPositions.push({
                symbol: primarySymbol,
                filledQty: result.filledQty,
                fillPrice: result.fillPrice,
                pnlCents: result.pnlCents,
              })
            }
          } catch (posErr) {
            console.error(`[sell] Kraken fallback sell failed for ${primarySymbol}:`, posErr instanceof Error ? posErr.message : posErr)
          }
        }
      }
    }

    // Record transaction
    await admin.from('transactions').insert({
      user_id: user.id,
      type: 'divest',
      amount_cents: sellValue,
      reference_id: holding_id,
      note: `Sold ${sellShares.toFixed(4)} shares of ${holding.agents?.name} via Kraken`,
    })

    const synced = await syncAgentMarketState(admin, {
      agentId,
      previousInvestorCapitalCents: Number(holding.agents?.total_aum_cents) || 0,
      previousNavCents: navCents,
      volumeShares: sellShares,
    })

    void triggerImmediateAgentRun(req, agentId)

    // Fire-and-forget sell confirmation email
    const displayName = user.user_metadata?.name || user.user_metadata?.full_name || ''
    void sendSellConfirmation(
      user.email!,
      holding.agents?.name ?? 'Agent',
      sellValue,
      pnlCents,
      displayName,
    ).catch(e => console.warn('[sell] email failed:', e instanceof Error ? e.message : e))

    return NextResponse.json({
      ok: true,
      shares_sold: parseFloat(sellShares.toFixed(6)),
      returned_cents: sellValue,
      pnl_cents: pnlCents,
      nav_cents: synced.navCents,
      new_aum_cents: synced.investorCapitalCents,
      partial: reduction.partial,
      closed_positions: closedPositions,
    })
  } catch (err: unknown) {
    console.error('[sell] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
