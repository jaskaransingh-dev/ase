import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import AgentDiveClient from './AgentDiveClient'

export const dynamic = 'force-dynamic'

export default async function AgentDeepDivePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  // First get the agent
  const { data: agent } = await supabase
    .from('agents')
    .select('id, name, slug, ticker, description, strategy_type, status, total_aum_cents, share_price_cents')
    .eq('slug', slug)
    .single()

  if (!agent) notFound()

  // Then fetch related data in parallel using the agent id
  const [statsRes, tradesRes, holdingRes] = await Promise.all([
    supabase.from('agent_stats')
      .select('id, nav_cents, total_return_pct, sharpe_ratio, max_drawdown_pct, win_rate_pct, total_trades, snapshot_at')
      .eq('agent_id', agent.id)
      .order('snapshot_at', { ascending: true })
      .limit(200),
    supabase.from('agent_trades')
      .select('*')
      .eq('agent_id', agent.id)
      .order('filled_at', { ascending: false })
      .limit(100),
    user ? supabase.from('holdings')
      .select('*')
      .eq('user_id', user.id)
      .eq('agent_id', agent.id)
      .eq('status', 'active')
      .maybeSingle()
      : { data: null },
  ])

  return (
    <AgentDiveClient
      agent={agent}
      statsHistory={statsRes.data ?? []}
      trades={tradesRes.data ?? []}
      userHolding={holdingRes.data}
    />
  )
}
