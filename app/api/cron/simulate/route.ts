/**
 * POST /api/cron/simulate
 *
 * Production-grade 24/7 crypto trading simulation engine.
 * Proper quant procedures:
 *   - Stop losses (-3% from entry)
 *   - Take profits (+8% from entry)
 *   - Trailing stops (-2.5% from position peak)
 *   - Portfolio circuit breaker (-12% drawdown closes all)
 *   - Fixed fractional position sizing (max 35% per asset)
 *   - Time stops (120h max hold)
 *   - Signal filters (strength ≥ 60/100 before entry)
 *
 * Runs every 15 min, 24/7. Uses Alpaca data API (free) or Brownian motion fallback.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCryptoBars } from '@/lib/alpaca'

export const dynamic = 'force-dynamic'

// ── QUANT CONSTANTS ─────────────────────────────────────────────────────────
const BASE_CAPITAL_CENTS     = 1_000_000   // $10,000 per agent
const BASE_NAV_CENTS         = 10_000      // $100.00 initial share price
const STOP_LOSS_PCT          = 0.030       // Hard stop: -3% below entry
const TAKE_PROFIT_PCT        = 0.080       // Take profit: +8% above entry
const TRAILING_STOP_PCT      = 0.025       // Trailing: -2.5% from peak
const MAX_PORTFOLIO_DRAWDOWN = 0.12        // Circuit breaker: portfolio -12%
const MAX_HOLD_HOURS         = 120         // 5-day time stop
const MIN_SIGNAL_STRENGTH    = 60          // 0-100 signal filter

const ASSET_PARAMS: Record<string, { price: number; vol: number; drift: number }> = {
  'BTC/USD':  { price: 85000, vol: 0.60, drift: 0.40 },
  'ETH/USD':  { price: 2000,  vol: 0.70, drift: 0.35 },
  'SOL/USD':  { price: 135,   vol: 0.90, drift: 0.45 },
  'LINK/USD': { price: 15,    vol: 0.80, drift: 0.30 },
  'AVAX/USD': { price: 22,    vol: 0.85, drift: 0.35 },
}

// ── PRICE FETCHING ──────────────────────────────────────────────────────────

function gaussian(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

async function getPrice(sym: string, last: number | null): Promise<{ price: number; source: string }> {
  if (process.env.ALPACA_KEY_ID) {
    try {
      const bars = await getCryptoBars(sym, '1Hour', 3)
      if (bars?.length > 0) return { price: bars[bars.length - 1].c, source: 'alpaca' }
    } catch { /* fall through */ }
  }
  const p = ASSET_PARAMS[sym] ?? { price: 100, vol: 0.70, drift: 0.30 }
  const base = last ?? p.price
  const dt = 15 / (365 * 24 * 60)
  const logR = (p.drift - 0.5 * p.vol ** 2) * dt + p.vol * Math.sqrt(dt) * gaussian()
  return { price: base * Math.exp(logR), source: 'sim' }
}

// ── POSITIONS ───────────────────────────────────────────────────────────────

interface Pos { symbol: string; qty: number; avgEntry: number; entryDate: Date; peakPrice: number }

async function getPositions(
  admin: ReturnType<typeof createAdminClient>,
  agentId: string,
  hwm: Record<string, number>
): Promise<Pos[]> {
  const { data } = await admin
    .from('agent_trades')
    .select('symbol, side, qty, fill_price, filled_at')
    .eq('agent_id', agentId)
    .order('filled_at', { ascending: true })

  const map: Record<string, { bq: number; bc: number; sq: number; firstDate: Date | null }> = {}
  for (const t of data ?? []) {
    const sym = String(t.symbol)
    if (!map[sym]) map[sym] = { bq: 0, bc: 0, sq: 0, firstDate: null }
    const q = parseFloat(String(t.qty)) || 0
    const p = parseFloat(String(t.fill_price)) || 0
    if (t.side === 'buy') {
      map[sym].bq += q; map[sym].bc += q * p
      if (!map[sym].firstDate) map[sym].firstDate = new Date(t.filled_at)
    } else { map[sym].sq += q }
  }

  return Object.entries(map)
    .map(([sym, v]) => ({
      symbol: sym,
      qty: Math.max(0, v.bq - v.sq),
      avgEntry: v.bq > 0 ? v.bc / v.bq : 0,
      entryDate: v.firstDate ?? new Date(),
      peakPrice: hwm[sym] ?? (v.bq > 0 ? v.bc / v.bq : 0),
    }))
    .filter(p => p.qty > 0.000001)
}

