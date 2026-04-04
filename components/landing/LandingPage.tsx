'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { HoverCard } from '@/components/ui/hover-card'
import { createClient } from '@/lib/supabase/client'

interface AgentData {
  ticker: string
  slug: string
  name: string
  nav: string
  nav_cents: number
  ret: string
  pos: boolean
  spark: number[]
  type: string
  daily_return_pct: number
  sharpe: number
  total_trades: number
  win_rate: number
  aum_cents: number
}

interface Totals {
  total_aum_usd: string
  total_trades: number
  avg_return_pct: string
  agents_live: number
}

const ROT_WORDS = ['Own the Algorithm', 'Own the Future', 'Own the Alpha']

// Fallback data while loading
const FALLBACK_AGENTS: AgentData[] = [
  { ticker: '$BTCM', slug: 'btc-momentum', name: 'BTC Momentum', ret: '--', nav: '$--', nav_cents: 10000, pos: true, spark: [100,100,100,100,100,100,100,100,100,100], type: 'Momentum', daily_return_pct: 0, sharpe: 0, total_trades: 0, win_rate: 0, aum_cents: 0 },
  { ticker: '$ETHR', slug: 'eth-mean-revert', name: 'ETH Mean Revert', ret: '--', nav: '$--', nav_cents: 10000, pos: true, spark: [100,100,100,100,100,100,100,100,100,100], type: 'Mean Revert', daily_return_pct: 0, sharpe: 0, total_trades: 0, win_rate: 0, aum_cents: 0 },
  { ticker: '$CRTR', slug: 'crypto-trend', name: 'Crypto Trend', ret: '--', nav: '$--', nav_cents: 10000, pos: true, spark: [100,100,100,100,100,100,100,100,100,100], type: 'Trend Following', daily_return_pct: 0, sharpe: 0, total_trades: 0, win_rate: 0, aum_cents: 0 },
  { ticker: '$SOLB', slug: 'sol-breakout', name: 'SOL Breakout', ret: '--', nav: '$--', nav_cents: 10000, pos: true, spark: [100,100,100,100,100,100,100,100,100,100], type: 'Breakout', daily_return_pct: 0, sharpe: 0, total_trades: 0, win_rate: 0, aum_cents: 0 },
  { ticker: '$DEFI', slug: 'defi-basket', name: 'DeFi Basket', ret: '--', nav: '$--', nav_cents: 10000, pos: true, spark: [100,100,100,100,100,100,100,100,100,100], type: 'Multi-Asset', daily_return_pct: 0, sharpe: 0, total_trades: 0, win_rate: 0, aum_cents: 0 },
]

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

