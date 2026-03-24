'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { HoverCard } from '@/components/ui/hover-card'

const AGENTS = [
  { ticker: '$BTCM', name: 'BTC Momentum', ret: '+18.4%', nav: '$118.40', pos: true, spark: [80,85,82,90,95,100,97,105,112,118], type: 'Momentum' },
  { ticker: '$ETHR', name: 'ETH Mean Revert', ret: '+9.2%', nav: '$109.20', pos: true, spark: [100,97,95,98,102,100,104,106,108,109], type: 'Mean Revert' },
  { ticker: '$CRTR', name: 'Crypto Trend', ret: '+24.1%', nav: '$124.10', pos: true, spark: [80,84,88,91,96,102,108,114,120,124], type: 'Trend Following' },
  { ticker: '$SOLB', name: 'SOL Breakout', ret: '+31.7%', nav: '$131.70', pos: true, spark: [80,82,85,90,100,108,118,125,130,132], type: 'Breakout' },
  { ticker: '$DEFI', name: 'DeFi Basket', ret: '+12.8%', nav: '$112.80', pos: true, spark: [90,92,94,96,98,100,104,108,110,113], type: 'Multi-Asset' },
]

const TICKER_ITEMS = [
  { ticker: '$BTCM', price: '$118.40', chg: '+18.4%', pos: true },
  { ticker: '$ETHR', price: '$109.20', chg: '+9.2%', pos: true },
  { ticker: '$CRTR', price: '$124.10', chg: '+24.1%', pos: true },
  { ticker: '$SOLB', price: '$131.70', chg: '+31.7%', pos: true },
  { ticker: '$DEFI', price: '$112.80', chg: '+12.8%', pos: true },
  { ticker: 'BTC/USD', price: '$67,240', chg: '+2.1%', pos: true },
  { ticker: 'ETH/USD', price: '$3,480', chg: '+1.4%', pos: true },
  { ticker: 'SOL/USD', price: '$142.30', chg: '-0.8%', pos: false },
]

const ROT_WORDS = ['Own the Algorithm', 'Own the Future', 'Own the Alpha']

function Spark({ data, pos }: { data: number[]; pos: boolean }) {
  const w = 80, h = 28, pad = 2
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1
  const step = (w - pad * 2) / (data.length - 1)
  const pts = data.map((v, i) => {
    const x = pad + i * step
    const y = pad + (1 - (v - min) / span) * (h - pad * 2)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const col = pos ? '#0EAD6E' : '#E84040'
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ display: 'block' }}>
      <path d={pts} fill="none" stroke={col} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function ScrollFadeUp({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.unobserve(entry.target)
        }
      },
      { threshold: 0.1 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      style={{
        animation: visible ? 'fadeUp .6s ease forwards' : 'none',
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : 'translateY(20px)'
      }}
    >
      {children}
    </div>
  )
}

