/**
 * POST /api/cron/simulate
 *
 * Self-contained 24/7 trading simulation engine.
 * Runs every 15 minutes. Works with OR without Alpaca paper trading.
 *
 * What it does each run:
 *  1. Fetches real crypto prices from Alpaca data API (free tier)
 *     Falls back to Brownian motion simulation if unavailable
 *  2. Runs each agent's strategy logic against current prices
 *  3. Executes trades (directly inserts to agent_trades — no paper account needed)
 *  4. Calculates NAV = $100 × (capital + P&L) / capital
 *  5. Updates share_price_cents, agent_stats, holdings.current_value_cents
 *  6. Applies buy/sell price pressure from user investments
 *
 * Capital model:
 *  - Each agent starts with $10,000 base capital
 *  - User investments ADD to total capital (total_aum_cents)
 *  - Agent trades proportional to capital → more AUM = bigger P&L
 *  - NAV (share price) reflects % return on capital
 *
 * Protected by CRON_SECRET header (optional in dev).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCryptoBars } from '@/lib/alpaca'

export const dynamic = 'force-dynamic'

// ── CONSTANTS ──────────────────────────────────────────────────────────────
const BASE_CAPITAL_CENTS = 1_000_000 // $10,000 per agent
const BASE_NAV_CENTS     = 10_000    // $100.00 initial share price

// Realistic crypto starting prices (approximate, updated each run from real data)
const FALLBACK_PRICES: Record<string, number> = {
  'BTC/USD':  85000,
  'ETH/USD':  2000,
  'SOL/USD':  135,
  'LINK/USD': 15,
  'UNI/USD':  8,
  'AAVE/USD': 140,
  'AVAX/USD': 22,
}

// Volatility params for Brownian motion fallback (annualized daily vol)
const ASSET_VOL: Record<string, number> = {
  'BTC/USD':  0.60,
  'ETH/USD':  0.70,
  'SOL/USD':  0.90,
  'LINK/USD': 0.80,
  'UNI/USD':  0.85,
  'AAVE/USD': 0.80,
  'AVAX/USD': 0.85,
}

// Slight positive drift (crypto long-term trend) — annualized
const ASSET_DRIFT: Record<string, number> = {
  'BTC/USD':  0.40,
  'ETH/USD':  0.35,
  'SOL/USD':  0.45,
  'LINK/USD': 0.30,
  'UNI/USD':  0.25,
  'AAVE/USD': 0.30,
  'AVAX/USD': 0.35,
}

// ── PRICE FETCHING ──────────────────────────────────────────────────────────

/** Get current crypto price. Tries Alpaca data API first, falls back to simulation. */
async function getCurrentPrice(
  symbol: string,
  lastKnownPrice: number | null
): Promise<{ price: number; source: 'alpaca' | 'simulated' }> {
  // Try Alpaca free data API (works with any API key, no paper account needed)
  if (process.env.ALPACA_KEY_ID) {
    try {
      const bars = await getCryptoBars(symbol, '1Hour', 3)
      if (bars && bars.length > 0) {
        return { price: bars[bars.length - 1].c, source: 'alpaca' }
      }
    } catch {
      // Fall through to simulation
    }
  }

  // Brownian motion simulation
  const base = lastKnownPrice ?? (FALLBACK_PRICES[symbol] ?? 100)
  const vol = ASSET_VOL[symbol] ?? 0.70
  const drift = ASSET_DRIFT[symbol] ?? 0.30
  const dt = 15 / (365 * 24 * 60) // 15-minute intervals in years
  const gaussian = () => {
    let u = 0, v = 0
    while (u === 0) u = Math.random()
    while (v === 0) v = Math.random()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  const logReturn = (drift - 0.5 * vol * vol) * dt + vol * Math.sqrt(dt) * gaussian()
  const newPrice = base * Math.exp(logReturn)

  return { price: newPrice, source: 'simulated' }
}

// ── POSITION TRACKING ──────────────────────────────────────────────────────

interface Position {
  symbol: string
  qty: number
  avg_entry: number
}

async function getPositions(admin: ReturnType<typeof createAdminClient>, agentId: string): Promise<Position[]> {
  const { data } = await admin
    .from('agent_trades')
    .select('symbol, side, qty, fill_price')
    .eq('agent_id', agentId)

  const map: Record<string, { buyQty: number; buyCost: number; sellQty: number }> = {}
  for (const t of data ?? []) {
    const sym = String(t.symbol).toUpperCase()
    if (!map[sym]) map[sym] = { buyQty: 0, buyCost: 0, sellQty: 0 }
    const qty = parseFloat(String(t.qty)) || 0
    const price = parseFloat(String(t.fill_price)) || 0
    if (t.side === 'buy') { map[sym].buyQty += qty; map[sym].buyCost += qty * price }
    else if (t.side === 'sell') { map[sym].sellQty += qty }
  }

  return Object.entries(map)
    .map(([sym, v]) => ({
      symbol: sym,
      qty: Math.max(0, v.buyQty - v.sellQty),
      avg_entry: v.buyQty > 0 ? v.buyCost / v.buyQty : 0,
    }))
    .filter(p => p.qty > 0.00001)
}

/** FIFO cost basis for sell P&L */
async function calcPnL(
  admin: ReturnType<typeof createAdminClient>,
  agentId: string,
  symbol: string,
  sellQty: number,
  sellPrice: number
): Promise<number> {
  const { data: buys } = await admin
    .from('agent_trades')
    .select('qty, fill_price, filled_at')
    .eq('agent_id', agentId)
    .eq('symbol', symbol)
    .eq('side', 'buy')
    .order('filled_at', { ascending: true })

  let remaining = sellQty
  let totalCost = 0
  for (const buy of buys ?? []) {
    const qty = parseFloat(String(buy.qty)) || 0
    const price = parseFloat(String(buy.fill_price)) || 0
    const take = Math.min(remaining, qty)
    totalCost += take * price
    remaining -= take
    if (remaining <= 0) break
  }

  return Math.round((sellQty * sellPrice - totalCost) * 100)
}

/** Record a trade to agent_trades */
async function recordTrade(
  admin: ReturnType<typeof createAdminClient>,
  agentId: string,
  symbol: string,
  side: 'buy' | 'sell',
  qty: number,
  fillPrice: number,
  pnlCents: number | null = null
) {
  await admin.from('agent_trades').insert({
    agent_id: agentId,
    symbol,
    side,
    qty,
    fill_price: fillPrice,
    filled_at: new Date().toISOString(),
    pnl_cents: pnlCents,
  })
}

// ── STRATEGY RUNNERS ────────────────────────────────────────────────────────
// Each strategy gets current prices + positions, returns trade decisions

interface StrategyContext {
  agentId: string
  positions: Position[]
  capitalCents: number
  prices: Record<string, number>
  priceHistory: Record<string, number[]> // last 10 simulated prices (crude indicator)
}

interface TradeDecision {
  action: 'BUY' | 'SELL' | 'HOLD'
  symbol: string
  qty?: number
  notionalCents?: number
  reason: string
}

// Simple momentum: buy if price up > 0.5% vs last, sell if down > 0.4%
function momentumSignal(prices: number[]): 'BUY' | 'SELL' | 'HOLD' {
  if (prices.length < 2) return 'HOLD'
  const latest = prices[prices.length - 1]
  const prev = prices[prices.length - 2]
  const chg = (latest - prev) / prev
  if (chg > 0.005) return 'BUY'
  if (chg < -0.004) return 'SELL'
  return 'HOLD'
}

// Z-score mean reversion
function zScoreSignal(prices: number[], current: number): 'BUY' | 'SELL' | 'HOLD' {
  if (prices.length < 5) return 'HOLD'
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length
  const variance = prices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / prices.length
  const stdDev = Math.sqrt(variance)
  const z = stdDev > 0 ? (current - mean) / stdDev : 0
  if (z < -1.2) return 'BUY'
  if (z > 0.8) return 'SELL'
  return 'HOLD'
}

// Bollinger band breakout
function bollingerSignal(prices: number[], current: number): 'BUY' | 'SELL' | 'HOLD' {
  if (prices.length < 8) return 'HOLD'
  const recent = prices.slice(-8)
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length
  const stdDev = Math.sqrt(recent.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / recent.length)
  const upper = mean + 2 * stdDev
  const lower = mean - 2 * stdDev
  if (current > upper) return 'BUY'
  if (current < lower) return 'SELL'
  return 'HOLD'
}

// Momentum ratio (momentum / volatility) for ranking
function momentumRatio(prices: number[]): number {
  if (prices.length < 6) return 0
  const momentum = (prices[prices.length - 1] - prices[0]) / prices[0]
  const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i])
  const vol = Math.sqrt(returns.reduce((a, b) => a + b * b, 0) / returns.length) || 0.001
  return momentum / vol
}

