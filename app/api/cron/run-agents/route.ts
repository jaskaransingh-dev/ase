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
import { checkCronAuth } from '@/lib/cron-auth'
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
// Agents fan out across many Alpaca/Kraken calls — give the cron the full
// 5-minute Vercel pro budget so it can finish a tick on every active agent
// instead of being killed mid-loop.
export const maxDuration = 300

// Crypto-only strategy map — Kraken only supports crypto assets.
// Equity agents (spy-momentum, qqq-growth, sector-rotation, etc.) are
// marked status='inactive' in the DB and excluded here.
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
  'composite-alpha-v2': runCompositeAlphaV2,
}

// Vercel Cron triggers via GET with `Authorization: Bearer <CRON_SECRET>`;
// internal callers (immediate-trigger after a buy) use POST with the
// `x-cron-secret` header. The GET handler at the bottom of this file
// delegates to POST so both paths run the same loop.
export async function POST(req: NextRequest) {
  let targetAgentId: string | null = null
  try {
    const body = await req.json()
    targetAgentId = typeof body?.agent_id === 'string' ? body.agent_id : null
  } catch { /* no body */ }

  const auth = checkCronAuth(req)
  if (!auth.ok) return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: 401 })

  // Connectivity check — Yahoo Finance price source (optional check)
  const healthy = await healthCheckMarketData()
  if (!healthy) {
    console.warn('[run-agents] Yahoo Finance health check failed — proceeding anyway for agent execution')
    // Allow agents to run even without market data connectivity
    // They will use cached prices or skip if unavailable
  }

  const admin = createAdminClient()
  const ran_at = new Date().toISOString()

  // The 5 featured launchase.com agents — these get processed first on
  // every tick so their last_run_at + signal_summary stay fresh even if
  // the rest of the loop runs long.
  const FEATURED = ['composite-alpha-v2','btc-momentum','eth-mean-revert','defi-basket','sol-breakout']

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

  // Sort featured agents to the front so they always get a turn even
  // if the cron tick gets killed before the rest of the list runs.
  agents = [...agents].sort((a, b) => {
    const ai = FEATURED.indexOf(a.slug); const bi = FEATURED.indexOf(b.slug)
    if (ai === -1 && bi === -1) return 0
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })

  console.log(`[run-agents] ${agents.length} agents in this cron tick`)

  const results: Record<string, StrategyResult | { error: string; agent_slug: string }> = {}
  let totalTrades = 0

  for (const agent of agents) {
    // Auto-delisting on hard drawdown is intentionally disabled —
    // active agents always trade their strategy regardless of past
    // drawdown. The drawdown is still tracked for display, but it no
    // longer halts execution.
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

      // Distribute equity trades to user accounts.
      // getUsersWithHoldings returns ALL holders — trading_enabled flags
      // whether the user has active Kraken keys for live execution.
      const users = await getUsersWithHoldings(admin, agent.id)
      const liveUsers = users.filter(u => u.trading_enabled)
      console.log(`[run-agents] ${agent.slug}: ${liveUsers.length} live-trading users, ${users.length - liveUsers.length} paper-only users`)

      // Pre-trade balance sync for connected users
      if (liveUsers.length > 0) {
        for (const user of liveUsers) {
          try {
            const balance = await syncAlpacaBalance(admin, user.user_id)
            console.log(`[run-agents] Pre-trade sync for user ${user.user_id}: cash=$${(balance.cash/100).toFixed(2)}`)
          } catch (syncErr) {
            console.warn(`[run-agents] Pre-trade sync failed for user ${user.user_id}:`, syncErr)
          }
        }
      }

      // Always process every BUY/SELL action — distribute to live users and
      // always write the public agent_trades ledger regardless of whether any
      // user has a connected broker account.
      for (const action of result.actions) {
        if (action.action === 'BUY' || action.action === 'SELL') {
          const tradeAction = {
            symbol: action.symbol,
            side: (action.action === 'BUY' ? 'buy' : 'sell') as 'buy' | 'sell',
            qty: action.qty,
            notional: action.notional,
            fill_price: action.fill_price,
          }

          // Distribute to users (live Kraken execution + paper logging)
          if (users.length > 0) {
            console.log(`[run-agents] Distributing ${action.action} ${action.symbol} qty=${action.qty} notional=${action.notional}`)
            try {
              const distResults = await distributeTradeToUsers(admin, agent.id, tradeAction, capitalCents)
              const successful = distResults.filter(r => r.success).length
              const failed = distResults.filter(r => !r.success).length
              console.log(`[run-agents] Distribution results: ${successful} succeeded, ${failed} failed`)
            } catch (distErr) {
              console.error(`[run-agents] Distribution failed:`, distErr)
            }
          }

          // Always write to agent_trades public ledger — this is the canonical
          // record of what the agent decided; it must exist regardless of
          // whether individual users have Kraken keys connected.
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

      // Post-trade balance sync for connected users
      for (const user of liveUsers) {
        try {
          const balance = await syncAlpacaBalance(admin, user.user_id)
          console.log(`[run-agents] Post-trade Kraken sync for user ${user.user_id}: cash=$${(balance.cash/100).toFixed(2)}`)
        } catch (syncErr) {
          console.warn(`[run-agents] Post-trade sync failed for user ${user.user_id}:`, syncErr instanceof Error ? syncErr.message : syncErr)
        }
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

  // ── Portfolio Snapshots ───────────────────────────────────────────────────
  // Write one snapshot per user per hour so the dashboard can render a
  // portfolio-value-over-time chart.  We pull all active holdings, group by
  // user_id, and upsert on (user_id, hour) so repeated ticks don't bloat.
  try {
    const { data: allHoldings } = await admin
      .from('holdings')
      .select('user_id, invested_cents, current_value_cents')
      .eq('status', 'active')

    const { data: wallets } = await admin
      .from('wallets')
      .select('user_id, balance_cents')

    const walletMap: Record<string, number> = {}
    for (const w of wallets ?? []) walletMap[w.user_id] = Number(w.balance_cents) || 0

    const byUser: Record<string, { invested: number; value: number }> = {}
    for (const h of allHoldings ?? []) {
      if (!byUser[h.user_id]) byUser[h.user_id] = { invested: 0, value: 0 }
      byUser[h.user_id].invested += Number(h.invested_cents) || 0
      byUser[h.user_id].value   += Number(h.current_value_cents) || 0
    }

    const snapshots = Object.entries(byUser).map(([userId, pos]) => {
      const cashCents     = walletMap[userId] ?? 0
      const totalValue    = pos.value + cashCents
      const pnlCents      = totalValue - pos.invested - cashCents
      return {
        user_id:            userId,
        snapshot_at:        ran_at,
        total_value_cents:  totalValue,
        invested_cents:     pos.invested,
        cash_cents:         cashCents,
        pnl_cents:          pnlCents,
      }
    })

    if (snapshots.length > 0) {
      await admin.from('user_portfolio_snapshots').upsert(snapshots, {
        onConflict: 'user_id,date_trunc(hour, snapshot_at)',
        ignoreDuplicates: false,
      }).then(r => {
        if (r.error) console.warn('[run-agents] snapshot upsert failed:', r.error.message)
        else console.log(`[run-agents] Portfolio snapshots written for ${snapshots.length} users`)
      })
    }
  } catch (err) {
    console.warn('[run-agents] Portfolio snapshot failed:', err instanceof Error ? err.message : err)
  }

  // ── Auto-Deallocate: protect pledged capital ──────────────────────────────
  // If a user's live Kraken free balance drops below their total invested
  // amount (meaning pledged money has been used by live trades), deallocate
  // all their holdings so they can't go into deficit.
  try {
    const { data: allActiveHoldings } = await admin
      .from('holdings')
      .select('id, user_id, invested_cents')
      .eq('status', 'active')

    const { data: krakenKeys } = await admin
      .from('user_kraken_keys')
      .select('user_id, last_balance_usd, status')
      .eq('status', 'active')

    const krakenBalMap: Record<string, number> = {}
    for (const k of krakenKeys ?? []) {
      krakenBalMap[k.user_id] = Math.round((Number(k.last_balance_usd) || 0) * 100)
    }

    const investedByUser: Record<string, number> = {}
    for (const h of allActiveHoldings ?? []) {
      investedByUser[h.user_id] = (investedByUser[h.user_id] || 0) + Number(h.invested_cents)
    }

    for (const [userId, totalInvested] of Object.entries(investedByUser)) {
      const freeCash = krakenBalMap[userId]
      if (freeCash === undefined) continue  // user not connected
      // If free cash < invested, pledged money was consumed — deallocate.
      if (freeCash < totalInvested * 0.9) {  // 10% buffer for price slippage
        console.warn(`[run-agents] Auto-deallocate: user ${userId} freeCash $${freeCash/100} < invested $${totalInvested/100}`)
        const userHoldings = allActiveHoldings!.filter(h => h.user_id === userId)
        for (const h of userHoldings) {
          await admin.from('holdings').update({
            status: 'sold',
            sold_at: new Date().toISOString(),
            shares: 0,
            invested_cents: 0,
            current_value_cents: 0,
          }).eq('id', h.id)
        }
        // Notify via wallet note (non-blocking)
        await admin.from('transactions').insert({
          user_id: userId,
          type: 'auto_deallocate',
          amount_cents: 0,
          note: `Auto-deallocated: Kraken balance ($${(freeCash/100).toFixed(2)}) fell below invested ($${(totalInvested/100).toFixed(2)})`,
        }).then(r => {
          if (r.error) console.warn('[run-agents] auto-deallocate transaction log failed:', r.error.message)
        })
      }
    }
  } catch (err) {
    console.warn('[run-agents] Auto-deallocate check failed:', err instanceof Error ? err.message : err)
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