function WaitlistForm({ type }: { type: 'investor' | 'builder' }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [extra, setExtra] = useState('')
  const [githubUrl, setGithubUrl] = useState('')
  const [investmentRange, setInvestmentRange] = useState('')
  const [source, setSource] = useState('')
  const [strategyType, setStrategyType] = useState('')
  const [backtestingPlatform, setBacktestingPlatform] = useState('')
  const [liveTrackRecord, setLiveTrackRecord] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !name) return
    setStatus('loading')
    try {
      const supabase = createClient()
      const table = type === 'investor' ? 'waitlist_investors' : 'waitlist_builders'
      const payload = type === 'investor'
        ? {
            email,
            name,
            investment_range: investmentRange || null,
            source: source || extra || null,
          }
        : {
            email,
            name,
            github_url: githubUrl || null,
            strategy_type: strategyType || null,
            strategy_description: extra || null,
            backtesting_platform: backtestingPlatform || null,
            live_track_record: liveTrackRecord,
          }
      const { error } = await supabase.from(table).insert(payload)
      if (error) throw error
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>
          {type === 'investor' ? '🎉' : '🚀'}
        </div>
        <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, marginBottom: '.5rem' }}>
          {type === 'investor' ? "Investor profile saved" : "Builder application received"}
        </div>
        <div style={{ fontSize: '.85rem', color: 'var(--muted)' }}>
          {type === 'investor'
            ? "We’ll reach out with cohort access and product updates."
            : "We’ll review your strategy, repo, and track record for the next cohort."
          }
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
      <input
        type="text"
        placeholder={type === 'investor' ? 'Full name *' : 'Founder / quant name *'}
        value={name}
        onChange={e => setName(e.target.value)}
        required
        style={{
          background: 'rgba(255,255,255,.04)', border: '1px solid var(--border2)',
          borderRadius: 8, padding: '.65rem .85rem', color: 'var(--white)',
          fontSize: '.88rem', outline: 'none',
        }}
      />
      <input
        type="email"
        placeholder="Email *"
        required
        value={email}
        onChange={e => setEmail(e.target.value)}
        style={{
          background: 'rgba(255,255,255,.04)', border: '1px solid var(--border2)',
          borderRadius: 8, padding: '.65rem .85rem', color: 'var(--white)',
          fontSize: '.88rem', outline: 'none',
        }}
      />
      {type === 'investor' ? (
        <>
          <select
            value={investmentRange}
            onChange={e => setInvestmentRange(e.target.value)}
            style={{
              background: 'rgba(255,255,255,.04)', border: '1px solid var(--border2)',
              borderRadius: 8, padding: '.65rem .85rem', color: 'var(--white)',
              fontSize: '.88rem', outline: 'none',
            }}
          >
            <option value="">Target allocation</option>
            <option value="$1k-$5k">$1k-$5k</option>
            <option value="$5k-$25k">$5k-$25k</option>
            <option value="$25k-$100k">$25k-$100k</option>
            <option value="$100k+">$100k+</option>
          </select>
          <select
            value={source}
            onChange={e => setSource(e.target.value)}
            style={{
              background: 'rgba(255,255,255,.04)', border: '1px solid var(--border2)',
              borderRadius: 8, padding: '.65rem .85rem', color: 'var(--white)',
              fontSize: '.88rem', outline: 'none',
            }}
          >
            <option value="">How did you hear about ASE?</option>
            <option value="X / Twitter">X / Twitter</option>
            <option value="Friend or founder">Friend or founder</option>
            <option value="Crypto community">Crypto community</option>
            <option value="Press / podcast">Press / podcast</option>
          </select>
        </>
      ) : (
        <>
          <input
            type="url"
            placeholder="GitHub repo or profile *"
            required
            value={githubUrl}
            onChange={e => setGithubUrl(e.target.value)}
            style={{
              background: 'rgba(255,255,255,.04)', border: '1px solid var(--border2)',
              borderRadius: 8, padding: '.65rem .85rem', color: 'var(--white)',
              fontSize: '.88rem', outline: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Strategy type (momentum, mean reversion, ML, arb)"
            value={strategyType}
            onChange={e => setStrategyType(e.target.value)}
            style={{
              background: 'rgba(255,255,255,.04)', border: '1px solid var(--border2)',
              borderRadius: 8, padding: '.65rem .85rem', color: 'var(--white)',
              fontSize: '.88rem', outline: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Backtesting stack (Backtrader, QuantConnect, custom)"
            value={backtestingPlatform}
            onChange={e => setBacktestingPlatform(e.target.value)}
            style={{
              background: 'rgba(255,255,255,.04)', border: '1px solid var(--border2)',
              borderRadius: 8, padding: '.65rem .85rem', color: 'var(--white)',
              fontSize: '.88rem', outline: 'none',
            }}
          />
        </>
      )}
      <textarea
        placeholder={type === 'investor'
          ? 'What do you want exposure to first? (BTC trend, market-neutral, high-frequency, etc.)'
          : 'Describe the strategy, edge, risk controls, and any live or paper track record'
        }
        value={extra}
        onChange={e => setExtra(e.target.value)}
        rows={type === 'investor' ? 2 : 4}
        style={{
          background: 'rgba(255,255,255,.04)', border: '1px solid var(--border2)',
          borderRadius: 8, padding: '.65rem .85rem', color: 'var(--white)',
          fontSize: '.88rem', outline: 'none', resize: 'none',
        }}
      />
      {type === 'builder' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: '.6rem', fontSize: '.82rem', color: 'var(--muted)' }}>
          <input
            type="checkbox"
            checked={liveTrackRecord}
            onChange={e => setLiveTrackRecord(e.target.checked)}
          />
          I have a live or paper track record I can share during diligence.
        </label>
      )}
      <button
        type="submit"
        disabled={status === 'loading'}
        className="btn-primary"
        style={{ width: '100%', textAlign: 'center', opacity: status === 'loading' ? 0.6 : 1 }}
      >
        {status === 'loading' ? 'Submitting...' : type === 'investor' ? 'Join Investor Cohort' : 'Apply to Launch on ASE'}
      </button>
      {status === 'error' && (
        <div style={{ color: 'var(--red)', fontSize: '.8rem', textAlign: 'center' }}>
          Something went wrong. Try again.
        </div>
      )}
    </form>
  )
}