// Strategy 1: BTC Momentum Alpha
async function strategyBtcMomentum(
  admin: ReturnType<typeof createAdminClient>,
  ctx: StrategyContext
): Promise<{ decisions: TradeDecision[]; signal: string }> {
  const sym = 'BTC/USD'
  const price = ctx.prices[sym]
  const hist = ctx.priceHistory[sym] ?? [price]
  const pos = ctx.positions.find(p => p.symbol === sym || p.symbol === 'BTC/USD')
  const signal = momentumSignal([...hist, price])
  const maxExposurePct = 0.35

  const decisions: TradeDecision[] = []

  if (signal === 'BUY' && !pos) {
    const investCents = Math.round(ctx.capitalCents * maxExposurePct)
    const qty = (investCents / 100) / price
    decisions.push({ action: 'BUY', symbol: sym, qty, notionalCents: investCents, reason: 'Momentum breakout confirmed' })
  } else if (signal === 'SELL' && pos) {
    decisions.push({ action: 'SELL', symbol: sym, qty: pos.qty, reason: 'Momentum reversal — exit position' })
  } else {
    decisions.push({ action: 'HOLD', symbol: sym, reason: signal === 'HOLD' ? 'Neutral momentum — scanning' : `Signal: ${signal}, position: ${pos ? 'open' : 'none'}` })
  }

  const signalStr = signal === 'BUY' ? 'BULLISH — momentum breakout' :
    signal === 'SELL' ? 'BEARISH — momentum reversal' : 'SCANNING — neutral momentum'
  return { decisions, signal: signalStr }
}

