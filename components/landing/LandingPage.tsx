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

const GradientText = ({ children }: { children: React.ReactNode }) => (
  <span style={{ background: 'linear-gradient(135deg, #3b7eff 0%, #7c5cff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
    {children}
  </span>
)

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
  const valueSection = useInView()
  const buildersSection = useInView()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--white)', fontFamily: 'var(--font-head)', overflowX: 'hidden' }}>

      {/* ── Fixed Navigation ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 2rem',
        background: scrolled ? 'rgba(6,8,15,.95)' : 'transparent',
        borderBottom: scrolled ? '1px solid var(--border)' : 'none',
        backdropFilter: scrolled ? 'blur(24px)' : 'none',
        transition: 'all .3s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2.5rem' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
            <Image src="/logo.png" alt="ASE" width={28} height={28} style={{ borderRadius: 5 }} />
            <span style={{ fontWeight: 800, fontSize: '.95rem', letterSpacing: '-.02em' }}>ASE</span>
          </Link>
          <div style={{ display: 'flex', gap: '1.5rem' }} className="desktop-only">
            {[
              { href: '/agents', label: 'Agents' },
              { href: '/dashboard/backtest', label: 'Lab' },
              { href: '/builders', label: 'Builders' },
            ].map(item => (
              <Link key={item.href} href={item.href} style={{
                fontSize: '.82rem', fontWeight: 500, color: 'var(--muted)',
                transition: 'color .2s',
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.color = 'var(--white)' }}
              onMouseLeave={e => { (e.target as HTMLElement).style.color = 'var(--muted)' }}
              >{item.label}</Link>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link href="/login" style={{ fontSize: '.82rem', color: 'var(--muted)', fontWeight: 500 }} className="desktop-only">
            Sign in
          </Link>
          <Link href="/signup" className="btn-primary" style={{ fontSize: '.82rem', padding: '.5rem 1.2rem', borderRadius: 9 }}>
            Get Started
          </Link>
          <button
            className="mobile-only"
            onClick={() => setMobileMenuOpen(prev => !prev)}
            style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, padding: '.4rem .5rem', display: 'flex', flexDirection: 'column', gap: 4 }}
          >
            {[...Array(3)].map((_, i) => (
              <span key={i} style={{ width: 16, height: 1.5, background: 'var(--muted)', display: 'block', borderRadius: 2 }} />
            ))}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div style={{
          position: 'fixed', top: 56, left: 0, right: 0, zIndex: 99,
          background: 'rgba(6,8,15,.98)', borderBottom: '1px solid var(--border)',
          padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '.25rem',
        }}>
          {[
            { href: '/agents', label: 'Agents' },
            { href: '/dashboard/backtest', label: 'Lab' },
            { href: '/builders', label: 'Builders' },
            { href: '/login', label: 'Sign In' },
          ].map(item => (
            <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)} style={{
              padding: '.65rem .85rem', borderRadius: 9, fontSize: '.9rem', color: 'var(--muted)', display: 'block',
            }}>{item.label}</Link>
          ))}
        </div>
      )}

      {/* ── Hero Section (Full Viewport) ── */}
      <section style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '120px 2rem 80px', position: 'relative', overflow: 'hidden',
      }}>
        {/* Animated background grid */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(90deg, rgba(59,127,255,.03) 1px, transparent 1px), linear-gradient(rgba(59,127,255,.03) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
          opacity: 0.5,
          pointerEvents: 'none',
        }} />

        {/* Gradient orbs */}
        <div style={{ position: 'absolute', top: '10%', left: '5%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,127,255,.08) 0%, transparent 70%)', pointerEvents: 'none', filter: 'blur(40px)' }} />
        <div style={{ position: 'absolute', bottom: '5%', right: '8%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,92,255,.07) 0%, transparent 70%)', pointerEvents: 'none', filter: 'blur(40px)' }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 900, textAlign: 'center' }}>
          {/* Badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '.5rem',
            background: 'rgba(59,127,255,.08)', border: '1px solid rgba(59,127,255,.25)',
            borderRadius: 999, padding: '.35rem 1.1rem', marginBottom: '2rem',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3b7eff', display: 'inline-block', boxShadow: '0 0 12px rgba(59,127,255,.8)', animation: 'pulse 2s infinite' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', letterSpacing: '.12em', color: '#7aacff', fontWeight: 700 }}>BETA — FREE TO USE</span>
          </div>

          {/* Main headline */}
          <h1 style={{
            fontSize: 'clamp(3rem, 8vw, 5.5rem)', fontWeight: 900,
            lineHeight: 1.05, letterSpacing: '-.05em', marginBottom: '1.5rem',
            color: 'var(--white)',
          }}>
            Trade Like<br />
            <GradientText>the Algorithms</GradientText>
          </h1>

          {/* Subheading */}
          <p style={{
            fontSize: 'clamp(1.05rem, 2vw, 1.25rem)', color: 'var(--muted)',
            lineHeight: 1.7, maxWidth: 620, margin: '0 auto 3rem',
            fontWeight: 400,
          }}>
            Subscribe to AI-powered trading agents. Every strategy backtested rigorously. Every trade transparent. Zero black boxes.
          </p>

          {/* CTA Buttons */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/agents" className="btn-primary" style={{
              fontSize: '1.05rem', padding: '1rem 2.25rem', borderRadius: 12,
              fontWeight: 600,
            }}>
              Browse Agents
            </Link>
            <Link href="/signup" style={{
              fontSize: '1.05rem', padding: '1rem 2.25rem', borderRadius: 12,
              background: 'transparent', border: '1.5px solid rgba(59,127,255,.4)',
              color: 'var(--white)', fontWeight: 600, display: 'inline-flex', alignItems: 'center',
              transition: 'all .3s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(59,127,255,.8)'; (e.currentTarget as HTMLElement).style.background = 'rgba(59,127,255,.1)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(59,127,255,.4)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              Create Account
            </Link>
          </div>

          {/* Scroll indicator */}
          <div style={{ marginTop: '6rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.5rem', opacity: 0.4 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', letterSpacing: '.12em', color: 'var(--muted)', textTransform: 'uppercase' }}>Scroll to explore</span>
            <svg width="20" height="32" viewBox="0 0 20 32" fill="none" style={{ animation: 'bounce 2s infinite' }}>
              <path d="M10 4V24M4 18L10 24L16 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" color="var(--muted)" />
            </svg>
          </div>
        </div>
      </section>

      {/* ── Spacer ── */}
      <div style={{ height: '8vh' }} />

      {/* ── Trust Metrics ── */}
      <section ref={statsSection.ref} style={{
        padding: '0 2rem', maxWidth: 1200, margin: '0 auto 12vh',
        opacity: statsSection.visible ? 1 : 0,
        transform: statsSection.visible ? 'translateY(0)' : 'translateY(40px)',
        transition: 'opacity 1s, transform 1s',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '3rem' }} className="stats-grid">
          {[
            { num: '10', label: 'Live Strategies', sub: 'Actively trading' },
            { num: '+124%', label: '5-Year Average', sub: 'Backtested return', color: 'var(--green)' },
            { num: '5Y', label: 'Data Depth', sub: 'Daily OHLCV' },
            { num: 'Free', label: 'Beta Access', sub: 'No credit card', color: '#7aacff' },
          ].map((stat, i) => (
            <div key={i} style={{
              padding: '2.5rem 0',
              borderBottom: `2px solid rgba(59,127,255,${statsSection.visible ? '.15' : '0'})`,
              transition: 'border-color 1s',
            }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '3rem', fontWeight: 900, color: stat.color ?? 'var(--white)', marginBottom: '.75rem', letterSpacing: '-.03em' }}>
                {stat.num}
              </div>
              <div style={{ fontSize: '.95rem', fontWeight: 700, marginBottom: '.25rem' }}>{stat.label}</div>
              <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>{stat.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Spacer ── */}
      <div style={{ height: '10vh' }} />

      {/* ── Agents Showcase ── */}
      <section ref={agentsSection.ref} style={{ padding: '0 2rem 12vh' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{
            opacity: agentsSection.visible ? 1 : 0,
            transform: agentsSection.visible ? 'translateY(0)' : 'translateY(60px)',
            transition: 'opacity 1s, transform 1s',
          }}>
            {/* Section header */}
            <div style={{ marginBottom: '4rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', letterSpacing: '.12em', color: '#3b7eff', fontWeight: 700, textTransform: 'uppercase', marginBottom: '.75rem' }}>
                Strategies
              </div>
              <h2 style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 900, letterSpacing: '-.04em', marginBottom: '.75rem' }}>
                Available Agents
              </h2>
              <p style={{ fontSize: '1rem', color: 'var(--muted)', lineHeight: 1.7, maxWidth: 600 }}>
                Choose from a curated selection of live trading agents. All strategies are rigorously backtested and transparently tracked.
              </p>
            </div>

            {/* Agent cards grid */}
            {agents.length === 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '2rem' }}>
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 280, borderRadius: 16 }} />
                ))}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '2rem' }} className="agents-grid">
                {agents.map((agent, i) => {
                  const sColor = strategyColor[agent.strategy_type] ?? 'var(--muted)'
                  const isPos = (agent.ret ?? 0) >= 0
                  return (
                    <Link key={i} href={`/agents/${agent.primary_symbol.toLowerCase()}-momentum`} style={{
                      display: 'block', textDecoration: 'none',
                      padding: '2rem', borderRadius: 16,
                      background: 'var(--bg2)', border: '1px solid var(--border)',
                      cursor: 'pointer', transition: 'all .3s',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = sColor;
                      (e.currentTarget as HTMLElement).style.background = `${sColor}08`;
                      (e.currentTarget as HTMLElement).style.transform = 'translateY(-6px)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                      (e.currentTarget as HTMLElement).style.background = 'var(--bg2)';
                      (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                    }}
                    >
                      {/* Card header */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                        <div>
                          <div style={{ width: 48, height: 48, borderRadius: 12, background: `${sColor}15`, border: `1px solid ${sColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '.75rem' }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', fontWeight: 800, color: sColor }}>
                              {agent.primary_symbol.split('-')[0].slice(0,3)}
                            </span>
                          </div>
                          <h3 style={{ fontSize: '.95rem', fontWeight: 700, marginBottom: '.25rem' }}>{agent.name}</h3>
                          <p style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{agent.strategy_type.replace('_', ' ')}</p>
                        </div>
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: '.65rem', fontWeight: 700,
                          padding: '.35rem .7rem', borderRadius: 6,
                          background: 'var(--green-dim)', color: 'var(--green)',
                          border: '1px solid var(--green-border)',
                        }}>LIVE</span>
                      </div>

                      {/* Stats */}
                      <div style={{ display: 'flex', gap: '1rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--faint)', marginBottom: '.3rem' }}>RETURN</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.95rem', fontWeight: 700, color: isPos ? 'var(--green)' : 'var(--red)' }}>
                            {agent.ret !== null ? fmtPct(agent.ret) : '—'}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--faint)', marginBottom: '.3rem' }}>SHARPE</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.95rem', fontWeight: 700 }}>
                            {agent.sharpe !== null ? agent.sharpe.toFixed(2) : '—'}
                          </div>
                        </div>
                        <div style={{ marginLeft: 'auto' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--faint)', marginBottom: '.3rem' }}>SUBS</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.95rem', fontWeight: 700 }}>
                            {agent.subscriber_count}
                          </div>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}

            {/* CTA */}
            <div style={{ textAlign: 'center', marginTop: '4rem' }}>
              <Link href="/agents" className="btn-secondary" style={{ fontSize: '.95rem', padding: '.75rem 2rem', display: 'inline-block' }}>
                View All Agents
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Spacer ── */}
      <div style={{ height: '10vh' }} />

      {/* ── Value Proposition ── */}
      <section ref={valueSection.ref} style={{
        padding: '0 2rem 12vh',
        background: 'linear-gradient(180deg, rgba(59,127,255,.03) 0%, transparent 100%)',
        borderTop: '1px solid var(--border)',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{
            opacity: valueSection.visible ? 1 : 0,
            transform: valueSection.visible ? 'translateY(0)' : 'translateY(60px)',
            transition: 'opacity 1s, transform 1s',
          }}>
            <div style={{ marginBottom: '4rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', letterSpacing: '.12em', color: '#7c5cff', fontWeight: 700, textTransform: 'uppercase', marginBottom: '.75rem' }}>
                Why ASE
              </div>
              <h2 style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 900, letterSpacing: '-.04em', marginBottom: '1rem' }}>
                Built for Transparency
              </h2>
              <p style={{ fontSize: '1rem', color: 'var(--muted)', lineHeight: 1.7, maxWidth: 700 }}>
                No opaque algorithms. No hidden fees. Just pure, verifiable trading strategies backtested on 5 years of real market data.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '4rem' }} className="value-grid">
              {[
                {
                  title: 'Rigorous Backtesting',
                  desc: '5 years of daily market data. Every strategy runs through our backtesting engine with identical methodology. No survivorship bias.',
                  icon: 'BT',
                  color: '#3b7eff',
                },
                {
                  title: 'Full Trade Transparency',
                  desc: 'Every order logged. Every entry and exit visible. Sharpe ratios, drawdowns, win rates — all computed the same way.',
                  icon: 'TX',
                  color: '#16c784',
                },
                {
                  title: 'Fund Pooling at Scale',
                  desc: 'When subscribers invest, capital pools together. More AUM = larger positions = bigger returns, proportionally distributed.',
                  icon: 'FP',
                  color: '#7c5cff',
                },
                {
                  title: 'Open to Builders',
                  desc: 'Have a winning strategy? Submit it. We handle the infrastructure, execution, and subscriber management. You earn from adoption.',
                  icon: 'BD',
                  color: '#f59e0b',
                },
              ].map((item, i) => (
                <div key={item.title} style={{
                  padding: '2.5rem', borderRadius: 16,
                  background: 'var(--bg2)', border: '1px solid var(--border)',
                  transition: 'all .3s',
                  opacity: valueSection.visible ? 1 : 0,
                  transform: valueSection.visible ? 'translateY(0)' : `translateY(${40 + i * 10}px)`,
                  transitionDelay: `${i * 0.1}s`,
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = item.color;
                  (e.currentTarget as HTMLElement).style.boxShadow = `0 0 20px ${item.color}20`;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                  (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                }}
                >
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: `${item.color}15`, border: `1px solid ${item.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', fontWeight: 900, color: item.color }}>
                      {item.icon}
                    </span>
                  </div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '.75rem' }}>{item.title}</h3>
                  <p style={{ fontSize: '.9rem', color: 'var(--muted)', lineHeight: 1.7 }}>{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Spacer ── */}
      <div style={{ height: '10vh' }} />

      {/* ── Builders CTA ── */}
      <section ref={buildersSection.ref} style={{
        padding: '8rem 2rem',
        background: 'linear-gradient(135deg, rgba(59,127,255,.08) 0%, rgba(124,92,255,.08) 100%)',
        border: '1px solid rgba(59,127,255,.15)',
      }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
          <div style={{
            opacity: buildersSection.visible ? 1 : 0,
            transform: buildersSection.visible ? 'translateY(0)' : 'translateY(60px)',
            transition: 'opacity 1s, transform 1s',
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', letterSpacing: '.12em', color: '#7c5cff', fontWeight: 700, textTransform: 'uppercase', marginBottom: '1rem' }}>
              For Builders
            </div>
            <h2 style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 900, letterSpacing: '-.04em', marginBottom: '1rem' }}>
              Have an Edge?
            </h2>
            <p style={{ fontSize: '1.05rem', color: 'var(--muted)', lineHeight: 1.8, maxWidth: 600, margin: '0 auto 2.5rem' }}>
              Submit your trading algorithm. We run it through rigorous backtesting. If it qualifies, it goes live on the marketplace and you earn from every subscriber.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/builders" className="btn-primary" style={{ fontSize: '.95rem', padding: '.8rem 2rem', borderRadius: 12 }}>
                Builder Program
              </Link>
              <Link href="/builders/submit" className="btn-secondary" style={{ fontSize: '.95rem', padding: '.8rem 2rem', borderRadius: 12 }}>
                Submit Strategy
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Spacer ── */}
      <div style={{ height: '8vh' }} />

      {/* ── Final CTA ── */}
      <section style={{
        padding: '8rem 2rem', textAlign: 'center',
        background: 'linear-gradient(180deg, transparent 0%, rgba(59,127,255,.04) 100%)',
      }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(2.2rem, 5vw, 3.5rem)', fontWeight: 900, letterSpacing: '-.05em', marginBottom: '1.25rem', lineHeight: 1.1 }}>
            Ready to trade<br />
            <GradientText>smarter?</GradientText>
          </h2>
          <p style={{ fontSize: '1.05rem', color: 'var(--muted)', marginBottom: '2.5rem', lineHeight: 1.7 }}>
            Free during beta. Connect your Coinbase account and start investing real USD into AI agents.
          </p>
          <Link href="/signup" className="btn-primary" style={{ fontSize: '1rem', padding: '.9rem 2.5rem', borderRadius: 12, display: 'inline-block' }}>
            Create Your Free Account
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '3rem 2rem 2rem', background: 'var(--bg2)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '2rem', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
              <Image src="/logo.png" alt="ASE" width={24} height={24} style={{ borderRadius: 5 }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: 'var(--faint)', letterSpacing: '.06em', textTransform: 'uppercase' }}>ASE</span>
            </div>
            <div style={{ display: 'flex', gap: '2.5rem', flexWrap: 'wrap' }}>
              {[
                { href: '/agents', label: 'Agents' },
                { href: '/builders', label: 'Builders' },
                { href: '/legal/terms', label: 'Terms' },
                { href: '/legal/privacy', label: 'Privacy' },
                { href: '/legal/securities', label: 'Disclosures' },
              ].map(link => (
                <Link key={link.href} href={link.href} style={{ fontSize: '.8rem', color: 'var(--faint)', transition: 'color .2s' }}
                onMouseEnter={e => { (e.target as HTMLElement).style.color = 'var(--muted)' }}
                onMouseLeave={e => { (e.target as HTMLElement).style.color = 'var(--faint)' }}
                >{link.label}</Link>
              ))}
            </div>
          </div>
          <div style={{ borderTop: '1px solid rgba(100,100,200,.1)', paddingTop: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <p style={{ fontSize: '.75rem', color: 'var(--faint)', lineHeight: 1.7, maxWidth: 500 }}>
              Past backtest performance does not guarantee future results. Algorithmic trading involves substantial risk of loss. Not financial advice. Paper credits have no monetary value.
            </p>
            <div style={{ fontSize: '.75rem', color: 'var(--faint)' }}>© 2026 ASE</div>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 12px rgba(59,127,255,.8); opacity: 1; }
          50% { box-shadow: 0 0 20px rgba(59,127,255,.5); opacity: 0.7; }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(8px); }
        }
        .btn-primary, .btn-secondary { display: inline-block; text-decoration: none; font-weight: 600; border-radius: 10px; transition: all 0.3s; }
        .btn-primary { background: linear-gradient(135deg, #3b7eff, #3b7eff); border: none; color: white; padding: .7rem 1.8rem; }
        .btn-primary:hover { box-shadow: 0 8px 32px rgba(59,127,255,0.4); transform: translateY(-2px); }
        .btn-secondary { background: transparent; border: 1px solid var(--border); color: var(--muted); padding: .7rem 1.8rem; }
        .btn-secondary:hover { border-color: var(--muted); color: white; }
        @media (max-width: 900px) {
          .agents-grid { grid-template-columns: 1fr !important; }
          .stats-grid { grid-template-columns: repeat(2,1fr) !important; }
          .value-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 640px) {
          .desktop-only { display: none !important; }
          .mobile-only { display: flex !important; }
          .stats-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