export default function LandingPage() {
  const [rotIdx, setRotIdx] = useState(0)
  const [navScrolled, setNavScrolled] = useState(false)
  const [agents, setAgents] = useState<AgentData[]>(FALLBACK_AGENTS)
  const [totals, setTotals] = useState<Totals>({ total_aum_usd: '$0', total_trades: 0, avg_return_pct: '0', agents_live: 5 })
  const [loaded, setLoaded] = useState(false)

  // Fetch real agent data
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/agents/public-stats')
      const data = await res.json()
      if (data.agents?.length > 0) {
        setAgents(data.agents)
        setTotals(data.totals)
        setLoaded(true)
      }
    } catch { /* keep fallback */ }
  }, [])

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void fetchData()
    }, 0)
    const iv = setInterval(fetchData, 30_000) // refresh every 30s
    return () => {
      clearTimeout(initial)
      clearInterval(iv)
    }
  }, [fetchData])

  useEffect(() => {
    const iv = setInterval(() => setRotIdx(i => (i + 1) % ROT_WORDS.length), 3000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    const handler = () => setNavScrolled(window.scrollY > 30)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  // Build ticker items from live data
  const tickerItems = agents.map(a => ({
    ticker: a.ticker,
    price: a.nav,
    chg: a.ret,
    pos: a.pos,
  }))

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--white)', overflowX: 'hidden' }}>
      {/* NAVBAR */}
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
            <Link href="#waitlist" style={{ fontSize: '.88rem', fontWeight: 600, color: 'var(--muted)', transition: 'color .2s' }} onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--white)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted)')}>Join Waitlist</Link>
            <Link href="/login" style={{ fontSize: '.88rem', fontWeight: 600, color: 'var(--muted)', transition: 'color .2s' }} onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--white)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted)')}>Login</Link>
            <Link href="/signup" className="btn-primary" style={{ fontSize: '.88rem', padding: '.55rem 1.2rem', borderRadius: 10 }}>
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* TICKER BAR */}
      <div style={{ position: 'fixed', top: 64, left: 0, right: 0, zIndex: 900, background: 'rgba(7,9,15,.92)', borderBottom: '1px solid var(--border)', backdropFilter: 'blur(10px)', height: 36, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', letterSpacing: '.12em', color: loaded ? 'var(--green)' : 'var(--gold)', padding: '0 1rem', borderRight: '1px solid var(--border)', whiteSpace: 'nowrap', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '.4rem' }}>
          {loaded && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', animation: 'dotBlink 1.8s infinite' }} />}
          {loaded ? 'LIVE' : 'LOADING'}
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ display: 'flex', width: 'max-content', animation: 'tickerMove 24s linear infinite' }}>
            {[...tickerItems, ...tickerItems].map((t, i) => (
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
                {totals.agents_live} AGENTS LIVE · TRADING NOW
              </div>

              <h1 style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(2.8rem,6vw,4.2rem)', fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.15, marginBottom: '1.25rem' }}>
                <span style={{ display: 'inline-block', overflow: 'hidden', position: 'relative', verticalAlign: 'text-bottom', minHeight: '1.15em' }}>
                  {ROT_WORDS.map((w, i) => (
                    <span key={w} style={{
                      display: 'block',
                      position: 'absolute',
                      top: 0, left: 0,
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
                ASE turns algorithmic trading into an investable asset class. Back live agents, track every trade, and price each strategy off actual capital in the pool.
              </p>

              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
                <Link href="#waitlist" className="btn-primary">Join Investor Cohort</Link>
                <Link href="#waitlist" className="btn-secondary">Apply as Builder</Link>
              </div>

              {/* Live stats strip */}
              <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Total AUM</div>
                  <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--gold)' }}>{totals.total_aum_usd || '$0'}</div>
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Total Trades</div>
                  <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 700 }}>{totals.total_trades || 0}</div>
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Agents Live</div>
                  <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 700 }}>{totals.agents_live || 5}</div>
                </div>
              </div>
            </div>
          </ScrollFadeUp>

          {/* Hero Card Preview — real data */}
          <ScrollFadeUp>
            <div style={{ position: 'relative' }}>
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,.7)' }}>
                <div className="win-bar">
                  <span className="dot dot-r" /><span className="dot dot-y" /><span className="dot dot-g" />
                  <span className="win-title" style={{ marginLeft: '.3rem' }}>ase.app · Live Agents</span>
                  <span className="pill pill-green" style={{ marginLeft: 'auto' }}>TRADING</span>
                </div>
                <div style={{ padding: '1rem' }}>
                  {agents.slice(0, 4).map((a, i) => (
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
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: a.pos ? 'var(--green)' : 'var(--red)' }}>{a.ret}</div>
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
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '1rem 0', fontSize: '1.5rem', color: 'var(--gold)' }}>
              ↓ The ASE Difference ↓
            </div>
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

      {/* HOW IT WORKS */}
      <section id="how" style={{ padding: '80px 1.5rem' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <div className="eyebrow">HOW IT WORKS</div>
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(1.8rem,3.5vw,2.8rem)', fontWeight: 800, marginTop: '.5rem' }}>Own, Trade, Grow</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1.25rem' }} className="steps-grid">
            {[
              { n: '01', title: 'OWN', desc: "Buy tokens in a trading agent's capital pool and own a real piece of their strategy. More capital means bigger positions and faster growth." },
              { n: '02', title: 'TRADE', desc: 'Agents execute verified strategies 24/7 on live crypto markets. Every trade is logged in real-time with full transparency.' },
              { n: '03', title: 'GROW', desc: 'Trading profits increase NAV, your tokens appreciate. Token price reflects the total pool: $10k seed at $100, $70k pool at $700.' },
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

      {/* LIVE AGENTS - real data */}
      <section id="agents" style={{ padding: '80px 1.5rem', background: 'rgba(0,0,0,.3)' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div className="eyebrow">LIVE AGENTS</div>
              <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(1.8rem,3.5vw,2.8rem)', fontWeight: 800, marginTop: '.5rem' }}>Five verified trading strategies</h2>
            </div>
            <Link href="/dashboard/exchange" className="btn-secondary">View Exchange</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '1.25rem' }} className="agents-grid">
            {agents.map((a) => (
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
                    <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.5rem', fontWeight: 800, color: a.pos ? 'var(--green)' : 'var(--red)' }}>{a.ret}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--faint)' }}>Total Return</div>
                  </div>
                  <div style={{ marginBottom: '1rem' }}>
                    <Spark data={a.spark} pos={a.pos} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem', paddingTop: '.75rem', borderTop: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.68rem', fontWeight: 700 }}>{a.nav}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: 'var(--faint)' }}>NAV/share</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.68rem', fontWeight: 700 }}>{a.total_trades}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: 'var(--faint)' }}>Trades</div>
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.68rem', fontWeight: 700 }}>{a.win_rate.toFixed(0)}%</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: 'var(--faint)' }}>Win Rate</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--muted)' }}>{a.type}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: 'var(--faint)' }}>Strategy</div>
                    </div>
                  </div>
                </HoverCard>
              </ScrollFadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* WHY DIFFERENT */}
      <section style={{ padding: '80px 1.5rem' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <div className="eyebrow">WHY ASE IS DIFFERENT</div>
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(1.8rem,3.5vw,2.8rem)', fontWeight: 800, marginTop: '.5rem' }}>Built for trust and transparency</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1.5rem' }} className="why-grid">
            {[
              { icon: '◆', title: 'Real Execution', desc: 'Every trade executes against live market data. No simulated returns, no fake performance.' },
              { icon: '▲', title: 'Pool-Based Pricing', desc: 'Token price = total capital pool / base. $10k = $100, $70k = $700. Simple, transparent.' },
              { icon: '★', title: 'Performance-Aligned', desc: 'Developers profit only when you do. No AUM-based rent extraction.' },
              { icon: '◉', title: 'Full Transparency', desc: 'See every trade, every signal, every decision your agent makes in real-time.' },
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

      {/* DUAL WAITLIST - Investors & Builders */}
      <section id="waitlist" style={{ padding: '80px 1.5rem', background: 'rgba(0,0,0,.3)' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <div className="eyebrow">EARLY ACCESS</div>
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(1.8rem,3.5vw,2.8rem)', fontWeight: 800, marginTop: '.5rem' }}>Two doors into the network</h2>
            <p style={{ fontSize: '1rem', color: 'var(--muted)', marginTop: '.75rem', maxWidth: 600, margin: '.75rem auto 0' }}>
              Investors get early access to the strongest live agents. Builders get distribution, diligence, and capital formation infrastructure.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', maxWidth: 900, margin: '0 auto' }} className="audience-grid">
            <ScrollFadeUp>
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 16, padding: '2rem', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, var(--green), transparent)' }} />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', letterSpacing: '.1em', color: 'var(--green)', marginBottom: '.75rem', textTransform: 'uppercase' }}>FOR INVESTORS</div>
                <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1.3rem', fontWeight: 800, marginBottom: '.5rem' }}>For investors</h3>
                <p style={{ fontSize: '.85rem', color: 'var(--muted)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                  Allocate into the first live cohort, see auditable strategy behavior, and track pricing directly off deployed capital and realized performance.
                </p>
                <WaitlistForm type="investor" />
              </div>
            </ScrollFadeUp>
            <ScrollFadeUp>
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 16, padding: '2rem', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, var(--gold), transparent)' }} />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', letterSpacing: '.1em', color: 'var(--gold)', marginBottom: '.75rem', textTransform: 'uppercase' }}>FOR BUILDERS</div>
                <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1.3rem', fontWeight: 800, marginBottom: '.5rem' }}>For builders</h3>
                <p style={{ fontSize: '.85rem', color: 'var(--muted)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                  Submit your repo, track record, and stack. We handle the storefront, investor funnel, and operational rails once you clear diligence.
                </p>
                <WaitlistForm type="builder" />
              </div>
            </ScrollFadeUp>
          </div>
        </div>
      </section>

      {/* STATS BAR - Real data */}
      <section style={{ padding: '60px 1.5rem' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '2rem', textAlign: 'center' }} className="stats-grid">
            {[
              { num: totals.total_aum_usd || '$0', label: 'Total AUM' },
              { num: `${totals.agents_live || 5}`, label: 'Live Agents' },
              { num: `${totals.total_trades || 0}`, label: 'Total Trades' },
              { num: '24/7', label: 'Markets Covered' },
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
          <p style={{ fontSize: '1.05rem', color: 'var(--muted)', lineHeight: 1.75, marginBottom: '2.5rem' }}>Start investing in verified trading strategies. Real market data, real execution, full transparency.</p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/signup" className="btn-primary">Create Free Account</Link>
            <Link href="#waitlist" className="btn-secondary">Join Waitlist</Link>
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
                {[['Exchange', '/dashboard/exchange'], ['Dashboard', '/dashboard'], ['Deposit', '/dashboard/deposit']].map(([label, href]) => (
                  <li key={label}><Link href={href} style={{ fontSize: '.85rem', color: 'var(--muted)', transition: 'color .2s' }} onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--white)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted)')}>{label}</Link></li>
                ))}
              </ul>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-head)', fontSize: '.95rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--white)' }}>Developers</div>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                {[['Submit Agent', '#waitlist'], ['Documentation', '#'], ['Support', '#']].map(([label, href]) => (
                  <li key={label}><Link href={href} style={{ fontSize: '.85rem', color: 'var(--muted)', transition: 'color .2s' }} onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--white)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted)')}>{label}</Link></li>
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
            <div style={{ fontSize: '.8rem', color: 'var(--faint)' }}>© 2026 Agent Securities Exchange. Paper trading only. Not financial advice.</div>
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
