/**
 * POST /api/cron/run-agents
 *
 * Runs all trading strategies using Yahoo Finance market data.
 * Each agent:
 *   1. Checks its own open positions from agent_trades (DB-tracked, per-agent)
 *   2. Fetches real price bars from Yahoo Finance
 *   3. Calculates advanced indicators and signals
 *   4. Executes trades on each user's broker account (proportionally)
 *   5. Logs fills to user_trades with user ID tracking
 *   6. Stores decision state: signal_summary and portfolio snapshot
 *
 * Protected by CRON_SECRET header. Safe to call every minute.
 *
 * Per-User Trading:
 *   Each user's allocation is distributed to their broker account.
 *   If user has no broker account, they receive simulation-only trades.
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
  runSpyMomentum,
  runQqqGrowth,
  runSectorRotation,
  runLowVolEquity,
  runCoveredCallOverlay,
  runSpyDualMomentum,
  runTechRotation,
  runEquityMeanReversion,
  runEquityTrendFollow,
  runRiskParity,
  runCompositeAlphaV2,
  runGenericCryptoMomentum,
  StrategyResult,
  getAgentPositions,
  AGENT_CONFIGS,
} from '@/lib/agents'
import { getCryptoBars, getLatestCryptoPrice, healthCheckMarketData } from '@/lib/market-data'
import { calculateNavFromState, calculateHoldingValueCents, calculateTradingCapitalCents, PLATFORM_SEED_CAPITAL_CENTS } from '@/lib/market'
import { distributeTradeToUsers, getUsersWithHoldings, syncAlpacaBalance } from '@/lib/user-trading'

export const dynamic = 'force-dynamic'

// Map agent DB slug → strategy runner
const STRATEGY_MAP: Record<
  string,
  (admin: ReturnType<typeof createAdminClient>, agentId: string, key: string, secret: string, capital: number) => Promise<StrategyResult>
> = {
  'btc-momentum':      runBtcMomentum,
  'eth-mean-revert':   runEthMeanRevert,
  'crypto-trend':      runCryptoTrend,
  'sol-breakout':      runSolBreakout,
  'defi-basket':       runDefiBasket,
  'btc-eth-pairs':     runBtcEthPairs,
  'vol-harvester':     runVolHarvester,
  'momentum-carry':    runMomentumCarry,
  'cascade-detect':    runCascadeDetect,
  'defi-yield':        runDefiYield,
  'spy-momentum':         runSpyMomentum,
  'qqq-growth':           runQqqGrowth,
  'sector-rotation':      runSectorRotation,
  'low-vol-equity':       runLowVolEquity,
  'covered-call-overlay': runCoveredCallOverlay,
  'spy-dual-momentum':    runSpyDualMomentum,
  'tech-rotation':        runTechRotation,
  'equity-mean-reversion': runEquityMeanReversion,
  'equity-trend-follow':  runEquityTrendFollow,
  'risk-parity':          runRiskParity,
  'composite-alpha-v2':   runCompositeAlphaV2,
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

  // Connectivity check — Yahoo Finance price source (optional check)
  const healthy = await healthCheckMarketData()
  if (!healthy) {
    console.warn('[run-agents] Yahoo Finance health check failed — proceeding anyway for agent execution')
    // Allow agents to run even without market data connectivity
    // They will use cached prices or skip if unavailable
  }

  const admin = createAdminClient()
  const ran_at = new Date().toISOString()

  let agentsQuery = admin
    .from('agents')
    .select('id, slug, total_aum_cents, share_price_cents, alert_level, asset_class')
    .eq('status', 'active')

  if (targetAgentId) agentsQuery = agentsQuery.eq('id', targetAgentId)

  let agentsData = await agentsQuery
  let { data: agents, error: agentsError } = agentsData

  if (agentsError) {
    return NextResponse.json({
      ok: false,
      error: agentsError.message || 'Database error',
      ran_at,
    })
  }

  if (!agents?.length) {
    const localAgents = AGENT_CONFIGS.map(a => a.slug)
    console.log(`[run-agents] No DB agents found, seeding ${localAgents.length} from local configs`)

    for (const slug of localAgents) {
      const { data: existing } = await admin.from('agents').select('id').eq('slug', slug).single()
      if (!existing) {
        const config = AGENT_CONFIGS.find(a => a.slug === slug)!
        await admin.from('agents').insert({
          slug,
          name: config.name,
          ticker: config.ticker,
          description: config.description,
          strategy_type: config.strategyType,
          asset_class: config.asset,
          status: 'active',
          share_price_cents: 10000,
          total_shares: 100000,
          total_aum_cents: 0,
          backtest_stats: {
            totalReturnPct: 0,
            sharpeRatio: 0,
            maxDrawdownPct: 0,
            winRatePct: 0,
            totalTrades: 0,
          },
        })
        console.log(`[run-agents] Seeded agent: ${slug}`)
      }
    }

    const { data: seeded } = await admin
      .from('agents')
      .select('id, slug, total_aum_cents, share_price_cents, alert_level, asset_class')
      .eq('status', 'active')
      .or(localAgents.map(s => `slug.eq.${s}`).join(','))

    if (seeded?.length) {
      agentsData = { data: seeded, error: null, count: seeded.length, status: 200, statusText: '' }
      agents = seeded
      console.log(`[run-agents] ${seeded.length} agents seeded from local configs`)
    } else {
      return NextResponse.json({
        ok: false,
        error: 'No active agents found',
        ran_at,
      })
    }
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

      // Use built-in strategy or fallback to generic momentum
      const runner = STRATEGY_MAP[agent.slug]
      let result: StrategyResult

      if (!runner) {
        // Fallback: use generic crypto momentum for custom agents
        console.log(`[run-agents] ${agent.slug}: Using generic crypto momentum fallback`)
        result = await runGenericCryptoMomentum(admin, agent.id, process.env.ALPACA_KEY_ID || '', process.env.ALPACA_SECRET_KEY || '', capitalCents)
      } else {
        result = await runner(admin, agent.id, process.env.ALPACA_KEY_ID || '', process.env.ALPACA_SECRET_KEY || '', capitalCents)
      }

      results[agent.slug] = result

      // Distribute equity trades to user accounts
      const users = await getUsersWithHoldings(admin, agent.id)
      console.log(`[run-agents] ${agent.slug}: ${users.length} users with holdings to distribute trades`)

      if (users.length > 0) {
        // Sync Kraken balances and positions BEFORE trading
        try {
          for (const user of users) {
            try {
              const balance = await syncAlpacaBalance(admin, user.user_id)
              console.log(`[run-agents] Pre-trade sync for user ${user.user_id}: cash=$${(balance.cash/100).toFixed(2)}`)
            } catch (syncErr) {
              console.warn(`[run-agents] Pre-trade sync failed for user ${user.user_id}:`, syncErr)
            }
          }
        } catch (e) {
          console.warn('[run-agents] Pre-trade sync skipped (may not have balance sync setup):', e instanceof Error ? e.message : e)
        }

        // Execute trades
        for (const action of result.actions) {
          if (action.action === 'BUY' || action.action === 'SELL') {
            const tradeAction = {
              symbol: action.symbol,
              side: (action.action === 'BUY' ? 'buy' : 'sell') as 'buy' | 'sell',
              qty: action.qty,
              notional: action.notional,
              fill_price: action.fill_price,
            }
            console.log(`[run-agents] Distributing ${action.action} ${action.symbol} qty=${action.qty} notional=${action.notional}`)
            try {
              const distResults = await distributeTradeToUsers(admin, agent.id, tradeAction, capitalCents)
              const successful = distResults.filter(r => r.success).length
              const failed = distResults.filter(r => !r.success).length
              console.log(`[run-agents] Distribution results: ${successful} succeeded, ${failed} failed`)
            } catch (distErr) {
              console.error(`[run-agents] Distribution failed:`, distErr)
            }

            // Write to agent_trades public ledger
            try {
              await admin.from('agent_trades').insert({
                agent_id: agent.id,
                alpaca_order_id: `kraken-cron-${Date.now()}`,
                symbol: action.symbol,
                side: action.action === 'BUY' ? 'buy' : 'sell',
                qty: action.qty ?? 0,
                fill_price: action.fill_price ?? 0,
                filled_at: new Date().toISOString(),
                pnl_cents: null,
              })
            } catch (ledgerErr) {
              console.warn(`[run-agents] agent_trades write failed:`, ledgerErr instanceof Error ? ledgerErr.message : ledgerErr)
            }
          }
        }

        // Sync Kraken balances AFTER trading
        for (const user of users) {
          try {
            const balance = await syncAlpacaBalance(admin, user.user_id)
            console.log(`[run-agents] Post-trade Kraken sync for user ${user.user_id}: cash=$${(balance.cash/100).toFixed(2)}`)
          } catch (syncErr) {
            console.warn(`[run-agents] Post-trade sync failed for user ${user.user_id}:`, syncErr instanceof Error ? syncErr.message : syncErr)
          }
        }
      } else {
        console.log(`[run-agents] No users have holdings for ${agent.slug}, skipping distribution`)
      }

      // Persist signal state
      const { error: updateSignalError } = await admin.from('agents').update({
        signal_summary: result.signal_summary || 'SCANNING',
        portfolio_json: JSON.stringify(result.portfolio),
        last_run_at: ran_at,
        last_error: null,
      }).eq('id', agent.id);
      if (updateSignalError) {
        console.warn(`[run-agents] signal_summary update failed for ${agent.slug}:`, updateSignalError.message);
      }

      // Log agent reasoning (thinking, indicators, decision context)
      try {
        const indicatorsJson = result.indicators ? JSON.stringify(result.indicators) : null
        const portfolioJson = result.portfolio ? JSON.stringify(result.portfolio) : null
        const actionsJson = result.actions ? JSON.stringify(result.actions) : null
        
        await admin.from('agent_reasoning').insert({
          agent_id: agent.id,
          run_at: ran_at,
          signal_summary: result.signal_summary || 'SCANNING',
          thinking: result.thinking || null,
          indicators_json: indicatorsJson,
          portfolio_json: portfolioJson,
          actions_json: actionsJson,
          price_source: 'yahoo_finance',
        })
        console.log(`[run-agents] ${agent.slug}: reasoning logged`)
      } catch (reasoningErr) {
        console.warn(`[run-agents] ${agent.slug}: failed to log reasoning:`, reasoningErr instanceof Error ? reasoningErr.message : reasoningErr)
      }

      const tradeCount = result.actions.filter(a => a.action === 'BUY' || a.action === 'SELL').length
      totalTrades += tradeCount
      if (tradeCount > 0) console.log(`[run-agents] ${agent.slug}: ${tradeCount} trade(s) executed`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[run-agents] ${agent.slug} failed:`, msg)
      results[agent.slug] = { agent_slug: agent.slug, error: msg }
      const { error: updateError } = await admin.from('agents').update({ last_error: msg }).eq('id', agent.id);
      if (updateError) {
        console.error(`[run-agents] Failed to update agent ${agent.slug} with error message:`, updateError.message);
      }
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
