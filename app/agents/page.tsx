import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { HoverCard } from '@/components/ui/hover-card'
import { fmtPct } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const strategyInfo: Record<string, { label: string; color: string }> = {
  momentum:              { label: 'Momentum',        color: 'var(--gold)' },
  mean_reversion:        { label: 'Mean Reversion',  color: 'var(--green)' },
  trend_following:       { label: 'Trend Following', color: '#7B9FFF' },
  crypto_momentum:       { label: 'Crypto Momentum', color: '#F7931A' },
  crypto_mean_reversion: { label: 'Crypto Arb',      color: '#0EAD6E' },
}

export default async function AgentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data } = await supabase
    .from('agents')
    .select('*, agent_stats(nav_cents,total_return_pct,sharpe_ratio,max_drawdown_pct,win_rate_pct,total_trades,snapshot_at), backtest_stats')
    .eq('status', 'active')
    .order('created_at')

  type AgentRow = NonNullable<typeof data>[number] & {
    alert_level?: string
    monthly_fee_cents?: number
    subscriber_count?: number
    primary_symbol?: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    backtest_stats?: any
  }

  const agentsList = (data ?? []) as AgentRow[]

  // Get user's subscriptions if logged in
  let userSubAgentIds = new Set<string>()
  if (user) {
    const { data: subs } = await supabase
      .from('subscriptions')
      .select('agent_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
    userSubAgentIds = new Set((subs ?? []).map(s => s.agent_id))
  }

  const totalSubscribers = agentsList.reduce((s, a: AgentRow) => s + (a.subscriber_count ?? 0), 0)

  return (
    <div style={{ padding: '2rem 2.5rem', maxWidth: 1440, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: '.35rem' }}>MARKETPLACE</div>
          <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '1.8rem', fontWeight: 800 }}>AI Trading Agents</h1>
          <p style={{ color: 'var(--muted)', fontSize: '.9rem', marginTop: '.35rem' }}>
            Subscribe to verified strategies — live execution, transparent performance
          </p>
        </div>
        <Link href="/builders/submit" className="btn-secondary" style={{ fontSize: '.85rem' }}>
          Submit Your Agent →
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '.7rem', marginBottom: '1.5rem' }} className="agents-top-strip">
        {[
          { label: 'Live Strategies', value: String(agentsList.length), color: 'var(--white)' },
          { label: 'Total Subscribers', value: String(totalSubscribers), color: '#8BE9FF' },
          { label: 'Subscription Model', value: 'Free Beta', color: 'var(--green)' },
        ].map((item) => (
          <div key={item.label} style={{ borderRadius: 12, border: '1px solid rgba(148,163,184,.24)', background: 'rgba(9,14,28,.72)', padding: '.7rem .8rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: '#8CA0C4', letterSpacing: '.08em', marginBottom: '.2rem' }}>{item.label.toUpperCase()}</div>
            <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, color: item.color }}>{item.value}</div>
          </div>
        ))}
      </div>

      {agentsList.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '5rem 2rem', color: 'var(--muted)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⬡</div>
          <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.2rem', fontWeight: 800, marginBottom: '.5rem' }}>Agents launching soon</div>
          <div style={{ fontSize: '.9rem' }}>The first verified agents are being onboarded.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: '1.25rem' }}>
          {agentsList.map((agent: AgentRow) => {
            const statsArr = Array.isArray(agent.agent_stats) ? agent.agent_stats : (agent.agent_stats ? [agent.agent_stats] : [])
            const latestStats = statsArr.length > 0 ? statsArr.reduce((a: typeof statsArr[0], b: typeof statsArr[0]) => (a.snapshot_at > b.snapshot_at ? a : b)) : null
            // Fall back to cached backtest stats when no live agent_stats exist
            const bt = agent.backtest_stats?.stats
            const ret = latestStats?.total_return_pct ?? bt?.totalReturnPct ?? 0
            const sharpe = latestStats?.sharpe_ratio ?? bt?.sharpeRatio ?? 0
            const maxDD = latestStats?.max_drawdown_pct ?? bt?.maxDrawdownPct ?? 0
            const winRate = latestStats?.win_rate_pct ?? bt?.winRate ?? 0
            const info = strategyInfo[agent.strategy_type] || { label: agent.strategy_type, color: 'var(--white)' }
            const pos = ret >= 0
            const isSubscribed = userSubAgentIds.has(agent.id)
            const monthlyFee = agent.monthly_fee_cents ?? 0
            const subscribers = agent.subscriber_count ?? 0
            const isBacktestData = !latestStats && !!bt

            return (
              <div key={agent.id} style={{ background: 'var(--bg2)', borderRadius: 20, padding: '1.5rem', border: '1px solid var(--border)', position: 'relative', display: 'flex', flexDirection: 'column' }}>
                {/* Subscribed badge */}
                {isSubscribed && (
                  <div style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(110,231,183,.12)', border: '1px solid rgba(110,231,183,.3)', borderRadius: 8, padding: '.2rem .55rem', fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: '#6EE7B7', letterSpacing: '.06em' }}>
                    SUBSCRIBED
                  </div>
                )}

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.05rem', fontWeight: 800, marginBottom: '.2rem' }}>{agent.name}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', letterSpacing: '.04em' }}>
                      {agent.primary_symbol ?? 'MULTI'} · {subscribers} subscribers
                    </div>
                  </div>
                  {!isSubscribed && (
                    agent.alert_level === 'hard' ? (
                      <span className="pill" style={{ fontSize: '.58rem', flexShrink: 0, background: 'rgba(232,64,64,.12)', color: '#E84040', borderColor: 'rgba(232,64,64,.3)' }}>DELISTED</span>
                    ) : (
                      <span className="pill pill-green" style={{ fontSize: '.58rem', flexShrink: 0 }}>LIVE</span>
                    )
                  )}
                </div>

                <p style={{ fontSize: '.82rem', color: 'var(--muted)', lineHeight: 1.6, marginBottom: '1rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {agent.description}
                </p>

                {/* Return */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.8rem', fontWeight: 800, color: pos ? 'var(--green)' : 'var(--red)' }}>{fmtPct(ret)}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: 'var(--faint)', marginTop: '.1rem' }}>
                    {isBacktestData ? `Backtest Return · ${agent.backtest_stats?.symbol ?? agent.primary_symbol} · ${agent.backtest_stats?.period ?? '2y'}` : 'Total Return (paper)'}
                  </div>
                </div>

                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '.4rem', marginBottom: '1rem' }}>
                  {[
                    { k: 'SHARPE', v: sharpe.toFixed(2) },
                    { k: 'MAX DD', v: fmtPct(-maxDD, 1) },
                    { k: 'WIN %', v: winRate.toFixed(0) + '%' },
                    { k: 'FEE', v: monthlyFee === 0 ? 'Free' : `$${(monthlyFee / 100).toFixed(0)}/mo` },
                  ].map(({ k, v }) => (
                    <div key={k} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 10, padding: '.45rem .55rem' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: 'var(--faint)', letterSpacing: '.08em' }}>{k}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.75rem', fontWeight: 800, marginTop: '.15rem' }}>{v}</div>
                    </div>
                  ))}
                </div>

                {/* Footer actions */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '.75rem', borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
                  <span className="tag" style={{ color: info.color, borderColor: `${info.color}30` }}>{info.label.toUpperCase()}</span>
                  <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                    <Link href={`/agents/${agent.slug}`} style={{ fontFamily: 'var(--font-mono)', fontSize: '.68rem', color: 'var(--faint)', textDecoration: 'none' }}>
                      Details
                    </Link>
                    <Link
                      href={user ? `/agents/${agent.slug}` : '/login'}
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '.72rem',
                        fontWeight: 700,
                        padding: '.4rem .9rem',
                        borderRadius: 9,
                        border: isSubscribed ? '1px solid rgba(110,231,183,.3)' : '1px solid rgba(155,140,255,.3)',
                        background: isSubscribed ? 'rgba(110,231,183,.1)' : 'rgba(155,140,255,.1)',
                        color: isSubscribed ? '#6EE7B7' : 'var(--gold)',
                        textDecoration: 'none',
                        transition: 'all .14s',
                      }}
                    >
                      {isSubscribed ? 'Manage →' : 'Subscribe →'}
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <style>{`
        @media(max-width:760px){
          .agents-top-strip{grid-template-columns:1fr!important}
        }
      `}</style>
    </div>
  )
}
