'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

interface AgentPreview {
  name: string
  primary_symbol: string
  strategy_type: string
  ret: number | null
  sharpe: number | null
  subscriber_count: number
}

export default function LandingPage() {
  const [agents, setAgents] = useState<AgentPreview[]>([])
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('agents')
      .select('name, primary_symbol, strategy_type, subscriber_count, backtest_stats, agent_stats(total_return_pct, sharpe_ratio, snapshot_at)')
      .eq('status', 'active')
      .limit(6)
      .then(({ data }) => {
        if (!data) return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAgents(data.map((a: any) => {
          const statsArr = Array.isArray(a.agent_stats) ? a.agent_stats : (a.agent_stats ? [a.agent_stats] : [])
          const latestStats = statsArr.length > 0 ? statsArr[statsArr.length - 1] : null
          const bt = a.backtest_stats?.stats
          return {
            name: a.name,
            primary_symbol: a.primary_symbol ?? 'MULTI',
            strategy_type: a.strategy_type,
            ret: latestStats?.total_return_pct ?? bt?.totalReturnPct ?? null,
            sharpe: latestStats?.sharpe_ratio ?? bt?.sharpeRatio ?? null,
            subscriber_count: a.subscriber_count ?? 0,
          }
        }))
      })
  }, [])

  const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`

  const strategyColor: Record<string, string> = {
    momentum: '#3b7eff',
    mean_reversion: '#16c784',
    trend_following: '#7c5cff',
    crypto_momentum: '#f59e0b',
    crypto_mean_reversion: '#06b6d4',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--white)', fontFamily: 'var(--font-head)' }}>

      {/* ── Navigation ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 2rem',
        background: 'rgba(6,8,15,.92)',
        borderBottom: '1px solid var(--border)',
        backdropFilter: 'blur(24px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '.65rem' }}>
            <Image src="/logo.png" alt="ASE" width={28} height={28} style={{ borderRadius: 6 }} />
            <span style={{ fontWeight: 700, fontSize: '.95rem', letterSpacing: '-.02em' }}>ASE</span>
          </Link>
          <div style={{ display: 'flex', gap: '.15rem' }} className="desktop-only">
            {[
              { href: '/agents', label: 'Agents' },
              { href: '/dashboard/backtest', label: 'Algo Lab' },
              { href: '/builders', label: 'Builders' },
            ].map(item => (
              <Link key={item.href} href={item.href} style={{
                padding: '.35rem .7rem', borderRadius: 7,
                fontSize: '.82rem', fontWeight: 500, color: 'var(--muted)',
                transition: 'all .16s',
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.color = 'var(--white)'; (e.target as HTMLElement).style.background = 'rgba(59,127,255,.07)'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.color = 'var(--muted)'; (e.target as HTMLElement).style.background = 'transparent'; }}
              >{item.label}</Link>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.65rem' }}>
          <Link href="/login" style={{ fontSize: '.82rem', color: 'var(--muted)', fontWeight: 500, padding: '.35rem .75rem' }} className="desktop-only">
            Sign in
          </Link>
          <Link href="/signup" className="btn-primary" style={{ fontSize: '.82rem', padding: '.45rem 1.1rem' }}>
            Get Started
          </Link>
          <button
            className="mobile-only"
            onClick={() => setMobileMenuOpen(prev => !prev)}
            style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, padding: '.4rem .5rem', display: 'flex', flexDirection: 'column', gap: 4 }}
          >
            <span style={{ width: 16, height: 1.5, background: 'var(--muted)', display: 'block', borderRadius: 2 }} />
            <span style={{ width: 16, height: 1.5, background: 'var(--muted)', display: 'block', borderRadius: 2 }} />
            <span style={{ width: 16, height: 1.5, background: 'var(--muted)', display: 'block', borderRadius: 2 }} />
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div style={{
          position: 'fixed', top: 56, left: 0, right: 0, zIndex: 99,
          background: 'rgba(6,8,15,.98)', borderBottom: '1px solid var(--border)',
          padding: '.75rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '.15rem',
        }}>
          {[
            { href: '/agents', label: 'Agents' },
            { href: '/dashboard/backtest', label: 'Algo Lab' },
            { href: '/builders', label: 'Builders' },
            { href: '/login', label: 'Sign In' },
          ].map(item => (
            <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)} style={{
              padding: '.65rem .85rem', borderRadius: 9, fontSize: '.9rem',
              color: 'var(--muted)', display: 'block',
            }}>{item.label}</Link>
          ))}
        </div>
      )}

      {/* ── Hero ── */}
      <section style={{ paddingTop: '8rem', paddingBottom: '5rem', position: 'relative', overflow: 'hidden' }}>
        <div className="hero-grid-bg" />
        <div className="hero-glow" />

        {/* Glow orbs */}
        <div style={{ position: 'absolute', top: '15%', left: '10%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,127,255,.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '20%', right: '8%', width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,92,255,.05) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 2rem', textAlign: 'center', position: 'relative', zIndex: 1 }}>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem', background: 'rgba(59,127,255,.08)', border: '1px solid rgba(59,127,255,.2)', borderRadius: 999, padding: '.28rem .85rem', marginBottom: '2rem' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--blue)', display: 'inline-block' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', letterSpacing: '.1em', color: 'var(--blue2)', fontWeight: 600 }}>NOW IN OPEN BETA</span>
          </div>

          <h1 style={{ fontSize: 'clamp(2.2rem, 6vw, 4rem)', fontWeight: 800, lineHeight: 1.08, letterSpacing: '-.04em', marginBottom: '1.5rem' }}>
            Algorithmic Trading,{' '}
            <span style={{ background: 'linear-gradient(135deg, #3b7eff, #7c5cff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Transparent Performance
            </span>
          </h1>

          <p style={{ fontSize: '1.05rem', color: 'var(--muted)', lineHeight: 1.65, maxWidth: 620, margin: '0 auto 2.5rem', fontWeight: 400 }}>
            Subscribe to verified AI trading agents — every strategy backtested on 5 years of real market data. No black boxes, no guesswork.
          </p>

          <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/agents" className="btn-primary" style={{ fontSize: '.92rem', padding: '.75rem 1.6rem' }}>
              Browse Agents
            </Link>
            <Link href="/signup" className="btn-secondary" style={{ fontSize: '.92rem', padding: '.75rem 1.6rem' }}>
              Create Account
            </Link>
          </div>
        </div>
      </section>

      {/* ── Platform Stats ── */}
      <section style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 2rem', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)' }} className="stats-grid-section">
          {[
            { label: 'Live Strategies', value: '10', sub: 'verified & active' },
            { label: 'Avg 5Y Backtest', value: '+124%', sub: 'across all agents', color: 'var(--green)' },
            { label: 'Data Depth', value: '5 Years', sub: 'daily OHLCV' },
            { label: 'Subscription Cost', value: 'Free Beta', sub: 'no credit card needed', color: 'var(--blue2)' },
          ].map((stat, i) => (
            <div key={i} style={{
              padding: '1.5rem 1.25rem',
              borderRight: i < 3 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--faint)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: '.4rem' }}>{stat.label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.35rem', fontWeight: 700, color: stat.color ?? 'var(--white)', letterSpacing: '-.02em', marginBottom: '.15rem' }}>{stat.value}</div>
              <div style={{ fontSize: '.72rem', color: 'var(--faint)' }}>{stat.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Agent Preview Table ── */}
      <section style={{ padding: '4rem 2rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: '1.75rem', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: '.3rem' }}>Live Agents</div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, letterSpacing: '-.025em' }}>Strategies Running Now</h2>
            <p style={{ color: 'var(--muted)', fontSize: '.85rem', marginTop: '.25rem' }}>Each agent runs a specific strategy, backtested on 5 years of data</p>
          </div>
          <Link href="/agents" className="btn-secondary" style={{ fontSize: '.8rem' }}>
            View All Agents
          </Link>
        </div>

        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          {agents.length === 0 ? (
            /* Skeleton loader */
            <div style={{ padding: '1rem' }}>
              {[...Array(5)].map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 52, marginBottom: 4, borderRadius: 8 }} />
              ))}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr>
                  {['Agent', 'Market', 'Return', 'Sharpe', 'Subscribers', ''].map((h, i) => (
                    <th key={h} style={{
                      padding: '.6rem .9rem',
                      fontFamily: 'var(--font-mono)', fontSize: '.58rem', fontWeight: 600,
                      letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--faint)',
                      borderBottom: '1px solid var(--border)', textAlign: i > 1 ? 'right' : 'left',
                      paddingLeft: i === 0 ? '1.25rem' : '.9rem',
                      paddingRight: i === 5 ? '1.25rem' : '.9rem',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agents.map((agent, i) => {
                  const pos = (agent.ret ?? 0) >= 0
                  const sColor = strategyColor[agent.strategy_type] ?? 'var(--muted)'
                  return (
                    <tr key={i} style={{ borderBottom: i < agents.length - 1 ? '1px solid rgba(30,55,100,.18)' : 'none' }}>
                      <td style={{ padding: '.75rem .9rem .75rem 1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.65rem' }}>
                          <div style={{ width: 30, height: 30, borderRadius: 7, background: `${sColor}14`, border: `1px solid ${sColor}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', fontWeight: 700, color: sColor }}>
                              {agent.primary_symbol.split('-')[0].slice(0,3)}
                            </span>
                          </div>
                          <span style={{ fontWeight: 600, fontSize: '.88rem' }}>{agent.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '.75rem .9rem' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', color: 'var(--muted)' }}>
                          {agent.primary_symbol}
                        </span>
                      </td>
                      <td style={{ padding: '.75rem .9rem', textAlign: 'right' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', fontWeight: 700, color: pos ? 'var(--green)' : 'var(--red)' }}>
                          {agent.ret !== null ? fmtPct(agent.ret) : '—'}
                        </span>
                      </td>
                      <td style={{ padding: '.75rem .9rem', textAlign: 'right' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.8rem', color: 'var(--muted)' }}>
                          {agent.sharpe !== null ? agent.sharpe.toFixed(2) : '—'}
                        </span>
                      </td>
                      <td style={{ padding: '.75rem .9rem', textAlign: 'right' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', color: 'var(--faint)' }}>
                          {agent.subscriber_count}
                        </span>
                      </td>
                      <td style={{ padding: '.75rem 1.25rem .75rem .9rem', textAlign: 'right' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center',
                          fontFamily: 'var(--font-mono)', fontSize: '.58rem', fontWeight: 600, letterSpacing: '.06em',
                          padding: '.18rem .55rem', borderRadius: 5,
                          background: 'var(--green-dim)', color: 'var(--green)',
                          border: '1px solid var(--green-border)',
                        }}>LIVE</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ── Features ── */}
      <section style={{ padding: '4rem 2rem', borderTop: '1px solid var(--border)', background: 'var(--bg2)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div className="eyebrow" style={{ marginBottom: '.4rem' }}>Why ASE</div>
            <h2 style={{ fontSize: '1.45rem', fontWeight: 700, letterSpacing: '-.025em' }}>Built Different</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem' }} className="why-grid">
            {[
              {
                title: 'Verified Backtests',
                desc: '5 years of daily OHLCV data. Every strategy runs through the same rigorous engine before going live. No cherry-picked windows.',
                accent: 'var(--blue)',
                icon: 'BT',
              },
              {
                title: 'Transparent Performance',
                desc: 'Every trade logged. Every return calculated the same way. Sharpe, drawdown, win rate — all visible before you subscribe.',
                accent: 'var(--green)',
                icon: 'TX',
              },
              {
                title: 'Open to Builders',
                desc: 'Have a profitable strategy? Submit it. We handle infrastructure, execution, and subscriber management.',
                accent: 'var(--purple)',
                icon: 'BD',
              },
            ].map(feat => (
              <div key={feat.title} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.5rem' }}>
                <div style={{ width: 38, height: 38, borderRadius: 9, background: `${feat.accent}12`, border: `1px solid ${feat.accent}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', fontWeight: 700, color: feat.accent }}>{feat.icon}</span>
                </div>
                <h3 style={{ fontSize: '.95rem', fontWeight: 600, marginBottom: '.5rem' }}>{feat.title}</h3>
                <p style={{ fontSize: '.82rem', color: 'var(--muted)', lineHeight: 1.6 }}>{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section style={{ padding: '4rem 2rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div className="eyebrow" style={{ marginBottom: '.4rem' }}>Process</div>
            <h2 style={{ fontSize: '1.45rem', fontWeight: 700, letterSpacing: '-.025em' }}>How It Works</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              { n: '01', title: 'Browse Agents', desc: 'Review verified strategies with full 5-year backtest data — returns, risk metrics, trade history.' },
              { n: '02', title: 'Subscribe', desc: 'Subscribe to any agent in one click. No credit card required during beta. Connect your wallet for future settlement.' },
              { n: '03', title: 'Track Performance', desc: 'Monitor live trades and performance from your dashboard. Unsubscribe anytime.' },
            ].map((step, i) => (
              <div key={step.n} style={{ display: 'flex', gap: '1.5rem', padding: '1.5rem 0', borderBottom: i < 2 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, border: '1px solid var(--border2)', background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', fontWeight: 700, color: 'var(--blue2)' }}>{step.n}</span>
                </div>
                <div>
                  <h3 style={{ fontSize: '.95rem', fontWeight: 600, marginBottom: '.35rem' }}>{step.title}</h3>
                  <p style={{ fontSize: '.85rem', color: 'var(--muted)', lineHeight: 1.6 }}>{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── For Builders ── */}
      <section style={{ padding: '4rem 2rem', borderTop: '1px solid var(--border)', background: 'var(--bg2)' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <div className="eyebrow" style={{ marginBottom: '.4rem' }}>For Builders</div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 700, letterSpacing: '-.025em', marginBottom: '1rem' }}>
            Submit Your Strategy
          </h2>
          <p style={{ fontSize: '.9rem', color: 'var(--muted)', lineHeight: 1.65, maxWidth: 560, margin: '0 auto 2rem' }}>
            Have an edge? Submit your algorithm. We run it through our backtesting engine, and if it qualifies, it goes live on the marketplace.
          </p>
          <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/builders" className="btn-primary" style={{ fontSize: '.88rem' }}>
              Builder Program
            </Link>
            <Link href="/builders/submit" className="btn-secondary" style={{ fontSize: '.88rem' }}>
              Submit Agent
            </Link>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ padding: '5rem 2rem', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(59,127,255,.05) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.2rem)', fontWeight: 800, letterSpacing: '-.03em', marginBottom: '1rem' }}>
            Start Trading Smarter
          </h2>
          <p style={{ fontSize: '.95rem', color: 'var(--muted)', marginBottom: '2rem', maxWidth: 480, margin: '0 auto 2rem' }}>
            Free during beta. No fees, no minimums. Just transparent algorithmic performance.
          </p>
          <Link href="/signup" className="btn-primary" style={{ fontSize: '.95rem', padding: '.8rem 2rem' }}>
            Create Free Account
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '2rem', background: 'var(--bg2)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
            <Image src="/logo.png" alt="ASE" width={22} height={22} style={{ borderRadius: 5, opacity: .8 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--faint)', letterSpacing: '.06em' }}>ASE — Algorithmic Strategy Exchange</span>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            {[
              { href: '/agents', label: 'Agents' },
              { href: '/builders', label: 'Builders' },
              { href: '/legal/terms', label: 'Terms' },
              { href: '/legal/privacy', label: 'Privacy' },
              { href: '/legal/securities', label: 'Disclosures' },
            ].map(link => (
              <Link key={link.href} href={link.href} style={{ fontSize: '.72rem', color: 'var(--faint)', transition: 'color .15s' }}>{link.label}</Link>
            ))}
          </div>
        </div>
        <div style={{ maxWidth: 1100, margin: '.75rem auto 0', paddingTop: '.75rem', borderTop: '1px solid rgba(30,55,100,.25)' }}>
          <p style={{ fontSize: '.65rem', color: 'var(--faint)', lineHeight: 1.6 }}>
            Past backtest performance does not guarantee future results. Algorithmic trading involves substantial risk of loss. Not financial advice. For informational purposes only.
          </p>
        </div>
      </footer>

      <style>{`
        @media (max-width: 760px) {
          .stats-grid-section { grid-template-columns: repeat(2,1fr) !important; }
          .stats-grid-section > div { border-right: none !important; border-bottom: 1px solid var(--border); }
        }
        @media (max-width: 480px) {
          .stats-grid-section { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
