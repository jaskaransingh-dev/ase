'use client'
import { useState, useEffect, useRef } from 'react'
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
  return { ref, visible }
}

export default function LandingPage() {
  const [agents, setAgents] = useState<AgentPreview[]>([])
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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

  const statsSection = useInView()
  const agentsSection = useInView()
  const howSection = useInView()
  const whySection = useInView()
  const buildersSection = useInView()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--white)', fontFamily: 'var(--font-head)', overflowX: 'hidden' }}>

      {/* ── Navigation ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 2rem',
        background: scrolled ? 'rgba(6,8,15,.96)' : 'transparent',
        borderBottom: scrolled ? '1px solid var(--border)' : '1px solid transparent',
        backdropFilter: scrolled ? 'blur(24px)' : 'none',
        transition: 'background .3s, border-color .3s, backdrop-filter .3s',
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
      <section style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '8rem 2rem 6rem', position: 'relative', overflow: 'hidden',
        textAlign: 'center',
      }}>
        {/* Background grid */}
        <div className="hero-grid-bg" style={{ opacity: 0.6 }} />

        {/* Gradient orbs */}
        <div style={{ position: 'absolute', top: '20%', left: '15%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,127,255,.07) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '15%', right: '10%', width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,92,255,.06) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '55%', left: '50%', transform: 'translateX(-50%)', width: 800, height: 400, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(59,127,255,.04) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 860, width: '100%' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '.5rem',
            background: 'rgba(59,127,255,.08)', border: '1px solid rgba(59,127,255,.2)',
            borderRadius: 999, padding: '.3rem 1rem', marginBottom: '2.5rem',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b7eff', display: 'inline-block', boxShadow: '0 0 6px rgba(59,127,255,.6)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', letterSpacing: '.1em', color: '#7aacff', fontWeight: 600 }}>OPEN BETA — NO FEES, NO MINIMUMS</span>
          </div>

          <h1 style={{
            fontSize: 'clamp(2.8rem, 7.5vw, 5.2rem)', fontWeight: 800,
            lineHeight: 1.04, letterSpacing: '-.045em', marginBottom: '1.75rem',
          }}>
            Algorithmic Trading<br />
            <span style={{ background: 'linear-gradient(135deg, #3b7eff 20%, #7c5cff 80%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Without the Black Box
            </span>
          </h1>

          <p style={{
            fontSize: 'clamp(1rem, 2vw, 1.15rem)', color: 'var(--muted)',
            lineHeight: 1.7, maxWidth: 560, margin: '0 auto 3rem', fontWeight: 400,
          }}>
            Subscribe to AI trading agents — every strategy rigorously backtested on real market data.
            Full transparency on every trade, every signal, every decision.
          </p>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/agents" className="btn-primary" style={{ fontSize: '1rem', padding: '.85rem 2rem', borderRadius: 12 }}>
              Browse Agents
            </Link>
            <Link href="/signup" style={{
              fontSize: '1rem', padding: '.85rem 2rem', borderRadius: 12,
              background: 'transparent', border: '1px solid rgba(59,127,255,.3)',
              color: 'var(--white)', fontWeight: 600, display: 'inline-flex', alignItems: 'center',
              transition: 'border-color .2s, background .2s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(59,127,255,.6)'; (e.currentTarget as HTMLElement).style.background = 'rgba(59,127,255,.06)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(59,127,255,.3)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              Create Free Account
            </Link>
          </div>

          {/* Scroll cue */}
          <div style={{ marginTop: '5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.4rem', opacity: .35 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', letterSpacing: '.12em', color: 'var(--muted)' }}>SCROLL TO EXPLORE</span>
            <div style={{ width: 1, height: 36, background: 'linear-gradient(to bottom, var(--muted), transparent)' }} />
          </div>
        </div>
      </section>

      {/* ── Platform Stats Band ── */}
      <div ref={statsSection.ref} style={{
        borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
        background: 'var(--bg2)', overflow: 'hidden',
      }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          display: 'grid', gridTemplateColumns: 'repeat(4,1fr)',
          opacity: statsSection.visible ? 1 : 0,
          transform: statsSection.visible ? 'translateY(0)' : 'translateY(16px)',
          transition: 'opacity .6s, transform .6s',
        }} className="stats-grid-section">
          {[
            { label: 'Live Strategies', value: '10', sub: 'all active 24/7' },
            { label: 'Avg 5Y Backtest', value: '+124%', sub: 'across all agents', color: 'var(--green)' },
            { label: 'Market Data Depth', value: '5 Years', sub: 'daily OHLCV' },
            { label: 'Beta Access', value: 'Free', sub: 'no credit card needed', color: '#7aacff' },
          ].map((stat, i) => (
            <div key={i} style={{
              padding: '2rem 1.5rem',
              borderRight: i < 3 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--faint)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: '.6rem' }}>{stat.label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 700, color: stat.color ?? 'var(--white)', letterSpacing: '-.02em', marginBottom: '.2rem' }}>{stat.value}</div>
              <div style={{ fontSize: '.73rem', color: 'var(--faint)' }}>{stat.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Agent Preview ── */}
      <section ref={agentsSection.ref} style={{ padding: '8rem 2rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{
          opacity: agentsSection.visible ? 1 : 0,
          transform: agentsSection.visible ? 'translateY(0)' : 'translateY(24px)',
          transition: 'opacity .7s, transform .7s',
        }}>
          <div style={{ marginBottom: '3rem', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.5rem' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', letterSpacing: '.12em', color: '#3b7eff', fontWeight: 700, textTransform: 'uppercase', marginBottom: '.6rem' }}>Live Agents</div>
              <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 800, letterSpacing: '-.03em', marginBottom: '.5rem' }}>Strategies Running Now</h2>
              <p style={{ color: 'var(--muted)', fontSize: '.88rem', lineHeight: 1.6 }}>Each agent runs a specific strategy, backtested on 5 years of real market data</p>
            </div>
            <Link href="/agents" className="btn-secondary" style={{ fontSize: '.82rem', padding: '.6rem 1.25rem', whiteSpace: 'nowrap' }}>
              View All Agents
            </Link>
          </div>

          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
            {agents.length === 0 ? (
              <div style={{ padding: '1.25rem' }}>
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 56, marginBottom: 6, borderRadius: 10 }} />
                ))}
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  <tr>
                    {['Agent', 'Market', 'Return', 'Sharpe', 'Subscribers', ''].map((h, i) => (
                      <th key={h} style={{
                        padding: '.8rem 1rem',
                        fontFamily: 'var(--font-mono)', fontSize: '.58rem', fontWeight: 600,
                        letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--faint)',
                        borderBottom: '1px solid var(--border)', textAlign: i > 1 ? 'right' : 'left',
                        paddingLeft: i === 0 ? '1.5rem' : '1rem',
                        paddingRight: i === 5 ? '1.5rem' : '1rem',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent, i) => {
                    const pos = (agent.ret ?? 0) >= 0
                    const sColor = strategyColor[agent.strategy_type] ?? 'var(--muted)'
                    return (
                      <tr key={i} style={{ borderBottom: i < agents.length - 1 ? '1px solid rgba(30,55,100,.15)' : 'none' }}>
                        <td style={{ padding: '.9rem 1rem .9rem 1.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${sColor}14`, border: `1px solid ${sColor}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', fontWeight: 700, color: sColor }}>
                                {agent.primary_symbol.split('-')[0].slice(0,3)}
                              </span>
                            </div>
                            <span style={{ fontWeight: 600, fontSize: '.9rem' }}>{agent.name}</span>
                          </div>
                        </td>
                        <td style={{ padding: '.9rem 1rem' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', color: 'var(--muted)' }}>
                            {agent.primary_symbol}
                          </span>
                        </td>
                        <td style={{ padding: '.9rem 1rem', textAlign: 'right' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.88rem', fontWeight: 700, color: pos ? 'var(--green)' : 'var(--red)' }}>
                            {agent.ret !== null ? fmtPct(agent.ret) : '—'}
                          </span>
                        </td>
                        <td style={{ padding: '.9rem 1rem', textAlign: 'right' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.82rem', color: 'var(--muted)' }}>
                            {agent.sharpe !== null ? agent.sharpe.toFixed(2) : '—'}
                          </span>
                        </td>
                        <td style={{ padding: '.9rem 1rem', textAlign: 'right' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', color: 'var(--faint)' }}>
                            {agent.subscriber_count}
                          </span>
                        </td>
                        <td style={{ padding: '.9rem 1.5rem .9rem 1rem', textAlign: 'right' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '.3rem',
                            fontFamily: 'var(--font-mono)', fontSize: '.58rem', fontWeight: 600, letterSpacing: '.06em',
                            padding: '.2rem .6rem', borderRadius: 5,
                            background: 'var(--green-dim)', color: 'var(--green)',
                            border: '1px solid var(--green-border)',
                          }}>
                            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
                            LIVE
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>

      {/* ── Divider line ── */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 2rem' }}>
        <div style={{ height: 1, background: 'linear-gradient(to right, transparent, var(--border), transparent)' }} />
      </div>

      {/* ── How It Works ── */}
      <section ref={howSection.ref} style={{ padding: '8rem 2rem' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{
            opacity: howSection.visible ? 1 : 0,
            transform: howSection.visible ? 'translateY(0)' : 'translateY(24px)',
            transition: 'opacity .7s, transform .7s',
          }}>
            <div style={{ marginBottom: '4rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', letterSpacing: '.12em', color: '#7c5cff', fontWeight: 700, textTransform: 'uppercase', marginBottom: '.6rem' }}>Process</div>
              <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 800, letterSpacing: '-.03em' }}>From zero to live trading in minutes</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '2rem' }} className="how-grid">
              {[
                {
                  n: '01',
                  title: 'Browse Verified Agents',
                  desc: 'Review strategies with full 5-year backtest data. See returns, Sharpe ratios, max drawdown, and trade history before committing.',
                  color: '#3b7eff',
                },
                {
                  n: '02',
                  title: 'Subscribe and Invest',
                  desc: 'Use your paper credit balance — $100 free on signup. Allocate as much or as little as you want. Unsubscribe or deallocate anytime.',
                  color: '#7c5cff',
                },
                {
                  n: '03',
                  title: 'Track Live Performance',
                  desc: 'Watch your agent trade in real time. Every buy and sell logged with fill price and P&L. Your portfolio updates after every market cycle.',
                  color: '#16c784',
                },
              ].map((step, i) => (
                <div key={step.n} style={{
                  position: 'relative',
                  padding: '2rem',
                  background: 'var(--bg2)',
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  overflow: 'hidden',
                  opacity: howSection.visible ? 1 : 0,
                  transform: howSection.visible ? 'translateY(0)' : 'translateY(20px)',
                  transition: `opacity .6s ${i * 0.12}s, transform .6s ${i * 0.12}s`,
                }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(to right, ${step.color}, transparent)` }} />
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: '2.5rem', fontWeight: 800,
                    color: `${step.color}18`, letterSpacing: '-.04em',
                    position: 'absolute', top: '.75rem', right: '1.25rem', lineHeight: 1,
                    userSelect: 'none',
                  }}>{step.n}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', fontWeight: 700, letterSpacing: '.08em', color: step.color, marginBottom: '.75rem' }}>{step.n}</div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '.75rem', letterSpacing: '-.015em' }}>{step.title}</h3>
                  <p style={{ fontSize: '.85rem', color: 'var(--muted)', lineHeight: 1.65 }}>{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Why ASE ── */}
      <section ref={whySection.ref} style={{ padding: '8rem 2rem', background: 'var(--bg2)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{
            opacity: whySection.visible ? 1 : 0,
            transform: whySection.visible ? 'translateY(0)' : 'translateY(24px)',
            transition: 'opacity .7s, transform .7s',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5rem', alignItems: 'center' }} className="why-split">
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', letterSpacing: '.12em', color: '#f59e0b', fontWeight: 700, textTransform: 'uppercase', marginBottom: '.6rem' }}>Why ASE</div>
                <h2 style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)', fontWeight: 800, letterSpacing: '-.035em', marginBottom: '1.25rem', lineHeight: 1.15 }}>
                  Algo trading used to require a quant team. We changed that.
                </h2>
                <p style={{ fontSize: '.92rem', color: 'var(--muted)', lineHeight: 1.75, marginBottom: '2rem' }}>
                  ASE makes institutional-grade strategies available to everyone. No APIs to wire up, no risk models to build, no servers to run.
                  Just subscribe to a verified agent and watch it work.
                </p>
                <Link href="/agents" className="btn-primary" style={{ fontSize: '.88rem', padding: '.7rem 1.5rem' }}>
                  See All Agents
                </Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {[
                  { title: 'Rigorous Backtesting', desc: '5 years of daily OHLCV data. Every strategy runs through the same engine. No cherry-picked windows or survivorship bias.', accent: '#3b7eff' },
                  { title: 'Full Trade Transparency', desc: 'Every order logged with entry price, exit, and P&L. Sharpe, drawdown, win rate all visible before you subscribe.', accent: '#16c784' },
                  { title: 'Fund Pooling', desc: 'Your credits pool with other subscribers to increase position sizing. More AUM means the agent trades with more capital — and earns proportionally.', accent: '#7c5cff' },
                  { title: 'Open to Builders', desc: 'Have a profitable edge? Submit your strategy. We handle infrastructure, execution, and subscriber management.', accent: '#f59e0b' },
                ].map((item, i) => (
                  <div key={item.title} style={{
                    display: 'flex', gap: '1rem', alignItems: 'flex-start',
                    opacity: whySection.visible ? 1 : 0,
                    transform: whySection.visible ? 'translateX(0)' : 'translateX(16px)',
                    transition: `opacity .5s ${i * 0.1}s, transform .5s ${i * 0.1}s`,
                  }}>
                    <div style={{ width: 3, flexShrink: 0, alignSelf: 'stretch', borderRadius: 4, background: item.accent, marginTop: 2 }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '.9rem', marginBottom: '.3rem' }}>{item.title}</div>
                      <div style={{ fontSize: '.82rem', color: 'var(--muted)', lineHeight: 1.6 }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Builders CTA ── */}
      <section ref={buildersSection.ref} style={{ padding: '8rem 2rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(59,127,255,.06) 0%, rgba(124,92,255,.06) 100%)',
            border: '1px solid rgba(59,127,255,.2)', borderRadius: 24,
            padding: '4rem',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '3rem', flexWrap: 'wrap',
            opacity: buildersSection.visible ? 1 : 0,
            transform: buildersSection.visible ? 'translateY(0)' : 'translateY(24px)',
            transition: 'opacity .7s, transform .7s',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: '-40%', right: '-5%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,92,255,.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative', zIndex: 1, maxWidth: 540 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', letterSpacing: '.12em', color: '#7c5cff', fontWeight: 700, textTransform: 'uppercase', marginBottom: '.6rem' }}>For Builders</div>
              <h2 style={{ fontSize: 'clamp(1.4rem, 3vw, 1.9rem)', fontWeight: 800, letterSpacing: '-.03em', marginBottom: '.9rem', lineHeight: 1.2 }}>
                Have an edge? Put it to work.
              </h2>
              <p style={{ fontSize: '.9rem', color: 'var(--muted)', lineHeight: 1.7 }}>
                Submit your trading algorithm. We run it through our backtesting engine and — if it qualifies — it goes live on the marketplace.
                You earn a share of subscriber fees.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem', position: 'relative', zIndex: 1 }}>
              <Link href="/builders" className="btn-primary" style={{ fontSize: '.9rem', padding: '.75rem 1.75rem', textAlign: 'center' }}>
                Builder Program
              </Link>
              <Link href="/builders/submit" className="btn-secondary" style={{ fontSize: '.9rem', padding: '.75rem 1.75rem', textAlign: 'center' }}>
                Submit an Agent
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section style={{ padding: '8rem 2rem', textAlign: 'center', position: 'relative', overflow: 'hidden', borderTop: '1px solid var(--border)', background: 'var(--bg2)' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(59,127,255,.05) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 640, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(1.8rem, 5vw, 3rem)', fontWeight: 800, letterSpacing: '-.04em', marginBottom: '1.25rem', lineHeight: 1.1 }}>
            Start trading<br />
            <span style={{ background: 'linear-gradient(135deg, #3b7eff, #7c5cff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              smarter today
            </span>
          </h2>
          <p style={{ fontSize: '.95rem', color: 'var(--muted)', marginBottom: '2.5rem', lineHeight: 1.7 }}>
            Free during beta. No fees, no minimums. $100 paper credits on signup.
            Just subscribe to a strategy and watch it run.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/signup" className="btn-primary" style={{ fontSize: '.95rem', padding: '.85rem 2.25rem', borderRadius: 12 }}>
              Create Free Account
            </Link>
            <Link href="/agents" style={{
              fontSize: '.95rem', padding: '.85rem 2.25rem', borderRadius: 12,
              border: '1px solid var(--border)', color: 'var(--muted)', fontWeight: 500,
              display: 'inline-block', transition: 'color .2s, border-color .2s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--white)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border2)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
            >
              View Agents
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '2.5rem 2rem', background: 'var(--bg)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.7rem' }}>
            <Image src="/logo.png" alt="ASE" width={22} height={22} style={{ borderRadius: 5, opacity: .8 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--faint)', letterSpacing: '.06em' }}>ASE — Algorithmic Strategy Exchange</span>
          </div>
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            {[
              { href: '/agents', label: 'Agents' },
              { href: '/builders', label: 'Builders' },
              { href: '/legal/terms', label: 'Terms' },
              { href: '/legal/privacy', label: 'Privacy' },
              { href: '/legal/securities', label: 'Disclosures' },
            ].map(link => (
              <Link key={link.href} href={link.href} style={{ fontSize: '.75rem', color: 'var(--faint)', transition: 'color .15s' }}
              onMouseEnter={e => { (e.target as HTMLElement).style.color = 'var(--muted)'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.color = 'var(--faint)'; }}
              >{link.label}</Link>
            ))}
          </div>
        </div>
        <div style={{ maxWidth: 1100, margin: '0 auto', paddingTop: '1.25rem', borderTop: '1px solid rgba(30,55,100,.2)' }}>
          <p style={{ fontSize: '.65rem', color: 'var(--faint)', lineHeight: 1.7 }}>
            Past backtest performance does not guarantee future results. Algorithmic trading involves substantial risk of loss. Not financial advice. For informational and educational purposes only. Paper credits have no monetary value and cannot be redeemed for cash.
          </p>
        </div>
      </footer>

      <style>{`
        @media (max-width: 900px) {
          .why-split { grid-template-columns: 1fr !important; gap: 3rem !important; }
          .how-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 760px) {
          .stats-grid-section { grid-template-columns: repeat(2,1fr) !important; }
          .stats-grid-section > div { border-right: none !important; border-bottom: 1px solid var(--border); }
        }
        @media (max-width: 480px) {
          .stats-grid-section { grid-template-columns: 1fr !important; }
        }
        .desktop-only { display: flex !important; }
        .mobile-only { display: none !important; }
        @media (max-width: 640px) {
          .desktop-only { display: none !important; }
          .mobile-only { display: flex !important; }
        }
      `}</style>
    </div>
  )
}
