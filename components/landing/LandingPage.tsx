'use client'

import { useEffect, useRef, useState, FormEvent } from 'react'
import Link from 'next/link'

// ─────────────────────────────────────────────────────────────────────────────
// MARKET GRAVITY — animated hero canvas
// ─────────────────────────────────────────────────────────────────────────────
function MarketGravity({ density = 1 }: { density?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 })
  const tradesRef = useRef<Array<{ x: number; y: number; vx: number; vy: number; life: number; color: string }>>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => {
      const r = canvas.getBoundingClientRect()
      canvas.width = r.width * dpr
      canvas.height = r.height * dpr
      ctx.scale(dpr, dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    const ASSETS = [
      { sym: 'BTC',  color: '#F7931A', mass: 1.0, basePrice: 65000 },
      { sym: 'ETH',  color: '#627EEA', mass: 0.7, basePrice: 3500 },
      { sym: 'SOL',  color: '#14F195', mass: 0.55, basePrice: 180 },
      { sym: 'BNB',  color: '#F0B90B', mass: 0.5, basePrice: 600 },
      { sym: 'AVAX', color: '#E84142', mass: 0.45, basePrice: 35 },
      { sym: 'LINK', color: '#2A5ADA', mass: 0.4, basePrice: 18 },
      { sym: 'ADA',  color: '#0033AD', mass: 0.35, basePrice: 0.45 },
      { sym: 'DOT',  color: '#E6007A', mass: 0.35, basePrice: 7 },
      { sym: 'XRP',  color: '#23292F', mass: 0.3, basePrice: 0.55 },
      { sym: 'DOGE', color: '#C2A633', mass: 0.3, basePrice: 0.15 },
    ].slice(0, Math.max(4, Math.round(10 * density)))

    type Body = {
      sym: string; color: string; mass: number; basePrice: number
      x: number; y: number; vx: number; vy: number
      r: number; price: number; trend: number
    }

    const bodies: Body[] = ASSETS.map((a, i) => {
      const angle = (i / ASSETS.length) * Math.PI * 2
      const dist = 180 + Math.random() * 120
      return {
        ...a,
        x: Math.cos(angle) * dist, y: Math.sin(angle) * dist * 0.55,
        vx: Math.sin(angle) * 0.18, vy: -Math.cos(angle) * 0.18,
        r: 6 + a.mass * 14,
        price: a.basePrice,
        trend: 0,
      }
    })

    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect()
      mouseRef.current.tx = (e.clientX - r.left - r.width / 2) * 0.04
      mouseRef.current.ty = (e.clientY - r.top - r.height / 2) * 0.04
    }
    window.addEventListener('mousemove', onMove)

    const tradeInterval = setInterval(() => {
      if (bodies.length < 2) return
      const a = bodies[Math.floor(Math.random() * bodies.length)]
      const b = bodies[Math.floor(Math.random() * bodies.length)]
      if (a === b) return
      const dx = b.x - a.x, dy = b.y - a.y
      const dist = Math.hypot(dx, dy) || 1
      for (let i = 0; i < 8; i++) {
        tradesRef.current.push({
          x: a.x, y: a.y,
          vx: (dx / dist) * (1.5 + Math.random()),
          vy: (dy / dist) * (1.5 + Math.random()),
          life: 1,
          color: Math.random() > 0.5 ? '#16C784' : '#4F8CFF',
        })
      }
      a.trend = (Math.random() - 0.4) * 0.02
    }, 320)

    let raf = 0
    const draw = () => {
      const W = canvas.width / dpr
      const H = canvas.height / dpr
      ctx.clearRect(0, 0, W, H)

      mouseRef.current.x += (mouseRef.current.tx - mouseRef.current.x) * 0.06
      mouseRef.current.y += (mouseRef.current.ty - mouseRef.current.y) * 0.06
      const cx = W / 2 + mouseRef.current.x
      const cy = H / 2 + mouseRef.current.y

      for (const b of bodies) {
        const r = Math.hypot(b.x, b.y) || 1
        const k = 0.0014 * b.mass
        b.vx -= (b.x / r) * k * (r - 220) * 0.01
        b.vy -= (b.y / r) * k * (r - 220) * 0.01
        for (const o of bodies) {
          if (o === b) continue
          const dx = b.x - o.x, dy = b.y - o.y
          const d = Math.hypot(dx, dy) || 1
          if (d < 90) {
            const f = (90 - d) / 90 * 0.05
            b.vx += (dx / d) * f
            b.vy += (dy / d) * f
          }
        }
        b.vx *= 0.985; b.vy *= 0.985
        b.x += b.vx; b.y += b.vy
        b.price *= 1 + (Math.random() - 0.5) * 0.001 + b.trend * 0.003
        b.trend *= 0.92
      }

      ctx.strokeStyle = 'rgba(79,140,255,0.10)'
      ctx.lineWidth = 0.6
      for (const b of bodies) {
        const sorted = bodies
          .filter(o => o !== b)
          .map(o => ({ o, d: Math.hypot(o.x - b.x, o.y - b.y) }))
          .sort((p, q) => p.d - q.d)
          .slice(0, 2)
        for (const { o, d } of sorted) {
          if (d > 260) continue
          ctx.globalAlpha = Math.max(0, 1 - d / 260) * 0.35
          ctx.beginPath()
          ctx.moveTo(cx + b.x, cy + b.y)
          ctx.lineTo(cx + o.x, cy + o.y)
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1

      tradesRef.current = tradesRef.current.filter(t => t.life > 0)
      for (const t of tradesRef.current) {
        t.x += t.vx; t.y += t.vy
        t.life -= 0.018
        ctx.fillStyle = t.color
        ctx.globalAlpha = Math.max(0, t.life)
        ctx.beginPath()
        ctx.arc(cx + t.x, cy + t.y, 1.6, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      for (const b of bodies) {
        const px = cx + b.x, py = cy + b.y
        const grad = ctx.createRadialGradient(px, py, 0, px, py, b.r * 4)
        grad.addColorStop(0, b.color + '55')
        grad.addColorStop(0.4, b.color + '22')
        grad.addColorStop(1, b.color + '00')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(px, py, b.r * 4, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = b.color
        ctx.beginPath()
        ctx.arc(px, py, b.r, 0, Math.PI * 2)
        ctx.fill()

        ctx.strokeStyle = '#ffffff66'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(px, py, b.r, 0, Math.PI * 2)
        ctx.stroke()

        ctx.fillStyle = '#ffffffcc'
        ctx.font = '600 9px ui-monospace, JetBrains Mono, monospace'
        ctx.textAlign = 'center'
        ctx.fillText(b.sym, px, py + b.r + 11)
      }

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      clearInterval(tradeInterval)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMove)
    }
  }, [density])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        pointerEvents: 'none',
      }}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE TRADE FEED
// ─────────────────────────────────────────────────────────────────────────────
type Trade = { id: number; agent: string; sym: string; side: 'BUY' | 'SELL'; pct: number; reason: string; t: number }
function LiveTradeFeed() {
  const [trades, setTrades] = useState<Trade[]>([])
  useEffect(() => {
    const agents = ['Momentum Carry', 'Mean Reversion Pro', 'Vol Harvester', 'Composite Alpha', 'Trend Sniper', 'Risk Parity Pulse']
    const syms = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'AVAX-USD', 'LINK-USD']
    const reasons = [
      '20d momentum +6.4%, ranking #1',
      'Z-score -1.8, mean reversion',
      'Vol expansion 32% above 20d',
      'EMA cross 9/21, trend on',
      'RSI(14) oversold rebound',
      'Composite score 0.78',
      'Funding rate flip negative',
      'Volume spike 2.4×',
    ]
    let id = 0
    const push = () => {
      const t: Trade = {
        id: id++,
        agent: agents[Math.floor(Math.random() * agents.length)],
        sym: syms[Math.floor(Math.random() * syms.length)],
        side: Math.random() > 0.5 ? 'BUY' : 'SELL',
        pct: +(0.5 + Math.random() * 4.5).toFixed(2),
        reason: reasons[Math.floor(Math.random() * reasons.length)],
        t: Date.now(),
      }
      setTrades(prev => [t, ...prev].slice(0, 5))
    }
    push(); push(); push()
    const i = setInterval(push, 1800 + Math.random() * 1200)
    return () => clearInterval(i)
  }, [])

  return (
    <div style={{
      position: 'absolute', right: '5%', top: '50%', transform: 'translateY(-50%)',
      width: 320, maxWidth: '38vw', display: 'flex', flexDirection: 'column', gap: 6,
      pointerEvents: 'none',
    }} className="live-feed">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16C784', animation: 'breathe 1.5s ease-in-out infinite', boxShadow: '0 0 8px #16C784' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#16C784', letterSpacing: '0.12em', fontWeight: 700 }}>LIVE TRADES · ON-CHAIN</span>
      </div>
      {trades.map((t, i) => (
        <div key={t.id} style={{
          background: 'rgba(11,23,40,0.88)',
          border: '1px solid rgba(79,140,255,0.18)',
          backdropFilter: 'blur(12px)',
          borderRadius: 10, padding: '8px 11px',
          opacity: 1 - i * 0.16,
          transform: `translateY(${i * -2}px) scale(${1 - i * 0.025})`,
          animation: i === 0 ? 'feedSlideIn .35s ease' : 'none',
          fontFamily: 'var(--font-mono)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
            <span style={{ fontSize: 10, color: '#F7FAFF', fontWeight: 600 }}>{t.agent}</span>
            <span style={{ fontSize: 8, color: t.side === 'BUY' ? '#16C784' : '#E45867', fontWeight: 800 }}>
              {t.side} {t.sym}
            </span>
          </div>
          <div style={{ fontSize: 9, color: '#94a3b8', lineHeight: 1.4, marginBottom: 3 }}>{t.reason}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8 }}>
            <span style={{ color: '#55657A' }}>+{t.pct}% allocation</span>
            <span style={{ color: '#16C784' }}>● filled</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TICKER
// ─────────────────────────────────────────────────────────────────────────────
const TICKER_DATA = [
  { l: 'BTC/USD', v: '+18.4%', p: true }, { l: 'ETH/USD', v: '+12.1%', p: true },
  { l: 'SOL/USD', v: '+31.8%', p: true }, { l: 'AVAX/USD', v: '−4.2%', p: false },
  { l: 'BNB/USD', v: '+9.1%', p: true }, { l: 'LINK/USD', v: '+6.7%', p: true },
  { l: 'Avg Sharpe', v: '1.84', p: true }, { l: 'Win Rate', v: '62%', p: true },
  { l: 'Live Agents', v: '11', p: true }, { l: 'Trades/24h', v: '288+', p: true },
]
function Ticker() {
  return (
    <div style={{
      borderTop: '1px solid rgba(30,42,61,0.55)', borderBottom: '1px solid rgba(30,42,61,0.55)',
      background: 'rgba(6,17,31,0.85)', overflow: 'hidden', height: 36,
      display: 'flex', alignItems: 'center', position: 'relative', zIndex: 2,
    }}>
      <div style={{ display: 'flex', whiteSpace: 'nowrap', animation: 'drift 38s linear infinite', willChange: 'transform' }}>
        {[...TICKER_DATA, ...TICKER_DATA].map((it, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 22px', fontFamily: 'var(--font-mono)', fontSize: 11, borderRight: '1px solid rgba(30,42,61,0.55)' }}>
            <span style={{ color: '#55657A' }}>{it.l}</span>
            <span style={{ color: it.p ? '#16C784' : '#E45867', fontWeight: 700 }}>{it.v}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT CARD
// ─────────────────────────────────────────────────────────────────────────────
function AgentCard({ rank, name, sym, ret, sharpe, trades, grade, color }: {
  rank: number; name: string; sym: string; ret: string; sharpe: string;
  trades: number; grade: string; color: string
}) {
  const [hover, setHover] = useState(false)
  const path = (() => {
    const pts = Array.from({ length: 30 }, (_, i) => {
      const tilt = i / 29
      const drift = +ret >= 0 ? tilt * 22 : -tilt * 16
      const noise = Math.sin(i * 0.7) * 4 + Math.cos(i * 1.5) * 3
      return `${(i / 29) * 100},${Math.max(4, Math.min(36, 22 - drift + noise))}`
    }).join(' ')
    return pts
  })()

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: 'linear-gradient(180deg, rgba(11,23,40,0.95), rgba(6,17,31,0.95))',
        border: `1px solid ${hover ? color + '50' : 'rgba(30,42,61,0.7)'}`,
        borderRadius: 14, padding: '1.05rem 1.15rem',
        transform: hover ? 'translateY(-4px)' : 'none',
        boxShadow: hover ? `0 18px 40px rgba(0,0,0,.5), 0 0 28px ${color}26` : '0 6px 18px rgba(0,0,0,.3)',
        transition: 'all .25s cubic-bezier(.2,.7,.3,1)',
        position: 'relative', overflow: 'hidden',
      }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: 2,
        background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        opacity: hover ? 1 : 0.3, transition: 'opacity .25s',
      }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 26, height: 26, borderRadius: 7,
          background: color + '18', border: `1px solid ${color}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-mono)', fontSize: 10, color, fontWeight: 800,
        }}>#{rank}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '.85rem', color: '#F7FAFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#55657A', marginTop: 1 }}>{sym} · LIVE</div>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800, color, padding: '2px 7px', borderRadius: 5, background: color + '15', border: `1px solid ${color}30` }}>{grade}</div>
      </div>
      <svg width="100%" height="42" viewBox="0 0 100 42" preserveAspectRatio="none" style={{ marginBottom: 10 }}>
        <defs>
          <linearGradient id={`g-${rank}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,42 ${path} 100,42`} fill={`url(#g-${rank})`} />
        <polyline points={path} fill="none" stroke={color} strokeWidth="1.5" />
      </svg>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7 }}>
        {[
          { l: 'RETURN', v: ret + '%', c: +ret >= 0 ? '#16C784' : '#E45867' },
          { l: 'SHARPE', v: sharpe, c: '#F7FAFF' },
          { l: 'TRADES', v: trades.toString(), c: '#94a3b8' },
        ].map(s => (
          <div key={s.l} style={{ background: 'rgba(16,26,45,0.7)', borderRadius: 6, padding: '5px 7px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: '#55657A', letterSpacing: '0.08em', marginBottom: 2 }}>{s.l}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: s.c }}>{s.v}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// WAITLIST FORM
// ─────────────────────────────────────────────────────────────────────────────
function WaitlistForm({ type = 'investor', compact = false }: { type?: 'investor' | 'developer'; compact?: boolean }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [strategy, setStrategy] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (status === 'loading' || status === 'done') return
    setStatus('loading')
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: name || undefined, strategy: strategy || undefined, type }),
      })
      if (res.ok) setStatus('done')
      else setStatus('error')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: compact ? '0.75rem 1.2rem' : '1.1rem 1.5rem',
        borderRadius: 12, background: 'rgba(22,199,132,0.08)',
        border: '1px solid rgba(22,199,132,0.3)',
      }}>
        <span style={{ fontSize: 18 }}>✓</span>
        <div>
          <div style={{ fontWeight: 700, color: '#16C784', fontSize: '0.88rem' }}>You&apos;re on the list</div>
          {!compact && <div style={{ color: '#94a3b8', fontSize: '0.78rem', marginTop: 2 }}>We&apos;ll reach out when early access opens.</div>}
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: compact ? 8 : 12, width: '100%' }}>
      {!compact && (
        <input
          type="text"
          placeholder="Your name (optional)"
          value={name}
          onChange={e => setName(e.target.value)}
          style={{
            background: 'rgba(6,17,31,0.8)', border: '1px solid rgba(30,42,61,0.9)',
            borderRadius: 10, padding: '0.75rem 1rem',
            color: '#F7FAFF', fontSize: '0.88rem', outline: 'none',
            fontFamily: 'inherit',
            transition: 'border-color .15s',
          }}
          onFocus={e => e.target.style.borderColor = 'rgba(79,140,255,0.5)'}
          onBlur={e => e.target.style.borderColor = 'rgba(30,42,61,0.9)'}
        />
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          style={{
            flex: 1, background: 'rgba(6,17,31,0.8)', border: '1px solid rgba(30,42,61,0.9)',
            borderRadius: 10, padding: compact ? '0.65rem 1rem' : '0.75rem 1rem',
            color: '#F7FAFF', fontSize: '0.88rem', outline: 'none',
            fontFamily: 'inherit', minWidth: 0,
            transition: 'border-color .15s',
          }}
          onFocus={e => e.target.style.borderColor = 'rgba(79,140,255,0.5)'}
          onBlur={e => e.target.style.borderColor = 'rgba(30,42,61,0.9)'}
        />
        <button type="submit" disabled={status === 'loading'} style={{
          padding: compact ? '0.65rem 1.2rem' : '0.75rem 1.5rem',
          borderRadius: 10, border: 'none', cursor: status === 'loading' ? 'wait' : 'pointer',
          background: 'linear-gradient(135deg, #3566E9, #4F8CFF)',
          color: '#fff', fontWeight: 700, fontSize: '0.88rem',
          whiteSpace: 'nowrap', opacity: status === 'loading' ? 0.7 : 1,
          transition: 'all .15s', boxShadow: '0 4px 18px rgba(79,140,255,0.38)',
        }}>
          {status === 'loading' ? '...' : 'Join Waitlist'}
        </button>
      </div>
      {type === 'developer' && !compact && (
        <textarea
          placeholder="Briefly describe your trading strategy idea (optional)"
          value={strategy}
          onChange={e => setStrategy(e.target.value)}
          rows={2}
          style={{
            background: 'rgba(6,17,31,0.8)', border: '1px solid rgba(30,42,61,0.9)',
            borderRadius: 10, padding: '0.75rem 1rem',
            color: '#F7FAFF', fontSize: '0.85rem', outline: 'none',
            fontFamily: 'inherit', resize: 'vertical',
            transition: 'border-color .15s',
          }}
          onFocus={e => e.target.style.borderColor = 'rgba(79,140,255,0.5)'}
          onBlur={e => e.target.style.borderColor = 'rgba(30,42,61,0.9)'}
        />
      )}
      {status === 'error' && (
        <div style={{ color: '#E45867', fontSize: '0.78rem' }}>Something went wrong — please try again.</div>
      )}
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SCROLL REVEAL HOOK
// ─────────────────────────────────────────────────────────────────────────────
function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  const [vis, setVis] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect() } }, { threshold: 0.1 })
    obs.observe(el); return () => obs.disconnect()
  }, [])
  return { ref, style: { opacity: vis ? 1 : 0, transform: vis ? 'none' : 'translateY(28px)', transition: 'opacity .8s ease, transform .8s ease' } }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [scrollY, setScrollY] = useState(0)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => { setScrollY(window.scrollY); setScrolled(window.scrollY > 24) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const agents = useReveal()
  const howItWorks = useReveal()
  const features = useReveal()
  const ctaSection = useReveal()

  const scrollToWaitlist = () => {
    document.getElementById('waitlist')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div style={{ minHeight: '100vh', background: '#04101F', color: '#F7FAFF', overflowX: 'hidden' }}>

      {/* ═════════════ NAV ═════════════ */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: 52, display: 'flex', alignItems: 'center', padding: '0 1.5rem',
        background: scrolled ? 'rgba(6,17,31,0.92)' : 'rgba(6,17,31,0.05)',
        borderBottom: `1px solid ${scrolled ? 'rgba(30,42,61,0.8)' : 'transparent'}`,
        backdropFilter: scrolled ? 'blur(24px) saturate(160%)' : 'none',
        transition: 'all 0.22s ease',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/transparent_logo.png" alt="ASE" style={{ height: 26, width: 'auto', objectFit: 'contain' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, color: '#F7FAFF', letterSpacing: '0.08em' }}>ASE</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={scrollToWaitlist} style={{
            padding: '0.42rem 1rem', borderRadius: 7,
            background: 'rgba(79,140,255,0.12)', border: '1px solid rgba(79,140,255,0.28)',
            color: '#6BA3FF', fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
            fontWeight: 700, letterSpacing: '0.04em', cursor: 'pointer',
            transition: 'all .15s',
          }}>
            Join Waitlist
          </button>
          <Link href="/login" style={{
            padding: '0.42rem 0.9rem', borderRadius: 7,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)',
            color: '#94a3b8', fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
            fontWeight: 600, textDecoration: 'none',
            transition: 'all .15s',
          }}>
            Sign In
          </Link>
        </div>
      </nav>

      {/* Fixed grid + radial backdrop */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(79,140,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(79,140,255,0.04) 1px, transparent 1px)', backgroundSize: '72px 72px', maskImage: 'radial-gradient(ellipse 70% 60% at 50% 25%, black, transparent)' }} />
        <div style={{ position: 'absolute', top: '-15%', left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '90vh', background: 'radial-gradient(ellipse 60% 50% at 50% 30%, rgba(79,140,255,0.18), transparent 70%)' }} />
      </div>

      {/* ═════════════ HERO ═════════════ */}
      <section style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden', zIndex: 1 }}>
        <MarketGravity density={1} />
        <LiveTradeFeed />

        <div style={{
          position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', textAlign: 'center',
          minHeight: '100vh', padding: '7rem 1.5rem 3rem',
          transform: `translateY(${-scrollY * 0.25}px)`,
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 14px', borderRadius: 100,
            background: 'rgba(22,199,132,0.07)',
            border: '1px solid rgba(22,199,132,0.22)',
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em',
            color: '#16C784', marginBottom: '1.75rem',
            backdropFilter: 'blur(8px)',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16C784', boxShadow: '0 0 10px #16C784', animation: 'breathe 2s ease-in-out infinite' }} />
            EARLY ACCESS · CRYPTO-ONLY · KRAKEN NATIVE
          </div>

          <h1 style={{
            fontFamily: 'var(--font-body)', fontWeight: 900,
            fontSize: 'clamp(2.6rem, 7.2vw, 6rem)',
            lineHeight: 0.92, letterSpacing: '-0.055em',
            margin: '0 0 1.5rem', maxWidth: 980, color: '#F7FAFF',
          }}>
            The exchange<br />
            for{' '}
            <span style={{
              background: 'linear-gradient(135deg, #4F8CFF 0%, #6BA3FF 35%, #16C784 80%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              autonomous capital
            </span>
            .
          </h1>

          <p style={{
            fontSize: 'clamp(1rem, 1.6vw, 1.18rem)', color: '#94a3b8',
            lineHeight: 1.7, maxWidth: 580, margin: '0 auto 2.4rem',
          }}>
            Allocate to verified AI crypto strategies. Build and publish your own.
            Every trade on Kraken, every backtest reproducible, every fee transparent.
          </p>

          {/* Waitlist inline CTA */}
          <div style={{ width: '100%', maxWidth: 480, backdropFilter: 'blur(12px)' }}>
            <WaitlistForm compact />
          </div>
          <p style={{ color: '#55657A', fontSize: '0.72rem', marginTop: 10, fontFamily: 'var(--font-mono)' }}>
            No spam. Invite-only early access.
          </p>

          {/* Floor stats */}
          <div style={{
            position: 'absolute', bottom: 36, left: 0, right: 0,
            display: 'flex', justifyContent: 'center', gap: 'clamp(20px, 5vw, 56px)',
            flexWrap: 'wrap', padding: '0 1.5rem',
          }}>
            {[
              { v: '11', l: 'Live Agents' },
              { v: '1.84', l: 'Avg Sharpe' },
              { v: '288+', l: 'Ticks / Day' },
              { v: 'Kraken', l: 'Exchange' },
            ].map(s => (
              <div key={s.l} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 'clamp(1.2rem, 2vw, 1.6rem)', color: '#F7FAFF', letterSpacing: '-0.03em' }}>{s.v}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#55657A', letterSpacing: '0.1em', marginTop: 2 }}>{s.l.toUpperCase()}</div>
              </div>
            ))}
          </div>

          <div style={{
            position: 'absolute', bottom: 110, left: '50%', transform: 'translateX(-50%)',
            fontFamily: 'var(--font-mono)', fontSize: 9, color: '#55657A', letterSpacing: '0.18em',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            animation: 'bobble 2.5s ease-in-out infinite',
          }}>
            <span>SCROLL</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
          </div>
        </div>
      </section>

      <Ticker />

      {/* ═════════════ AGENT SHOWCASE ═════════════ */}
      <section ref={agents.ref} style={{ ...agents.style, padding: '7rem 1.5rem 5rem', maxWidth: 1280, margin: '0 auto', position: 'relative', zIndex: 2 }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 100, background: 'rgba(79,140,255,0.07)', border: '1px solid rgba(79,140,255,0.22)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', color: '#6BA3FF', marginBottom: '1.25rem' }}>
            AGENT SHOWCASE · LIVE PERFORMANCE
          </div>
          <h2 style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 'clamp(2rem, 4.5vw, 3.2rem)', letterSpacing: '-0.045em', margin: '0 0 .75rem', color: '#F7FAFF' }}>
            Real strategies. Real fills.<br />Real money.
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.98rem', maxWidth: 580, margin: '0 auto', lineHeight: 1.65 }}>
            Every agent here trades on Kraken with real capital. Returns are after fees and slippage — no marketing P&amp;L.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.1rem' }}>
          {[
            { rank: 1, name: 'Crypto Momentum Carry', sym: 'BTC-USD · ETH-USD', ret: '32.4', sharpe: '2.18', trades: 504, grade: 'A+', color: '#16C784' },
            { rank: 2, name: 'Composite Alpha v2', sym: '5 majors', ret: '24.1', sharpe: '1.94', trades: 612, grade: 'A', color: '#4F8CFF' },
            { rank: 3, name: 'Vol Harvester', sym: 'SOL-USD', ret: '18.7', sharpe: '1.62', trades: 287, grade: 'A−', color: '#A78BFA' },
            { rank: 4, name: 'Mean Reversion Pro', sym: 'BTC · ETH · BNB', ret: '14.2', sharpe: '1.41', trades: 432, grade: 'B+', color: '#F5B942' },
            { rank: 5, name: 'Trend Sniper', sym: 'ETH-USD', ret: '12.8', sharpe: '1.28', trades: 198, grade: 'B+', color: '#22D3EE' },
            { rank: 6, name: 'Risk Parity Pulse', sym: '7 majors', ret: '9.6', sharpe: '1.10', trades: 124, grade: 'B', color: '#F472B6' },
          ].map(a => <AgentCard key={a.rank} {...a} />)}
        </div>

        <div style={{ textAlign: 'center', marginTop: '2.5rem' }}>
          <button onClick={scrollToWaitlist} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '0.7rem 1.6rem', borderRadius: 10,
            border: '1px solid rgba(79,140,255,0.28)', background: 'rgba(79,140,255,0.07)',
            color: '#6BA3FF', fontFamily: 'var(--font-mono)', fontSize: '0.78rem',
            fontWeight: 700, cursor: 'pointer', transition: 'all .15s',
          }}>
            REQUEST EARLY ACCESS →
          </button>
        </div>
      </section>

      {/* ═════════════ HOW IT WORKS ═════════════ */}
      <section ref={howItWorks.ref} style={{ ...howItWorks.style, padding: '5rem 1.5rem 6rem', maxWidth: 1280, margin: '0 auto', position: 'relative', zIndex: 2 }}>
        <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
          <div style={{ display: 'inline-flex', padding: '4px 12px', borderRadius: 100, background: 'rgba(22,199,132,0.07)', border: '1px solid rgba(22,199,132,0.22)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', color: '#16C784', marginBottom: '1.25rem' }}>
            HOW IT WORKS
          </div>
          <h2 style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 'clamp(2rem, 4vw, 3rem)', letterSpacing: '-0.045em', margin: '0 0 0.75rem', color: '#F7FAFF' }}>
            Four steps from idea to live capital.
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem', maxWidth: 540, margin: '0 auto' }}>
            ASE handles the infrastructure — you focus on alpha.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }} className="how-grid">
          {[
            {
              step: '01', accent: '#4F8CFF', title: 'Connect your Kraken account',
              body: 'Link read-only API keys. Your funds never leave Kraken. ASE holds zero custody — it only sends signed orders on your behalf through a revocable API key.',
              demo: (
                <div style={{ background: '#06111F', border: '1px solid #1E2A3D', borderRadius: 8, padding: '12px', fontFamily: 'var(--font-mono)', fontSize: 9 }}>
                  <div style={{ color: '#55657A', marginBottom: 6 }}>// kraken_api.ts</div>
                  <div style={{ color: '#94a3b8' }}>const keys = {'{'}</div>
                  <div style={{ paddingLeft: 10, color: '#F7FAFF' }}>apiKey: <span style={{ color: '#16C784' }}>&apos;read-only key&apos;</span>,</div>
                  <div style={{ paddingLeft: 10, color: '#F7FAFF' }}>scope: [<span style={{ color: '#16C784' }}>&apos;trade&apos;</span>, <span style={{ color: '#16C784' }}>&apos;balance&apos;</span>],</div>
                  <div style={{ paddingLeft: 10, color: '#55657A' }}>// revoke anytime from Kraken UI</div>
                  <div style={{ color: '#94a3b8' }}>{'}'}</div>
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16C784' }} />
                    <span style={{ color: '#16C784', fontWeight: 700 }}>NON-CUSTODIAL</span>
                  </div>
                </div>
              ),
            },
            {
              step: '02', accent: '#16C784', title: 'Pick a strategy or build one',
              body: 'Browse the agent marketplace and allocate with one click. Or write your own in plain English or TypeScript — the Quant Lab AI compiles it into a live strategy with backtesting in seconds.',
              demo: (
                <div style={{ background: '#06111F', border: '1px solid #1E2A3D', borderRadius: 8, padding: '12px', fontFamily: 'var(--font-mono)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 9, color: '#55657A', letterSpacing: '0.08em' }}>BACKTEST · 504 BARS · 2Y</span>
                    <span style={{ fontSize: 9, color: '#16C784', fontWeight: 800 }}>GRADE A</span>
                  </div>
                  <svg width="100%" height="48" viewBox="0 0 100 48" preserveAspectRatio="none" style={{ marginBottom: 8 }}>
                    <defs><linearGradient id="bt2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#16C784" stopOpacity="0.4" /><stop offset="100%" stopColor="#16C784" stopOpacity="0" /></linearGradient></defs>
                    <polygon points="0,48 0,38 8,34 16,30 24,32 32,26 40,22 48,18 56,15 64,12 72,16 80,8 88,5 96,3 100,2 100,48" fill="url(#bt2)" />
                    <polyline points="0,38 8,34 16,30 24,32 32,26 40,22 48,18 56,15 64,12 72,16 80,8 88,5 96,3 100,2" fill="none" stroke="#16C784" strokeWidth="1.5" />
                  </svg>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5, fontSize: 9 }}>
                    {[['CAGR', '+32.4%', '#16C784'], ['SHARPE', '2.18', '#F7FAFF'], ['MAX DD', '−9.1%', '#E45867']].map(([l, v, c]) => (
                      <div key={String(l)} style={{ background: '#101A2D', borderRadius: 5, padding: '4px 6px' }}>
                        <div style={{ fontSize: 7, color: '#55657A' }}>{l}</div>
                        <div style={{ fontWeight: 800, color: String(c) }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ),
            },
            {
              step: '03', accent: '#A78BFA', title: 'Agents trade every 5 minutes',
              body: 'Once allocated, the agent fires on a 5-minute cadence. It analyses live price data, generates a signal, sizes the position within your risk limits, and places a real market order on Kraken.',
              demo: (
                <div style={{ background: '#06111F', border: '1px solid #1E2A3D', borderRadius: 8, padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 9 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ color: '#A78BFA', fontWeight: 700, letterSpacing: '0.08em' }}>● LIVE LEDGER</span>
                    <span style={{ color: '#55657A' }}>5m cadence</span>
                  </div>
                  {[
                    ['12:34:02', 'BUY', 'BTC-USD', '+12.4%'],
                    ['12:29:01', 'SELL', 'ETH-USD', '−5.1%'],
                    ['12:24:00', 'BUY', 'SOL-USD', '+8.7%'],
                    ['12:19:00', 'REBAL', 'BNB-USD', '+1.2%'],
                  ].map(([t, side, sym, pct]) => (
                    <div key={String(t)} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ color: '#55657A' }}>{t}</span>
                      <span style={{ color: side === 'BUY' ? '#16C784' : side === 'SELL' ? '#E45867' : '#F5B942', fontWeight: 700, minWidth: 36 }}>{side}</span>
                      <span style={{ color: '#cbd5e1', flex: 1, textAlign: 'left', paddingLeft: 6 }}>{sym}</span>
                      <span style={{ color: '#16C784' }}>{pct}</span>
                    </div>
                  ))}
                </div>
              ),
            },
            {
              step: '04', accent: '#F5B942', title: 'Monitor P&L in real time',
              body: 'Your dashboard shows live portfolio value, per-agent returns, trade history, and a full equity curve. Auto-deallocate triggers if a drawdown threshold is breached — you stay in control.',
              demo: (
                <div style={{ background: '#06111F', border: '1px solid #1E2A3D', borderRadius: 8, padding: '12px', fontFamily: 'var(--font-mono)' }}>
                  <div style={{ fontSize: 9, color: '#55657A', marginBottom: 8 }}>PORTFOLIO OVERVIEW</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                    {[['TOTAL VALUE', '$12,480', '#F7FAFF'], ['P&L TODAY', '+$312', '#16C784'], ['AGENTS', '3 active', '#6BA3FF'], ['DRAWDOWN', '−2.1%', '#F5B942']].map(([l, v, c]) => (
                      <div key={String(l)} style={{ background: '#101A2D', borderRadius: 6, padding: '5px 8px' }}>
                        <div style={{ fontSize: 7, color: '#55657A' }}>{l}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: String(c) }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <svg width="100%" height="32" viewBox="0 0 100 32" preserveAspectRatio="none">
                    <defs><linearGradient id="pf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F5B942" stopOpacity="0.4"/><stop offset="100%" stopColor="#F5B942" stopOpacity="0"/></linearGradient></defs>
                    <polygon points="0,32 0,22 15,20 30,18 45,15 60,17 75,12 85,10 100,8 100,32" fill="url(#pf)" />
                    <polyline points="0,22 15,20 30,18 45,15 60,17 75,12 85,10 100,8" fill="none" stroke="#F5B942" strokeWidth="1.5" />
                  </svg>
                </div>
              ),
            },
          ].map(s => (
            <div key={s.step} style={{
              background: 'linear-gradient(180deg, rgba(11,23,40,0.92), rgba(6,17,31,0.92))',
              border: '1px solid rgba(30,42,61,0.7)',
              borderRadius: 16, padding: '1.5rem 1.4rem 1.6rem',
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: 3,
                background: `linear-gradient(90deg, transparent, ${s.accent}, transparent)`,
              }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 800,
                  padding: '4px 10px', borderRadius: 6,
                  background: s.accent + '18', border: `1px solid ${s.accent}40`,
                  color: s.accent, letterSpacing: '0.08em',
                }}>{s.step}</span>
                <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${s.accent}40, transparent)` }} />
              </div>
              <h3 style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '1.05rem', letterSpacing: '-0.02em', margin: '0 0 .55rem', color: '#F7FAFF', lineHeight: 1.25 }}>
                {s.title}
              </h3>
              <p style={{ fontSize: '.83rem', color: '#94a3b8', lineHeight: 1.65, marginBottom: '1rem' }}>{s.body}</p>
              {s.demo}
            </div>
          ))}
        </div>
      </section>

      {/* ═════════════ FEATURES GRID ═════════════ */}
      <section ref={features.ref} style={{ ...features.style, padding: '4rem 1.5rem 5rem', maxWidth: 1280, margin: '0 auto', position: 'relative', zIndex: 2 }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={{ display: 'inline-flex', padding: '4px 12px', borderRadius: 100, background: 'rgba(79,140,255,0.07)', border: '1px solid rgba(79,140,255,0.22)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', color: '#6BA3FF', marginBottom: '1.25rem' }}>
            PLATFORM FEATURES
          </div>
          <h2 style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', letterSpacing: '-0.045em', margin: 0, color: '#F7FAFF' }}>
            Built for serious traders.
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }} className="feat-grid">
          {[
            {
              icon: '🔐', accent: '#16C784',
              title: 'Non-custodial',
              body: 'Funds stay in your Kraken account. ASE never holds custody. Revoke access instantly from Kraken\'s API settings.',
            },
            {
              icon: '📊', accent: '#4F8CFF',
              title: 'Transparent P&L',
              body: 'Every trade is logged on-chain. Returns are real fills after fees — not paper performance or cherry-picked windows.',
            },
            {
              icon: '⚡', accent: '#F5B942',
              title: 'Always-on execution',
              body: '288+ ticks per day. Agents scan price data and execute in seconds, 24/7, without requiring you to be online.',
            },
            {
              icon: '🛡️', accent: '#A78BFA',
              title: 'Auto-deallocate',
              body: 'Set a max drawdown threshold. If a strategy hits it, ASE automatically closes the position and returns funds to your wallet.',
            },
            {
              icon: '📈', accent: '#22D3EE',
              title: 'Portfolio history',
              body: 'Hourly equity snapshots across all active strategies. See which agents are performing and compare them over 7d, 30d, or 90d.',
            },
            {
              icon: '🤖', accent: '#F472B6',
              title: 'AI-powered Quant Lab',
              body: 'Describe a strategy in English. The AI co-pilot generates the code, runs a 2-year backtest in under a second, and grades it.',
            },
          ].map(f => (
            <div key={f.title} style={{
              background: 'linear-gradient(180deg, rgba(11,23,40,0.9), rgba(6,17,31,0.9))',
              border: '1px solid rgba(30,42,61,0.65)',
              borderRadius: 14, padding: '1.4rem',
              position: 'relative', overflow: 'hidden',
              transition: 'border-color .2s',
            }}>
              <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 2, background: `linear-gradient(90deg, transparent, ${f.accent}80, transparent)` }} />
              <div style={{ fontSize: 24, marginBottom: 12 }}>{f.icon}</div>
              <h3 style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '1rem', margin: '0 0 .5rem', color: '#F7FAFF' }}>{f.title}</h3>
              <p style={{ fontSize: '0.83rem', color: '#94a3b8', lineHeight: 1.65, margin: 0 }}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═════════════ FOR INVESTORS / FOR BUILDERS ═════════════ */}
      <section style={{ padding: '4rem 1.5rem 5rem', maxWidth: 1280, margin: '0 auto', position: 'relative', zIndex: 2 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }} className="split-grid">
          {[
            {
              tag: 'FOR INVESTORS', accent: '#16C784',
              title: 'Allocate to verified AI strategies.',
              body: 'Browse live track records, allocate in one click, stay in full custody. Funds never leave your Kraken account.',
              points: ['Audited live P&L', 'Revoke API access anytime', 'No lock-ins, no minimums', 'Real-time NAV dashboard'],
            },
            {
              tag: 'FOR BUILDERS', accent: '#4F8CFF',
              title: 'Build once. Earn from every subscriber.',
              body: 'Compose agents in TypeScript or natural language. Backtest in 700ms. Publish to the marketplace and let the platform handle execution.',
              points: ['9-layer institutional backtester', 'AI co-pilot for signal design', 'Auto-iterate to higher Sharpe', 'Built-in distribution layer'],
            },
          ].map(card => (
            <div key={card.tag} style={{
              background: 'linear-gradient(160deg, rgba(11,23,40,0.95), rgba(6,17,31,0.95))',
              border: '1px solid rgba(30,42,61,0.8)', borderRadius: 18,
              padding: '2.4rem 2.2rem', position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: '70%', height: '100%', background: `radial-gradient(ellipse at 100% 30%, ${card.accent}15, transparent 65%)`, pointerEvents: 'none' }} />
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'inline-flex', padding: '4px 12px', borderRadius: 100, background: card.accent + '14', border: `1px solid ${card.accent}38`, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', color: card.accent, marginBottom: '1.4rem' }}>
                  {card.tag}
                </div>
                <h3 style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 'clamp(1.4rem, 2.5vw, 1.95rem)', letterSpacing: '-0.045em', color: '#F7FAFF', margin: '0 0 .85rem', lineHeight: 1.1 }}>
                  {card.title}
                </h3>
                <p style={{ fontSize: '0.9rem', color: '#94a3b8', lineHeight: 1.65, marginBottom: '1.6rem' }}>{card.body}</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem .9rem', marginBottom: '1.8rem' }}>
                  {card.points.map(p => (
                    <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#cbd5e1' }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: card.accent, flexShrink: 0 }} />
                      {p}
                    </div>
                  ))}
                </div>
                <button onClick={scrollToWaitlist} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '0.7rem 1.4rem', borderRadius: 10,
                  background: card.accent + '18', border: `1px solid ${card.accent}45`,
                  color: card.accent, fontFamily: 'var(--font-mono)', fontSize: '0.82rem',
                  fontWeight: 700, letterSpacing: '0.04em', cursor: 'pointer',
                  transition: 'all .15s',
                }}>
                  Request early access
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═════════════ WAITLIST CTA ═════════════ */}
      <section id="waitlist" ref={ctaSection.ref} style={{ ...ctaSection.style, padding: '5rem 1.5rem 7rem', position: 'relative', zIndex: 2 }}>
        <div style={{
          maxWidth: 640, margin: '0 auto', textAlign: 'center',
          background: 'linear-gradient(160deg, rgba(11,23,40,0.96), rgba(6,17,31,0.96))',
          border: '1px solid rgba(79,140,255,0.22)',
          borderRadius: 24, padding: 'clamp(2rem, 5vw, 3.5rem)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '80%', height: 1, background: 'linear-gradient(90deg, transparent, rgba(79,140,255,0.6), transparent)' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 70% 40% at 50% 0%, rgba(79,140,255,0.12), transparent)', pointerEvents: 'none' }} />

          <div style={{ position: 'relative' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 100, background: 'rgba(22,199,132,0.08)', border: '1px solid rgba(22,199,132,0.25)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', color: '#16C784', marginBottom: '1.5rem' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#16C784', animation: 'breathe 2s ease-in-out infinite' }} />
              EARLY ACCESS · LIMITED SPOTS
            </div>

            <h2 style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', letterSpacing: '-0.05em', margin: '0 0 1rem', color: '#F7FAFF', lineHeight: 1.05 }}>
              Be first when we open the gates.
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: 1.7, marginBottom: '2rem', maxWidth: 440, margin: '0 auto 2rem' }}>
              Join the waitlist for early access to the exchange, the Quant Lab, and the agent marketplace. No spam — just an invite when we&apos;re ready.
            </p>

            <div style={{ marginBottom: '1.5rem' }}>
              <WaitlistForm type="investor" />
            </div>

            <div style={{ borderTop: '1px solid rgba(30,42,61,0.6)', paddingTop: '1.5rem', marginTop: '0.5rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#55657A', marginBottom: '1rem', letterSpacing: '0.08em' }}>BUILDING A STRATEGY?</div>
              <WaitlistForm type="developer" />
            </div>
          </div>
        </div>
      </section>

      {/* ═════════════ FOOTER ═════════════ */}
      <footer style={{ borderTop: '1px solid rgba(30,42,61,0.55)', background: 'rgba(3,13,25,0.92)', position: 'relative', zIndex: 2 }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '3rem 1.5rem 2rem', display: 'grid', gridTemplateColumns: '1.8fr 1fr 1fr', gap: '2.5rem' }} className="footer-grid">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.85rem' }}>
              <img src="/transparent_logo.png" alt="ASE" style={{ height: 28, width: 'auto', objectFit: 'contain' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.78rem', color: '#F7FAFF', letterSpacing: '0.08em' }}>ASE</span>
            </div>
            <p style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.7, maxWidth: 260, marginBottom: '1rem' }}>
              The exchange for autonomous AI crypto strategies. Built for quants, open to everyone. Currently in private beta.
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              {['X', 'Discord', 'GitHub'].map(s => (
                <a key={s} href="#" style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(30,42,61,0.7)', fontFamily: 'var(--font-mono)', fontSize: 10, color: '#55657A', textDecoration: 'none', transition: 'all .12s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#F7FAFF'; e.currentTarget.style.borderColor = 'rgba(79,140,255,0.3)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#55657A'; e.currentTarget.style.borderColor = 'rgba(30,42,61,0.7)' }}>{s}</a>
              ))}
            </div>
          </div>
          {[
            { title: 'PLATFORM', links: [['Join Waitlist', '#waitlist'], ['How it works', '#waitlist'], ['Sign In', '/login']] },
            { title: 'LEGAL', links: [['Terms', '/legal/terms'], ['Privacy', '/legal/privacy'], ['Securities', '/legal/securities']] },
          ].map(col => (
            <div key={col.title}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: '#55657A', letterSpacing: '0.14em', marginBottom: '0.9rem' }}>{col.title}</div>
              {col.links.map(([label, href]) => (
                <Link key={String(label)} href={String(href)} style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', textDecoration: 'none', marginBottom: '0.5rem', transition: 'color .12s' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#F7FAFF'}
                  onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}>{label}</Link>
              ))}
            </div>
          ))}
        </div>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '1.25rem 1.5rem', borderTop: '1px solid rgba(30,42,61,0.5)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#55657A', lineHeight: 1.7, marginBottom: '0.85rem' }}>
            <strong style={{ color: '#94a3b8' }}>DISCLOSURE:</strong> ASE is not a registered investment advisor. Past performance is not indicative of future results. All trading involves risk. Not financial advice.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#55657A' }}>© 2026 ASE · Autonomous Strategy Exchange</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(228,88,103,0.7)', fontWeight: 700, letterSpacing: '0.08em' }}>⚠ NOT FINANCIAL ADVICE</div>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes drift { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @keyframes breathe { 0%,100% { opacity:.55; box-shadow: 0 0 6px currentColor } 50% { opacity: 1; box-shadow: 0 0 14px currentColor } }
        @keyframes feedSlideIn { from { opacity: 0; transform: translateX(20px) } to { opacity: 1; transform: translateX(0) } }
        @keyframes bobble { 0%,100% { transform: translate(-50%, 0) } 50% { transform: translate(-50%, 6px) } }
        @media (max-width: 900px) {
          .split-grid { grid-template-columns: 1fr !important }
          .how-grid { grid-template-columns: 1fr !important }
          .feat-grid { grid-template-columns: repeat(2, 1fr) !important }
          .footer-grid { grid-template-columns: 1fr 1fr !important }
          .live-feed { display: none !important }
        }
        @media (max-width: 540px) {
          .feat-grid { grid-template-columns: 1fr !important }
          .footer-grid { grid-template-columns: 1fr !important }
        }
      `}</style>
    </div>
  )
}
