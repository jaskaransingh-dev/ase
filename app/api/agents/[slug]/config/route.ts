import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const slug = url.pathname.split('/agents/')[1]?.split('/config')[0]
    if (!slug) {
      return NextResponse.json({ error: 'Slug is required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: agent, error } = await admin
      .from('agents')
      .select('id, slug, status, name, description, strategy_type, primary_symbol, backtest_stats, monthly_fee_cents')
      .eq('slug', slug)
      .single()

    if (error || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const bs = (agent.backtest_stats as Record<string, unknown>) || {}

    return NextResponse.json({
      slug: agent.slug,
      name: agent.name,
      description: agent.description,
      status: agent.status,
      strategy_type: agent.strategy_type,
      primary_symbol: agent.primary_symbol,
      universe: Array.isArray(bs.symbols) ? bs.symbols : [agent.primary_symbol || 'BTC-USD'].filter(Boolean),
      config: {
        lookbackDays: bs.lookbackDays ?? 14,
        topN: bs.topN ?? 3,
        stopLossPct: bs.stopLossPct ?? 0.05,
        takeProfitPct: bs.takeProfitPct ?? 0.15,
        momentumWeight: bs.momentumWeight ?? 1.0,
        trendWeight: bs.trendWeight ?? 0.3,
        rsiWeight: bs.rsiWeight ?? 0.2,
        riskAversion: 8,
        maxWeight: 0.25,
      },
      backtest_stats: bs,
      monthly_fee_cents: agent.monthly_fee_cents,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}