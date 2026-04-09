/**
 * GET /api/agent-backtest-history
 * 
 * Retrieve historical backtest data for agents across multiple periods.
 * Used by the live performance feature on agent detail pages.
 * 
 * Query parameters:
 * - agent_id: string (required) - Agent ID to fetch history for
 * - period: string (optional) - Specific period ('1y', '2y', '5y'), defaults to all periods
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agent_id')
  const period = searchParams.get('period')

  if (!agentId) {
    return NextResponse.json({ error: 'agent_id is required' }, { status: 400 })
  }

  const supabase = await createClient()

  try {
    let query = supabase
      .from('agent_backtest_history')
      .select('*')
      .eq('agent_id', agentId)
      .order('computed_at', { ascending: false })

    if (period) {
      query = query.eq('period', period)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching agent backtest history:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Transform the data to match the expected format for the UI
    const transformedData = data?.map(record => ({
      symbol: record.symbol,
      strategy: record.strategy,
      period: record.period,
      computed_at: record.computed_at,
      stats: record.stats,
      buyHold: { totalReturnPct: record.buy_hold_return_pct },
      equityCurve: record.equity_curve,
      buyHoldCurve: record.buy_hold_curve,
    })) || []

    return NextResponse.json({ 
      agent_id: agentId,
      period: period || 'all',
      data: transformedData 
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Error in agent backtest history API:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
