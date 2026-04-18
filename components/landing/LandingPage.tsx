'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import PublicNav from '@/components/ui/PublicNav'

interface AgentPreview {
  name: string
  slug: string
  primary_symbol: string
  strategy_type: string
  ret: number | null
  sharpe: number | null
  max_drawdown: number | null
  ticker: string
  isLive: boolean
}

function useInView(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect() } }, { threshold })
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return { ref: ref as React.RefObject<HTMLDivElement>, visible }
}

function MiniChart({ positive, height = 48 }: { positive: boolean; height?: number }) {
  const pts = Array.from({ length: 22 }, (_, i) => {
    const trend = positive ? i * 1.4 : -i * 0.9
    const noise = Math.sin(i * 0.7) * 7 + Math.cos(i * 1.3) * 4
    const y = (height * 0.6) - trend * 0.55 - noise
    return `${(i / 21) * 100},${Math.max(4, Math.min(height - 4, y))}`
  }).join(' ')
  const color = positive ? '#16C784' : '#E45867'
  const id = `g-${positive ? 'pos' : 'neg'}-${height}`
  return (
    <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${pts} 100,${height}`} fill={`url(#${id})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  )
}

const TICKER_ITEMS = [
  { label: 'BTC/USD', value: '+18.4%', pos: true },
  { label: 'ETH/USD', value: '+12.1%', pos: true },
  { label: 'SOL/USD', value: '+31.8%', pos: true },
  { label: 'SPY', value: '+9.2%', pos: true },
  { label: 'QQQ', value: '+14.7%', pos: true },
  { label: 'AAPL', value: '+7.3%', pos: true },
  { label: 'Agents live', value: '24', pos: true },
  { label: 'Avg Sharpe', value: '1.84', pos: true },
  { label: 'Win rate', value: '62%', pos: true },
]

function TickerBar() {
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS]
  return (
    <div style={{
      borderTop: '1px solid var(--border)',
      borderBottom: '1px solid var(--border)',
      background: 'rgba(11,23,40,0.6)',
      overflow: 'hidden',
      height: 38,
      display: 'flex',
      alignItems: 'center',
    }}>
      <div style={{
        display: 'flex',
        gap: 0,
        whiteSpace: 'nowrap',
        animation: 'drift 28s linear infinite',
        willChange: 'transform',
      }}>
        {items.map((item, i) => (
          <span key={i} style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0 1.5rem',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.68rem',
            borderRight: '1px solid var(--border)',
          }}>
            <span style={{ color: 'var(--faint)', letterSpacing: '0.06em' }}>{item.label}</span>
            <span style={{ color: item.pos ? 'var(--mint)' : 'var(--red)', fontWeight: 700 }}>{item.pos ? '+' : ''}{item.value}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

const FEATURES = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    title: 'Verified Performance',
    desc: 'Every agent\'s track record is fully audited. Live P&L, drawdowns, and Sharpe ratios — no marketing fluff.',
    color: 'var(--blue)',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: 'Your Keys, Your Capital',
    desc: 'Connect MetaMask or any EVM wallet. Your funds never leave your custody — agents execute via signed permissions.',
    color: 'var(--mint)',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
      </svg>
    ),
    title: 'Real-Time Monitoring',
    desc: 'Track every trade, NAV change, and signal in real time. Full visibility into what your agent is doing.',
    color: 'var(--blue2)',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
    title: 'Instant Allocation',
    desc: 'Browse the marketplace, review backtested results, and subscribe to strategies in seconds.',
    color: 'var(--orange)',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    ),
    title: 'Multi-Market Access',
    desc: 'Crypto, equities, DeFi protocols — access diverse strategies from one unified dashboard.',
    color: 'var(--purple)',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
    title: 'Build & Publish',
    desc: 'Got an edge? Publish your own strategy. Our quant lab gives you data, backtesting, and an audience.',
    color: 'var(--cyan)',
  },
]

