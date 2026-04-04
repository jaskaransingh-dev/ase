import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { HoverCard } from '@/components/ui/hover-card'
import { fmtUSD, fmtPct } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function AgentsPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('agents')
    .select('*, agent_stats(nav_cents,total_return_pct,sharpe_ratio,max_drawdown_pct,win_rate_pct,total_trades,snapshot_at)')
    .eq('status', 'active')
    .order('created_at')

  // Type helper for agent with extended fields
  type AgentRow = NonNullable<typeof data>[number] & { alert_level?: string; max_aum_cents?: number; ticker?: string }

  const agentsList = data ?? []

  const strategyInfo: Record<string, { label: string; color: string }> = {
    momentum:              { label: 'Momentum',        color: 'var(--gold)' },
    mean_reversion:        { label: 'Mean Reversion',  color: 'var(--green)' },
    trend_following:       { label: 'Trend Following', color: '#7B9FFF' },
    crypto_momentum:       { label: 'Crypto Momentum', color: '#F7931A' },
    crypto_mean_reversion: { label: 'Crypto Arb',      color: '#0EAD6E' },
  }

  const tickerMap: Record<string, string> = {
    crypto_momentum: 'CRYP', crypto_mean_reversion: 'CARB',
    momentum: 'MOMO', mean_reversion: 'REVT', trend_following: 'TRND',
  }

  return (
    <div style={{ padding: '2rem 2.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: '.35rem' }}>MARKETPLACE</div>
          <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '1.8rem', fontWeight: 800 }}>AI Trading Agents</h1>
          <p style={{ color: 'var(--muted)', fontSize: '.9rem', marginTop: '.35rem' }}>Verified strategies — transparent performance, audit-grade ledgers</p>
        </div>
        <Link href="/agents/submit" className="btn-secondary" style={{ fontSize: '.85rem' }}>Submit Your Agent →</Link>
      </div>

      {agentsList.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '5rem 2rem', color: 'var(--muted)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⬡</div>
          <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.2rem', fontWeight: 800, marginBottom: '.5rem' }}>Agents launching soon</div>
          <div style={{ fontSize: '.9rem' }}>The first three verified agents are being onboarded. Join the waitlist for early access.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: '1.25rem' }}>
          {agentsList.map((agent: AgentRow) => {
            const latestStats = Array.isArray(agent.agent_stats) ? agent.agent_stats[0] : agent.agent_stats ?? null
            const nav = latestStats?.nav_cents ?? 10000
            const ret = latestStats?.total_return_pct ?? 0
            const sharpe = latestStats?.sharpe_ratio ?? 0
            const maxDD = latestStats?.max_drawdown_pct ?? 0
            const winRate = latestStats?.win_rate_pct ?? 0
            const info = strategyInfo[agent.strategy_type] || { label: agent.strategy_type, color: 'var(--white)' }
            const pos = ret >= 0

            return (
              <HoverCard key={agent.id} href={`/agents/${agent.slug}`} asLink style={{ display: 'block', background: 'var(--bg2)', borderRadius: 20, padding: '1.5rem', textDecoration: 'none' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.05rem', fontWeight: 800, marginBottom: '.2rem' }}>{agent.name}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', letterSpacing: '.04em' }}>
                      {tickerMap[agent.strategy_type] ?? agent.ticker ?? 'ALGO'} · VERIFIED
                    </div>
                  </div>
                  {agent.alert_level === 'hard' ? (
                    <span className="pill" style={{ fontSize: '.58rem', flexShrink: 0, background: 'rgba(232,64,64,.12)', color: '#E84040', borderColor: 'rgba(232,64,64,.3)' }}>DELISTED</span>
                  ) : agent.alert_level === 'orange' ? (
                    <span className="pill" style={{ fontSize: '.58rem', flexShrink: 0, background: 'rgba(232,100,32,.12)', color: '#E86420', borderColor: 'rgba(232,100,32,.3)' }}>ALERT</span>
                  ) : ((agent.total_aum_cents ?? 0) / (agent.max_aum_cents ?? 100_000_000)) >= 0.95 ? (
                    <span className="pill" style={{ fontSize: '.58rem', flexShrink: 0, background: 'rgba(232,172,32,.12)', color: '#E8AC20', borderColor: 'rgba(232,172,32,.3)' }}>FULL</span>
                  ) : (
                    <span className="pill pill-green" style={{ fontSize: '.58rem', flexShrink: 0 }}>LIVE</span>
                  )}
                </div>

                <p style={{ fontSize: '.82rem', color: 'var(--muted)', lineHeight: 1.6, marginBottom: '1rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {agent.description}
                </p>

                {/* Return */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.8rem', fontWeight: 800, color: pos ? 'var(--green)' : 'var(--red)' }}>{fmtPct(ret)}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: 'var(--faint)', marginTop: '.1rem' }}>Total Return (paper)</div>
                </div>

                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '.4rem', marginBottom: '1rem' }}>
                  {[
                    { k: 'SHARPE', v: sharpe.toFixed(2) },
                    { k: 'NAV', v: fmtUSD(nav) },
                    { k: 'MAX DD', v: fmtPct(-maxDD, 1) },
                    { k: 'WIN %', v: winRate.toFixed(0) + '%' },
                  ].map(({ k, v }) => (
                    <div key={k} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 10, padding: '.45rem .55rem' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: 'var(--faint)', letterSpacing: '.08em' }}>{k}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.75rem', fontWeight: 800, marginTop: '.15rem' }}>{v}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '.75rem', borderTop: '1px solid var(--border)' }}>
                  <span className="tag" style={{ color: info.color, borderColor: `${info.color}30` }}>{info.label.toUpperCase()}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.68rem', color: 'var(--gold)' }}>View Details →</span>
                </div>
              </HoverCard>
            )
          })}
        </div>
      )}
    </div>
  )
}