async function calcPnL(
  admin: ReturnType<typeof createAdminClient>,
  agentId: string, symbol: string, qty: number, price: number
): Promise<number> {
  const { data } = await admin
    .from('agent_trades')
    .select('qty, fill_price')
    .eq('agent_id', agentId).eq('symbol', symbol).eq('side', 'buy')
    .order('filled_at', { ascending: true })
  let rem = qty, cost = 0
  for (const b of data ?? []) {
    const bq = parseFloat(String(b.qty)) || 0
    const bp = parseFloat(String(b.fill_price)) || 0
    const take = Math.min(rem, bq)
    cost += take * bp; rem -= take
    if (rem <= 0) break
  }
  return Math.round((qty * price - cost) * 100)
}

async function record(
  admin: ReturnType<typeof createAdminClient>,
  agentId: string, sym: string, side: 'buy' | 'sell', qty: number, price: number,
  pnl: number | null, exitReason?: string
) {
  await admin.from('agent_trades').insert({
    agent_id: agentId, symbol: sym, side, qty, fill_price: price,
    filled_at: new Date().toISOString(), pnl_cents: pnl,
    ...(exitReason ? { exit_reason: exitReason } : {}),
  })
}

// ── RISK CHECKS ─────────────────────────────────────────────────────────────

function checkExit(pos: Pos, currPrice: number, portfolioDrawdown: number): string | null {
  if (portfolioDrawdown > MAX_PORTFOLIO_DRAWDOWN)
    return `Circuit breaker: portfolio −${(portfolioDrawdown * 100).toFixed(1)}%`
  const pctFromEntry = (currPrice - pos.avgEntry) / pos.avgEntry
  if (pctFromEntry < -STOP_LOSS_PCT)
    return `Stop loss: ${(pctFromEntry * 100).toFixed(2)}%`
  if (pctFromEntry > TAKE_PROFIT_PCT)
    return `Take profit: +${(pctFromEntry * 100).toFixed(2)}%`
  const pctFromPeak = (currPrice - pos.peakPrice) / pos.peakPrice
  if (pctFromPeak < -TRAILING_STOP_PCT && pctFromEntry > 0.01)
    return `Trailing stop: ${(pctFromPeak * 100).toFixed(2)}% from peak`
  const hoursHeld = (Date.now() - pos.entryDate.getTime()) / 3_600_000
  if (hoursHeld > MAX_HOLD_HOURS)
    return `Time stop: ${hoursHeld.toFixed(0)}h held`
  return null
}

// ── INDICATORS ───────────────────────────────────────────────────────────────

function ema(arr: number[], period: number): number {
  if (!arr.length) return 0
  if (arr.length < period) return arr[arr.length - 1]
  const k = 2 / (period + 1)
  let e = arr.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < arr.length; i++) e = arr[i] * k + e * (1 - k)
  return e
}

function rsi(arr: number[], period = 14): number {
  if (arr.length < period + 1) return 50
  const ch = arr.slice(1).map((p, i) => p - arr[i])
  const r = ch.slice(-period)
  const avgG = r.filter(c => c > 0).reduce((a, b) => a + b, 0) / period
  const avgL = r.filter(c => c < 0).map(Math.abs).reduce((a, b) => a + b, 0) / period || 0.001
  return 100 - 100 / (1 + avgG / avgL)
}

