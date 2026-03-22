import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAccount, getPositions, getRecentOrders } from '@/lib/alpaca'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('x-cron-secret')
  if (authHeader !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

      // Calculate NAV
      // Use ratio of portfolio change to scale from initial $100 NAV
      let navCents = 10000 // Default $100 NAV

      if (totalShares > 0 && totalInvested > 0) {
        // Simple approach: NAV tracks portfolio performance
        const initialValue = totalShares * 10000 // Initial NAV was $100
        const currentPortfolio = portfolioValue
        // Scale the initial NAV by portfolio performance ratio
        const performanceRatio = initialValue > 0 ? currentPortfolio / initialValue : 1
        navCents = Math.round(10000 * performanceRatio)
      }

      // Get performance metrics
      const lastEquity = parseFloat(account.last_equity) * 100
      const totalReturnPct = lastEquity > 0
        ? ((portfolioValue - lastEquity) / lastEquity) * 100
        : 0

      // Approximate Sharpe (simplified)
      const sharpeRatio = totalReturnPct > 0 ? Math.min(totalReturnPct / 8, 4.0) : 0

      // Insert stats snapshot
      await admin.from('agent_stats').insert({
        agent_id: agent.id,
        nav_cents: navCents,
        total_return_pct: totalReturnPct,
        sharpe_ratio: sharpeRatio,
        max_drawdown_pct: 0, // Simplified for MVP
        win_rate_pct: 0,     // Would need trade history to compute
        total_trades: 0,
      })

      // Update all holdings current_value_cents
      for (const holding of activeHoldings ?? []) {
        const currentValue = Math.round(holding.shares * navCents)
        await admin
          .from('holdings')
          .update({ current_value_cents: currentValue })
          .eq('agent_id', agent.id)
          .eq('status', 'active')
          .eq('shares', holding.shares)
      }

      // Update agent AUM
      const totalAum = (activeHoldings ?? []).reduce((s, h) => s + (h.invested_cents ?? 0), 0)
      await admin
        .from('agents')
        .update({ total_aum_cents: totalAum })
        .eq('id', agent.id)

      results[agent.slug] = { nav_cents: navCents, total_return_pct: totalReturnPct, portfolio_value: portfolioValue }
    } catch (err) {
      results[agent.slug] = { error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  return NextResponse.json({ ok: true, results, updated_at: new Date().toISOString() })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
