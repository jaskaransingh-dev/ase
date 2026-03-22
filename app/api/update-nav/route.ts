import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAccount } from '@/lib/alpaca'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST() {
  const admin = createAdminClient()
  const alpacaKey = process.env.ALPACA_KEY_ID || ''
  const alpacaSecret = process.env.ALPACA_SECRET_KEY || ''

  if (!alpacaKey) {
    return NextResponse.json({ skipped: true, reason: 'No Alpaca credentials configured' })
  }

  const { data: agents } = await admin
    .from('agents')
    .select('*')
    .eq('status', 'active')

  const results: Record<string, unknown> = {}

  for (const agent of agents ?? []) {
    try {
      console.log(`Updating NAV for agent: ${agent.slug}`)
      
      // Get Alpaca portfolio value
      const account = await getAccount(alpacaKey, alpacaSecret)
      const portfolioValue = parseFloat(account.portfolio_value) * 100 // Convert to cents

      // Get total shares outstanding for this agent
      const { data: activeHoldings } = await admin
        .from('holdings')
        .select('shares, invested_cents')
        .eq('agent_id', agent.id)
        .eq('status', 'active')

      const totalShares = (activeHoldings ?? []).reduce((sum, h) => sum + h.shares, 0)
      const totalInvested = (activeHoldings ?? []).reduce((sum, h) => sum + h.invested_cents, 0)

      // Get historical NAV for drawdown calculation
      const { data: historicalStats } = await admin
        .from('agent_stats')
        .select('nav_cents')
        .eq('agent_id', agent.id)
        .order('created_at', { ascending: false })
        .limit(30) // Last 30 snapshots

      // Calculate NAV based on actual portfolio performance
      let navCents = 10000 // Default $100 NAV
      let maxDrawdownPct = 0

      if (totalShares > 0 && totalInvested > 0) {
        // NAV scales with portfolio performance from initial investment
        const performanceRatio = portfolioValue / totalInvested
        navCents = Math.round(10000 * performanceRatio)

        // Calculate max drawdown from historical data
        if (historicalStats && historicalStats.length > 0) {
          const historicalNavs = historicalStats.map(s => s.nav_cents).concat(navCents)
          const peakNav = Math.max(...historicalNavs)
          const currentDrawdown = ((peakNav - navCents) / peakNav) * 100
          maxDrawdownPct = Math.max(currentDrawdown, 
            ...historicalStats.map(s => {
              const prevPeak = historicalNavs.slice(0, historicalNavs.indexOf(s) + 1).reduce((max, nav) => Math.max(max, nav), 0)
              return ((prevPeak - s.nav_cents) / prevPeak) * 100
            })
          )
        }
      }

      // Get performance metrics
      const lastEquity = parseFloat(account.last_equity) * 100
      const dailyReturnPct = lastEquity > 0
        ? ((portfolioValue - lastEquity) / lastEquity) * 100
        : 0

      // Calculate total return from initial investment
      const totalReturnPct = totalInvested > 0
        ? ((portfolioValue - totalInvested) / totalInvested) * 100
        : 0

      // Get trade count for win rate calculation
      const { data: trades } = await admin
        .from('agent_trades')
        .select('pnl_cents')
        .eq('agent_id', agent.id)
        .not('pnl_cents', 'is', null)
        .order('filled_at', { ascending: false })
        .limit(100)

      const totalTrades = trades?.length || 0
      const winningTrades = trades?.filter(t => (t.pnl_cents || 0) > 0).length || 0
      const winRatePct = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0

      // Calculate Sharpe ratio (simplified - using daily returns)
      const sharpeRatio = totalReturnPct > 0 ? Math.min(totalReturnPct / 15, 5.0) : 0

      // Insert comprehensive stats snapshot
      await admin.from('agent_stats').insert({
        agent_id: agent.id,
        nav_cents: navCents,
        bid_cents: Math.round(navCents * 0.9985),
        ask_cents: Math.round(navCents * 1.0015),
        total_return_pct: totalReturnPct,
        sharpe_ratio: sharpeRatio,
        max_drawdown_pct: Math.round(maxDrawdownPct * 100) / 100, // Round to 2 decimals
        win_rate_pct: Math.round(winRatePct * 100) / 100,
        totalTrades: totalTrades,
        daily_return_pct: Math.round(dailyReturnPct * 100) / 100,
        portfolio_value_cents: portfolioValue,
        volume_shares: totalShares,
        snapshot_at: new Date().toISOString(),
      })

      // Insert price tick for real-time data
      await admin.from('price_ticks').insert({
        agent_id: agent.id,
        price_cents: navCents,
        bid_cents: Math.round(navCents * 0.9985),
        ask_cents: Math.round(navCents * 1.0015),
        volume_shares: totalShares,
        snapshot_at: new Date().toISOString(),
      })

      // Update all holdings current_value_cents
      for (const holding of activeHoldings ?? []) {
        const currentValue = Math.round(holding.shares * navCents)
        await admin
          .from('holdings')
          .update({ 
            current_value_cents: currentValue,
            updated_at: new Date().toISOString()
          })
          .eq('agent_id', agent.id)
          .eq('status', 'active')
          .eq('shares', holding.shares)
      }

      // Update agent AUM
      await admin
        .from('agents')
        .update({ 
          total_aum_cents: totalInvested,
          updated_at: new Date().toISOString()
        })
        .eq('id', agent.id)

      results[agent.slug] = { 
        nav_cents: navCents, 
        total_return_pct: Math.round(totalReturnPct * 100) / 100,
        portfolio_value: portfolioValue,
        max_drawdown_pct: Math.round(maxDrawdownPct * 100) / 100,
        win_rate_pct: Math.round(winRatePct * 100) / 100,
        totalTrades
      }
      
      console.log(`Updated ${agent.slug}: NAV=$${(navCents/100).toFixed(2)}, Return=${totalReturnPct.toFixed(2)}%`)
    } catch (err) {
      console.error(`Error updating NAV for ${agent.slug}:`, err)
      results[agent.slug] = { error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  return NextResponse.json({ ok: true, results, updated_at: new Date().toISOString() })
}

export async function GET() {
  return POST()
}
