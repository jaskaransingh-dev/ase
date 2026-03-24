import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { fmtUSD, fmtPct } from '@/lib/utils'
import { HoverCard } from '@/components/ui/hover-card'

export const dynamic = 'force-dynamic'

export default async function ExchangePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: agents }, { data: holdings }] = await Promise.all([
    supabase
      .from('agents')
      .select('*, agent_stats(nav_cents, total_return_pct, sharpe_ratio, max_drawdown_pct, win_rate_pct, total_trades, snapshot_at)')
      .eq('status', 'active')
      .order('created_at'),
    supabase
      .from('holdings')
      .select('agent_id, shares')
      .eq('user_id', user.id)
      .eq('status', 'active')
  ])

  const agentsList = agents ?? []
  const holdingsMap = new Map((holdings ?? []).map(h => [h.agent_id, h]))

  const strategyInfo: Record<string, { label: string; color: string }> = {
    momentum: { label: 'Momentum', color: 'var(--gold)' },
    mean_reversion: { label: 'Mean Reversion', color: 'var(--green)' },
    trend_following: { label: 'Trend Following', color: '#7B9FFF' },
    crypto_momentum: { label: 'Crypto Momentum', color: 'var(--gold)' },
    crypto_mean_reversion: { label: 'Crypto Mean Reversion', color: 'var(--green)' },
  }

  return (
    <div style={{ padding: '2rem 2.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div className="eyebrow" style={{ marginBottom: '.35rem' }}>MARKETPLACE</div>
        <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '1.8rem', fontWeight: 800, marginBottom: '.5rem' }}>Exchange</h1>
        <p style={{ color: 'var(--muted)', fontSize: '.9rem' }}>Browse and invest in verified AI trading agents</p>
      </div>

      {agentsList.length === 0 ? (
        <div style={{
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '3rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⬡</div>
          <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 800, marginBottom: '.5rem' }}>No agents available</div>
          <p style={{ color: 'var(--muted)', fontSize: '.9rem' }}>Trading agents are being added. Check back soon.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '1.5rem' }}>
          {agentsList.map((agent) => {
            const latestStats = agent.agent_stats?.[0]
            const nav = latestStats?.nav_cents ?? 10000
            const return30d = latestStats?.total_return_pct ?? 0
            const return24h = 0 // Would need separate data
            const sharpe = latestStats?.sharpe_ratio ?? 0
            const maxDD = latestStats?.max_drawdown_pct ?? 0
            const winRate = latestStats?.win_rate_pct ?? 0
            const info = strategyInfo[agent.strategy_type] || { label: agent.strategy_type, color: 'var(--white)' }
            const pos = return30d >= 0
            const userHolding = holdingsMap.get(agent.id)

            return (
              <HoverCard
                key={agent.id}
                style={{
                  background: 'var(--bg2)',
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <div>
                    <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1.05rem', fontWeight: 800, marginBottom: '.2rem' }}>
                      {agent.name}
                    </h3>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', letterSpacing: '.04em' }}>
                      ${agent.ticker || 'XXX'} · VERIFIED
                    </div>
                  </div>
                  {userHolding && (
                    <span className="pill pill-green" style={{ fontSize: '.58rem', flexShrink: 0 }}>HELD</span>
                  )}
                </div>

                {/* Price & Return */}
                <div style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.6rem', fontWeight: 800, marginBottom: '.3rem' }}>
                    {fmtUSD(nav)}
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '.8rem' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: 'var(--faint)', marginBottom: '.1rem' }}>24H</div>
                      <div style={{ color: return24h >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{fmtPct(return24h)}</div>
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: 'var(--faint)', marginBottom: '.1rem' }}>30D</div>
                      <div style={{ color: pos ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{fmtPct(return30d)}</div>
                    </div>
                  </div>
                </div>

                {/* KPIs */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '.6rem', marginBottom: '1rem' }}>
                  {[
                    { k: 'SHARPE', v: sharpe.toFixed(2) },
                    { k: 'MAX DD', v: fmtPct(-maxDD, 1) },
                    { k: 'WIN %', v: winRate.toFixed(0) + '%' },
                    { k: 'AUM', v: fmtUSD(agent.total_aum_cents || 0) },
                  ].map(({ k, v }) => (
                    <div key={k} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 10, padding: '.5rem .65rem' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.15rem' }}>
                        {k}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.8rem', fontWeight: 800 }}>{v}</div>
                    </div>
                  ))}
                </div>

                {/* Strategy Tag + CTA */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                  <span className="tag" style={{ color: info.color, borderColor: `${info.color}30`, fontSize: '.65rem' }}>
                    {info.label.toUpperCase()}
                  </span>
                  <Link
                    href={`/dashboard/exchange/${agent.slug}`}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '.75rem',
                      fontWeight: 700,
                      color: 'var(--gold)',
                      textDecoration: 'none',
                      transition: 'all .15s',
                      opacity: 0.8
                    }}
                    className="trade-link"
                  >
                    Trade →
                  </Link>
                </div>
              </HoverCard>
            )
          })}
        </div>
      )}

      <style>{`
        @media(max-width:900px){
          [style*="grid-template-columns: repeat(auto-fill"] {
            grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)) !important;
          }
        }
        @media(max-width:480px){
          [style*="grid-template-columns: repeat(auto-fill"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