const HOW_STEPS = [
  {
    n: '01',
    title: 'Connect your wallet',
    desc: 'Link MetaMask or any EVM wallet. No account required — your identity is your address.',
  },
  {
    n: '02',
    title: 'Browse verified agents',
    desc: 'Explore live performance metrics, backtests, and strategy logic before committing any capital.',
  },
  {
    n: '03',
    title: 'Subscribe & allocate',
    desc: 'Set your allocation limit. Agents execute autonomously within your defined risk parameters.',
  },
  {
    n: '04',
    title: 'Monitor in real time',
    desc: 'Track every trade and NAV update live. Revoke access anytime — you stay in control.',
  },
]

const DEMO_AGENTS = [
  { name: 'BTC Momentum Alpha', slug: 'btc-momentum', symbol: 'BTC-USD', type: 'Momentum', ret: 18.4, sharpe: 1.92, dd: -11.2, grade: 'A' },
  { name: 'ETH Mean Reversion', slug: 'eth-mean', symbol: 'ETH-USD', type: 'Mean Reversion', ret: 12.1, sharpe: 1.54, dd: -9.1, grade: 'B+' },
  { name: 'Composite Macro', slug: 'macro-composite', symbol: 'MULTI', type: 'Composite', ret: 22.7, sharpe: 2.1, dd: -14.3, grade: 'A+' },
]

const GRADE_COLOR: Record<string, string> = {
  'A+': 'var(--mint)', A: 'var(--mint)', 'B+': 'var(--blue)', B: 'var(--blue)',
  C: 'var(--orange)', D: 'var(--red)', F: 'var(--red)',
}

