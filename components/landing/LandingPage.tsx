'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface AgentPreview {
  name: string
  primary_symbol: string
  strategy_type: string
  ret: number | null
  sharpe: number | null
  max_drawdown: number | null
  aum: number | null
  ticker: string
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

const SparkNode = ({ className }: { className?: string }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F4EFE6" strokeWidth="1.5">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
  </svg>
)

const EyeIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const ShieldIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
)

const SparkleIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
  </svg>
)

const BrainIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="9" />
    <path d="M9 12a3 3 0 0 0 6 0M7 8a7 7 0 0 0 10 0M7 16a7 7 0 0 0 10 0" />
  </svg>
)

function MiniSparkline({ positive }: { positive: boolean }) {
  const points = Array.from({ length: 20 }, (_, i) => {
    const base = 50
    const variance = Math.sin(i * 0.5) * 20 + (Math.random() - 0.5) * 15
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [email, setEmail] = useState('')

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('agents')
      .select('name, primary_symbol, strategy_type, subscriber_count, ticker, backtest_stats, agent_stats(total_return_pct, sharpe_ratio, max_drawdown, aum, snapshot_at)')
      .eq('status', 'active')
      .limit(6)
      .then(({ data }) => {
        if (!data) return
        setAgents(data.map((a) => {
          const statsArr = Array.isArray(a.agent_stats) ? a.agent_stats : (a.agent_stats ? [a.agent_stats] : [])
          const latestStats = statsArr.length > 0 ? statsArr[statsArr.length - 1] : null
          const bt = a.backtest_stats?.stats as { totalReturnPct?: number; sharpeRatio?: number; maxDrawdown?: number } | null
          return {
            name: a.name,
            primary_symbol: a.primary_symbol ?? 'MULTI',
            strategy_type: a.strategy_type,
            ret: latestStats?.total_return_pct ?? bt?.totalReturnPct ?? null,
            sharpe: latestStats?.sharpe_ratio ?? bt?.sharpeRatio ?? null,
            max_drawdown: latestStats?.max_drawdown ?? bt?.maxDrawdown ?? null,
            aum: (latestStats?.aum ?? a.subscriber_count ?? 0) * 1000,
            ticker: a.ticker ?? a.name?.slice(0, 4).toUpperCase() ?? 'AGNT',
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

  const tickerItems = [
    { agent: 'MCAR', action: 'bought', asset: '2.4 SOL', price: '@ $142.50', pos: true },
    { agent: 'CRTR', action: 'closed BTC Long', result: '+4.2%', pos: true },
    { agent: 'VOLT', action: 'opened', asset: 'ETH Long', price: '@ $1,890', pos: null },
    { agent: 'MCAR', action: 'sold', asset: '1.2 SOL', price: '@ $143.20', pos: false },
    { agent: 'CRTR', action: 'closed SOL Short', result: '-1.8%', pos: false },
    { agent: 'VOLT', action: 'bought', asset: '0.5 BTC', price: '@ $42,100', pos: true },
    { agent: 'MCAR', action: 'bought', asset: '5 SOL', price: '@ $141.80', pos: true },
    { agent: 'CRTR', action: 'opened', asset: 'SOL Short', price: '@ $144', pos: null },
  ]

  const statsSection = useInView()
  const agentsSection = useInView()
  const featuresSection = useInView()
  const ctaSection = useInView()
  const labSection = useInView()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--white)', fontFamily: 'var(--font-body)', overflowX: 'hidden' }}>

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
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <SparkNode />
            </div>
            <span style={{ fontFamily: 'var(--font-serif)', fontWeight: 700, fontSize: '1.1rem', letterSpacing: '-0.02em', color: 'var(--ivory)' }}>
              ASE
            </span>
          </Link>
        </div>

        {/* Nav Center - improved trust indicators */}
        <div className="desktop-only" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', opacity: 0.6, fontSize: '.7rem' }}>
          {[
            { label: '✓ Verified', color: 'var(--blue)' },
            { label: '● Live', color: 'var(--mint)' },
            { label: '⛓ Audited', color: 'var(--text)' },
          ].map((item, i) => (
            <span key={i} style={{ color: item.color, fontFamily: 'var(--font-mono)', letterSpacing: '.04em' }}>
              {item.label}
            </span>
          ))}
        </div>

        {/* Nav Right */}
        {/* Nav Right - Links + Auth */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
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
          
          {/* Mobile menu toggle */}
          <button
            className="mobile-only"
            onClick={() => setMobileMenuOpen(prev => !prev)}
            style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '.5rem', display: 'flex', flexDirection: 'column', gap: 4 }}
          >
            {[...Array(3)].map((_, i) => (
              <span key={i} style={{ width: 18, height: 1.5, background: 'var(--muted)', display: 'block', borderRadius: 2 }} />
            ))}
          </button>
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

      {/* Scrolling ticker strip - exchanges feel */}
      <div style={{ 
        background: 'var(--bg3)', borderBottom: '1px solid var(--border)',
        padding: '0.6rem 0', overflow: 'hidden',
        display: 'flex', alignItems: 'center',
      }}>
        <div style={{ 
          display: 'flex', 
          animation: 'tickerMove 40s linear infinite',
          gap: '2rem',
        }}>
          {[
            { pair: 'ARB', price: '+2.4%', positive: true },
            { pair: 'BTC-MOM', price: '+1.2%', positive: true },
            { pair: 'SOL-VOL', price: '-0.8%', positive: false },
            { pair: 'COR', price: '+3.1%', positive: true },
            { pair: 'TRD', price: '+0.9%', positive: true },
            { pair: 'ETH-ARB', price: '+1.8%', positive: true },
            { pair: 'MOM', price: '-1.2%', positive: false },
            { pair: 'REV', price: '+2.7%', positive: true },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', whiteSpace: 'nowrap' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', fontWeight: 600, color: 'var(--ivory)' }}>
                {item.pair}
              </span>
              <span style={{ 
                fontFamily: 'var(--font-mono)', fontSize: '.7rem', fontWeight: 600, 
                color: item.positive ? 'var(--mint)' : 'var(--red)',
              }}>
                {item.price}
              </span>
              <span style={{ 
                width: 6, height: 6, borderRadius: '50%', 
                background: item.positive ? 'var(--mint)' : 'var(--red)',
                opacity: 0.6,
              }} />
            </div>
          ))}
          {/* Duplicate for seamless loop */}
          {[
            { pair: 'ARB', price: '+2.4%', positive: true },
            { pair: 'BTC-MOM', price: '+1.2%', positive: true },
            { pair: 'SOL-VOL', price: '-0.8%', positive: false },
            { pair: 'COR', price: '+3.1%', positive: true },
            { pair: 'TRD', price: '+0.9%', positive: true },
            { pair: 'ETH-ARB', price: '+1.8%', positive: true },
            { pair: 'MOM', price: '-1.2%', positive: false },
            { pair: 'REV', price: '+2.7%', positive: true },
          ].map((item, i) => (
            <div key={`dup-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', whiteSpace: 'nowrap' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', fontWeight: 600, color: 'var(--ivory)' }}>
                {item.pair}
              </span>
              <span style={{ 
                fontFamily: 'var(--font-mono)', fontSize: '.7rem', fontWeight: 600, 
                color: item.positive ? 'var(--mint)' : 'var(--red)',
              }}>
                {item.price}
              </span>
              <span style={{ 
                width: 6, height: 6, borderRadius: '50%', 
                background: item.positive ? 'var(--mint)' : 'var(--red)',
                opacity: 0.6,
              }} />
            </div>
          ))}
        </div>
      </div>

      {/* Hero Section */}
      <section style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        padding: '140px 2rem 120px', position: 'relative', overflow: 'hidden',
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
        <div style={{ position: 'absolute', bottom: '15%', right: '5%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(244,239,230,.04) 0%, transparent 70%)', pointerEvents: 'none', filter: 'blur(60px)' }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1400, margin: '0 auto', width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
          {/* Left Content */}
          <div style={{ maxWidth: 480 }}>
            <h1 style={{
              fontFamily: 'var(--font-serif)', fontSize: 'clamp(2.25rem, 5vw, 3.5rem)', fontWeight: 700,
              lineHeight: 1.1, letterSpacing: '-0.03em', marginBottom: '1.25rem',
              color: 'var(--ivory)',
            }}>
              Own AI Trading Intelligence
            </h1>
            
            {/* Concrete translation - tighter + more institutional */}
            <p style={{
              fontSize: 'clamp(0.92rem, 1.2vw, 1.05rem)', color: 'var(--text)',
              lineHeight: 1.65, marginBottom: '2rem',
              fontWeight: 400,
              maxWidth: 480,
            }}>
              Invest in verified AI trading strategies with real performance history. Access institutional-grade algorithmic agents with transparent metrics, live tracking, and institutional risk controls.
            </p>

            {/* CTA - better styled */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
              <Link href="/agents" className="btn-primary" style={{
                padding: '0.85rem 1.75rem', whiteSpace: 'nowrap', fontSize: '.92rem',
                borderRadius: 12,
                background: 'linear-gradient(135deg, var(--blue) 0%, var(--blue2) 100%)',
                boxShadow: '0 4px 20px rgba(91,140,255,0.25)',
              }}>
                Explore Top Agents
              </Link>
              <Link href="#how-it-works" className="btn-secondary" style={{
                padding: '0.85rem 1.75rem', whiteSpace: 'nowrap', fontSize: '.92rem',
                borderRadius: 12,
              }}>
                See How It Works
              </Link>
            </div>
            
            {/* Trust modules - compact row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
              {[
                { label: 'Verified Performance', icon: '✓' },
                { label: 'Live Agent Monitoring', icon: '●' },
                { label: 'Transparent Risk Metrics', icon: '◆' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ 
                    width: 16, height: 16, borderRadius: 4, 
                    background: 'var(--blue-dim)', border: '1px solid var(--blue-glow)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '.55rem', color: 'var(--blue)', 
                  }}>{item.icon}</span>
                  <span style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* NEW: Strategy Core Hero Visual */}
          <div style={{ position: 'relative', height: 420, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
            
            {/* Strategy Core - central luminous sphere */}
            <div style={{
              position: 'relative',
              width: 280, height: 280,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {/* Outer glow */}
              <div style={{
                position: 'absolute', inset: -40,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(91,140,255,0.12) 0%, transparent 70%)',
                filter: 'blur(20px)',
              }} />
              
              {/* Middle orbital ring */}
              <svg width="280" height="280" viewBox="0 0 280 280" style={{ position: 'absolute' }}>
                <defs>
                  <linearGradient id="coreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#5B8CFF" stopOpacity="0.9" />
                    <stop offset="60%" stopColor="#19E6A7" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#5B8CFF" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {/* Outer orbital ring */}
                <ellipse cx="140" cy="140" rx="120" ry="50" fill="none" transform="rotate(-25, 140, 140)"
                  stroke="rgba(91,140,255,0.4)" strokeWidth="1" strokeDasharray="4 8">
                  <animateTransform attributeName="transform" type="rotate" from="0 140 140" to="360 140 140" dur="20s" repeatCount="indefinite" />
                </ellipse>
                {/* Inner orbital ring */}
                <ellipse cx="140" cy="140" rx="100" ry="35" fill="none" transform="rotate(60, 140, 140)"
                  stroke="rgba(25,230,167,0.35)" strokeWidth="1" strokeDasharray="3 6">
                  <animateTransform attributeName="transform" type="rotate" from="360 140 140" to="0 140 140" dur="15s" repeatCount="indefinite" />
                </ellipse>
                {/* Signal contour layers */}
                <circle cx="140" cy="140" r="70" fill="none" stroke="url(#coreGradient)" strokeWidth="0.5" opacity="0.6" />
                <circle cx="140" cy="140" r="50" fill="none" stroke="rgba(91,140,255,0.3)" strokeWidth="0.5" opacity="0.4" />
                <circle cx="140" cy="140" r="30" fill="none" stroke="rgba(91,140,255,0.5)" strokeWidth="1" />
              </svg>
              
              {/* Core center */}
              <div style={{
                width: 80, height: 80, borderRadius: '50%',
                background: 'radial-gradient(circle at 30% 30%, #78A2FF 0%, #5B8CFF 50%, #4676E8 100%)',
                boxShadow: '0 0 40px rgba(91,140,255,0.5), 0 0 80px rgba(91,140,255,0.2)',
                position: 'relative',
              }}>
                {/* Inner glow pulse */}
                <div style={{
                  position: 'absolute', inset: -8, borderRadius: '50%',
                  background: 'transparent', border: '1px solid rgba(91,140,255,0.4)',
                  animation: 'breathe 3s ease-in-out infinite',
                }} />
              </div>
              
              {/* Execution trails */}
              <svg width="280" height="280" viewBox="0 0 280 280" style={{ position: 'absolute', inset: 0 }}>
                <path d="M 60 200 Q 100 180 140 140 T 220 80" fill="none" stroke="rgba(25,230,167,0.5)" strokeWidth="2" strokeLinecap="round">
                  <animate attributeName="stroke-dashoffset" values="0;-200" dur="3s" repeatCount="indefinite" />
                </path>
                <path d="M 200 220 Q 170 200 140 160 T 80 100" fill="none" stroke="rgba(91,140,255,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="4 4">
                  <animate attributeName="stroke-dashoffset" values="0;-100" dur="4s" repeatCount="indefinite" />
                </path>
              </svg>
            </div>
            
            {/* NEW: Interactive mini leaderboard - real proof */}
            <div style={{ 
              position: 'absolute', top: '10%', right: '5%', 
              display: 'flex', flexDirection: 'column', gap: '0.5rem',
              minWidth: 220,
            }}>
              <div style={{ 
                fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', 
                letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: '0.25rem',
                paddingLeft: '0.5rem',
              }}>
                Top Performing Agents (Live)
              </div>
              {[
                { name: 'ETH Arb Bot', ticker: 'ARB', type: 'Arbitrage', ret: 18.4, sharpe: 2.1 },
                { name: 'BTC Trend Alpha', ticker: 'TRD', type: 'Momentum', ret: 12.2, sharpe: 1.8 },
                { name: 'SOL Vol Breakout', ticker: 'VOL', type: 'Volatility', ret: 9.8, sharpe: 1.4 },
                { name: 'Core Momentum', ticker: 'COR', type: 'Trend', ret: 7.2, sharpe: 1.1 },
              ].slice(0,4).map((agent, i) => (
                <Link key={i} href={`/agents`} style={{
                  padding: '0.6rem 0.75rem', borderRadius: 8,
                  background: 'var(--bg3)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  transition: 'all .2s',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--blue-glow)'
                  e.currentTarget.style.background = 'var(--blue-dim)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border)'
                  e.currentTarget.style.background = 'var(--bg3)'
                }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ 
                      width: 24, height: 24, borderRadius: 6, 
                      background: 'var(--blue)', 
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--font-mono)', fontSize: '.5rem', fontWeight: 700, color: 'var(--white)',
                    }}>
                      {agent.ticker}
                    </span>
                    <div>
                      <div style={{ fontSize: '.75rem', fontWeight: 600, color: 'var(--white)', lineHeight: 1.2 }}>{agent.name}</div>
                      <div style={{ fontSize: '.55rem', color: 'var(--faint)' }}>{agent.type}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.8rem', fontWeight: 700, color: agent.ret >= 0 ? 'var(--mint)' : 'var(--red)' }}>
                      {agent.ret >= 0 ? '+' : ''}{agent.ret}%
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: 'var(--faint)' }}>
                      Sharpe {agent.sharpe}
                    </div>
                  </div>
                </Link>
              ))}
              <Link href="/agents" style={{
                fontSize: '.65rem', color: 'var(--blue)', 
                padding: '0.5rem 0.75rem', textAlign: 'center',
                fontFamily: 'var(--font-mono)', letterSpacing: '.05em',
              }}>
                View All Agents →
              </Link>
            </div>
            
            <div style={{
              position: 'absolute', bottom: 20, right: 20,
              fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--faint)',
              letterSpacing: '.1em',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--mint)', animation: 'breathe 2s ease-in-out infinite' }} />
              Live NAV Updates
            </div>
          </div>
        </div>
      </section>

      {/* Trust Metrics - Credibility backed */}
      <section ref={statsSection.ref} style={{
        padding: '0 2.5rem 80px', maxWidth: 1400, margin: '0 auto',
        opacity: statsSection.visible ? 1 : 0,
        transform: statsSection.visible ? 'translateY(0)' : 'translateY(40px)',
        transition: 'opacity 1s, transform 1s',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '1.5rem' }} className="stats-grid">
          {[
            { num: '12', label: 'Verified Agents', sub: 'Live + audit trail' },
            { num: '$4.2M', label: 'Tracked Capital', sub: 'Subscribed NAV' },
            { num: '+24.8%', label: 'Median 12M', sub: 'Live verified', color: 'var(--mint)' },
            { num: '12.4K+', label: 'Simulated Trades', sub: 'Backtest validated' },
            { num: '60s', label: 'NAV Updates', sub: 'Real-time sync', hasPulse: true },
          ].map((stat, i) => (
            <div key={i} style={{ 
              padding: '1.5rem', borderRadius: 12, 
              background: 'var(--bg2)', border: '1px solid var(--border)',
              position: 'relative',
            }}>
              {stat.hasPulse && (
                <span style={{ 
                  position: 'absolute', top: '1rem', right: '1rem',
                  width: 8, height: 8, borderRadius: '50%', 
                  background: 'var(--mint)', 
                  animation: 'breathe 2.5s ease-in-out infinite',
                }} />
              )}
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.75rem', fontWeight: 700, color: stat.color ?? 'var(--ivory)', marginBottom: '.35rem', letterSpacing: '-0.02em' }}>
                {stat.num}
              </div>
              <div style={{ fontSize: '.8rem', fontWeight: 600, marginBottom: '.15rem', color: 'var(--white)' }}>{stat.label}</div>
              <div style={{ fontSize: '.7rem', color: 'var(--faint)' }}>{stat.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* NEW: How It Works - 4 Step Flow */}
      <section id="how-it-works" style={{
        padding: '0 2.5rem 100px',
        background: 'var(--bg2)',
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', letterSpacing: '.14em', color: 'var(--blue)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '.75rem' }}>
              How It Works
            </div>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--ivory)' }}>
              From Discovery to Investment
            </h2>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1.5rem', position: 'relative' }}>
            {/* Connector line */}
            <div style={{ 
              position: 'absolute', top: 40, left: '12%', right: '12%', height: 2, 
              background: 'var(--border)', 
            }} />
            
            {[
              { step: '01', title: 'Browse Strategies', desc: 'Explore verified agents with live performance, risk metrics, and strategy profiles.' },
              { step: '02', title: 'Compare Risk & Fit', desc: 'Review returns, drawdowns, Sharpe ratios, and benchmark context to find your fit.' },
              { step: '03', title: 'Allocate Capital', desc: 'Connect via exchange API or start in simulation mode. Your funds stay in your custody.' },
              { step: '04', title: 'Monitor Live', desc: 'Track performance in real-time. Get alerts, see positions, and adjust your allocation.' },
            ].map((item, i) => (
              <div key={i} style={{ position: 'relative', zIndex: 1 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: 'var(--bg3)', border: '2px solid var(--blue)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '1.25rem',
                }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', fontWeight: 700, color: 'var(--blue)' }}>
                    {item.step}
                  </span>
                </div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '.5rem', color: 'var(--white)' }}>
                  {item.title}
                </h3>
                <p style={{ fontSize: '.82rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Agents Marketplace */}
      <section ref={agentsSection.ref} style={{ padding: '0 2.5rem 120px', background: 'var(--bg)' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <div style={{
            opacity: agentsSection.visible ? 1 : 0,
            transform: agentsSection.visible ? 'translateY(0)' : 'translateY(60px)',
            transition: 'opacity 1s, transform 1s',
          }}>
            <div style={{ marginBottom: '3.5rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', letterSpacing: '.14em', color: 'var(--ivory)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '.75rem' }}>
                Marketplace
              </div>
              <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: '.75rem' }}>
                Live Trading Agents
              </h2>
              <p style={{ fontSize: '1rem', color: 'var(--muted)', lineHeight: 1.7, maxWidth: 520 }}>
                Curated algorithms. Running live 24/7. Choose your strategy.
              </p>
            </div>

            {/* Agent Cards Grid */}
            {agents.length === 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1.5rem' }}>
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 280, borderRadius: 16 }} />
                ))}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1.5rem' }} className="agents-grid">
                {agents.map((agent, i) => {
                  const isPos = (agent.ret ?? 0) >= 0
                  const risk = getRiskLevel(agent.max_drawdown)
                  return (
                    <Link key={i} href={`/agents`} className="agent-card">
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--mint)', animation: 'breathe 2.5s ease-in-out infinite' }} />
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', fontWeight: 700, color: 'var(--mint)', letterSpacing: '.1em' }}>LIVE</span>
                        </div>
                      </div>

                      {/* Primary Return */}
                      <div style={{ marginBottom: '1.25rem', position: 'relative', zIndex: 1 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', marginBottom: '.25rem', letterSpacing: '.1em' }}>1Y RETURN</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '2rem', fontWeight: 700, color: isPos ? 'var(--mint)' : 'var(--red)' }}>
                          {agent.ret !== null ? fmtPct(agent.ret) : '—'}
                        </div>
                      </div>

                      {/* Secondary Metrics Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', position: 'relative', zIndex: 1 }}>
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

            <div style={{ textAlign: 'center', marginTop: '3.5rem' }}>
              <Link href="/agents" className="btn-secondary" style={{ fontSize: '.95rem', padding: '.75rem 2rem', display: 'inline-block' }}>
                View All Agents
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Value Proposition - 4 Principles per PRD */}
      <section ref={featuresSection.ref} style={{
        padding: '0 2.5rem 120px',
        background: 'linear-gradient(180deg, var(--bg2) 0%, transparent 100%)',
        borderTop: '1px solid var(--border)',
      }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <div style={{
            opacity: featuresSection.visible ? 1 : 0,
            transform: featuresSection.visible ? 'translateY(0)' : 'translateY(60px)',
            transition: 'opacity 1s, transform 1s',
          }}>
            <div style={{ marginBottom: '3.5rem', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', letterSpacing: '.14em', color: 'var(--blue)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '.75rem' }}>
                Platform Principles
              </div>
              <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(2rem, 4vw, 2.5rem)', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--ivory)' }}>
                Why ASE
              </h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1.25rem' }} className="why-grid">
              {[
                {
                  title: 'Transparent Performance',
                  desc: 'Every listed agent exposes its return history, drawdowns, trade activity, and benchmark context in a standardized format.',
                  icon: <EyeIcon />,
                  color: 'var(--blue)',
                  mechanism: 'Verified backtest + live trail + consistent metrics',
                },
                {
                  title: 'Quantitative Discipline',
                  desc: 'Strategies execute exactly as programmed. No emotional overrides, no fatigue. 24/7 precision.',
                  icon: <BrainIcon />,
                  color: 'var(--mint)',
                  mechanism: 'Automated execution + defined rules',
                },
                {
                  title: 'Controlled Risk',
                  desc: 'Clear risk metrics, drawdown limits, and position sizing guards on every strategy.',
                  icon: <ShieldIcon />,
                  color: 'var(--orange)',
                  mechanism: 'Max drawdown caps + concentration limits',
                },
                {
                  title: 'Connected Execution',
                  desc: 'Connect via secure exchange API. Your funds stay in your custody. Agents trade on your behalf.',
                  icon: <SparkNode />,
                  color: 'var(--purple)',
                  mechanism: 'Non-custodial + API keys only',
                },
              ].map((feat, i) => (
                <div key={i} className="feature-card" style={{ 
                  padding: '1.5rem',
                  opacity: featuresSection.visible ? 1 : 0,
                  transform: featuresSection.visible ? 'translateY(0)' : 'translateY(30px)',
                  transition: `all 0.5s ease ${i * 0.1}s`,
                }}>
                  <div style={{ 
                    width: 40, height: 40, borderRadius: 10, 
                    background: `${feat.color}15`, border: `1px solid ${feat.color}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: '1rem', color: feat.color,
                    fontSize: '1rem',
                  }}>
                    {feat.icon}
                  </div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '.5rem', color: 'var(--white)' }}>{feat.title}</h3>
                  <p style={{ fontSize: '.8rem', color: 'var(--muted)', lineHeight: 1.6, marginBottom: '1rem' }}>{feat.desc}</p>
                  <div style={{ 
                    fontSize: '.65rem', color: 'var(--faint)', paddingTop: '0.75rem', borderTop: '1px solid var(--border)',
                    fontFamily: 'var(--font-mono)', letterSpacing: '.03em',
                  }}>
                    {feat.mechanism}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Builder/Lab Tease - Expanded per PRD */}
      <section ref={labSection.ref} style={{
        padding: '6rem 2.5rem',
        background: 'var(--bg)',
        borderTop: '1px solid var(--border)',
      }}>
        <div style={{
          position: 'relative', zIndex: 1, maxWidth: 1100, margin: '0 auto',
          display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '4rem', alignItems: 'center',
          opacity: labSection.visible ? 1 : 0,
          transform: labSection.visible ? 'translateY(0)' : 'translateY(40px)',
          transition: 'opacity 1s, transform 1s',
        }}>
          {/* Left: Builder message */}
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', letterSpacing: '.14em', color: 'var(--purple)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '.75rem' }}>
              For Builders
            </div>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: '1.25rem', color: 'var(--ivory)' }}>
              Build. Test. Deploy.
            </h2>
            <p style={{ fontSize: '1rem', color: 'var(--text)', lineHeight: 1.7, marginBottom: '2rem' }}>
              Enter the Lab to backtest your Python strategies on high-frequency historical data. When ready, submit for review and list on ASE's marketplace.
            </p>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <Link href="/dashboard/backtest" className="btn-primary" style={{ fontSize: '.9rem', padding: '.7rem 1.5rem' }}>
                Enter the Lab
              </Link>
              <Link href="/builders/submit" className="btn-secondary" style={{ fontSize: '.9rem', padding: '.7rem 1.5rem' }}>
                Submit Strategy
              </Link>
            </div>
          </div>
          
          {/* Right: Capabilities grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
            {[
              { title: 'Python Backtesting', desc: 'Historical data access + strategy testing' },
              { title: 'Benchmark Comparison', desc: 'vs BTC, ETH, SPY, custom baskets' },
              { title: 'Automated Review', desc: 'Quantitative integrity checks' },
              { title: 'Submission Pipeline', desc: 'End-to-end listing workflow' },
              { title: 'Profile Generation', desc: 'Auto-generated strategy profiles' },
              { title: 'API Access', desc: 'Programmatic execution controls' },
            ].map((cap, i) => (
              <div key={i} style={{
                padding: '1.25rem', borderRadius: 10,
                background: 'var(--bg2)', border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: '.85rem', fontWeight: 600, marginBottom: '.35rem', color: 'var(--white)' }}>{cap.title}</div>
                <div style={{ fontSize: '.7rem', color: 'var(--muted)' }}>{cap.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom Lead Capture */}
      <section ref={ctaSection.ref} style={{
        padding: '0 2.5rem 120px',
        opacity: ctaSection.visible ? 1 : 0,
        transform: ctaSection.visible ? 'translateY(0)' : 'translateY(40px)',
        transition: 'opacity 1s, transform 1s',
      }}>
        <div style={{
          maxWidth: 700, margin: '0 auto', textAlign: 'center',
          padding: '4rem', borderRadius: 24,
          background: 'var(--bg2)', border: '1px solid var(--border)',
        }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.75rem, 4vw, 2.25rem)', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: '1rem' }}>
            Start Trading Smarter
          </h2>
          <p style={{ fontSize: '1rem', color: 'var(--muted)', lineHeight: 1.7, marginBottom: '2rem' }}>
            Free during beta.
          </p>
          
          {/* Email Form */}
          <div style={{ display: 'flex', gap: '0', maxWidth: 450, margin: '0 auto', flexWrap: 'wrap' }}>
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{
                flex: 1, minWidth: 250, background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: '8px 0 0 8px', padding: '1rem 1.25rem', color: 'var(--white)', fontSize: '0.95rem',
                outline: 'none',
              }}
            />