// Strategy 2: ETH Statistical Arbitrage (mean reversion)
async function strategyEthMeanRevert(
  admin: ReturnType<typeof createAdminClient>,
  ctx: StrategyContext
): Promise<{ decisions: TradeDecision[]; signal: string }> {
  const sym = 'ETH/USD'
  const price = ctx.prices[sym]
  const hist = ctx.priceHistory[sym] ?? [price]
  const pos = ctx.positions.find(p => p.symbol === sym || p.symbol === 'ETH/USD')
  const signal = zScoreSignal(hist, price)
  const maxExposurePct = 0.30

  const decisions: TradeDecision[] = []

  if (signal === 'BUY' && !pos) {
    const investCents = Math.round(ctx.capitalCents * maxExposurePct)
    const qty = (investCents / 100) / price
    decisions.push({ action: 'BUY', symbol: sym, qty, notionalCents: investCents, reason: 'Z-score mean reversion entry' })
  } else if (signal === 'SELL' && pos) {
    decisions.push({ action: 'SELL', symbol: sym, qty: pos.qty, reason: 'Z-score reversion to mean — exit' })
  } else {
    decisions.push({ action: 'HOLD', symbol: sym, reason: 'Mean reversion — monitoring spread' })
  }

  const signalStr = signal === 'BUY' ? 'OVERSOLD — mean reversion entry' :
    signal === 'SELL' ? 'REVERTED — taking profit' : 'MONITORING — z-score neutral'
  return { decisions, signal: signalStr }
}