export default function LandingPage() {
  const [rotIdx, setRotIdx] = useState(0)
  const [navScrolled, setNavScrolled] = useState(false)

  useEffect(() => {
    const iv = setInterval(() => setRotIdx(i => (i + 1) % ROT_WORDS.length), 3000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    const handler = () => setNavScrolled(window.scrollY > 30)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--white)', overflowX: 'hidden' }}>
      {/* NAVBAR - Fixed, glass effect on scroll */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
        borderBottom: navScrolled ? '1px solid var(--border)' : '1px solid transparent',
        background: navScrolled ? 'rgba(7,9,15,0.92)' : 'transparent',
        backdropFilter: navScrolled ? 'blur(16px)' : 'none',
        transition: 'all .3s',
      }}>
        <div style={{ maxWidth: 1160, margin: '0 auto', padding: '0 1.5rem', height: 64, display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <Link href="/" style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.2rem', letterSpacing: '-.02em' }}>
            AS<span style={{ color: 'var(--gold)' }}>E</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', marginLeft: 'auto' }} className="nav-desktop">
            <Link href="#agents" style={{ fontSize: '.88rem', fontWeight: 600, color: 'var(--muted)', transition: 'color .2s' }} onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--white)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted)')}>Agents</Link>
            <Link href="#how" style={{ fontSize: '.88rem', fontWeight: 600, color: 'var(--muted)', transition: 'color .2s' }} onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--white)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted)')}>How It Works</Link>
            <Link href="/login" style={{ fontSize: '.88rem', fontWeight: 600, color: 'var(--muted)', transition: 'color .2s' }} onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--white)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted)')}>Login</Link>
            <Link href="/signup" className="btn-primary" style={{ fontSize: '.88rem', padding: '.55rem 1.2rem', borderRadius: 10 }}>
              Get Started →
            </Link>
          </div>
        </div>
      </nav>

      {/* TICKER BAR - Scrolling ticker below nav */}
      <div style={{ position: 'fixed', top: 64, left: 0, right: 0, zIndex: 900, background: 'rgba(7,9,15,.92)', borderBottom: '1px solid var(--border)', backdropFilter: 'blur(10px)', height: 36, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', letterSpacing: '.12em', color: 'var(--gold)', padding: '0 1rem', borderRight: '1px solid var(--border)', whiteSpace: 'nowrap', flexShrink: 0 }}>LIVE</div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ display: 'flex', width: 'max-content', animation: 'tickerMove 24s linear infinite' }}>
            {[...TICKER_ITEMS, ...TICKER_ITEMS].map((t, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem', padding: '0 1.4rem', fontFamily: 'var(--font-mono)', fontSize: '.65rem', borderRight: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                <span style={{ color: 'var(--white)', fontWeight: 600 }}>{t.ticker}</span>
                <span style={{ color: 'var(--muted)' }}>{t.price}</span>
                <span style={{ color: t.pos ? 'var(--green)' : 'var(--red)' }}>{t.chg}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* HERO SECTION */}
      <section style={{ minHeight: '100vh', padding: '140px 1.5rem 80px', display: 'flex', alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.015) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.015) 1px,transparent 1px)', backgroundSize: '60px 60px', opacity: .4, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 50% at 70% 50%,rgba(232,172,32,.04) 0%,transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 1160, margin: '0 auto', width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center', position: 'relative' }} className="hero-grid">
          <ScrollFadeUp>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem', fontFamily: 'var(--font-mono)', fontSize: '.62rem', letterSpacing: '.1em', color: 'var(--gold)', border: '1px solid rgba(232,172,32,.25)', background: 'rgba(232,172,32,.06)', padding: '.35rem .85rem', borderRadius: 999, marginBottom: '1.5rem' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', animation: 'dotBlink 1.8s infinite', display: 'inline-block' }} />
                5 AGENTS LIVE · TRADING NOW
              </div>

              <h1 style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(2.8rem,6vw,4.2rem)', fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.15, marginBottom: '1.25rem' }}>
                <span style={{ display: 'inline-block', overflow: 'hidden', position: 'relative', verticalAlign: 'text-bottom', minHeight: '1.15em' }}>
                  {ROT_WORDS.map((w, i) => (
                    <span key={w} style={{
                      display: 'block',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      whiteSpace: 'nowrap',
                      transition: 'transform .6s cubic-bezier(.4,0,.2,1), opacity .6s',
                      transform: i === rotIdx ? 'translateY(0)' : i < rotIdx ? 'translateY(-100%)' : 'translateY(100%)',
                      opacity: i === rotIdx ? 1 : 0,
                      background: 'linear-gradient(135deg,#E8AC20,#F5C842)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text'
                    }}>
                      {w}
                    </span>
                  ))}
                </span>
              </h1>

              <p style={{ fontSize: '1.05rem', color: 'var(--muted)', lineHeight: 1.75, maxWidth: 520, marginBottom: '2rem' }}>
                Invest in verified trading strategies as assets — with full transparency, real performance, and aligned incentives.
              </p>

              <div style={{ marginBottom: '1rem' }}>
                <Link href="/signup" className="btn-primary">Get Started →</Link>
              </div>
            </div>
          </ScrollFadeUp>

          {/* Hero Card Preview */}
          <ScrollFadeUp>
            <div style={{ position: 'relative' }}>
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,.7)' }}>
                <div className="win-bar">
                  <span className="dot dot-r" /><span className="dot dot-y" /><span className="dot dot-g" />
                  <span className="win-title" style={{ marginLeft: '.3rem' }}>ase.app · Live Agents</span>
                  <span className="pill pill-green" style={{ marginLeft: 'auto' }}>TRADING</span>
                </div>
                <div style={{ padding: '1rem' }}>
                  {AGENTS.slice(0, 4).map((a, i) => (
                    <div key={a.ticker} style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.6rem .5rem', borderBottom: i < 3 ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(232,172,32,.08)', border: '1px solid rgba(232,172,32,.15)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: 'var(--gold)', fontWeight: 700, flexShrink: 0 }}>
                        {a.ticker.replace('$', '').slice(0, 2)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: 'var(--font-head)', fontSize: '.78rem', fontWeight: 700 }}>{a.name}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)' }}>{a.ticker}</div>
                      </div>
                      <Spark data={a.spark} pos={a.pos} />
                      <div style={{ textAlign: 'right', minWidth: 52 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', fontWeight: 700 }}>{a.nav}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--green)' }}>{a.ret}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollFadeUp>
        </div>
      </section>

      {/* THE SHIFT - Before/After comparison */}
      <section style={{ padding: '80px 1.5rem', background: 'rgba(0,0,0,.3)' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <div className="eyebrow">THE PARADIGM SHIFT</div>
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(1.8rem,3.5vw,2.8rem)', fontWeight: 800, marginTop: '.5rem' }}>From closed systems to owned assets</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1.5rem' }} className="shift-grid">
            {[
              { label: 'Before: Hedge Funds', desc: 'Inaccessible to most investors', badge: 'Closed', badgeColor: 'rgba(232,64,64,.1)', badgeText: '#E84040' },
              { label: 'Before: Copy Trading', desc: 'No ownership, no alignment', badge: 'No Stake', badgeColor: 'rgba(232,64,64,.1)', badgeText: '#E84040' },
              { label: 'Before: Algo Bots', desc: 'Misaligned incentives', badge: 'Opaque', badgeColor: 'rgba(232,64,64,.1)', badgeText: '#E84040' },
            ].map((item, i) => (
              <ScrollFadeUp key={i}>
                <HoverCard className="card" style={{ padding: '2rem 1.5rem', opacity: 0.6 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', letterSpacing: '.1em', color: 'var(--muted)', marginBottom: '1rem', textTransform: 'uppercase' }}>{item.label}</div>
                  <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 700, marginBottom: '.75rem' }}>{item.desc}</div>
                  <div style={{ display: 'inline-block', padding: '.35rem .75rem', borderRadius: 6, background: item.badgeColor, color: item.badgeText, fontFamily: 'var(--font-mono)', fontSize: '.58rem', fontWeight: 600 }}>{item.badge}</div>
                </HoverCard>
              </ScrollFadeUp>
            ))}
            {/* Arrow or divider */}
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '1rem 0', fontSize: '1.5rem', color: 'var(--gold)' }}>↓ The ASE Difference ↓</div>
            {[
              { label: 'Now: ASE Agents', desc: 'Own real trading strategies', badge: 'Accessible', badgeColor: 'rgba(14,173,110,.1)', badgeText: '#0EAD6E' },
              { label: 'Now: True Ownership', desc: 'Your tokens appreciate with NAV', badge: 'Owned', badgeColor: 'rgba(14,173,110,.1)', badgeText: '#0EAD6E' },
              { label: 'Now: Verified Performance', desc: 'Aligned incentives at every level', badge: 'Transparent', badgeColor: 'rgba(14,173,110,.1)', badgeText: '#0EAD6E' },
            ].map((item, i) => (
              <ScrollFadeUp key={i + 3}>
                <HoverCard className="card" style={{ padding: '2rem 1.5rem', borderColor: 'rgba(14,173,110,.2)' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', letterSpacing: '.1em', color: 'var(--gold)', marginBottom: '1rem', textTransform: 'uppercase' }}>{item.label}</div>
                  <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 700, marginBottom: '.75rem' }}>{item.desc}</div>
                  <div style={{ display: 'inline-block', padding: '.35rem .75rem', borderRadius: 6, background: item.badgeColor, color: item.badgeText, fontFamily: 'var(--font-mono)', fontSize: '.58rem', fontWeight: 600 }}>{item.badge}</div>
                </HoverCard>
              </ScrollFadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS - 3 steps */}
      <section id="how" style={{ padding: '80px 1.5rem' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <div className="eyebrow">HOW IT WORKS</div>
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(1.8rem,3.5vw,2.8rem)', fontWeight: 800, marginTop: '.5rem' }}>Own, Trade, Grow</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1.25rem' }} className="steps-grid">
            {[
              { n: '01', title: 'OWN', desc: 'Buy tokens in a trading agent\'s capital pool and own a real piece of their strategy' },
              { n: '02', title: 'TRADE', desc: 'Agent executes verified strategies 24/7 on live markets with full transparency' },
              { n: '03', title: 'GROW', desc: 'Profits compound into NAV, your token appreciates with the agent\'s success' },
            ].map((s) => (
              <ScrollFadeUp key={s.n}>
                <HoverCard className="card" style={{ padding: '2rem 1.5rem' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(232,172,32,.1)', border: '1px solid rgba(232,172,32,.2)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-mono)', fontSize: '.75rem', color: 'var(--gold)', fontWeight: 700, marginBottom: '1.5rem' }}>{s.n}</div>
                  <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.15rem', fontWeight: 800, marginBottom: '1rem' }}>{s.title}</div>
                  <div style={{ fontSize: '.92rem', color: 'var(--muted)', lineHeight: 1.7 }}>{s.desc}</div>
                </HoverCard>
              </ScrollFadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* WHY DIFFERENT - 4 core differentiators */}
      <section style={{ padding: '80px 1.5rem', background: 'rgba(0,0,0,.3)' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <div className="eyebrow">WHY ASE IS DIFFERENT</div>
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(1.8rem,3.5vw,2.8rem)', fontWeight: 800, marginTop: '.5rem' }}>Built for trust and transparency</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1.5rem' }} className="why-grid">
            {[
              { icon: '◆', title: 'Execution Transparency', desc: 'Every trade logged and auditable on-chain with full execution records' },
              { icon: '▲', title: 'Authentication Pipeline', desc: 'Four-gate verification: OOS testing, CPCV, Deflated Sharpe, 90-day paper trading' },
              { icon: '★', title: 'Performance-Aligned Fees', desc: 'Developers profit only when you do — no AUM-based rent extraction' },
              { icon: '◉', title: 'Institutional Custody', desc: 'Qualified custodians hold all assets with proof of reserve guarantees' },
            ].map((item, i) => (
              <ScrollFadeUp key={i}>
                <HoverCard className="card" style={{ padding: '1.75rem 1.5rem' }}>
                  <div style={{ fontSize: '1.8rem', color: 'var(--gold)', marginBottom: '.5rem' }}>{item.icon}</div>
                  <div style={{ fontFamily: 'var(--font-head)', fontSize: '1rem', fontWeight: 800, marginBottom: '.75rem' }}>{item.title}</div>
                  <div style={{ fontSize: '.9rem', color: 'var(--muted)', lineHeight: 1.65 }}>{item.desc}</div>
                </HoverCard>
              </ScrollFadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* AUTHENTICATION PIPELINE - 4 gates */}
      <section style={{ padding: '80px 1.5rem' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div className="eyebrow">VERIFICATION PROCESS</div>
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(1.8rem,3.5vw,2.8rem)', fontWeight: 800, marginTop: '.5rem' }}>Four-gate authentication pipeline</h2>
            <p style={{ fontSize: '.95rem', color: 'var(--muted)', marginTop: '1rem', maxWidth: 500, margin: '1rem auto 0' }}>Every agent must pass rigorous testing before going live</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '2rem' }}>
            {[
              { num: '1', name: 'Data Separation', detail: 'Out-of-Sample Testing' },
              { num: '2', name: 'CPCV', detail: 'PBO Score < 0.40' },
              { num: '3', name: 'Deflated Sharpe', detail: 'Statistical Validity' },
              { num: '4', name: 'Paper Trading', detail: '90 Days Live' },
            ].map((gate, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <ScrollFadeUp>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ width: 60, height: 60, borderRadius: 50, background: 'rgba(232,172,32,.1)', border: '2px solid rgba(232,172,32,.3)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-head)', fontSize: '1.5rem', fontWeight: 800, color: 'var(--gold)', marginBottom: '.5rem' }}>{gate.num}</div>
                    <div style={{ fontFamily: 'var(--font-head)', fontSize: '.85rem', fontWeight: 700 }}>{gate.name}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--faint)', marginTop: '.25rem' }}>{gate.detail}</div>
                  </div>
                </ScrollFadeUp>
                {i < 3 && <div style={{ color: 'var(--gold)', fontSize: '1.2rem', opacity: 0.3 }}>→</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* RISK TRANSPARENCY - Tiered system */}
      <section style={{ padding: '80px 1.5rem', background: 'rgba(0,0,0,.3)' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div className="eyebrow">RISK MANAGEMENT</div>
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(1.8rem,3.5vw,2.8rem)', fontWeight: 800, marginTop: '.5rem' }}>Transparent risk tiers</h2>
          </div>
          <ScrollFadeUp>
            <div style={{ maxWidth: 700, margin: '0 auto' }}>
              {[
                { level: 'Yellow', drawdown: '-15%', action: 'Enhanced Reporting', color: '#FFD60A' },
                { level: 'Orange', drawdown: '-25%', action: 'Issuance Suspended', color: '#FFA500' },
                { level: 'Red', drawdown: '-40%', action: 'Hard Delisting', color: '#E84040' },
              ].map((tier) => (
                <div key={tier.level} style={{ marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.5rem' }}>
                    <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}>{tier.level} Alert</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', fontWeight: 600, color: tier.color }}>{tier.drawdown}</span>
                  </div>
                  <div style={{ height: 8, background: 'rgba(255,255,255,.05)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: tier.color, width: Math.abs(parseInt(tier.drawdown)) / 40 * 100 + '%', borderRadius: 4 }} />
                  </div>
                  <div style={{ fontSize: '.8rem', color: 'var(--muted)', marginTop: '.35rem' }}>{tier.action}</div>
                </div>
              ))}
            </div>
          </ScrollFadeUp>
        </div>
      </section>

      {/* LIVE AGENTS - 5 agent cards in terminal style */}
      <section id="agents" style={{ padding: '80px 1.5rem' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div className="eyebrow">LIVE AGENTS</div>
              <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(1.8rem,3.5vw,2.8rem)', fontWeight: 800, marginTop: '.5rem' }}>Five verified trading strategies</h2>
            </div>
            <Link href="/agents" className="btn-secondary">View All Agents →</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '1.25rem' }} className="agents-grid">
            {AGENTS.map((a, i) => (
              <ScrollFadeUp key={a.ticker}>
                <HoverCard className="card" style={{ padding: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.75rem' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '.95rem' }}>{a.name}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', marginTop: '.15rem' }}>{a.ticker}</div>
                    </div>
                    <span className="pill pill-green" style={{ fontSize: '.52rem' }}>LIVE</span>
                  </div>
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.5rem', fontWeight: 800, color: 'var(--green)' }}>{a.ret}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--faint)' }}>30D Return (paper)</div>
                  </div>
                  <div style={{ marginBottom: '1rem' }}>
                    <Spark data={a.spark} pos={a.pos} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '.75rem', borderTop: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.68rem', fontWeight: 700 }}>{a.nav}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', marginTop: '.1rem' }}>NAV/share</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--muted)' }}>Strategy</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', marginTop: '.1rem' }}>{a.type}</div>
                    </div>
                  </div>
                </HoverCard>
              </ScrollFadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* FOR INVESTORS / FOR DEVELOPERS */}
      <section style={{ padding: '80px 1.5rem', background: 'rgba(0,0,0,.3)' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem' }} className="audience-grid">
            <ScrollFadeUp>
              <div>
                <div className="eyebrow">FOR INVESTORS</div>
                <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1.5rem', fontWeight: 800, marginTop: '.5rem', marginBottom: '1rem' }}>Access institutional strategies</h3>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {[
                    'Trade verified algorithms with real performance',
                    'Own tokens that appreciate with agent success',
                    'Access portfolio tools and analytics',
                    'Buy and sell at any time',
                    'Start with as little as $100'
                  ].map((item) => (
                    <li key={item} style={{ display: 'flex', gap: '.75rem', fontSize: '.95rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                      <span style={{ color: 'var(--green)', marginTop: '.1rem', flexShrink: 0 }}>✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
                <Link href="/signup" className="btn-primary" style={{ marginTop: '2rem', display: 'inline-block' }}>Start Investing →</Link>
              </div>
            </ScrollFadeUp>
            <ScrollFadeUp>
              <div>
                <div className="eyebrow">FOR DEVELOPERS</div>
                <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1.5rem', fontWeight: 800, marginTop: '.5rem', marginBottom: '1rem' }}>Monetize your strategies</h3>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {[
                    'Launch your algorithm on real markets',
                    'Earn fees only when investors profit',
                    'Get verified through our 4-gate pipeline',
                    'Access $1M+ in aggregate capital',
                    'Get transparent performance analytics'
                  ].map((item) => (
                    <li key={item} style={{ display: 'flex', gap: '.75rem', fontSize: '.95rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                      <span style={{ color: 'var(--green)', marginTop: '.1rem', flexShrink: 0 }}>✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
                <Link href="/agents/submit" className="btn-primary" style={{ marginTop: '2rem', display: 'inline-block' }}>Submit Your Agent →</Link>
              </div>
            </ScrollFadeUp>
          </div>
        </div>
      </section>

      {/* STATS BAR */}
      <section style={{ padding: '60px 1.5rem' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '2rem', textAlign: 'center' }} className="stats-grid">
            {[
              { num: '$21B+', label: 'Algorithmic Trading Market' },
              { num: '5', label: 'Live Agents Trading' },
              { num: '24/7', label: 'Markets Covered' },
              { num: '$43B', label: 'Projected by 2030' },
            ].map((stat) => (
              <ScrollFadeUp key={stat.label}>
                <div>
                  <div style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(1.8rem,4vw,2.8rem)', fontWeight: 800, color: 'var(--gold)', marginBottom: '.5rem' }}>{stat.num}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', color: 'var(--muted)', lineHeight: 1.5 }}>{stat.label}</div>
                </div>
              </ScrollFadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ padding: '100px 1.5rem', textAlign: 'center', background: 'rgba(232,172,32,.02)' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(2rem,4.5vw,3.2rem)', fontWeight: 800, marginBottom: '1rem' }}>The first exchange where you own the algorithm</h2>
          <p style={{ fontSize: '1.05rem', color: 'var(--muted)', lineHeight: 1.75, marginBottom: '2.5rem' }}>Start investing in verified trading strategies. No real funds at risk — paper trading only.</p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/signup" className="btn-primary">Create Free Account →</Link>
            <Link href="/agents/submit" className="btn-secondary">Submit Your Agent</Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '3rem 1.5rem 2rem' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '2rem', marginBottom: '2rem' }} className="footer-grid">
            <div>
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', marginBottom: '1rem' }}>AS<span style={{ color: 'var(--gold)' }}>E</span></div>
              <p style={{ fontSize: '.85rem', color: 'var(--faint)', lineHeight: 1.6 }}>The Agent Securities Exchange. Own verified trading strategies as assets.</p>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-head)', fontSize: '.95rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--white)' }}>Product</div>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                {['Agents', 'Dashboard', 'API'].map(link => (
                  <li key={link}><Link href="#" style={{ fontSize: '.85rem', color: 'var(--muted)', transition: 'color .2s' }} onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--white)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted)')}>{link}</Link></li>
                ))}
              </ul>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-head)', fontSize: '.95rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--white)' }}>Developers</div>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                {['Submit Agent', 'Documentation', 'Support'].map(link => (
                  <li key={link}><Link href="#" style={{ fontSize: '.85rem', color: 'var(--muted)', transition: 'color .2s' }} onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--white)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted)')}>{link}</Link></li>
                ))}
              </ul>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-head)', fontSize: '.95rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--white)' }}>Legal</div>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                {['Terms', 'Privacy', 'Disclaimer'].map(link => (
                  <li key={link}><Link href="#" style={{ fontSize: '.85rem', color: 'var(--muted)', transition: 'color .2s' }} onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--white)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted)')}>{link}</Link></li>
                ))}
              </ul>
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ fontSize: '.8rem', color: 'var(--faint)' }}>© 2026 Agent Security Exchange. Paper trading. Not financial advice.</div>
            <div style={{ display: 'flex', gap: '1.5rem' }}>
              {['Twitter', 'GitHub', 'Discord'].map(social => (
                <Link key={social} href="#" style={{ fontSize: '.8rem', color: 'var(--muted)', transition: 'color .2s' }} onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--gold)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted)')}>{social}</Link>
              ))}
            </div>
          </div>
        </div>
      </footer>

      {/* CSS */}
      <style>{`
        @media(max-width:900px){
          .hero-grid,.steps-grid,.why-grid,.audience-grid{grid-template-columns:1fr!important}
          .shift-grid{grid-template-columns:1fr!important}
          .nav-desktop{flex-direction:column;gap:.75rem!important}
        }
        @media(max-width:600px){
          .agents-grid{grid-template-columns:1fr!important}
          .stats-grid{grid-template-columns:repeat(2,1fr)!important}
          .footer-grid{grid-template-columns:1fr!important}
        }
      `}</style>
    </div>
  )
}
