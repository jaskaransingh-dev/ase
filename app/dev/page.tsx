/**
 * /dev — Agent Control Room
 *
 * Dev-only page. Not linked from the main nav.
 * Shows every agent's live state: signal, positions, trades,
 * portfolio allocation, NAV history.
 *
 * Uses the admin client (bypasses RLS) so all data is visible.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtUSD(cents: number | null | undefined, decimals = 2): string {
  if (cents == null) return '—'
  const abs = Math.abs(cents / 100)
  const sign = cents < 0 ? '-' : ''
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
}

function fmtPct(v: number | null | undefined, decimals = 2): string {
  if (v == null) return '—'
  const sign = v >= 0 ? '+' : ''
  return `${sign}${v.toFixed(decimals)}%`
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

function signalColor(signal: string | null): string {
  if (!signal) return '#555'
  const s = signal.toUpperCase()
  if (s.startsWith('BUY') || s.startsWith('BULLISH')) return '#0EAD6E'
  if (s.startsWith('SELL') || s.startsWith('BEARISH') || s.startsWith('EXIT') || s.startsWith('STOP')) return '#E84040'
  if (s.startsWith('HOLD') || s.startsWith('PARTIAL')) return '#7B9FFF'
  if (s.startsWith('SKIP') || s.startsWith('NO') || s.startsWith('NEUTRAL')) return '#888'
  return '#E8AC20' // SCANNING, WATCH, default
}

function signalLabel(signal: string | null): string {
  if (!signal) return 'SCANNING'
  return signal.length > 90 ? signal.slice(0, 87) + '…' : signal
}

// Compute open positions from raw agent_trades (FIFO net qty per symbol)
type RawTrade = {
  id: string
  agent_id: string
  symbol: string
  side: string
  qty: number
  fill_price: number
  filled_at: string
  pnl_cents: number | null
}

type Position = {
  symbol: string
  qty: number
  avg_entry: number
  cost_cents: number
}

function computePositions(trades: RawTrade[]): Position[] {
  const map: Record<string, { buy_qty: number; buy_cost: number; sell_qty: number }> = {}
  for (const t of trades) {
    const sym = (t.symbol || '').toUpperCase()
    if (!sym) continue
    if (!map[sym]) map[sym] = { buy_qty: 0, buy_cost: 0, sell_qty: 0 }
    const qty = Math.max(0, Number(t.qty) || 0)
    const price = Math.max(0, Number(t.fill_price) || 0)
    if (t.side === 'buy') {
      map[sym].buy_qty += qty
      map[sym].buy_cost += qty * price
    } else if (t.side === 'sell') {
      map[sym].sell_qty += qty
    }
  }
  return Object.entries(map)
    .map(([symbol, v]) => {
      const netQty = v.buy_qty - v.sell_qty
      return {
        symbol,
        qty: Math.max(0, netQty),
        avg_entry: v.buy_qty > 0 ? v.buy_cost / v.buy_qty : 0,
        cost_cents: Math.round(v.buy_qty > 0 ? (v.buy_cost / v.buy_qty) * netQty * 100 : 0),
      }
    })
    .filter(p => p.qty > 0.000001)
}

// ── page ──────────────────────────────────────────────────────────────────────

export default async function DevPage() {
  const admin = createAdminClient()

  const [{ data: agents }, { data: allTrades }, { data: recentStats }, { data: latestTicks }] = await Promise.all([
    admin
      .from('agents')
      .select('id, name, slug, ticker, strategy_type, status, share_price_cents, total_aum_cents, signal_summary, portfolio_json, last_run_at')
      .order('slug'),
    admin
      .from('agent_trades')
      .select('id, agent_id, symbol, side, qty, fill_price, filled_at, pnl_cents')
      .order('filled_at', { ascending: false })
      .limit(500),
    admin
      .from('agent_stats')
      .select('agent_id, nav_cents, total_return_pct, sharpe_ratio, daily_return_pct, win_rate_pct, total_trades, snapshot_at')
      .order('snapshot_at', { ascending: false })
      .limit(100),
    // Latest price tick per agent (for live bid/ask)
    admin
      .from('price_ticks')
      .select('agent_id, price_cents, bid_cents, ask_cents, volume, tick_at')
      .order('tick_at', { ascending: false })
      .limit(50),
  ])

  const agentList = agents ?? []
  const trades = (allTrades ?? []) as RawTrade[]

  // Latest stat per agent
  const latestStat: Record<string, typeof recentStats extends (infer T)[] | null ? T : never> = {}
  for (const s of recentStats ?? []) {
    if (!latestStat[s.agent_id]) latestStat[s.agent_id] = s
  }

  // Trades per agent (most recent first, capped at 8 for display)
  const tradesByAgent: Record<string, RawTrade[]> = {}
  for (const t of trades) {
    if (!tradesByAgent[t.agent_id]) tradesByAgent[t.agent_id] = []
    tradesByAgent[t.agent_id].push(t)
  }

  // Positions per agent
  const positionsByAgent: Record<string, Position[]> = {}
  for (const agent of agentList) {
    const agentTrades = (tradesByAgent[agent.id] ?? []).slice().reverse() // oldest first for FIFO
    positionsByAgent[agent.id] = computePositions(agentTrades)
  }

  // Latest price tick per agent (most recent tick wins)
  type PriceTick = { price_cents: number; bid_cents: number | null; ask_cents: number | null; volume: number | null; tick_at: string }
  const tickByAgent: Record<string, PriceTick> = {}
  for (const t of latestTicks ?? []) {
    if (!tickByAgent[t.agent_id]) tickByAgent[t.agent_id] = t
  }

  const now = new Date().toISOString()

  return (
    <div style={{
      minHeight: '100vh',
      background: '#080B10',
      color: '#EEF2FF',
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      padding: '0',
    }}>
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '.75rem 2rem', borderBottom: '1px solid rgba(255,255,255,.08)',
        background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '.6rem', letterSpacing: '.12em', color: '#E8AC20', background: 'rgba(232,172,32,.12)', border: '1px solid rgba(232,172,32,.3)', padding: '.2rem .6rem', borderRadius: 6 }}>DEV ONLY</span>
          <span style={{ fontSize: '.9rem', fontWeight: 700, color: '#fff', letterSpacing: '.02em' }}>Agent Control Room</span>
          <span style={{ fontSize: '.65rem', color: '#555' }}>ASE · {agentList.length} agents</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ fontSize: '.6rem', color: '#555', letterSpacing: '.06em' }}>
            REFRESHED <span style={{ color: '#888' }}>{new Date(now).toLocaleTimeString()}</span>
          </div>
          <div style={{ display: 'flex', gap: '.35rem' }}>
            {[
              { href: '/dashboard', label: 'Dashboard' },
              { href: '/dashboard/exchange', label: 'Exchange' },
              { href: '/api/cron/run-agents', label: '▶ Run Agents' },
              { href: '/api/cron/update-nav', label: '▶ Update NAV' },
            ].map(({ href, label }) => (
              <a key={href} href={href} target="_blank" rel="noreferrer" style={{
                fontSize: '.6rem', color: '#888', textDecoration: 'none',
                padding: '.25rem .6rem', border: '1px solid rgba(255,255,255,.1)',
                borderRadius: 6, transition: 'all .15s',
              }}>{label}</a>
            ))}
          </div>
        </div>
      </div>

      {/* ── Summary strip ───────────────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '1px', background: 'rgba(255,255,255,.06)',
        borderBottom: '1px solid rgba(255,255,255,.06)',
      }}>
        {agentList.map(agent => {
          const stat = latestStat[agent.id]
          const tick = tickByAgent[agent.id]
          const nav = tick?.price_cents ?? stat?.nav_cents ?? agent.share_price_cents ?? 10000
          const bid = tick?.bid_cents ?? null
          const ask = tick?.ask_cents ?? null
          const ret = stat?.total_return_pct ?? 0
          const color = signalColor(agent.signal_summary)
          // Spread in bps for display
          const spreadBps = (bid && ask && nav > 0) ? Math.round(((ask - bid) / nav) * 5000) : null
          return (
            <a key={agent.id} href={`#${agent.slug}`} style={{
              display: 'flex', flexDirection: 'column', gap: '.15rem',
              padding: '.75rem 1rem', background: '#0A0D14', textDecoration: 'none',
              transition: 'background .15s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '.65rem', fontWeight: 700, color: '#aaa', letterSpacing: '.04em' }}>{agent.ticker}</span>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }} />
              </div>
              <div style={{ fontSize: '.9rem', fontWeight: 800, color: '#fff' }}>{fmtUSD(nav)}</div>
              {/* Live bid / ask */}
              {bid && ask ? (
                <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '.58rem', color: '#E84040' }}>B {fmtUSD(bid)}</span>
                  <span style={{ fontSize: '.45rem', color: '#333' }}>|</span>
                  <span style={{ fontSize: '.58rem', color: '#0EAD6E' }}>A {fmtUSD(ask)}</span>
                  {spreadBps != null && <span style={{ fontSize: '.5rem', color: '#555' }}>{spreadBps}bps</span>}
                </div>
              ) : (
                <div style={{ fontSize: '.55rem', color: '#444' }}>no tick yet</div>
              )}
              <div style={{ fontSize: '.6rem', color: ret >= 0 ? '#0EAD6E' : '#E84040' }}>{fmtPct(ret)}</div>
            </a>
          )
        })}
      </div>

      {/* ── Agent cards ─────────────────────────────────────────── */}
      <div style={{ padding: '1.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 1600, margin: '0 auto' }}>
        {agentList.map(agent => {
          const stat = latestStat[agent.id]
          const tick = tickByAgent[agent.id]
          // Live price from most recent price_ticks row; falls back to nav snapshot, then share_price column
          const liveMid  = tick?.price_cents ?? stat?.nav_cents ?? agent.share_price_cents ?? 10_000
          const liveBid  = tick?.bid_cents ?? null
          const liveAsk  = tick?.ask_cents ?? null
          const liveVol  = tick?.volume ?? null
          const tickAge  = tick ? timeAgo(tick.tick_at) : null
          // Spread in bps: (ask - bid) / mid × 10000
          const spreadBps = (liveBid && liveAsk && liveMid > 0)
            ? Math.round(((liveAsk - liveBid) / liveMid) * 10_000)
            : null

          const nav = liveMid
          const ret = stat?.total_return_pct ?? 0
          const daily = stat?.daily_return_pct ?? 0
          const sharpe = stat?.sharpe_ratio ?? 0
          const winRate = stat?.win_rate_pct ?? 0
          const totalTrades = stat?.total_trades ?? 0
          const positions = positionsByAgent[agent.id] ?? []
          const recentTrades = (tradesByAgent[agent.id] ?? []).slice(0, 8)
          const signal = agent.signal_summary || 'SCANNING'
          const sigColor = signalColor(signal)

          let portfolio: {
            cash_cents?: number
            invested_cents?: number
            total_value_cents?: number
            exposure_pct?: number
            positions?: { symbol: string; qty: number; entry: number; current: number; pnl_pct: number }[]
          } = {}
          try { if (agent.portfolio_json) portfolio = JSON.parse(agent.portfolio_json) } catch {}

          const hasPortfolio = !!agent.portfolio_json

          return (
            <div key={agent.id} id={agent.slug} style={{
              background: '#0D1117',
              border: '1px solid rgba(255,255,255,.07)',
              borderRadius: 16,
              overflow: 'hidden',
            }}>
              {/* ── Card header ─── */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr auto',
                padding: '1rem 1.25rem', gap: '1rem',
                background: 'rgba(0,0,0,.3)',
                borderBottom: '1px solid rgba(255,255,255,.06)',
                alignItems: 'start',
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.35rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: '#fff', letterSpacing: '.01em' }}>{agent.name}</span>
                    <span style={{ fontSize: '.58rem', color: '#555', border: '1px solid #222', borderRadius: 5, padding: '.15rem .45rem' }}>${agent.ticker}</span>
                    <span style={{
                      fontSize: '.55rem', letterSpacing: '.08em', fontWeight: 700,
                      color: agent.status === 'active' ? '#0EAD6E' : '#888',
                      border: `1px solid ${agent.status === 'active' ? 'rgba(14,173,110,.3)' : '#333'}`,
                      borderRadius: 5, padding: '.15rem .45rem',
                    }}>{agent.status.toUpperCase()}</span>
                    <span style={{ fontSize: '.55rem', color: '#555', letterSpacing: '.06em' }}>
                      {agent.strategy_type.replace(/_/g, ' ').toUpperCase()}
                    </span>
                  </div>
                  {/* Signal summary */}
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '.5rem',
                    padding: '.35rem .75rem',
                    background: `${sigColor}14`,
                    border: `1px solid ${sigColor}30`,
                    borderRadius: 8, maxWidth: '100%',
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: sigColor, flexShrink: 0, boxShadow: `0 0 8px ${sigColor}` }} />
                    <span style={{ fontSize: '.7rem', color: sigColor, fontWeight: 600, wordBreak: 'break-word' }}>{signalLabel(signal)}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {/* Live mid price */}
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff' }}>{fmtUSD(nav)}</div>
                  <div style={{ fontSize: '.65rem', color: ret >= 0 ? '#0EAD6E' : '#E84040', marginTop: '.1rem' }}>
                    {fmtPct(ret)} all-time · {fmtPct(daily)} today
                  </div>
                  {/* Live order book (bid/ask) */}
                  {liveBid && liveAsk ? (
                    <div style={{ marginTop: '.4rem', display: 'flex', flexDirection: 'column', gap: '.15rem', alignItems: 'flex-end' }}>
                      <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
                        <span style={{ fontSize: '.6rem', color: '#555', letterSpacing: '.06em' }}>BID</span>
                        <span style={{ fontSize: '.72rem', fontWeight: 700, color: '#E84040', fontFamily: 'monospace' }}>{fmtUSD(liveBid)}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
                        <span style={{ fontSize: '.6rem', color: '#555', letterSpacing: '.06em' }}>ASK</span>
                        <span style={{ fontSize: '.72rem', fontWeight: 700, color: '#0EAD6E', fontFamily: 'monospace' }}>{fmtUSD(liveAsk)}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginTop: '.05rem' }}>
                        {spreadBps != null && (
                          <span style={{ fontSize: '.52rem', color: '#444', background: 'rgba(255,255,255,.04)', padding: '.1rem .35rem', borderRadius: 4 }}>
                            spread {spreadBps}bps
                          </span>
                        )}
                        {liveVol != null && liveVol > 0 && (
                          <span style={{ fontSize: '.52rem', color: '#444' }}>vol {liveVol.toFixed(4)}</span>
                        )}
                        {tickAge && <span style={{ fontSize: '.5rem', color: '#333' }}>tick {tickAge}</span>}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '.52rem', color: '#333', marginTop: '.4rem' }}>awaiting first tick…</div>
                  )}
                  <div style={{ fontSize: '.55rem', color: '#444', marginTop: '.35rem' }}>
                    last run: <span style={{ color: '#666' }}>{timeAgo(agent.last_run_at)}</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1px', background: 'rgba(255,255,255,.04)' }}>

                {/* ── KPI strip ─── */}
                <div style={{ background: '#0D1117', padding: '.85rem 1.25rem' }}>
                  <div style={{ fontSize: '.55rem', color: '#555', letterSpacing: '.1em', marginBottom: '.6rem' }}>PERFORMANCE</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem .75rem' }}>
                    {[
                      { k: 'SHARPE', v: sharpe.toFixed(2), c: sharpe >= 1 ? '#0EAD6E' : sharpe >= 0 ? '#E8AC20' : '#E84040' },
                      { k: 'WIN RATE', v: winRate > 0 ? `${winRate.toFixed(0)}%` : '—', c: winRate >= 55 ? '#0EAD6E' : '#E8AC20' },
                      { k: 'TOTAL TRADES', v: String(totalTrades), c: '#aaa' },
                      { k: 'AUM', v: fmtUSD(agent.total_aum_cents, 0), c: '#aaa' },
                    ].map(({ k, v, c }) => (
                      <div key={k}>
                        <div style={{ fontSize: '.52rem', color: '#444', letterSpacing: '.08em' }}>{k}</div>
                        <div style={{ fontSize: '.8rem', fontWeight: 700, color: c, marginTop: '.1rem' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Portfolio allocation ─── */}
                <div style={{ background: '#0D1117', padding: '.85rem 1.25rem' }}>
                  <div style={{ fontSize: '.55rem', color: '#555', letterSpacing: '.1em', marginBottom: '.6rem' }}>PORTFOLIO</div>
                  {hasPortfolio ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem .75rem', marginBottom: '.75rem' }}>
                        {[
                          { k: 'CASH', v: fmtUSD(portfolio.cash_cents, 0), c: '#aaa' },
                          { k: 'INVESTED', v: fmtUSD(portfolio.invested_cents, 0), c: '#7B9FFF' },
                          { k: 'TOTAL VALUE', v: fmtUSD(portfolio.total_value_cents, 0), c: '#fff' },
                          { k: 'EXPOSURE', v: portfolio.exposure_pct != null ? `${portfolio.exposure_pct.toFixed(1)}%` : '—', c: (portfolio.exposure_pct ?? 0) > 60 ? '#E8AC20' : '#0EAD6E' },
                        ].map(({ k, v, c }) => (
                          <div key={k}>
                            <div style={{ fontSize: '.52rem', color: '#444', letterSpacing: '.08em' }}>{k}</div>
                            <div style={{ fontSize: '.8rem', fontWeight: 700, color: c, marginTop: '.1rem' }}>{v}</div>
                          </div>
                        ))}
                      </div>
                      {/* Exposure bar */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.52rem', color: '#444', marginBottom: '.3rem' }}>
                          <span>CASH</span><span>INVESTED</span>
                        </div>
                        <div style={{ height: 5, background: 'rgba(255,255,255,.05)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%',
                            width: `${Math.min(100, portfolio.exposure_pct ?? 0)}%`,
                            background: 'linear-gradient(90deg, #7B9FFF, #E8AC20)',
                            borderRadius: 3,
                            transition: 'width .6s ease',
                          }} />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div style={{ color: '#444', fontSize: '.72rem' }}>No portfolio data yet —<br />waiting for first cron run</div>
                  )}
                </div>

                {/* ── Open positions ─── */}
                <div style={{ background: '#0D1117', padding: '.85rem 1.25rem' }}>
                  <div style={{ fontSize: '.55rem', color: '#555', letterSpacing: '.1em', marginBottom: '.6rem' }}>
                    OPEN POSITIONS ({positions.length})
                  </div>
                  {positions.length === 0 ? (
                    <div style={{ color: '#444', fontSize: '.72rem' }}>No open positions</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                      {positions.map(pos => {
                        // Get current price from portfolio_json if available
                        const portfolioPos = portfolio.positions?.find(p => p.symbol === pos.symbol)
                        const currentPrice = portfolioPos?.current ?? pos.avg_entry
                        const unrealizedPnl = pos.qty * (currentPrice - pos.avg_entry)
                        const pnlPct = pos.avg_entry > 0 ? ((currentPrice - pos.avg_entry) / pos.avg_entry) * 100 : 0
                        const pnlPos = unrealizedPnl >= 0

                        return (
                          <div key={pos.symbol} style={{
                            display: 'grid', gridTemplateColumns: '1fr auto',
                            padding: '.4rem .6rem',
                            background: 'rgba(255,255,255,.03)',
                            border: '1px solid rgba(255,255,255,.06)',
                            borderRadius: 7, gap: '.5rem', alignItems: 'center',
                          }}>
                            <div>
                              <div style={{ fontSize: '.7rem', fontWeight: 700, color: '#ddd' }}>{pos.symbol}</div>
                              <div style={{ fontSize: '.58rem', color: '#555' }}>
                                {pos.qty.toFixed(4)} @ ${pos.avg_entry.toFixed(2)}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '.7rem', fontWeight: 700, color: pnlPos ? '#0EAD6E' : '#E84040' }}>
                                {pnlPos ? '+' : ''}{fmtUSD(Math.round(unrealizedPnl * 100))}
                              </div>
                              <div style={{ fontSize: '.55rem', color: pnlPos ? '#0EAD6E' : '#E84040' }}>
                                {fmtPct(pnlPct, 1)}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Recent trades table ─── */}
              {recentTrades.length > 0 && (
                <div style={{ padding: '0 1.25rem 1.25rem' }}>
                  <div style={{ fontSize: '.55rem', color: '#555', letterSpacing: '.1em', margin: '1rem 0 .5rem' }}>RECENT TRADES</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.68rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                        {['TIME', 'SIDE', 'SYMBOL', 'QTY', 'FILL', 'P&L'].map(h => (
                          <th key={h} style={{ padding: '.3rem .5rem', textAlign: 'left', color: '#444', letterSpacing: '.08em', fontSize: '.55rem', fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recentTrades.map((t, i) => {
                        const pnlPos = (t.pnl_cents ?? 0) >= 0
                        return (
                          <tr key={t.id} style={{
                            background: i % 2 === 0 ? 'rgba(255,255,255,.01)' : 'transparent',
                            borderBottom: '1px solid rgba(255,255,255,.03)',
                          }}>
                            <td style={{ padding: '.35rem .5rem', color: '#555', fontSize: '.6rem' }}>
                              {t.filled_at ? new Date(t.filled_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                            </td>
                            <td style={{ padding: '.35rem .5rem', fontWeight: 700, color: t.side === 'buy' ? '#0EAD6E' : '#E84040' }}>
                              {t.side.toUpperCase()}
                            </td>
                            <td style={{ padding: '.35rem .5rem', color: '#ccc', fontWeight: 600 }}>{t.symbol}</td>
                            <td style={{ padding: '.35rem .5rem', color: '#888' }}>{Number(t.qty).toFixed(4)}</td>
                            <td style={{ padding: '.35rem .5rem', color: '#aaa' }}>${Number(t.fill_price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td style={{ padding: '.35rem .5rem', color: t.pnl_cents != null ? (pnlPos ? '#0EAD6E' : '#E84040') : '#444', fontWeight: t.pnl_cents != null ? 700 : 400 }}>
                              {t.pnl_cents != null ? `${pnlPos ? '+' : ''}${fmtUSD(t.pnl_cents)}` : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {recentTrades.length === 0 && (
                <div style={{ padding: '1rem 1.25rem', color: '#333', fontSize: '.72rem' }}>
                  No trades recorded yet — waiting for market conditions
                </div>
              )}
            </div>
          )
        })}

        {agentList.length === 0 && (
          <div style={{ padding: '4rem', textAlign: 'center', color: '#333', fontSize: '.9rem' }}>
            No agents found. Check Supabase and run the schema migration.
          </div>
        )}
      </div>

      <div style={{ padding: '1.5rem 2rem', borderTop: '1px solid rgba(255,255,255,.04)', fontSize: '.58rem', color: '#333', textAlign: 'center' }}>
        /dev · not linked from main nav · data refreshes on page load
      </div>
    </div>
  )
}
