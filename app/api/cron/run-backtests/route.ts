/**
 * POST /api/cron/run-backtests
 *
 * Runs the same backtesting procedure as algo_lab_refresh/app.py using yfinance-equivalent
 * Yahoo Finance data + the TypeScript backtest engine in /lib/backtest.ts.
 *
 * For every active agent that has primary_symbol + backtest_strategy configured:
 *   1. Fetches 2-year daily OHLCV data from Yahoo Finance
 *   2. Runs backtest + buy-and-hold benchmark (identical to lib/backtest.ts)
 *   3. Stores full results in agents.backtest_stats (JSONB)
 *   4. Inserts a fresh agent_stats snapshot with backtest-derived metrics
 *      so every page (agents list, detail, dashboard) shows real returns
 *
 * Can also be triggered manually from the agents detail page via POST /api/cron/run-backtests
 * with body { agent_id: "..." } to update a single agent.
 *
 * Secured with CRON_SECRET header (optional in dev).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runBacktest, runBuyAndHold, STRATEGIES } from '@/lib/backtest'
import { fetchYahooFinance } from '@/app/api/backtest/route'

export const dynamic = 'force-dynamic'

async function runAgentBacktest(agent: {
  id: string
  slug: string
  primary_symbol: string
  backtest_strategy: string
}) {
  const bars = await fetchYahooFinance(agent.primary_symbol, '2y', '1d')
  if (bars.length < 60) throw new Error(`Not enough data for ${agent.primary_symbol} (${bars.length} bars)`)

  const meta = STRATEGIES[agent.backtest_strategy]
  if (!meta) throw new Error(`Unknown strategy: ${agent.backtest_strategy}`)

  const result = runBacktest(bars, agent.backtest_strategy, meta.defaultParams, 0.001)
  const buyHold = runBuyAndHold(bars)

  // Strip large bar arrays for storage — keep only stats + lightweight summary
  const storagePayload = {
    symbol: agent.primary_symbol,
    strategy: agent.backtest_strategy,
    period: '2y',
    computed_at: new Date().toISOString(),
    stats: result.stats,
    buyHold: {
      // Only store buy-and-hold final stats derived from bars
      totalReturnPct: buyHold.length > 0
        ? ((buyHold[buyHold.length - 1].equity - buyHold[0].equity) / buyHold[0].equity) * 100
        : 0,
    },
    // Downsample equity curve to ~100 points for chart display
    equityCurve: result.bars
      .filter((_, i) => i % Math.max(1, Math.floor(result.bars.length / 100)) === 0)
      .map(b => ({ date: b.date, equity: Math.round(b.equity), buyHold: 0 })),
    buyHoldCurve: buyHold
      .filter((_, i) => i % Math.max(1, Math.floor(buyHold.length / 100)) === 0)
      .map(b => ({ date: b.date, equity: Math.round(b.equity) })),
  }

  return { result, buyHold, storagePayload }
}

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('x-cron-secret')
    if (auth !== cronSecret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()

  // Optional: single-agent mode (from agent detail page "refresh backtest" button)
  let agentFilter: string | null = null
  try {
    const body = await req.json() as { agent_id?: string }
    agentFilter = body.agent_id ?? null
  } catch { /* no body — run all agents */ }

  let query = admin
    .from('agents')
    .select('id, slug, primary_symbol, backtest_strategy')
    .eq('status', 'active')
    .not('primary_symbol', 'is', null)
    .not('backtest_strategy', 'is', null)

  if (agentFilter) {
    query = query.eq('id', agentFilter) as typeof query
  }

  const { data: agents, error: agentsError } = await query
  if (agentsError) return NextResponse.json({ error: agentsError.message }, { status: 500 })
  if (!agents || agents.length === 0) return NextResponse.json({ ok: true, message: 'No agents to backtest' })

  const results: Record<string, unknown> = {}

  for (const agent of agents) {
    if (!agent.primary_symbol || !agent.backtest_strategy) continue

    try {
      const { result, storagePayload } = await runAgentBacktest({
        id: agent.id,
        slug: agent.slug,
        primary_symbol: agent.primary_symbol,
        backtest_strategy: agent.backtest_strategy,
      })

      const s = result.stats

      // 1. Store full backtest in agents.backtest_stats JSONB
      await admin
        .from('agents')
        .update({ backtest_stats: storagePayload })
        .eq('id', agent.id)

      // 2. Insert agent_stats snapshot with backtest-derived metrics
      //    NAV is $100k × (1 + totalReturn/100) to show absolute growth
      const navCents = Math.round(100_000 * (1 + s.totalReturnPct / 100) * 100)

      await admin.from('agent_stats').insert({
        agent_id: agent.id,
        snapshot_at: now,
        nav_cents: navCents,
        total_return_pct: parseFloat(s.totalReturnPct.toFixed(4)),
        sharpe_ratio: parseFloat(s.sharpeRatio.toFixed(4)),
        max_drawdown_pct: parseFloat(s.maxDrawdownPct.toFixed(4)),
        win_rate_pct: parseFloat(s.winRate.toFixed(4)),
        total_trades: s.totalTrades,
        is_simulation: true,
      })

      results[agent.slug] = {
        ok: true,
        symbol: agent.primary_symbol,
        strategy: agent.backtest_strategy,
        totalReturnPct: s.totalReturnPct.toFixed(2) + '%',
        annualizedReturnPct: s.annualizedReturnPct.toFixed(2) + '%',
        sharpeRatio: s.sharpeRatio.toFixed(2),
        maxDrawdownPct: s.maxDrawdownPct.toFixed(2) + '%',
        winRate: s.winRate.toFixed(1) + '%',
        totalTrades: s.totalTrades,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[backtest] ${agent.slug} failed:`, msg)
      results[agent.slug] = { ok: false, error: msg }
    }
  }

  return NextResponse.json({
    ok: true,
    updated_at: now,
    agents_updated: Object.values(results).filter((r) => (r as { ok: boolean }).ok).length,
    results,
  })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
