'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Logo } from '@/components/ui/Logo'

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


  const liveTradingSection = useInView()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--white)', fontFamily: 'var(--font-body)', overflowX: 'hidden', position: 'relative' }}>
      {/* Global Background Effects */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: `linear-gradient(rgba(91,140,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(91,140,255,0.03) 1px, transparent 1px)`,
        backgroundSize: '56px 56px', opacity: 0.5,
      }} />
      <div style={{ position: 'fixed', top: '10%', left: '-10%', width: 800, height: 800, borderRadius: '50%', background: 'radial-gradient(circle, rgba(79,124,255,.06) 0%, transparent 70%)', pointerEvents: 'none', filter: 'blur(100px)' }} />
      <div style={{ position: 'fixed', bottom: '20%', right: '-5%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,107,53,.04) 0%, transparent 70%)', pointerEvents: 'none', filter: 'blur(80px)' }} />

      {/* Fixed Navigation */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 2rem',
        background: scrolled ? 'rgba(7,17,31,.95)' : 'transparent',
        borderBottom: scrolled ? '1px solid var(--border)' : 'none',
        backdropFilter: scrolled ? 'blur(16px)' : 'none',
        transition: 'all .3s ease',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Logo size="medium" showLink={false} />
        </div>

        {/* Nav Center - improved trust indicators */}
        <div className="desktop-only" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', opacity: 0.85, fontSize: '.7rem' }}>
            {[
              { label: 'VERIFIED', color: 'var(--blue)' },
              { label: 'LIVE', color: 'var(--mint)' },
              { label: 'AUDITED', color: 'var(--text)' },
            ].map((item, i) => (
            <span key={i} style={{ color: item.color, fontFamily: 'var(--font-mono)', letterSpacing: '.04em' }}>
              {item.label}
            </span>
          ))}
        </div>

        {/* Nav Right - Links + Auth */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Mobile Menu Toggle */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{
              display: 'none', background: 'none', border: 'none', cursor: 'pointer',
              padding: '0.5rem', color: 'var(--text)',
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

          {/* Nav Links - Desktop */}
          <div style={{ display: 'flex', gap: '1.25rem' }} className="desktop-only">
            {[
              { href: '/agents', label: 'Marketplace' },
              { href: '/dashboard/backtest', label: 'Lab', badge: 'Beta' },
              { href: '/builders', label: 'Build' },
              { href: '/legal/about', label: 'Docs' },
            ].map(item => (
              <Link key={item.href} href={item.href} style={{
                fontSize: '.85rem', fontWeight: 500, color: 'var(--text)',
                transition: 'color .2s', display: 'flex', alignItems: 'center', gap: '0.35rem',
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.color = 'var(--white)' }}
              onMouseLeave={e => { (e.target as HTMLElement).style.color = 'var(--text)' }}
              >
                {item.label}
                {item.badge && (
                  <span style={{
                    fontSize: '.45rem', fontWeight: 600, padding: '2px 5px',
                    borderRadius: 4, background: 'var(--blue-dim)', color: 'var(--blue)',
                    letterSpacing: '.05em', marginLeft: '3px', transform: 'translateY(-1px)',
                  }}>{item.badge}</span>
                )}
              </Link>
            ))}
          </div>

          {/* Auth CTAs */}
          <Link href="/login" style={{ fontSize: '.85rem', color: 'var(--text)', fontWeight: 500 }} className="desktop-only">
            Sign In
          </Link>
          <Link href="/signup" className="btn-primary" style={{ 
            fontSize: '.85rem', padding: '0.6rem 1.25rem', borderRadius: 12,
          }}>
            Get Started
          </Link>
          

        </div>
      </nav>

      {/* Mobile menu - updated */}
      {mobileMenuOpen && (
        <div style={{
          position: 'fixed', top: 64, left: 0, right: 0, zIndex: 99,
          background: 'rgba(7,17,31,.98)', borderBottom: '1px solid var(--border)',
          padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '.25rem',
        }}>
          {[
            { href: '/agents', label: 'Marketplace' },
            { href: '/dashboard/backtest', label: 'Lab (Beta)' },
            { href: '/builders', label: 'Build' },
            { href: '/login', label: 'Sign In' },
            { href: '/signup', label: 'Get Started' },
          ].map(item => (
            <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)} style={{
              padding: '.7rem .9rem', borderRadius: 10, fontSize: '.92rem', color: 'var(--text)', display: 'block',
            }}>{item.label}</Link>
          ))}
        </div>
      )}

      
      {/* Hero Section */}
      <section style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        padding: '4rem 2rem 3rem', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: 0,
          backgroundImage: `
            linear-gradient(rgba(91,140,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(91,140,255,0.04) 1px, transparent 1px)
          `,
          backgroundSize: '56px 56px', opacity: 0.5, pointerEvents: 'none',
        }} />
        <div style={{ position: 'absolute', top: '20%', left: '5%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(79,124,255,.08) 0%, transparent 70%)', pointerEvents: 'none', filter: 'blur(80px)' }} />
        <div style={{ position: 'absolute', top: '30%', right: '15%', width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,107,53,.06) 0%, transparent 70%)', pointerEvents: 'none', filter: 'blur(60px)' }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto', width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'center' }}>
          {/* Left Content */}
          <div style={{ maxWidth: 420 }}>
            <h1 style={{
              fontFamily: 'var(--font-serif)', fontSize: 'clamp(2rem, 4.5vw, 3rem)', fontWeight: 700,
              lineHeight: 1.1, letterSpacing: '-0.03em', marginBottom: '1rem',
              color: 'var(--ivory)',
            }}>
              Agent Securities Exchange
            </h1>
            
            <p style={{
              fontSize: 'clamp(0.85rem, 1.1vw, 1rem)', color: 'var(--text)',
              lineHeight: 1.6, marginBottom: '1.5rem',
              fontWeight: 400,
              maxWidth: 420,
            }}>
              Verified performance, live execution, and transparent risk metrics for algorithmic trading agents.
            </p>

            {/* CTA - better styled */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              <Link href="/agents" className="btn-primary" style={{
                padding: '0.85rem 1.75rem', whiteSpace: 'nowrap', fontSize: '.92rem',
                borderRadius: 12,
                background: 'linear-gradient(135deg, var(--blue) 0%, var(--blue2) 100%)',
                boxShadow: '0 4px 20px rgba(91,140,255,0.25)',
                transition: 'all 0.3s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = '0 6px 30px rgba(91,140,255,0.4)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(91,140,255,0.25)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
              >
                View Live Agents
              </Link>
              <Link href="#verified-agents" className="btn-secondary" style={{
                padding: '0.85rem 1.75rem', whiteSpace: 'nowrap', fontSize: '.92rem',
                borderRadius: 12,
                transition: 'all 0.3s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--blue)'
                e.currentTarget.style.color = 'var(--blue)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.color = 'var(--text)'
              }}
              >
                Verified Agents
              </Link>
            </div>
            
            {/* Microcopy under CTA */}
            <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>
              Explore live agents before connecting an exchange.
            </p>
            
            {/* Trust modules - compact row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
              {[
                { label: 'Verified Performance', symbol: 'V' },
                { label: 'Live Agent Monitoring', symbol: 'L' },
                { label: 'Transparent Risk Metrics', symbol: 'R' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ 
                    width: 16, height: 16, borderRadius: 4, 
                    background: 'var(--blue-dim)', border: '1px solid var(--blue-glow)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '.55rem', color: 'var(--blue)', fontWeight: 700,
                  }}>{item.symbol}</span>
                  <span style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* NEW: Strategy Core Hero Visual */}
          <div style={{ position: 'relative', height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* Grid background */}
            <div style={{
              position: 'absolute', inset: 0,
              backgroundImage: `
                linear-gradient(rgba(91,140,255,0.06) 1px, transparent 1px),
                linear-gradient(90deg, rgba(91,140,255,0.06) 1px, transparent 1px)
              `,
              backgroundSize: '32px 32px',
              opacity: 0.6,
            }} />
            
            {/* Strategy Core - central luminous sphere - BIGGER */}
            <div style={{
              position: 'relative',
              width: 340, height: 340,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {/* Rotating bar - outer */}
              <svg width="340" height="340" viewBox="0 0 340 340" style={{ position: 'absolute' }}>
                <defs>
                  <linearGradient id="barGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#5B8CFF" />
                    <stop offset="50%" stopColor="#19E6A7" />
                    <stop offset="100%" stopColor="#5B8CFF" />
                  </linearGradient>
                </defs>
                {/* Rotating arc bar */}
                <circle cx="170" cy="170" r="155" fill="none" stroke="url(#barGradient)" strokeWidth="3" strokeLinecap="round" strokeDasharray="20 60" opacity="0.6">
                  <animateTransform attributeName="transform" type="rotate" from="0 170 170" to="360 170 170" dur="8s" repeatCount="indefinite" />
                </circle>
                {/* Counter-rotating inner bar */}
                <circle cx="170" cy="170" r="130" fill="none" stroke="rgba(25,230,167,0.4)" strokeWidth="2" strokeLinecap="round" strokeDasharray="15 45" opacity="0.5">
                  <animateTransform attributeName="transform" type="rotate" from="360 170 170" to="0 170 170" dur="6s" repeatCount="indefinite" />
                </circle>
              </svg>
              
              {/* Outer glow */}
              <div style={{
                position: 'absolute', inset: -50,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(91,140,255,0.15) 0%, transparent 70%)',
                filter: 'blur(25px)',
              }} />
              
              {/* Middle orbital ring */}
              <svg width="340" height="340" viewBox="0 0 340 340" style={{ position: 'absolute' }}>
                <defs>
                  <linearGradient id="coreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#5B8CFF" stopOpacity="0.9" />
                    <stop offset="60%" stopColor="#19E6A7" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#5B8CFF" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {/* Outer orbital ring */}
                <ellipse cx="170" cy="170" rx="140" ry="60" fill="none" transform="rotate(-25, 170, 170)"
                  stroke="rgba(91,140,255,0.4)" strokeWidth="1" strokeDasharray="4 8">
                  <animateTransform attributeName="transform" type="rotate" from="0 170 170" to="360 170 170" dur="20s" repeatCount="indefinite" />
                </ellipse>
                {/* Inner orbital ring */}
                <ellipse cx="170" cy="170" rx="120" ry="45" fill="none" transform="rotate(60, 170, 170)"
                  stroke="rgba(25,230,167,0.35)" strokeWidth="1" strokeDasharray="3 6">
                  <animateTransform attributeName="transform" type="rotate" from="360 170 170" to="0 170 170" dur="15s" repeatCount="indefinite" />
                </ellipse>
                {/* Signal contour layers */}
                <circle cx="170" cy="170" r="85" fill="none" stroke="url(#coreGradient)" strokeWidth="0.5" opacity="0.6" />
                <circle cx="170" cy="170" r="65" fill="none" stroke="rgba(91,140,255,0.3)" strokeWidth="0.5" opacity="0.4" />
                <circle cx="170" cy="170" r="40" fill="none" stroke="rgba(91,140,255,0.5)" strokeWidth="1" />
              </svg>
              
              {/* Core center - BIGGER */}
              <div style={{
                width: 100, height: 100, borderRadius: '50%',
                background: 'radial-gradient(circle at 30% 30%, #78A2FF 0%, #5B8CFF 50%, #4676E8 100%)',
                boxShadow: '0 0 50px rgba(91,140,255,0.6), 0 0 100px rgba(91,140,255,0.25)',
                position: 'relative',
              }}>
                {/* Inner glow pulse */}
                <div style={{
                  position: 'absolute', inset: -10, borderRadius: '50%',
                  background: 'transparent', border: '1px solid rgba(91,140,255,0.5)',
                  animation: 'breathe 3s ease-in-out infinite',
                }} />
              </div>
              
              {/* Execution trails */}
              <svg width="340" height="340" viewBox="0 0 340 340" style={{ position: 'absolute', inset: 0 }}>
                <path d="M 70 240 Q 120 210 170 170 T 270 90" fill="none" stroke="rgba(25,230,167,0.5)" strokeWidth="2" strokeLinecap="round">
                  <animate attributeName="stroke-dashoffset" values="0;-200" dur="3s" repeatCount="indefinite" />
                </path>
                <path d="M 240 260 Q 200 230 170 190 T 90 110" fill="none" stroke="rgba(91,140,255,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="4 4">
                  <animate attributeName="stroke-dashoffset" values="0;-100" dur="4s" repeatCount="indefinite" />
                </path>
              </svg>
            </div>
            
            {/* Live Market Module - Bloomberg terminal style - floating to the side */}
            <div style={{ 
              position: 'absolute', top: '50%', right: '-40px', 
              transform: 'translateY(-50%)',
              width: 260,
              background: 'var(--bg3)', border: '1px solid var(--border)', 
              borderRadius: 12, overflow: 'hidden',
              boxShadow: '-4px 0 20px rgba(0,0,0,0.3)',
            }}>
              {/* Module Header */}
              <div style={{ 
                padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'var(--bg2)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--mint)', animation: 'breathe 2s ease-in-out infinite' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', fontWeight: 600, color: 'var(--white)', letterSpacing: '.08em' }}>LIVE MARKET</span>
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.45rem', color: 'var(--faint)' }}>NAV 60s</span>
              </div>
              
              {/* Table Header */}
              <div style={{ 
                display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr 0.8fr', gap: '0.25rem',
                padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border)',
                fontFamily: 'var(--font-mono)', fontSize: '.42rem', color: 'var(--faint)', letterSpacing: '.05em',
              }}>
                <span>AGENT</span>
                <span>STRATEGY</span>
                <span style={{ textAlign: 'right' }}>RETURN</span>
                <span style={{ textAlign: 'right' }}>SHARPE</span>
              </div>
              
              {/* Live Agents List */}
              {[
                { ticker: 'ARB', name: 'ETH Arb', strategy: 'Arbitrage', ret: 18.4, sharpe: 2.1, dd: -4.2, bench: '+12%', last: '2m ago' },
                { ticker: 'TRD', name: 'BTC Trend', strategy: 'Momentum', ret: 12.2, sharpe: 1.8, dd: -8.5, bench: '+8%', last: '5m ago' },
                { ticker: 'VOL', name: 'SOL Vol', strategy: 'Volatility', ret: 9.8, sharpe: 1.4, dd: -12.1, bench: '+6%', last: '1m ago' },
                { ticker: 'COR', name: 'Core', strategy: 'Trend', ret: 7.2, sharpe: 1.1, dd: -6.8, bench: '+4%', last: '8m ago' },
              ].map((agent, i) => (
                <div key={i} style={{ 
                  position: 'relative',
                  padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border)',
                  transition: 'all .2s', cursor: 'pointer',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'var(--blue-dim)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent'
                }}
                >
                  {/* Hover expanded details */}
                  <div style={{ 
                    display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr 0.8fr', gap: '0.25rem',
                    alignItems: 'center',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ 
                        width: 20, height: 20, borderRadius: 4, 
                        background: 'var(--bg2)', border: '1px solid var(--border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--font-mono)', fontSize: '.4rem', fontWeight: 700, color: 'var(--white)',
                      }}>{agent.ticker}</span>
                      <span style={{ fontSize: '.6rem', color: 'var(--white)' }}>{agent.name}</span>
                    </div>
                    <span style={{ fontSize: '.5rem', color: 'var(--muted)', textTransform: 'capitalize' }}>{agent.strategy}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', fontWeight: 700, color: agent.ret >= 0 ? 'var(--mint)' : 'var(--red)', textAlign: 'right' }}>
                      {agent.ret >= 0 ? '+' : ''}{agent.ret}%
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--white)', textAlign: 'right' }}>
                      {agent.sharpe}
                    </span>
                  </div>
                  
                  {/* Hover: Show expanded metrics */}
                  <div className="agent-hover-details" style={{
                    display: 'none',
                    marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)',
                    fontFamily: 'var(--font-mono)', fontSize: '.45rem',
                  }}>
                    <span style={{ color: 'var(--faint)' }}>MAX DD: </span>
                    <span style={{ color: agent.dd > -20 ? 'var(--mint)' : agent.dd > -40 ? '#F59E0B' : 'var(--red)' }}>{agent.dd}%</span>
                    <span style={{ marginLeft: '0.75rem', color: 'var(--faint)' }}>VS {agent.bench}</span>
                    <span style={{ float: 'right', color: 'var(--faint)' }}>{agent.last}</span>
                  </div>
                </div>
              ))}
              
              {/* Sparkline mini-chart */}
              <div style={{ padding: '0.5rem 0.75rem' }}>
                <svg width="100%" height="24" viewBox="0 0 100 24" preserveAspectRatio="none">
                  <path d="M0,20 Q10,18 20,15 T40,12 T60,8 T80,5 T100,2" fill="none" stroke="var(--mint)" strokeWidth="1.5" opacity="0.6" />
                </svg>
              </div>
               
              <Link href="/agents" style={{
                display: 'block', textAlign: 'center', padding: '0.5rem',
                fontSize: '.55rem', color: 'var(--blue)', 
                fontFamily: 'var(--font-mono)', letterSpacing: '.05em',
                borderTop: '1px solid var(--border)',
              }}>
                View All Agents →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Platform Stats + How It Works - Combined */}
      <section style={{
        minHeight: '100vh', padding: '4rem 2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center',
        background: 'var(--bg)',
      }}>
        {/* Main Header */}
        <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--ivory)', marginBottom: '1rem' }}>
            Platform Stats
          </h2>
          <p style={{ fontSize: '1rem', color: 'var(--muted)', maxWidth: 600, margin: '0 auto' }}>
            Real-time metrics from our live trading agents
          </p>
        </div>

        {/* Stats - Horizontal Timeline Style */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'stretch', gap: '1.5rem', marginBottom: '5rem', flexWrap: 'wrap' }}>
          {[
            { num: '12', label: 'Verified Agents', sub: 'Live + audit trail', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
            { num: '$4.2M', label: 'Tracked Capital', sub: 'Subscribed NAV', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M5 18H3a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2M5 18v-2a2 2 0 00-2-2h10a2 2 0 002 2v2', color: 'var(--mint)' },
            { num: '+24.8%', label: 'Median Return', sub: 'Live verified', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6', color: 'var(--mint)' },
            { num: '60s', label: 'NAV Refresh', sub: 'Real-time sync', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', hasPulse: true },
          ].map((stat, i) => (
            <div key={i} style={{ 
              padding: '1.5rem 2rem', borderRadius: 16, 
              background: 'var(--bg3)', border: '1px solid var(--border)',
              position: 'relative',
              minWidth: 180,
              textAlign: 'center',
            }}>
              {stat.hasPulse && (
                <span style={{ 
                  position: 'absolute', top: '0.75rem', right: '0.75rem',
                  width: 6, height: 6, borderRadius: '50%', 
                  background: 'var(--mint)', 
                  animation: 'breathe 2.5s ease-in-out infinite',
                }} />
              )}
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={stat.color || 'var(--blue)'} strokeWidth="1.5" style={{ marginBottom: '0.75rem', opacity: 0.7 }}>
                <path d={stat.icon} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, color: stat.color ?? 'var(--ivory)', marginBottom: '.2rem', letterSpacing: '-0.02em' }}>
                {stat.num}
              </div>
              <div style={{ fontSize: '.8rem', fontWeight: 600, marginBottom: '.1rem', color: 'var(--white)' }}>{stat.label}</div>
              <div style={{ fontSize: '.65rem', color: 'var(--faint)' }}>{stat.sub}</div>
            </div>
          ))}
        </div>

        {/* How It Works - Connected Flow */}
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(2rem, 4vw, 2.5rem)', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--ivory)' }}>
            How It Works
          </h2>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', gap: '1rem', maxWidth: 1100, margin: '0 auto' }}>
          {[
            { step: '01', title: 'Browse Agents', desc: 'Explore verified trading strategies with transparent performance metrics.', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
            { step: '02', title: 'Connect Exchange', desc: 'Link your exchange API. Your funds stay in your custody.', icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1' },
            { step: '03', title: 'Agents Trade', desc: 'AI agents execute trades 24/7. Monitor performance in real-time.', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
          ].map((item, i) => (
            <div key={i} style={{ 
              padding: '2rem', borderRadius: 16, 
              background: 'var(--bg2)', border: '1px solid var(--border)',
              flex: 1,
              position: 'relative',
            }}>
              {i < 2 && (
                <div style={{ position: 'absolute', top: '50%', right: '-1rem', transform: 'translateY(-50%)', zIndex: 1, color: 'var(--border)' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
              <div style={{ 
                width: 48, height: 48, borderRadius: 12, 
                background: 'var(--blue-dim)', border: '1px solid var(--blue-glow)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: '1rem',
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.icon} />
                </svg>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--blue)', letterSpacing: '.12em', marginBottom: '0.5rem' }}>{item.step}</div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--white)' }}>{item.title}</h3>
              <p style={{ fontSize: '.8rem', color: 'var(--muted)', lineHeight: 1.5 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Live Trading Agents */}
      <section ref={liveTradingSection.ref} style={{ minHeight: '100vh', padding: '4rem 2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'var(--bg)', opacity: liveTradingSection.visible ? 1 : 0, transform: liveTradingSection.visible ? 'translateY(0)' : 'translateY(40px)', transition: 'opacity 0.8s ease, transform 0.8s ease' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', letterSpacing: '.14em', color: 'var(--ivory)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '.5rem' }}>
              Marketplace
            </div>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: '.5rem' }}>
              Live Trading Agents
            </h2>
            <p style={{ fontSize: '.9rem', color: 'var(--muted)', lineHeight: 1.6, maxWidth: 400 }}>
              Curated algorithms. Running live 24/7.
            </p>
          </div>

          {/* Filters and Sort */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {['All', 'Arbitrage', 'Momentum', 'Trend', 'Volatility'].map((type, i) => (
                <button key={type} style={{
                  padding: '0.4rem 0.75rem', borderRadius: 6, fontSize: '.7rem',
                  background: i === 0 ? 'var(--blue-dim)' : 'var(--bg2)',
                  border: `1px solid ${i === 0 ? 'var(--blue-glow)' : 'var(--border)'}`,
                  color: i === 0 ? 'var(--blue)' : 'var(--muted)',
                  cursor: 'pointer', transition: 'all .2s',
                }}>{type}</button>
              ))}
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <span style={{ fontSize: '.65rem', color: 'var(--faint)' }}>Sort by:</span>
              <select style={{
                background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6,
                padding: '0.35rem 0.5rem', fontSize: '.7rem', color: 'var(--white)',
                cursor: 'pointer',
              }}>
                <option>Return (High)</option>
                <option>Sharpe (High)</option>
                <option>Drawdown (Low)</option>
                <option>AUM (High)</option>
              </select>
            </div>
          </div>

          {/* Agent Cards Grid */}
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1.25rem' }}>
              {[...Array(3)].map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 220, borderRadius: 12 }} />
              ))}
            </div>
          ) : agents.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)', background: 'var(--bg2)', borderRadius: 12, border: '1px solid var(--border)' }}>
              <p style={{ marginBottom: '1rem', fontSize: '.9rem' }}>No trading agents available yet.</p>
              <Link href="/agents" style={{ color: 'var(--blue)', fontSize: '.85rem' }}>Browse all agents →</Link>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1.25rem' }} className="agents-grid">
              {agents.map((agent, i) => {
                const isPos = (agent.ret ?? 0) >= 0
                const risk = getRiskLevel(agent.max_drawdown)
                const confidence = agent.sharpe !== null ? Math.min(95, Math.round(60 + (agent.sharpe * 15))) : null
                return (
                  <Link key={i} href={`/agents/${agent.slug}`} className="agent-card" style={{ transition: 'all 0.3s ease', padding: '1.25rem' }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-4px)'
                      e.currentTarget.style.boxShadow = '0 12px 40px rgba(91,140,255,0.15)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    <MiniSparkline positive={isPos} />

                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem', position: 'relative', zIndex: 1 }}>
                      <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
                        <div style={{ 
                          width: 48, height: 48, borderRadius: 12, 
                          background: 'var(--bg3)', border: '1px solid var(--border)', 
                          display: 'flex', alignItems: 'center', justifyContent: 'center', 
                          fontFamily: 'var(--font-mono)', fontSize: '.7rem', fontWeight: 800, color: 'var(--ivory)'
                        }}>
                          {agent.ticker?.slice(0, 4)}
                        </div>
                        <div>
                          <h3 style={{ fontSize: '.95rem', fontWeight: 600, marginBottom: '.15rem', color: 'var(--white)' }}>{agent.name}</h3>
                          <p style={{ fontSize: '.72rem', color: 'var(--muted)', textTransform: 'capitalize' }}>
                            {agent.strategy_type?.replace('_', ' ')}
                          </p>
                        </div>
                      </div>
                      {agent.isLive ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--mint)', animation: 'breathe 2.5s ease-in-out infinite' }} />
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', fontWeight: 700, color: 'var(--mint)', letterSpacing: '.1em' }}>LIVE</span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--faint)' }} />
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', fontWeight: 700, color: 'var(--faint)', letterSpacing: '.1em' }}>BACKTEST</span>
                        </div>
                      )}
                    </div>

                    {/* Primary Return */}
                    <div style={{ marginBottom: '0.75rem', position: 'relative', zIndex: 1 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', marginBottom: '.25rem', letterSpacing: '.1em' }}>1Y RETURN</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.75rem', fontWeight: 700, color: isPos ? 'var(--mint)' : 'var(--red)' }}>
                        {agent.ret !== null ? fmtPct(agent.ret) : '—'}
                      </div>
                    </div>

                    {/* Confidence Indicator */}
                    {confidence !== null && (
                      <div style={{ 
                        display: 'flex', alignItems: 'center', gap: '0.5rem', 
                        marginBottom: '0.75rem', padding: '0.4rem 0.6rem', 
                        background: 'var(--bg3)', borderRadius: 6,
                        border: '1px solid var(--border)'
                      }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: 'var(--faint)', letterSpacing: '.08em' }}>CONFIDENCE</span>
                        <div style={{ flex: 1, height: 4, background: 'var(--bg)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${confidence}%`, height: '100%', background: confidence >= 80 ? 'var(--mint)' : confidence >= 60 ? '#F59E0B' : 'var(--red)', borderRadius: 2 }} />
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', fontWeight: 600, color: confidence >= 80 ? 'var(--mint)' : confidence >= 60 ? '#F59E0B' : 'var(--red)' }}>{confidence}%</span>
                      </div>
                    )}

                    {/* Secondary Metrics Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.875rem', paddingTop: '0.875rem', borderTop: '1px solid var(--border)', position: 'relative', zIndex: 1 }}>
                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', marginBottom: '.2rem', letterSpacing: '.08em' }}>SHARPE</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', fontWeight: 600, color: 'var(--white)' }}>
                          {agent.sharpe !== null ? agent.sharpe.toFixed(2) : '—'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', marginBottom: '.2rem', letterSpacing: '.08em' }}>MAX DD</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', fontWeight: 600, color: (agent.max_drawdown ?? 0) > -20 ? 'var(--mint)' : (agent.max_drawdown ?? 0) > -40 ? '#F59E0B' : 'var(--red)' }}>
                          {agent.max_drawdown !== null ? fmtPct(agent.max_drawdown) : '—'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', marginBottom: '.2rem', letterSpacing: '.08em' }}>AUM</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', fontWeight: 600, color: 'var(--white)' }}>
                          {agent.aum !== null ? fmtMoney(agent.aum) : '—'}
                        </div>
                      </div>
                    </div>

                    {/* Risk Badge */}
                    <div style={{ 
                      position: 'absolute', top: '1rem', right: '1rem',
                      fontFamily: 'var(--font-mono)', fontSize: '.5rem', fontWeight: 600,
                      padding: '.2rem .45rem', borderRadius: 4,
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

          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <Link href="/agents" className="btn-secondary" style={{ fontSize: '.85rem', padding: '.6rem 1.5rem', display: 'inline-block' }}>
              View All Agents
            </Link>
          </div>
        </div>
      </section>

      {/* Why Investors Trust - Full Page */}
      <section style={{
        minHeight: '100vh', padding: '6rem 2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center',
        background: 'var(--bg)',
      }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', width: '100%' }}>
          <div style={{ marginBottom: '4rem', textAlign: 'center' }}>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--ivory)' }}>
              Why Investors Trust
            </h2>
            <p style={{ fontSize: '1rem', color: 'var(--muted)', marginTop: '1rem', maxWidth: 600, margin: '1rem auto 0' }}>
              Every agent is verified, monitored, and transparent. Here's how we ensure integrity.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1.5rem' }}>
              {[
                { title: 'Transparent Performance', desc: 'Every agent exposes complete return history, drawdowns, trade activity, and benchmark context.', color: 'var(--blue)', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
                { title: 'Quantitative Discipline', desc: 'Strategies execute exactly as programmed. No emotional overrides, no fatigue, just pure logic.', color: 'var(--mint)', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
                { title: 'Controlled Risk', desc: 'Clear risk metrics, drawdown limits, and position sizing guards protect your capital on every trade.', color: 'var(--orange)', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
                { title: 'Self-Custody', desc: 'Your funds stay in your exchange. Agents trade on your behalf via secure API keys you control.', color: 'var(--purple)', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
              ].map((feat, i) => (
              <div key={i} style={{ 
                padding: '2rem', borderRadius: 16, 
                background: 'var(--bg2)', border: '1px solid var(--border)',
                transition: 'all 0.3s ease',
              }}>
                <div style={{ 
                  width: 56, height: 56, borderRadius: 12, 
                  background: `${feat.color}15`, border: `1px solid ${feat.color}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '1.25rem',
                }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={feat.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d={feat.icon} />
                  </svg>
                </div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--white)' }}>{feat.title}</h3>
                <p style={{ fontSize: '.85rem', color: 'var(--muted)', lineHeight: 1.6 }}>{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How Verification Works - Full Page */}
      <section style={{
        minHeight: '100vh', padding: '6rem 2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center',
        background: 'var(--bg2)',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%' }}>
          <div style={{ marginBottom: '4rem', textAlign: 'center' }}>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--ivory)' }}>
              How Verification Works
            </h2>
            <p style={{ fontSize: '1rem', color: 'var(--muted)', marginTop: '1rem', maxWidth: 600, margin: '1rem auto 0' }}>
              Every agent passes through our rigorous verification pipeline before listing.
            </p>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem' }}>
            {[
              { step: '01', title: 'Backtest Review', desc: 'Quantitative integrity checks. We verify code correctness, data quality, and methodology soundness through automated analysis.', color: 'var(--blue)', timeline: 'Week 1-2' },
              { step: '02', title: 'Live Simulation', desc: '30-day parallel live environment. Performance is tracked against backtest projections to ensure consistency.', color: 'var(--mint)', timeline: 'Week 3-4' },
              { step: '03', title: 'Audit Trail', desc: 'Ongoing verification of execution quality. All trades are logged with timestamps, prices, and full transparency.', color: 'var(--purple)', timeline: 'Ongoing' },
            ].map((item, i) => (
              <div key={i} style={{ 
                padding: '2.5rem', borderRadius: 16, 
                background: 'var(--bg3)', border: '1px solid var(--border)',
                position: 'relative',
                overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 4, background: item.color }} />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: item.color, letterSpacing: '.15em', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ padding: '0.25rem 0.5rem', borderRadius: 4, background: `${item.color}15`, border: `1px solid ${item.color}30` }}>{item.step}</span>
                  <span style={{ color: 'var(--faint)' }}>{item.timeline}</span>
                </div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--white)' }}>{item.title}</h3>
                <p style={{ fontSize: '.9rem', color: 'var(--muted)', lineHeight: 1.6 }}>{item.desc}</p>
                
                {i < 2 && (
                  <div style={{ position: 'absolute', top: '50%', right: '-1rem', transform: 'translateY(-50%)', color: 'var(--border)' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For Builders - Full Page */}
      <section style={{
        minHeight: '100vh', padding: '6rem 2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center',
        background: 'var(--bg2)',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--ivory)' }}>
              For Builders
            </h2>
            <p style={{ fontSize: '1rem', color: 'var(--muted)', marginTop: '1rem', maxWidth: 600, margin: '1rem auto 0' }}>
              Turn your trading strategies into an asset. Build once, list globally, earn from performance.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '2rem', marginBottom: '3rem' }}>
            {[
              { title: 'Backtest Lab', desc: 'Test your strategies against historical data with professional-grade tooling.', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', color: 'var(--blue)' },
              { title: 'Validation Pipeline', desc: 'Automated verification ensures your strategy meets performance standards before listing.', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', color: 'var(--mint)' },
              { title: 'Global Marketplace', desc: 'Reach thousands of investors. Earn performance fees from day one.', icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z', color: 'var(--purple)' },
            ].map((item, i) => (
              <div key={i} style={{ 
                padding: '2rem', borderRadius: 16, 
                background: 'var(--bg3)', border: '1px solid var(--border)',
                textAlign: 'center',
              }}>
                <div style={{ 
                  width: 64, height: 64, borderRadius: 16, 
                  background: `${item.color}15`, border: `1px solid ${item.color}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 1.25rem',
                }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={item.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d={item.icon} />
                  </svg>
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--white)' }}>{item.title}</h3>
                <p style={{ fontSize: '.85rem', color: 'var(--muted)', lineHeight: 1.5 }}>{item.desc}</p>
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/dashboard/backtest" className="btn-primary" style={{ fontSize: '1rem', padding: '0.9rem 2rem' }}>
              Access The Lab
            </Link>
            <Link href="/signup" className="btn-secondary" style={{ fontSize: '1rem', padding: '0.9rem 2rem' }}>
              Create Account
            </Link>
          </div>
        </div>
      </section>

      {/* For Investors - Full Page */}
      <section style={{
        minHeight: '100vh', padding: '6rem 2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center',
        background: 'var(--bg)',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--ivory)' }}>
              For Investors
            </h2>
            <p style={{ fontSize: '1rem', color: 'var(--muted)', marginTop: '1rem', maxWidth: 600, margin: '1rem auto 0' }}>
              Access strategies previously locked inside hedge funds. No $250K minimum. Full transparency.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '2rem', marginBottom: '3rem' }}>
            {[
              { title: 'Verified Performance', desc: 'Every strategy is audited. Live returns, real Sharpe ratios, transparent drawdowns.', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', color: 'var(--mint)' },
              { title: 'Self-Custody', desc: 'Your funds stay on your exchange. We never hold your assets. You control everything.', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z', color: 'var(--blue)' },
              { title: 'Institutional Grade', desc: 'Access AI trading strategies that outperform most hedge funds. Simple onboarding.', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6', color: 'var(--orange)' },
            ].map((item, i) => (
              <div key={i} style={{ 
                padding: '2rem', borderRadius: 16, 
                background: 'var(--bg2)', border: '1px solid var(--border)',
                textAlign: 'center',
              }}>
                <div style={{ 
                  width: 64, height: 64, borderRadius: 16, 
                  background: `${item.color}15`, border: `1px solid ${item.color}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 1.25rem',
                }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={item.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d={item.icon} />
                  </svg>
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--white)' }}>{item.title}</h3>
                <p style={{ fontSize: '.85rem', color: 'var(--muted)', lineHeight: 1.5 }}>{item.desc}</p>
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/agents" className="btn-primary" style={{ fontSize: '1rem', padding: '0.9rem 2rem' }}>
              Browse Agents
            </Link>
            <Link href="/signup" className="btn-secondary" style={{ fontSize: '1rem', padding: '0.9rem 2rem' }}>
              Create Account
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        padding: '1.5rem 2rem 1rem', borderTop: '1px solid var(--border)',
        background: 'var(--bg2)',
      }}>
        {/* Trust disclosure ribbon */}
        <div style={{ 
          maxWidth: 1400, margin: '0 auto 1rem', padding: '0.75rem 1rem', 
          borderRadius: 10, background: 'var(--bg3)', border: '1px solid var(--border)',
          fontSize: '.7rem', color: 'var(--faint)', lineHeight: 1.6,
        }}>
          <strong style={{ color: 'var(--muted)' }}>Disclaimer:</strong> ASE provides tools, analytics, and strategy information. It does not guarantee returns. Investing and digital asset trading involve risk. Backtested results are hypothetical unless otherwise stated.
        </div>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem' }}>
          {/* Column 1 - Brand */}
          <div>
            <div style={{ marginBottom: '1rem' }}>
              <Logo size="small" showLink={false} />
            </div>
            <p style={{ fontSize: '.75rem', color: 'var(--text)', lineHeight: 1.6, marginBottom: '1rem' }}>
              Platform for discovering, evaluating, and monitoring algorithmic trading strategies.
            </p>
            <p style={{ fontSize: '.68rem', color: 'var(--faint)' }}>
              &copy; 2026 Agent Securities Exchange. All rights reserved.
            </p>
          </div>

          {/* Column 2 - Platform */}
          <div>
            <h4 style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--ivory)', marginBottom: '1rem', letterSpacing: '.08em', textTransform: 'uppercase' }}>Platform</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
              {[
                { label: 'Marketplace', href: '/agents' },
                { label: 'The Lab', href: '/dashboard/backtest' },
                { label: 'Builders', href: '/builders' },
                { label: 'Docs', href: '/legal/about' },
                { label: 'Security', href: '/legal/security', highlight: true },
                { label: 'Status', href: '#', highlight: true },
              ].map(link => (
                <Link key={link.label} href={link.href} style={{ fontSize: '.82rem', color: link.highlight ? 'var(--mint)' : 'var(--muted)', transition: 'color .2s' }}
                  onMouseEnter={e => (e.target as HTMLElement).style.color = 'var(--white)'}
                  onMouseLeave={e => (e.target as HTMLElement).style.color = link.highlight ? 'var(--mint)' : 'var(--muted)'}
                >{link.label}</Link>
              ))}
            </div>
          </div>

          {/* Column 3 - Legal */}
          <div>
            <h4 style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--ivory)', marginBottom: '1rem', letterSpacing: '.08em', textTransform: 'uppercase' }}>Legal</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
              {[
                { label: 'Terms of Service', href: '/legal/terms' },
                { label: 'Privacy Policy', href: '/legal/privacy' },
                { label: 'Risk Disclosures', href: '/legal/securities' },
                { label: 'Methodology', href: '/legal/methodology' },
              ].map(link => (
                <Link key={link.label} href={link.href} style={{ fontSize: '.82rem', color: 'var(--muted)', transition: 'color .2s' }}
                  onMouseEnter={e => (e.target as HTMLElement).style.color = 'var(--white)'}
                  onMouseLeave={e => (e.target as HTMLElement).style.color = 'var(--muted)'}
                >{link.label}</Link>
              ))}
            </div>
          </div>
        </div>
        
        {/* Bottom bar */}
        <div style={{ 
          maxWidth: 1400, margin: '2rem auto 0', paddingTop: '1.5rem', 
          borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: '1rem',
        }}>
          <div style={{ fontSize: '.68rem', color: 'var(--faint)' }}>
            <span>© 2026 Agent Securities Exchange. All rights reserved.</span>
            <span style={{ marginLeft: '1rem' }}> jurisdiction: global</span>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            {['X', 'LinkedIn', 'GitHub'].map(social => (
              <a key={social} href="#" style={{ fontSize: '.68rem', color: 'var(--muted)', fontFamily: 'var(--font-mono)', letterSpacing: '.05em' }}>
                {social}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}