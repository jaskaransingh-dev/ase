import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import AgentDetailClient from './AgentDetailClient'

export const dynamic = 'force-dynamic'

export default async function AgentDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const supabase = await createClient()

  const { data: agent } = await supabase
    .from('agents')
    .select('id, name, slug, description, strategy_type, status, asset_class, alert_level, drawdown_pct, monthly_fee_cents, subscriber_count, primary_symbol, backtest_strategy, signal_summary, backtest_stats')
    .eq('slug', slug)
    .eq('asset_class', 'crypto')
    .single()

  if (!agent) notFound()

  const admin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Parallel fetch: stats history, recent trades, subscription status, user holding (if logged in)
  const [{ data: statsRows }, { data: trades }, subResult, holdingResult] = await Promise.all([
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

    user ? admin.from('subscriptions').select('id').eq('user_id', user.id).eq('agent_id', agent.id).eq('status', 'active').maybeSingle() : Promise.resolve({ data: null }),

    // Fetch user's holding + compute current value
    user ? admin.from('holdings').select('id, shares, invested_cents, status').eq('user_id', user.id).eq('agent_id', agent.id).eq('status', 'active').maybeSingle() : Promise.resolve({ data: null }),
  ])

  const isSubscribed = !!subResult?.data

  const latestStats = statsRows && statsRows.length > 0 ? statsRows[statsRows.length - 1] : null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const backtestStats = (agent as any).backtest_stats ?? null

  // Compute holding value
  let initialHolding = null
  const rawHolding = holdingResult?.data
  if (rawHolding) {
    const navCents = latestStats?.nav_cents ?? 10_000
    const currentValueCents = Math.round((rawHolding.shares ?? 0) * navCents)
    const pnlCents = currentValueCents - (rawHolding.invested_cents ?? 0)
    initialHolding = {
      id: rawHolding.id,
      shares: rawHolding.shares,
      invested_cents: rawHolding.invested_cents,
      current_value_cents: currentValueCents,
      pnl_cents: pnlCents,
      status: rawHolding.status,
    }
  }

  return (
    <AgentDetailClient
      agent={agent}
      statsHistory={statsRows ?? []}
      latestStats={latestStats}
      trades={trades ?? []}
      isLoggedIn={!!user}
      isSubscribed={isSubscribed}
      cachedBacktestStats={backtestStats}
      initialHolding={initialHolding}
    />
  )
}
