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
 * Calculates proper financial metrics:
 *   - Sharpe Ratio: annualized ratio of mean daily return to volatility
 *   - Sortino Ratio: annualized ratio of mean daily return to downside volatility
 *   - Max Drawdown: largest peak-to-trough decline
 *   - Daily Return: current NAV vs previous NAV snapshot
 *   - Win Rate: closed sells with positive P&L / total sells
 *   - Total Trades: all buys + sells
 *
 * Run every 5–15 minutes via your cron scheduler.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCryptoBars } from '@/lib/alpaca'
import { getAgentPositions } from '@/lib/agents'
import { calculateHoldingValueCents, calculateNavFromState, calculateQuoteFromNav, PLATFORM_SEED_CAPITAL_CENTS } from '@/lib/market'

export const dynamic = 'force-dynamic'

/**
 * Calculate Sharpe Ratio from daily returns
 * sharpe = (mean_return / std_return) * sqrt(365)
 */
function calculateSharpeRatio(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0

  const meanReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
  const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / dailyReturns.length
  const stdDev = Math.sqrt(variance)

  if (stdDev === 0) return 0

  const sharpe = (meanReturn / stdDev) * Math.sqrt(365)
  return parseFloat(sharpe.toFixed(4))
}

/**
 * Calculate Sortino Ratio from daily returns
 * sortino = (mean_return / downside_std) * sqrt(365)
 */
