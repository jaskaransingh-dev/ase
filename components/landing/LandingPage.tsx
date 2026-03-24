'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { HoverLink } from '@/components/ui/hover-link'
import { HoverCard } from '@/components/ui/hover-card'

const AGENTS = [
  { ticker: '$BTCM', name: 'BTC Momentum', ret: '+18.4%', price: '$118.40', pos: true, spark: [80,85,82,90,95,100,97,105,112,118] },
  { ticker: '$ETHR', name: 'ETH Mean Revert', ret: '+9.2%', price: '$109.20', pos: true, spark: [100,97,95,98,102,100,104,106,108,109] },
  { ticker: '$CRTR', name: 'Crypto Trend', ret: '+24.1%', price: '$124.10', pos: true, spark: [80,84,88,91,96,102,108,114,120,124] },
  { ticker: '$SOLB', name: 'SOL Breakout', ret: '+31.7%', price: '$131.70', pos: true, spark: [80,82,85,90,100,108,118,125,130,132] },
  { ticker: '$DEFI', name: 'DeFi Basket', ret: '+12.8%', price: '$112.80', pos: true, spark: [90,92,94,96,98,100,104,108,110,113] },
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

const ROT_WORDS = ['crypto AI agents', 'autonomous alpha', 'algorithmic trading', 'the future']

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

export default function LandingPage() {
  const [rotIdx, setRotIdx] = useState(0)
  const [navScrolled, setNavScrolled] = useState(false)

  useEffect(() => {
    const iv = setInterval(() => setRotIdx(i => (i + 1) % ROT_WORDS.length), 2800)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    const handler = () => setNavScrolled(window.scrollY > 30)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--white)', overflowX: 'hidden' }}>
      {/* NAV */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '.25rem', marginLeft: 'auto' }} className="nav-desktop">
            <Link href="/login" style={{ fontSize: '.88rem', fontWeight: 600, color: 'var(--muted)', padding: '.5rem .8rem', borderRadius: 10 }}>Login</Link>
            <Link href="/signup" className="btn-primary" style={{ fontSize: '.88rem', padding: '.55rem 1.2rem', borderRadius: 10 }}>
              Get Started →
            </Link>
          </div>
        </div>
      </nav>

      {/* TICKER */}
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

      {/* HERO */}
      <section style={{ minHeight: '100vh', padding: '140px 1.5rem 80px', display: 'flex', alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.015) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.015) 1px,transparent 1px)', backgroundSize: '60px 60px', opacity: .4, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 50% at 70% 50%,rgba(232,172,32,.04) 0%,transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 1160, margin: '0 auto', width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center', position: 'relative' }} className="hero-grid">
          <div className="fade-up">
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem', fontFamily: 'var(--font-mono)', fontSize: '.62rem', letterSpacing: '.1em', color: 'var(--gold)', border: '1px solid rgba(232,172,32,.25)', background: 'rgba(232,172,32,.06)', padding: '.35rem .85rem', borderRadius: 999, marginBottom: '1.5rem' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', animation: 'dotBlink 1.8s infinite', display: 'inline-block' }} />
              5 AGENTS LIVE · PAPER TRADING
            </div>

            <h1 style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(2.6rem,5.5vw,4rem)', fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.08, marginBottom: '1.25rem' }}>
              <span style={{ color: 'var(--white)' }}>The exchange for</span><br />
              <span style={{ display: 'block', overflow: 'hidden', height: '1.15em', position: 'relative' }}>
                {ROT_WORDS.map((w, i) => (
                  <span key={w} style={{ display: 'block', position: 'absolute', top: 0, left: 0, transition: 'transform .5s cubic-bezier(.4,0,.2,1), opacity .5s', transform: i === rotIdx ? 'translateY(0)' : i < rotIdx ? 'translateY(-100%)' : 'translateY(100%)', opacity: i === rotIdx ? 1 : 0, background: 'linear-gradient(135deg,#E8AC20,#F5C842)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{w}</span>
                ))}
              </span>
            </h1>

            <p style={{ fontSize: '1.05rem', color: 'var(--muted)', lineHeight: 1.75, maxWidth: 480, marginBottom: '2rem' }}>
              Invest in autonomous crypto AI agents. Each agent trades real strategies on Alpaca paper markets with transparent performance and audit-grade ledgers.
            </p>

            <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
              <Link href="/signup" className="btn-primary">Start Trading Free →</Link>
              <Link href="/login" className="btn-secondary">Login</Link>
            </div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: 'var(--faint)', marginTop: '.9rem' }}>
              Free $100 paper credits · No real funds at risk
            </p>
          </div>

          {/* Hero visual */}
          <div className="fade-up-2" style={{ position: 'relative' }}>
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,.7)' }}>
              <div className="win-bar">
                <span className="dot dot-r" /><span className="dot dot-y" /><span className="dot dot-g" />
                <span className="win-title" style={{ marginLeft: '.3rem' }}>ase.app · Exchange</span>
                <span className="pill" style={{ marginLeft: 'auto' }}>LIVE</span>
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
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', fontWeight: 700 }}>{a.price}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--green)' }}>{a.ret}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ padding: '80px 1.5rem' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <div className="eyebrow">HOW IT WORKS</div>
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(1.8rem,3.5vw,2.5rem)', fontWeight: 800, marginTop: '.5rem' }}>Three steps to trade AI</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1.25rem' }} className="steps-grid">
            {[
              { n: '01', title: 'Sign up & add credits', desc: 'Create an account and get $100 in free paper credits. Add more via Stripe anytime.' },
              { n: '02', title: 'Discover crypto agents', desc: 'Browse 5 live AI agents trading BTC, ETH, SOL and DeFi tokens — all with transparent records.' },
              { n: '03', title: 'Invest & track returns', desc: 'Buy agent shares and watch as they trade autonomously. Sell anytime at the current bid price.' },
            ].map(s => (
              <HoverCard key={s.n} className="card" style={{ padding: '1.75rem 1.5rem' }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(232,172,32,.1)', border: '1px solid rgba(232,172,32,.2)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-mono)', fontSize: '.68rem', color: 'var(--gold)', fontWeight: 700, marginBottom: '1.1rem' }}>{s.n}</div>
                <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.05rem', fontWeight: 800, marginBottom: '.5rem' }}>{s.title}</div>
                <div style={{ fontSize: '.88rem', color: 'var(--muted)', lineHeight: 1.7 }}>{s.desc}</div>
              </HoverCard>
            ))}
          </div>
        </div>
      </section>

      {/* AGENTS */}
      <section style={{ padding: '80px 1.5rem', background: 'rgba(0,0,0,.2)' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div className="eyebrow">LIVE AGENTS</div>
              <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(1.8rem,3.5vw,2.5rem)', fontWeight: 800, marginTop: '.5rem' }}>Five crypto strategies, fully autonomous</h2>
            </div>
            <Link href="/signup" className="btn-secondary">Start Trading →</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: '1rem' }} className="agents-grid">
            {AGENTS.map(a => (
              <HoverCard key={a.ticker} className="card" style={{ padding: '1.25rem', display: 'block' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.6rem' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '.92rem' }}>{a.name}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', marginTop: '.15rem' }}>{a.ticker}</div>
                  </div>
                  <span className="pill pill-green" style={{ fontSize: '.52rem' }}>LIVE</span>
                </div>
                <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.4rem', fontWeight: 800, color: 'var(--green)' }}>{a.ret}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--faint)', marginTop: '.1rem', marginBottom: '.5rem' }}>30D Return (paper)</div>
                <Spark data={a.spark} pos={a.pos} />
                <div style={{ marginTop: '.5rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: 'var(--white)', fontWeight: 700 }}>{a.price}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--muted)' }}>NAV/share</span>
                </div>
              </HoverCard>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '100px 1.5rem', textAlign: 'center' }}>
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(2rem,4vw,2.8rem)', fontWeight: 800, marginBottom: '.75rem' }}>Start trading crypto AI agents</h2>
          <p style={{ fontSize: '1rem', color: 'var(--muted)', lineHeight: 1.75, marginBottom: '2rem' }}>Create a free account and get $100 in paper credits. No real money required.</p>
          <Link href="/signup" className="btn-primary" style={{ fontSize: '1rem', padding: '.9rem 2rem' }}>Create Free Account →</Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '2rem 1.5rem' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.5rem' }}>
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '.95rem' }}>AS<span style={{ color: 'var(--gold)' }}>E</span></div>
          <div style={{ fontSize: '.75rem', color: 'var(--faint)' }}>© 2026 Agent Security Exchange. Paper trading only. Not financial advice.</div>
        </div>
      </footer>

      <style>{`
        @media(max-width:900px){.hero-grid,.steps-grid{grid-template-columns:1fr!important}}
        @media(max-width:600px){.agents-grid{grid-template-columns:1fr 1fr!important}}
      `}</style>
    </div>
  )
}
