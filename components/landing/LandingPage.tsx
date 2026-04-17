'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Logo } from '@/components/ui/Logo'
import LoadingState from '@/components/ui/LoadingState'
import EmptyState from '@/components/ui/EmptyState'
import HeroDevices from './HeroDevices'

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
  agent_stats?: AgentStats[]
  backtest_stats?: { stats?: BacktestStats }
  subscriber_count?: number
}

interface AgentStats {
  nav_cents: number
  total_return_pct: number
  sharpe_ratio: number
  max_drawdown_pct: number
  snapshot_at: string
}

interface BacktestStats {
  totalReturnPct: number
  sharpeRatio: number
  maxDrawdownPct: number
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

export default function LandingPage() {
  const [agents, setAgents] = useState<AgentPreview[]>([])
  const [loading, setLoading] = useState(true)
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
      .select('*, agent_stats(nav_cents,total_return_pct,sharpe_ratio,max_drawdown_pct,snapshot_at), backtest_stats')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(6)
      .then(({ data, error }) => {
        setLoading(false)
        if (error) {
          console.error('Failed to load agents:', error.message)
          return
        }
        if (!data || data.length === 0) {
          setAgents([])
          return
        }
        setAgents(data.map((a: AgentPreview) => {
          const statsArr = Array.isArray(a.agent_stats) ? a.agent_stats : (a.agent_stats ? [a.agent_stats] : [])
          const latestStats = statsArr.length > 0 ? statsArr.reduce((a: AgentStats, b: AgentStats) => (a.snapshot_at > b.snapshot_at ? a : b)) : null
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

  const heroSection = useInView()
  const liveTradingSection = useInView(0.1)
  const howItWorksSection = useInView(0.1)
  const featuresSection = useInView(0.1)
  const faqSection = useInView(0.1)
  const ctaSection = useInView(0.1)

  return (
    <div style={{ minHeight: '100vh', background: '#030712', color: '#ffffff', fontFamily: 'var(--font-body)', overflowX: 'hidden' }}>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-in { animation: fadeInUp 0.6s ease-out forwards; }
        .animate-delay-1 { animation-delay: 0.1s; opacity: 0; }
        .animate-delay-2 { animation-delay: 0.2s; opacity: 0; }
        .animate-delay-3 { animation-delay: 0.3s; opacity: 0; }
        .animate-delay-4 { animation-delay: 0.4s; opacity: 0; }
        @media (max-width: 768px) {
          .hero-grid { grid-template-columns: 1fr !important; }
          .agents-grid { grid-template-columns: 1fr !important; }
          .footer-grid { grid-template-columns: 1fr !important; gap: 2rem !important; }
        }
        @media (max-width: 480px) {
          .agents-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Fixed Navigation */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 2rem',
        background: scrolled ? 'rgba(3,7,18,0.95)' : 'transparent',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : 'none',
        backdropFilter: scrolled ? 'blur(20px)' : 'none',
        transition: 'all 0.3s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Logo size="medium" showLink={false} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: 0.85, fontSize: '.7rem' }}>
          {[
            { label: 'VERIFIED', color: '#5B8CFF' },
            { label: 'LIVE', color: '#00E599' },
            { label: 'AUDITED', color: '#ffffff' },
          ].map((item, i) => (
            <span key={i} style={{ 
              fontFamily: 'var(--font-mono)', 
              letterSpacing: '.04em',
              padding: '0.25rem 0.6rem',
              borderRadius: 4,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)'
            }}>
              <span style={{ color: item.color }}>{item.label}</span>
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '1.5rem' }} className="desktop-only">
            {[
              { href: '/agents', label: 'Marketplace' },
              { href: '/dashboard/backtest', label: 'Lab' },
              { href: '/builders', label: 'Build' },
            ].map(item => (
              <Link key={item.href} href={item.href} style={{
                fontSize: '.85rem', fontWeight: 500, color: 'rgba(255,255,255,0.7)',
                transition: 'color .2s',
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.color = '#ffffff' }}
              onMouseLeave={e => { (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.7)' }}
              >
                {item.label}
              </Link>
            ))}
          </div>

          <Link href="/login" style={{ fontSize: '.85rem', color: 'rgba(255,255,255,0.7)', fontWeight: 500 }} className="desktop-only">
            Sign In
          </Link>
          <Link href="/signup" style={{ 
            fontSize: '.85rem', 
            padding: '0.6rem 1.25rem', 
            borderRadius: 8,
            background: '#5B8CFF',
            color: '#ffffff',
            fontWeight: 600,
            transition: 'all 0.2s ease',
            boxShadow: '0 4px 14px rgba(91,140,255,0.25)',
          }}>
            Get Started
          </Link>
          
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{
              display: 'none', background: 'none', border: 'none', cursor: 'pointer',
              padding: '0.5rem', color: 'rgba(255,255,255,0.7)',
            }}
            className="mobile-only"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {mobileMenuOpen ? (
                <path d="M6 6l12 12M6 18L18 6" />
              ) : (
                <path d="M3 12h18M3 6h18M3 18h18" />
              )}
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div style={{
          position: 'fixed', top: 64, left: 0, right: 0, zIndex: 99,
          background: 'rgba(3,7,18,0.98)', borderBottom: '1px solid rgba(255,255,255,0.06)',
          padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '.25rem',
        }}>
          {[
            { href: '/agents', label: 'Marketplace' },
            { href: '/dashboard/backtest', label: 'Lab' },
            { href: '/builders', label: 'Build' },
            { href: '/login', label: 'Sign In' },
            { href: '/signup', label: 'Get Started' },
          ].map(item => (
            <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)} style={{
              padding: '.7rem .9rem', borderRadius: 8, fontSize: '.92rem', color: 'rgba(255,255,255,0.7)', display: 'block',
            }}>{item.label}</Link>
          ))}
        </div>
      )}

      {/* Hero Section */}
      <section ref={heroSection.ref} style={{
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center',
        padding: '8rem 2rem 4rem',
        position: 'relative',
        overflow: 'hidden',
        opacity: heroSection.visible ? 1 : 0,
        transform: heroSection.visible ? 'translateY(0)' : 'translateY(40px)',
        transition: 'opacity 0.8s ease, transform 0.8s ease',
      }}>
        {/* Background gradient */}
        <div style={{
          position: 'absolute', 
          inset: 0,
          background: `
            radial-gradient(ellipse 80% 50% at 50% -20%, rgba(91,140,255,0.15), transparent),
            radial-gradient(ellipse 60% 40% at 80% 60%, rgba(0,229,153,0.05), transparent)
          `,
          pointerEvents: 'none',
        }} />
        
        {/* Grid pattern */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
          `,
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 50%, black, transparent)',
        }} />

        <div className="hero-grid" style={{ maxWidth: 1280, margin: '0 auto', width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center', position: 'relative', zIndex: 1 }}>
          {/* Left Content */}
          <div style={{ maxWidth: 540 }}>
            <h1 className="animate-in animate-delay-2" style={{
              fontSize: 'clamp(2.5rem, 5vw, 4rem)', 
              fontWeight: 700,
              lineHeight: 1.05, 
              letterSpacing: '-0.04em', 
              marginBottom: '1.5rem',
              background: 'linear-gradient(135deg, #ffffff 0%, rgba(255,255,255,0.8) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontFamily: 'var(--font-body)',
            }}>
              Agent Securities Exchange
            </h1>
            
            <p className="animate-in animate-delay-3" style={{
              fontSize: 'clamp(1rem, 1.5vw, 1.2rem)', 
              color: 'rgba(255,255,255,0.6)',
              lineHeight: 1.7, 
              marginBottom: '2rem',
              maxWidth: 480,
            }}>
              Verified AI trading agents with transparent performance. Invest in algorithmic strategies with live execution and real-time monitoring.
            </p>

            {/* CTA Buttons */}
            <div className="animate-in animate-delay-3" style={{ display: 'flex', gap: '1rem', marginBottom: '2.5rem', flexWrap: 'wrap' }}>
              <Link href="/signup" style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.9rem 1.75rem',
                background: '#ffffff',
                color: '#030712',
                borderRadius: 10,
                fontWeight: 600,
                fontSize: '0.95rem',
                transition: 'all 0.2s ease',
                boxShadow: '0 8px 30px rgba(255,255,255,0.15)',
              }}>
                Start Investing
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
              <Link href="/agents" style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.9rem 1.75rem',
                background: 'transparent',
                color: 'rgba(255,255,255,0.8)',
                borderRadius: 10,
                fontWeight: 500,
                fontSize: '0.95rem',
                border: '1px solid rgba(255,255,255,0.15)',
                transition: 'all 0.2s ease',
              }}>
                View Marketplace
              </Link>
            </div>

            {/* Watch Demo */}
            <div className="animate-in animate-delay-3" style={{ marginBottom: '2.5rem' }}>
              <button style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.6)',
                fontSize: '0.9rem',
                cursor: 'pointer',
                padding: '0.5rem 0',
              }}>
                <span style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}>
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
                Watch Demo (2 min)
              </button>
            </div>

            {/* Trust indicators */}
            <div className="animate-in animate-delay-4" style={{ 
              display: 'flex', 
              gap: '2rem',
              paddingTop: '1.5rem',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              flexWrap: 'wrap',
            }}>
              {[
                { num: '$4.2M+', label: 'Tracked Capital' },
                { num: '12+', label: 'Verified Agents' },
                { num: '24/7', label: 'Live Monitoring' },
              ].map((item, i) => (
                <div key={i}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em' }}>{item.num}</div>
                  <div style={{ fontSize: '.75rem', color: 'rgba(255,255,255,0.5)' }}>{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="animate-in animate-delay-4">
            <HeroDevices />
          </div>
        </div>
      </section>

      {/* Key Benefits */}
      <section style={{
        padding: '4rem 2rem',
        borderTop: '1px solid rgba(255,255,255,0.04)',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: 'rgba(255,255,255,0.01)',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '2rem',
          }}>
            {[
              { icon: '🔐', title: 'Self-Custody', desc: 'Your funds stay in your exchange. We never hold your assets.' },
              { icon: '📊', title: 'Transparent', desc: 'Every trade logged with timestamps, prices, and full audit trail.' },
              { icon: '⚡', title: 'Real-Time', desc: '60-second NAV refresh. Monitor performance as it happens.' },
              { icon: '✓', title: 'Verified', desc: 'Every agent passes rigorous backtest and live simulation.' },
            ].map((item, i) => (
              <div key={i} style={{
                display: 'flex',
                gap: '1rem',
                alignItems: 'flex-start',
              }}>
                <span style={{ fontSize: '1.5rem' }}>{item.icon}</span>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#ffffff', marginBottom: '0.35rem' }}>{item.title}</h3>
                  <p style={{ fontSize: '.85rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Live Agents */}
      <section id="verified-agents" ref={liveTradingSection.ref} style={{ 
        padding: '6rem 2rem',
        opacity: liveTradingSection.visible ? 1 : 0,
        transform: liveTradingSection.visible ? 'translateY(0)' : 'translateY(40px)',
        transition: 'opacity 0.8s ease, transform 0.8s ease',
      }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <div style={{ marginBottom: '3rem' }}>
            <p style={{ 
              fontFamily: 'var(--font-mono)',
              fontSize: '.7rem', 
              letterSpacing: '.14em', 
              color: '#00E599', 
              fontWeight: 700, 
              textTransform: 'uppercase', 
              marginBottom: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00E599' }} />
              Live Trading
            </p>
            <h2 style={{ 
              fontSize: 'clamp(2rem, 4vw, 3rem)', 
              fontWeight: 700, 
              letterSpacing: '-0.03em', 
              marginBottom: '0.75rem',
              color: '#ffffff',
            }}>
              Verified Trading Agents
            </h2>
            <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.5)', maxWidth: 500 }}>
              Curated algorithms running live 24/7 with real execution logs.
            </p>
          </div>

          {loading ? (
            <LoadingState fullHeight={false} />
          ) : agents.length === 0 ? (
            <EmptyState
              icon="📊"
              title="No Trading Agents Available"
              description="Check back soon for new verified strategies."
              action={{ label: 'Browse All Agents', href: '/agents' }}
            />
          ) : (
            <div className="agents-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
              {agents.map((agent, i) => {
                const isPos = (agent.ret ?? 0) >= 0
                const risk = getRiskLevel(agent.max_drawdown)
                const confidence = agent.sharpe !== null ? Math.min(95, Math.round(60 + (agent.sharpe * 15))) : null
                return (
                  <Link key={i} href={`/agents/${agent.slug}`} style={{
                    display: 'block',
                    padding: '1.5rem',
                    borderRadius: 16,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    transition: 'all 0.3s ease',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'
                    ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(91,140,255,0.3)'
                    ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'
                    ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)'
                    ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
                  }}
                  >
                    <MiniSparkline positive={isPos} />

                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', position: 'relative', zIndex: 1 }}>
                      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <div style={{ 
                          width: 52, height: 52, borderRadius: 12, 
                          background: 'linear-gradient(135deg, rgba(91,140,255,0.2), rgba(0,229,153,0.1))',
                          border: '1px solid rgba(255,255,255,0.1)', 
                          display: 'flex', alignItems: 'center', justifyContent: 'center', 
                          fontFamily: 'var(--font-mono)', fontSize: '.75rem', fontWeight: 800, color: '#ffffff'
                        }}>
                          {agent.ticker?.slice(0, 4)}
                        </div>
                        <div>
                          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '.2rem', color: '#ffffff' }}>{agent.name}</h3>
                          <p style={{ fontSize: '.8rem', color: 'rgba(255,255,255,0.5)', textTransform: 'capitalize' }}>
                            {agent.strategy_type?.replace('_', ' ')}
                          </p>
                        </div>
                      </div>
                      {agent.isLive ? (
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '.4rem',
                          padding: '0.35rem 0.75rem',
                          borderRadius: 100,
                          background: 'rgba(0,229,153,0.1)',
                          border: '1px solid rgba(0,229,153,0.2)',
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00E599' }} />
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', fontWeight: 700, color: '#00E599', letterSpacing: '.08em' }}>LIVE</span>
                        </div>
                      ) : (
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '.4rem',
                          padding: '0.35rem 0.75rem',
                          borderRadius: 100,
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '.08em' }}>BACKTEST</span>
                        </div>
                      )}
                    </div>

                    <div style={{ marginBottom: '1rem', position: 'relative', zIndex: 1 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'rgba(255,255,255,0.4)', marginBottom: '.25rem', letterSpacing: '.1em' }}>1Y RETURN</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '2rem', fontWeight: 700, color: isPos ? '#00E599' : '#FF5A5F', letterSpacing: '-0.02em' }}>
                        {agent.ret !== null ? fmtPct(agent.ret) : '—'}
                      </div>
                    </div>

                    {confidence !== null && (
                      <div style={{ 
                        display: 'flex', alignItems: 'center', gap: '0.75rem', 
                        marginBottom: '1rem', padding: '0.5rem 0.75rem', 
                        background: 'rgba(255,255,255,0.03)', borderRadius: 8,
                      }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '.08em' }}>CONFIDENCE</span>
                        <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${confidence}%`, height: '100%', background: confidence >= 80 ? '#00E599' : confidence >= 60 ? '#F59E0B' : '#FF5A5F', borderRadius: 2 }} />
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.75rem', fontWeight: 600, color: confidence >= 80 ? '#00E599' : confidence >= 60 ? '#F59E0B' : '#FF5A5F' }}>{confidence}%</span>
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)', position: 'relative', zIndex: 1 }}>
                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'rgba(255,255,255,0.4)', marginBottom: '.25rem', letterSpacing: '.08em' }}>SHARPE</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.95rem', fontWeight: 600, color: '#ffffff' }}>
                          {agent.sharpe !== null ? agent.sharpe.toFixed(2) : '—'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'rgba(255,255,255,0.4)', marginBottom: '.25rem', letterSpacing: '.08em' }}>MAX DD</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.95rem', fontWeight: 600, color: (agent.max_drawdown ?? 0) > -20 ? '#00E599' : (agent.max_drawdown ?? 0) > -40 ? '#F59E0B' : '#FF5A5F' }}>
                          {agent.max_drawdown !== null ? fmtPct(agent.max_drawdown) : '—'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'rgba(255,255,255,0.4)', marginBottom: '.25rem', letterSpacing: '.08em' }}>AUM</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.95rem', fontWeight: 600, color: '#ffffff' }}>
                          {agent.aum !== null ? fmtMoney(agent.aum) : '—'}
                        </div>
                      </div>
                    </div>

                    <div style={{ 
                      position: 'absolute', top: '1rem', right: '1rem',
                      fontFamily: 'var(--font-mono)', fontSize: '.55rem', fontWeight: 600,
                      padding: '.25rem .5rem', borderRadius: 4,
                      background: `${risk.color}15`, border: `1px solid ${risk.color}30`,
                      color: risk.color,
                    }}>
                      {risk.label}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}

          <div style={{ textAlign: 'center', marginTop: '2.5rem' }}>
            <Link href="/agents" style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.85rem 2rem',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.8)',
              fontWeight: 500,
              transition: 'all 0.2s ease',
            }}>
              View All Agents
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section ref={howItWorksSection.ref} style={{ 
        padding: '8rem 2rem',
        background: 'rgba(255,255,255,0.01)',
        borderTop: '1px solid rgba(255,255,255,0.04)',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        opacity: howItWorksSection.visible ? 1 : 0,
        transform: howItWorksSection.visible ? 'translateY(0)' : 'translateY(40px)',
        transition: 'opacity 0.8s ease, transform 0.8s ease',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <p style={{ 
              fontFamily: 'var(--font-mono)',
              fontSize: '.7rem', 
              letterSpacing: '.14em', 
              color: '#5B8CFF', 
              fontWeight: 700, 
              textTransform: 'uppercase', 
              marginBottom: '1rem',
            }}>
              How It Works
            </p>
            <h2 style={{ 
              fontSize: 'clamp(2rem, 4vw, 3rem)', 
              fontWeight: 700, 
              letterSpacing: '-0.03em', 
              color: '#ffffff',
              marginBottom: '1rem',
            }}>
              Start in minutes
            </h2>
            <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.5)', maxWidth: 500, margin: '0 auto' }}>
              From sign-up to live trading in three simple steps.
            </p>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem' }}>
            {[
              { 
                step: '01', 
                title: 'Browse Agents', 
                desc: 'Explore verified trading strategies with transparent performance metrics and audit trails.',
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5B8CFF" strokeWidth="1.5">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                ),
                color: '#5B8CFF',
              },
              { 
                step: '02', 
                title: 'Connect Exchange', 
                desc: 'Link your exchange API. Your funds stay in your custody at all times.',
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00E599" strokeWidth="1.5">
                    <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                ),
                color: '#00E599',
              },
              { 
                step: '03', 
                title: 'Agents Trade', 
                desc: 'AI agents execute trades 24/7. Monitor performance in real-time.',
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="1.5">
                    <path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                ),
                color: '#F59E0B',
              },
            ].map((item, i) => (
              <div key={i} style={{ 
                padding: '2rem', borderRadius: 16, 
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                position: 'relative',
              }}>
                {i < 2 && (
                  <div style={{ position: 'absolute', top: '50%', right: '-1.5rem', transform: 'translateY(-50%)', zIndex: 1, color: 'rgba(255,255,255,0.2)' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
                <div style={{ 
                  width: 56, height: 56, borderRadius: 12, 
                  background: `${item.color}15`,
                  border: `1px solid ${item.color}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '1.5rem',
                }}>
                  {item.icon}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: item.color, letterSpacing: '.15em', marginBottom: '0.75rem', fontWeight: 700 }}>
                  {item.step}
                </div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.75rem', color: '#ffffff' }}>{item.title}</h3>
                <p style={{ fontSize: '.9rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section ref={featuresSection.ref} style={{ 
        padding: '8rem 2rem',
        opacity: featuresSection.visible ? 1 : 0,
        transform: featuresSection.visible ? 'translateY(0)' : 'translateY(40px)',
        transition: 'opacity 0.8s ease, transform 0.8s ease',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ marginBottom: '4rem' }}>
            <p style={{ 
              fontFamily: 'var(--font-mono)',
              fontSize: '.7rem', 
              letterSpacing: '.14em', 
              color: '#5B8CFF', 
              fontWeight: 700, 
              textTransform: 'uppercase', 
              marginBottom: '1rem',
            }}>
              Features
            </p>
            <h2 style={{ 
              fontSize: 'clamp(2rem, 4vw, 3rem)', 
              fontWeight: 700, 
              letterSpacing: '-0.03em', 
              color: '#ffffff',
              marginBottom: '1rem',
            }}>
              Built for trust
            </h2>
            <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.5)', maxWidth: 550 }}>
              Every agent is verified, monitored, and transparent. Here's how we ensure integrity.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
            {[
              { 
                title: 'Transparent Performance', 
                desc: 'Every agent exposes complete return history, drawdowns, trade activity, and benchmark context.',
                color: '#5B8CFF',
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ),
              },
              { 
                title: 'Quantitative Discipline', 
                desc: 'Strategies execute exactly as programmed. No emotional overrides, no fatigue, just pure logic.',
                color: '#00E599',
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                ),
              },
              { 
                title: 'Controlled Risk', 
                desc: 'Clear risk metrics, drawdown limits, and position sizing guards protect your capital.',
                color: '#F59E0B',
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                ),
              },
              { 
                title: 'Self-Custody', 
                desc: 'Your funds stay in your exchange. Agents trade on your behalf via secure API keys.',
                color: '#A855F7',
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                ),
              },
            ].map((feat, i) => (
              <div key={i} style={{ 
                padding: '2rem', borderRadius: 16, 
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                display: 'flex',
                gap: '1.5rem',
                transition: 'all 0.3s ease',
              }}>
                <div style={{ 
                  width: 56, height: 56, borderRadius: 12, 
                  background: `${feat.color}15`,
                  border: `1px solid ${feat.color}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {feat.icon}
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.5rem', color: '#ffffff' }}>{feat.title}</h3>
                  <p style={{ fontSize: '.9rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>{feat.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section ref={faqSection.ref} style={{ 
        padding: '8rem 2rem',
        background: 'rgba(255,255,255,0.01)',
        borderTop: '1px solid rgba(255,255,255,0.04)',
        opacity: faqSection.visible ? 1 : 0,
        transform: faqSection.visible ? 'translateY(0)' : 'translateY(40px)',
        transition: 'opacity 0.8s ease, transform 0.8s ease',
      }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <h2 style={{ 
              fontSize: 'clamp(2rem, 4vw, 3rem)', 
              fontWeight: 700, 
              letterSpacing: '-0.03em', 
              color: '#ffffff',
            }}>
              Frequently Asked Questions
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {[
              {
                q: 'How does ASE verify agent performance?',
                a: 'Every agent goes through our verification pipeline: quantitative integrity checks on backtest code, 30-day live simulation with performance tracked against projections, and ongoing execution quality audits with full trade transparency.'
              },
              {
                q: 'Do you hold my funds?',
                a: 'No. Your funds stay in your exchange account. We never hold your assets. Agents trade on your behalf via secure API keys that you control and can revoke at any time.'
              },
              {
                q: 'What exchanges are supported?',
                a: 'Currently we support major exchanges including Binance, Coinbase, Kraken, and Bybit. Support for additional exchanges is coming soon.'
              },
              {
                q: 'What fees does ASE charge?',
                a: 'ASE charges a small platform fee on profits generated. There are no upfront costs or subscription fees. You only pay when you earn.'
              },
              {
                q: 'How do I know an agent wont drain my account?',
                a: 'Agents operate within strict risk parameters you define: maximum position size, daily loss limits, and allowed trading pairs. You can always set stricter limits than the agent recommends.'
              },
            ].map((faq, i) => (
              <details key={i} style={{ 
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 12,
                overflow: 'hidden',
              }}>
                <summary style={{ 
                  padding: '1.25rem 1.5rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                  color: '#ffffff',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  listStyle: 'none',
                }}>
                  {faq.q}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                    <path d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div style={{ 
                  padding: '0 1.5rem 1.5rem',
                  color: 'rgba(255,255,255,0.6)',
                  lineHeight: 1.7,
                }}>
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section ref={ctaSection.ref} style={{
        padding: '8rem 2rem',
        background: `
          radial-gradient(ellipse 80% 50% at 50% 100%, rgba(91,140,255,0.15), transparent)
        `,
        opacity: ctaSection.visible ? 1 : 0,
        transform: ctaSection.visible ? 'translateY(0)' : 'translateY(40px)',
        transition: 'opacity 0.8s ease, transform 0.8s ease',
      }}>
        <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ 
            fontSize: 'clamp(2rem, 4vw, 3rem)', 
            fontWeight: 700, 
            letterSpacing: '-0.03em', 
            color: '#ffffff',
            marginBottom: '1rem',
          }}>
            Ready to start?
          </h2>
          <p style={{ 
            fontSize: '1.1rem', 
            color: 'rgba(255,255,255,0.6)', 
            marginBottom: '2.5rem',
            maxWidth: 500,
            margin: '0 auto 2.5rem',
          }}>
            Join the waitlist or create an account to explore verified AI trading strategies.
          </p>
          
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/signup" style={{
              padding: '1rem 2rem',
              background: '#ffffff',
              color: '#030712',
              borderRadius: 10,
              fontWeight: 600,
              fontSize: '1rem',
              transition: 'all 0.2s ease',
              boxShadow: '0 8px 30px rgba(255,255,255,0.15)',
            }}>
              Create Free Account
            </Link>
            <Link href="/legal/about" style={{
              padding: '1rem 2rem',
              background: 'transparent',
              color: 'rgba(255,255,255,0.8)',
              borderRadius: 10,
              fontWeight: 500,
              fontSize: '1rem',
              border: '1px solid rgba(255,255,255,0.15)',
              transition: 'all 0.2s ease',
            }}>
              Read Documentation
            </Link>
          </div>
          
          <p style={{ 
            fontSize: '.8rem', 
            color: 'rgba(255,255,255,0.4)', 
            marginTop: '1.5rem',
          }}>
            No credit card required. Explore agents before connecting an exchange.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        padding: '4rem 2rem 2rem',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(0,0,0,0.3)',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div className="footer-grid" style={{ display: 'grid', gridTemplateColumns: '2fr repeat(3, 1fr)', gap: '4rem', marginBottom: '4rem' }}>
            {/* Brand column */}
            <div>
              <div style={{ marginBottom: '1rem' }}>
                <Logo size="small" showLink={false} />
              </div>
              <p style={{ fontSize: '.9rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginBottom: '1.5rem', maxWidth: 280 }}>
                Platform for discovering, evaluating, and monitoring algorithmic trading strategies.
              </p>
              <div style={{ display: 'flex', gap: '1rem' }}>
                {[
                  { label: 'X', href: 'https://twitter.com' },
                  { label: 'Li', href: 'https://linkedin.com' },
                  { label: 'Gh', href: 'https://github.com' },
                ].map(social => (
                  <a key={social.label} href={social.href} target="_blank" rel="noopener noreferrer" style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    transition: 'all 0.2s ease',
                  }}>
                    {social.label}
                  </a>
                ))}
              </div>
            </div>

            {/* Platform */}
            <div>
              <h4 style={{ fontSize: '.75rem', fontWeight: 600, color: '#ffffff', marginBottom: '1.25rem', letterSpacing: '.08em', textTransform: 'uppercase' }}>Platform</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
                {[
                  { label: 'Marketplace', href: '/agents' },
                  { label: 'The Lab', href: '/dashboard/backtest' },
                  { label: 'Builders', href: '/builders' },
                  { label: 'Docs', href: '/legal/about' },
                ].map(link => (
                  <Link key={link.label} href={link.href} style={{ fontSize: '.85rem', color: 'rgba(255,255,255,0.5)', transition: 'color .2s' }}
                    onMouseEnter={e => (e.target as HTMLElement).style.color = '#ffffff'}
                    onMouseLeave={e => (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.5)'}
                  >{link.label}</Link>
                ))}
              </div>
            </div>

            {/* Company */}
            <div>
              <h4 style={{ fontSize: '.75rem', fontWeight: 600, color: '#ffffff', marginBottom: '1.25rem', letterSpacing: '.08em', textTransform: 'uppercase' }}>Company</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
                {[
                  { label: 'About', href: '/legal/about' },
                  { label: 'Blog', href: '#' },
                  { label: 'Status', href: '#' },
                  { label: 'Contact', href: '#' },
                ].map(link => (
                  <a key={link.label} href={link.href} style={{ fontSize: '.85rem', color: 'rgba(255,255,255,0.5)', transition: 'color .2s' }}
                    onMouseEnter={e => (e.target as HTMLElement).style.color = '#ffffff'}
                    onMouseLeave={e => (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.5)'}
                  >{link.label}</a>
                ))}
              </div>
            </div>

            {/* Legal */}
            <div>
              <h4 style={{ fontSize: '.75rem', fontWeight: 600, color: '#ffffff', marginBottom: '1.25rem', letterSpacing: '.08em', textTransform: 'uppercase' }}>Legal</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
                {[
                  { label: 'Terms', href: '/legal/terms' },
                  { label: 'Privacy', href: '/legal/privacy' },
                  { label: 'Risk Disclosures', href: '/legal/securities' },
                ].map(link => (
                  <Link key={link.label} href={link.href} style={{ fontSize: '.85rem', color: 'rgba(255,255,255,0.5)', transition: 'color .2s' }}
                    onMouseEnter={e => (e.target as HTMLElement).style.color = '#ffffff'}
                    onMouseLeave={e => (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.5)'}
                  >{link.label}</Link>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div style={{ 
            paddingTop: '2rem', 
            borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}>
            <div style={{ fontSize: '.75rem', color: 'rgba(255,255,255,0.4)' }}>
              © 2026 Agent Securities Exchange. All rights reserved.
            </div>
            <div style={{ 
              padding: '0.5rem 1rem', 
              borderRadius: 6,
              background: 'rgba(0,229,153,0.1)',
              border: '1px solid rgba(0,229,153,0.2)',
              fontSize: '.7rem',
              color: '#00E599',
              fontFamily: 'var(--font-mono)',
            }}>
              All systems operational
            </div>
          </div>

          {/* Disclaimer */}
          <div style={{ 
            marginTop: '1.5rem', 
            padding: '1rem',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.04)',
            fontSize: '.7rem', 
            color: 'rgba(255,255,255,0.3)',
            lineHeight: 1.6,
          }}>
            <strong style={{ color: 'rgba(255,255,255,0.5)' }}>Disclaimer:</strong> ASE provides tools, analytics, and strategy information. It does not guarantee returns. Investing and digital asset trading involve risk. Backtested results are hypothetical unless otherwise stated.
          </div>
        </div>
      </footer>
    </div>
  )
}
