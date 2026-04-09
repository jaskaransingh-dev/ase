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
import { runBacktest, runBuyAndHold, STRATEGIES, type OHLCV } from '@/lib/backtest'

export const dynamic = 'force-dynamic'
// Note: NOT edge runtime — needs full Node.js for fetch + crypto operations

const PERIOD_DAYS = 730  // 2 years, same as app.py default

type YahooChartResponse = {
  chart: {
    result?: Array<{
      timestamp: number[]
      indicators: {
        quote: Array<{
          open: number[]
          high: number[]
          low: number[]
          close: number[]
          volume: number[]
        }>
      }
    }>
    error?: { description: string }
  }
}

async function fetchYahooFinance(symbol: string): Promise<OHLCV[]> {
  const end = Math.floor(Date.now() / 1000)
  const start = end - PERIOD_DAYS * 86400
  const qs = `interval=1d&period1=${start}&period2=${end}&includePrePost=false&events=history`
  const encoded = encodeURIComponent(symbol)

  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?${qs}`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encoded}?${qs}`,
  ]
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://finance.yahoo.com',
    'Referer': 'https://finance.yahoo.com/',
  }

  let lastError: Error = new Error(`Failed to fetch data for ${symbol}`)
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers })
      if (!res.ok) { lastError = new Error(`Yahoo Finance ${res.status} for ${symbol}`); continue }
      const json = await res.json() as YahooChartResponse
      const chart = json.chart
      if (chart.error) throw new Error(chart.error.description)
      const result = chart.result?.[0]
      if (!result) throw new Error(`No data returned for ${symbol}`)
      const { timestamp, indicators } = result
      const q = indicators.quote[0]
      const bars: OHLCV[] = []
      for (let i = 0; i < timestamp.length; i++) {
        if (q.close[i] == null) continue
        bars.push({
          date: new Date(timestamp[i] * 1000).toISOString().slice(0, 10),
          open: q.open[i] ?? q.close[i],
          high: q.high[i] ?? q.close[i],
          low: q.low[i] ?? q.close[i],
          close: q.close[i],
          volume: q.volume[i] ?? 0,
        })
      }
      return bars
    } catch (e) {
      lastError = e instanceof Error ? e : new Error('Fetch failed')
    }
  }
  throw lastError
}

async function runAgentBacktest(agent: {
  id: string
  slug: string
  primary_symbol: string
  backtest_strategy: string
}) {
  const bars = await fetchYahooFinance(agent.primary_symbol)
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