// Strategy 3: Multi-Asset Trend System
async function strategyCryptoTrend(
  admin: ReturnType<typeof createAdminClient>,
  ctx: StrategyContext
): Promise<{ decisions: TradeDecision[]; signal: string }> {
  const symbols = ['BTC/USD', 'ETH/USD', 'SOL/USD']
  const maxExposurePct = 0.40

  // Score each asset by momentum ratio
  const scores = symbols.map(sym => ({
    sym,
    score: momentumRatio([...(ctx.priceHistory[sym] ?? [ctx.prices[sym]]), ctx.prices[sym]]),
  })).sort((a, b) => b.score - a.score)

  const topAsset = scores[0]
  const currentPositions = ctx.positions.filter(p => symbols.includes(p.symbol))
  const currentSym = currentPositions.length > 0 ? currentPositions[0].symbol : null
  const decisions: TradeDecision[] = []

  // Exit non-top assets
  for (const pos of currentPositions) {
    if (pos.symbol !== topAsset.sym || topAsset.score < 0.05) {
      decisions.push({ action: 'SELL', symbol: pos.symbol, qty: pos.qty, reason: `Rotating out of ${pos.symbol}` })
    }
  }

  // Enter top asset if not already holding it and trend is strong
  if (!currentSym && topAsset.score > 0.1) {
    const investCents = Math.round(ctx.capitalCents * maxExposurePct)
    const qty = (investCents / 100) / ctx.prices[topAsset.sym]
    decisions.push({ action: 'BUY', symbol: topAsset.sym, qty, notionalCents: investCents, reason: `Trend signal: ${topAsset.sym} leads momentum` })
  }

  if (decisions.length === 0) {
    decisions.push({ action: 'HOLD', symbol: topAsset.sym, reason: 'Trend following — holding or scanning' })
  }

  const topScoreStr = topAsset.score.toFixed(3)
  return { decisions, signal: `TREND — ${topAsset.sym.split('/')[0]} leads (score: ${topScoreStr})` }
}

// Strategy 4: SOL Volatility Breakout
async function strategySolBreakout(
  admin: ReturnType<typeof createAdminClient>,
  ctx: StrategyContext
): Promise<{ decisions: TradeDecision[]; signal: string }> {
  const sym = 'SOL/USD'
  const price = ctx.prices[sym]
  const hist = ctx.priceHistory[sym] ?? [price]
  const pos = ctx.positions.find(p => p.symbol === sym || p.symbol === 'SOL/USD')
  const signal = bollingerSignal(hist, price)
  const maxExposurePct = 0.25

  const decisions: TradeDecision[] = []

  if (signal === 'BUY' && !pos) {
    const investCents = Math.round(ctx.capitalCents * maxExposurePct)
    const qty = (investCents / 100) / price
    decisions.push({ action: 'BUY', symbol: sym, qty, notionalCents: investCents, reason: 'Bollinger squeeze breakout confirmed' })
  } else if (signal === 'SELL' && pos) {
    decisions.push({ action: 'SELL', symbol: sym, qty: pos.qty, reason: 'Price below Bollinger midpoint — stop' })
  } else {
    decisions.push({ action: 'HOLD', symbol: sym, reason: 'SOL volatility breakout — scanning for squeeze' })
  }

  const signalStr = signal === 'BUY' ? `BREAKOUT — upper band breach @ $${price.toFixed(2)}` :
    signal === 'SELL' ? 'EXIT — momentum fading' : 'SCANNING — watching for squeeze'
  return { decisions, signal: signalStr }
}

