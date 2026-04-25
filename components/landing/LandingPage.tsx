'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import PublicNav from '@/components/ui/PublicNav'

interface AgentPreview {
  name: string; slug: string; primary_symbol: string; strategy_type: string
  ret: number | null; sharpe: number | null; max_drawdown: number | null; ticker: string; isLive: boolean
}

function useInView(threshold = 0.08) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect() } }, { threshold })
    obs.observe(el); return () => obs.disconnect()
  }, [threshold])
  return { ref: ref as React.RefObject<HTMLDivElement>, visible }
}

function MiniChart({ positive, height = 48, width = 120 }: { positive: boolean; height?: number; width?: number }) {
  const pts = Array.from({ length: 20 }, (_, i) => {
    const trend = positive ? i * 1.6 : -i * 1.1
    const noise = Math.sin(i * 0.75) * 7 + Math.cos(i * 1.4) * 4
    const y = (height * 0.6) - trend * 0.5 - noise
    return `${(i / 19) * width},${Math.max(3, Math.min(height - 3, y))}`
  }).join(' ')
  const color = positive ? '#16C784' : '#E45867'
  const id = `c-${positive}-${height}-${width}`
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.2"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
      <polygon points={`0,${height} ${pts} ${width},${height}`} fill={`url(#${id})`}/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  )
}

const TICKER_ITEMS = [
  { label: 'BTC/USD', value: '+18.4%', pos: true }, { label: 'ETH/USD', value: '+12.1%', pos: true },
  { label: 'SOL/USD', value: '+31.8%', pos: true }, { label: 'SPY', value: '+9.2%', pos: true },
  { label: 'QQQ', value: '+14.7%', pos: true }, { label: 'AAPL', value: '+7.3%', pos: true },
  { label: 'Live Agents', value: '24', pos: true }, { label: 'Avg Sharpe', value: '1.84', pos: true },
  { label: 'Win Rate', value: '62%', pos: true }, { label: 'Total AUM', value: '$2.4M', pos: true },
]

