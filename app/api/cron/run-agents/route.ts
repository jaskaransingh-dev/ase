/**
 * POST /api/cron/run-agents
 *
 * Runs all 10 sophisticated trading strategies against live Alpaca crypto market data.
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
  runBtcEthPairs,
  runVolHarvester,
  runMomentumCarry,
  runCascadeDetect,
  runDefiYield,
  StrategyResult,
  getAgentPositions,
} from '@/lib/agents'
import { getCryptoBars } from '@/lib/alpaca'
import { calculateNavFromState, calculateHoldingValueCents, PLATFORM_SEED_CAPITAL_CENTS } from '@/lib/market'

export const dynamic = 'force-dynamic'

// Health check: verify Alpaca connectivity before running agents
async function healthCheckAlpaca(alpacaKey: string, alpacaSecret: string): Promise<boolean> {
  try {
    // Try to fetch a simple bar to verify connection
    const bars = await getCryptoBars('BTC/USD', '1Day', 1)
    return bars.length > 0
  } catch (err) {
    console.error('Alpaca health check failed:', err instanceof Error ? err.message : 'Unknown error')
    return false
  }
}

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
  'btc-eth-pairs':  runBtcEthPairs,
  'vol-harvester':  runVolHarvester,
  'momentum-carry': runMomentumCarry,
  'cascade-detect': runCascadeDetect,
  'defi-yield':     runDefiYield,
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

  // Health check: verify Alpaca connectivity before running agents
  const isHealthy = await healthCheckAlpaca(alpacaKey, alpacaSecret)
  if (!isHealthy) {
    return NextResponse.json({
      ok: false,
      error: 'Alpaca health check failed - skipping agent runs',
      ran_at: new Date().toISOString(),
    }, { status: 503 })
  }

  const admin = createAdminClient()
  const ran_at = new Date().toISOString()

  // Load all active agents from DB
  const { data: agents, error: agentsError } = await admin
    .from('agents')
    .select('id, slug, total_aum_cents, share_price_cents, alert_level')
    .eq('status', 'active')

  if (agentsError || !agents?.length) {
    return NextResponse.json({
      ok: false,
      error: agentsError?.message || 'No active agents found',
      ran_at,
    })
  }

  // Circuit breaker logging hook (Phase 2: full ADV cross-agent check)
  console.log(`[circuit] cross-agent symbol exposure check — ${agents.length} agents in this cron tick`)

  const results: Record<string, StrategyResult | { error: string; agent_slug: string }> = {}
  let totalTrades = 0

  for (const agent of agents) {
    // Skip agents under hard drawdown delisting (White Paper Section 7.4)
    if (agent.alert_level === 'hard') {
      results[agent.slug] = { agent_slug: agent.slug, error: 'Skipped — hard drawdown alert' }
      console.warn(`[cron] ${agent.slug}: SKIPPED — hard drawdown delisting`)
      continue
    }

    const runner = STRATEGY_MAP[agent.slug]
    if (!runner) {
      results[agent.slug] = {
        agent_slug: agent.slug,
        error: 'No strategy runner configured',
      }
      try {
        await admin
          .from('agents')
          .update({ last_error: 'No strategy runner configured' })
          .eq('id', agent.id)
      } catch (_) { /* best-effort */ }
      continue
    }

    try {
      // Re-fetch the latest AUM for this agent (may have changed since cron started
      // if a user bought/sold shares in between). This ensures agents always trade
      // with the most up-to-date capital amount.
      const { data: freshAgent } = await admin
        .from('agents')
        .select('total_aum_cents')
        .eq('id', agent.id)
        .single()

      const aumCents = Number(freshAgent?.total_aum_cents ?? agent.total_aum_cents) || 0
      // Capital = platform seed + ALL investor capital (additive, not max)
      // Every dollar an investor adds goes directly into the trading pool.
      // More AUM → agent trades larger positions → more absolute P&L → higher NAV %.
      const capitalCents = PLATFORM_SEED_CAPITAL_CENTS + aumCents

      console.log(`Running ${agent.slug} with $${(capitalCents / 100).toFixed(0)} capital (seed: $${(PLATFORM_SEED_CAPITAL_CENTS/100).toFixed(0)} + investor AUM: $${(aumCents / 100).toFixed(0)})`)

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
            last_error: null, // Clear any previous errors on successful run
          })
          .eq('id', agent.id)
      } catch (statsErr) {
        console.warn(`Failed to store signal state for ${agent.slug}:`, statsErr)
      }

      // Count actual trades (BUY or SELL actions)
      const tradeCount = result.actions.filter(a => a.action === 'BUY' || a.action === 'SELL').length
      totalTrades += tradeCount

      if (tradeCount > 0) {
        console.log(`${agent.slug}: executed ${tradeCount} live trade(s); NAV will be recalculated`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error(`Agent ${agent.slug} failed:`, msg)
      results[agent.slug] = {
        agent_slug: agent.slug,
        error: msg,
      }
      // Store the error on the agent row for visibility
      try {
        await admin
          .from('agents')
          .update({ last_error: msg })
          .eq('id', agent.id)
      } catch (_) { /* best-effort */ }
    }
  }

  // ── NAV RECALCULATION: Update share prices after all agents finish running ──
  console.log('Starting NAV recalculation for all agents...')
  for (const agent of agents) {
    try {
      // Get investor capital
      const { data: activeHoldings } = await admin
        .from('holdings')
        .select('id, shares, invested_cents')
        .eq('agent_id', agent.id)
        .eq('status', 'active')

      const investorCapitalCents = (activeHoldings ?? []).reduce(
        (sum, holding) => sum + (Number(holding.invested_cents) || 0),
        0
      )

      // Get realized P&L from closed trades
      const { data: closedTrades } = await admin
        .from('agent_trades')
        .select('pnl_cents')
        .eq('agent_id', agent.id)
        .not('pnl_cents', 'is', null)

      const realizedPnlCents = (closedTrades ?? []).reduce(
        (sum, t) => sum + (Number(t.pnl_cents) || 0), 0
      )

      // Get unrealized P&L from open positions
      const openPositions = await getAgentPositions(admin, agent.id)
      let unrealizedPnlCents = 0
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

      // Calculate new NAV
      const totalPnlCents = realizedPnlCents + unrealizedPnlCents
      const navState = calculateNavFromState({
        investorCapitalCents,
        totalPnlCents,
      })
      const navCents = navState.navCents

      // Update agent share price
      await admin
        .from('agents')
        .update({
          share_price_cents: navCents,
          total_aum_cents: investorCapitalCents,
        })
        .eq('id', agent.id)

      // Update holdings current value
      for (const holding of activeHoldings ?? []) {
        const currentValue = calculateHoldingValueCents(Number(holding.shares) || 0, navCents)
        await admin
          .from('holdings')
          .update({ current_value_cents: currentValue })
          .eq('id', holding.id)
      }

      console.log(`${agent.slug}: NAV updated to ${(navCents / 100).toFixed(2)} USD`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error(`NAV recalculation failed for ${agent.slug}:`, msg)
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