// Strategy 5: DeFi Smart Beta Rotation
async function strategyDefiBasket(
  admin: ReturnType<typeof createAdminClient>,
  ctx: StrategyContext
): Promise<{ decisions: TradeDecision[]; signal: string }> {
  const symbols = ['LINK/USD', 'AVAX/USD']
  const maxExposureEachPct = 0.20

  const scores = symbols.map(sym => ({
    sym,
    score: momentumRatio([...(ctx.priceHistory[sym] ?? [ctx.prices[sym]]), ctx.prices[sym]]),
  })).sort((a, b) => b.score - a.score)

  const currentPositions = ctx.positions.filter(p => symbols.includes(p.symbol))
  const decisions: TradeDecision[] = []

  // Hold top 1-2 by score (simplified: hold the best one)
  const target = scores[0]
  const already = currentPositions.find(p => p.symbol === target.sym)

  // Exit losers
  for (const pos of currentPositions) {
    if (pos.symbol !== target.sym) {
      decisions.push({ action: 'SELL', symbol: pos.symbol, qty: pos.qty, reason: 'DeFi rotation — reallocating' })
    }
  }

  // Enter winner if no position
  if (!already && target.score > 0.05) {
    const investCents = Math.round(ctx.capitalCents * maxExposureEachPct)
    const qty = (investCents / 100) / ctx.prices[target.sym]
    decisions.push({ action: 'BUY', symbol: target.sym, qty, notionalCents: investCents, reason: `Smart beta: ${target.sym} scores highest risk-adj momentum` })
  }

  if (decisions.length === 0) {
    decisions.push({ action: 'HOLD', symbol: target.sym, reason: 'DeFi basket — positioned in top scorer' })
  }

  const names = scores.map(s => `${s.sym.split('/')[0]}(${s.score.toFixed(2)})`).join(', ')
  return { decisions, signal: `ROTATION — ${names}` }
}

// Map agent slug → strategy function
type StrategyFn = (admin: ReturnType<typeof createAdminClient>, ctx: StrategyContext) => Promise<{ decisions: TradeDecision[]; signal: string }>

const STRATEGIES: Record<string, StrategyFn> = {
  'btc-momentum':    strategyBtcMomentum,
  'eth-mean-revert': strategyEthMeanRevert,
  'crypto-trend':    strategyCryptoTrend,
  'sol-breakout':    strategySolBreakout,
  'defi-basket':     strategyDefiBasket,
}

// Symbols each agent uses (for price fetching)
const AGENT_SYMBOLS: Record<string, string[]> = {
  'btc-momentum':    ['BTC/USD'],
  'eth-mean-revert': ['ETH/USD'],
  'crypto-trend':    ['BTC/USD', 'ETH/USD', 'SOL/USD'],
  'sol-breakout':    ['SOL/USD'],
  'defi-basket':     ['LINK/USD', 'AVAX/USD'],
}

// ── NAV CALCULATION ────────────────────────────────────────────────────────

