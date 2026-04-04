'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { fmtUSD, fmtPct } from '@/lib/utils'
import { calculateTradingCapitalCents } from '@/lib/market'

// Render an SVG sparkline from an array of nav_cents values
function Spark({ data, pos }: { data: number[]; pos: boolean }) {
  if (data.length < 2) return null
  const w = 100, h = 36, pad = 3
  const min = Math.min(...data), max = Math.max(...data)
  const span = max - min || 1
  const step = (w - pad * 2) / (data.length - 1)
  const pts = data.map((v, i) => {
    const x = pad + i * step
    const y = pad + (1 - (v - min) / span) * (h - pad * 2)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const fillPts = `${pts} L${(pad + (data.length - 1) * step).toFixed(1)},${h} L${pad},${h} Z`
  const col = pos ? '#32D3A2' : '#FF6B8A'
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} style={{ display: 'block' }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`gr${pos ? 'g' : 'r'}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.18" />
          <stop offset="100%" stopColor={col} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPts} fill={`url(#gr${pos ? 'g' : 'r'})`} />
      <path d={pts} fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function signalColor(signal: string | null) {
  if (!signal) return '#555'
  const s = signal.toUpperCase()
  if (s.startsWith('BUY')) return '#32D3A2'
  if (s.startsWith('SELL') || s.startsWith('STOP')) return '#FF6B8A'
  if (s.startsWith('HOLD') || s.startsWith('PARTIAL')) return '#7B9FFF'
  if (s.startsWith('SCAN') || s.startsWith('WATCH')) return '#4BD1FF'
  return '#8892A4'
}

function signalBadge(signal: string | null) {
  const s = (signal || '').toUpperCase()
  if (s.startsWith('BUY')) return { label: '● BUYING', color: '#32D3A2', bg: 'rgba(14,173,110,.12)' }
  if (s.startsWith('SELL') || s.startsWith('STOP')) return { label: '● SELLING', color: '#FF6B8A', bg: 'rgba(232,64,64,.12)' }
  if (s.startsWith('HOLD')) return { label: '◆ HOLDING', color: '#7B9FFF', bg: 'rgba(123,159,255,.12)' }
  if (s.startsWith('SCAN') || s.startsWith('WATCH')) return { label: '◌ SCANNING', color: '#4BD1FF', bg: 'rgba(232,172,32,.12)' }
  return { label: '● ACTIVE', color: '#8892A4', bg: 'rgba(136,146,164,.1)' }
}

interface AgentRow {
  id: string
  slug: string
  name: string
  ticker: string
  description: string | null
  strategy_type: string
  status: string
  total_aum_cents: number
  share_price_cents: number
  signal_summary: string | null
  last_run_at: string | null
  agent_stats: {
    nav_cents: number
    total_return_pct: number
    sharpe_ratio: number
    max_drawdown_pct: number
    win_rate_pct: number
    total_trades: number
    snapshot_at: string
  }[]
}

const strategyInfo: Record<string, { label: string; color: string }> = {
  momentum: { label: 'Momentum', color: '#F7931A' },
  mean_reversion: { label: 'Mean Reversion', color: '#32D3A2' },
  trend_following: { label: 'Trend Following', color: '#7B9FFF' },
  crypto_momentum: { label: 'Crypto Momentum', color: '#F7931A' },
  crypto_mean_reversion: { label: 'Mean Reversion', color: '#32D3A2' },
}

export default function ExchangePage() {
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [holdings, setHoldings] = useState<Map<string, boolean>>(new Map())
  const [flashMap, setFlashMap] = useState<Map<string, 'up' | 'down'>>(new Map())
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const prevPricesRef = useRef<Map<string, number>>(new Map())

  const fetchData = useCallback(async (isRefresh = false) => {
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { window.location.href = '/login'; return }

    const [{ data: agentsData }, { data: holdingsData }] = await Promise.all([
      sb.from('agents')
        .select('id,slug,name,ticker,description,strategy_type,status,total_aum_cents,share_price_cents,signal_summary,last_run_at,agent_stats(nav_cents,total_return_pct,sharpe_ratio,max_drawdown_pct,win_rate_pct,total_trades,snapshot_at)')
        .eq('status', 'active')
        .order('created_at'),
      sb.from('holdings').select('agent_id').eq('user_id', user.id).eq('status', 'active'),
    ])

    if (agentsData && isRefresh) {
      // Detect price changes for flash animation
      const newFlash = new Map<string, 'up' | 'down'>()
      agentsData.forEach(a => {
        const prev = prevPricesRef.current.get(a.id)
        if (prev && prev !== a.share_price_cents) {
          newFlash.set(a.id, a.share_price_cents > prev ? 'up' : 'down')
        }
      })
      if (newFlash.size > 0) {
        setFlashMap(newFlash)
        setTimeout(() => setFlashMap(new Map()), 1200)
      }
      prevPricesRef.current = new Map(agentsData.map(a => [a.id, a.share_price_cents]))
    }

    setAgents(((agentsData ?? []) as AgentRow[]).map(agent => ({
      ...agent,
      total_aum_cents: calculateTradingCapitalCents(agent.total_aum_cents ?? 0),
    })))
    setHoldings(new Map((holdingsData ?? []).map(h => [h.agent_id, true])))
    setLoading(false)
  }, [])

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void fetchData()
    }, 0)
    intervalRef.current = setInterval(() => {
      fetchData(true)
    }, 15_000) // refresh every 15s
    return () => {
      clearTimeout(initial)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchData])

  if (loading) {
    return (
      <div style={{ padding: '2.5rem', display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--muted)' }}>
        <div style={{ width: 18, height: 18, border: '2px solid var(--gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
        Loading exchange…
      </div>
    )
  }

  return (
    <div className="page-slide-in" style={{ padding: '2rem 2.5rem', maxWidth: 1440, margin: '0 auto' }}>
      {/* ── Header with live indicator ── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: '.35rem' }}>MARKETPLACE</div>
          <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '2rem', fontWeight: 800, marginBottom: '.4rem' }}>Exchange</h1>
          <p style={{ color: 'var(--muted)', fontSize: '.9rem' }}>Browse and invest in verified AI trading agents · auto-refreshes every 15s</p>
        </div>
        <div className="live-breathe" style={{ display: 'flex', alignItems: 'center', gap: '.6rem', fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: 'var(--green)', fontWeight: 700, backgroundColor: 'rgba(14,173,110,0.1)', padding: '.6rem 1rem', borderRadius: '10px', border: '1px solid rgba(14,173,110,0.2)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', animation: 'pulse 2s ease-in-out infinite', display: 'inline-block' }} />
          LIVE · {agents.length} agents
        </div>
      </div>

      {/* ── Top movers / tape ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '.8rem', marginBottom: '1.25rem' }} className="exchange-top-strip">
        {[...agents]
          .map(agent => {
            const latest = [...(agent.agent_stats ?? [])].sort((a, b) => new Date(b.snapshot_at).getTime() - new Date(a.snapshot_at).getTime())[0]
            return { agent, ret: latest?.total_return_pct ?? 0 }
          })
          .sort((a, b) => b.ret - a.ret)
          .slice(0, 3)
          .map(({ agent, ret }) => (
            <Link key={agent.id} href={`/dashboard/exchange/${agent.slug}`} style={{
              borderRadius: 12,
              border: '1px solid rgba(148,163,184,.22)',
              background: 'rgba(9,14,28,.75)',
              padding: '.75rem .85rem',
              display: 'grid',
              gap: '.2rem',
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: '#9FB0CD' }}>TOP MOMENTUM</span>
              <span style={{ fontFamily: 'var(--font-head)', fontSize: '.95rem', fontWeight: 800 }}>{agent.name}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', color: ret >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtPct(ret)}</span>
            </Link>
          ))}
      </div>

      {/* ── Summary strip with glass morphism ── */}
      {agents.length > 0 && (
        <div className="glass-card" style={{ padding: '0', overflow: 'hidden', marginBottom: '2.5rem', backdropFilter: 'blur(16px)' }}>
          <div style={{ display: 'flex', gap: '1px', background: 'rgba(255,255,255,.03)' }}>
            {agents.map(agent => {
              const stats = [...(agent.agent_stats ?? [])].sort((a, b) => new Date(b.snapshot_at).getTime() - new Date(a.snapshot_at).getTime())
              const latest = stats[0]
              const nav = agent.share_price_cents || latest?.nav_cents || 10000
              const ret = latest?.total_return_pct ?? 0
              const flash = flashMap.get(agent.id)
              const badge = signalBadge(agent.signal_summary)
              return (
                <Link key={agent.id} href={`/dashboard/exchange/${agent.slug}`} className="transition-premium" style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.01)',
                  padding: '.9rem 1.1rem',
                  textDecoration: 'none',
                  minWidth: 120,
                  borderRight: '1px solid rgba(255,255,255,.03)',
                  cursor: 'pointer'
                }} onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(232,172,32,0.05)'
                }} onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.01)'
                }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: '#888', letterSpacing: '.08em', marginBottom: '.25rem', textTransform: 'uppercase', fontWeight: 600 }}>$ {agent.ticker}</div>
                  <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.15rem', fontWeight: 800, color: flash === 'up' ? '#32D3A2' : flash === 'down' ? '#FF6B8A' : '#fff', transition: 'color .4s', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtUSD(nav)}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: ret >= 0 ? 'var(--green)' : 'var(--red)', marginTop: '.15rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtPct(ret)}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: badge.color, marginTop: '.2rem', fontWeight: 600 }}>{badge.label}</div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Agent cards grid ── */}
      {agents.length === 0 ? (
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem', opacity: 0.5 }}>⬡</div>
          <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.2rem', fontWeight: 800, marginBottom: '.5rem' }}>No agents available</div>
          <p style={{ color: 'var(--muted)', fontSize: '.9rem' }}>Trading agents are being set up. Check back soon.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '1.75rem' }}>
          {agents.map(agent => {
            const stats = [...(agent.agent_stats ?? [])].sort((a, b) => new Date(b.snapshot_at).getTime() - new Date(a.snapshot_at).getTime())
            const latest = stats[0] ?? null
            const prev   = stats[1] ?? null
            const nav    = agent.share_price_cents || latest?.nav_cents || 10000
            const ret30d = latest?.total_return_pct ?? 0
            const ret24h = (latest && prev && prev.nav_cents > 0) ? ((latest.nav_cents - prev.nav_cents) / prev.nav_cents) * 100 : null
            const sharpe = latest?.sharpe_ratio ?? 0
            const maxDD  = latest?.max_drawdown_pct ?? 0
            const winRate = latest?.win_rate_pct ?? 0
            const totalTrades = latest?.total_trades ?? 0
            const info   = strategyInfo[agent.strategy_type] || { label: agent.strategy_type.replace(/_/g,' '), color: 'var(--white)' }
            const sparkData = stats.slice().reverse().map(s => s.nav_cents)
            const pos    = ret30d >= 0
            const flash  = flashMap.get(agent.id)
            const badge  = signalBadge(agent.signal_summary)
            const sigTrunc = (agent.signal_summary || 'SCANNING…').slice(0, 80)

            return (
              <div key={agent.id} className="glass-card" style={{
                padding: '0',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                borderColor: flash ? (flash === 'up' ? 'rgba(14,173,110,.25)' : 'rgba(232,64,64,.25)') : 'rgba(255,255,255,0.06)',
                boxShadow: flash ? `0 0 30px ${flash === 'up' ? 'rgba(14,173,110,.1)' : 'rgba(232,64,64,.1)'}` : 'none',
                transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
              }} onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement
                el.style.transform = 'translateY(-4px)'
                el.style.boxShadow = '0 20px 60px rgba(0,0,0,0.4), 0 0 40px rgba(232,172,32,0.05)'
              }} onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement
                el.style.transform = ''
                el.style.boxShadow = flash ? `0 0 30px ${flash === 'up' ? 'rgba(14,173,110,.1)' : 'rgba(232,64,64,.1)'}` : 'none'
              }}>

                {/* Card header */}
                <div style={{ padding: '1.5rem 1.75rem 1rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap', marginBottom: '.35rem' }}>
                      <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1.15rem', fontWeight: 800, margin: 0, color: '#fff' }}>{agent.name}</h3>
                      {holdings.get(agent.id) && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--green)', background: 'rgba(14,173,110,.15)', border: '1px solid rgba(14,173,110,.3)', padding: '.2rem .55rem', borderRadius: 6, fontWeight: 700 }}>HELD</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: '#999', letterSpacing: '.04em' }}>$ {agent.ticker} · VERIFIED</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: info.color, background: `${info.color}20`, border: `1px solid ${info.color}40`, padding: '.15rem .6rem', borderRadius: 7, fontWeight: 600 }}>
                        {info.label.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  {/* Live status badge */}
                  <div className="live-breathe" style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', background: badge.bg, padding: '.35rem .7rem', borderRadius: 9, flexShrink: 0, border: `1px solid ${badge.color}35`, letterSpacing: '.05em', fontWeight: 700, color: badge.color }} >
                    {badge.label}
                  </div>
                </div>

                {/* Price + sparkline */}
                <div style={{ padding: '0 1.75rem .9rem', display: 'flex', alignItems: 'flex-start', gap: '1.5rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-head)', fontSize: '2.2rem', fontWeight: 800, letterSpacing: '-.02em', color: flash === 'up' ? '#32D3A2' : flash === 'down' ? '#FF6B8A' : '#fff', transition: 'color .6s', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtUSD(nav)}
                    </div>
                    <div style={{ display: 'flex', gap: '1.5rem', margin: '.4rem 0 0' }}>
                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: '#888', marginBottom: '.12rem', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>24H</div>
                        {ret24h != null
                          ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', fontWeight: 700, color: ret24h >= 0 ? 'var(--green)' : 'var(--red)', fontVariantNumeric: 'tabular-nums' }}>{fmtPct(ret24h)}</div>
                          : <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.75rem', color: '#666' }}>—</div>}
                      </div>
                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: '#888', marginBottom: '.12rem', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>ALL TIME</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', fontWeight: 700, color: pos ? 'var(--green)' : 'var(--red)', fontVariantNumeric: 'tabular-nums' }}>{fmtPct(ret30d)}</div>
                      </div>
                    </div>
                  </div>
                  {/* Sparkline with gradient */}
                  {sparkData.length > 1 && (
                    <div style={{ width: 110, flexShrink: 0, marginTop: '-.1rem' }} className="chart-glow">
                      <Spark data={sparkData} pos={pos} />
                    </div>
                  )}
                </div>

                {/* Signal summary */}
                <div style={{ margin: '0 1.75rem .9rem', padding: '.65rem .9rem', background: `${signalColor(agent.signal_summary)}12`, border: `1px solid ${signalColor(agent.signal_summary)}30`, borderRadius: 10 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: signalColor(agent.signal_summary), letterSpacing: '.02em', lineHeight: 1.6, fontWeight: 500 }}>
                    {sigTrunc}{(agent.signal_summary || '').length > 80 ? '…' : ''}
                  </div>
                </div>

                {/* KPI grid with gradient background */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1px', background: 'linear-gradient(135deg, rgba(232,172,32,.08), transparent 40%, transparent 60%, rgba(14,173,110,.08))', margin: '0 1.75rem', borderRadius: 12, overflow: 'hidden' }}>
                  {[
                    { k: 'SHARPE', v: sharpe.toFixed(2), c: sharpe >= 1 ? 'var(--green)' : sharpe >= 0 ? 'var(--gold)' : 'var(--red)' },
                    { k: 'MAX DD', v: maxDD > 0 ? `-${maxDD.toFixed(1)}%` : '—', c: maxDD > 15 ? 'var(--red)' : 'var(--muted)' },
                    { k: 'WIN %', v: winRate > 0 ? `${winRate.toFixed(0)}%` : '—', c: winRate >= 55 ? 'var(--green)' : 'var(--muted)' },
                    { k: 'TRADES', v: String(totalTrades), c: 'var(--muted)' },
                  ].map(({ k, v, c }) => (
                    <div key={k} style={{ background: 'rgba(255,255,255,0.02)', padding: '.6rem .8rem', textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: '#888', letterSpacing: '.1em', marginBottom: '.18rem', textTransform: 'uppercase', fontWeight: 600 }}>{k}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.8rem', fontWeight: 700, color: c, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                    </div>
                  ))}
                </div>

                {/* AUM bar */}
                <div style={{ padding: '.9rem 1.75rem 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.35rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: '#888', letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 600 }}>AUM</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: '#fff', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(agent.total_aum_cents || 0, 0)}</span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,.05)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'linear-gradient(90deg, var(--gold), var(--gold2))', borderRadius: 3, width: `${Math.min(100, ((agent.total_aum_cents || 0) / 5_000_000) * 100)}%`, transition: 'width .6s ease', boxShadow: '0 0 12px rgba(232,172,32,0.3)' }} />
                  </div>
                </div>

                {/* CTA */}
                <div style={{ padding: '1.25rem 1.75rem 1.5rem', marginTop: 'auto' }}>
                  <Link href={`/dashboard/exchange/${agent.slug}`} className="haptic-press" style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem',
                    padding: '.8rem', background: 'linear-gradient(135deg, var(--gold), var(--gold2))',
                    color: '#000', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '.9rem',
                    borderRadius: 12, textDecoration: 'none', transition: 'all .3s', boxShadow: '0 4px 12px rgba(232,172,32,.2)',
                  }} onMouseEnter={e => {
                    const el = e.currentTarget as HTMLElement
                    el.style.transform = 'translateY(-2px)'
                    el.style.boxShadow = '0 8px 24px rgba(232,172,32,.4)'
                  }} onMouseLeave={e => {
                    const el = e.currentTarget as HTMLElement
                    el.style.transform = ''
                    el.style.boxShadow = '0 4px 12px rgba(232,172,32,.2)'
                  }}>
                    {holdings.get(agent.id) ? 'Manage Position →' : 'Trade →'}
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes dotBlink { 0%,100%{opacity:1}50%{opacity:.3} }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @media(max-width:1000px){
          [style*="grid-template-columns: repeat(auto-fill, minmax(420px"]{
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media(max-width:640px){
          [style*="padding: 2rem 2.5rem"]{padding:1.25rem!important}
          .exchange-top-strip{grid-template-columns:1fr!important}
          [style*="grid-template-columns: repeat(auto-fill, minmax(420px"]{
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
