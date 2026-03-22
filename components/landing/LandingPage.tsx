'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { HoverLink } from '@/components/ui/hover-link'
import { HoverCard } from '@/components/ui/hover-card'

const AGENTS_PREVIEW = [
  { name: 'Momentum Alpha', ticker: 'MOMO', ret: '+24.1%', price: '$118.40', pos: true, spark: [80,82,85,83,88,92,96,95,100,104,108,115,118] },
  { name: 'Mean Reversion Pro', ticker: 'REVT', ret: '+11.7%', price: '$89.20', pos: true, spark: [78,80,79,82,81,83,84,83,86,87,88,89,89] },
  { name: 'Trend Follower', ticker: 'TRND', ret: '+18.4%', price: '$142.30', pos: true, spark: [118,120,122,121,124,128,131,133,136,138,140,141,142] },
]

function Spark({ data, pos }: { data: number[]; pos: boolean }) {
  const w = 54, h = 20, pad = 2
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1
  const step = (w - pad * 2) / (data.length - 1)
  const pts = data.map((v, i) => {
    const x = pad + i * step
    const y = pad + (1 - (v - min) / span) * (h - pad * 2)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const col = pos ? '#0EAD6E' : '#E84040'
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
      <path d={pts} fill="none" stroke={col} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

const TICKER_ITEMS = [
  { ticker: '$MOMO', price: '$118.40', chg: '+24.1%', pos: true },
  { ticker: '$REVT', price: '$89.20', chg: '+11.7%', pos: true },
  { ticker: '$TRND', price: '$142.30', chg: '+18.4%', pos: true },
  { ticker: '$ARB', price: '$74.12', chg: '+34.7%', pos: true },
  { ticker: '$PAIR', price: '$53.90', chg: '+6.2%', pos: true },
  { ticker: '$CARRY', price: '$126.00', chg: '+11.4%', pos: true },
  { ticker: '$GAMMA', price: '$87.40', chg: '−2.1%', pos: false },
  { ticker: '$KELLY', price: '$112.80', chg: '+9.3%', pos: true },
]

const ROT_WORDS = ['AI trading agents', 'verified strategies', 'algorithmic alpha', 'quant strategies', 'the future']

const FAQ_ITEMS = [
  { q: 'What is ASE?', a: 'ASE is a marketplace where AI trading agents are independently verified and listed as assets. Each agent has a ticker, a trade ledger, and transparent performance analytics.' },
  { q: 'Is this real money?', a: 'No. ASE uses Alpaca Paper Trading — real market data, zero real funds at risk. Credits you deposit are used to simulate allocation to strategies. This is a demo and educational platform.' },
  { q: 'What does "Verified" mean?', a: 'Verified agents have passed our submission review — consistent ledger format, reproducible metric definitions, a methodology disclosure, and confirmed paper trading evidence.' },
  { q: "What's the regulatory status?", a: 'ASE is in development and is NOT a registered broker-dealer, investment adviser, or licensed exchange. We are building compliance infrastructure before any real-money transactions.' },
  { q: 'How do I list a strategy?', a: 'Email builders@launchase.com with your strategy description, backtest methodology, and paper trading evidence. We review all submissions manually.' },
]

export default function LandingPage() {
  const [rotIdx, setRotIdx] = useState(0)
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [email, setEmail] = useState('')
  const [wlMsg, setWlMsg] = useState('')
  const [wlLoading, setWlLoading] = useState(false)
  const [navScrolled, setNavScrolled] = useState(false)
  const [mobOpen, setMobOpen] = useState(false)

  useEffect(() => {
    const iv = setInterval(() => setRotIdx(i => (i + 1) % ROT_WORDS.length), 2800)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    const handler = () => setNavScrolled(window.scrollY > 30)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  async function handleWaitlist(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setWlLoading(true)
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (res.ok) {
        setWlMsg("✓ You're on the list — we'll be in touch.")
        setEmail('')
      } else {
        setWlMsg('Something went wrong. Try again.')
      }
    } catch {
      setWlMsg('Something went wrong. Try again.')
    }
    setWlLoading(false)
  }

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--white)', overflowX: 'hidden' }}>

      {/* NAV */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
        borderBottom: navScrolled ? '1px solid var(--border)' : '1px solid transparent',
        background: navScrolled ? 'rgba(7,9,15,0.88)' : 'transparent',
        backdropFilter: navScrolled ? 'blur(16px)' : 'none',
        transition: 'all .3s',
      }}>
        <div style={{ maxWidth: 1160, margin: '0 auto', padding: '0 1.5rem', height: 64, display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <Link href="/" style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-.02em' }}>
            AS<span style={{ color: 'var(--gold)' }}>E</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.25rem', marginLeft: 'auto' }} className="nav-desktop">
            {['#how', '#agents-preview', '#roadmap', '#faq'].map((href, i) => (
              <HoverLink key={href} href={href} style={{ fontSize: '.88rem', fontWeight: 600, color: 'var(--muted)', padding: '.5rem .8rem', borderRadius: 10 }}>
                {['How It Works', 'Agents', 'Roadmap', 'FAQ'][i]}
              </HoverLink>
            ))}
            <Link href="/login" style={{ fontSize: '.88rem', fontWeight: 600, color: 'var(--muted)', padding: '.5rem .8rem', borderRadius: 10, marginLeft: '.25rem' }}>Login</Link>
            <Link href="/signup" style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--gold)', color: '#07090F', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '.88rem', padding: '.5rem 1.1rem', borderRadius: 10, marginLeft: '.25rem', transition: 'background .15s' }}>
              Get Started →
            </Link>
          </div>
        </div>
      </nav>

      {/* TICKER */}
      <div style={{ position: 'fixed', top: 64, left: 0, right: 0, zIndex: 900, background: 'rgba(7,9,15,.9)', borderBottom: '1px solid var(--border)', backdropFilter: 'blur(10px)', height: 36, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', letterSpacing: '.12em', color: 'var(--gold)', padding: '0 1rem', borderRight: '1px solid var(--border)', whiteSpace: 'nowrap', flexShrink: 0 }}>PREVIEW ●</div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ display: 'flex', width: 'max-content', animation: 'tickerMove 28s linear infinite' }}>
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
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.018) 1px,transparent 1px)', backgroundSize: '60px 60px', opacity: .4, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 50% at 70% 50%,rgba(232,172,32,.05) 0%,transparent 70%),radial-gradient(ellipse 40% 60% at 20% 80%,rgba(14,173,110,.04) 0%,transparent 60%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 1160, margin: '0 auto', width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center', position: 'relative' }} className="hero-grid">
          {/* Copy */}
          <div className="fade-up">
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem', fontFamily: 'var(--font-mono)', fontSize: '.62rem', letterSpacing: '.1em', color: 'var(--gold)', border: '1px solid rgba(232,172,32,.25)', background: 'rgba(232,172,32,.06)', padding: '.35rem .85rem', borderRadius: 999, marginBottom: '1.5rem' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', animation: 'dotBlink 1.8s infinite', display: 'inline-block' }} />
              WAITLIST OPEN · PAPER TRADING LIVE
            </div>

            <h1 style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(2.6rem,5.5vw,4.2rem)', fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.05, marginBottom: '1.25rem' }}>
              <span style={{ color: 'var(--white)' }}>The exchange for<br /></span>
              <span style={{ display: 'block', overflow: 'hidden', height: '1.2em', position: 'relative' }}>
                {ROT_WORDS.map((w, i) => (
                  <span key={w} style={{ display: 'block', position: 'absolute', top: 0, left: 0, transition: 'transform .55s cubic-bezier(.4,0,.2,1), opacity .55s', transform: i === rotIdx ? 'translateY(0)' : i < rotIdx ? 'translateY(-100%)' : 'translateY(100%)', opacity: i === rotIdx ? 1 : 0, color: 'var(--muted)', fontSize: '.85em', fontWeight: 600 }}>{w}</span>
                ))}
              </span>
              <span className="gradient-text" style={{ display: 'block', backgroundSize: '200% 200%', animation: 'shimmer 4s linear infinite' }}>Trade the future.</span>
            </h1>

            <p style={{ fontSize: '1.05rem', color: 'var(--muted)', lineHeight: 1.75, maxWidth: 480, marginBottom: '2rem' }}>
              ASE is building the first marketplace where AI trading agents are independently verified, listed like assets — with tickers, audit-grade ledgers, and transparent performance records.
            </p>

            <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
              <Link href="/signup" className="btn-primary">Start Trading Free →</Link>
              <a href="#agents-preview" className="btn-secondary">Explore Agents</a>
            </div>

            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: 'var(--faint)', marginTop: '.9rem' }}>
              Free to start · Paper trading only · No real funds at risk
            </p>
          </div>

          {/* Hero visual */}
          <div className="fade-up-2" style={{ position: 'relative' }}>
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.04)' }}>
              <div className="win-bar">
                <span className="dot dot-r" /><span className="dot dot-y" /><span className="dot dot-g" />
                <span className="win-title" style={{ marginLeft: '.3rem' }}>ase.app · Agent Exchange</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', minHeight: 340 }}>
                <div style={{ borderRight: '1px solid var(--border)', padding: '.75rem 0' }}>
                  {AGENTS_PREVIEW.map((a, i) => (
                    <div key={a.ticker} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.55rem .9rem', borderBottom: '1px solid rgba(255,255,255,.04)', background: i === 0 ? 'rgba(232,172,32,.07)' : 'transparent', cursor: 'pointer' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', fontWeight: 600, color: i === 0 ? 'var(--green)' : 'var(--white)' }}>{a.name.split(' ')[0]}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: a.pos ? 'var(--green)' : 'var(--red)' }}>{a.ret}</span>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '1rem' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--gold)', marginBottom: '.5rem', letterSpacing: '.06em' }}>$MOMO · VERIFIED ●</div>
                  <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.8rem', fontWeight: 800, color: 'var(--green)' }}>$118.40</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.78rem', color: 'var(--green)', marginTop: '.2rem' }}>+24.1%  30D  ▲</div>
                  <svg viewBox="0 0 220 60" width="100%" height={60} style={{ margin: '1rem 0 .5rem' }}>
                    <defs><linearGradient id="hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0EAD6E" stopOpacity="0.3" /><stop offset="100%" stopColor="#0EAD6E" stopOpacity="0" /></linearGradient></defs>
                    <path d="M0,54 L22,48 L44,40 L66,44 L88,34 L110,28 L132,22 L154,26 L176,16 L198,10 L220,4" fill="none" stroke="#0EAD6E" strokeWidth="2" strokeLinecap="round" />
                    <path d="M0,54 L22,48 L44,40 L66,44 L88,34 L110,28 L132,22 L154,26 L176,16 L198,10 L220,4 L220,60 L0,60 Z" fill="url(#hg)" />
                  </svg>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '.4rem' }}>
                    {[['SHARPE','2.94'],['AUM','$2.1M'],['MAX DD','5.1%']].map(([k,v]) => (
                      <div key={k} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 10, padding: '.5rem .6rem' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', letterSpacing: '.08em' }}>{k}</div>
                        <div style={{ fontSize: '.88rem', fontWeight: 800, marginTop: '.2rem' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BAND */}
      <div style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,.3)', padding: '1.1rem 1.5rem', overflow: 'hidden' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: '0', justifyContent: 'space-between' }}>
          {['Audit-grade performance data', 'Risk controls + disclosures', 'Builder SDK + APIs', 'Portfolio analytics suite', 'Verified ledger records', 'Paper trading via Alpaca'].map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: '.6rem', fontFamily: 'var(--font-mono)', fontSize: '.68rem', letterSpacing: '.06em', color: 'var(--muted)', padding: '.4rem 1.5rem' }}>
              <span style={{ color: 'var(--gold)', fontSize: '.4rem', opacity: .6 }}>●</span>{t}
            </div>
          ))}
        </div>
      </div>

      {/* HOW IT WORKS */}
      <section id="how" style={{ padding: '100px 1.5rem' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <div className="eyebrow">HOW IT WORKS</div>
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(2rem,4vw,3rem)', fontWeight: 800, marginTop: '.6rem' }}>Three steps to invest in AI</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1.5rem' }} className="steps-grid">
            {[
              { n: '01', title: 'Sign up & deposit credits', desc: 'Create an account and add ASE credits via Stripe. Credits are used for paper trading simulation — no real funds are invested.' },
              { n: '02', title: 'Discover verified agents', desc: 'Browse the marketplace of AI trading agents with transparent performance records, Sharpe ratios, and trade-level ledgers.' },
              { n: '03', title: 'Invest & track returns', desc: 'Allocate credits to agents you believe in. Monitor performance in real-time as agents trade using Alpaca Paper Trading.' },
            ].map((s, i) => (
              <HoverCard key={s.n} className="card" style={{ padding: '2rem 1.75rem' }}>
                <div style={{ width: 42, height: 42, borderRadius: 14, background: 'rgba(232,172,32,.1)', border: '1px solid rgba(232,172,32,.2)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-mono)', fontSize: '.72rem', color: 'var(--gold)', fontWeight: 700, marginBottom: '1.25rem' }}>{s.n}</div>
                <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 800, marginBottom: '.65rem' }}>{s.title}</div>
                <div style={{ fontSize: '.9rem', color: 'var(--muted)', lineHeight: 1.7 }}>{s.desc}</div>
              </HoverCard>
            ))}
          </div>
        </div>
      </section>

      {/* AGENTS PREVIEW */}
      <section id="agents-preview" style={{ padding: '80px 1.5rem', background: 'rgba(0,0,0,.2)' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div className="eyebrow">LIVE AGENTS</div>
              <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(1.8rem,3.5vw,2.5rem)', fontWeight: 800, marginTop: '.5rem' }}>Three strategies, fully transparent</h2>
            </div>
            <Link href="/agents" className="btn-secondary">View All Agents →</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1.25rem' }} className="agents-grid">
            {AGENTS_PREVIEW.map((a) => (
                <HoverCard key={a.ticker} href={`/agents/${a.ticker.replace('$','').toLowerCase().replace('momo','momentum-alpha').replace('revt','mean-reversion-pro').replace('trnd','trend-follower')}`} asLink style={{ display: 'block', background: 'var(--bg2)', borderRadius: 20, padding: '1.5rem', textDecoration: 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.75rem' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem' }}>{a.name}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', marginTop: '.2rem', letterSpacing: '.04em' }}>{a.ticker} · VERIFIED</div>
                    </div>
                    <span className="pill pill-green" style={{ fontSize: '.6rem' }}>LIVE</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.6rem', fontWeight: 800, color: a.pos ? 'var(--green)' : 'var(--red)' }}>{a.ret}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--faint)', marginTop: '.15rem' }}>30D Return (paper)</div>
                  <Spark data={a.spark} pos={a.pos} />
                  <div style={{ marginTop: '.5rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', color: 'var(--white)', fontWeight: 700 }}>{a.price}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--muted)' }}>NAV/share</span>
                  </div>
                </HoverCard>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ padding: '100px 1.5rem' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: '4rem', alignItems: 'center' }} className="feat-grid">
          <div>
            <div className="eyebrow">PLATFORM FEATURES</div>
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(1.8rem,3.5vw,2.5rem)', fontWeight: 800, margin: '.6rem 0 .75rem' }}>Institutional analytics, democratized</h2>
            <p style={{ fontSize: '1rem', color: 'var(--muted)', lineHeight: 1.75, marginBottom: '1.5rem' }}>Run the same analysis a quant desk would run — risk decomposition, drawdown diagnostics, and side-by-side comparisons — before you commit a single credit.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.65rem' }}>
              {['Full trade-level ledgers with timestamp and P&L for every order', 'Sharpe ratio, CAGR, max drawdown with consistent definitions', 'Real-time portfolio value via Supabase Realtime subscriptions', 'Sell-lock protection: can\'t exit while agent has open positions'].map(f => (
                <div key={f} style={{ display: 'flex', gap: '.7rem', fontSize: '.9rem', color: 'var(--muted)' }}>
                  <span style={{ width: 20, height: 20, borderRadius: 7, background: 'rgba(14,173,110,.1)', border: '1px solid rgba(14,173,110,.25)', display: 'grid', placeItems: 'center', fontSize: '.65rem', color: 'var(--green)', flexShrink: 0, marginTop: '.15rem' }}>✓</span>
                  {f}
                </div>
              ))}
            </div>
            <div style={{ marginTop: '2rem' }}>
              <Link href="/signup" className="btn-primary">Get Started Free →</Link>
            </div>
          </div>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,.5)' }}>
            <div className="win-bar">
              <span className="dot dot-r" /><span className="dot dot-y" /><span className="dot dot-g" />
              <span className="win-title">Analytics · Momentum Alpha</span>
              <span className="pill" style={{ marginLeft: 'auto' }}>VERIFIED</span>
            </div>
            <div style={{ padding: '1.1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '.55rem', marginBottom: '1rem' }}>
                {[['CAGR','19.4%','pos'],['SHARPE','2.94',''],['MAX DD','5.1%',''],['VOL','8.2%',''],['WIN RATE','61.2%',''],['ALPHA','+5.8%','pos']].map(([l,v,c]) => (
                  <div key={l} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 12, padding: '.65rem .75rem' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', letterSpacing: '.08em' }}>{l}</div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, marginTop: '.25rem', color: c === 'pos' ? 'var(--green)' : 'var(--white)' }}>{v}</div>
                  </div>
                ))}
              </div>
              <svg viewBox="0 0 320 80" width="100%" height={80}>
                <defs>
                  <linearGradient id="fg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0EAD6E" stopOpacity="0.25" /><stop offset="100%" stopColor="#0EAD6E" stopOpacity="0" /></linearGradient>
                </defs>
                <path d="M0,72 L32,65 L64,56 L96,60 L128,44 L160,38 L192,28 L224,24 L256,14 L288,10 L320,4" fill="none" stroke="#0EAD6E" strokeWidth="2" />
                <path d="M0,74 L32,70 L64,66 L96,64 L128,60 L160,56 L192,52 L224,48 L256,44 L288,40 L320,36" fill="none" stroke="#E8AC20" strokeWidth="1.5" strokeOpacity="0.7" />
                <path d="M0,72 L32,65 L64,56 L96,60 L128,44 L160,38 L192,28 L224,24 L256,14 L288,10 L320,4 L320,80 L0,80 Z" fill="url(#fg1)" />
              </svg>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', marginTop: '.75rem' }}>
                {[['Regime Sensitivity','LOW','green'],['Benchmark Correlation','0.19','green'],['Market Exposure','MODERATE','gold']].map(([l,v,c]) => (
                  <div key={l} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '.8rem', padding: '.35rem .6rem', background: 'rgba(255,255,255,.02)', borderRadius: 8 }}>
                    <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem' }}>{l}</strong>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', fontWeight: 700, padding: '.2rem .5rem', borderRadius: 6, background: c === 'green' ? 'rgba(14,173,110,.1)' : 'rgba(232,172,32,.1)', border: `1px solid ${c === 'green' ? 'rgba(14,173,110,.2)' : 'rgba(232,172,32,.2)'}`, color: c === 'green' ? 'var(--green)' : 'var(--gold)' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WHO ITS FOR */}
      <section style={{ padding: '80px 1.5rem', background: 'rgba(0,0,0,.2)' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div className="eyebrow">WHO IT'S FOR</div>
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(1.8rem,3.5vw,2.5rem)', fontWeight: 800, marginTop: '.5rem' }}>Built for three types of participant</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1.5rem' }} className="who-grid">
            {[
              { label: 'FOR BUILDERS', title: 'AI Developers & Quants', desc: "You've built a strategy that genuinely performs. List on ASE with clear methodology, reach real demand, and get paid — without running investor operations yourself.", tags: ['ML ENGINEERS','QUANTS','RESEARCHERS'] },
              { label: 'FOR INVESTORS', title: 'Self-Directed Traders', desc: 'Algorithmic strategies have historically been gated behind large minimums. ASE democratizes access with transparent data, verified ledgers, and paper trading to start.', tags: ['SELF-DIRECTED','DATA-DRIVEN','RETAIL'] },
              { label: 'FOR INSTITUTIONS', title: 'Institutional Participants', desc: 'Evaluate agents with full data access, exportable reports, and API integration. We are in early dialogue with design partners who need auditable AI strategy access.', tags: ['FAMILY OFFICES','HEDGE FUNDS','RIAs'] },
            ].map(w => (
              <div key={w.title} className="card" style={{ padding: '2rem 1.75rem' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', letterSpacing: '.14em', color: 'var(--gold)', marginBottom: '.75rem' }}>{w.label}</div>
                <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 800, marginBottom: '.65rem' }}>{w.title}</h3>
                <p style={{ fontSize: '.9rem', color: 'var(--muted)', lineHeight: 1.7, marginBottom: '1rem' }}>{w.desc}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
                  {w.tags.map(t => <span key={t} className="tag">{t}</span>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ROADMAP */}
      <section id="roadmap" style={{ padding: '100px 1.5rem' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <div className="eyebrow">ROADMAP</div>
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(1.8rem,3.5vw,2.5rem)', fontWeight: 800, margin: '.6rem 0 .75rem' }}>A clear path from demo to launch</h2>
            <p style={{ fontSize: '1rem', color: 'var(--muted)', lineHeight: 1.75, maxWidth: 560, margin: '0 auto' }}>We ship in stages. Better verified data first, real allocation tools next, and secondary liquidity only after the regulatory groundwork is in place.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1.5rem' }} className="rm-grid">
            {[
              { phase: 'NOW · IN PROGRESS', color: 'var(--green)', title: 'Verified Data Layer', time: 'Q1–Q2 2026', items: ['Agent discovery: search, filters, analytics','Interactive dashboard with paper trading','Trade-level ledger and exportable receipts','Supabase Realtime portfolio updates','Stripe credits deposit system','Builder application pipeline'] },
              { phase: 'NEXT · PLANNED', color: 'var(--gold)', title: 'Allocation Tooling', time: 'Q3–Q4 2026', items: ['Portfolio builder + multi-agent blending','Scenario testing and market stress views','Transparent fee modeling and term sheets','Jurisdiction + eligibility check flows','KYC/AML integration for compliant access','Expanded market coverage'] },
              { phase: 'LATER · SUBJECT TO APPROVALS', color: 'var(--faint)', title: 'Liquidity Layer', time: '2027+', items: ['Secondary transfers (regulatory approval)','Institutional API and data feed integrations','Third-party verification partnerships','Additional asset classes and venues','Global market expansion','Agent performance derivatives (exploratory)'] },
            ].map(rm => (
              <div key={rm.title} className="card" style={{ padding: '1.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '1.25rem' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 14, background: `${rm.color}15`, border: `1px solid ${rm.color}40`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: rm.color }} />
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', letterSpacing: '.1em', fontWeight: 700, color: rm.color }}>{rm.phase}</span>
                </div>
                <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.05rem', fontWeight: 800, marginBottom: '.25rem' }}>{rm.title}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: 'var(--faint)', marginBottom: '1rem' }}>{rm.time}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                  {rm.items.map(item => (
                    <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: '.6rem', fontSize: '.85rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: '.45rem', background: rm.color, opacity: rm.phase.includes('LATER') ? .4 : .8 }} />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" style={{ padding: '80px 1.5rem', background: 'rgba(0,0,0,.2)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div className="eyebrow">QUESTIONS</div>
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(1.8rem,3.5vw,2.5rem)', fontWeight: 800, marginTop: '.6rem' }}>What you should know</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
            {FAQ_ITEMS.map((f, i) => (
              <div key={i} style={{ background: 'var(--bg2)', border: `1px solid ${openFaq === i ? 'rgba(232,172,32,.2)' : 'var(--border)'}`, borderRadius: 16, overflow: 'hidden', transition: 'border-color .2s' }}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', width: '100%', textAlign: 'left', padding: '1.1rem 1.25rem', fontSize: '.95rem', fontWeight: 700, color: openFaq === i ? 'var(--gold)' : 'var(--white)', background: 'transparent', border: 0, cursor: 'pointer', transition: 'color .15s' }}>
                  {f.q}
                  <span style={{ width: 24, height: 24, borderRadius: 8, border: '1px solid var(--border2)', display: 'grid', placeItems: 'center', fontSize: '1.1rem', color: 'var(--muted)', flexShrink: 0, transition: 'transform .25s', transform: openFaq === i ? 'rotate(45deg)' : 'none' }}>+</span>
                </button>
                {openFaq === i && (
                  <div style={{ padding: '0 1.25rem 1.1rem', paddingTop: '.9rem', borderTop: '1px solid var(--border)', fontSize: '.9rem', color: 'var(--muted)', lineHeight: 1.75 }}>{f.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '100px 1.5rem', textAlign: 'center', background: 'linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(232,172,32,.04) 50%,rgba(0,0,0,0) 100%)' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div className="eyebrow">GET EARLY ACCESS</div>
          <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(2rem,4vw,3rem)', fontWeight: 800, margin: '.6rem 0 .75rem' }}>Start trading AI strategies today</h2>
          <p style={{ fontSize: '1rem', color: 'var(--muted)', lineHeight: 1.75, marginBottom: '2.5rem' }}>Create a free account, deposit paper credits, and start investing in verified AI agents. No real money required.</p>
          <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            <Link href="/signup" className="btn-primary" style={{ fontSize: '1rem', padding: '.9rem 2rem' }}>Create Free Account →</Link>
            <Link href="/agents" className="btn-secondary" style={{ fontSize: '1rem', padding: '.9rem 2rem' }}>Explore Agents</Link>
          </div>
          <form onSubmit={handleWaitlist} style={{ display: 'flex', gap: '.6rem', maxWidth: 420, margin: '0 auto', flexWrap: 'wrap' }}>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Join the builder waitlist..." className="input-base" style={{ flex: 1, minWidth: 200 }} />
            <button type="submit" disabled={wlLoading} className="btn-secondary" style={{ flexShrink: 0 }}>{wlLoading ? '...' : 'Join'}</button>
          </form>
          {wlMsg && <p style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', color: 'var(--green)', marginTop: '.75rem' }}>{wlMsg}</p>}
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: 'var(--faint)', marginTop: '.75rem' }}>ASE uses simulated paper trading. No real funds are used for trading. Not financial advice.</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '4rem 1.5rem 2rem' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '3rem', marginBottom: '3rem' }} className="footer-grid">
            <div>
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.1rem', marginBottom: '.85rem' }}>AS<span style={{ color: 'var(--gold)' }}>E</span></div>
              <p style={{ fontSize: '.88rem', color: 'var(--muted)', lineHeight: 1.7, maxWidth: 260 }}>Building the first marketplace where AI trading agents are independently verified and owned as assets. Compliance-first. Transparency by design.</p>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', fontFamily: 'var(--font-mono)', fontSize: '.58rem', letterSpacing: '.1em', color: 'var(--green)', marginTop: '.85rem' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', animation: 'pulse 2s infinite', display: 'inline-block' }} />WAITLIST OPEN
              </div>
            </div>
            {[
              { title: 'Platform', links: [['How It Works','#how'],['Agents','#agents-preview'],['Roadmap','#roadmap'],['FAQ','#faq']] },
              { title: 'Account', links: [['Sign Up','/signup'],['Log In','/login'],['Dashboard','/dashboard'],['Submit Agent','/agents/submit']] },
              { title: 'Contact', links: [['founders@launchase.com','mailto:founders@launchase.com'],['builders@launchase.com','mailto:builders@launchase.com'],['Press','mailto:founders@launchase.com']] },
            ].map(col => (
              <div key={col.title}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', letterSpacing: '.1em', color: 'var(--faint)', marginBottom: '.85rem' }}>{col.title.toUpperCase()}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                  {col.links.map(([label, href]) => (
                    <HoverLink key={label} href={href} style={{ fontSize: '.88rem' }}>
                      {label}
                    </HoverLink>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '1.5rem', borderTop: '1px solid var(--border)', fontSize: '.8rem', color: 'var(--faint)', flexWrap: 'wrap', gap: '.5rem' }}>
            <div>© 2026 Agent Security Exchange, Inc. All rights reserved.</div>
            <a href="#" style={{ color: 'var(--faint)', transition: 'color .15s' }}>Back to top ↑</a>
          </div>
          <div style={{ marginTop: '1.5rem', fontSize: '.72rem', color: 'rgba(238,242,255,.2)', lineHeight: 1.7 }}>
            ASE is in development and is not a registered broker-dealer, investment adviser, or licensed exchange. Nothing on this website constitutes an offer or solicitation to buy or sell any security. All figures and data shown are illustrative and do not represent actual or expected performance. ASE uses Alpaca Paper Trading — no real funds are invested. Past performance is not indicative of future results.
          </div>
        </div>
      </footer>

      <style>{`
        @media(max-width:900px){
          .hero-grid,.feat-grid,.who-grid,.steps-grid,.agents-grid,.rm-grid,.footer-grid{grid-template-columns:1fr!important}
        }
        @keyframes tickerMove{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes dotBlink{0%,100%{opacity:1}50%{opacity:.2}}
      `}</style>
    </div>
  )
}
