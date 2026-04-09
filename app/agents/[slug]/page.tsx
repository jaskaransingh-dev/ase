import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import AgentDetailClient from './AgentDetailClient'

export const dynamic = 'force-dynamic'

export default async function AgentDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  // Use regular server client for public agent data — no RLS on agents table
  const supabase = await createClient()

  const { data: agent } = await supabase
    .from('agents')
    .select('id, name, slug, description, strategy_type, status, alert_level, drawdown_pct, monthly_fee_cents, subscriber_count, primary_symbol, backtest_strategy, signal_summary, backtest_stats')
    .eq('slug', slug)
    .single()

  // Agent not found in database → 404 page
  if (!agent) {
    notFound()
  }

  const [{ data: statsRows }, { data: trades }] = await Promise.all([
    supabase.from('agent_stats')
      .select('id, nav_cents, total_return_pct, sharpe_ratio, max_drawdown_pct, win_rate_pct, total_trades, snapshot_at')
      .eq('agent_id', agent.id)
      .order('snapshot_at', { ascending: true })
      .limit(100),
    supabase.from('agent_trades')
      .select('id, symbol, side, qty, fill_price, filled_at, pnl_cents')
      .eq('agent_id', agent.id)
      .order('filled_at', { ascending: false })
      .limit(25),
  ])

  // Check subscription status using admin client to avoid RLS join issues
  const admin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  let isSubscribed = false
  if (user) {
    const { data: sub } = await admin
      .from('subscriptions')
      .select('id')
      .eq('user_id', user.id)
      .eq('agent_id', agent.id)
      .eq('status', 'active')
      .maybeSingle()
    isSubscribed = !!sub
  }

  const latestStats = statsRows && statsRows.length > 0 ? statsRows[statsRows.length - 1] : null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const backtestStats = (agent as any).backtest_stats ?? null

  return (
    <AgentDetailClient
      agent={agent}
      statsHistory={statsRows ?? []}
      latestStats={latestStats}
      trades={trades ?? []}
      isLoggedIn={!!user}
      isSubscribed={isSubscribed}
      cachedBacktestStats={backtestStats}
    />
  )
}
