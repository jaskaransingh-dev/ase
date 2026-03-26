/**
 * POST /api/cron/run-agents
 *
 * Runs all 5 sophisticated trading strategies against live Alpaca crypto market data.
 * Each agent:
 *   1. Checks its own open positions from agent_trades (DB-tracked, per-agent)
 *   2. Fetches real crypto bars from Alpaca v1beta3 endpoint
 *   3. Calculates advanced indicators and signals
 *   4. Executes orders via Alpaca paper trading if signal fires
 *   5. Logs fills to agent_trades immediately with fill price + P&L
 *   6. Stores decision state: signal_summary and portfolio snapshot
 *
 * Protected by CRON_SECRET header. Safe to call every minute.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  runBtcMomentum,
  runEthMeanRevert,
  runCryptoTrend,
  runSolBreakout,
  runDefiBasket,
  StrategyResult,
} from '@/lib/agents'

export const dynamic = 'force-dynamic'

// Map agent DB slug → strategy runner
const STRATEGY_MAP: Record<
  string,
  (admin: ReturnType<typeof createAdminClient>, agentId: string, key: string, secret: string, capital: number) => Promise<StrategyResult>
> = {
  'btc-momentum':   runBtcMomentum,
  'eth-mean-revert': runEthMeanRevert,
  'crypto-trend':   runCryptoTrend,
  'sol-breakout':   runSolBreakout,
  'defi-basket':    runDefiBasket,
}

export async function POST(req: NextRequest) {
  // Auth: require CRON_SECRET header (skip check if secret not configured in dev)
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.get('x-cron-secret')
    if (authHeader !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const alpacaKey = process.env.ALPACA_KEY_ID || ''
  const alpacaSecret = process.env.ALPACA_SECRET_KEY || ''

  if (!alpacaKey || !alpacaSecret) {
    return NextResponse.json(
      { error: 'Alpaca credentials not configured', env_vars: ['ALPACA_KEY_ID', 'ALPACA_SECRET_KEY'] },
      { status: 500 }
    )
  }

  const admin = createAdminClient()
  const ran_at = new Date().toISOString()

  // Load all active agents from DB
  const { data: agents, error: agentsError } = await admin
    .from('agents')
    .select('id, slug, total_aum_cents')
    .eq('status', 'active')

  if (agentsError || !agents?.length) {
    return NextResponse.json({
      ok: false,
      error: agentsError?.message || 'No active agents found',
      ran_at,
    })
  }

  const results: Record<string, StrategyResult | { error: string; agent_slug: string }> = {}
  let totalTrades = 0

  for (const agent of agents) {
    const runner = STRATEGY_MAP[agent.slug]
    if (!runner) {
      results[agent.slug] = {
        agent_slug: agent.slug,
        error: 'No strategy runner configured',
      }
      continue
    }

    try {
      // Capital = max($10k base, agent's actual AUM)
      const baseCapitalCents = 1_000_000 // $10,000
      const aumCents = Number(agent.total_aum_cents) || 0
      const capitalCents = Math.max(baseCapitalCents, aumCents)

      console.log(`Running ${agent.slug} with $${(capitalCents / 100).toFixed(0)} capital`)

      const result = await runner(admin, agent.id, alpacaKey, alpacaSecret, capitalCents)
      results[agent.slug] = result

      // Store latest signal summary + portfolio state on the agents row itself
      // (agent_stats is a time-series table; live state lives on agents)
      try {
        await admin
          .from('agents')
          .update({
            signal_summary: result.signal_summary || 'SCANNING',
            portfolio_json: JSON.stringify(result.portfolio),
            last_run_at: ran_at,
          })
          .eq('id', agent.id)
      } catch (statsErr) {
        console.warn(`Failed to store signal state for ${agent.slug}:`, statsErr)
      }

      // Count actual trades (BUY or SELL actions)
      const tradeCount = result.actions.filter(a => a.action === 'BUY' || a.action === 'SELL').length
      totalTrades += tradeCount

      if (tradeCount > 0) {
        console.log(`${agent.slug}: ${tradeCount} trade(s) executed`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error(`Agent ${agent.slug} failed:`, msg)
      results[agent.slug] = {
        agent_slug: agent.slug,
        error: msg,
      }
    }
  }

  return NextResponse.json({
    ok: true,
    ran_at,
    agents_run: agents.length,
    total_trades: totalTrades,
    results,
  })
}

// Allow GET for easy manual testing in browser
export async function GET(req: NextRequest) {
  return POST(req)
}