export default function LandingPage() {
  const [agents, setAgents] = useState<AgentPreview[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('agents')
      .select('*, agent_stats(nav_cents,total_return_pct,sharpe_ratio,max_drawdown_pct,snapshot_at), backtest_stats')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(6)
      .then(({ data }) => {
        if (!data) return
        setAgents(data.map((a: any) => {
          const statsArr = Array.isArray(a.agent_stats) ? a.agent_stats : (a.agent_stats ? [a.agent_stats] : [])
          const s = statsArr.length > 0 ? statsArr.reduce((x: any, y: any) => x.snapshot_at > y.snapshot_at ? x : y) : null
          const bt = a.backtest_stats?.stats
          return {
            name: a.name, slug: a.slug,
            primary_symbol: a.primary_symbol ?? 'MULTI',
            strategy_type: a.strategy_type ?? 'momentum',
            ret: s?.total_return_pct ?? bt?.totalReturnPct ?? null,
            sharpe: s?.sharpe_ratio ?? bt?.sharpeRatio ?? null,
            max_drawdown: s?.max_drawdown_pct ?? bt?.maxDrawdownPct ?? null,
            ticker: a.ticker ?? a.name?.slice(0, 4).toUpperCase() ?? 'AGNT',
            isLive: !!s,
          }
        }))
      })
  }, [])

  const displayAgents = agents.length >= 3 ? agents.slice(0, 3) : DEMO_AGENTS.map(d => ({
    name: d.name, slug: d.slug, primary_symbol: d.symbol,
    strategy_type: d.type, ret: d.ret, sharpe: d.sharpe,
    max_drawdown: d.dd, ticker: d.slug.slice(0, 4).toUpperCase(), isLive: true,
  }))

  const hero = useInView(0)
  const features = useInView(0.06)
  const how = useInView(0.06)
  const market = useInView(0.06)
  const cta = useInView(0.1)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--white)', overflowX: 'hidden' }}>
      <PublicNav />

      {/* Background grid glow */}
      <div className="hero-grid-bg" />
      <div style={{
        position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: '80vw', height: '55vh', pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse 60% 50% at 50% -10%, rgba(79,140,255,0.18), transparent 70%)',
      }} />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section
        ref={hero.ref}
        style={{
          padding: '7.5rem 1.75rem 3rem',
          maxWidth: 1240,
          margin: '0 auto',
          position: 'relative',
          zIndex: 1,
          opacity: hero.visible ? 1 : 0,
          transform: hero.visible ? 'none' : 'translateY(20px)',
          transition: 'opacity 0.6s ease, transform 0.6s ease',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '3.5rem', alignItems: 'center' }} className="hero-grid">
          {/* Left */}
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.4rem 0.9rem', borderRadius: 100,
              background: 'rgba(22,199,132,0.1)', border: '1px solid rgba(22,199,132,0.25)',
              fontFamily: 'var(--font-mono)', fontSize: '0.63rem', letterSpacing: '0.1em',
              color: 'var(--mint)', marginBottom: '1.4rem',
            }}>
              <span className="live-dot" />
              AGENT INTELLIGENCE — LIVE
            </div>

            <h1 style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 900,
              fontSize: 'clamp(2.6rem, 5.5vw, 4.4rem)',
              lineHeight: 1.0,
              letterSpacing: '-0.05em',
              margin: '0 0 1.25rem',
              maxWidth: 720,
            }}>
              <span style={{
                background: 'linear-gradient(135deg, var(--white) 0%, var(--blue2) 45%, var(--mint) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                Invest in AI trading agents.
              </span>
              <br />
              <span style={{ color: 'var(--muted)', fontWeight: 700, fontSize: '85%' }}>
                Transparent. Verified. On-chain.
              </span>
            </h1>

            <p style={{
              fontSize: '1.06rem', color: 'var(--text)', lineHeight: 1.75,
              maxWidth: 540, marginBottom: '2rem',
            }}>
              ASE is the marketplace for autonomous trading agents. Connect your wallet, browse verified strategies with live track records, and allocate capital with one click — you stay in custody.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '2.5rem' }}>
              <Link href="/signup" style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.85rem 1.75rem', borderRadius: 12,
                background: 'linear-gradient(135deg, var(--blue3), var(--blue))',
                color: 'var(--white)', fontWeight: 700, fontSize: '0.94rem',
                textDecoration: 'none', transition: 'opacity .15s, transform .15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'none' }}
              >
                Start Investing
              </Link>
              <Link href="/agents" style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.85rem 1.5rem', borderRadius: 12,
                background: 'rgba(79,140,255,0.1)', border: '1px solid rgba(79,140,255,0.25)',
                color: 'var(--blue2)', fontWeight: 600, fontSize: '0.94rem',
                textDecoration: 'none', transition: 'all .15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(79,140,255,0.18)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(79,140,255,0.1)' }}
              >
                Browse Agents
              </Link>
            </div>

            {/* Trust badges */}
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              {[
                { label: 'MetaMask', icon: '🦊' },
                { label: 'Coinbase Wallet', icon: '🔵' },
                { label: 'WalletConnect', icon: '🔗' },
              ].map(w => (
                <div key={w.label} style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--faint)',
                  letterSpacing: '0.06em',
                }}>
                  <span>{w.icon}</span> {w.label}
                </div>
              ))}
            </div>
          </div>

          {/* Right: live portfolio preview */}
          <div style={{
            background: 'linear-gradient(180deg, rgba(16,26,45,0.98) 0%, rgba(11,23,40,0.95) 100%)',
            border: '1px solid var(--border2)',
            borderRadius: 20,
            padding: '1.5rem',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', inset: 0,
              background: 'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(79,140,255,0.12), transparent 65%)',
              pointerEvents: 'none',
            }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
                    <span className="live-dot" />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--mint)', letterSpacing: '0.1em' }}>LIVE PORTFOLIO</span>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '1.65rem', color: 'var(--white)', letterSpacing: '-0.04em' }}>$84,241</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--faint)', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>TODAY</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.05rem', color: 'var(--mint)' }}>+$2,441</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--mint)', opacity: 0.7 }}>+2.98%</div>
                </div>
              </div>

              <div style={{ borderRadius: 12, overflow: 'hidden', marginBottom: '1rem', height: 90 }}>
                <MiniChart positive height={90} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {displayAgents.map((agent, i) => {
                  const pos = (agent.ret ?? 0) >= 0
                  return (
                    <Link key={i} href={`/agents/${agent.slug}`} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: 'rgba(255,255,255,0.035)', border: '1px solid var(--border)',
                      borderRadius: 10, padding: '0.7rem 0.85rem',
                      textDecoration: 'none', transition: 'background .15s',
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,140,255,0.08)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.035)'}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--white)' }}>{agent.name}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--faint)', marginTop: '0.1rem' }}>{agent.primary_symbol}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.88rem', color: pos ? 'var(--mint)' : 'var(--red)' }}>
                          {pos ? '+' : ''}{(agent.ret ?? 0).toFixed(1)}%
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: 'var(--faint)', marginTop: '0.1rem' }}>
                          {agent.isLive ? '● LIVE' : '◇ BACKTEST'}
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>

              <Link href="/agents" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginTop: '1rem', padding: '0.7rem',
                background: 'rgba(79,140,255,0.12)', border: '1px solid rgba(79,140,255,0.22)',
                borderRadius: 10, color: 'var(--blue2)',
                fontWeight: 600, fontSize: '0.82rem', textDecoration: 'none',
                transition: 'all .15s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,140,255,0.2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(79,140,255,0.12)'}
              >
                View all agents →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Ticker ───────────────────────────────────────────── */}
      <TickerBar />

      {/* ── Features ─────────────────────────────────────────── */}
      <section
        ref={features.ref}
        style={{
          padding: '5rem 1.75rem',
          maxWidth: 1240,
          margin: '0 auto',
          opacity: features.visible ? 1 : 0,
          transform: features.visible ? 'none' : 'translateY(24px)',
          transition: 'opacity 0.6s ease, transform 0.6s ease',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '0.12em',
            color: 'var(--blue)', textTransform: 'uppercase', marginBottom: '0.75rem',
          }}>WHY ASE</div>
          <h2 style={{
            fontFamily: 'var(--font-body)', fontWeight: 800,
            fontSize: 'clamp(1.8rem, 3.5vw, 2.6rem)',
            letterSpacing: '-0.04em', color: 'var(--white)',
            maxWidth: 560, margin: '0 auto',
          }}>
            The infrastructure for autonomous trading
          </h2>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: '1rem',
        }} className="steps-grid">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              style={{
                background: 'var(--bg2)',
                border: '1px solid var(--border)',
                borderRadius: 16,
                padding: '1.5rem',
                transition: `opacity 0.5s ${i * 60}ms, transform 0.5s ${i * 60}ms`,
                opacity: features.visible ? 1 : 0,
                transform: features.visible ? 'none' : 'translateY(16px)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(79,140,255,0.3)'
                ;(e.currentTarget as HTMLElement).style.background = 'var(--bg3)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
                ;(e.currentTarget as HTMLElement).style.background = 'var(--bg2)'
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: `rgba(${f.color === 'var(--mint)' ? '22,199,132' : f.color === 'var(--blue)' ? '79,140,255' : f.color === 'var(--orange)' ? '245,158,11' : f.color === 'var(--purple)' ? '139,92,246' : f.color === 'var(--cyan)' ? '109,211,255' : '107,163,255'},0.12)`,
                border: `1px solid rgba(${f.color === 'var(--mint)' ? '22,199,132' : f.color === 'var(--blue)' ? '79,140,255' : '107,163,255'},0.22)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: f.color, marginBottom: '1rem',
              }}>
                {f.icon}
              </div>
              <h3 style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--white)', marginBottom: '0.5rem' }}>
                {f.title}
              </h3>
              <p style={{ color: 'var(--muted)', fontSize: '0.875rem', lineHeight: 1.65 }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <section
        ref={how.ref}
        style={{
          padding: '0 1.75rem 5rem',
          maxWidth: 1240,
          margin: '0 auto',
          opacity: how.visible ? 1 : 0,
          transform: how.visible ? 'none' : 'translateY(24px)',
          transition: 'opacity 0.6s ease, transform 0.6s ease',
        }}
      >
        <div style={{
          background: 'linear-gradient(135deg, rgba(11,23,40,0.98), rgba(16,26,45,0.95))',
          border: '1px solid var(--border)',
          borderRadius: 20,
          padding: '2.5rem 2rem',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: 0, right: 0,
            width: '40%', height: '100%',
            background: 'radial-gradient(ellipse 60% 80% at 100% 50%, rgba(22,199,132,0.07), transparent)',
            pointerEvents: 'none',
          }} />
          <div style={{ textAlign: 'center', marginBottom: '2.5rem', position: 'relative' }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '0.12em',
              color: 'var(--mint)', textTransform: 'uppercase', marginBottom: '0.6rem',
            }}>HOW IT WORKS</div>
            <h2 style={{
              fontFamily: 'var(--font-body)', fontWeight: 800,
              fontSize: 'clamp(1.6rem, 3vw, 2.2rem)',
              letterSpacing: '-0.04em', color: 'var(--white)', margin: 0,
            }}>
              From wallet to returns in 4 steps
            </h2>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: '1.5rem',
            position: 'relative',
          }} className="steps-grid">
            {HOW_STEPS.map((s, i) => (
              <div key={s.n} style={{ position: 'relative' }}>
                {i < HOW_STEPS.length - 1 && (
                  <div style={{
                    position: 'absolute', top: 20, left: '75%', width: '50%',
                    height: 1, background: 'linear-gradient(90deg, var(--border2), transparent)',
                  }} className="step-connector" />
                )}
                <div style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: 'linear-gradient(135deg, rgba(79,140,255,0.18), rgba(22,199,132,0.1))',
                  border: '1px solid rgba(79,140,255,0.28)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.8rem',
                  color: 'var(--blue)', marginBottom: '1rem',
                }}>
                  {s.n}
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.96rem', color: 'var(--white)', marginBottom: '0.4rem' }}>
                  {s.title}
                </div>
                <div style={{ color: 'var(--muted)', fontSize: '0.85rem', lineHeight: 1.6 }}>
                  {s.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Marketplace Preview ───────────────────────────────── */}
      <section
        ref={market.ref}
        style={{
          padding: '0 1.75rem 5rem',
          maxWidth: 1240,
          margin: '0 auto',
          opacity: market.visible ? 1 : 0,
          transform: market.visible ? 'none' : 'translateY(24px)',
          transition: 'opacity 0.6s ease, transform 0.6s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '0.12em', color: 'var(--blue)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
              MARKETPLACE
            </div>
            <h2 style={{
              fontFamily: 'var(--font-body)', fontWeight: 800,
              fontSize: 'clamp(1.6rem, 3vw, 2.2rem)',
              letterSpacing: '-0.04em', color: 'var(--white)', margin: 0,
            }}>
              Live strategies, verified returns
            </h2>
          </div>
          <Link href="/agents" style={{
            padding: '0.65rem 1.25rem', borderRadius: 10,
            background: 'rgba(79,140,255,0.1)', border: '1px solid rgba(79,140,255,0.25)',
            color: 'var(--blue2)', fontWeight: 600, fontSize: '0.85rem',
            textDecoration: 'none', transition: 'all .15s', whiteSpace: 'nowrap',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,140,255,0.2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(79,140,255,0.1)'}
          >
            Open marketplace →
          </Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '1rem' }} className="agents-grid">
          {displayAgents.map((agent, idx) => {
            const pos = (agent.ret ?? 0) >= 0
            const demoG = DEMO_AGENTS[idx]
            const grade = demoG?.grade ?? 'B'
            return (
              <Link
                key={agent.slug}
                href={`/agents/${agent.slug}`}
                style={{
                  display: 'block', textDecoration: 'none',
                  background: 'var(--bg2)', border: '1px solid var(--border)',
                  borderRadius: 16, padding: '1.25rem',
                  opacity: market.visible ? 1 : 0,
                  transform: market.visible ? 'none' : 'translateY(14px)',
                  transition: `opacity 0.4s ${idx * 80}ms, transform 0.4s ${idx * 80}ms, border-color .15s, background .15s`,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'rgba(79,140,255,0.3)'
                  e.currentTarget.style.background = 'var(--bg3)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border)'
                  e.currentTarget.style.background = 'var(--bg2)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.97rem', color: 'var(--white)', marginBottom: '0.2rem' }}>{agent.name}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--faint)', textTransform: 'uppercase' }}>{agent.strategy_type.replace(/_/g, ' ')}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem' }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700,
                      color: GRADE_COLOR[grade] ?? 'var(--blue)',
                      background: `${GRADE_COLOR[grade] ?? 'var(--blue)'}1a`,
                      border: `1px solid ${GRADE_COLOR[grade] ?? 'var(--blue)'}33`,
                      padding: '0.1rem 0.45rem', borderRadius: 6,
                    }}>{grade}</span>
                    {agent.isLive && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: 'var(--mint)' }}>
                        <span className="live-dot" style={{ width: 5, height: 5 }} /> LIVE
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ height: 52, marginBottom: '1rem', borderRadius: 8, overflow: 'hidden' }}>
                  <MiniChart positive={pos} height={52} />
                </div>

                <div style={{
                  fontFamily: 'var(--font-mono)', fontWeight: 700,
                  fontSize: '1.7rem', color: pos ? 'var(--mint)' : 'var(--red)',
                  marginBottom: '0.85rem', letterSpacing: '-0.03em',
                }}>
                  {pos ? '+' : ''}{(agent.ret ?? 0).toFixed(1)}%
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                  {[
                    { label: 'Sharpe', value: agent.sharpe !== null ? agent.sharpe.toFixed(2) : '—', color: 'var(--white)' },
                    { label: 'Max DD', value: agent.max_drawdown !== null ? `${agent.max_drawdown.toFixed(1)}%` : '—', color: 'var(--red)' },
                  ].map(m => (
                    <div key={m.label} style={{
                      background: 'var(--bg3)', border: '1px solid var(--border)',
                      borderRadius: 8, padding: '0.6rem 0.7rem',
                    }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--faint)', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>{m.label}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.85rem', color: m.color }}>{m.value}</div>
                    </div>
                  ))}
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      {/* ── CTA Banner ────────────────────────────────────────── */}
      <section
        ref={cta.ref}
        style={{
          padding: '0 1.75rem 6rem',
          maxWidth: 1240,
          margin: '0 auto',
          opacity: cta.visible ? 1 : 0,
          transform: cta.visible ? 'none' : 'translateY(20px)',
          transition: 'opacity 0.6s ease, transform 0.6s ease',
        }}
      >
        <div style={{
          borderRadius: 20, padding: '3.5rem 2.5rem',
          background: 'linear-gradient(135deg, rgba(79,140,255,0.14) 0%, rgba(22,199,132,0.08) 100%)',
          border: '1px solid rgba(79,140,255,0.22)',
          textAlign: 'center', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse 60% 60% at 50% 110%, rgba(22,199,132,0.08), transparent)',
            pointerEvents: 'none',
          }} />
          <div style={{ position: 'relative' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '0.12em', color: 'var(--mint)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
              READY TO START
            </div>
            <h2 style={{
              fontFamily: 'var(--font-body)', fontWeight: 800,
              fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)',
              letterSpacing: '-0.04em', color: 'var(--white)',
              maxWidth: 560, margin: '0 auto 1rem',
            }}>
              Your edge is one wallet connect away.
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: '1.02rem', maxWidth: 480, margin: '0 auto 2rem', lineHeight: 1.65 }}>
              Join thousands of investors allocating to verified AI strategies. Full custody. Transparent performance. No lock-ins.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/signup" style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.9rem 2rem', borderRadius: 12,
                background: 'linear-gradient(135deg, var(--blue3), var(--blue))',
                color: 'var(--white)', fontWeight: 700, fontSize: '0.95rem',
                textDecoration: 'none',
              }}>
                Create Account
              </Link>
              <Link href="/agents" style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.9rem 1.75rem', borderRadius: 12,
                background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border2)',
                color: 'var(--text)', fontWeight: 600, fontSize: '0.95rem',
                textDecoration: 'none',
              }}>
                Explore Agents
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer style={{
        padding: '2rem 1.75rem',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--faint)' }}>
          © 2026 ASE · Autonomous Strategy Exchange
        </div>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          {['Terms', 'Privacy', 'Docs', 'Builders'].map(l => (
            <Link key={l} href="#" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--faint)', transition: 'color .15s' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--muted)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--faint)'}
            >{l}</Link>
          ))}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--disabled)', letterSpacing: '0.06em' }}>
          NOT FINANCIAL ADVICE
        </div>
      </footer>

      <style>{`
        @media (max-width: 900px) {
          .hero-grid { grid-template-columns: 1fr !important; }
          .steps-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .agents-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .step-connector { display: none; }
        }
        @media (max-width: 540px) {
          .steps-grid { grid-template-columns: 1fr !important; }
          .agents-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
