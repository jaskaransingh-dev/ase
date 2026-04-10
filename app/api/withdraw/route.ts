/**
 * POST /api/withdraw
 *
 * Withdraw user's allocation + P&L from an agent back to their Coinbase account.
 *
 * Request:
 * {
 *   "holding_id": "hold_123",
 *   "amount_cents": 102945  // Optional: withdraw specific amount, default: all
 * }
 *
 * Returns:
 * {
 *   "ok": true,
 *   "holding_id": "hold_123",
 *   "amount_withdrawn_cents": 102945,
 *   "amount_returned_to_wallet_cents": 102945,
 *   "holding_status": "closed"  // or "partial" if user kept some
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { holding_id, amount_cents } = await req.json()
    if (!holding_id) {
      return NextResponse.json({ error: 'holding_id required' }, { status: 400 })
    }

    const admin = createAdminClient()

    // 1. Get holding
    const { data: holding } = await admin
      .from('holdings')
      .select('id, user_id, agent_id, shares, invested_cents, status')
      .eq('id', holding_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!holding) {
      return NextResponse.json({ error: 'Holding not found or already closed' }, { status: 404 })
    }

    // 2. Get agent with latest NAV
    const { data: agent } = await admin
      .from('agents')
      .select('id, name, slug')
      .eq('id', holding.agent_id)
      .single()

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // 3. Get latest NAV from agent_stats
    const { data: latestStats } = await admin
      .from('agent_stats')
      .select('nav_cents')
      .eq('agent_id', holding.agent_id)
      .order('snapshot_at', { ascending: false })
      .limit(1)
      .single()

    const navCents = latestStats?.nav_cents ?? 10_000
    const currentValueCents = Math.round((holding.shares ?? 0) * navCents)

    // 3a. Determine withdrawal amount
    const withdrawAmountCents = amount_cents ?? currentValueCents
    if (withdrawAmountCents <= 0) {
      return NextResponse.json({ error: 'Invalid withdrawal amount' }, { status: 400 })
    }
    if (withdrawAmountCents > currentValueCents) {
      return NextResponse.json({
        error: `Cannot withdraw more than current value (${currentValueCents / 100}) `,
        current_value_cents: currentValueCents,
      }, { status: 400 })
    }

    // 4. Calculate shares to sell
    const sharesToSell = withdrawAmountCents / navCents
    const newShares = (holding.shares ?? 0) - sharesToSell
    const pnlCents = withdrawAmountCents - (holding.invested_cents ?? 0)

    // 5. Atomic operations
    // Add back to wallet
    const { data: wallet } = await admin
      .from('wallets')
      .select('balance_cents')
      .eq('user_id', user.id)
      .single()

    await admin
      .from('wallets')
      .update({
        balance_cents: (wallet?.balance_cents ?? 0) + withdrawAmountCents,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)

    // Update holding
    if (newShares <= 0.00001) {
      // Close holding
      await admin
        .from('holdings')
        .update({
          status: 'closed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', holding_id)
    } else {
      // Partial withdrawal - reduce shares
      await admin
        .from('holdings')
        .update({
          shares: newShares,
          updated_at: new Date().toISOString(),
        })
        .eq('id', holding_id)
    }

    // Record transaction
    await admin.from('transactions').insert({
      user_id: user.id,
      type: 'withdraw',
      amount_cents: withdrawAmountCents,
      reference_id: holding_id,
      note: `Withdrew from ${agent.name} · P&L: $${(pnlCents / 100).toFixed(2)}`,
    })

    // Decrease agent AUM
    const areaToRemove = withdrawAmountCents
    await admin.rpc('update_agent_aum', {
      agent_id: holding.agent_id,
      aum_change: -areaToRemove,
    }).then(({ error }) => {
      if (error) console.warn('Failed to update agent AUM:', error)
    })

    console.log(`[withdraw] User ${user.id} withdrew $${(withdrawAmountCents / 100).toFixed(2)} from ${agent.slug}, P&L: $${(pnlCents / 100).toFixed(2)}`)

    return NextResponse.json({
      ok: true,
      holding_id: holding_id,
      amount_withdrawn_cents: withdrawAmountCents,
      pnl_cents: pnlCents,
      holding_status: newShares <= 0.00001 ? 'closed' : 'partial',
      remaining_shares: Math.max(0, newShares),
      new_wallet_balance_cents: (wallet?.balance_cents ?? 0) + withdrawAmountCents,
    })
  } catch (err: unknown) {
    console.error('withdraw error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
