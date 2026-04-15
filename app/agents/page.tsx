import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import AgentsGrid from './AgentsGrid'

export const dynamic = 'force-dynamic'

interface AgentRow {
  id: string
  slug: string
  name: string
  ticker: string | null
  description: string | null
  strategy_type: string | null
  asset_class: string | null
  primary_symbol: string | null
  share_price_cents: number | null
  subscriber_count: number | null
  backtest_stats?: { stats?: { totalReturnPct?: number; sharpeRatio?: number; maxDrawdownPct?: number; winRate?: number } } | null
  agent_stats?: Array<{
    total_return_pct: number | null
    sharpe_ratio: number | null
    max_drawdown_pct: number | null
    win_rate_pct: number | null
    nav_cents: number | null
    snapshot_at: string
  }> | null
}

export default async function AgentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [agentsRes, historyRes] = await Promise.all([
    supabase
      .from('agents')
      .select('*, agent_stats(nav_cents,total_return_pct,sharpe_ratio,max_drawdown_pct,win_rate_pct,total_trades,snapshot_at), backtest_stats')
      .eq('status', 'active')
      .order('created_at'),
    supabase
      .from('agent_backtest_history')
      .select('agent_id, period, stats')
      .in('period', ['1mo', '1y']),
  ])

  const agentsList = (agentsRes.data ?? []) as AgentRow[]

  // Build backtest map
  const btMap: Record<string, Record<string, { totalReturnPct: number; sharpeRatio: number; maxDrawdownPct: number; winRate: number }>> = {}
  for (const row of historyRes.data ?? []) {
    if (!btMap[row.agent_id]) btMap[row.agent_id] = {}
    if (row.stats && typeof row.stats === 'object') {
      btMap[row.agent_id][row.period] = row.stats as { totalReturnPct: number; sharpeRatio: number; maxDrawdownPct: number; winRate: number }
    }
  }

  // User subscriptions
  let userSubAgentIds = new Set<string>()
  if (user) {
    const { data: subs } = await supabase
      .from('subscriptions')
      .select('agent_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
    userSubAgentIds = new Set((subs ?? []).map(s => s.agent_id))
  }

  // Trigger backtest cron
  const agentsNeedingBacktest = agentsList.filter(a => !a.backtest_stats && !btMap[a.id]?.['1mo'])
  if (agentsNeedingBacktest.length > 0) {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
    const cronSecret = process.env.CRON_SECRET ?? ''
    fetch(`${baseUrl}/api/cron/run-backtests`, {
      method: 'POST',
      cache: 'no-store',
      headers: cronSecret ? { 'x-cron-secret': cronSecret } : {},
    }).catch(() => null)
  }

  // Build display agents
  const displayAgents = agentsList.map(agent => {
    const statsArr = Array.isArray(agent.agent_stats) ? agent.agent_stats : (agent.agent_stats ? [agent.agent_stats] : [])
    const latestStats = statsArr.length > 0
      ? statsArr.reduce((a, b) => (a.snapshot_at > b.snapshot_at ? a : b))
      : null

    const bt1mo = btMap[agent.id]?.['1mo'] ?? agent.backtest_stats?.stats
    const cachedBt = agent.backtest_stats?.stats

    const return30d = latestStats?.total_return_pct ?? bt1mo?.totalReturnPct ?? cachedBt?.totalReturnPct ?? null
    const sharpe = latestStats?.sharpe_ratio ?? bt1mo?.sharpeRatio ?? cachedBt?.sharpeRatio ?? null
    const maxDD = latestStats?.max_drawdown_pct ?? bt1mo?.maxDrawdownPct ?? cachedBt?.maxDrawdownPct ?? null
    const winRate = latestStats?.win_rate_pct ?? bt1mo?.winRate ?? cachedBt?.winRate ?? null
    const isLive = !!latestStats
    const navCents = latestStats?.nav_cents ?? agent.share_price_cents ?? 10_000

    return {
      id: agent.id,
      slug: agent.slug,
      name: agent.name,
      ticker: agent.ticker ?? agent.primary_symbol?.replace('-USD', '').replace('-USD', '') ?? 'XX',
      description: agent.description,
      strategy_type: agent.strategy_type ?? 'momentum',
      asset_class: agent.asset_class ?? 'crypto',
      primary_symbol: agent.primary_symbol,
      return30d,
      sharpe,
      maxDD,
      winRate,
      nav: navCents / 100,
      subscriber_count: agent.subscriber_count ?? 0,
      isSubscribed: userSubAgentIds.has(agent.id),
      isLive,
      todayReturn: latestStats?.total_return_pct ?? null,
    }
  })

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: '.25rem' }}>MARKETPLACE</div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-.02em' }}>AI Trading Agents</h1>
        </div>
        <Link href="/dashboard/backtest" style={{ padding: '.5rem 1rem', borderRadius: 100, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: '.78rem', fontWeight: 600, textDecoration: 'none', transition: 'all .15s' }}>
          Build →
        </Link>
      </div>

      <AgentsGrid agents={displayAgents} />
    </div>
  )
}


