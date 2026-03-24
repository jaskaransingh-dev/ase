import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import ExchangeClient from './ExchangeClient'

export const dynamic = 'force-dynamic'

export default async function ExchangeDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: agent }, { data: statsRows }, { data: trades }, { data: holding }, { data: wallet }, { data: profile }] = await Promise.all([
    supabase.from('agents').select('id, name, slug, description, strategy_type, status, total_aum_cents').eq('slug', slug).single(),
    supabase.from('agent_stats')
      .select('id, nav_cents, total_return_pct, sharpe_ratio, max_drawdown_pct, win_rate_pct, total_trades, snapshot_at')
      .eq('agent_id', (await supabase.from('agents').select('id').eq('slug', slug).single()).data?.id ?? '')
      .order('snapshot_at', { ascending: true })
      .limit(100),
    supabase.from('agent_trades')
      .select('*')
      .eq('agent_id', (await supabase.from('agents').select('id').eq('slug', slug).single()).data?.id ?? '')
      .order('filled_at', { ascending: false })
      .limit(20),
    supabase.from('holdings')
      .select('*')
      .eq('user_id', user.id)
      .eq('agent_id', (await supabase.from('agents').select('id').eq('slug', slug).single()).data?.id ?? '')
      .eq('status', 'active')
      .maybeSingle(),
    supabase.from('wallets').select('balance_cents').eq('user_id', user.id).single(),
    supabase.from('profiles').select('display_name').eq('id', user.id).single(),
  ])

  if (!agent) notFound()

  return (
    <ExchangeClient
      agent={agent}
      statsHistory={statsRows ?? []}
      trades={trades ?? []}
      userHolding={holding}
      walletBalance={wallet?.balance_cents ?? 0}
      userName={profile?.display_name || user.email?.split('@')[0] || 'Trader'}
    />
  )
}
