import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import AgentDetailClient from './AgentDetailClient'

export const dynamic = 'force-dynamic'

export default async function AgentDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: agent }, { data: statsRows }, { data: trades }] = await Promise.all([
    supabase.from('agents').select('*').eq('slug', slug).single(),
    supabase.from('agent_stats')
      .select('*')
      .eq('agent_id', (await supabase.from('agents').select('id').eq('slug', slug).single()).data?.id ?? '')
      .order('snapshot_at', { ascending: true })
      .limit(100),
    supabase.from('agent_trades')
      .select('*')
      .eq('agent_id', (await supabase.from('agents').select('id').eq('slug', slug).single()).data?.id ?? '')
      .order('filled_at', { ascending: false })
      .limit(20),
  ])

  if (!agent) notFound()

  // Get user's holding in this agent
  let userHolding = null
  let walletBalance = 0
  if (user) {
    const [{ data: h }, { data: w }] = await Promise.all([
      supabase.from('holdings').select('*').eq('user_id', user.id).eq('agent_id', agent.id).eq('status', 'active').maybeSingle(),
      supabase.from('wallets').select('balance_cents').eq('user_id', user.id).single(),
    ])
    userHolding = h
    walletBalance = w?.balance_cents ?? 0
  }

  const latestStats = statsRows && statsRows.length > 0 ? statsRows[statsRows.length - 1] : null

  return (
    <AgentDetailClient
      agent={agent}
      statsHistory={statsRows ?? []}
      latestStats={latestStats}
      trades={trades ?? []}
      userHolding={userHolding}
      walletBalance={walletBalance}
      isLoggedIn={!!user}
    />
  )
}
