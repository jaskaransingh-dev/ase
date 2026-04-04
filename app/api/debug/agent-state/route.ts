/**
 * GET /api/debug/agent-state?slug=btc-momentum
 *
 * Debug endpoint to inspect agent state and capital calculations.
 * Shows: agent record, holdings, agent_stats, calculated pool, expected NAV.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const INITIAL_CAPITAL_CENTS = 1_000_000 // $10k
const BASE_NAV_CENTS = 10_000 // $100

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug')
  if (!slug) {
    return NextResponse.json({ error: 'Missing slug param' }, { status: 400 })
  }

  try {
    const admin = createAdminClient()

    // 1. Get agent record
    const { data: agent } = await admin
      .from('agents')
      .select('*')
      .eq('slug', slug)
      .single()

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // 2. Get all active holdings for this agent
    const { data: holdings } = await admin
      .from('holdings')
      .select('id, user_id, shares, invested_cents, current_value_cents, entry_nav_cents, status')
      .eq('agent_id', agent.id)

    // 3. Get latest agent_stats
    const { data: latestStats } = await admin
      .from('agent_stats')
      .select('*')
      .eq('agent_id', agent.id)
      .order('snapshot_at', { ascending: false })
      .limit(1)
      .single()

    // 4. Calculate totals
    const activeHoldings = (holdings ?? []).filter(h => h.status === 'active')
    const totalInvestedCents = activeHoldings.reduce((s, h) => s + Number(h.invested_cents), 0)
    const totalCurrentValueCents = activeHoldings.reduce((s, h) => s + (Number(h.current_value_cents) || 0), 0)

    // 5. Get agent's PnL from trades
    const { data: trades } = await admin
      .from('agent_trades')
      .select('pnl_cents')
      .eq('agent_id', agent.id)
      .not('pnl_cents', 'is', null)

    const totalRealizedPnl = trades?.reduce((s, t) => s + (Number(t.pnl_cents) || 0), 0) || 0

    // 6. Calculate expected values
    const storedAumCents = Number(agent.total_aum_cents) || 0
    const expectedPoolCents = INITIAL_CAPITAL_CENTS + storedAumCents + totalRealizedPnl
    const expectedNavCents = Math.round((expectedPoolCents / INITIAL_CAPITAL_CENTS) * BASE_NAV_CENTS)
    const expectedNavUsd = (expectedNavCents / 100).toFixed(2)

    // 7. Compare with stored values
    const storedNavCents = latestStats?.nav_cents ?? agent.share_price_cents ?? 10_000
    const storedNavUsd = (storedNavCents / 100).toFixed(2)

    return NextResponse.json({
      agent: {
        id: agent.id,
        slug: agent.slug,
        name: agent.name,
        status: agent.status,
        stored_share_price_cents: agent.share_price_cents,
        stored_total_aum_cents: agent.total_aum_cents,
      },
      holdings: {
        count: activeHoldings.length,
        total_shares: activeHoldings.reduce((s, h) => s + Number(h.shares), 0),
        total_invested_cents: totalInvestedCents,
        total_invested_usd: (totalInvestedCents / 100).toFixed(2),
        total_current_value_cents: totalCurrentValueCents,
        total_current_value_usd: (totalCurrentValueCents / 100).toFixed(2),
        list: activeHoldings.map(h => ({
          id: h.id,
          shares: parseFloat((Number(h.shares) || 0).toFixed(6)),
          invested_cents: h.invested_cents,
          invested_usd: (Number(h.invested_cents) / 100).toFixed(2),
          current_value_cents: h.current_value_cents,
          current_value_usd: (Number(h.current_value_cents || 0) / 100).toFixed(2),
          entry_nav_cents: h.entry_nav_cents,
        })),
      },
      pnl: {
        total_realized_pnl_cents: totalRealizedPnl,
        total_realized_pnl_usd: (totalRealizedPnl / 100).toFixed(2),
        total_trades: trades?.length || 0,
      },
      calculation: {
        initial_capital_cents: INITIAL_CAPITAL_CENTS,
        initial_capital_usd: (INITIAL_CAPITAL_CENTS / 100).toFixed(2),
        stored_aum_cents: storedAumCents,
        stored_aum_usd: (storedAumCents / 100).toFixed(2),
        total_pool_cents: expectedPoolCents,
        total_pool_usd: (expectedPoolCents / 100).toFixed(2),
        expected_nav_cents: expectedNavCents,
        expected_nav_usd: expectedNavUsd,
      },
      stored_stats: latestStats ? {
        nav_cents: latestStats.nav_cents,
        nav_usd: (Number(latestStats.nav_cents) / 100).toFixed(2),
        snapshot_at: latestStats.snapshot_at,
        total_return_pct: latestStats.total_return_pct,
      } : null,
      comparison: {
        expected_nav_usd: expectedNavUsd,
        stored_nav_usd: storedNavUsd,
        match: Math.abs(expectedNavCents - storedNavCents) < 50, // within 50 cents
        difference_cents: storedNavCents - expectedNavCents,
      },
      diagnosis: [
        activeHoldings.length === 0 && 'ℹ️ No investor holdings yet — this is normal at start. Expected NAV = $100 with 0 capital.',
        storedAumCents === 0 && '⚠️ total_aum_cents is 0 — investors may not have bought in, or it\'s not being tracked.',
        storedAumCents > 0 && totalCurrentValueCents === 0 && '⚠️ total_aum_cents is set but holdings have no current_value — update-nav cron may not have run.',
        Math.abs(expectedNavCents - storedNavCents) >= 100 && '❌ Expected NAV and stored NAV differ significantly — check agent_stats freshness.',
        Math.abs(expectedNavCents - storedNavCents) < 50 && '✅ NAV is correct and consistent.',
      ].filter(Boolean),
    })
  } catch (err) {
    console.error('debug error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
