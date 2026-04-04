import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import ExchangeClient from './ExchangeClient'
import { calculateTradingCapitalCents } from '@/lib/market'

export const dynamic = 'force-dynamic'

export default async function ExchangeDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Resolve agent first, then parallelize all dependent queries
  const { data: agent } = await supabase
    .from('agents')
    .select('id, name, slug, description, strategy_type, status, total_aum_cents, signal_summary, last_run_at')
    .eq('slug', slug)
    .single()

  if (!agent) notFound()

  const hydratedAgent = {
    ...agent,
    total_aum_cents: calculateTradingCapitalCents(agent.total_aum_cents ?? 0),
  }

  const [{ data: statsRows }, { data: trades }, { data: holding }, { data: wallet }, { data: profile }] = await Promise.all([
    supabase.from('agent_stats')
      .select('id, nav_cents, bid_cents, ask_cents, total_return_pct, sharpe_ratio, max_drawdown_pct, win_rate_pct, total_trades, daily_return_pct, snapshot_at')
      .eq('agent_id', agent.id)
      .order('snapshot_at', { ascending: true })
      .limit(200),
    supabase.from('agent_trades')
      .select('id, symbol, side, qty, fill_price, filled_at, pnl_cents, exit_reason')
      .eq('agent_id', agent.id)
      .order('filled_at', { ascending: false })
      .limit(50),
    supabase.from('holdings')
      .select('id, shares, entry_nav_cents, invested_cents, current_value_cents, created_at')
      .eq('user_id', user.id)
      .eq('agent_id', agent.id)
      .eq('status', 'active')
      .maybeSingle(),
    supabase.from('wallets').select('balance_cents').eq('user_id', user.id).single(),
    supabase.from('profiles').select('display_name').eq('id', user.id).single(),
  ])

  return (
    <ExchangeClient
      agent={hydratedAgent}
      statsHistory={statsRows ?? []}
      trades={trades ?? []}
      userHolding={holding}
      walletBalance={wallet?.balance_cents ?? 0}
      userName={profile?.display_name || user.email?.split('@')[0] || 'Trader'}
    />
  )
}
