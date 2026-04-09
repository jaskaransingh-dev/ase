'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useWallet } from '@/components/WalletProvider'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────
interface AgentData {
  ticker: string; slug: string; name: string
  nav: string; nav_cents: number; ret: string; pos: boolean
  spark: number[]; type: string; sharpe: number
  total_trades: number; win_rate: number; subscriber_count: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const FALLBACK: AgentData[] = [
  { ticker: '$BTCM', slug: 'btc-momentum',   name: 'BTC Momentum',   nav: '$--', nav_cents: 10000, ret: '--', pos: true,  spark: [100,100,100,100,100,100,100,100], type: 'Momentum',        sharpe: 0, total_trades: 0, win_rate: 0, subscriber_count: 0 },
  { ticker: '$ETHR', slug: 'eth-mean-revert',name: 'ETH Stat Arb',   nav: '$--', nav_cents: 10000, ret: '--', pos: true,  spark: [100,100,100,100,100,100,100,100], type: 'Mean Reversion',   sharpe: 0, total_trades: 0, win_rate: 0, subscriber_count: 0 },
  { ticker: '$SOLB', slug: 'sol-breakout',   name: 'SOL Breakout',   nav: '$--', nav_cents: 10000, ret: '--', pos: false, spark: [100,100,100,100,100,100,100,100], type: 'Vol Breakout',     sharpe: 0, total_trades: 0, win_rate: 0, subscriber_count: 0 },
  { ticker: '$CRTR', slug: 'crypto-trend',   name: 'Crypto Trend',   nav: '$--', nav_cents: 10000, ret: '--', pos: true,  spark: [100,100,100,100,100,100,100,100], type: 'Trend Following',  sharpe: 0, total_trades: 0, win_rate: 0, subscriber_count: 0 },
  { ticker: '$DEFI', slug: 'defi-basket',    name: 'DeFi Basket',    nav: '$--', nav_cents: 10000, ret: '--', pos: true,  spark: [100,100,100,100,100,100,100,100], type: 'Multi-Asset',      sharpe: 0, total_trades: 0, win_rate: 0, subscriber_count: 0 },
  { ticker: '$VOLH', slug: 'vol-harvester',  name: 'Vol Harvester',  nav: '$--', nav_cents: 10000, ret: '--', pos: true,  spark: [100,100,100,100,100,100,100,100], type: 'Vol Harvest',      sharpe: 0, total_trades: 0, win_rate: 0, subscriber_count: 0 },
]

function Spark({ data, pos }: { data: number[]; pos: boolean }) {
  const w = 90, h = 32, pad = 2
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1
  const step = (w - pad * 2) / (data.length - 1)
  const pts = data.map((v, i) => {
    const x = pad + i * step
    const y = pad + (1 - (v - min) / span) * (h - pad * 2)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const col = pos ? '#6EE7B7' : '#FB7185'
  const fillPath = `${pts} L${(pad + (data.length - 1) * step).toFixed(1)},${h} L${pad},${h} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`sg_${pos ? 'g' : 'r'}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.22" />
          <stop offset="100%" stopColor={col} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#sg_${pos ? 'g' : 'r'})`} />
      <path d={pts} fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ScrollFadeUp({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect() } }, { threshold: 0.08 })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return (
    <div ref={ref} style={{ transition: `opacity .6s ${delay}ms, transform .6s ${delay}ms cubic-bezier(.16,1,.3,1)`, opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(24px)' }}>
      {children}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function LandingPage() {
  const { wallet, connect, connecting, shortAddress } = useWallet()
  const [agents, setAgents] = useState<AgentData[]>(FALLBACK)
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)

  // Scroll detection
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  // Auth check
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user: u } }) => setUser(u ? { id: u.id, email: u.email ?? '' } : null))
  }, [])

  // Fetch live agent data
  useEffect(() => {
    fetch('/api/agents/public-stats').then(r => r.json()).then(data => {
      if (Array.isArray(data?.agents) && data.agents.length > 0) setAgents(data.agents)
    }).catch(() => {})
  }, [])

  const connected = wallet.connected

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--white)', minHeight: '100vh', fontFamily: 'var(--font-head)' }}>
      <style>{`
        /* ── NAV ── */
        .lp-nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          height: 62px; display: flex; align-items: center; justify-content: space-between;
          padding: 0 2rem;
          transition: background .3s, border-color .3s, backdrop-filter .3s;
        }
        .lp-nav.scrolled {
          background: rgba(8,6,18,.92);
          border-bottom: 1px solid rgba(148,130,255,.12);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
        }
        .lp-nav-links { display: flex; align-items: center; gap: .25rem; }
        .lp-nav-link { padding: .4rem .8rem; border-radius: 9px; font-size: .85rem; font-weight: 600; color: rgba(240,235,255,.55); transition: all .18s; border: 1px solid transparent; }
        .lp-nav-link:hover { color: var(--white); border-color: rgba(148,130,255,.2); background: rgba(148,130,255,.07); }
        .lp-brand { font-size: 1.15rem; font-weight: 900; letter-spacing: -.025em; }
        .lp-brand span { color: var(--gold); }
        .lp-nav-right { display: flex; align-items: center; gap: .65rem; }

        /* ── HERO ── */
        .lp-hero {
          min-height: 100vh; display: flex; flex-direction: column; align-items: center;
          justify-content: center; text-align: center; padding: 6rem 2rem 4rem;
          position: relative; overflow: hidden;
        }
        .lp-hero-glow {
          position: absolute; inset: 0; pointer-events: none;
          background:
            radial-gradient(ellipse 70% 50% at 50% 30%, rgba(148,130,255,.1) 0%, transparent 60%),
            radial-gradient(ellipse 40% 30% at 75% 70%, rgba(125,211,252,.06) 0%, transparent 55%),
            radial-gradient(ellipse 35% 25% at 25% 75%, rgba(249,168,212,.05) 0%, transparent 55%);
        }
        .lp-hero-grid {
          position: absolute; inset: 0; pointer-events: none;
          background-image: linear-gradient(rgba(148,130,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(148,130,255,.03) 1px, transparent 1px);
          background-size: 56px 56px;
        }
        .lp-eyebrow { display: inline-flex; align-items: center; gap: .5rem; padding: .28rem .85rem; border-radius: 999px; border: 1px solid rgba(148,130,255,.28); background: rgba(148,130,255,.08); font-family: var(--font-mono); font-size: .65rem; letter-spacing: .12em; color: var(--gold); font-weight: 700; text-transform: uppercase; margin-bottom: 1.5rem; }
        .lp-live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); animation: pulseGreen 2.2s ease-in-out infinite; flex-shrink: 0; }
        .lp-h1 { font-size: clamp(2.8rem, 6vw, 5rem); font-weight: 900; letter-spacing: -.04em; line-height: 1.04; margin-bottom: 1.4rem; }
        .lp-h1 .accent { background: linear-gradient(135deg, #9B8CFF, #C4B5FD, #7DD3FC); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .lp-sub { font-size: 1.15rem; color: var(--muted); max-width: 580px; line-height: 1.65; margin-bottom: 2.5rem; }
        .lp-hero-actions { display: flex; align-items: center; gap: .85rem; flex-wrap: wrap; justify-content: center; }
        .lp-cta-primary { display: inline-flex; align-items: center; gap: .6rem; padding: .85rem 1.8rem; border-radius: 14px; font-weight: 700; font-size: .95rem; background: linear-gradient(135deg, #7C3AED, #9B8CFF, #7DD3FC); color: #fff; border: 0; cursor: pointer; transition: all .2s cubic-bezier(.16,1,.3,1); white-space: nowrap; }
        .lp-cta-primary:hover { transform: translateY(-2px); box-shadow: 0 12px 36px rgba(124,58,237,.4); }
        .lp-cta-secondary { display: inline-flex; align-items: center; gap: .5rem; padding: .82rem 1.6rem; border-radius: 14px; font-weight: 600; font-size: .92rem; background: rgba(148,130,255,.07); color: var(--white); border: 1px solid rgba(148,130,255,.22); cursor: pointer; transition: all .2s; text-decoration: none; }
        .lp-cta-secondary:hover { background: rgba(148,130,255,.13); border-color: rgba(148,130,255,.4); transform: translateY(-1px); }
        .lp-trust-row { display: flex; align-items: center; gap: 1.5rem; margin-top: 2.5rem; flex-wrap: wrap; justify-content: center; }
        .lp-trust-item { font-size: .78rem; color: rgba(210,200,255,.4); font-family: var(--font-mono); letter-spacing: .06em; display: flex; align-items: center; gap: .4rem; }
        .lp-trust-item::before { content: '✓'; color: var(--green); font-size: .75rem; }

        /* ── SECTION ── */
        .lp-section { padding: 5rem 2rem; max-width: 1280px; margin: 0 auto; }
        .lp-section-label { font-family: var(--font-mono); font-size: .65rem; letter-spacing: .14em; color: var(--gold); font-weight: 700; text-transform: uppercase; margin-bottom: .75rem; }
        .lp-section-title { font-size: clamp(1.75rem, 3.5vw, 2.5rem); font-weight: 900; letter-spacing: -.03em; margin-bottom: .75rem; }
        .lp-section-sub { font-size: .95rem; color: var(--muted); max-width: 560px; line-height: 1.7; }

        /* ── STEPS ── */
        .lp-steps { display: grid; grid-template-columns: repeat(3,1fr); gap: 1.5rem; margin-top: 3rem; }
        @media (max-width: 768px) { .lp-steps { grid-template-columns: 1fr; } }
        .lp-step { background: rgba(148,130,255,.04); border: 1px solid rgba(148,130,255,.1); border-radius: 20px; padding: 1.75rem; position: relative; transition: all .28s; }
        .lp-step:hover { border-color: rgba(148,130,255,.25); transform: translateY(-3px); box-shadow: 0 16px 48px rgba(0,0,0,.3), 0 0 24px rgba(148,130,255,.06); }
        .lp-step-num { font-family: var(--font-mono); font-size: .7rem; letter-spacing: .1em; color: var(--gold); font-weight: 700; margin-bottom: .85rem; opacity: .7; }
        .lp-step-icon { width: 40px; height: 40px; margin-bottom: .85rem; display: flex; align-items: center; justify-content: center; border-radius: 10px; background: rgba(148,130,255,.1); border: 1px solid rgba(148,130,255,.2); }
        .lp-step-title { font-size: 1.05rem; font-weight: 800; margin-bottom: .5rem; }
        .lp-step-desc { font-size: .85rem; color: var(--muted); line-height: 1.6; }

        /* ── AGENT CARDS ── */
        .lp-agents-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px,1fr)); gap: 1.1rem; margin-top: 2.5rem; }
        .lp-agent-card { background: rgba(148,130,255,.04); border: 1px solid rgba(148,130,255,.1); border-radius: 18px; padding: 1.25rem; cursor: pointer; transition: all .25s cubic-bezier(.16,1,.3,1); }
        .lp-agent-card:hover { border-color: rgba(148,130,255,.28); transform: translateY(-3px); box-shadow: 0 16px 48px rgba(0,0,0,.35), 0 0 20px rgba(148,130,255,.06); }
        .lp-agent-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: .85rem; }
        .lp-agent-ticker { font-family: var(--font-mono); font-size: .68rem; letter-spacing: .1em; color: var(--gold); font-weight: 700; margin-bottom: .2rem; }
        .lp-agent-name { font-size: .97rem; font-weight: 800; }
        .lp-agent-type { font-size: .68rem; color: var(--muted); margin-top: .15rem; }
        .lp-ret { font-family: var(--font-mono); font-size: .92rem; font-weight: 700; }
        .lp-agent-bottom { display: flex; align-items: center; justify-content: space-between; margin-top: .85rem; }
        .lp-agent-stats { display: flex; gap: 1rem; }
        .lp-agent-stat { font-size: .72rem; color: var(--muted); }
        .lp-agent-stat strong { color: var(--white); font-size: .8rem; display: block; font-weight: 700; }
        .lp-sub-btn { padding: .35rem .9rem; border-radius: 9px; font-size: .78rem; font-weight: 700; background: rgba(148,130,255,.12); border: 1px solid rgba(148,130,255,.28); color: var(--gold); cursor: pointer; transition: all .18s; white-space: nowrap; }
        .lp-sub-btn:hover { background: rgba(148,130,255,.2); border-color: rgba(148,130,255,.5); }

        /* ── FEATURE GRID ── */
        .lp-features { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px,1fr)); gap: 1rem; margin-top: 2.5rem; }
        .lp-feature { background: rgba(148,130,255,.04); border: 1px solid rgba(148,130,255,.09); border-radius: 16px; padding: 1.5rem; }
        .lp-feature-icon { width: 36px; height: 36px; margin-bottom: .75rem; display: flex; align-items: center; justify-content: center; border-radius: 9px; background: rgba(148,130,255,.1); border: 1px solid rgba(148,130,255,.18); }
        .lp-feature-title { font-size: .95rem; font-weight: 800; margin-bottom: .4rem; }
        .lp-feature-desc { font-size: .83rem; color: var(--muted); line-height: 1.6; }

        /* ── FUTURE BANNER ── */
        .lp-future { margin: 4rem auto; max-width: 760px; background: rgba(148,130,255,.06); border: 1px solid rgba(148,130,255,.18); border-radius: 20px; padding: 2.5rem; text-align: center; }
        .lp-future-label { font-family: var(--font-mono); font-size: .62rem; letter-spacing: .14em; color: var(--accent-sky); font-weight: 700; text-transform: uppercase; margin-bottom: .6rem; }
        .lp-future-title { font-size: 1.5rem; font-weight: 900; letter-spacing: -.03em; margin-bottom: .75rem; }
        .lp-future-desc { font-size: .9rem; color: var(--muted); line-height: 1.7; }
        .lp-future-chips { display: flex; gap: .6rem; justify-content: center; margin-top: 1.5rem; flex-wrap: wrap; }
        .lp-future-chip { padding: .3rem .9rem; border-radius: 999px; font-size: .72rem; font-family: var(--font-mono); font-weight: 600; letter-spacing: .06em; background: rgba(125,211,252,.08); border: 1px solid rgba(125,211,252,.2); color: var(--accent-sky); }

        /* ── FOOTER ── */
        .lp-footer { border-top: 1px solid rgba(148,130,255,.1); padding: 2.5rem; text-align: center; font-size: .8rem; color: var(--faint); }

        /* ── WALLET MODAL ── */
        .wallet-modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,.65); backdrop-filter: blur(8px); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 1rem; }
        .wallet-modal { background: var(--bg3); border: 1px solid rgba(148,130,255,.2); border-radius: 24px; padding: 2rem; max-width: 400px; width: 100%; box-shadow: 0 40px 100px rgba(0,0,0,.7); }
        .wallet-modal-title { font-size: 1.25rem; font-weight: 800; margin-bottom: .35rem; }
        .wallet-modal-sub { font-size: .85rem; color: var(--muted); margin-bottom: 1.5rem; }
        .wallet-option { display: flex; align-items: center; gap: .9rem; padding: .9rem 1.1rem; border-radius: 14px; border: 1px solid rgba(148,130,255,.15); background: rgba(148,130,255,.05); cursor: pointer; margin-bottom: .75rem; transition: all .2s; width: 100%; font-family: inherit; }
        .wallet-option:hover { border-color: rgba(148,130,255,.35); background: rgba(148,130,255,.1); }
        .wallet-option-name { font-weight: 700; font-size: .92rem; text-align: left; }
        .wallet-option-sub { font-size: .75rem; color: var(--muted); text-align: left; }
      `}</style>

      {/* ── NAV ─────────────────────────────────────────────────────────────── */}
      <nav className={`lp-nav ${scrolled ? 'scrolled' : ''}`}>
        <Link href="/" className="lp-brand">ASE<span>.</span></Link>
        <div className="lp-nav-links" style={{ display: mobileOpen ? 'none' : 'flex' }}>
          <Link href="/agents" className="lp-nav-link">Agents</Link>
          <Link href="/builders" className="lp-nav-link">Builders</Link>
          <Link href="/dashboard/backtest" className="lp-nav-link">Algo Lab</Link>
        </div>
        <div className="lp-nav-right">
          {user ? (
            <Link href="/dashboard" className="lp-cta-secondary" style={{ padding: '.4rem 1rem', fontSize: '.84rem' }}>Dashboard →</Link>
          ) : (
            <>
              <Link href="/login" className="lp-nav-link">Sign in</Link>
              <Link href="/signup" className="lp-cta-secondary" style={{ padding: '.42rem 1.1rem', fontSize: '.84rem' }}>Get Started</Link>
            </>
          )}
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-hero-glow" />
        <div className="lp-hero-grid" />

        <div className="lp-eyebrow">
          <span className="lp-live-dot" />
          {agents.length} Agents Running Live
        </div>

        <h1 className="lp-h1">
          Invest in<br />
          <span className="accent">Algorithmic Trading Agents</span>
        </h1>

        <p className="lp-sub">
          Subscribe to audited, quantitative trading strategies running 24/7 on live markets.
          Full transparency on every trade, every signal, every position.
        </p>

        <div className="lp-hero-actions">
          <Link href="/agents" className="lp-cta-primary">
            View Agents
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </Link>
          <Link href="/signup" className="lp-cta-secondary">Create Account →</Link>
        </div>

        <div className="lp-trust-row">
          {['No custody risk', 'Alpaca-executed trades', 'Audited strategies', 'Paper trading — no real funds'].map(t => (
            <div key={t} className="lp-trust-item">{t}</div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────────── */}
      <section className="lp-section">
        <ScrollFadeUp>
          <div className="lp-section-label">How It Works</div>
          <h2 className="lp-section-title">Three steps to live alpha</h2>
          <p className="lp-section-sub">No fund minimums, no lock-ups. Subscribe to a strategy and track every trade in real time.</p>
        </ScrollFadeUp>
        <div className="lp-steps">
          {([
            {
              num: '01',
              icon: (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="#9B8CFF" strokeWidth="1.6"/><path d="M10 7v3l2 2" stroke="#9B8CFF" strokeWidth="1.6" strokeLinecap="round"/></svg>
              ),
              title: 'Create Account',
              desc: 'Sign up with email or Coinbase. Your account is your identity — no wallet required to get started.',
            },
            {
              num: '02',
              icon: (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="5" width="14" height="10" rx="2" stroke="#9B8CFF" strokeWidth="1.6"/><path d="M3 8h14" stroke="#9B8CFF" strokeWidth="1.6"/></svg>
              ),
              title: 'Subscribe to a Strategy',
              desc: 'Browse 10 audited trading agents with verified backtests and live performance. Subscribe in one click with paper credits.',
            },
            {
              num: '03',
              icon: (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><polyline points="3,14 7,9 11,12 17,5" stroke="#9B8CFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              ),
              title: 'Track Live Performance',
              desc: 'Agents trade 24/7 on Alpaca. Follow live NAV, every fill, every signal — full audit trail on your dashboard.',
            },
          ] as Array<{ num: string; icon: React.ReactNode; title: string; desc: string }>).map((s, i) => (
            <ScrollFadeUp key={s.num} delay={i * 120}>
              <div className="lp-step">
                <div className="lp-step-num">STEP {s.num}</div>
                <div className="lp-step-icon">{s.icon}</div>
                <div className="lp-step-title">{s.title}</div>
                <div className="lp-step-desc">{s.desc}</div>
              </div>
            </ScrollFadeUp>
          ))}
        </div>
      </section>

      {/* ── LIVE AGENTS ──────────────────────────────────────────────────────── */}
      <section className="lp-section" style={{ paddingTop: '1rem' }}>
        <ScrollFadeUp>
          <div className="lp-section-label">Live Agents</div>
          <h2 className="lp-section-title">Pick your strategy</h2>
          <p className="lp-section-sub">Every bot is backtested before listing. Live performance tracked in real-time on Alpaca paper trading.</p>
        </ScrollFadeUp>

        <div className="lp-agents-grid">
          {agents.slice(0, 6).map((agent, i) => (
            <ScrollFadeUp key={agent.slug} delay={i * 80}>
              <Link href={`/agents/${agent.slug}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                <div className="lp-agent-card">
                  <div className="lp-agent-top">
                    <div>
                      <div className="lp-agent-ticker">{agent.ticker}</div>
                      <div className="lp-agent-name">{agent.name}</div>
                      <div className="lp-agent-type">{agent.type}</div>
                    </div>
                    <div>
                      <div className={`lp-ret`} style={{ color: agent.pos ? 'var(--green)' : 'var(--red)', textAlign: 'right' }}>{agent.ret}</div>
                      <Spark data={agent.spark} pos={agent.pos} />
                    </div>
                  </div>
                  <div className="lp-agent-bottom">
                    <div className="lp-agent-stats">
                      <div className="lp-agent-stat"><strong>{agent.sharpe > 0 ? agent.sharpe.toFixed(2) : '--'}</strong>Sharpe</div>
                      <div className="lp-agent-stat"><strong>{agent.win_rate > 0 ? `${agent.win_rate.toFixed(0)}%` : '--'}</strong>Win Rate</div>
                      <div className="lp-agent-stat"><strong>{agent.subscriber_count}</strong>Subscribers</div>
                    </div>
                    <div className="lp-sub-btn">Subscribe →</div>
                  </div>
                </div>
              </Link>
            </ScrollFadeUp>
          ))}
        </div>

        <ScrollFadeUp delay={200}>
          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <Link href="/agents" className="lp-cta-secondary" style={{ display: 'inline-flex' }}>View All {agents.length} Agents →</Link>
          </div>
        </ScrollFadeUp>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────────────── */}
      <section className="lp-section">
        <ScrollFadeUp>
          <div className="lp-section-label">Why ASE</div>
          <h2 className="lp-section-title">Institutional rigour, accessible to everyone</h2>
        </ScrollFadeUp>
        <div className="lp-features">
          {([
            {
              icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="6.5" stroke="#9B8CFF" strokeWidth="1.5"/><path d="M6 9l2 2 4-4" stroke="#9B8CFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
              title: 'Audited Before Listed',
              desc: 'Every agent passes out-of-sample testing, CPCV, PBO analysis, and Deflated Sharpe Ratio screening to eliminate overfitting.',
            },
            {
              icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="2" width="14" height="14" rx="3" stroke="#9B8CFF" strokeWidth="1.5"/><path d="M5 9h8M5 6h5M5 12h3" stroke="#9B8CFF" strokeWidth="1.5" strokeLinecap="round"/></svg>,
              title: 'Full Trade Transparency',
              desc: 'Every buy, every sell, every signal logged and visible on your dashboard. No black boxes — complete audit trail on every position.',
            },
            {
              icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="6.5" stroke="#9B8CFF" strokeWidth="1.5"/><path d="M9 5v4l2.5 2.5" stroke="#9B8CFF" strokeWidth="1.5" strokeLinecap="round"/></svg>,
              title: '24/7 Execution',
              desc: 'Agents run continuously on Alpaca. Crypto markets never close — neither do our strategies. Live signals and live fills around the clock.',
            },
            {
              icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2l1.8 5.4H17l-4.9 3.6 1.8 5.4L9 13l-4.9 3.4 1.8-5.4L1 7.4h6.2z" stroke="#9B8CFF" strokeWidth="1.5" strokeLinejoin="round"/></svg>,
              title: 'Paper Trading — Zero Risk',
              desc: 'All strategies run on Alpaca paper trading. Real market data, real execution logic — no real capital at risk. Learn risk-free.',
            },
            {
              icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 14V8M8 14V4M12 14v-6M16 14V6" stroke="#9B8CFF" strokeWidth="1.5" strokeLinecap="round"/></svg>,
              title: 'Submit Your Strategy',
              desc: 'Quantitative traders can submit Python strategies. Pass our validation pipeline and get listed in front of subscribers.',
            },
            {
              icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="6.5" stroke="#9B8CFF" strokeWidth="1.5"/><path d="M6.5 11.5C6.5 11.5 7.5 13 9 13s2.5-1.5 2.5-1.5M6 8.5a.5.5 0 110-1 .5.5 0 010 1zm6 0a.5.5 0 110-1 .5.5 0 010 1z" stroke="#9B8CFF" strokeWidth="1.2" strokeLinecap="round"/></svg>,
              title: 'Roadmap: Tokenized Positions',
              desc: 'Phase 2: agent performance backed by ERC-3643 security tokens. Trade in and out of strategy positions on ASE\'s secondary market.',
            },
          ] as Array<{ icon: React.ReactNode; title: string; desc: string }>).map((f, i) => (
            <ScrollFadeUp key={f.title} delay={i * 60}>
              <div className="lp-feature">
                <div className="lp-feature-icon">{f.icon}</div>
                <div className="lp-feature-title">{f.title}</div>
                <div className="lp-feature-desc">{f.desc}</div>
              </div>
            </ScrollFadeUp>
          ))}
        </div>
      </section>

      {/* ── FUTURE ROADMAP ───────────────────────────────────────────────────── */}
      <ScrollFadeUp>
        <div className="lp-future" style={{ margin: '2rem auto 4rem', padding: '2rem' }}>
          <div className="lp-future-label">Coming in Phase 2</div>
          <h3 className="lp-future-title">Tokenized Strategy Assets</h3>
          <p className="lp-future-desc">
            Today you subscribe to a bot. Tomorrow you'll be able to hold a tokenized stake in its performance —
            an ERC-3643 security token representing fractional economic exposure to the agent's returns.
            Trade in and out on ASE's secondary market. Your subscription history gives you priority access.
          </p>
          <div className="lp-future-chips">
            {['ERC-3643 Tokens', 'Chainlink NAV Oracle', 'On-Chain Subscriptions', 'Secondary Market AMM', 'Equities & ETFs'].map(c => (
              <span key={c} className="lp-future-chip">{c}</span>
            ))}
          </div>
        </div>
      </ScrollFadeUp>

      {/* ── BUILDER CTA ──────────────────────────────────────────────────────── */}
      <section className="lp-section" style={{ paddingTop: 0, paddingBottom: '3rem' }}>
        <ScrollFadeUp>
          <div style={{ background: 'rgba(148,130,255,.06)', border: '1px solid rgba(148,130,255,.18)', borderRadius: 20, padding: '2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.5rem' }}>
            <div>
              <div className="lp-section-label">For Builders</div>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 900, letterSpacing: '-.025em', marginBottom: '.4rem' }}>Got a strategy that actually works?</h3>
              <p style={{ fontSize: '.88rem', color: 'var(--muted)', maxWidth: 480, lineHeight: 1.65 }}>
                Submit your Python strategy. We run it through backtesting, CPCV analysis, and overfitting checks.
                Pass the bar and get listed in front of subscribers.
              </p>
            </div>
            <Link href="/builders/submit" className="lp-cta-primary" style={{ flexShrink: 0 }}>Submit Your Agent →</Link>
          </div>
        </ScrollFadeUp>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div style={{ marginBottom: '.75rem', display: 'flex', justifyContent: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
          <Link href="/agents" style={{ color: 'var(--faint)', fontSize: '.8rem' }}>Agents</Link>
          <Link href="/builders" style={{ color: 'var(--faint)', fontSize: '.8rem' }}>Builders</Link>
          <Link href="/dashboard/backtest" style={{ color: 'var(--faint)', fontSize: '.8rem' }}>Strategy Lab</Link>
          <Link href="/login" style={{ color: 'var(--faint)', fontSize: '.8rem' }}>Sign In</Link>
          <Link href="/legal/terms" style={{ color: 'var(--faint)', fontSize: '.8rem' }}>Terms</Link>
          <Link href="/legal/privacy" style={{ color: 'var(--faint)', fontSize: '.8rem' }}>Privacy</Link>
          <Link href="/legal/securities" style={{ color: 'var(--faint)', fontSize: '.8rem' }}>Securities Disclaimer</Link>
          <a href="mailto:founders@launchase.com" style={{ color: 'var(--faint)', fontSize: '.8rem' }}>Contact</a>
        </div>
        <div>© 2026 Agent Securities Exchange (ASE) · Paper trading simulation only — not investment advice · Past performance does not guarantee future results</div>
      </footer>
    </div>
  )
}
