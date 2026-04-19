import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()

    const { data: agents, error } = await admin
      .from('agents')
      .select(`
        *,
        agent_stats(nav_cents,total_return_pct,sharpe_ratio,max_drawdown_pct,win_rate_pct,total_trades,snapshot_at)
      `)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const myAgents = (agents ?? []).filter((a: any) => a.owner_id === user.id || !a.owner_id)

    const agentsWithStatus = (myAgents ?? []).map((agent: any) => {
      const latestStats = Array.isArray(agent.agent_stats) && agent.agent_stats.length > 0
        ? agent.agent_stats.sort((a: any, b: any) => new Date(b.snapshot_at).getTime() - new Date(a.snapshot_at).getTime())[0]
        : (agent.agent_stats && !Array.isArray(agent.agent_stats) ? agent.agent_stats : null)

      let displayStatus = 'unknown'
      if (agent.status === 'active') {
        displayStatus = 'listed'
      } else if (agent.status === 'paused') {
        displayStatus = 'paused'
      } else if (agent.status === 'pending_review') {
        displayStatus = 'pending'
      }

      return {
        id: agent.id,
        slug: agent.slug,
        name: agent.name,
        ticker: agent.ticker,
        description: agent.description,
        strategy_type: agent.strategy_type,
        status: agent.status,
        display_status: displayStatus,
        primary_symbol: agent.primary_symbol,
        backtest_stats: agent.backtest_stats,
        latest_stats: latestStats,
        submission_status: agent.status,
        total_aum_cents: agent.total_aum_cents,
        subscriber_count: agent.subscriber_count || 0,
        monthly_fee_cents: agent.monthly_fee_cents,
        created_at: agent.created_at,
      }
    })

    return NextResponse.json({ agents: agentsWithStatus })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
