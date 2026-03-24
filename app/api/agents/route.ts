import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface AgentData {
  id: string
  name: string
  slug: string
  description: string
  strategy_type: string
  status: string
  total_aum_cents: number
  ticker?: string
  agent_stats: {
    nav_cents: number
    bid_cents?: number
    ask_cents?: number
    total_return_pct: number
    sharpe_ratio: number
    max_drawdown_pct: number
    win_rate_pct: number
    total_trades: number
    snapshot_at: string
  }
}

export async function GET() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('agents')
    .select('id, name, slug, description, strategy_type, status, total_aum_cents, agent_stats(nav_cents, bid_cents, ask_cents, total_return_pct, sharpe_ratio, max_drawdown_pct, win_rate_pct, total_trades, snapshot_at)')
    .eq('status', 'active')
    .order('created_at')

  // Add ticker field if missing
  const agentsWithTicker = (data as unknown as AgentData[] ?? []).map(agent => ({
    ...agent,
    ticker: agent.ticker || agent.slug.toUpperCase().replace('-', '').slice(0, 4)
  }))

  return NextResponse.json({ data: agentsWithTicker })
}
