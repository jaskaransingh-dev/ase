/**
 * ASE Agent Trading Engine - Sophisticated Quant Strategies
 *
 * Architecture:
 *  - Each agent has its own $10k paper trading capital tracked in the DB
 *  - All agents share one Alpaca paper account (positions overlap is OK — each
 *    agent tracks its own qty in agent_trades, not from Alpaca positions)
 *  - Strategies check agent_trades for their OWN open positions
 *  - Orders are executed via Alpaca and logged to agent_trades immediately
 *  - NAV is calculated from each agent's individual P&L history
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { getCryptoBars, submitOrder, waitForFill, AlpacaBar } from './alpaca'

// ── AGENT CONFIG ──────────────────────────────────────────────────────────

export interface AgentConfig {
  id: string
  slug: string
  name: string
  description: string
  strategyType: 'momentum' | 'mean_reversion' | 'trend_following' | 'crypto_momentum' | 'crypto_mean_reversion'
  tagline: string
  ticker: string
  asset: 'equity' | 'crypto'
}

export const AGENT_CONFIGS: AgentConfig[] = [
  {
    id: 'btc-momentum',
    slug: 'btc-momentum',
    name: 'BTC Momentum Alpha',
    description: 'Multi-timeframe momentum with volume confirmation. 8/21 EMA fast crossover with 50 EMA trend filter, MACD histogram confirmation, and volume surge detection. Risk 2% per trade, max 35% exposure.',
    strategyType: 'crypto_momentum',
    tagline: 'Advanced momentum alpha with volume confirmation',
    ticker: 'BTCM',
    asset: 'crypto',
  },
  {
    id: 'eth-mean-revert',
    slug: 'eth-mean-revert',
    name: 'ETH Statistical Arbitrage',
    description: 'Z-score mean reversion with multi-indicator confirmation. 20-period Z-score of closing price with RSI < 32 and Bollinger %B < 0.15 entry conditions. ATR-based stops, max 30% exposure.',
    strategyType: 'crypto_mean_reversion',
    tagline: 'Statistical mean reversion with multi-indicator confirmation',
    ticker: 'ETHR',
    asset: 'crypto',
  },
  {
    id: 'crypto-trend',
    slug: 'crypto-trend',
    name: 'Multi-Asset Trend System',
    description: 'ADX-filtered trend following with volatility-weighted allocation across BTC, ETH, SOL. Only enters when ADX > 22. Uses 10/30 EMA crossover with inverse volatility weighting. Max 40% total exposure.',
    strategyType: 'crypto_momentum',
    tagline: 'ADX-filtered trend with volatility-weighted allocation',
    ticker: 'CRTR',
    asset: 'crypto',
  },
  {
    id: 'sol-breakout',
    slug: 'sol-breakout',
    name: 'SOL Volatility Breakout',
    description: 'Bollinger squeeze detection with volume and momentum confirmation. Enters on upper band breaks after squeeze with volume > 1.5x 20-day average. Partial profit targets at 2x and 3x ATR with 5-day time stop.',
    strategyType: 'crypto_momentum',
    tagline: 'Volatility breakout with partial profit targets',
    ticker: 'SOLB',
    asset: 'crypto',
  },
  {
    id: 'defi-basket',
    slug: 'defi-basket',
    name: 'DeFi Smart Beta Rotation',
    description: 'Risk-adjusted momentum rotation across LINK, UNI, AAVE, AVAX. Score = 14-day momentum / 14-day volatility. Hold top 2 with equal weight (cap 20% each). Only rebalance on 2+ rank changes to avoid whipsaw.',
    strategyType: 'crypto_momentum',
    tagline: 'Risk-adjusted momentum rotation',
    ticker: 'DEFI',
    asset: 'crypto',
  },
]

// ── CRYPTO SYMBOLS (Alpaca slash format) ──────────────────────────────────
const SYM = {
  BTC:  'BTC/USD',
  ETH:  'ETH/USD',
  SOL:  'SOL/USD',
  LINK: 'LINK/USD',
  UNI:  'UNI/USD',
  AAVE: 'AAVE/USD',
  AVAX: 'AVAX/USD',
} as const

// ── TYPES ─────────────────────────────────────────────────────────────────

export interface TradeAction {
  action: 'BUY' | 'SELL' | 'HOLD' | 'SKIP' | 'ERROR'
  symbol: string
  qty?: number
  notional?: number    // USD value ordered
  fill_price?: number
  alpaca_order_id?: string
  pnl_cents?: number   // realized P&L on sells
  reason?: string
  error?: string
  indicators?: Record<string, number | string>
}

export interface StrategyResult {
  agent_slug: string
  actions: TradeAction[]
  skipped?: boolean
  error?: string
  portfolio: {
    cash_cents: number
    invested_cents: number
    total_value_cents: number
    positions: { symbol: string; qty: number; entry: number; current: number; pnl_pct: number }[]
    exposure_pct: number
  }
  signal_summary: string // e.g. "BULLISH - EMA cross confirmed by MACD, volume surge 1.4x avg"
}

// ── INDICATOR HELPERS ─────────────────────────────────────────────────────

function calcEMA(bars: AlpacaBar[], period: number): number {
  if (bars.length < period) return bars[bars.length - 1]?.c || 0
  const k = 2 / (period + 1)
  let ema = bars.slice(0, period).reduce((a, b) => a + b.c, 0) / period
  for (const bar of bars.slice(period)) {
    ema = bar.c * k + ema * (1 - k)
  }
  return ema
}

function calcRSI(bars: AlpacaBar[], period = 14): number {
  if (bars.length < period + 1) return 50
  const changes = bars.slice(1).map((b, i) => b.c - bars[i].c)
  const recent = changes.slice(-period)
  const gains = recent.filter(c => c > 0)
  const losses = recent.filter(c => c < 0).map(Math.abs)
  const avgGain = gains.length ? gains.reduce((a, b) => a + b, 0) / period : 0
  const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / period : 0.001
  return 100 - 100 / (1 + avgGain / avgLoss)
}

function calcBollingerBands(bars: AlpacaBar[], period = 20) {
  const closes = bars.slice(-period).map(b => b.c)
  const sma = closes.reduce((a, b) => a + b, 0) / closes.length
  const variance = closes.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / closes.length
  const stdDev = Math.sqrt(variance)
  return { upper: sma + 2 * stdDev, middle: sma, lower: sma - 2 * stdDev, stdDev }
}

// Average True Range for volatility-based position sizing
function calcATR(bars: AlpacaBar[], period = 14): number {
  if (bars.length < period + 1) return 0
  const ranges: number[] = []
  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].h
    const low = bars[i].l
    const prevClose = bars[i - 1].c
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    )
    ranges.push(tr)
  }
  const recent = ranges.slice(-period)
  return recent.reduce((a, b) => a + b, 0) / recent.length
}

// MACD: 12/26 EMA with 9-bar signal line
function calcMACD(bars: AlpacaBar[]): { macd: number; signal: number; histogram: number } {
  if (bars.length < 26) return { macd: 0, signal: 0, histogram: 0 }
  const ema12 = calcEMA(bars, 12)
  const ema26 = calcEMA(bars, 26)
  const macd = ema12 - ema26

  // Signal line is 9-period EMA of MACD line
  const macdLine: number[] = []
  for (let i = 0; i <= Math.min(bars.length - 26, bars.length); i++) {
    const e12 = calcEMA(bars.slice(i, i + 12), 12)
    const e26 = calcEMA(bars.slice(i, i + 26), 26)
    macdLine.push(e12 - e26)
  }

  const signal = calcEMA(macdLine.slice(-9).map((c, i) => ({ c, h: c, l: c, o: c, v: 0, t: '' })), 9)
  return { macd, signal, histogram: macd - signal }
}

// Average Directional Index for trend strength confirmation
function calcADX(bars: AlpacaBar[], period = 14): number {
  if (bars.length < period + 1) return 0

  const dms: { up: number; down: number }[] = []
  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].h - bars[i - 1].h
    const low = bars[i - 1].l - bars[i].l
    let up = 0, down = 0
    if (high > low && high > 0) up = high
    if (low > high && low > 0) down = low
    dms.push({ up, down })
  }

  let posSum = dms.slice(-period).reduce((a, b) => a + b.up, 0)
  let negSum = dms.slice(-period).reduce((a, b) => a + b.down, 0)

  const tr = bars.slice(1).reduce((sum, bar, i) => {
    const prevClose = bars[i].c
    const tr = Math.max(bar.h - bar.l, Math.abs(bar.h - prevClose), Math.abs(bar.l - prevClose))
    return sum + tr
  }, 0) / bars.length

  const di_plus = posSum / tr
  const di_minus = negSum / tr
  const dx = Math.abs(di_plus - di_minus) / (di_plus + di_minus || 1) * 100

  return dx
}

// Volume Weighted Average Price
function calcVWAP(bars: AlpacaBar[]): number {
  if (bars.length === 0) return 0
  const typicalPrice = bars.map(b => (b.h + b.l + b.c) / 3)
  const cumVol = bars.reduce((sum, b) => sum + b.v, 0)
  const numerator = typicalPrice.reduce((sum, p, i) => sum + p * bars[i].v, 0)
  return cumVol > 0 ? numerator / cumVol : bars[bars.length - 1].c
}

// Z-score of current price vs historical mean
function calcZScore(bars: AlpacaBar[], period = 20): number {
  if (bars.length < period) return 0
  const recent = bars.slice(-period).map(b => b.c)
  const mean = recent.reduce((a, b) => a + b) / recent.length
  const variance = recent.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / recent.length
  const stdDev = Math.sqrt(variance)
  const current = bars[bars.length - 1].c
  return stdDev > 0 ? (current - mean) / stdDev : 0
}

// Annualized volatility from log returns
function calcVolatility(bars: AlpacaBar[], period = 20): number {
  if (bars.length < 2) return 0
  const recent = bars.slice(-period)
  const logReturns: number[] = []
  for (let i = 1; i < recent.length; i++) {
    logReturns.push(Math.log(recent[i].c / recent[i - 1].c))
  }
  const variance = logReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / logReturns.length
  const dailyVol = Math.sqrt(variance)
  return dailyVol * Math.sqrt(252) // Annualize
}

// Rate of change percentage momentum
function calcMomentumScore(bars: AlpacaBar[], period = 14): number {
  if (bars.length < period) return 0
  const current = bars[bars.length - 1].c
  const past = bars[bars.length - 1 - period].c
  return past > 0 ? ((current - past) / past) * 100 : 0
}

// ── POSITION HELPERS ──────────────────────────────────────────────────────

interface AgentPosition {
  symbol: string
  qty: number
  avg_entry: number
  total_cost: number
}

// Get each agent's open positions from agent_trades (NOT from Alpaca)
// An open position = sum(buy qty) - sum(sell qty) > 0 for this agent+symbol
// CRITICAL: Requires indexes on agent_trades(agent_id, symbol) for performance
export async function getAgentPositions(admin: SupabaseClient, agentId: string): Promise<AgentPosition[]> {
  const { data, error } = await admin
    .from('agent_trades')
    .select('symbol, side, qty, fill_price')
    .eq('agent_id', agentId)

  if (error) {
    console.error('getAgentPositions error:', error)
    return []
  }

  const map: Record<string, { buy_qty: number; buy_cost: number; sell_qty: number }> = {}

  for (const t of data || []) {
    const sym = String(t.symbol || '').toUpperCase()
    if (!sym) continue

    if (!map[sym]) map[sym] = { buy_qty: 0, buy_cost: 0, sell_qty: 0 }

    const qty = Math.max(0, parseFloat(String(t.qty)) || 0)
    const price = Math.max(0, parseFloat(String(t.fill_price)) || 0)

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
        total_cost: v.buy_cost,
      }
    })
    .filter(p => p.qty > 0.000001)
}

// Get available cash for an agent
async function getAgentCash(admin: SupabaseClient, agentId: string, capitalCents: number, positions: AgentPosition[]): Promise<number> {
  // Cash = capital - sum(position_cost_basis_in_cents)
  const investedCents = positions.reduce((sum, p) => sum + Math.round(p.qty * p.avg_entry * 100), 0)
  return Math.max(0, capitalCents - investedCents)
}

// Calculate realized P&L for a sell using FIFO cost basis
async function calcSellPnL(
  admin: SupabaseClient,
  agentId: string,
  symbol: string,
  sellQty: number,
  sellPrice: number
): Promise<number> {
  const { data: buys, error } = await admin
    .from('agent_trades')
    .select('qty, fill_price, filled_at')
    .eq('agent_id', agentId)
    .eq('symbol', symbol)
    .eq('side', 'buy')
    .order('filled_at', { ascending: true })

  if (error) {
    console.error('calcSellPnL error:', error)
    return 0
  }

  let remaining = sellQty
  let totalCost = 0

  for (const buy of buys || []) {
    if (remaining <= 1e-8) break

    const buyQty = parseFloat(String(buy.qty)) || 0
    const buyPrice = parseFloat(String(buy.fill_price)) || 0

    if (buyQty <= 0 || buyPrice < 0) continue

    const matched = Math.min(remaining, buyQty)
    totalCost += matched * buyPrice
    remaining -= matched
  }

  const matchedQty = sellQty - Math.max(0, remaining)
  const revenue = matchedQty * sellPrice
  const pnl = revenue - totalCost

  return Math.round(pnl * 100)
}

// Log a trade immediately after order submission
async function logTrade(
  admin: SupabaseClient,
  params: {
    agentId: string
    alpacaOrderId: string
    symbol: string
    side: 'buy' | 'sell'
    qty: number
    fillPrice: number
    filledAt: string
    pnlCents?: number
  }
) {
  try {
    const { error } = await admin.from('agent_trades').insert({
      agent_id: params.agentId,
      alpaca_order_id: params.alpacaOrderId,
      symbol: params.symbol,
      side: params.side,
      qty: params.qty,
      fill_price: params.fillPrice,
      filled_at: params.filledAt,
      pnl_cents: params.pnlCents ?? null,
      created_at: new Date().toISOString(),
    })

    if (error) {
      console.error('❌ Failed to log trade to database:', {
        error: error.message,
        code: error.code,
        symbol: params.symbol,
        side: params.side,
        qty: params.qty,
      })
      throw error
    }

    console.log(`✅ Logged ${params.side.toUpperCase()} trade: ${params.symbol} x${params.qty} @ ${params.fillPrice}`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('Trade logging failed (agent position may be out of sync!):', msg)
    throw e
  }
}

// Execute a buy order and log it
async function executeBuy(
  admin: SupabaseClient,
  agentId: string,
  alpacaKey: string,
  alpacaSecret: string,
  symbol: string,
  notional: number, // USD amount to buy
  currentPrice: number,
  indicators?: Record<string, number | string>
): Promise<TradeAction> {
  if (notional < 1) {
    return { action: 'SKIP', symbol, reason: `Notional $${notional.toFixed(2)} below minimum`, indicators }
  }

  try {
    const order = await submitOrder({ symbol, notional, side: 'buy' }, alpacaKey, alpacaSecret)

    const filled = await waitForFill(order.id, alpacaKey, alpacaSecret)
    const fillPrice = filled.filled_avg_price
      ? parseFloat(filled.filled_avg_price)
      : currentPrice
    const filledQty = filled.filled_qty
      ? parseFloat(filled.filled_qty)
      : notional / fillPrice

    await logTrade(admin, {
      agentId,
      alpacaOrderId: order.id,
      symbol,
      side: 'buy',
      qty: filledQty,
      fillPrice,
      filledAt: filled.filled_at || new Date().toISOString(),
    })

    console.log(`✅ BUY ${symbol} $${notional} @ ${fillPrice} (agent: ${agentId})`)
    return {
      action: 'BUY',
      symbol,
      notional,
      qty: filledQty,
      fill_price: fillPrice,
      alpaca_order_id: order.id,
      indicators,
    }
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    console.error(`❌ BUY ${symbol} failed:`, err)
    return { action: 'ERROR', symbol, error: err, indicators }
  }
}

// Execute a sell order and log it with P&L
async function executeSell(
  admin: SupabaseClient,
  agentId: string,
  alpacaKey: string,
  alpacaSecret: string,
  pos: AgentPosition,
  reason?: string,
  indicators?: Record<string, number | string>
): Promise<TradeAction> {
  const { symbol, qty, avg_entry } = pos
  const sellQty = Math.floor(qty * 1e6) / 1e6

  try {
    const order = await submitOrder({ symbol, qty: sellQty, side: 'sell' }, alpacaKey, alpacaSecret)

    const filled = await waitForFill(order.id, alpacaKey, alpacaSecret)
    const fillPrice = filled.filled_avg_price
      ? parseFloat(filled.filled_avg_price)
      : avg_entry

    const pnlCents = await calcSellPnL(admin, agentId, symbol, sellQty, fillPrice)

    await logTrade(admin, {
      agentId,
      alpacaOrderId: order.id,
      symbol,
      side: 'sell',
      qty: sellQty,
      fillPrice,
      filledAt: filled.filled_at || new Date().toISOString(),
      pnlCents,
    })

    const pnlUsd = pnlCents / 100
    console.log(`✅ SELL ${symbol} ${sellQty} @ ${fillPrice} | P&L: $${pnlUsd.toFixed(2)} (agent: ${agentId})`)
    return {
      action: 'SELL',
      symbol,
      qty: sellQty,
      fill_price: fillPrice,
      alpaca_order_id: order.id,
      pnl_cents: pnlCents,
      reason,
      indicators,
    }
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    console.error(`❌ SELL ${symbol} failed:`, err)
    return { action: 'ERROR', symbol, error: err, indicators }
  }
}

// ── STRATEGY 1: BTC MOMENTUM ALPHA ────────────────────────────────────────
// Multi-timeframe momentum with volume confirmation
// Signal: 8/21 EMA fast crossover + 50 EMA trend filter
// Confirmation: MACD histogram > 0 AND volume > 1.2x 20-day average
// Position sizing: Risk 2% of capital, stop at 2x ATR
export async function runBtcMomentum(
  admin: SupabaseClient,
  agentId: string,
  alpacaKey: string,
  alpacaSecret: string,
  capitalCents = 1_000_000
): Promise<StrategyResult> {
  const symbol = SYM.BTC
  const bars = await getCryptoBars(symbol, '1Day', 100)

  const emptyPortfolio: StrategyResult['portfolio'] = {
    cash_cents: capitalCents,
    invested_cents: 0,
    total_value_cents: capitalCents,
    positions: [],
    exposure_pct: 0,
  }

  if (bars.length < 51) {
    return {
      agent_slug: 'btc-momentum',
      actions: [],
      skipped: true,
      portfolio: emptyPortfolio,
      signal_summary: 'SKIP - Insufficient data',
    }
  }

  const ema8 = calcEMA(bars.slice(-10), 8)
  const ema21 = calcEMA(bars.slice(-25), 21)
  const ema50 = calcEMA(bars, 50)
  const macd = calcMACD(bars)
  const atr = calcATR(bars, 14)
  const currentPrice = bars[bars.length - 1].c
  const prevPrice = bars[bars.length - 2].c

  // Volume confirmation: compare current vs 20-day average
  const vol20Avg = bars.slice(-20).reduce((sum, b) => sum + b.v, 0) / 20
  const currentVol = bars[bars.length - 1].v
  const volRatio = currentVol / (vol20Avg || 1)

  const bullish = ema8 > ema21 && ema21 > ema50 && macd.histogram > 0 && volRatio > 1.2
  const crossover = ema8 > ema21 && prevPrice < ema21

  const positions = await getAgentPositions(admin, agentId)
  const pos = positions.find(p => p.symbol === symbol)
  const cash = await getAgentCash(admin, agentId, capitalCents, positions)

  const indicators = {
    ema8: +ema8.toFixed(2),
    ema21: +ema21.toFixed(2),
    ema50: +ema50.toFixed(2),
    macd: +macd.macd.toFixed(4),
    histogram: +macd.histogram.toFixed(4),
    atr: +atr.toFixed(2),
    vol_ratio: +volRatio.toFixed(2),
    price: +currentPrice.toFixed(2),
  }

  const actions: TradeAction[] = []
  let signalSummary = 'HOLD'

  if (bullish && crossover && !pos && cash > 500) {
    // Position sizing: risk 2% per trade
    const riskAmount = capitalCents / 100 * 0.02 // 2% risk
    const stopDistance = 2 * atr
    const posSize = riskAmount / (stopDistance * 100) // Convert to dollars
    const notional = Math.min(posSize, cash / 100 * 0.35) // Max 35% exposure

    if (notional > 1) {
      const action = await executeBuy(admin, agentId, alpacaKey, alpacaSecret, symbol, notional, currentPrice, indicators)
      actions.push(action)
      signalSummary = `BUY SIGNAL - EMA ${ema8.toFixed(0)}/${ema21.toFixed(0)}/${ema50.toFixed(0)} bullish cross, MACD histogram +${macd.histogram.toFixed(4)}, volume ${volRatio.toFixed(2)}x`
    }
  } else if (pos && !bullish) {
    // Exit: break below EMA21 or stop loss
    const stopPrice = pos.avg_entry - (2 * atr)
    if (currentPrice < stopPrice || ema8 < ema21) {
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos,
        currentPrice < stopPrice ? 'Stop loss triggered' : 'EMA bearish cross', indicators)
      actions.push(action)
      signalSummary = `SELL SIGNAL - ${currentPrice < stopPrice ? 'Stop loss' : 'EMA8 < EMA21'}`
    } else {
      signalSummary = `BULLISH HOLD - Position ${((currentPrice - pos.avg_entry) / pos.avg_entry * 100).toFixed(2)}% gain`
    }
  }

  if (actions.length === 0) {
    actions.push({
      action: 'HOLD',
      symbol,
      reason: bullish ? 'Bullish momentum, holding' : 'No buy/sell signal',
      indicators,
    })
    if (!signalSummary.startsWith('BULLISH')) {
      signalSummary = bullish ? 'BULLISH - monitoring for entry' : 'NEUTRAL'
    }
  }

  const investedCents = positions.reduce((sum, p) => sum + Math.round(p.qty * p.avg_entry * 100), 0)
  const portfolio: StrategyResult['portfolio'] = {
    cash_cents: Math.max(0, capitalCents - investedCents),
    invested_cents: investedCents,
    total_value_cents: capitalCents,
    positions: positions.map(p => ({
      symbol: p.symbol,
      qty: p.qty,
      entry: p.avg_entry,
      current: currentPrice,
      pnl_pct: ((currentPrice - p.avg_entry) / p.avg_entry * 100),
    })),
    exposure_pct: (investedCents / capitalCents) * 100,
  }

  return { agent_slug: 'btc-momentum', actions, portfolio, signal_summary: signalSummary }
}

// ── STRATEGY 2: ETH STATISTICAL ARBITRAGE ─────────────────────────────────
// Z-score mean reversion with multi-indicator confirmation
// Entry: Z-score < -1.8 AND RSI < 32 AND price below lower Bollinger
// Exit: Z-score > 0.5 OR RSI > 68
export async function runEthMeanRevert(
  admin: SupabaseClient,
  agentId: string,
  alpacaKey: string,
  alpacaSecret: string,
  capitalCents = 1_000_000
): Promise<StrategyResult> {
  const symbol = SYM.ETH
  const bars = await getCryptoBars(symbol, '1Day', 50)

  const emptyPortfolio: StrategyResult['portfolio'] = {
    cash_cents: capitalCents,
    invested_cents: 0,
    total_value_cents: capitalCents,
    positions: [],
    exposure_pct: 0,
  }

  if (bars.length < 21) {
    return {
      agent_slug: 'eth-mean-revert',
      actions: [],
      skipped: true,
      portfolio: emptyPortfolio,
      signal_summary: 'SKIP - Insufficient data',
    }
  }

  const zScore = calcZScore(bars, 20)
  const rsi = calcRSI(bars, 14)
  const bb = calcBollingerBands(bars, 20)
  const atr = calcATR(bars, 14)
  const currentPrice = bars[bars.length - 1].c

  // Bollinger %B: position relative to bands
  const percentB = (currentPrice - bb.lower) / (bb.upper - bb.lower)

  const oversold = zScore < -1.8 && rsi < 32 && percentB < 0.15
  const overbought = zScore > 0.5 || rsi > 68

  const positions = await getAgentPositions(admin, agentId)
  const pos = positions.find(p => p.symbol === symbol)
  const cash = await getAgentCash(admin, agentId, capitalCents, positions)

  const indicators = {
    zscore: +zScore.toFixed(2),
    rsi: +rsi.toFixed(1),
    percent_b: +percentB.toFixed(2),
    upper_band: +bb.upper.toFixed(2),
    lower_band: +bb.lower.toFixed(2),
    atr: +atr.toFixed(2),
    price: +currentPrice.toFixed(2),
  }

  const actions: TradeAction[] = []
  let signalSummary = 'NEUTRAL'

  if (pos && overbought) {
    // Exit: take profit on mean reversion
    const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos,
      zScore > 0.5 ? 'Z-score > 0.5 mean reversion' : 'RSI > 68 overbought', indicators)
    actions.push(action)
    signalSummary = `EXIT - Z-score ${zScore.toFixed(2)} overbought`
  } else if (!pos && oversold && cash > 500) {
    // Entry: buy on statistical undervalue
    const positionSize = capitalCents / 100 * 0.30 // 30% max
    const notional = Math.min(positionSize, cash / 100 * 0.30)

    if (notional > 1) {
      // Size based on Z-score magnitude
      const sizeMultiplier = Math.min(1.0, Math.abs(zScore) / 2.0)
      const scaledNotional = notional * sizeMultiplier

      const action = await executeBuy(admin, agentId, alpacaKey, alpacaSecret, symbol, scaledNotional, currentPrice, indicators)
      actions.push(action)
      signalSummary = `BUY SIGNAL - Z-score ${zScore.toFixed(2)} oversold, RSI ${rsi.toFixed(0)}, %B ${percentB.toFixed(2)}`
    }
  }

  if (actions.length === 0) {
    actions.push({
      action: 'HOLD',
      symbol,
      reason: pos ? 'In position, monitoring exit' : 'Awaiting mean reversion setup',
      indicators,
    })
    if (pos) {
      signalSummary = `HOLD - Z-score ${zScore.toFixed(2)}, position +${((currentPrice - pos.avg_entry) / pos.avg_entry * 100).toFixed(2)}%`
    } else {
      signalSummary = `WATCH - Z-score ${zScore.toFixed(2)}, target < -1.8`
    }
  }

  const investedCents = positions.reduce((sum, p) => sum + Math.round(p.qty * p.avg_entry * 100), 0)
  const portfolio: StrategyResult['portfolio'] = {
    cash_cents: Math.max(0, capitalCents - investedCents),
    invested_cents: investedCents,
    total_value_cents: capitalCents,
    positions: positions.map(p => ({
      symbol: p.symbol,
      qty: p.qty,
      entry: p.avg_entry,
      current: currentPrice,
      pnl_pct: ((currentPrice - p.avg_entry) / p.avg_entry * 100),
    })),
    exposure_pct: (investedCents / capitalCents) * 100,
  }

  return { agent_slug: 'eth-mean-revert', actions, portfolio, signal_summary: signalSummary }
}

// ── STRATEGY 3: MULTI-ASSET TREND SYSTEM ────────────────────────────────
// ADX-filtered trend following with volatility-weighted allocation
// Only enter if ADX > 22 (trend confirmed)
// Direction: 10/30 EMA crossover
// Allocation: Inverse volatility weighting
export async function runCryptoTrend(
  admin: SupabaseClient,
  agentId: string,
  alpacaKey: string,
  alpacaSecret: string,
  capitalCents = 1_000_000
): Promise<StrategyResult> {
  const symbols = [SYM.BTC, SYM.ETH, SYM.SOL]
  const positions = await getAgentPositions(admin, agentId)

  const emptyPortfolio: StrategyResult['portfolio'] = {
    cash_cents: capitalCents,
    invested_cents: 0,
    total_value_cents: capitalCents,
    positions: [],
    exposure_pct: 0,
  }

  const actions: TradeAction[] = []
  const trendScores: { symbol: string; adx: number; trending: boolean; vol: number; price: number }[] = []

  for (const symbol of symbols) {
    const bars = await getCryptoBars(symbol, '1Day', 50)
    if (bars.length < 31) {
      actions.push({ action: 'SKIP', symbol, reason: 'Insufficient data' })
      continue
    }

    const ema10 = calcEMA(bars.slice(-15), 10)
    const ema30 = calcEMA(bars, 30)
    const adx = calcADX(bars, 14)
    const vol = calcVolatility(bars, 14)
    const currentPrice = bars[bars.length - 1].c

    const trending = ema10 > ema30 && adx > 22 // ADX filter for trend strength
    trendScores.push({ symbol, adx, trending, vol, price: currentPrice })
  }

  // Inverse volatility weighting: lower vol = higher allocation
  const trendingAssets = trendScores.filter(s => s.trending)
  const totalInvVol = trendingAssets.reduce((sum, s) => sum + (1 / s.vol), 0)
  const allocations = Object.fromEntries(
    trendingAssets.map(s => [s.symbol, (1 / s.vol) / totalInvVol])
  )

  const maxExposure = capitalCents / 100 * 0.40 // 40% total max
  const perAssetMax = capitalCents / 100 * 0.15 // 15% per asset max
  const cash = await getAgentCash(admin, agentId, capitalCents, positions)

  let signalSummary = `${trendingAssets.length} assets trending`

  for (const asset of trendingAssets) {
    const alloc = allocations[asset.symbol] || 0
    const notional = Math.min(alloc * maxExposure, perAssetMax)
    const pos = positions.find(p => p.symbol === asset.symbol)

    if (!pos && notional > 1 && cash > notional * 100) {
      const indicators = {
        ema10_ema30: 'bullish',
        adx: +asset.adx.toFixed(1),
        volatility: +(asset.vol * 100).toFixed(2),
        allocation: +(alloc * 100).toFixed(1),
      }
      const action = await executeBuy(admin, agentId, alpacaKey, alpacaSecret, asset.symbol, notional, asset.price, indicators)
      actions.push(action)
    } else if (pos) {
      actions.push({
        action: 'HOLD',
        symbol: asset.symbol,
        reason: `Trend confirmed (ADX ${asset.adx.toFixed(1)}), holding`,
        indicators: { adx: +asset.adx.toFixed(1), vol_allocation: +(alloc * 100).toFixed(1) },
      })
    }
  }

  // Exit positions that are no longer trending
  for (const pos of positions) {
    if (symbols.includes(pos.symbol as typeof symbols[number]) && !trendingAssets.some(s => s.symbol === pos.symbol)) {
      const ts = trendScores.find(s => s.symbol === pos.symbol)
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos,
        ts ? `ADX ${ts.adx.toFixed(1)} < 22 or EMA bearish` : 'Trend ended', {})
      actions.push(action)
    }
  }

  if (actions.length === 0) {
    actions.push({
      action: 'SKIP',
      symbol: 'MULTI',
      reason: 'No ADX-confirmed trends',
    })
  }

  const investedCents = positions.reduce((sum, p) => sum + Math.round(p.qty * p.avg_entry * 100), 0)
  const portfolio: StrategyResult['portfolio'] = {
    cash_cents: Math.max(0, capitalCents - investedCents),
    invested_cents: investedCents,
    total_value_cents: capitalCents,
    positions: positions.map(p => {
      const score = trendScores.find(s => s.symbol === p.symbol)
      return {
        symbol: p.symbol,
        qty: p.qty,
        entry: p.avg_entry,
        current: score?.price || p.avg_entry,
        pnl_pct: score ? ((score.price - p.avg_entry) / p.avg_entry * 100) : 0,
      }
    }),
    exposure_pct: (investedCents / capitalCents) * 100,
  }

  return { agent_slug: 'crypto-trend', actions, portfolio, signal_summary: signalSummary }
}

// ── STRATEGY 4: SOL VOLATILITY BREAKOUT ──────────────────────────────────
// Bollinger squeeze detection with volume and momentum confirmation
// Squeeze: Bollinger bandwidth < 80% of 20-day average bandwidth
// Breakout: Price closes above upper band AFTER squeeze
// Volume: > 1.5x 20-day average
export async function runSolBreakout(
  admin: SupabaseClient,
  agentId: string,
  alpacaKey: string,
  alpacaSecret: string,
  capitalCents = 1_000_000
): Promise<StrategyResult> {
  const symbol = SYM.SOL
  const bars = await getCryptoBars(symbol, '1Day', 40)

  const emptyPortfolio: StrategyResult['portfolio'] = {
    cash_cents: capitalCents,
    invested_cents: 0,
    total_value_cents: capitalCents,
    positions: [],
    exposure_pct: 0,
  }

  if (bars.length < 21) {
    return {
      agent_slug: 'sol-breakout',
      actions: [],
      skipped: true,
      portfolio: emptyPortfolio,
      signal_summary: 'SKIP - Insufficient data',
    }
  }

  const currentBB = calcBollingerBands(bars.slice(-20), 20)
  const currentBandwidth = currentBB.upper - currentBB.lower

  // Historical bandwidth for squeeze detection
  const histBandwidths: number[] = []
  for (let i = 1; i <= 20 && i < bars.length; i++) {
    const bb = calcBollingerBands(bars.slice(-20 - i, -i), 20)
    histBandwidths.push(bb.upper - bb.lower)
  }
  const avgBandwidth = histBandwidths.reduce((a, b) => a + b, 0) / histBandwidths.length
  const bandwidthRatio = currentBandwidth / avgBandwidth

  const currentPrice = bars[bars.length - 1].c
  const prevPrice = bars[bars.length - 2].c
  const squeezed = bandwidthRatio < 0.8
  const breakingOut = currentPrice > currentBB.upper && prevPrice <= currentBB.upper

  // Volume and momentum confirmation
  const vol20Avg = bars.slice(-20).reduce((sum, b) => sum + b.v, 0) / 20
  const currentVol = bars[bars.length - 1].v
  const volRatio = currentVol / (vol20Avg || 1)
  const rsi = calcRSI(bars, 14)
  const atr = calcATR(bars, 14)
  const openDayCount = 0 // Track days since entry (would need state)

  const positions = await getAgentPositions(admin, agentId)
  const pos = positions.find(p => p.symbol === symbol)
  const cash = await getAgentCash(admin, agentId, capitalCents, positions)

  const indicators = {
    bandwidth_ratio: +bandwidthRatio.toFixed(2),
    squeezed: squeezed ? 'YES' : 'NO',
    breakout: breakingOut ? 'YES' : 'NO',
    upper_band: +currentBB.upper.toFixed(2),
    middle_band: +currentBB.middle.toFixed(2),
    lower_band: +currentBB.lower.toFixed(2),
    vol_ratio: +volRatio.toFixed(2),
    rsi: +rsi.toFixed(1),
    atr: +atr.toFixed(2),
    price: +currentPrice.toFixed(2),
  }

  const actions: TradeAction[] = []
  let signalSummary = 'SQUEEZE'

  if (breakingOut && squeezed && volRatio > 1.5 && rsi > 55 && !pos && cash > 500) {
    // Entry: all conditions met
    const notional = capitalCents / 100 * 0.25 // 25% of capital
    const action = await executeBuy(admin, agentId, alpacaKey, alpacaSecret, symbol, notional, currentPrice, indicators)
    actions.push(action)
    signalSummary = `BREAKOUT - Squeeze ${bandwidthRatio.toFixed(2)}, volume ${volRatio.toFixed(2)}x, RSI ${rsi.toFixed(0)}`
  } else if (pos) {
    // Exit logic: profit target or stop loss
    const profitTarget1 = pos.avg_entry + (2 * atr)
    const profitTarget2 = pos.avg_entry + (3 * atr)
    const stopLoss = pos.avg_entry - (1.5 * atr)

    if (currentPrice > profitTarget2) {
      // Full exit at 3x ATR
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos, '3x ATR profit target', indicators)
      actions.push(action)
      signalSummary = `EXIT - 3x ATR profit target reached`
    } else if (currentPrice > profitTarget1) {
      // Partial exit at 2x ATR (would need to implement partial sell)
      actions.push({
        action: 'HOLD',
        symbol,
        reason: `2x ATR profit target (${profitTarget1.toFixed(2)}) reached - consider partial exit`,
        indicators,
      })
      signalSummary = `PARTIAL PROFIT - 2x ATR, full target at ${profitTarget2.toFixed(2)}`
    } else if (currentPrice < stopLoss) {
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos, '1.5x ATR stop loss', indicators)
      actions.push(action)
      signalSummary = `STOP LOSS - Triggered at ${stopLoss.toFixed(2)}`
    } else {
      actions.push({
        action: 'HOLD',
        symbol,
        reason: `Position +${((currentPrice - pos.avg_entry) / pos.avg_entry * 100).toFixed(2)}%, targets: ${profitTarget1.toFixed(2)} / ${profitTarget2.toFixed(2)}`,
        indicators,
      })
      signalSummary = `HOLD - Breakout trade, profit targets ahead`
    }
  }

  if (actions.length === 0) {
    actions.push({
      action: 'HOLD',
      symbol,
      reason: squeezed ? 'Squeezed, awaiting breakout' : 'No squeeze/breakout signal',
      indicators,
    })
    signalSummary = squeezed ? `SQUEEZE - Bandwidth ${bandwidthRatio.toFixed(2)}x avg` : 'NO SETUP'
  }

  const investedCents = positions.reduce((sum, p) => sum + Math.round(p.qty * p.avg_entry * 100), 0)
  const portfolio: StrategyResult['portfolio'] = {
    cash_cents: Math.max(0, capitalCents - investedCents),
    invested_cents: investedCents,
    total_value_cents: capitalCents,
    positions: positions.map(p => ({
      symbol: p.symbol,
      qty: p.qty,
      entry: p.avg_entry,
      current: currentPrice,
      pnl_pct: ((currentPrice - p.avg_entry) / p.avg_entry * 100),
    })),
    exposure_pct: (investedCents / capitalCents) * 100,
  }

  return { agent_slug: 'sol-breakout', actions, portfolio, signal_summary: signalSummary }
}

// ── STRATEGY 5: DEFI SMART BETA ROTATION ─────────────────────────────────
// Risk-adjusted momentum rotation across LINK, UNI, AAVE, AVAX
// Score: 14-day momentum / 14-day volatility (Sharpe-like ranking)
// Hold top 2 with equal weight, cap 20% each
// Rebalance: Only when ranking changes by 2+ positions (avoid whipsaw)
export async function runDefiBasket(
  admin: SupabaseClient,
  agentId: string,
  alpacaKey: string,
  alpacaSecret: string,
  capitalCents = 1_000_000
): Promise<StrategyResult> {
  const defiSymbols = [SYM.LINK, SYM.UNI, SYM.AAVE, SYM.AVAX]
  const perNotional = capitalCents / 100 * 0.20 // 20% per position max

  const emptyPortfolio: StrategyResult['portfolio'] = {
    cash_cents: capitalCents,
    invested_cents: 0,
    total_value_cents: capitalCents,
    positions: [],
    exposure_pct: 0,
  }

  const scores: { symbol: string; momentum: number; vol: number; score: number; price: number; rank: number }[] = []

  for (const sym of defiSymbols) {
    const bars = await getCryptoBars(sym, '1Day', 25)
    if (bars.length < 14) continue

    const momentum = calcMomentumScore(bars, 14)
    const vol = calcVolatility(bars, 14)
    const score = vol > 0 ? momentum / vol : 0
    const price = bars[bars.length - 1].c

    scores.push({ symbol: sym, momentum, vol, score, price, rank: 0 })
  }

  // Sort by score and assign ranks
  scores.sort((a, b) => b.score - a.score)
  scores.forEach((s, i) => { s.rank = i + 1 })

  const top2 = scores.filter(s => s.rank <= 2).map(s => s.symbol)
  const priceMap = Object.fromEntries(scores.map(s => [s.symbol, s.price]))

  const positions = await getAgentPositions(admin, agentId)
  const cash = await getAgentCash(admin, agentId, capitalCents, positions)
  const actions: TradeAction[] = []

  let signalSummary = `Top 2: ${top2.map(s => {
    const score = scores.find(sc => sc.symbol === s)
    return `${s.split('/')[0]} (${score?.score.toFixed(2)})`
  }).join(', ')}`

  // Exit positions no longer in top 2
  for (const pos of positions) {
    if (defiSymbols.includes(pos.symbol as typeof defiSymbols[number]) && !top2.includes(pos.symbol)) {
      const score = scores.find(s => s.symbol === pos.symbol)
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos,
        `Rank ${score?.rank || 'N/A'} - dropped from top 2`, {
          score: +(score?.score || 0).toFixed(2),
          momentum: +(score?.momentum || 0).toFixed(2),
          volatility: +((score?.vol ?? 0) * 100).toFixed(2),
        })
      actions.push(action)
    }
  }

  // Enter/hold top 2
  for (const sym of top2) {
    const pos = positions.find(p => p.symbol === sym)
    const score = scores.find(s => s.symbol === sym)
    if (!score) continue

    if (pos) {
      actions.push({
        action: 'HOLD',
        symbol: sym,
        reason: `Rank #${score.rank} (score ${score.score.toFixed(2)}), holding`,
        indicators: {
          rank: score.rank,
          score: +score.score.toFixed(2),
          momentum_14d: +score.momentum.toFixed(2),
        },
      })
    } else if (cash > perNotional * 100) {
      const action = await executeBuy(admin, agentId, alpacaKey, alpacaSecret, sym, perNotional, score.price, {
        rank: score.rank,
        score: +score.score.toFixed(2),
        momentum_14d: +score.momentum.toFixed(2),
        volatility_14d: +(score.vol * 100).toFixed(2),
      })
      actions.push(action)
    }
  }

  if (actions.length === 0) {
    actions.push({
      action: 'SKIP',
      symbol: 'DEFI',
      reason: 'Insufficient data or already positioned optimally',
    })
  }

  const investedCents = positions.reduce((sum, p) => sum + Math.round(p.qty * p.avg_entry * 100), 0)
  const portfolio: StrategyResult['portfolio'] = {
    cash_cents: Math.max(0, capitalCents - investedCents),
    invested_cents: investedCents,
    total_value_cents: capitalCents,
    positions: positions.map(p => {
      const score = scores.find(s => s.symbol === p.symbol)
      const price = priceMap[p.symbol] || p.avg_entry
      return {
        symbol: p.symbol,
        qty: p.qty,
        entry: p.avg_entry,
        current: price,
        pnl_pct: ((price - p.avg_entry) / p.avg_entry * 100),
      }
    }),
    exposure_pct: (investedCents / capitalCents) * 100,
  }

  return { agent_slug: 'defi-basket', actions, portfolio, signal_summary: signalSummary }
}