function bollinger(arr: number[], period = 20) {
  const s = arr.slice(-period)
  const mean = s.reduce((a, b) => a + b, 0) / s.length
  const std = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length)
  return { upper: mean + 2 * std, middle: mean, lower: mean - 2 * std, std }
}

function zScore(arr: number[], curr: number, period = 20): number {
  const s = arr.slice(-period)
  const mean = s.reduce((a, b) => a + b, 0) / s.length
  const std = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length)
  return std > 0 ? (curr - mean) / std : 0
}

function mom(arr: number[], period = 10): number {
  if (arr.length < period + 1) return 0
  const past = arr[arr.length - 1 - period]
  return past > 0 ? (arr[arr.length - 1] - past) / past : 0
}

function vol(arr: number[], period = 14): number {
  if (arr.length < 2) return 0.02
  const returns = arr.slice(-period).slice(1).map((p, i) => Math.log(p / arr.slice(-period)[i]))
  return Math.sqrt(returns.reduce((a, b) => a + b * b, 0) / returns.length)
}

// ── ENTRY SIGNALS ────────────────────────────────────────────────────────────

function sigBtcMom(hist: number[], curr: number): { enter: boolean; pct: number; reason: string; strength: number } {
  if (hist.length < 55) return { enter: false, pct: 0, reason: 'Need 55 data points', strength: 0 }
  const arr = [...hist, curr]
  const e8 = ema(arr, 8), e21 = ema(arr, 21), e50 = ema(arr, 50)
  const r = rsi(arr), m = mom(arr, 8)
  const trendUp = e8 > e21 && e21 > e50
  const rsiOk = r > 45 && r < 72
  const momOk = m > 0.012
  const strength = (trendUp ? 40 : 0) + (rsiOk ? 30 : 0) + (momOk ? 30 : 0)
  return {
    enter: trendUp && rsiOk && momOk && strength >= MIN_SIGNAL_STRENGTH,
    pct: 0.28,
    reason: `EMA8>${e8.toFixed(0)} EMA21>${e21.toFixed(0)} RSI=${r.toFixed(0)} Mom=${(m*100).toFixed(1)}%`,
    strength,
  }
}

function sigEthRevert(hist: number[], curr: number): { enter: boolean; pct: number; reason: string; strength: number } {
  if (hist.length < 22) return { enter: false, pct: 0, reason: 'Need 22 data points', strength: 0 }
  const z = zScore(hist, curr, 20)
  const bb = bollinger(hist, 20)
  const bbPct = bb.std > 0 ? (curr - bb.lower) / (bb.upper - bb.lower) : 0.5
  const r = rsi([...hist, curr])
  const zOS = z < -1.3
  const bbOS = bbPct < 0.20
  const rsiOS = r < 42
  const strength = (zOS ? 40 : 0) + (bbOS ? 30 : 0) + (rsiOS ? 30 : 0)
  return {
    enter: zOS && (bbOS || rsiOS) && strength >= MIN_SIGNAL_STRENGTH,
    pct: 0.26,
    reason: `Z=${z.toFixed(2)} BB%=${(bbPct*100).toFixed(0)}% RSI=${r.toFixed(0)}`,
    strength,
  }
}

function sigTrend(pMap: Record<string, number[]>, prices: Record<string, number>): { sym: string; enter: boolean; pct: number; reason: string; strength: number } {
  const ranked = ['BTC/USD', 'ETH/USD', 'SOL/USD'].map(sym => {
    const h = pMap[sym] ?? []; const c = prices[sym] ?? 0
    if (h.length < 12) return { sym, score: 0, reason: 'No history' }
    const m10 = mom([...h, c], 10), m5 = mom([...h, c], 5), v14 = vol([...h, c], 14)
    const r = rsi([...h, c])
    const score = (m10 + m5 * 0.5) / (v14 || 0.02)
    return { sym, score, reason: `Mom=${(m10*100).toFixed(1)}% Vol=${(v14*100).toFixed(1)}% RSI=${r.toFixed(0)}` }
  }).sort((a, b) => b.score - a.score)
  const best = ranked[0]
  const strength = Math.min(100, Math.max(0, best.score * 22))
  return { sym: best.sym, enter: best.score > 1.5 && strength >= MIN_SIGNAL_STRENGTH, pct: 0.30, reason: best.reason, strength }
}