function calculateSortinoRatio(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0

  const meanReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
  const downsideReturns = dailyReturns.filter(r => r < 0)

  if (downsideReturns.length === 0) return 0

  const downsideVariance = downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length
  const downsideStdDev = Math.sqrt(downsideVariance)

  if (downsideStdDev === 0) return 0

  const sortino = (meanReturn / downsideStdDev) * Math.sqrt(365)
  return parseFloat(sortino.toFixed(4))
}

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
    .select('id, slug, total_aum_cents, peak_nav_cents, alert_level, high_water_mark_cents, developer_fee_pct, accrued_fee_cents')
    .eq('status', 'active')

  const results: Record<string, unknown> = {}
  const now = new Date().toISOString()

  for (const agent of agents ?? []) {
    try {
      const { data: activeHoldings } = await admin
        .from('holdings')
        .select('id, shares, invested_cents')
        .eq('agent_id', agent.id)
        .eq('status', 'active')

      const investorCapitalCents = (activeHoldings ?? []).reduce(
        (sum, holding) => sum + (Number(holding.invested_cents) || 0),
        0
      )

      // ── 1. REALIZED P&L (from closed trades with pnl_cents) ────────────
      const { data: closedTrades } = await admin
        .from('agent_trades')
        .select('side, pnl_cents')
        .eq('agent_id', agent.id)
        .not('pnl_cents', 'is', null)

      const realizedPnlCents = (closedTrades ?? []).reduce(
        (sum, t) => sum + (Number(t.pnl_cents) || 0), 0
      )

      // Count only sells (side = 'sell') for win rate calculation
      const sellTrades = (closedTrades ?? []).filter(t => t.side === 'sell' || t.side === 'SELL')
      const winningTrades = sellTrades.filter(t => (Number(t.pnl_cents) || 0) > 0).length
      const winRatePct = sellTrades.length > 0 ? (winningTrades / sellTrades.length) * 100 : 0

      // Total trades = all trades (buys + sells)
      const { data: allTrades } = await admin
        .from('agent_trades')
        .select('id')
        .eq('agent_id', agent.id)

      const totalTrades = allTrades?.length || 0

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

      const totalPnlCents    = realizedPnlCents + unrealizedPnlCents
      const navState = calculateNavFromState({
        investorCapitalCents,
        totalPnlCents,
      })
      const capitalCents = PLATFORM_SEED_CAPITAL_CENTS + investorCapitalCents
      const navCents = navState.navCents
      const totalPoolCents = navState.totalPoolCents
      const totalReturnPct = navState.totalReturnPct

      // ── 4. DAILY RETURN (vs previous NAV snapshot) ────────────────────
      const { data: previousStats } = await admin
        .from('agent_stats')
        .select('nav_cents')
        .eq('agent_id', agent.id)
        .order('snapshot_at', { ascending: false })
        .limit(1)

      let dailyReturnPct = 0
      if (previousStats && previousStats.length > 0) {
        const previousNav = Number(previousStats[0].nav_cents)
        if (previousNav > 0) {
          dailyReturnPct = ((navCents - previousNav) / previousNav) * 100
        }
      }

      // ── 5. SHARPE RATIO (from last 30 daily NAV snapshots) ────────────
      const { data: navHistory } = await admin
        .from('agent_stats')
        .select('nav_cents')
        .eq('agent_id', agent.id)
        .order('snapshot_at', { ascending: true })
        .limit(30)

      let sharpeRatio = 0
      let sortinoRatio = 0
      const dailyReturns: number[] = []

      if (navHistory && navHistory.length >= 2) {
        const navs = navHistory.map(s => Number(s.nav_cents))
        for (let i = 1; i < navs.length; i++) {
          const prevNav = navs[i - 1]
          if (prevNav > 0) {
            const dailyReturn = ((navs[i] - prevNav) / prevNav) * 100
            dailyReturns.push(dailyReturn)
          }
        }

        // Add today's daily return
        if (navHistory.length > 0) {
          const lastNav = navs[navs.length - 1]
          if (lastNav > 0) {
            const todayReturn = ((navCents - lastNav) / lastNav) * 100
            dailyReturns.push(todayReturn)
          }
        }

        if (dailyReturns.length >= 2) {
          sharpeRatio = calculateSharpeRatio(dailyReturns)
          sortinoRatio = calculateSortinoRatio(dailyReturns)
        }
      }

      // ── 6. MAX DRAWDOWN (from all historical NAV data) ────────────────
      const { data: allNavHistory } = await admin
        .from('agent_stats')
        .select('nav_cents')
        .eq('agent_id', agent.id)
        .order('snapshot_at', { ascending: true })

      let maxDrawdownPct = 0
      if (allNavHistory && allNavHistory.length > 0) {
        const allNavs = allNavHistory.map(s => Number(s.nav_cents)).concat(navCents)
        let peakNav = allNavs[0]

        for (const nav of allNavs) {
          if (nav > peakNav) peakNav = nav
          const drawdown = peakNav > 0 ? ((peakNav - nav) / peakNav) * 100 : 0
          if (drawdown > maxDrawdownPct) maxDrawdownPct = drawdown
        }
      }

      // ── 7. PORTFOLIO VALUE ────────────────────────────────────────────
      const portfolioValueCents = capitalCents + totalPnlCents

      // ── 8. WRITE agent_stats SNAPSHOT ─────────────────────────────────
      await admin.from('agent_stats').insert({
        agent_id: agent.id,
        snapshot_at: now,
        nav_cents: navCents,
        // bid/ask generated columns — do not insert them (they're computed)
        total_return_pct: parseFloat(totalReturnPct.toFixed(4)),
        sharpe_ratio: sharpeRatio,
        sortino_ratio: sortinoRatio,
        max_drawdown_pct: parseFloat(maxDrawdownPct.toFixed(4)),
        win_rate_pct: parseFloat(winRatePct.toFixed(4)),
        total_trades: totalTrades,
        volume_shares: openPositions.reduce((s, p) => s + p.qty, 0),
        daily_return_pct: parseFloat(dailyReturnPct.toFixed(4)),
        portfolio_value_cents: portfolioValueCents,
      })

      // ── 9. QUOTE GENERATION ────────────────────────────────────────────
      const investedCents = openPositions.reduce((s, p) => s + Math.round(p.qty * p.avg_entry * 100), 0)
      const exposureFraction = capitalCents > 0 ? Math.min(1, investedCents / capitalCents) : 0
      const { data: openOrders } = await admin
        .from('limit_orders')
        .select('side, notional_cents, shares')
        .eq('agent_id', agent.id)
        .eq('status', 'open')

      const pendingBuyCents = (openOrders ?? [])
        .filter(order => order.side === 'buy')
        .reduce((sum, order) => sum + (Number(order.notional_cents) || calculateHoldingValueCents(Number(order.shares) || 0, navCents)), 0)

      const pendingSellCents = (openOrders ?? [])
        .filter(order => order.side === 'sell')
        .reduce((sum, order) => sum + (Number(order.notional_cents) || calculateHoldingValueCents(Number(order.shares) || 0, navCents)), 0)

      const quote = calculateQuoteFromNav({
        navCents,
        totalPoolCents,
        pendingBuyCents,
        pendingSellCents,
        exposureFraction,
      })

      await admin.from('price_ticks').upsert({
        agent_id: agent.id,
        tick_at: now,
        price_cents: navCents,
        bid_cents: quote.bidCents,
        ask_cents: quote.askCents,
        volume: openPositions.reduce((s, p) => s + p.qty, 0),
      }, { onConflict: 'agent_id,tick_at' })

      // ── 10. UPDATE agent share price + investor capital ───────────────
      await admin
        .from('agents')
        .update({
          share_price_cents: navCents,
          total_aum_cents: investorCapitalCents,
        })
        .eq('id', agent.id)

      // ── 11. UPDATE holdings current value ─────────────────────────────
      for (const holding of activeHoldings ?? []) {
        const currentValue = calculateHoldingValueCents(Number(holding.shares) || 0, navCents)
        await admin
          .from('holdings')
          .update({ current_value_cents: currentValue })
          .eq('id', holding.id)
      }

      // ── 12. UPDATE outstanding share count ─────────────────────────────
      const totalOutstandingShares = (activeHoldings ?? []).reduce(
        (sum, h) => sum + Number(h.shares),
        0
      )
      await admin
        .from('agents')
        .update({
          total_aum_cents: investorCapitalCents,
          total_shares: totalOutstandingShares,
        })
        .eq('id', agent.id)

      // ── 13. DRAWDOWN TRACKING (White Paper Section 7.4) ───────────
      const currentNav = navCents
      const peakNav = Math.max(agent.peak_nav_cents ?? 10000, currentNav)
      const drawdownPct = peakNav > 0 ? ((peakNav - currentNav) / peakNav) * 100 : 0
      const alertLevel = drawdownPct >= 40 ? 'hard'
        : drawdownPct >= 25 ? 'orange'
        : drawdownPct >= 15 ? 'yellow' : 'none'

      await admin.from('agents').update({
        peak_nav_cents: peakNav,
        drawdown_pct: Math.round(drawdownPct * 100) / 100,
        alert_level: alertLevel,
        last_active_at: new Date().toISOString(),
      }).eq('id', agent.id)

      if (alertLevel !== 'none' && alertLevel !== agent.alert_level) {
        console.warn(`[drawdown] ${agent.slug}: ${alertLevel.toUpperCase()} ALERT — ${drawdownPct.toFixed(1)}% drawdown`)
      }

      // ── 14. DEVELOPER PERFORMANCE FEE (White Paper Section 4.1) ────
      const hwm = agent.high_water_mark_cents ?? 10000
      const feePct = (agent.developer_fee_pct ?? 20) / 100

      if (currentNav > hwm) {
        const gainAboveHwm = currentNav - hwm
        const feeOnGain = Math.round(gainAboveHwm * feePct)
        await admin.from('agents').update({
          high_water_mark_cents: currentNav,
          accrued_fee_cents: (agent.accrued_fee_cents ?? 0) + feeOnGain,
        }).eq('id', agent.id)
        console.log(`[fees] ${agent.slug}: +${feeOnGain / 100} fee accrued (HWM now $${currentNav / 100})`)
      }

      results[agent.slug] = {
        nav_cents: navCents,
        nav_usd: (navCents / 100).toFixed(2),
        share_price_usd: (navCents / 100).toFixed(2),
        demand_premium_pct: '0.000',
        capital_usd: (capitalCents / 100).toFixed(0),  // seed + investor AUM
        investor_aum_usd: (investorCapitalCents / 100).toFixed(0),
        total_return_pct: parseFloat(totalReturnPct.toFixed(2)),
        realized_pnl_usd: (realizedPnlCents / 100).toFixed(2),
        unrealized_pnl_usd: (unrealizedPnlCents / 100).toFixed(2),
        open_positions: openPositions.length,
        total_trades: totalTrades,
        win_rate_pct: parseFloat(winRatePct.toFixed(1)),
        daily_return_pct: parseFloat(dailyReturnPct.toFixed(2)),
        sharpe_ratio: sharpeRatio,
        sortino_ratio: sortinoRatio,
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