function TickerBar() {
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS]
  return (
    <div style={{ borderTop: '1px solid rgba(30,42,61,0.6)', borderBottom: '1px solid rgba(30,42,61,0.6)', background: 'rgba(6,17,31,0.7)', overflow: 'hidden', height: 36, display: 'flex', alignItems: 'center' }}>
      <div style={{ display: 'flex', whiteSpace: 'nowrap', animation: 'drift 32s linear infinite', willChange: 'transform' }}>
        {items.map((item, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0 1.4rem', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', borderRight: '1px solid rgba(30,42,61,0.6)' }}>
            <span style={{ color: 'rgba(85,101,122,0.9)', letterSpacing: '0.04em' }}>{item.label}</span>
            <span style={{ color: item.pos ? '#16C784' : '#E45867', fontWeight: 700 }}>{item.value}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

const DEMO_AGENTS = [
  { name: 'BTC Momentum Alpha', slug: 'btc-momentum', symbol: 'BTC-USD', type: 'Momentum', ret: 18.4, sharpe: 1.92, dd: -11.2, grade: 'A', pos: true },
  { name: 'ETH Mean Reversion', slug: 'eth-mean', symbol: 'ETH-USD', type: 'Mean Rev.', ret: 12.1, sharpe: 1.54, dd: -9.1, grade: 'B+', pos: true },
  { name: 'Composite Macro', slug: 'macro-composite', symbol: 'MULTI', type: 'Composite', ret: 22.7, sharpe: 2.1, dd: -14.3, grade: 'A+', pos: true },
]
const GRADE_COLOR: Record<string, string> = { 'A+': '#16C784', A: '#16C784', 'B+': '#4F8CFF', B: '#4F8CFF', C: '#F5B942', D: '#E45867', F: '#E45867' }

const STATS = [
  { label: 'Active Agents', value: '24', sub: 'live & verified' },
  { label: 'Total AUM', value: '$2.4M', sub: 'managed on-chain' },
  { label: 'Avg Sharpe', value: '1.84', sub: 'risk-adjusted return' },
  { label: 'Win Rate', value: '62%', sub: 'across all agents' },
]

const FEATURES = [
  { color: '#4F8CFF', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', title: 'Verified Performance', desc: 'Every agent\'s track record is audited. Live P&L, drawdowns, Sharpe ratios — no marketing fluff, just real numbers.' },
  { color: '#16C784', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', title: 'Non-Custodial', desc: 'Connect your wallet. Funds never leave your custody — agents execute via signed permissions you can revoke at any time.' },
  { color: '#8B5CF6', icon: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', title: 'Quant Lab', desc: 'Build and backtest your own algorithmic strategies using 20+ free data APIs, AI-assisted signal generation, and live deployment.' },
  { color: '#F5B942', icon: 'M13 10V3L4 14h7v7l9-11h-7z', title: 'One-Click Deploy', desc: 'Browse the marketplace, review backtested results, and subscribe to strategies. Capital allocated in seconds.' },
  { color: '#6DD3FF', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', title: 'Real-Time Monitoring', desc: 'Track every trade, NAV change, and signal in real time. Full visibility into what every agent is doing.' },
  { color: '#E45867', icon: 'M13 17h8m0 0V9m0 8l-8-8-4 4-6-6', title: 'Multi-Chain', desc: 'Crypto, DeFi, on-chain — access diverse strategies across L1s, L2s, and DeFi protocols from one unified terminal.' },
]

const HOW_STEPS = [
  { n: '01', title: 'Connect wallet', desc: 'Link MetaMask or any EVM wallet. Your address is your identity — no account form required.' },
  { n: '02', title: 'Browse agents', desc: 'Explore live performance metrics, backtests, and strategy logic before committing capital.' },
  { n: '03', title: 'Allocate capital', desc: 'Set your allocation. Agents execute autonomously within your defined risk parameters.' },
  { n: '04', title: 'Monitor live', desc: 'Track every trade and NAV update in real time. Revoke access anytime.' },
]

export default function LandingPage() {
  const [agents, setAgents] = useState<AgentPreview[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase.from('agents').select('*, agent_stats(nav_cents,total_return_pct,sharpe_ratio,max_drawdown_pct,snapshot_at), backtest_stats').eq('status', 'active').order('created_at', { ascending: false }).limit(6)
      .then(({ data }) => {
        if (!data) return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAgents(data.map((a: any) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const statsArr = Array.isArray(a.agent_stats) ? a.agent_stats : (a.agent_stats ? [a.agent_stats] : [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const s = statsArr.length > 0 ? statsArr.reduce((x: any, y: any) => x.snapshot_at > y.snapshot_at ? x : y) : null
          const bt = a.backtest_stats?.stats
          return { name: a.name, slug: a.slug, primary_symbol: a.primary_symbol ?? 'MULTI', strategy_type: a.strategy_type ?? 'momentum', ret: s?.total_return_pct ?? bt?.totalReturnPct ?? null, sharpe: s?.sharpe_ratio ?? bt?.sharpeRatio ?? null, max_drawdown: s?.max_drawdown_pct ?? bt?.maxDrawdownPct ?? null, ticker: a.ticker ?? a.name?.slice(0, 4).toUpperCase() ?? 'AGNT', isLive: !!s }
        }))
      })
  }, [])

  const displayAgents = agents.length >= 3 ? agents.slice(0, 3) : DEMO_AGENTS.map(d => ({ name: d.name, slug: d.slug, primary_symbol: d.symbol, strategy_type: d.type, ret: d.ret, sharpe: d.sharpe, max_drawdown: d.dd, ticker: d.slug.slice(0, 4).toUpperCase(), isLive: true }))

  const hero = useInView(0)
  const stats = useInView(0.05)
  const features = useInView(0.05)
  const how = useInView(0.05)
  const market = useInView(0.05)
  const terminal = useInView(0.05)
  const cta = useInView(0.1)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--white)', overflowX: 'hidden' }}>
      <PublicNav />

      {/* Background */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '90vw', height: '60vh', background: 'radial-gradient(ellipse 55% 45% at 50% -5%, rgba(79,140,255,0.15), transparent 70%)' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(79,140,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(79,140,255,0.04) 1px, transparent 1px)', backgroundSize: '60px 60px', maskImage: 'radial-gradient(ellipse 80% 60% at 50% 30%, black, transparent)' }} />
      </div>

      {/* ── HERO ── */}
      <section ref={hero.ref} style={{ padding: '8rem 1.5rem 3rem', maxWidth: 1240, margin: '0 auto', position: 'relative', zIndex: 1, opacity: hero.visible ? 1 : 0, transform: hero.visible ? 'none' : 'translateY(20px)', transition: 'opacity 0.7s ease, transform 0.7s ease' }}>
        <div style={{ textAlign: 'center', maxWidth: 820, margin: '0 auto' }}>
          {/* Badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.9rem', borderRadius: 100, background: 'rgba(22,199,132,0.08)', border: '1px solid rgba(22,199,132,0.22)', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '0.1em', color: 'var(--mint)', marginBottom: '1.75rem' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--mint)', display: 'inline-block', animation: 'breathe 2.5s ease-in-out infinite' }} />
            24 AGENTS LIVE NOW — REAL MONEY, REAL RETURNS
          </div>

          <h1 style={{ fontFamily: 'var(--font-body)', fontWeight: 900, fontSize: 'clamp(2.8rem, 6.5vw, 5rem)', lineHeight: 0.95, letterSpacing: '-0.05em', margin: '0 0 1.5rem' }}>
            <span style={{ background: 'linear-gradient(135deg, var(--white) 0%, var(--blue2) 40%, var(--mint) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Invest in AI
            </span>
            <br />
            <span style={{ background: 'linear-gradient(135deg, var(--white) 0%, var(--blue2) 40%, var(--mint) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              trading agents.
            </span>
          </h1>

          <p style={{ fontSize: 'clamp(1rem, 2vw, 1.15rem)', color: 'var(--text)', lineHeight: 1.75, maxWidth: 580, margin: '0 auto 2.5rem' }}>
            ASE is the marketplace for autonomous trading agents. Browse verified strategies with live track records, allocate capital in one click, and stay in full custody of your funds.
          </p>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '3rem' }}>
            <Link href="/signup" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.9rem 2rem', borderRadius: 12, background: 'linear-gradient(135deg, #3566E9, #4F8CFF)', color: '#fff', fontWeight: 700, fontSize: '0.94rem', textDecoration: 'none', transition: 'all 0.18s', boxShadow: '0 4px 20px rgba(79,140,255,0.3)' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(79,140,255,0.4)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(79,140,255,0.3)' }}>
              Start Investing Free
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
            <Link href="/dashboard/marketplace" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.9rem 1.75rem', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text)', fontWeight: 600, fontSize: '0.94rem', textDecoration: 'none', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(79,140,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(79,140,255,0.3)'; e.currentTarget.style.color = 'var(--white)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'var(--text)' }}>
              Browse Agents →
            </Link>
          </div>

          {/* Wallet badges */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--faint)', letterSpacing: '0.08em' }}>WORKS WITH:</div>
            {[{ label: 'MetaMask', icon: '🦊' }, { label: 'Coinbase', icon: '🔵' }, { label: 'WalletConnect', icon: '🔗' }, { label: 'Alpaca', icon: '🦙' }].map(w => (
              <div key={w.label} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--muted)' }}>
                {w.icon} {w.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TERMINAL UI PREVIEW ── */}
      <section style={{ padding: '0 1.5rem 4rem', maxWidth: 1240, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <div style={{ background: 'linear-gradient(180deg, rgba(16,26,45,0.98) 0%, rgba(11,23,40,0.96) 100%)', border: '1px solid rgba(30,42,61,0.8)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.5), 0 0 0 1px rgba(79,140,255,0.06)', maxWidth: 960, margin: '0 auto' }}>
          {/* Window chrome with tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem 0.6rem 1.25rem', borderBottom: '1px solid rgba(30,42,61,0.7)', background: 'rgba(6,17,31,0.5)' }}>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#E45867', display: 'inline-block' }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#F5B942', display: 'inline-block' }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#16C784', display: 'inline-block' }} />
            </div>
            <div style={{ display: 'flex', gap: '0.15rem', marginLeft: '1rem' }}>
              {['Portfolio', 'Agents', 'Activity'].map((tab, i) => (
                <div key={tab} style={{ padding: '0.25rem 0.6rem', borderRadius: 4, background: i === 0 ? 'rgba(79,140,255,0.12)' : 'transparent', border: i === 0 ? '1px solid rgba(79,140,255,0.25)' : '1px solid transparent', fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: i === 0 ? '#6BA3FF' : 'rgba(85,101,122,0.7)' }}>{tab}</div>
              ))}
            </div>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: 'rgba(85,101,122,0.7)' }}>ASE Dashboard</span>
          </div>
          {/* Content */}
          <div style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 260px', gap: '1.25rem' }} className="ui-preview-grid">
            <div>
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'rgba(85,101,122,0.8)', letterSpacing: '0.1em', marginBottom: '0.35rem' }}>PORTFOLIO VALUE</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '2rem', fontWeight: 800, color: '#F7FAFF', letterSpacing: '-0.03em' }}>$84,241.32</div>
                <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.5rem' }}>
                  {[{ l: 'TODAY P&L', v: '+$2,441', c: '#16C784' }, { l: 'ALL-TIME', v: '+22.7%', c: '#16C784' }, { l: 'TOTAL P&L', v: '+$15,241', c: '#16C784' }].map(m => (
                    <div key={m.l}><div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.45rem', color: 'rgba(85,101,122,0.7)', letterSpacing: '0.08em', marginBottom: '0.1rem' }}>{m.l}</div><div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 700, color: m.c }}>{m.v}</div></div>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.6rem', marginBottom: '1rem' }}>
                {[{ l: 'CASH', v: '$12,800' }, { l: 'INVESTED', v: '$71,441' }, { l: 'AGENTS', v: '3', c: '#16C784' }, { l: 'RISK', v: 'LOW', c: '#16C784' }].map(s => (
                  <div key={s.l} style={{ background: 'rgba(16,26,45,0.8)', border: '1px solid rgba(30,42,61,0.7)', borderRadius: 8, padding: '0.65rem 0.75rem' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.44rem', color: 'rgba(85,101,122,0.7)', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>{s.l}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, color: (s as { c?: string }).c ?? '#F7FAFF' }}>{s.v}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: 'rgba(11,23,40,0.6)', border: '1px solid rgba(30,42,61,0.6)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ display: 'flex', padding: '0.5rem 0.75rem', borderBottom: '1px solid rgba(30,42,61,0.5)' }}><span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.45rem', color: 'rgba(85,101,122,0.7)', letterSpacing: '0.1em' }}>YOUR ALLOCATIONS</span></div>
                {DEMO_AGENTS.map((a, i) => (
                  <div key={a.name} style={{ display: 'flex', alignItems: 'center', padding: '0.6rem 0.75rem', borderBottom: i < DEMO_AGENTS.length - 1 ? '1px solid rgba(30,42,61,0.4)' : 'none', gap: '0.6rem' }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(79,140,255,0.12)', border: '1px solid rgba(79,140,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.42rem', fontWeight: 700, color: '#6BA3FF' }}>{a.slug.slice(0, 3).toUpperCase()}</span></div>
                    <div style={{ flex: 1 }}><div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#F7FAFF' }}>{a.name}</div><div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.44rem', color: 'rgba(85,101,122,0.7)' }}>{a.symbol}</div></div>
                    <MiniChart positive={a.pos} height={24} width={48} />
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, color: '#16C784', textAlign: 'right', minWidth: 46 }}>+{a.ret}%</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontFamily: 'var(--font-mono)', fontSize: '0.42rem', color: '#16C784', minWidth: 48 }}><span style={{ width: 4, height: 4, borderRadius: '50%', background: '#16C784', display: 'inline-block' }} />ACTIVE</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ background: 'rgba(11,23,40,0.6)', border: '1px solid rgba(30,42,61,0.6)', borderRadius: 8, overflow: 'hidden', flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderBottom: '1px solid rgba(30,42,61,0.5)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.45rem', color: 'rgba(85,101,122,0.7)', letterSpacing: '0.1em' }}>LIVE ACTIVITY</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><span style={{ width: 4, height: 4, borderRadius: '50%', background: '#16C784', animation: 'pulse 2s infinite' }} /><span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.42rem', color: '#16C784' }}>LIVE</span></div>
                </div>
                {[{ dir: '↑', sym: 'BTC-USD', detail: 'Bought 0.05 @ $41,200', agent: 'BTC Alpha', t: '2m ago' }, { dir: '↓', sym: 'ETH-USD', detail: 'Sold 1.2 @ $2,641', agent: 'ETH Mean', t: '8m ago' }, { dir: '↑', sym: 'SPY', detail: 'Bought 10 @ $487', agent: 'Macro', t: '15m ago' }].map((ev, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 0.75rem', borderBottom: i < 2 ? '1px solid rgba(30,42,61,0.35)' : 'none' }}>
                    <div style={{ width: 18, height: 18, borderRadius: 5, background: ev.dir === '↑' ? 'rgba(22,199,132,0.12)' : 'rgba(228,88,103,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: ev.dir === '↑' ? '#16C784' : '#E45867', fontSize: '0.6rem', fontWeight: 700, flexShrink: 0 }}>{ev.dir}</div>
                    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: '0.65rem', fontWeight: 600, color: '#F7FAFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.agent}</div><div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.48rem', color: 'rgba(85,101,122,0.7)' }}>{ev.sym} · {ev.detail}</div></div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.48rem', color: 'rgba(85,101,122,0.7)', flexShrink: 0 }}>{ev.t}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: 'rgba(11,23,40,0.6)', border: '1px solid rgba(30,42,61,0.6)', borderRadius: 8, padding: '0.75rem' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.45rem', color: 'rgba(85,101,122,0.7)', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>TODAY&apos;S BRIEFING</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.48rem', color: 'rgba(85,101,122,0.7)', marginBottom: '0.25rem' }}>TOP PERFORMER</div>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#F7FAFF', marginBottom: '0.1rem' }}>Composite Macro</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700, color: '#16C784' }}>+22.7% all-time</div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '0.5rem 1.25rem', borderTop: '1px solid rgba(30,42,61,0.6)', background: 'rgba(6,17,31,0.4)' }}>
            {[{ l: 'ENV', v: 'PRODUCTION' }, { l: 'API', v: 'CONNECTED', c: '#16C784' }, { l: 'ALPACA', v: 'ACTIVE', c: '#16C784' }].map(s => (
              <div key={s.l} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.45rem', color: 'rgba(85,101,122,0.7)' }}>{s.l}:</span><span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.45rem', color: (s as { c?: string }).c ?? 'rgba(127,140,163,0.7)', fontWeight: 600 }}>{s.v}</span></div>
            ))}
            <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.45rem', color: 'rgba(85,101,122,0.5)' }}>ASE Platform · Not financial advice</div>
          </div>
        </div>
      </section>

      {/* ── TICKER ── */}
      <TickerBar />

      {/* ── STATS ── */}
      <section ref={stats.ref} style={{ padding: '5rem 1.5rem', maxWidth: 1240, margin: '0 auto', position: 'relative', zIndex: 1, opacity: stats.visible ? 1 : 0, transform: stats.visible ? 'none' : 'translateY(20px)', transition: 'opacity 0.6s ease, transform 0.6s ease' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1px', background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }} className="stats-grid-4">
          {STATS.map((s) => (
            <div key={s.label} style={{ background: 'var(--bg2)', padding: '2rem 1.5rem', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 'clamp(1.8rem, 3vw, 2.6rem)', color: 'var(--white)', letterSpacing: '-0.04em', marginBottom: '0.35rem' }}>{s.value}</div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)', marginBottom: '0.2rem' }}>{s.label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--faint)' }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section ref={features.ref} style={{ padding: '0 1.5rem 5rem', maxWidth: 1240, margin: '0 auto', position: 'relative', zIndex: 1, opacity: features.visible ? 1 : 0, transform: features.visible ? 'none' : 'translateY(20px)', transition: 'opacity 0.6s ease, transform 0.6s ease' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.12em', color: 'var(--blue)', textTransform: 'uppercase', marginBottom: '0.6rem' }}>WHY ASE</div>
          <h2 style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 'clamp(1.8rem, 3.5vw, 2.6rem)', letterSpacing: '-0.04em', color: 'var(--white)', maxWidth: 520, margin: '0 auto' }}>
            The infrastructure for autonomous trading
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.85rem' }} className="feat-grid">
          {FEATURES.map((f, i) => (
            <div key={f.title} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.5rem', opacity: features.visible ? 1 : 0, transform: features.visible ? 'none' : 'translateY(16px)', transition: `opacity 0.5s ${i * 55}ms, transform 0.5s ${i * 55}ms, border-color 0.15s, background 0.15s` }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `${f.color}44`; (e.currentTarget as HTMLElement).style.background = 'var(--bg3)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg2)' }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: `${f.color}14`, border: `1px solid ${f.color}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: f.color, marginBottom: '1rem' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={f.icon}/></svg>
              </div>
              <h3 style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--white)', marginBottom: '0.4rem' }}>{f.title}</h3>
              <p style={{ color: 'var(--muted)', fontSize: '0.82rem', lineHeight: 1.65 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section ref={how.ref} style={{ padding: '0 1.5rem 5rem', maxWidth: 1240, margin: '0 auto', position: 'relative', zIndex: 1, opacity: how.visible ? 1 : 0, transform: how.visible ? 'none' : 'translateY(20px)', transition: 'opacity 0.6s ease, transform 0.6s ease' }}>
        <div style={{ background: 'linear-gradient(135deg, rgba(11,23,40,0.98), rgba(16,26,45,0.95))', border: '1px solid var(--border)', borderRadius: 18, padding: '3rem 2.5rem', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, right: 0, width: '40%', height: '100%', background: 'radial-gradient(ellipse 60% 80% at 100% 50%, rgba(22,199,132,0.06), transparent)', pointerEvents: 'none' }} />
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.12em', color: 'var(--mint)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>HOW IT WORKS</div>
            <h2 style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', letterSpacing: '-0.04em', color: 'var(--white)', margin: 0 }}>
              From wallet to returns in 4 steps
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '2rem', position: 'relative' }} className="steps-grid">
            {HOW_STEPS.map((s, i) => (
              <div key={s.n} style={{ position: 'relative' }}>
                {i < HOW_STEPS.length - 1 && <div style={{ position: 'absolute', top: 20, left: '70%', width: '55%', height: 1, background: 'linear-gradient(90deg, var(--border2), transparent)' }} className="step-con" />}
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, rgba(79,140,255,0.18), rgba(22,199,132,0.1))', border: '1px solid rgba(79,140,255,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.78rem', color: 'var(--blue)', marginBottom: '1rem' }}>{s.n}</div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--white)', marginBottom: '0.4rem' }}>{s.title}</div>
                <div style={{ color: 'var(--muted)', fontSize: '0.82rem', lineHeight: 1.6 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── MARKETPLACE PREVIEW ── */}
      <section ref={market.ref} style={{ padding: '0 1.5rem 5rem', maxWidth: 1240, margin: '0 auto', position: 'relative', zIndex: 1, opacity: market.visible ? 1 : 0, transform: market.visible ? 'none' : 'translateY(20px)', transition: 'opacity 0.6s ease, transform 0.6s ease' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.12em', color: 'var(--blue)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>MARKETPLACE</div>
            <h2 style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', letterSpacing: '-0.04em', color: 'var(--white)', margin: 0 }}>Live strategies, verified returns</h2>
          </div>
          <Link href="/dashboard/marketplace" style={{ padding: '0.65rem 1.25rem', borderRadius: 10, background: 'rgba(79,140,255,0.08)', border: '1px solid rgba(79,140,255,0.22)', color: 'var(--blue2)', fontWeight: 600, fontSize: '0.85rem', textDecoration: 'none', transition: 'all 0.15s', whiteSpace: 'nowrap' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,140,255,0.16)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(79,140,255,0.08)'}>
            Open marketplace →
          </Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.85rem' }} className="agents-grid">
          {displayAgents.map((agent, idx) => {
            const pos = (agent.ret ?? 0) >= 0
            const demoG = DEMO_AGENTS[idx]
            const grade = demoG?.grade ?? 'B'
            return (
              <Link key={agent.slug} href={`/agents/${agent.slug}`} style={{ display: 'block', textDecoration: 'none', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem', opacity: market.visible ? 1 : 0, transform: market.visible ? 'none' : 'translateY(12px)', transition: `opacity 0.4s ${idx * 80}ms, transform 0.4s ${idx * 80}ms, border-color 0.15s, background 0.15s` }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(79,140,255,0.28)'; e.currentTarget.style.background = 'var(--bg3)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.85rem' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--white)', marginBottom: '0.2rem' }}>{agent.name}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--faint)', textTransform: 'uppercase' }}>{agent.strategy_type.replace(/_/g, ' ')}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700, color: GRADE_COLOR[grade] ?? 'var(--blue)', background: `${GRADE_COLOR[grade] ?? 'var(--blue)'}18`, border: `1px solid ${GRADE_COLOR[grade] ?? 'var(--blue)'}28`, padding: '0.1rem 0.4rem', borderRadius: 5 }}>{grade}</span>
                    {agent.isLive && <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--mint)' }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--mint)', display: 'inline-block', animation: 'breathe 2.5s ease-in-out infinite' }} />LIVE</span>}
                  </div>
                </div>
                <div style={{ height: 48, marginBottom: '0.85rem', borderRadius: 7, overflow: 'hidden' }}><MiniChart positive={pos} height={48} /></div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.5rem', color: pos ? 'var(--mint)' : 'var(--red)', marginBottom: '0.85rem', letterSpacing: '-0.03em' }}>
                  {pos ? '+' : ''}{(agent.ret ?? 0).toFixed(1)}%
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '0.5rem' }}>
                  {[{ l: 'Sharpe', v: agent.sharpe !== null ? agent.sharpe.toFixed(2) : '—', c: 'var(--white)' }, { l: 'Max DD', v: agent.max_drawdown !== null ? `${agent.max_drawdown.toFixed(1)}%` : '—', c: 'var(--red)' }].map(m => (
                    <div key={m.l} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 7, padding: '0.55rem 0.7rem' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.48rem', color: 'var(--faint)', letterSpacing: '0.08em', marginBottom: '0.15rem' }}>{m.l}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.82rem', color: m.c }}>{m.v}</div>
                    </div>
                  ))}
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      {/* ── CTA ── */}
      <section ref={cta.ref} style={{ padding: '0 1.5rem 6rem', maxWidth: 1240, margin: '0 auto', position: 'relative', zIndex: 1, opacity: cta.visible ? 1 : 0, transform: cta.visible ? 'none' : 'translateY(20px)', transition: 'opacity 0.6s ease, transform 0.6s ease' }}>
        <div style={{ borderRadius: 20, padding: '4rem 2.5rem', background: 'linear-gradient(135deg, rgba(79,140,255,0.12) 0%, rgba(22,199,132,0.07) 100%)', border: '1px solid rgba(79,140,255,0.2)', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 60% at 50% 110%, rgba(22,199,132,0.07), transparent)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.12em', color: 'var(--mint)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>GET STARTED TODAY</div>
            <h2 style={{ fontFamily: 'var(--font-body)', fontWeight: 900, fontSize: 'clamp(1.8rem, 4vw, 3rem)', letterSpacing: '-0.05em', color: 'var(--white)', maxWidth: 560, margin: '0 auto 1rem' }}>
              Your edge is one wallet connect away.
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: '1rem', maxWidth: 440, margin: '0 auto 2rem', lineHeight: 1.7 }}>
              Join investors allocating to verified AI strategies. Full custody. Transparent performance. No lock-ins.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/signup" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.9rem 2rem', borderRadius: 12, background: 'linear-gradient(135deg, #3566E9, #4F8CFF)', color: '#fff', fontWeight: 700, fontSize: '0.95rem', textDecoration: 'none', boxShadow: '0 4px 20px rgba(79,140,255,0.3)' }}>Create Free Account</Link>
              <Link href="/dashboard/marketplace" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.9rem 1.75rem', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border2)', color: 'var(--text)', fontWeight: 600, fontSize: '0.95rem', textDecoration: 'none' }}>Explore Agents</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: '1px solid var(--border)', background: 'rgba(6,17,31,0.8)', position: 'relative', zIndex: 1 }}>
        {/* Main footer */}
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '3rem 1.5rem 2rem', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '2rem' }} className="footer-grid">
          {/* Brand */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/transparent_logo.png" alt="ASE" style={{ height: 28, width: 'auto', objectFit: 'contain' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.78rem', color: 'var(--white)', letterSpacing: '0.08em' }}>ASE</span>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.7, maxWidth: 200, marginBottom: '1rem' }}>
              The marketplace for autonomous AI trading agents. Built for quants, open to all.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {['X', 'Discord', 'GitHub'].map(s => (
                <a key={s} href="#" style={{ padding: '0.3rem 0.6rem', borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--faint)', textDecoration: 'none', transition: 'all 0.12s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--white)'; e.currentTarget.style.borderColor = 'var(--border2)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--faint)'; e.currentTarget.style.borderColor = 'var(--border)' }}>{s}</a>
              ))}
            </div>
          </div>

          {/* Product */}
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 700, color: 'var(--faint)', letterSpacing: '0.12em', marginBottom: '0.85rem' }}>PRODUCT</div>
            {[{ label: 'Marketplace', href: '/dashboard/marketplace' }, { label: 'Quant Lab', href: '/dashboard/build' }, { label: 'Backtest', href: '/dashboard/backtest' }, { label: 'Documentation', href: '/dashboard/build/docs' }, { label: 'Submit Agent', href: '/agents/submit' }].map(l => (
              <Link key={l.label} href={l.href} style={{ display: 'block', fontSize: '0.82rem', color: 'var(--muted)', textDecoration: 'none', marginBottom: '0.5rem', transition: 'color 0.12s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--white)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>{l.label}</Link>
            ))}
          </div>

          {/* Company */}
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 700, color: 'var(--faint)', letterSpacing: '0.12em', marginBottom: '0.85rem' }}>COMPANY</div>
            {[{ label: 'About', href: '#' }, { label: 'Blog', href: '#' }, { label: 'Careers', href: '#' }, { label: 'Investors', href: '/investors' }, { label: 'Builders', href: '/builders' }].map(l => (
              <Link key={l.label} href={l.href} style={{ display: 'block', fontSize: '0.82rem', color: 'var(--muted)', textDecoration: 'none', marginBottom: '0.5rem', transition: 'color 0.12s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--white)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>{l.label}</Link>
            ))}
          </div>

          {/* Legal */}
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 700, color: 'var(--faint)', letterSpacing: '0.12em', marginBottom: '0.85rem' }}>LEGAL</div>
            {[{ label: 'Terms of Service', href: '/legal/terms' }, { label: 'Privacy Policy', href: '/legal/privacy' }, { label: 'Securities Disclosure', href: '/legal/securities' }, { label: 'Risk Disclosure', href: '/legal/securities' }, { label: 'Cookie Policy', href: '#' }].map(l => (
              <Link key={l.label} href={l.href} style={{ display: 'block', fontSize: '0.82rem', color: 'var(--muted)', textDecoration: 'none', marginBottom: '0.5rem', transition: 'color 0.12s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--white)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>{l.label}</Link>
            ))}
          </div>
        </div>

        {/* Legal disclaimer */}
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '1.5rem', borderTop: '1px solid rgba(30,42,61,0.5)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--faint)', lineHeight: 1.7, marginBottom: '1rem' }}>
            <strong style={{ color: 'var(--muted)', fontWeight: 700 }}>IMPORTANT DISCLOSURE:</strong> ASE (Autonomous Strategy Exchange) is not a registered investment advisor, broker-dealer, or securities exchange. The information and services provided on this platform are for educational and informational purposes only and do not constitute investment advice, financial advice, trading advice, or any other sort of advice. Past performance of any trading agent or strategy is not indicative of future results. All trading involves risk of loss. You should only invest money you can afford to lose. AI trading agents may experience significant losses. ASE does not guarantee profits or specific outcomes.
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--faint)', lineHeight: 1.7, marginBottom: '1.5rem' }}>
            Cryptocurrency trading involves substantial risk and is not appropriate for all investors. Regulatory status of certain services may vary by jurisdiction. Users are responsible for compliance with applicable laws and regulations in their jurisdiction. By using ASE, you acknowledge that you have read and understood these disclosures and agree to our Terms of Service and Privacy Policy.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--faint)' }}>© 2026 ASE · Autonomous Strategy Exchange · All rights reserved</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'rgba(228,88,103,0.7)', fontWeight: 700, letterSpacing: '0.06em' }}>⚠ NOT FINANCIAL ADVICE · TRADE AT YOUR OWN RISK</div>
          </div>
        </div>
      </footer>

      <style>{`
        @media(max-width:900px){
          .hero-grid{grid-template-columns:1fr!important}
          .steps-grid{grid-template-columns:repeat(2,1fr)!important}
          .feat-grid{grid-template-columns:repeat(2,1fr)!important}
          .agents-grid{grid-template-columns:repeat(2,1fr)!important}
          .stats-grid-4{grid-template-columns:repeat(2,1fr)!important}
          .ui-preview-grid{grid-template-columns:1fr!important}
          .footer-grid{grid-template-columns:repeat(2,1fr)!important}
          .step-con{display:none}
        }
        @media(max-width:540px){
          .feat-grid{grid-template-columns:1fr!important}
          .agents-grid{grid-template-columns:1fr!important}
          .stats-grid-4{grid-template-columns:1fr!important}
          .footer-grid{grid-template-columns:1fr!important}
          .steps-grid{grid-template-columns:1fr!important}
        }
        @keyframes drift{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        @keyframes breathe{0%,100%{opacity:.4;box-shadow:0 0 4px currentColor}50%{opacity:1;box-shadow:0 0 12px currentColor}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
      `}</style>
    </div>
  )
}