async function calculateNAV(
  admin: ReturnType<typeof createAdminClient>,
  agentId: string,
  capitalCents: number,
  prices: Record<string, number>
): Promise<{
  navCents: number
  totalReturnPct: number
  realizedPnlCents: number
  unrealizedPnlCents: number
  winRatePct: number
  totalTrades: number
}> {
  // Realized P&L
  const { data: closedTrades } = await admin
    .from('agent_trades')
    .select('side, pnl_cents')
    .eq('agent_id', agentId)
    .not('pnl_cents', 'is', null)

  const realizedPnlCents = (closedTrades ?? []).reduce((s, t) => s + (Number(t.pnl_cents) || 0), 0)
  const sells = (closedTrades ?? []).filter(t => t.side === 'sell' || t.side === 'SELL')
  const wins = sells.filter(t => (Number(t.pnl_cents) || 0) > 0).length
  const winRatePct = sells.length > 0 ? (wins / sells.length) * 100 : 0

  // All trades count
  const { count: totalTrades } = await admin
    .from('agent_trades')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', agentId)

  // Unrealized P&L from open positions
  const positions = await getPositions(admin, agentId)
  let unrealizedPnlCents = 0
  for (const pos of positions) {
    const currentPrice = prices[pos.symbol] ?? pos.avg_entry
    unrealizedPnlCents += Math.round(pos.qty * (currentPrice - pos.avg_entry) * 100)
  }

  const totalPnlCents = realizedPnlCents + unrealizedPnlCents
  const navCents = Math.round(BASE_NAV_CENTS * (capitalCents + totalPnlCents) / capitalCents)
  const totalReturnPct = (totalPnlCents / capitalCents) * 100

  return { navCents, totalReturnPct, realizedPnlCents, unrealizedPnlCents, winRatePct, totalTrades: totalTrades ?? 0 }
}

// ── FINANCIAL METRICS ──────────────────────────────────────────────────────

function calcSharpe(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
  const variance = dailyReturns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / dailyReturns.length
  const std = Math.sqrt(variance)
  return std > 0 ? parseFloat(((mean / std) * Math.sqrt(365)).toFixed(4)) : 0
}

function calcMaxDrawdown(navs: number[]): number {
  let peak = navs[0]
  let maxDD = 0
  for (const nav of navs) {
    if (nav > peak) peak = nav
    const dd = peak > 0 ? ((peak - nav) / peak) * 100 : 0
    if (dd > maxDD) maxDD = dd
  }
  return maxDD
}