function sigSolBreak(hist: number[], curr: number): { enter: boolean; pct: number; reason: string; strength: number } {
  if (hist.length < 22) return { enter: false, pct: 0, reason: 'Need 22 data points', strength: 0 }
  const bb = bollinger(hist, 20)
  const bw = (bb.upper - bb.lower) / bb.middle
  const r = rsi([...hist, curr]), m = mom([...hist, curr], 5)
  const breakout = curr > bb.upper
  const confirm = r > 55 && m > 0.008
  const strength = (breakout ? 50 : 0) + (confirm ? 30 : 0) + (bw < 0.04 ? 20 : 0)
  return {
    enter: breakout && confirm && strength >= MIN_SIGNAL_STRENGTH,
    pct: 0.22,
    reason: `BB_upper=${bb.upper.toFixed(2)} BW=${(bw*100).toFixed(1)}% RSI=${r.toFixed(0)}`,
    strength,
  }
}

function sigDefi(pMap: Record<string, number[]>, prices: Record<string, number>): Array<{ sym: string; pct: number; reason: string }> {
  return ['LINK/USD', 'AVAX/USD']
    .map(sym => {
      const h = pMap[sym] ?? []; const c = prices[sym] ?? 0
      if (h.length < 14) return null
      const m14 = mom([...h, c], 14), v14 = vol([...h, c], 14)
      const score = m14 / (v14 || 0.02)
      return score > 0.8 ? { sym, score, pct: 0.16, reason: `Mom=${(m14*100).toFixed(1)}% Score=${score.toFixed(2)}` } : null
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 2) as Array<{ sym: string; pct: number; reason: string }>
}

// ── NAV CALCULATION ──────────────────────────────────────────────────────────

async function calcNAV(
  admin: ReturnType<typeof createAdminClient>,
  agentId: string, capitalCents: number, prices: Record<string, number>
) {
  const { data: closed } = await admin
    .from('agent_trades').select('side, pnl_cents').eq('agent_id', agentId).not('pnl_cents', 'is', null)
  const realized = (closed ?? []).reduce((s, t) => s + (Number(t.pnl_cents) || 0), 0)
  const sells = (closed ?? []).filter(t => t.side === 'sell')
  const wins = sells.filter(t => (Number(t.pnl_cents) || 0) > 0).length
  const winRate = sells.length > 0 ? (wins / sells.length) * 100 : 0
  const { count } = await admin.from('agent_trades').select('id', { count: 'exact', head: true }).eq('agent_id', agentId)
  const positions = await getPositions(admin, agentId, {})
  let unrealized = 0
  for (const p of positions) unrealized += Math.round(p.qty * ((prices[p.symbol] ?? p.avgEntry) - p.avgEntry) * 100)
  const totalPnl = realized + unrealized
  return {
    navCents: Math.round(BASE_NAV_CENTS * (capitalCents + totalPnl) / capitalCents),
    returnPct: (totalPnl / capitalCents) * 100,
    realized, unrealized, winRate, totalTrades: count ?? 0,
  }
}

function calcSharpe(navs: number[]): number {
  if (navs.length < 3) return 0
  const returns = navs.slice(1).map((n, i) => navs[i] > 0 ? ((n - navs[i]) / navs[i]) * 100 : 0)
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const std = Math.sqrt(returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length)
  return std > 0 ? parseFloat(((mean / std) * Math.sqrt(365)).toFixed(4)) : 0
}

function calcMaxDD(navs: number[]): number {
  let peak = navs[0] ?? 0, dd = 0
  for (const n of navs) { if (n > peak) peak = n; const d = peak > 0 ? ((peak - n) / peak) * 100 : 0; if (d > dd) dd = d }
  return dd
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('x-cron-secret') !== secret)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data: agents } = await admin
    .from('agents').select('id, slug, total_aum_cents, share_price_cents, portfolio_json').eq('status', 'active')
  if (!agents?.length) return NextResponse.json({ ok: false, error: 'No active agents', ran_at: now })

  // Build price history from trade records
  const { data: recentTrades } = await admin
    .from('agent_trades').select('symbol, fill_price, filled_at').order('filled_at', { ascending: true }).limit(2000)

  const hist: Record<string, number[]> = {}
  const lastPrice: Record<string, number> = {}
  for (const t of recentTrades ?? []) {
    const sym = String(t.symbol)
    const p = parseFloat(String(t.fill_price)) || 0
    if (p > 0) { if (!hist[sym]) hist[sym] = []; hist[sym].push(p); lastPrice[sym] = p }
  }

  // Fetch current prices
  const allSyms = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'LINK/USD', 'AVAX/USD']
  const pricesMap: Record<string, { price: number; source: string }> = {}
  for (const sym of allSyms) pricesMap[sym] = await getPrice(sym, lastPrice[sym] ?? null)
  const prices: Record<string, number> = Object.fromEntries(Object.entries(pricesMap).map(([k, v]) => [k, v.price]))

  // Append new prices to history (for signal calculation this run)
  for (const sym of allSyms) { if (!hist[sym]) hist[sym] = []; hist[sym].push(prices[sym]) }

  const results: Record<string, unknown> = {}
  let totalNewTrades = 0

  for (const agent of agents) {
    try {
      const capitalCents = Math.max(BASE_CAPITAL_CENTS, Number(agent.total_aum_cents) || 0)

      // Load portfolio state (high-water marks)
      let pState: { hwm: Record<string, number> } = { hwm: {} }
      try { if (agent.portfolio_json) pState = JSON.parse(agent.portfolio_json) } catch {}

      const positions = await getPositions(admin, agent.id, pState.hwm)

      // Update HWM with current prices
      for (const pos of positions) {
        const curr = prices[pos.symbol] ?? pos.avgEntry
        pState.hwm[pos.symbol] = Math.max(pState.hwm[pos.symbol] ?? 0, curr)
      }

      // Portfolio drawdown
      const investedCents = positions.reduce((s, p) => s + Math.round(p.qty * p.avgEntry * 100), 0)
      const currValueCents = positions.reduce((s, p) => s + Math.round(p.qty * (prices[p.symbol] ?? p.avgEntry) * 100), 0)
      const portfolioDrawdown = investedCents > 0 ? Math.max(0, (investedCents - currValueCents) / capitalCents) : 0

      // ── EXIT MANAGEMENT ──────────────────────────────────────────────────
      const exits: string[] = []
      for (const pos of positions) {
        pos.peakPrice = pState.hwm[pos.symbol] ?? pos.avgEntry
        const exitReason = checkExit(pos, prices[pos.symbol] ?? pos.avgEntry, portfolioDrawdown)
        if (exitReason) {
          const sellPrice = prices[pos.symbol] ?? pos.avgEntry
          const pnl = await calcPnL(admin, agent.id, pos.symbol, pos.qty, sellPrice)
          await record(admin, agent.id, pos.symbol, 'sell', pos.qty, sellPrice, pnl, exitReason)
          delete pState.hwm[pos.symbol]
          exits.push(`${pos.symbol.split('/')[0]}: ${exitReason}`)
          totalNewTrades++
        }
      }

      // Refresh after exits
      const openPos = await getPositions(admin, agent.id, pState.hwm)
      const openSyms = new Set(openPos.map(p => p.symbol))
      const invested2 = openPos.reduce((s, p) => s + Math.round(p.qty * p.avgEntry * 100), 0)
      const cashCents = capitalCents - invested2
      const cashPct = cashCents / capitalCents
      let agentTrades = exits.length

      // ── ENTRY SIGNALS ────────────────────────────────────────────────────
      if (cashPct > 0.20) {
        let remaining = cashCents
        const entries: Array<{ sym: string; notionalCents: number; reason: string }> = []

        if (agent.slug === 'btc-momentum') {
          const h = hist['BTC/USD'] ?? []; const s = sigBtcMom(h.slice(0, -1), prices['BTC/USD'])
          if (s.enter && !openSyms.has('BTC/USD'))
            entries.push({ sym: 'BTC/USD', notionalCents: Math.round(capitalCents * s.pct), reason: s.reason })
        }
        if (agent.slug === 'eth-mean-revert') {
          const h = hist['ETH/USD'] ?? []; const s = sigEthRevert(h.slice(0, -1), prices['ETH/USD'])
          if (s.enter && !openSyms.has('ETH/USD'))
            entries.push({ sym: 'ETH/USD', notionalCents: Math.round(capitalCents * s.pct), reason: s.reason })
        }
        if (agent.slug === 'crypto-trend') {
          const s = sigTrend({ 'BTC/USD': hist['BTC/USD']?.slice(0, -1) ?? [], 'ETH/USD': hist['ETH/USD']?.slice(0, -1) ?? [], 'SOL/USD': hist['SOL/USD']?.slice(0, -1) ?? [] }, prices)
          if (s.enter && !openSyms.has(s.sym))
            entries.push({ sym: s.sym, notionalCents: Math.round(capitalCents * s.pct), reason: s.reason })
        }
        if (agent.slug === 'sol-breakout') {
          const h = hist['SOL/USD'] ?? []; const s = sigSolBreak(h.slice(0, -1), prices['SOL/USD'])
          if (s.enter && !openSyms.has('SOL/USD'))
            entries.push({ sym: 'SOL/USD', notionalCents: Math.round(capitalCents * s.pct), reason: s.reason })
        }
        if (agent.slug === 'defi-basket') {
          const ee = sigDefi({ 'LINK/USD': hist['LINK/USD']?.slice(0, -1) ?? [], 'AVAX/USD': hist['AVAX/USD']?.slice(0, -1) ?? [] }, prices)
          for (const e of ee) if (!openSyms.has(e.sym)) entries.push({ sym: e.sym, notionalCents: Math.round(capitalCents * e.pct), reason: e.reason })
        }

        for (const e of entries) {
          if (e.notionalCents < 1000) continue
          if (e.notionalCents > remaining) continue
          const fp = prices[e.sym] ?? 0
          if (fp <= 0) continue
          const qty = (e.notionalCents / 100) / fp
          await record(admin, agent.id, e.sym, 'buy', qty, fp, null)
          pState.hwm[e.sym] = fp
          remaining -= e.notionalCents
          agentTrades++
          totalNewTrades++
        }
      }

      // ── NAV & METRICS ────────────────────────────────────────────────────
      const { navCents, returnPct, realized, unrealized, winRate, totalTrades } =
        await calcNAV(admin, agent.id, capitalCents, prices)

      const { data: navHist } = await admin
        .from('agent_stats').select('nav_cents').eq('agent_id', agent.id)
        .order('snapshot_at', { ascending: true }).limit(90)
      const navSeries = (navHist ?? []).map(s => Number(s.nav_cents)).concat(navCents)
      const sharpeRatio = calcSharpe(navSeries)
      const maxDD = calcMaxDD(navSeries)
      const freshPos = await getPositions(admin, agent.id, pState.hwm)
      const exposed = freshPos.reduce((s, p) => s + Math.round(p.qty * p.avgEntry * 100), 0)
      const expFrac = Math.min(1, exposed / capitalCents)

      // Signal summary
      const posStr = freshPos.length > 0
        ? freshPos.map(p => { const pct = ((prices[p.symbol] ?? p.avgEntry) - p.avgEntry) / p.avgEntry * 100; return `${p.symbol.split('/')[0]} ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%` }).join(' | ')
        : null
      const signal = exits.length > 0
        ? `EXECUTED: ${exits.slice(0, 2).join(' | ')}`
        : posStr ? `HOLDING: ${posStr}` : 'SCANNING — awaiting signal'

      // ── WRITE DB ────────────────────────────────────────────────────────
      const dailyRet = navSeries.length > 1
        ? ((navCents - navSeries[navSeries.length - 2]) / navSeries[navSeries.length - 2]) * 100 : 0

      await admin.from('agent_stats').insert({
        agent_id: agent.id, snapshot_at: now, nav_cents: navCents,
        total_return_pct: parseFloat(returnPct.toFixed(4)),
        sharpe_ratio: sharpeRatio, max_drawdown_pct: parseFloat(maxDD.toFixed(4)),
        win_rate_pct: parseFloat(winRate.toFixed(4)), total_trades: totalTrades,
        volume_shares: freshPos.reduce((s, p) => s + p.qty, 0),
        daily_return_pct: parseFloat(dailyRet.toFixed(4)),
        portfolio_value_cents: capitalCents + realized + unrealized,
      })

      const spreadBps = Math.round(10 + expFrac * 40)
      await admin.from('price_ticks').upsert({
        agent_id: agent.id, tick_at: now, price_cents: navCents,
        bid_cents: Math.round(navCents * (1 - spreadBps / 10_000)),
        ask_cents: Math.round(navCents * (1 + spreadBps / 10_000)),
        volume: freshPos.reduce((s, p) => s + p.qty, 0),
      }, { onConflict: 'agent_id,tick_at' })

      await admin.from('agents').update({
        share_price_cents: navCents,
        signal_summary: signal,
        portfolio_json: JSON.stringify(pState),
        last_run_at: now,
      }).eq('id', agent.id)

      // Update holdings
      const { data: hh } = await admin.from('holdings').select('id, shares').eq('agent_id', agent.id).eq('status', 'active')
      for (const h of hh ?? [])
        await admin.from('holdings').update({ current_value_cents: Math.round(Number(h.shares) * navCents) }).eq('id', h.id)

      // Update AUM
      const { data: hAum } = await admin.from('holdings').select('invested_cents').eq('agent_id', agent.id).eq('status', 'active')
      const totalInvested = (hAum ?? []).reduce((s, h) => s + Number(h.invested_cents), 0)
      if (totalInvested > 0) await admin.from('agents').update({ total_aum_cents: totalInvested }).eq('id', agent.id)

      results[agent.slug] = {
        nav: `$${(navCents / 100).toFixed(2)}`, return: `${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(2)}%`,
        realized: `$${(realized / 100).toFixed(2)}`, unrealized: `$${(unrealized / 100).toFixed(2)}`,
        positions: freshPos.length, trades_this_run: agentTrades, exits,
        sharpe: sharpeRatio.toFixed(3), max_dd: `${maxDD.toFixed(2)}%`, signal,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown'
      console.error(`[simulate] ${agent.slug}:`, msg)
      results[agent.slug] = { error: msg }
    }
  }

  return NextResponse.json({
    ok: true, ran_at: now,
    agents: agents.length, new_trades: totalNewTrades,
    prices: Object.fromEntries(Object.entries(pricesMap).map(([s, { price, source }]) => [s, { price: `$${price.toFixed(2)}`, source }])),
    results,
  })
}

export async function GET(req: NextRequest) { return POST(req) }
