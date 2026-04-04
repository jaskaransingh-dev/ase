/**
 * GET /api/agents/public-stats
 *
 * Public endpoint — no auth required.
 * Returns live stats for all active agents (used by the landing page).
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateTradingCapitalCents } from '@/lib/market'

export const dynamic = 'force-dynamic'

const SLUG_TO_TICKER: Record<string, string> = {
  'btc-momentum': '$BTCM',
  'eth-mean-revert': '$ETHR',
  'crypto-trend': '$CRTR',
  'sol-breakout': '$SOLB',
  'defi-basket': '$DEFI',
  'btc-eth-pairs': '$PAIR',
  'vol-harvester': '$VOLH',
  'momentum-carry': '$MCAR',
  'cascade-detect': '$CASC',
  'defi-yield': '$DYLD',
}

const SLUG_TO_TYPE: Record<string, string> = {
  'btc-momentum': 'Momentum',
  'eth-mean-revert': 'Mean Revert',
  'crypto-trend': 'Trend Following',
  'sol-breakout': 'Breakout',
  'defi-basket': 'Multi-Asset',
  'btc-eth-pairs': 'Pairs Trading',
  'vol-harvester': 'Vol Harvest',
  'momentum-carry': 'Carry',
  'cascade-detect': 'Cascade',
  'defi-yield': 'DeFi Yield',
}

export async function GET() {
  try {
    const admin = createAdminClient()

    // Get all active agents
    const { data: agents } = await admin
      .from('agents')
      .select('id, slug, name, share_price_cents, total_aum_cents, status')
      .eq('status', 'active')

    if (!agents || agents.length === 0) {
      return NextResponse.json({ agents: [], totals: {} })
    }

    const results = []

    for (const agent of agents) {
      // Get latest stats
      const { data: stats } = await admin
        .from('agent_stats')
        .select('nav_cents, total_return_pct, daily_return_pct, sharpe_ratio, total_trades, win_rate_pct')
        .eq('agent_id', agent.id)
        .order('snapshot_at', { ascending: false })
        .limit(1)
        .single()

      // Get last 10 NAV snapshots for sparkline
      const { data: navHistory } = await admin
        .from('agent_stats')
        .select('nav_cents')
        .eq('agent_id', agent.id)
        .order('snapshot_at', { ascending: false })
        .limit(10)

      const sparkData = (navHistory ?? [])
        .map(s => Number(s.nav_cents))
        .reverse()

      // If we don't have enough sparkline data, pad with base NAV
      while (sparkData.length < 10) {
        sparkData.unshift(10_000)
      }

      const navCents = stats?.nav_cents ?? agent.share_price_cents ?? 10_000
      const totalReturnPct = stats?.total_return_pct ?? 0
      const isPositive = totalReturnPct >= 0

      results.push({
        ticker: SLUG_TO_TICKER[agent.slug] || `$${agent.slug.toUpperCase().replace(/-/g, '')}`,
        slug: agent.slug,
        name: agent.name,
        nav: `$${(navCents / 100).toFixed(2)}`,
        nav_cents: navCents,
        total_return_pct: totalReturnPct,
        ret: `${isPositive ? '+' : ''}${totalReturnPct.toFixed(1)}%`,
        pos: isPositive,
        spark: sparkData.map(v => v / 100), // convert to dollars for display
        type: SLUG_TO_TYPE[agent.slug] || 'Strategy',
        daily_return_pct: stats?.daily_return_pct ?? 0,
        sharpe: stats?.sharpe_ratio ?? 0,
        total_trades: stats?.total_trades ?? 0,
        win_rate: stats?.win_rate_pct ?? 0,
        aum_cents: calculateTradingCapitalCents(Number(agent.total_aum_cents) || 0),
      })
    }

    // Platform-level totals
    const totalAum = results.reduce((s, a) => s + a.aum_cents, 0)
    const totalTrades = results.reduce((s, a) => s + a.total_trades, 0)
    const avgReturn = results.length > 0
      ? results.reduce((s, a) => s + a.total_return_pct, 0) / results.length
      : 0

    return NextResponse.json({
      agents: results,
      totals: {
        total_aum_usd: `$${(totalAum / 100).toLocaleString()}`,
        total_trades: totalTrades,
        avg_return_pct: avgReturn.toFixed(1),
        agents_live: results.length,
      }
    })
  } catch (err) {
    console.error('public-stats error:', err)
    return NextResponse.json({ agents: [], totals: {} })
  }
}