// ── MAIN HANDLER ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.get('x-cron-secret')
    if (authHeader !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()

  // ── 1. Load all active agents ──────────────────────────────────────────
  const { data: agents, error: agentsErr } = await admin
    .from('agents')
    .select('id, slug, total_aum_cents, share_price_cents')
    .eq('status', 'active')

  if (agentsErr || !agents?.length) {
    return NextResponse.json({ ok: false, error: agentsErr?.message ?? 'No active agents', ran_at: now })
  }

  // ── 2. Get last known prices from recent agent_trades ──────────────────
  const { data: recentTrades } = await admin
    .from('agent_trades')
    .select('symbol, fill_price, filled_at')
    .order('filled_at', { ascending: false })
    .limit(100)

  // Last known fill price per symbol
  const lastPrices: Record<string, number> = {}
  for (const t of recentTrades ?? []) {
    const sym = String(t.symbol).toUpperCase().replace('/', '/')
    if (!lastPrices[sym] && t.fill_price) {
      lastPrices[sym] = parseFloat(String(t.fill_price))
    }
  }

  // ── 3. Build price history for each agent's symbols ────────────────────
  // We use recent fill prices as a proxy for price history
  const { data: historicalTrades } = await admin
    .from('agent_trades')
    .select('symbol, fill_price, filled_at')
    .order('filled_at', { ascending: true })
    .limit(500)

  const priceHistoryMap: Record<string, number[]> = {}
  for (const t of historicalTrades ?? []) {
    const sym = String(t.symbol).toUpperCase()
    if (!priceHistoryMap[sym]) priceHistoryMap[sym] = []
    if (t.fill_price) priceHistoryMap[sym].push(parseFloat(String(t.fill_price)))
  }

  // ── 4. Fetch current prices for all needed symbols ─────────────────────
  const allSymbols = new Set<string>()
  for (const agent of agents) {
    const syms = AGENT_SYMBOLS[agent.slug] ?? []
    syms.forEach(s => allSymbols.add(s))
  }

  const currentPrices: Record<string, { price: number; source: string }> = {}
  for (const sym of allSymbols) {
    const lastKnown = lastPrices[sym] ?? null
    const result = await getCurrentPrice(sym, lastKnown)
    currentPrices[sym] = result
  }

  const prices: Record<string, number> = Object.fromEntries(
    Object.entries(currentPrices).map(([sym, { price }]) => [sym, price])
  )

  // ── 5. Run each agent's strategy ────────────────────────────────────────
  const results: Record<string, unknown> = {}
  let totalNewTrades = 0

  for (const agent of agents) {
    const stratFn = STRATEGIES[agent.slug]
    if (!stratFn) continue

    try {
      const capitalCents = Math.max(BASE_CAPITAL_CENTS, Number(agent.total_aum_cents) || 0)
      const positions = await getPositions(admin, agent.id)
      const agentPrices = Object.fromEntries(
        (AGENT_SYMBOLS[agent.slug] ?? []).map(sym => [sym, prices[sym] ?? FALLBACK_PRICES[sym] ?? 100])
      )
      const agentPriceHistory = Object.fromEntries(
        (AGENT_SYMBOLS[agent.slug] ?? []).map(sym => [sym, priceHistoryMap[sym] ?? []])
      )

      const ctx: StrategyContext = {
        agentId: agent.id,
        positions,
        capitalCents,
        prices: agentPrices,
        priceHistory: agentPriceHistory,
      }

      const { decisions, signal } = await stratFn(admin, ctx)

      // Execute decisions
      let agentTrades = 0
      for (const d of decisions) {
        if (d.action === 'BUY' && d.qty && d.qty > 0) {
          const fillPrice = agentPrices[d.symbol] ?? FALLBACK_PRICES[d.symbol] ?? 100
          await recordTrade(admin, agent.id, d.symbol, 'buy', d.qty, fillPrice, null)
          agentTrades++
          totalNewTrades++
        } else if (d.action === 'SELL' && d.qty && d.qty > 0) {
          const fillPrice = agentPrices[d.symbol] ?? FALLBACK_PRICES[d.symbol] ?? 100
          const pnl = await calcPnL(admin, agent.id, d.symbol, d.qty, fillPrice)
          await recordTrade(admin, agent.id, d.symbol, 'sell', d.qty, fillPrice, pnl)
          agentTrades++
          totalNewTrades++
        }
      }

      // ── 6. Recalculate NAV ──────────────────────────────────────────
      const {
        navCents,
        totalReturnPct,
        realizedPnlCents,
        unrealizedPnlCents,
        winRatePct,
        totalTrades,
      } = await calculateNAV(admin, agent.id, capitalCents, agentPrices)

      // ── 7. Compute Sharpe, MaxDD from history ──────────────────────
      const { data: navHistory } = await admin
        .from('agent_stats')
        .select('nav_cents')
        .eq('agent_id', agent.id)
        .order('snapshot_at', { ascending: true })
        .limit(60)

      const allNavs = (navHistory ?? []).map(s => Number(s.nav_cents)).concat(navCents)
      const dailyReturns: number[] = []
      for (let i = 1; i < allNavs.length; i++) {
        const prev = allNavs[i - 1]
        if (prev > 0) dailyReturns.push(((allNavs[i] - prev) / prev) * 100)
      }
      const sharpeRatio = calcSharpe(dailyReturns)
      const maxDrawdownPct = calcMaxDrawdown(allNavs)

      // ── 8. Insert agent_stats snapshot ────────────────────────────
      const investedInPositions = positions.reduce(
        (s, p) => s + Math.round(p.qty * p.avg_entry * 100), 0
      )
      const exposureFraction = capitalCents > 0 ? Math.min(1, investedInPositions / capitalCents) : 0

      await admin.from('agent_stats').insert({
        agent_id: agent.id,
        snapshot_at: now,
        nav_cents: navCents,
        total_return_pct: parseFloat(totalReturnPct.toFixed(4)),
        sharpe_ratio: sharpeRatio,
        max_drawdown_pct: parseFloat(maxDrawdownPct.toFixed(4)),
        win_rate_pct: parseFloat(winRatePct.toFixed(4)),
        total_trades: totalTrades,
        volume_shares: positions.reduce((s, p) => s + p.qty, 0),
        daily_return_pct: dailyReturns.length > 0 ? dailyReturns[dailyReturns.length - 1] : 0,
        portfolio_value_cents: capitalCents + realizedPnlCents + unrealizedPnlCents,
      })

      // ── 9. Update price ticks ──────────────────────────────────────
      const spreadBps = Math.round(10 + exposureFraction * 40)
      const bidCents = Math.round(navCents * (1 - spreadBps / 10_000))
      const askCents = Math.round(navCents * (1 + spreadBps / 10_000))

      await admin.from('price_ticks').upsert({
        agent_id: agent.id,
        tick_at: now,
        price_cents: navCents,
        bid_cents: bidCents,
        ask_cents: askCents,
        volume: positions.reduce((s, p) => s + p.qty, 0),
      }, { onConflict: 'agent_id,tick_at' })

      // ── 10. Update agent share price + signal summary ──────────────
      // Apply buy/sell pressure from recent trades: buying pushes up, selling pulls down
      const buyNotional = decisions.filter(d => d.action === 'BUY')
        .reduce((s, d) => s + (d.notionalCents ?? 0), 0)
      const sellNotional = decisions.filter(d => d.action === 'SELL')
        .reduce((s, d) => s + ((d.qty ?? 0) * (agentPrices[d.symbol] ?? 0) * 100), 0)
      const netFlow = buyNotional - sellNotional
      const tradePressurePct = capitalCents > 0 ? Math.max(-0.5, Math.min(0.5, (netFlow / capitalCents) * 20)) : 0
      const pressuredNav = Math.round(navCents * (1 + tradePressurePct / 100))

      await admin.from('agents').update({
        share_price_cents: pressuredNav,
        signal_summary: signal,
        last_run_at: now,
      }).eq('id', agent.id)

      // ── 11. Update holdings current value ─────────────────────────
      const { data: activeHoldings } = await admin
        .from('holdings')
        .select('id, shares')
        .eq('agent_id', agent.id)
        .eq('status', 'active')

      for (const h of activeHoldings ?? []) {
        const currentValue = Math.round(Number(h.shares) * navCents)
        await admin.from('holdings').update({ current_value_cents: currentValue }).eq('id', h.id)
      }

      // ── 12. Update agent AUM from active holdings ──────────────────
      const { data: holdingsForAum } = await admin
        .from('holdings')
        .select('invested_cents')
        .eq('agent_id', agent.id)
        .eq('status', 'active')

      const totalInvested = (holdingsForAum ?? []).reduce((s, h) => s + Number(h.invested_cents), 0)
      if (totalInvested > 0) {
        await admin.from('agents').update({ total_aum_cents: totalInvested }).eq('id', agent.id)
      }

      results[agent.slug] = {
        nav_usd: (navCents / 100).toFixed(2),
        return_pct: totalReturnPct.toFixed(2),
        realized_pnl: (realizedPnlCents / 100).toFixed(2),
        unrealized_pnl: (unrealizedPnlCents / 100).toFixed(2),
        trades_this_run: agentTrades,
        total_trades: totalTrades,
        sharpe: sharpeRatio.toFixed(3),
        signal,
        data_source: Object.values(currentPrices)[0]?.source ?? 'unknown',
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error(`Simulate failed for ${agent.slug}:`, msg)
      results[agent.slug] = { error: msg }
    }
  }

  return NextResponse.json({
    ok: true,
    ran_at: now,
    agents_run: agents.length,
    new_trades: totalNewTrades,
    prices: Object.fromEntries(
      Object.entries(currentPrices).map(([sym, { price, source }]) => [sym, { price: price.toFixed(2), source }])
    ),
    results,
  })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