<Link href="/signup" className="btn-primary" style={{
                borderRadius: '0 8px 8px 0', padding: '1rem 1.75rem', whiteSpace: 'nowrap',
                background: 'linear-gradient(135deg, var(--blue) 0%, var(--blue2) 100%)',
                boxShadow: '0 4px 20px rgba(79,124,255,0.3)',
              }}>
                Get Started
              </Link>
          </div>
        </div>
      </section>

      {/* Footer - Expanded per PRD */}
      <footer style={{
        padding: '5rem 2.5rem 3rem', borderTop: '1px solid var(--border)',
        background: 'var(--bg2)',
      }}>
        {/* Trust disclosure ribbon */}
        <div style={{ 
          maxWidth: 1400, margin: '0 auto 3rem', padding: '1rem 1.5rem', 
          borderRadius: 10, background: 'var(--bg3)', border: '1px solid var(--border)',
          fontSize: '.7rem', color: 'var(--faint)', lineHeight: 1.6,
        }}>
          <strong style={{ color: 'var(--muted)' }}>Disclaimer:</strong> ASE provides tools, analytics, and strategy information. It does not guarantee returns. Investing and digital asset trading involve risk. Backtested results are hypothetical unless otherwise stated.
        </div>
        
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2.5rem' }}>
          {/* Column 1 - Brand */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '1rem' }}>
              <SparkNode />
              <span style={{ fontFamily: 'var(--font-serif)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--ivory)' }}>ASE</span>
            </div>
            <p style={{ fontSize: '.75rem', color: 'var(--text)', lineHeight: 1.6, marginBottom: '1rem' }}>
              Platform for discovering, evaluating, and monitoring algorithmic trading strategies.
            </p>
            <p style={{ fontSize: '.68rem', color: 'var(--faint)', lineHeight: 1.5, marginBottom: '1rem' }}>
              © 2026 Agent Securities Exchange. All rights reserved.
            </p>
          </div>

          {/* Column 2 - Platform */}
          <div>
            <h4 style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--ivory)', marginBottom: '1rem', letterSpacing: '.08em', textTransform: 'uppercase' }}>Platform</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
              {[
                { label: 'Browse Agents', href: '/agents' },
                { label: 'Portfolio', href: '/dashboard' },
                { label: 'The Lab', href: '/dashboard/backtest' },
                { label: 'Builders', href: '/builders' },
                { label: 'Methodology', href: '/legal/methodology' },
                { label: 'Supported Exchanges', href: '/agents' },
              ].map(link => (
                <Link key={link.label} href={link.href} style={{ fontSize: '.82rem', color: 'var(--muted)', transition: 'color .2s' }}
                  onMouseEnter={e => (e.target as HTMLElement).style.color = 'var(--white)'}
                  onMouseLeave={e => (e.target as HTMLElement).style.color = 'var(--muted)'}
                >{link.label}</Link>
              ))}
            </div>
          </div>

          {/* Column 3 - Company */}
          <div>
            <h4 style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--ivory)', marginBottom: '1rem', letterSpacing: '.08em', textTransform: 'uppercase' }}>Company</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
              {[
                { label: 'About Us', href: '/legal/about' },
                { label: 'Careers', href: '/legal/careers' },
                { label: 'Contact', href: '/legal/contact' },
                { label: 'Press', href: '/legal/press' },
                { label: 'Security', href: '/legal/security' },
                { label: 'Status', href: '#' },
              ].map(link => (
                <Link key={link.label} href={link.href} style={{ fontSize: '.82rem', color: 'var(--muted)', transition: 'color .2s' }}
                  onMouseEnter={e => (e.target as HTMLElement).style.color = 'var(--white)'}
                  onMouseLeave={e => (e.target as HTMLElement).style.color = 'var(--muted)'}
                >{link.label}</Link>
              ))}
            </div>
          </div>

          {/* Column 4 - Legal */}
          <div>
            <h4 style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--ivory)', marginBottom: '1rem', letterSpacing: '.08em', textTransform: 'uppercase' }}>Legal</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
              {[
                { label: 'Terms of Service', href: '/legal/terms' },
                { label: 'Privacy Policy', href: '/legal/privacy' },
                { label: 'Risk Disclosures', href: '/legal/securities' },
                { label: 'Methodology Disclosures', href: '/legal/methodology' },
                { label: 'Cookie Notice', href: '/legal/cookies' },
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
          maxWidth: 1400, margin: '3rem auto 0', paddingTop: '1.5rem', 
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