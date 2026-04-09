/**
 * POST /api/cron/run-agents
 *
 * Runs all 10 sophisticated trading strategies using live Yahoo Finance market data.
 * Each agent:
 *   1. Checks its own open positions from agent_trades (DB-tracked, per-agent)
 *   2. Fetches real crypto price bars from Yahoo Finance
 *   3. Calculates advanced indicators and signals
 *   4. Executes orders via Coinbase Exchange (sandbox or production)
 *   5. Logs fills to agent_trades immediately with fill price + P&L
 *   6. Stores decision state: signal_summary and portfolio snapshot
 *
 * Protected by CRON_SECRET header. Safe to call every minute.
 *
 * Coinbase trading configuration (env vars):
 *   COINBASE_TRADE_KEY         - API key from Coinbase Exchange / Advanced Trade
 *   COINBASE_TRADE_SECRET      - Base64-encoded signing secret
 *   COINBASE_TRADE_PASSPHRASE  - Passphrase from key creation
 *   COINBASE_TRADE_SANDBOX     - "false" for production (default: sandbox)
 *
 * If Coinbase credentials are not set, agents run in simulation mode —
 * trades are computed and logged but not sent to any exchange.
 *
 * Fund pooling:
 *   When users subscribe and allocate credits, total_aum_cents grows.
 *   calculateTradingCapitalCents(aum) = PLATFORM_SEED + aum.
 *   Every new dollar of AUM increases the agent's position sizing.
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
import { getCryptoBars, getLatestCryptoPrice } from '@/lib/market-data'
import { healthCheckCoinbase } from '@/lib/coinbase-trade'
import { calculateNavFromState, calculateHoldingValueCents, calculateTradingCapitalCents, PLATFORM_SEED_CAPITAL_CENTS } from '@/lib/market'

export const dynamic = 'force-dynamic'

// Map agent DB slug → strategy runner
const STRATEGY_MAP: Record<
  string,
  (admin: ReturnType<typeof createAdminClient>, agentId: string, key: string, secret: string, capital: number) => Promise<StrategyResult>
> = {
  'btc-momentum':    runBtcMomentum,
  'eth-mean-revert': runEthMeanRevert,
  'crypto-trend':    runCryptoTrend,
  'sol-breakout':    runSolBreakout,
  'defi-basket':     runDefiBasket,
  'btc-eth-pairs':   runBtcEthPairs,
  'vol-harvester':   runVolHarvester,
  'momentum-carry':  runMomentumCarry,
  'cascade-detect':  runCascadeDetect,
  'defi-yield':      runDefiYield,
}

export async function POST(req: NextRequest) {
  let targetAgentId: string | null = null
  try {
    const body = await req.json()
    targetAgentId = typeof body?.agent_id === 'string' ? body.agent_id : null
  } catch { /* no body */ }

  // Auth: require CRON_SECRET header
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.get('x-cron-secret')
    if (authHeader !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // Connectivity check — Coinbase ticker endpoint (public, no auth required)
  const healthy = await healthCheckCoinbase()
  if (!healthy) {
    return NextResponse.json({
      ok: false,
      error: 'Coinbase/market data health check failed — skipping agent runs',
      ran_at: new Date().toISOString(),
    }, { status: 503 })
  }

  const admin = createAdminClient()
  const ran_at = new Date().toISOString()

  // Coinbase credentials passed into strategies (ignored in simulation mode)
  const tradeKey    = process.env.COINBASE_TRADE_KEY    ?? ''
  const tradeSecret = process.env.COINBASE_TRADE_SECRET ?? ''

  let agentsQuery = admin
    .from('agents')
    .select('id, slug, total_aum_cents, share_price_cents, alert_level')
    .eq('status', 'active')

  if (targetAgentId) agentsQuery = agentsQuery.eq('id', targetAgentId)

  const { data: agents, error: agentsError } = await agentsQuery
  if (agentsError || !agents?.length) {
    return NextResponse.json({
      ok: false,
      error: agentsError?.message || 'No active agents found',
      ran_at,
    })
  }

  console.log(`[run-agents] ${agents.length} agents in this cron tick`)

  const results: Record<string, StrategyResult | { error: string; agent_slug: string }> = {}
  let totalTrades = 0

  for (const agent of agents) {
    // Skip agents under hard drawdown delisting
    if (agent.alert_level === 'hard') {
      results[agent.slug] = { agent_slug: agent.slug, error: 'Skipped — hard drawdown alert' }
      console.warn(`[run-agents] ${agent.slug}: SKIPPED — hard drawdown`)
      continue
    }

    const runner = STRATEGY_MAP[agent.slug]
    if (!runner) {
      results[agent.slug] = { agent_slug: agent.slug, error: 'No strategy runner configured' }
      await admin.from('agents').update({ last_error: 'No strategy runner configured' }).eq('id', agent.id).catch(() => {})
      continue
    }

    try {
      // Re-fetch latest AUM (may have changed since cron started)
      const { data: freshAgent } = await admin
        .from('agents')
        .select('total_aum_cents')
        .eq('id', agent.id)
        .single()

      const aumCents = Number(freshAgent?.total_aum_cents ?? agent.total_aum_cents) || 0
      const capitalCents = calculateTradingCapitalCents(aumCents)

      console.log(`[run-agents] ${agent.slug}: capital $${(capitalCents / 100).toFixed(0)} (seed $${(PLATFORM_SEED_CAPITAL_CENTS / 100).toFixed(0)} + AUM $${(aumCents / 100).toFixed(0)})`)

      const result = await runner(admin, agent.id, tradeKey, tradeSecret, capitalCents)
      results[agent.slug] = result

      // Persist signal state
      await admin.from('agents').update({
        signal_summary: result.signal_summary || 'SCANNING',
        portfolio_json: JSON.stringify(result.portfolio),
        last_run_at: ran_at,
        last_error: null,
      }).eq('id', agent.id).catch(e => console.warn(`signal_summary update failed for ${agent.slug}:`, e))

      const tradeCount = result.actions.filter(a => a.action === 'BUY' || a.action === 'SELL').length
      totalTrades += tradeCount
      if (tradeCount > 0) console.log(`[run-agents] ${agent.slug}: ${tradeCount} trade(s) executed`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[run-agents] ${agent.slug} failed:`, msg)
      results[agent.slug] = { agent_slug: agent.slug, error: msg }
      await admin.from('agents').update({ last_error: msg }).eq('id', agent.id).catch(() => {})
    }
  }

  // ── NAV Recalculation ──────────────────────────────────────────────────────
  console.log('[run-agents] Recalculating NAV for all agents...')

  for (const agent of agents) {
    try {
      const { data: activeHoldings } = await admin
        .from('holdings')
        .select('id, shares, invested_cents')
        .eq('agent_id', agent.id)
        .eq('status', 'active')

      const investorCapitalCents = (activeHoldings ?? []).reduce(
        (sum, h) => sum + (Number(h.invested_cents) || 0), 0
      )

      // Realized P&L
      const { data: closedTrades } = await admin
        .from('agent_trades')
        .select('pnl_cents')
        .eq('agent_id', agent.id)
        .not('pnl_cents', 'is', null)

      const realizedPnlCents = (closedTrades ?? []).reduce(
        (sum, t) => sum + (Number(t.pnl_cents) || 0), 0
      )

      // Unrealized P&L — price from Yahoo Finance (no Alpaca)
      const openPositions = await getAgentPositions(admin, agent.id)
      let unrealizedPnlCents = 0
      const priceCache: Record<string, number> = {}

      for (const pos of openPositions) {
        if (!priceCache[pos.symbol]) {
          const price = await getLatestCryptoPrice(pos.symbol)
          priceCache[pos.symbol] = price ?? pos.avg_entry
        }
        const current = priceCache[pos.symbol]
        unrealizedPnlCents += Math.round(pos.qty * (current - pos.avg_entry) * 100)
      }

      const navState = calculateNavFromState({
        investorCapitalCents,
        totalPnlCents: realizedPnlCents + unrealizedPnlCents,
      })
      const navCents = navState.navCents

      await admin.from('agents').update({
        share_price_cents: navCents,
        total_aum_cents: investorCapitalCents,
      }).eq('id', agent.id)

      for (const holding of activeHoldings ?? []) {
        const currentValue = calculateHoldingValueCents(Number(holding.shares) || 0, navCents)
        await admin.from('holdings').update({ current_value_cents: currentValue }).eq('id', holding.id)
      }

      console.log(`[run-agents] ${agent.slug}: NAV = $${(navCents / 100).toFixed(2)}`)
    } catch (err) {
      console.error(`[run-agents] NAV recalc failed for ${agent.slug}:`, err instanceof Error ? err.message : err)
    }
  }

  return NextResponse.json({
    ok: true,
    ran_at,
    agents_run: agents.length,
    targeted_agent_id: targetAgentId,
    total_trades: totalTrades,
    results,
  })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
