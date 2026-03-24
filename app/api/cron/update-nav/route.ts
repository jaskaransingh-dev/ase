/**
 * POST /api/cron/update-nav
 *
 * Updates NAV (Net Asset Value) for every active agent based on:
 *   - Realized P&L: sum of pnl_cents on closed trades in agent_trades
 *   - Unrealized P&L: open positions × (current_price - avg_entry)
 *   - Total return % vs initial $10k capital
 *
 * Inserts snapshots into agent_stats and price_ticks.
 * Updates agent.share_price_cents so the exchange reflects current NAV.
 * Updates holdings.current_value_cents for each investor.
 *
 * Run every 5–15 minutes via your cron scheduler.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCryptoBars } from '@/lib/alpaca'
import { getAgentPositions } from '@/lib/agents'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const INITIAL_CAPITAL_CENTS = 1_000_000 // $10,000 paper capital per agent
const BASE_NAV_CENTS = 10_000           // $100.00 starting NAV per share

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.get('x-cron-secret')
    if (authHeader !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const admin = createAdminClient()
  const alpacaKey = process.env.ALPACA_KEY_ID || ''
  const alpacaSecret = process.env.ALPACA_SECRET_KEY || ''

  if (!alpacaKey) {
    return NextResponse.json({ skipped: true, reason: 'No Alpaca credentials' })
  }

  const { data: agents } = await admin
    .from('agents')
    .select('id, slug, total_aum_cents')
    .eq('status', 'active')

  const results: Record<string, unknown> = {}
  const now = new Date().toISOString()

  for (const agent of agents ?? []) {
    try {
      // ── 1. REALIZED P&L ──────────────────────────────────────────────
      const { data: closedTrades } = await admin
        .from('agent_trades')
        .select('pnl_cents')
        .eq('agent_id', agent.id)
        .not('pnl_cents', 'is', null)

      const realizedPnlCents = (closedTrades ?? []).reduce(
        (sum, t) => sum + (Number(t.pnl_cents) || 0), 0
      )
      const totalTrades = closedTrades?.length || 0
      const winningTrades = (closedTrades ?? []).filter(t => (Number(t.pnl_cents) || 0) > 0).length
      const winRatePct = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0

      // ── 2. UNREALIZED P&L ─────────────────────────────────────────────
      const openPositions = await getAgentPositions(admin, agent.id)
      let unrealizedPnlCents = 0

      // Cache prices for symbols we need
      const priceCache: Record<string, number> = {}

      for (const pos of openPositions) {
        if (!priceCache[pos.symbol]) {
          const bars = await getCryptoBars(pos.symbol, '1Day', 1)
          priceCache[pos.symbol] = bars.length > 0 ? bars[bars.length - 1].c : pos.avg_entry
        }
        const currentPrice = priceCache[pos.symbol]
        const unrealizedDollars = pos.qty * (currentPrice - pos.avg_entry)
        unrealizedPnlCents += Math.round(unrealizedDollars * 100)
      }

      // ── 3. NAV CALCULATION ────────────────────────────────────────────
      // NAV scales with total P&L as a percentage of initial capital
      // If P&L = +$1,000 on $10,000 capital → NAV = $110 (10% gain)
      const totalPnlCents = realizedPnlCents + unrealizedPnlCents
      const navCents = Math.round(BASE_NAV_CENTS * (INITIAL_CAPITAL_CENTS + totalPnlCents) / INITIAL_CAPITAL_CENTS)
      const totalReturnPct = (totalPnlCents / INITIAL_CAPITAL_CENTS) * 100
      const dailyReturnPct = 0 // TODO: compare to yesterday's NAV snapshot

      // Simplified Sharpe (annualized return / assumed volatility)
      const sharpeRatio = totalReturnPct > 0
        ? Math.min(parseFloat((totalReturnPct / 15).toFixed(2)), 5.0)
        : 0

      // ── 4. MAX DRAWDOWN ───────────────────────────────────────────────
      const { data: navHistory } = await admin
        .from('agent_stats')
        .select('nav_cents')
        .eq('agent_id', agent.id)
        .order('snapshot_at', { ascending: true })
        .limit(30)

      let maxDrawdownPct = 0
      if (navHistory && navHistory.length > 0) {
        const allNavs = navHistory.map(s => Number(s.nav_cents)).concat(navCents)
        let peakNav = allNavs[0]
        for (const nav of allNavs) {
          if (nav > peakNav) peakNav = nav
          const drawdown = peakNav > 0 ? ((peakNav - nav) / peakNav) * 100 : 0
          if (drawdown > maxDrawdownPct) maxDrawdownPct = drawdown
        }
      }

      // ── 5. PORTFOLIO VALUE ────────────────────────────────────────────
      const portfolioValueCents = INITIAL_CAPITAL_CENTS + totalPnlCents

      // ── 6. WRITE agent_stats SNAPSHOT ─────────────────────────────────
      await admin.from('agent_stats').insert({
        agent_id: agent.id,
        snapshot_at: now,
        nav_cents: navCents,
        // bid/ask generated columns — do not insert them (they're computed)
        total_return_pct: parseFloat(totalReturnPct.toFixed(4)),
        sharpe_ratio: sharpeRatio,
        max_drawdown_pct: parseFloat(maxDrawdownPct.toFixed(4)),
        win_rate_pct: parseFloat(winRatePct.toFixed(4)),
        total_trades: totalTrades,
        volume_shares: openPositions.reduce((s, p) => s + p.qty, 0),
        daily_return_pct: dailyReturnPct,
        portfolio_value_cents: portfolioValueCents,
      })

      // ── 7. WRITE price_ticks ──────────────────────────────────────────
      // Note: column names from the migration schema
      await admin.from('price_ticks').upsert({
        agent_id: agent.id,
        tick_at: now,                                  // NOT snapshot_at
        price_cents: navCents,
        bid_cents: Math.round(navCents * 0.9985),
        ask_cents: Math.round(navCents * 1.0015),
        volume: openPositions.reduce((s, p) => s + p.qty, 0),  // NOT volume_shares
      })

      // ── 8. UPDATE agent share price ────────────────────────────────────
      await admin
        .from('agents')
        .update({ share_price_cents: navCents })
        .eq('id', agent.id)

      // ── 9. UPDATE holdings current value ─────────────────────────────
      const { data: activeHoldings } = await admin
        .from('holdings')
        .select('id, shares, invested_cents')
        .eq('agent_id', agent.id)
        .eq('status', 'active')

      for (const holding of activeHoldings ?? []) {
        const currentValue = Math.round(Number(holding.shares) * (navCents / BASE_NAV_CENTS) * Number(holding.invested_cents))
        await admin
          .from('holdings')
          .update({ current_value_cents: currentValue })
          .eq('id', holding.id)
      }

      // ── 10. UPDATE agent AUM ──────────────────────────────────────────
      const totalInvested = (activeHoldings ?? []).reduce(
        (sum, h) => sum + Number(h.invested_cents), 0
      )
      if (totalInvested > 0) {
        await admin
          .from('agents')
          .update({ total_aum_cents: totalInvested })
          .eq('id', agent.id)
      }

      results[agent.slug] = {
        nav_cents: navCents,
        nav_usd: (navCents / 100).toFixed(2),
        total_return_pct: parseFloat(totalReturnPct.toFixed(2)),
        realized_pnl_usd: (realizedPnlCents / 100).toFixed(2),
        unrealized_pnl_usd: (unrealizedPnlCents / 100).toFixed(2),
        open_positions: openPositions.length,
        total_trades: totalTrades,
        win_rate_pct: parseFloat(winRatePct.toFixed(1)),
        sharpe_ratio: sharpeRatio,
        max_drawdown_pct: parseFloat(maxDrawdownPct.toFixed(2)),
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error(`NAV update failed for ${agent.slug}:`, msg)
      results[agent.slug] = { error: msg }
    }
  }

  return NextResponse.json({
    ok: true,
    updated_at: now,
    agents_updated: Object.keys(results).length,
    results,
  })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
