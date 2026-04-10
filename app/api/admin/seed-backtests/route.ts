/**
 * POST /api/admin/seed-backtests
 *
 * Seeds 1-year backtest results into agent_backtest_history for all active agents.
 * This fills in the historical performance stats so agents show real data instead of 0%.
 *
 * Runs each agent's backtest for 1y, 2y, and 5y periods directly (no HTTP round-trip)
 * using the same runAgentBacktest logic as /api/cron/run-backtests.
 * Stores results in agent_backtest_history table.
 *
 * Skips any period already computed within the last 24 hours.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runBacktest, runBuyAndHold, STRATEGIES } from '@/lib/backtest'
import { fetchYahooFinance } from '@/app/api/backtest/route'

export const dynamic = 'force-dynamic'

async function runAgentBacktestForPeriod(agent: {
  id: string
  slug: string
  primary_symbol: string
  backtest_strategy: string
}, period: string) {
  const bars = await fetchYahooFinance(agent.primary_symbol, period, '1d')
  if (bars.length < 60) throw new Error(`Not enough data for ${agent.primary_symbol} (${bars.length} bars)`)

  const meta = STRATEGIES[agent.backtest_strategy]
  if (!meta) throw new Error(`Unknown strategy: ${agent.backtest_strategy}`)

  const result = runBacktest(bars, agent.backtest_strategy, meta.defaultParams, 0.001)
  const buyHold = runBuyAndHold(bars)

  const buyHoldReturnPct = buyHold.length > 0
    ? ((buyHold[buyHold.length - 1].equity - buyHold[0].equity) / buyHold[0].equity) * 100
    : 0

  // Downsample equity curve to ~100 points for chart display
  const equityCurve = result.bars
    .filter((_, i) => i % Math.max(1, Math.floor(result.bars.length / 100)) === 0)
    .map(b => ({ date: b.date, equity: Math.round(b.equity), buyHold: 0 }))

  const buyHoldCurve = buyHold
    .filter((_, i) => i % Math.max(1, Math.floor(buyHold.length / 100)) === 0)
    .map(b => ({ date: b.date, equity: Math.round(b.equity) }))

  return {
    stats: result.stats,
    buyHoldReturnPct,
    equityCurve,
    buyHoldCurve,
  }
}

export async function POST(req: NextRequest) {
  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data: agents, error: agentsError } = await admin
    .from('agents')
    .select('id, slug, name, backtest_strategy, primary_symbol')
    .eq('status', 'active')
    .not('primary_symbol', 'is', null)
    .not('backtest_strategy', 'is', null)

  if (agentsError || !agents) {
    return NextResponse.json({ error: agentsError?.message ?? 'Failed to fetch agents' }, { status: 500 })
  }

  const results: Record<string, unknown> = {}
  const periods = ['1y', '2y', '5y']

  for (const agent of agents) {
    if (!agent.primary_symbol || !agent.backtest_strategy) continue

    for (const period of periods) {
      const key = `${agent.slug}-${period}`
      try {
        // Check if we already have fresh data (computed within last 24 hours)
        const { data: existing } = await admin
          .from('agent_backtest_history')
          .select('id, computed_at')
          .eq('agent_id', agent.id)
          .eq('period', period)
          .single()

        if (existing?.computed_at) {
          const ageMs = Date.now() - new Date(existing.computed_at).getTime()
          if (ageMs < 24 * 60 * 60 * 1000) {
            results[key] = 'skipped (fresh)'
            continue
          }
        }

        const { stats, buyHoldReturnPct, equityCurve, buyHoldCurve } =
          await runAgentBacktestForPeriod({
            id: agent.id,
            slug: agent.slug,
            primary_symbol: agent.primary_symbol,
            backtest_strategy: agent.backtest_strategy,
          }, period)

        const { error: upsertError } = await admin
          .from('agent_backtest_history')
          .upsert({
            agent_id: agent.id,
            period,
            symbol: agent.primary_symbol,
            strategy: agent.backtest_strategy,
            computed_at: now,
            stats,
            buy_hold_return_pct: buyHoldReturnPct,
            equity_curve: equityCurve,
            buy_hold_curve: buyHoldCurve,
          }, { onConflict: 'agent_id,period' })

        if (upsertError) {
          results[key] = `upsert error: ${upsertError.message}`
        } else {
          results[key] = `seeded: ${stats.totalReturnPct?.toFixed(1)}%`
        }

        console.log(`[seed-backtests] ${agent.slug} ${period}: ${stats.totalReturnPct?.toFixed(2)}% return`)

        // Small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300))

      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown error'
        console.error(`[seed-backtests] ${agent.slug} ${period} failed:`, msg)
        results[key] = `error: ${msg}`
      }
    }
  }

  return NextResponse.json({
    ok: true,
    agents_processed: agents.length,
    results,
    seeded_at: now,
  })
}
