import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { HoverCard } from '@/components/ui/hover-card'
import { fmtUSD, fmtPct, fmtDateTime } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: wallet }, { data: holdings }, { data: transactions }] = await Promise.all([
    supabase.from('wallets').select('balance_cents').eq('user_id', user.id).single(),
    supabase.from('holdings')
      .select('*, agents(name, slug, strategy_type)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false }),
    supabase.from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const balance = wallet?.balance_cents ?? 0
  const activeHoldings = holdings ?? []
  const txns = transactions ?? []

  const totalInvested = activeHoldings.reduce((s, h) => s + h.invested_cents, 0)
  const totalCurrentValue = activeHoldings.reduce((s, h) => s + (h.current_value_cents ?? h.invested_cents), 0)
  const totalReturn = totalCurrentValue - totalInvested
  const totalReturnPct = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0
  const totalPortfolio = balance + totalCurrentValue

  const txTypeLabel: Record<string, string> = {
    deposit: 'Deposit',
    invest: 'Invested',
    divest: 'Divested',
    return: 'Return',
  }

  return (
    <div style={{ 
      padding: '2rem', 
      maxWidth: '1200px', 
      margin: '0 auto',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <div className="eyebrow" style={{ marginBottom: '.35rem' }}>PORTFOLIO OVERVIEW</div>
        <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '1.8rem', fontWeight: 800 }}>Investment Dashboard</h1>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginBottom: '2rem' }} className="stats-grid">
        {[
          { label: 'TOTAL VALUE', value: fmtUSD(totalPortfolio), sub: 'Credits + holdings', color: '' },
          { label: 'AVAILABLE CREDITS', value: fmtUSD(balance), sub: 'Ready to invest', color: '' },
          { label: 'INVESTED', value: fmtUSD(totalCurrentValue), sub: `${activeHoldings.length} active position${activeHoldings.length !== 1 ? 's' : ''}`, color: '' },
          { label: 'TOTAL RETURN', value: fmtPct(totalReturnPct), sub: fmtUSD(Math.abs(totalReturn)), color: totalReturn >= 0 ? 'var(--green)' : 'var(--red)' },
        ].map(stat => (
          <div key={stat.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.25rem 1.5rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', letterSpacing: '.1em', color: 'var(--faint)', marginBottom: '.5rem' }}>{stat.label}</div>
            <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.5rem', fontWeight: 800, color: stat.color || 'var(--white)' }}>{stat.value}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: 'var(--faint)', marginTop: '.3rem' }}>{stat.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem', alignItems: 'start' }} className="main-grid">
        {/* Holdings */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 800 }}>Active Holdings</h2>
            <Link href="/agents" className="btn-secondary" style={{ fontSize: '.8rem', padding: '.5rem 1rem' }}>+ Invest More</Link>
          </div>

          {activeHoldings.length === 0 ? (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '3rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⬡</div>
              <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 800, marginBottom: '.5rem' }}>No holdings yet</div>
              <div style={{ color: 'var(--muted)', fontSize: '.9rem', marginBottom: '1.5rem' }}>Browse verified AI agents and invest your credits</div>
              <Link href="/agents" className="btn-primary">Explore Agents →</Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
              {activeHoldings.map((h) => {
                const currentVal = h.current_value_cents ?? h.invested_cents
                const ret = currentVal - h.invested_cents
                const retPct = h.invested_cents > 0 ? (ret / h.invested_cents) * 100 : 0
                const pos = ret >= 0
                return (
                  <HoverCard key={h.id} style={{ background: 'var(--bg2)', borderRadius: 16, padding: '1.25rem 1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '.75rem' }}>
                      <div>
                        <Link href={`/agents/${h.agents?.slug}`} style={{ fontFamily: 'var(--font-head)', fontSize: '1rem', fontWeight: 800, display: 'block', marginBottom: '.2rem' }}>{h.agents?.name}</Link>
                        <div style={{ display: 'flex', gap: '.4rem' }}>
                          <span className="tag">{h.agents?.strategy_type?.replace('_', ' ').toUpperCase()}</span>
                          <span className="pill pill-green" style={{ fontSize: '.58rem' }}>ACTIVE</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.2rem', fontWeight: 800 }}>{fmtUSD(currentVal)}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', color: pos ? 'var(--green)' : 'var(--red)', marginTop: '.15rem' }}>{pos ? '+' : ''}{fmtUSD(ret)} ({fmtPct(retPct)})</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '.75rem', borderTop: '1px solid var(--border)' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--faint)' }}>
                        {h.shares.toFixed(2)} shares · Cost basis {fmtUSD(h.invested_cents)}
                      </div>
                      <SellButton holdingId={h.id} agentSlug={h.agents?.slug} />
                    </div>
                  </HoverCard>
                )
              })}
            </div>
          )}
        </div>

        {/* Recent transactions */}
        <div>
          <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem' }}>Recent Activity</div>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
            {txns.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)', fontSize: '.9rem' }}>No transactions yet</div>
            ) : (
              <div>
                {txns.map((t, i) => {
                  const isPos = ['deposit', 'divest', 'return'].includes(t.type)
                  return (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.9rem 1.1rem', borderBottom: i < txns.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '.88rem' }}>{txTypeLabel[t.type] || t.type}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', marginTop: '.15rem' }}>{fmtDateTime(t.created_at)}</div>
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.82rem', fontWeight: 700, color: isPos ? 'var(--green)' : 'var(--red)' }}>
                        {isPos ? '+' : ''}{fmtUSD(Math.abs(t.amount_cents))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {balance === 0 && activeHoldings.length === 0 && (
              <div style={{ padding: '1rem 1.1rem', borderTop: txns.length > 0 ? '1px solid var(--border)' : 'none', textAlign: 'center' }}>
                <Link href="/dashboard/deposit" className="btn-primary" style={{ fontSize: '.82rem', padding: '.6rem 1.1rem' }}>Add Credits to Start →</Link>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @media(max-width:900px){.stats-grid{grid-template-columns:repeat(2,1fr)!important}.main-grid{grid-template-columns:1fr!important}}
        @media(max-width:480px){.stats-grid{grid-template-columns:1fr!important}}
      `}</style>
    </div>
  )
}

function SellButton({ holdingId, agentSlug }: { holdingId: string; agentSlug?: string }) {
  // Client-side sell button rendered as link to agent page
  return (
    <Link href={`/agents/${agentSlug}?sell=${holdingId}`}
      style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', fontWeight: 700, padding: '.35rem .75rem', borderRadius: 9, border: '1px solid var(--border2)', color: 'var(--muted)', background: 'transparent', cursor: 'pointer', transition: 'all .15s', textDecoration: 'none' }}>
      Manage →
    </Link>
  )
}
