'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Logo } from '@/components/ui/Logo'

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.disconnect() }
    }, { threshold })
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return { ref: ref as React.RefObject<HTMLDivElement>, visible }
}

function MiniSparkline({ positive }: { positive: boolean }) {
  const points = Array.from({ length: 20 }, (_, i) => {
    const base = 50
    const variance = Math.sin(i * 0.5) * 20 + (Math.sin(i * 1.5) - 0.5) * 15
    const trend = positive ? i * 1.5 : -i * 0.8
    return `${i * 5},${base + variance + trend}`
  }).join(' ')
  
  return (
    <svg width="100%" height="40" viewBox="0 0 100 40" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, opacity: 0.15 }}>
      <polyline points={points} fill="none" stroke={positive ? '#00E599' : '#FF5A5F'} strokeWidth="1.5" />
    </svg>
  )
}

interface AgentPreview {
  name: string
  slug: string
  primary_symbol: string
  strategy_type: string
  ret: number | null
  sharpe: number | null
  max_drawdown: number | null
  aum: number | null
  ticker: string
  isLive: boolean
}

function InvestorsPage() {
  const [agents, setAgents] = useState<AgentPreview[]>([])
  const [loading, setLoading] = useState(true)
  const sectionRef = useInView()

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('agents')
      .select('*, agent_stats(nav_cents,total_return_pct,sharpe_ratio,max_drawdown_pct,snapshot_at), backtest_stats')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(6)
      .then(({ data }) => {
        setLoading(false)
        if (!data) return
        setAgents(data.map((a: any) => {
          const statsArr = Array.isArray(a.agent_stats) ? a.agent_stats : (a.agent_stats ? [a.agent_stats] : [])
          const latestStats = statsArr.length > 0 ? statsArr.reduce((a: any, b: any) => (a.snapshot_at > b.snapshot_at ? a : b)) : null
          const bt = a.backtest_stats?.stats
          return {
            name: a.name,
            slug: a.slug,
            primary_symbol: a.primary_symbol ?? 'MULTI',
            strategy_type: a.strategy_type,
            ret: latestStats?.total_return_pct ?? bt?.totalReturnPct ?? null,
            sharpe: latestStats?.sharpe_ratio ?? bt?.sharpeRatio ?? null,
            max_drawdown: latestStats?.max_drawdown_pct ?? bt?.maxDrawdownPct ?? null,
            aum: a.subscriber_count ?? 0,
            ticker: a.ticker ?? a.name?.slice(0, 4).toUpperCase() ?? 'AGNT',
            isLive: !!latestStats,
          }
        }))
      })
  }, [])

  const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
  const fmtMoney = (v: number) => {
    if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`
    if (v >= 1000) return `$${(v / 1000).toFixed(0)}k`
    return `$${v}`
  }

  const getRiskLevel = (drawdown: number | null): { label: string; color: string } => {
    if (drawdown === null) return { label: 'Unknown', color: '#8E8E93' }
    if (drawdown > -20) return { label: 'Low Risk', color: '#00E599' }
    if (drawdown > -40) return { label: 'Med Risk', color: '#F59E0B' }
    return { label: 'High Risk', color: '#FF5A5F' }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--white)', fontFamily: 'var(--font-body)' }}>
      {/* Fixed Navigation */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 2rem',
        background: 'rgba(7,17,31,.95)', borderBottom: '1px solid var(--border)',
        backdropFilter: 'blur(16px)',
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <Logo size="medium" />
        </Link>
        <div style={{ display: 'flex', gap: '1.25rem' }}>
          <Link href="/agents" style={{ fontSize: '.85rem', fontWeight: 500, color: 'var(--text)' }}>Marketplace</Link>
          <Link href="/builders" style={{ fontSize: '.85rem', fontWeight: 500, color: 'var(--text)' }}>Builders</Link>
          <Link href="/login" style={{ fontSize: '.85rem', color: 'var(--text)', fontWeight: 500 }}>Sign In</Link>
          <Link href="/signup" className="btn-primary" style={{ fontSize: '.85rem', padding: '0.6rem 1.25rem', borderRadius: 12 }}>Get Started</Link>
        </div>
      </nav>

      <section ref={sectionRef.ref} style={{
        minHeight: '100vh', padding: '8rem 2.5rem 4rem', display: 'flex', flexDirection: 'column', justifyContent: 'center',
        opacity: sectionRef.visible ? 1 : 0,
        transform: sectionRef.visible ? 'translateY(0)' : 'translateY(40px)',
        transition: 'opacity 0.8s ease, transform 0.8s ease',
      }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', letterSpacing: '.14em', color: 'var(--blue)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '.5rem' }}>
              For Investors
            </div>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--ivory)', marginBottom: '1rem' }}>
              Access institutional-grade AI trading
            </h1>
            <p style={{ fontSize: '1.1rem', color: 'var(--muted)', lineHeight: 1.6, maxWidth: 500, margin: '0 auto 2rem' }}>
              Invest in verified algorithmic trading strategies. Your funds stay in your custody. Real-time monitoring with transparent performance.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <Link href="/signup" className="btn-primary" style={{ padding: '0.85rem 1.75rem', fontSize: '.95rem', borderRadius: 12 }}>Create Free Account</Link>
              <Link href="/agents" className="btn-secondary" style={{ padding: '0.85rem 1.75rem', fontSize: '.95rem', borderRadius: 12 }}>Browse Agents</Link>
            </div>
          </div>

          <div style={{ marginBottom: '3rem' }}>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: '1.5rem' }}>Live Trading Agents</h2>
          </div>

          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1.25rem' }}>
              {[...Array(3)].map((_, i) => (
                <div key={i} style={{ height: 220, borderRadius: 12, background: 'var(--bg2)' }} />
              ))}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1.25rem' }}>
              {agents.map((agent, i) => {
                const isPos = (agent.ret ?? 0) >= 0
                const risk = getRiskLevel(agent.max_drawdown)
                return (
                  <Link key={i} href={`/agents/${agent.slug}`} style={{ display: 'block', padding: '1.5rem', borderRadius: 12, background: 'var(--bg2)', border: '1px solid var(--border)', transition: 'all 0.3s ease' }}>
                    <MiniSparkline positive={isPos} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', position: 'relative', zIndex: 1 }}>
                      <div>
                        <h3 style={{ fontSize: '.95rem', fontWeight: 600, color: 'var(--white)' }}>{agent.name}</h3>
                        <p style={{ fontSize: '.72rem', color: 'var(--muted)', textTransform: 'capitalize' }}>{agent.strategy_type?.replace('_', ' ')}</p>
                      </div>
                      {agent.isLive && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--mint)', animation: 'breathe 2.5s ease-in-out infinite' }} />
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', fontWeight: 700, color: 'var(--mint)', letterSpacing: '.1em' }}>LIVE</span>
                        </span>
                      )}
                    </div>
                    <div style={{ marginBottom: '0.75rem', position: 'relative', zIndex: 1 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.75rem', fontWeight: 700, color: isPos ? 'var(--mint)' : 'var(--red)' }}>
                        {agent.ret !== null ? fmtPct(agent.ret) : '—'}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', letterSpacing: '.1em' }}>1Y RETURN</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.875rem', paddingTop: '0.875rem', borderTop: '1px solid var(--border)', position: 'relative', zIndex: 1 }}>
                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', marginBottom: '.2rem' }}>SHARPE</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', fontWeight: 600, color: 'var(--white)' }}>{agent.sharpe !== null ? agent.sharpe.toFixed(2) : '—'}</div>
                      </div>
                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', marginBottom: '.2rem' }}>MAX DD</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', fontWeight: 600, color: (agent.max_drawdown ?? 0) > -20 ? 'var(--mint)' : (agent.max_drawdown ?? 0) > -40 ? '#F59E0B' : 'var(--red)' }}>{agent.max_drawdown !== null ? fmtPct(agent.max_drawdown) : '—'}</div>
                      </div>
                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', marginBottom: '.2rem' }}>AUM</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', fontWeight: 600, color: 'var(--white)' }}>{agent.aum !== null ? fmtMoney(agent.aum) : '—'}</div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}

          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <Link href="/agents" className="btn-secondary" style={{ fontSize: '.9rem', padding: '.7rem 1.5rem' }}>View All Agents</Link>
          </div>
        </div>
      </section>

      <footer style={{ padding: '2rem', borderTop: '1px solid var(--border)', background: 'var(--bg2)', textAlign: 'center' }}>
        <p style={{ fontSize: '.75rem', color: 'var(--faint)' }}>&copy; 2026 ase</p>
      </footer>
    </div>
  )
}

export default InvestorsPage