import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calculateTradingCapitalCents } from '@/lib/market'

export const dynamic = 'force-dynamic'

interface AgentData {
  id: string
  name: string
  slug: string
  ticker?: string
  description: string
  strategy_type: string
  status: string
  total_aum_cents: number
  share_price_cents?: number
  signal_summary?: string
  last_run_at?: string
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
  } | null
}

export async function GET() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('agents')
    .select('id, name, slug, ticker, description, strategy_type, status, total_aum_cents, share_price_cents, signal_summary, last_run_at, agent_stats(nav_cents, bid_cents, ask_cents, total_return_pct, sharpe_ratio, max_drawdown_pct, win_rate_pct, total_trades, snapshot_at)')
    .eq('status', 'active')
    .order('created_at')

  // Ensure ticker is always populated (fallback to slug-derived ticker)
  const agentsWithTicker = (data as unknown as AgentData[] ?? []).map(agent => ({
    ...agent,
    ticker: agent.ticker || agent.slug.toUpperCase().replace(/-/g, '').slice(0, 4),
    total_aum_cents: calculateTradingCapitalCents(agent.total_aum_cents),
  }))

  return NextResponse.json({ data: agentsWithTicker })
}
