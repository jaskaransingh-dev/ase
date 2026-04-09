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
import { getCryptoBars, submitOrder, waitForFill, AlpacaBar } from './market-data'

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
  {
    id: 'btc-eth-pairs',
    slug: 'btc-eth-pairs',
    name: 'BTC/ETH Pair Trading (Correlation Arbitrage)',
    description: 'Statistical pairs trading between BTC and ETH. Calculate rolling correlation and z-score of the spread ratio. Buy underperformer, sell outperformer when spread deviates >1.5 sigma. Exit when spread mean-reverts to 0. Uses 60-day rolling window. Risk max 25% per leg, -4% hard stop per position.',
    strategyType: 'crypto_momentum',
    tagline: 'Statistical pairs trading with correlation arbitrage',
    ticker: 'BEPV',
    asset: 'crypto',
  },
  {
    id: 'vol-harvester',
    slug: 'vol-harvester',
    name: 'Crypto Volatility Harvester',
    description: 'Sell volatility premium by buying after high-vol selloffs and selling into vol crushes. Track implied volatility proxy via ATR/price ratio. Buy when vol ratio spikes >2x 30-day median AND price drops >3% intraday. Sell when vol ratio returns to median. Assets: BTC, ETH, SOL. Max 20% per position, -5% hard stop.',
    strategyType: 'crypto_mean_reversion',
    tagline: 'Volatility harvesting with mean-reversion entry',
    ticker: 'VOLH',
    asset: 'crypto',
  },
  {
    id: 'momentum-carry',
    slug: 'momentum-carry',
    name: 'Crypto Momentum Carry',
    description: 'Multi-asset momentum with carry overlay. Rank BTC, ETH, SOL, AVAX, LINK by 7-day momentum. Weight top 3 by inverse volatility. Add carry bonus for assets with positive funding rate proxy. Max 30% per position, 60% total exposure.',
    strategyType: 'crypto_momentum',
    tagline: 'Momentum carry with volatility-weighted allocation',
    ticker: 'MCAR',
    asset: 'crypto',
  },
  {
    id: 'cascade-detect',
    slug: 'cascade-detect',
    name: 'Liquidation Cascade Detector',
    description: 'Detect potential liquidation cascades by monitoring rapid price drops with volume spikes. Buy the dip when BTC or ETH drops >4% in 4 hours with volume >3x average. Use tight stops. Entry: >4% drop in 4 bars with RSI < 25. Exit: 50% recovery or +8% or 48h time stop. Max 20% position, -3% hard stop.',
    strategyType: 'crypto_momentum',
    tagline: 'Liquidation cascade detection with tight risk control',
    ticker: 'LCAS',
    asset: 'crypto',
  },
  {
    id: 'defi-yield',
    slug: 'defi-yield',
    name: 'DeFi Yield Momentum',
    description: 'Track DeFi protocol tokens (AAVE, UNI, LINK, AVAX) and buy when they show positive momentum divergence from BTC. If BTC is flat/down but a DeFi token outperforms by >2%, it signals institutional accumulation. Entry: 7d return > BTC 7d return + 2% AND token RSI > 55. Exit: underperforms BTC by 1.5% over 3 days, or +12%, or -5% stop. Max 25% per token, 50% total.',
    strategyType: 'crypto_momentum',
    tagline: 'DeFi token momentum divergence detection',
    ticker: 'DYLD',
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

  const signal = calcEMA(macdLine.slice(-9).map((c) => ({ c, h: c, l: c, o: c, v: 0, t: '' })), 9)
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

  const posSum = dms.slice(-period).reduce((a, b) => a + b.up, 0)
  const negSum = dms.slice(-period).reduce((a, b) => a + b.down, 0)

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

interface PositionLot {
  qty: number
  price: number
}

function consumeLots(lots: PositionLot[], qtyToSell: number): number {
  let remaining = qtyToSell
  let consumedCost = 0

  while (remaining > 1e-8 && lots.length > 0) {
    const lot = lots[0]
    const matchedQty = Math.min(remaining, lot.qty)
    consumedCost += matchedQty * lot.price
    lot.qty -= matchedQty
    remaining -= matchedQty

    if (lot.qty <= 1e-8) {
      lots.shift()
    }
  }

  return consumedCost
}

// Get each agent's open positions from agent_trades (NOT from Alpaca)
// An open position = sum(buy qty) - sum(sell qty) > 0 for this agent+symbol
// CRITICAL: Requires indexes on agent_trades(agent_id, symbol) for performance
export async function getAgentPositions(admin: SupabaseClient, agentId: string): Promise<AgentPosition[]> {
  const { data, error } = await admin
    .from('agent_trades')
    .select('symbol, side, qty, fill_price, filled_at')
    .eq('agent_id', agentId)
    .order('filled_at', { ascending: true })

  if (error) {
    console.error('getAgentPositions error:', error)
    return []
  }

  const map: Record<string, PositionLot[]> = {}

  for (const t of data || []) {
    const sym = String(t.symbol || '').toUpperCase()
    if (!sym) continue

    if (!map[sym]) map[sym] = []

    const qty = Math.max(0, parseFloat(String(t.qty)) || 0)
    const price = Math.max(0, parseFloat(String(t.fill_price)) || 0)

    if (t.side === 'buy') {
      map[sym].push({ qty, price })
    } else if (t.side === 'sell') {
      consumeLots(map[sym], qty)
    }
  }

  return Object.entries(map)
    .map(([symbol, lots]) => {
      const netQty = lots.reduce((sum, lot) => sum + lot.qty, 0)
      const totalCost = lots.reduce((sum, lot) => sum + lot.qty * lot.price, 0)
      return {
        symbol,
        qty: Math.max(0, netQty),
        avg_entry: netQty > 0 ? totalCost / netQty : 0,
        total_cost: totalCost,
      }
    })
    .filter(p => p.qty > 0.000001)
}

// Get current holdings for an agent with live market prices
export async function getCurrentHoldings(admin: SupabaseClient, agentId: string): Promise<{
  symbol: string
  qty: number
  avg_entry: number
  current_price: number
  unrealized_pnl_cents: number
  market_value_cents: number
}[]> {
  const positions = await getAgentPositions(admin, agentId)
  
  if (positions.length === 0) return []

  // Batch fetch all current prices
  const barsPromises = positions.map(pos => getCryptoBars(pos.symbol, '1Day', 1))
  const allBars = await Promise.all(barsPromises)

  const holdings = []

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i]
    const bars = allBars[i]
    const currentPrice = bars.length > 0 ? bars[bars.length - 1].c : pos.avg_entry
    const unrealizedPnl = Math.round(pos.qty * (currentPrice - pos.avg_entry) * 100)
    const marketValue = Math.round(pos.qty * currentPrice * 100)

    holdings.push({
      symbol: pos.symbol,
      qty: pos.qty,
      avg_entry: pos.avg_entry,
      current_price: currentPrice,
      unrealized_pnl_cents: unrealizedPnl,
      market_value_cents: marketValue,
    })
  }

  return holdings
}

// Get available cash for an agent
async function getAgentCash(admin: SupabaseClient, agentId: string, capitalCents: number, positions: AgentPosition[]): Promise<number> {
  // Cash = capital - sum(position_cost_basis_in_cents)
  const investedCents = positions.reduce((sum, p) => sum + Math.round(p.qty * p.avg_entry * 100), 0)
  return Math.max(0, capitalCents - investedCents)
}

// Calculate unrealized P&L percentage for a position
function calcPositionPnL(pos: AgentPosition, currentPrice: number): number {
  if (pos.avg_entry <= 0) return 0
  return ((currentPrice - pos.avg_entry) / pos.avg_entry) * 100
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
    .select('side, qty, fill_price, filled_at')
    .eq('agent_id', agentId)
    .eq('symbol', symbol)
    .order('filled_at', { ascending: true })

  if (error) {
    console.error('calcSellPnL error:', error)
    return 0
  }

  const lots: PositionLot[] = []

  for (const trade of buys || []) {
    const qty = parseFloat(String(trade.qty)) || 0
    const price = parseFloat(String(trade.fill_price)) || 0
    if (qty <= 0 || price < 0) continue

    if (trade.side === 'buy') {
      lots.push({ qty, price })
    } else if (trade.side === 'sell') {
      consumeLots(lots, qty)
    }
  }

  const availableQty = lots.reduce((sum, lot) => sum + lot.qty, 0)
  const matchedQty = Math.min(sellQty, availableQty)
  const totalCost = consumeLots(lots, matchedQty)
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

    // CRITICAL: Only log if Alpaca actually filled the order.
    // If status is not 'filled'/'partially_filled', or filled_qty is 0,
    // the position never existed on Alpaca — cancel and skip to avoid phantom DB trades.
    const filledQtyRaw = parseFloat(filled.filled_qty || '0')
    const isFilled = (filled.status === 'filled' || filled.status === 'partially_filled') && filledQtyRaw > 0

    if (!isFilled) {
      // Cancel the pending order so it doesn't fill later unexpectedly
      try {
        const { cancelOrder } = await import('./alpaca')
        await cancelOrder(order.id, alpacaKey, alpacaSecret)
      } catch { /* best-effort cancel */ }
      console.warn(`⚠️ BUY ${symbol} order ${order.id} not filled (status: ${filled.status}, qty: ${filledQtyRaw}) — skipping DB log`)
      return { action: 'SKIP', symbol, reason: `Order not filled (status: ${filled.status})`, indicators }
    }

    const fillPrice = parseFloat(filled.filled_avg_price!)
    const filledQty = filledQtyRaw

    await logTrade(admin, {
      agentId,
      alpacaOrderId: order.id,
      symbol,
      side: 'buy',
      qty: filledQty,
      fillPrice,
      filledAt: filled.filled_at || new Date().toISOString(),
    })

    console.log(`✅ BUY ${symbol} $${notional} @ ${fillPrice} qty=${filledQty} (agent: ${agentId})`)
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
  const { symbol, qty } = pos
  const sellQty = Number(qty.toFixed(8))

  if (sellQty <= 0) {
    return { action: 'SKIP', symbol, reason: 'No sellable quantity', indicators }
  }

  try {
    const order = await submitOrder({ symbol, qty: sellQty, side: 'sell' }, alpacaKey, alpacaSecret)

    const filled = await waitForFill(order.id, alpacaKey, alpacaSecret)

    // CRITICAL: Only log if Alpaca actually filled the sell order.
    // An unfilled sell logged to DB would silently zero out the agent's position
    // in the DB while Alpaca still holds the asset — causing permanent desync.
    const filledQtyRaw = parseFloat(filled.filled_qty || '0')
    const isFilled = (filled.status === 'filled' || filled.status === 'partially_filled') && filledQtyRaw > 0

    if (!isFilled) {
      try {
        const { cancelOrder } = await import('./alpaca')
        await cancelOrder(order.id, alpacaKey, alpacaSecret)
      } catch { /* best-effort cancel */ }
      console.warn(`⚠️ SELL ${symbol} order ${order.id} not filled (status: ${filled.status}, qty: ${filledQtyRaw}) — skipping DB log`)
      return { action: 'SKIP', symbol, reason: `Sell order not filled (status: ${filled.status})`, indicators }
    }

    const fillPrice = parseFloat(filled.filled_avg_price!)
    const actualSellQty = filledQtyRaw

    const pnlCents = await calcSellPnL(admin, agentId, symbol, actualSellQty, fillPrice)

    await logTrade(admin, {
      agentId,
      alpacaOrderId: order.id,
      symbol,
      side: 'sell',
      qty: actualSellQty,
      fillPrice,
      filledAt: filled.filled_at || new Date().toISOString(),
      pnlCents,
    })

    const pnlUsd = pnlCents / 100
    console.log(`✅ SELL ${symbol} ${actualSellQty} @ ${fillPrice} | P&L: $${pnlUsd.toFixed(2)} (agent: ${agentId})`)
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
// Improved momentum with achievable entry conditions and trailing stops
// Entry: (EMA8 > EMA21 AND price > EMA50) OR (MACD histogram positive AND RSI 50-75)
// Exit: Trailing stop 2x ATR from peak, or EMA8 cross below EMA21 with negative MACD
// Hard stop: -5% from entry
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

  const ema8 = calcEMA(bars, 8)
  const ema21 = calcEMA(bars, 21)
  const ema50 = calcEMA(bars, 50)
  const macd = calcMACD(bars)
  const atr = calcATR(bars, 14)
  const rsi = calcRSI(bars, 14)
  const currentPrice = bars[bars.length - 1].c

  // Volume confirmation
  const vol20Avg = bars.slice(-20).reduce((sum, b) => sum + b.v, 0) / 20
  const currentVol = bars[bars.length - 1].v
  const volRatio = currentVol / (vol20Avg || 1)

  // Improved entry condition: more achievable
  const bullishAlignment = ema8 > ema21 && currentPrice > ema50
  const macdBullish = macd.histogram > 0 && rsi > 50 && rsi < 75
  const shouldBuy = (bullishAlignment || macdBullish)

  const positions = await getAgentPositions(admin, agentId)
  const pos = positions.find(p => p.symbol === symbol)
  const cash = await getAgentCash(admin, agentId, capitalCents, positions)

  const indicators = {
    ema8: +ema8.toFixed(2),
    ema21: +ema21.toFixed(2),
    ema50: +ema50.toFixed(2),
    macd: +macd.macd.toFixed(4),
    histogram: +macd.histogram.toFixed(4),
    rsi: +rsi.toFixed(1),
    atr: +atr.toFixed(2),
    vol_ratio: +volRatio.toFixed(2),
    price: +currentPrice.toFixed(2),
  }

  const actions: TradeAction[] = []
  let signalSummary = 'HOLD'

  // ── EXIT LEVELS ──────────────────────────────────────────────────────────
  // Defined outside the pos-check so they appear in signal_summary even when flat
  const profitTarget12 = pos ? pos.avg_entry * 1.12 : currentPrice * 1.12    // +12%
  const profitTarget20 = pos ? pos.avg_entry * 1.20 : currentPrice * 1.20    // +20%
  const atrStopBelow   = pos ? pos.avg_entry - 1.5 * atr : currentPrice - 1.5 * atr
  const hardStopLevel  = pos ? pos.avg_entry * 0.95 : currentPrice * 0.95    // -5%

  if (!pos && shouldBuy && cash > 500) {
    // Position sizing: scale fully with capital — larger AUM = larger absolute positions
    const stopDistance = Math.max(1.5 * atr, currentPrice * 0.05)
    const riskBasedSize = (capitalCents / 100) * 0.02 / (stopDistance / currentPrice)
    const maxExposure   = (capitalCents / 100) * 0.45  // up to 45% of capital
    const notional = Math.min(riskBasedSize, maxExposure, (cash / 100) * 0.45)

    if (notional > 1) {
      const action = await executeBuy(admin, agentId, alpacaKey, alpacaSecret, symbol, notional, currentPrice, indicators)
      actions.push(action)
      signalSummary = `BUY - ${bullishAlignment ? 'EMA bullish' : 'MACD hist>0'} · RSI ${rsi.toFixed(0)} · vol ${volRatio.toFixed(2)}x · size $${notional.toFixed(0)}`
    }
  } else if (pos) {
    const pnlPct     = calcPositionPnL(pos, currentPrice)
    const bearishCross = ema8 < ema21 && macd.histogram < 0
    const rsiOverbought = rsi > 74                // Overbought — momentum likely peaking
    const macdFading    = macd.histogram < 0 && pnlPct > 5  // MACD turned negative while profitable

    if (currentPrice < hardStopLevel) {
      // Hard stop -5%: protect capital immediately
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos, 'Hard stop -5%', indicators)
      actions.push(action)
      signalSummary = `SELL ▼ Hard stop −5% triggered @ ${currentPrice.toFixed(0)} (entry ${pos.avg_entry.toFixed(0)})`

    } else if (currentPrice < atrStopBelow && pnlPct < 0) {
      // ATR-based stop: 1.5×ATR below entry
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos, '1.5x ATR stop', indicators)
      actions.push(action)
      signalSummary = `SELL ▼ ATR stop triggered (1.5x ATR below entry)`

    } else if (currentPrice >= profitTarget20) {
      // +20% full profit take
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos, '+20% profit target', indicators)
      actions.push(action)
      signalSummary = `SELL ▲ +20% profit target hit @ ${currentPrice.toFixed(0)}`

    } else if (bearishCross || rsiOverbought || macdFading) {
      // Momentum deterioration exits — catch the top before it reverses
      const reason = rsiOverbought ? `RSI ${rsi.toFixed(0)} overbought` : bearishCross ? 'EMA8<EMA21 + MACD<0' : 'MACD fading in profit'
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos, reason, indicators)
      actions.push(action)
      signalSummary = `SELL ◆ Momentum fade: ${reason} · P&L ${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(1)}%`

    } else if (currentPrice >= profitTarget12 && macd.histogram < macd.macd * 0.5) {
      // +12% profit if MACD momentum is slowing (histogram < 50% of MACD line)
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos, '+12% partial: MACD slowing', indicators)
      actions.push(action)
      signalSummary = `SELL ▲ +12% target reached, MACD decelerating`

    } else {
      // Hold with detailed status
      const nextExit = currentPrice >= profitTarget12
        ? `exit at +20% ($${profitTarget20.toFixed(0)})`
        : `profit target +12% @ $${profitTarget12.toFixed(0)} (${((profitTarget12/currentPrice-1)*100).toFixed(1)}% away)`
      actions.push({ action: 'HOLD', symbol, reason: `${nextExit} · stop $${hardStopLevel.toFixed(0)}`, indicators })
      signalSummary = `HOLD · P&L ${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(2)}% · RSI ${rsi.toFixed(0)} · ${nextExit}`
    }
  }

  if (actions.length === 0) {
    // No position, no buy signal — explain what we're waiting for
    const emaGap = ((ema8 / ema21 - 1) * 100).toFixed(2)
    const waitCond = ema8 > ema21
      ? `MACD hist needs >0 (now ${macd.histogram.toFixed(4)})`
      : `EMA8 cross above EMA21 (gap ${emaGap}%)`
    actions.push({ action: 'HOLD', symbol, reason: `Waiting for: ${waitCond}`, indicators })
    signalSummary = `SCAN · Waiting: ${waitCond} · RSI ${rsi.toFixed(0)} · price $${currentPrice.toFixed(0)}`
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
      pnl_pct: calcPositionPnL(p, currentPrice),
    })),
    exposure_pct: (investedCents / capitalCents) * 100,
  }

  return { agent_slug: 'btc-momentum', actions, portfolio, signal_summary: signalSummary }
}

// ── STRATEGY 2: ETH STATISTICAL ARBITRAGE ─────────────────────────────────
// Improved mean reversion with scaled entry and active risk management
// Entry: Z-score < -1.2 AND RSI < 40 AND price < lower BB, OR Z-score < -1.5 AND RSI < 45
// Exit: Z-score > 0.3 OR RSI > 65 OR price > upper BB
// Stop: Z-score < -3.0 (extreme), or -4% hard stop
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

  const percentB = (currentPrice - bb.lower) / (bb.upper - bb.lower)

  // Improved entry conditions - more achievable
  const strongOversold = zScore < -1.2 && rsi < 40 && currentPrice < bb.lower
  const extremeOversold = zScore < -1.5 && rsi < 45
  const shouldBuy = strongOversold || extremeOversold

  // Improved exit conditions
  const shouldSell = zScore > 0.3 || rsi > 65 || currentPrice > bb.upper

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

  // Aggressive take-profit when position is held
  const profitTarget8   = pos ? pos.avg_entry * 1.08  : 0  // +8% quick take
  const profitTarget15  = pos ? pos.avg_entry * 1.15  : 0  // +15% full take

  if (pos) {
    const pnlPct    = calcPositionPnL(pos, currentPrice)
    const hardStop  = pos.avg_entry * 0.96   // -4% hard stop
    const extremeMove = zScore < -3.0        // price deviated to extreme — something broke

    if (currentPrice < hardStop || extremeMove) {
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos,
        extremeMove ? 'Z-score <-3.0 extreme deviation' : 'Hard stop -4%', indicators)
      actions.push(action)
      signalSummary = `SELL ▼ ${extremeMove ? 'Extreme move Z<-3' : 'Hard stop −4%'} · P&L ${pnlPct.toFixed(1)}%`

    } else if (currentPrice >= profitTarget15) {
      // Mean reverted past +15% — close entirely
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos, '+15% take profit', indicators)
      actions.push(action)
      signalSummary = `SELL ▲ +15% profit target hit · Z-score ${zScore.toFixed(2)}`

    } else if (shouldSell) {
      // Mean reversion confirmed (z>0.3 or RSI>65 or above upper BB)
      const exitReason = zScore > 0.3 ? `Z-score reverted to ${zScore.toFixed(2)}` :
                         rsi > 65 ? `RSI overbought ${rsi.toFixed(0)}` : 'Price crossed upper BB'
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos, exitReason, indicators)
      actions.push(action)
      signalSummary = `SELL ◆ Mean reverted: ${exitReason} · P&L ${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(1)}%`

    } else if (currentPrice >= profitTarget8 && zScore > 0) {
      // +8% with z-score neutral — early exit if reversion is done
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos, '+8% quick exit: Z neutral', indicators)
      actions.push(action)
      signalSummary = `SELL ▲ +8% quick take · Z-score neutral (${zScore.toFixed(2)})`

    } else {
      // Still below mean — hold position, track progress
      const distToTarget = ((profitTarget8 / currentPrice - 1) * 100).toFixed(1)
      actions.push({ action: 'HOLD', symbol, reason: `Z=${zScore.toFixed(2)} reverting, exit at Z>0.3 or +8%`, indicators })
      signalSummary = `HOLD · Z-score ${zScore.toFixed(2)} → target >0.3 · P&L ${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(2)}% · +${distToTarget}% to 8% target`
    }
  } else if (shouldBuy && cash > 500) {
    // Scale position size by z-score magnitude — larger deviation = larger position
    const zMagnitude    = Math.abs(zScore)
    let sizeMultiplier  = 0.18  // Base 18% at z=-1.2
    if (zMagnitude >= 1.5 && zMagnitude < 2.0) sizeMultiplier = 0.25
    if (zMagnitude >= 2.0) sizeMultiplier = 0.35  // Strong oversold = max size

    const notional = Math.min((capitalCents / 100) * sizeMultiplier, (cash / 100) * 0.35)

    if (notional > 1) {
      const action = await executeBuy(admin, agentId, alpacaKey, alpacaSecret, symbol, notional, currentPrice, indicators)
      actions.push(action)
      signalSummary = `BUY ▲ Z-score ${zScore.toFixed(2)} oversold · size ${(sizeMultiplier * 100).toFixed(0)}% · $${notional.toFixed(0)}`
    }
  }

  if (actions.length === 0) {
    const waitCond = shouldBuy
      ? `Z-score ${zScore.toFixed(2)} oversold (need <-1.2)`
      : `Z-score ${zScore.toFixed(2)} neutral (need <-1.2 to buy, >0.3 to sell)`
    actions.push({ action: 'HOLD', symbol, reason: waitCond, indicators })
    signalSummary = `SCAN · Z-score ${zScore.toFixed(2)} (need <-1.2) · RSI ${rsi.toFixed(0)} · %B ${(percentB*100).toFixed(0)}%`
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
      pnl_pct: calcPositionPnL(p, currentPrice),
    })),
    exposure_pct: (investedCents / capitalCents) * 100,
  }

  return { agent_slug: 'eth-mean-revert', actions, portfolio, signal_summary: signalSummary }
}

// ── STRATEGY 3: CRYPTO TREND SYSTEM ────────────────────────────────────────
export async function runCryptoTrend(
  admin: SupabaseClient,
  agentId: string,
  alpacaKey: string,
  alpacaSecret: string,
  capitalCents = 1_000_000
): Promise<StrategyResult> {
  const symbols = [SYM.BTC, SYM.ETH, SYM.SOL]

  const emptyPortfolio: StrategyResult['portfolio'] = {
    cash_cents: capitalCents,
    invested_cents: 0,
    total_value_cents: capitalCents,
    positions: [],
    exposure_pct: 0,
  }

  const positions = await getAgentPositions(admin, agentId)
  const cash = await getAgentCash(admin, agentId, capitalCents, positions)

  const actions: TradeAction[] = []
  const trendScores: { symbol: string; adx: number; trending: boolean; vol: number; price: number; ema10: number; ema30: number; ema50: number }[] = []

  // Batch fetch all bars to reduce subrequests
  const barsPromises = symbols.map(symbol => getCryptoBars(symbol, '1Day', 50))
  const allBars = await Promise.all(barsPromises)

  // Collect indicators for all symbols
  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i]
    const bars = allBars[i]
    if (bars.length < 31) {
      actions.push({ action: 'SKIP', symbol, reason: 'Insufficient data' })
      continue
    }

    const ema10 = calcEMA(bars, 10)
    const ema30 = calcEMA(bars, 30)
    const ema50 = calcEMA(bars, 50)
    const adx = calcADX(bars, 14)
    const vol = calcVolatility(bars, 14)
    const currentPrice = bars[bars.length - 1].c

    // Improved trending condition: lower ADX threshold
    const trending = ema10 > ema30 && (adx > 20 || currentPrice > ema50)
    trendScores.push({ symbol, adx, trending, vol, price: currentPrice, ema10, ema30, ema50 })
  }

  // Inverse volatility weighting for trending assets
  const trendingAssets = trendScores.filter(s => s.trending)
  const totalInvVol = trendingAssets.reduce((sum, s) => sum + (1 / (s.vol || 0.01)), 0)
  const allocations = Object.fromEntries(
    trendingAssets.map(s => [s.symbol, (1 / (s.vol || 0.01)) / totalInvVol])
  )

  const maxTotalExposure = capitalCents / 100 * 0.50 // 50% total max
  const maxPerAsset = capitalCents / 100 * 0.20 // 20% per asset max

  let portfolioPnLPct = 0
  for (const pos of positions) {
    const score = trendScores.find(s => s.symbol === pos.symbol)
    if (score) {
      portfolioPnLPct += calcPositionPnL(pos, score.price)
    }
  }

  // Exit non-trending positions
  for (const pos of positions) {
    if (symbols.includes(pos.symbol as typeof symbols[number]) && !trendingAssets.some(s => s.symbol === pos.symbol)) {
      const ts = trendScores.find(s => s.symbol === pos.symbol)
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos,
        ts ? `ADX ${ts.adx.toFixed(1)} or EMA bearish` : 'Trend ended', {})
      actions.push(action)
    }
  }

  // Enter trending positions
  for (const asset of trendingAssets) {
    const pos = positions.find(p => p.symbol === asset.symbol)
    const alloc = allocations[asset.symbol] || 0
    const notional = Math.min(maxTotalExposure * alloc, maxPerAsset, (cash / 100) * 0.20)

    if (pos) {
      const pnlPct = calcPositionPnL(pos, asset.price)
      const hardStop = pos.avg_entry * 0.94 // -6% hard stop
      const symbolIndex = symbols.indexOf(asset.symbol as typeof symbols[number])
      const atr = calcATR(symbolIndex >= 0 ? allBars[symbolIndex] : [], 14)
      const trailingStopMultiplier = portfolioPnLPct > 10 ? 1.5 : 3 // Tighten stops when winning

      if (asset.ema10 < asset.ema30 || asset.adx < 15) {
        // Trend ended
        const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos, 'Trend ended', {
          ema10: +asset.ema10.toFixed(2),
          ema30: +asset.ema30.toFixed(2),
          adx: +asset.adx.toFixed(1),
        })
        actions.push(action)
      } else if (asset.price < hardStop || pnlPct < -6) {
        // Hard stops
        const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos, 'Hard stop -6%', {})
        actions.push(action)
      } else {
        const distToProfit = ((pos.avg_entry * 1.08 / asset.price - 1) * 100).toFixed(1)
        actions.push({
          action: 'HOLD',
          symbol: asset.symbol,
          reason: `Trend confirmed, P&L ${pnlPct.toFixed(2)}%, +${distToProfit}% to +8% target`,
          indicators: { adx: +asset.adx.toFixed(1), ema_ratio: +(asset.ema10 / asset.ema30).toFixed(3) },
        })
      }
    } else if (notional > 1 && cash > notional * 100) {
      // Enter new position
      const indicators = {
        ema10_ema30: 'bullish',
        adx: +asset.adx.toFixed(1),
        volatility: +(asset.vol * 100).toFixed(2),
        allocation: +(alloc * 100).toFixed(1),
      }
      const action = await executeBuy(admin, agentId, alpacaKey, alpacaSecret, asset.symbol, notional, asset.price, indicators)
      actions.push(action)
    }
  }

  if (actions.length === 0) {
    const bestCandidate = trendScores.sort((a, b) => (b.ema10/b.ema30) - (a.ema10/a.ema30))[0]
    const gapToTrend = bestCandidate
      ? `Waiting: ${bestCandidate.symbol.split('/')[0]} EMA10/30 gap ${((bestCandidate.ema10/bestCandidate.ema30-1)*100).toFixed(2)}% (need >0)`
      : 'No trending setups'
    actions.push({ action: 'HOLD', symbol: 'CRYPTO', reason: gapToTrend })
  }

  const investedCents = positions.reduce((sum, p) => sum + Math.round(p.qty * p.avg_entry * 100), 0)
  const portfolio: StrategyResult['portfolio'] = {
    cash_cents: Math.max(0, capitalCents - investedCents),
    invested_cents: investedCents,
    total_value_cents: capitalCents,
    positions: positions.map(p => {
      const score = trendScores.find(s => s.symbol === p.symbol)
      const price = score?.price || p.avg_entry
      return {
        symbol: p.symbol,
        qty: p.qty,
        entry: p.avg_entry,
        current: price,
        pnl_pct: calcPositionPnL(p, price),
      }
    }),
    exposure_pct: (investedCents / capitalCents) * 100,
  }

  const trendingCount = trendScores.filter(s => s.trending).length
  const signalSummary = actions.length > 0 
    ? `TREND · ${trendingCount} trending · ${trendScores.filter(s => s.trending).map(s => `${s.symbol.split('/')[0]} ADX${s.adx.toFixed(0)} ${s.ema10 > s.ema30 ? '▲' : '▼'}${((s.ema10/s.ema30-1)*100).toFixed(1)}%`).join(' · ')}`
    : `SCAN · No trending setups · Best: ${trendScores.sort((a, b) => (b.ema10/b.ema30) - (a.ema10/a.ema30))[0]?.symbol.split('/')[0]} ADX${trendScores[0]?.adx.toFixed(0)}`

  return { agent_slug: 'crypto-trend', actions, portfolio, signal_summary: signalSummary }
}

// ── STRATEGY 4: SOL BREAKOUT ─────────────────────────────────────────────────
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

  if (bars.length < 20) {
    return {
      agent_slug: 'sol-breakout',
      actions: [],
      skipped: true,
      portfolio: emptyPortfolio,
      signal_summary: 'SKIP - Insufficient data',
    }
  }

  const bb = calcBollingerBands(bars, 20)
  const currentPrice = bars[bars.length - 1].c
  const rsi = calcRSI(bars, 14)
  const atr = calcATR(bars, 14)
  const vol20Avg = bars.slice(-20).reduce((sum, b) => sum + b.v, 0) / 20
  const currentVol = bars[bars.length - 1].v
  const volRatio = currentVol / (vol20Avg || 1)

  // Detect squeeze: Bollinger Band width < 20% of price
  const bbWidth = (bb.upper - bb.lower) / currentPrice
  const squeezeRecent = bbWidth < 0.2

  // Breakout condition: price above upper band with volume confirmation
  const breakingOut = currentPrice > bb.upper
  const indicators = {
    squeeze_recent_5d: squeezeRecent ? 'YES' : 'NO',
    breakout: breakingOut ? 'YES' : 'NO',
    upper_band: +bb.upper.toFixed(2),
    lower_band: +bb.lower.toFixed(2),
    vol_ratio: +volRatio.toFixed(2),
    rsi: +rsi.toFixed(1),
    atr: +atr.toFixed(2),
    price: +currentPrice.toFixed(2),
  }

  const actions: TradeAction[] = []
  let signalSummary = 'WATCHING'

  const positions = await getAgentPositions(admin, agentId)
  const cash = await getAgentCash(admin, agentId, capitalCents, positions)
  const pos = positions.find(p => p.symbol === symbol)

  if (!pos && breakingOut && (squeezeRecent || volRatio > 2) && rsi > 50 && cash > 500) {
    // Entry: all conditions met
    const notional = capitalCents / 100 * 0.30 // 30% of capital
    const action = await executeBuy(admin, agentId, alpacaKey, alpacaSecret, symbol, notional, currentPrice, indicators)
    actions.push(action)
    signalSummary = `BUY ▲ Breakout: ${squeezeRecent ? 'squeeze release' : 'vol surge'} · RSI ${rsi.toFixed(0)} · vol ${volRatio.toFixed(1)}x`
  } else if (pos) {
    const pnlPct = calcPositionPnL(pos, currentPrice)
    const profit2xTarget = pos.avg_entry + (2 * atr)
    const profit3xTarget = pos.avg_entry + (3 * atr)
    const stopLoss = pos.avg_entry - (1.5 * atr)
    const hardStop = pos.avg_entry * 0.94 // -6% hard stop

    if (currentPrice < hardStop || pnlPct < -6) {
      // Hard stop loss
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos, '-6% hard stop', indicators)
      actions.push(action)
      signalSummary = `SELL ▼ Hard stop −6% @ ${currentPrice.toFixed(2)} · entry $${pos.avg_entry.toFixed(2)}`
    } else if (currentPrice > profit3xTarget && pnlPct > 0) {
      // Full exit at 3x ATR
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos, '3x ATR full exit', indicators)
      actions.push(action)
      signalSummary = `SELL ▲ 3x ATR target hit · P&L +${pnlPct.toFixed(2)}%`
    } else if (currentPrice > profit2xTarget && pnlPct > 0) {
      // Partial exit at 2x ATR (sell 50% of position)
      const halfQty = Math.floor((pos.qty / 2) * 1e6) / 1e6
      if (halfQty > 0.000001) {
        try {
          const order = await submitOrder({ symbol, qty: halfQty, side: 'sell' }, alpacaKey, alpacaSecret)
          const filled = await waitForFill(order.id, alpacaKey, alpacaSecret)
          const fillPrice = filled.filled_avg_price ? parseFloat(filled.filled_avg_price) : currentPrice
          const pnlCents = await calcSellPnL(admin, agentId, symbol, halfQty, fillPrice)
          
          await logTrade(admin, {
            agentId,
            alpacaOrderId: order.id,
            symbol,
            side: 'sell',
            qty: halfQty,
            fillPrice,
            filledAt: filled.filled_at || new Date().toISOString(),
            pnlCents,
          })
          
          const pnlUsd = pnlCents / 100
          console.log(`✅ PARTIAL SELL ${symbol} ${halfQty} @ ${fillPrice} | P&L: $${pnlUsd.toFixed(2)}`)
          actions.push({
            action: 'SELL',
            symbol,
            qty: halfQty,
            fill_price: fillPrice,
            alpaca_order_id: order.id,
            pnl_cents: pnlCents,
            reason: '2x ATR partial exit (50%)',
            indicators,
          })
          signalSummary = `SELL ○ 2x ATR partial (50%) · P&L +${pnlPct.toFixed(2)}%`
        } catch { /* ignore sell errors */ }
      }
    } else if (currentPrice < stopLoss) {
      // Stop loss
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos, '1.5x ATR stop', indicators)
      actions.push(action)
      signalSummary = `SELL ▼ ATR stop triggered @ ${currentPrice.toFixed(2)}`
    } else {
      // Hold position
      const distTo2x = ((profit2xTarget / currentPrice - 1) * 100).toFixed(1)
      const distTo3x = ((profit3xTarget / currentPrice - 1) * 100).toFixed(1)
      actions.push({
        action: 'HOLD',
        symbol,
        reason: `2x ATR profit target (${profit2xTarget.toFixed(2)}), full exit at 3x ATR`,
        indicators,
      })
      signalSummary = `HOLD · targeting 2x ATR @ $${profit2xTarget.toFixed(2)} · P&L ${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(2)}%`
    }
  } else {
    // No position, no setup
    actions.push({ action: 'HOLD', symbol, reason: 'No setup', indicators })
    signalSummary = `SCAN · Waiting: price above BB $${bb.upper.toFixed(2)} (+${((bb.upper/currentPrice-1)*100).toFixed(2)}%) · RSI ${rsi.toFixed(0)} · BB bandwidth ${(bbWidth*100).toFixed(1)}%`
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
      pnl_pct: calcPositionPnL(p, currentPrice),
    })),
    exposure_pct: (investedCents / capitalCents) * 100,
  }

  return { agent_slug: 'sol-breakout', actions, portfolio, signal_summary: signalSummary }
}

// ── STRATEGY 5: DEFI SMART BETA ROTATION ─────────────────────────────────────
export async function runDefiBasket(
  admin: SupabaseClient,
  agentId: string,
  alpacaKey: string,
  alpacaSecret: string,
  capitalCents = 1_000_000
): Promise<StrategyResult> {
  const defiSymbols = [SYM.LINK, SYM.UNI, SYM.AAVE, SYM.AVAX]

  const emptyPortfolio: StrategyResult['portfolio'] = {
    cash_cents: capitalCents,
    invested_cents: 0,
    total_value_cents: capitalCents,
    positions: [],
    exposure_pct: 0,
  }

  const positions = await getAgentPositions(admin, agentId)
  const cash = await getAgentCash(admin, agentId, capitalCents, positions)

  const scores: { symbol: string; momentum: number; vol: number; score: number; price: number; rank: number }[] = []

  // Batch fetch all DeFi symbol bars
  const barsPromises = defiSymbols.map(sym => getCryptoBars(sym, '1Day', 25))
  const allBars = await Promise.all(barsPromises)

  for (let i = 0; i < defiSymbols.length; i++) {
    const sym = defiSymbols[i]
    const bars = allBars[i]
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
  const allNegative = scores.every(s => s.score < 0)

  const actions: TradeAction[] = []

  // Exit positions not in top 2
  for (const pos of positions) {
    if (!top2.includes(pos.symbol)) {
      const currentPrice = priceMap[pos.symbol] || pos.avg_entry
      const pnlPct = calcPositionPnL(pos, currentPrice)
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos, `Not in top 2 (rank ${scores.find(s => s.symbol === pos.symbol)?.rank || 'N/A'})`, {})
      actions.push(action)
    }
  }

  // Enter top 2 positions (if not all negative momentum)
  if (!allNegative && top2.length > 0) {
    const maxPerPosition = capitalCents / 100 * 0.20 // 20% max per position
    
    for (const symbol of top2) {
      const pos = positions.find(p => p.symbol === symbol)
      if (!pos && cash > maxPerPosition) {
        const price = priceMap[symbol]
        const score = scores.find(s => s.symbol === symbol)
        const action = await executeBuy(admin, agentId, alpacaKey, alpacaSecret, symbol, maxPerPosition, price, {
          score: +(score?.score || 0).toFixed(4),
          momentum: +(score?.momentum || 0).toFixed(2),
          volatility: +(score?.vol || 0).toFixed(2),
        })
        actions.push(action)
      }
    }
  }

  if (actions.length === 0) {
    const topScore = scores[0]
    actions.push({ 
      action: 'HOLD', 
      symbol: 'DEFI', 
      reason: allNegative ? 'All negative momentum' : `Holding top 2: ${top2.join(', ')}`
    })
  }

  const investedCents = positions.reduce((sum, p) => sum + Math.round(p.qty * p.avg_entry * 100), 0)
  const portfolio: StrategyResult['portfolio'] = {
    cash_cents: Math.max(0, capitalCents - investedCents),
    invested_cents: investedCents,
    total_value_cents: capitalCents,
    positions: positions.map(p => {
      const currentPrice = priceMap[p.symbol] || p.avg_entry
      return {
        symbol: p.symbol,
        qty: p.qty,
        entry: p.avg_entry,
        current: currentPrice,
        pnl_pct: calcPositionPnL(p, currentPrice),
      }
    }),
    exposure_pct: (investedCents / capitalCents) * 100,
  }

  const signalSummary = actions.length > 0
    ? `REBALANCE · Top 2: ${top2.join(', ')} · Scores: ${top2.map(s => `${scores.find(sc => sc.symbol === s)?.score.toFixed(3) || '0'}`).join(', ')}`
    : `HOLD · Current: ${positions.map(p => p.symbol).join(', ')} · Best: ${scores[0]?.symbol} (score ${scores[0]?.score.toFixed(3)})`

  return { agent_slug: 'defi-basket', actions, portfolio, signal_summary: signalSummary }
}

// ... (rest of the code remains the same)

// ── STRATEGY 6: BTC/ETH PAIRS TRADING (CORRELATION ARBITRAGE) ─────────────
// Statistical pairs trading between BTC and ETH using spread z-score
// Entry: Spread z-score > 1.5 or < -1.5, go long on underperformer
// Exit: Spread z-score crosses 0 or hard stop at 3 sigma
// Risk: Max 25% per leg, -4% hard stop per position
export async function runBtcEthPairs(
  admin: SupabaseClient,
  agentId: string,
  alpacaKey: string,
  alpacaSecret: string,
  capitalCents = 1_000_000
): Promise<StrategyResult> {
  const symbols = [SYM.BTC, SYM.ETH]
  const bars = await Promise.all([
    getCryptoBars(SYM.BTC, '1Day', 60),
    getCryptoBars(SYM.ETH, '1Day', 60),
  ])
  const btcBars = bars[0]
  const ethBars = bars[1]

  const emptyPortfolio: StrategyResult['portfolio'] = {
    cash_cents: capitalCents,
    invested_cents: 0,
    total_value_cents: capitalCents,
    positions: [],
    exposure_pct: 0,
  }

  if (btcBars.length < 60 || ethBars.length < 60) {
    return {
      agent_slug: 'btc-eth-pairs',
      actions: [],
      skipped: true,
      portfolio: emptyPortfolio,
      signal_summary: 'SKIP - Insufficient historical data',
    }
  }

  // Calculate spread ratio and z-score
  const spreadRatios = btcBars.map((b, i) => b.c / (ethBars[i]?.c || 1))
  const recentSpreads = spreadRatios.slice(-60)
  const meanSpread = recentSpreads.reduce((a, b) => a + b, 0) / recentSpreads.length
  const variance = recentSpreads.reduce((a, b) => a + Math.pow(b - meanSpread, 2), 0) / recentSpreads.length
  const stdDev = Math.sqrt(variance)
  const currentSpread = spreadRatios[spreadRatios.length - 1]
  const spreadZScore = stdDev > 0 ? (currentSpread - meanSpread) / stdDev : 0

  const btcPrice = btcBars[btcBars.length - 1].c
  const ethPrice = ethBars[ethBars.length - 1].c
  const btcAtr = calcATR(btcBars, 14)
  const ethAtr = calcATR(ethBars, 14)

  const positions = await getAgentPositions(admin, agentId)
  const btcPos = positions.find(p => p.symbol === SYM.BTC)
  const ethPos = positions.find(p => p.symbol === SYM.ETH)
  const cash = await getAgentCash(admin, agentId, capitalCents, positions)

  const indicators = {
    spread_zscore: +spreadZScore.toFixed(3),
    current_spread: +currentSpread.toFixed(4),
    mean_spread: +meanSpread.toFixed(4),
    btc_price: +btcPrice.toFixed(2),
    eth_price: +ethPrice.toFixed(2),
    spread_std_dev: +stdDev.toFixed(4),
  }

  const actions: TradeAction[] = []
  let signalSummary = 'NEUTRAL'

  // Entry: Spread deviation >1.5 sigma
  const strongDeviation = Math.abs(spreadZScore) > 1.5
  const extremeDeviation = Math.abs(spreadZScore) > 3.0
  const meanReverted = spreadZScore > -0.5 && spreadZScore < 0.5

  if (extremeDeviation && (btcPos || ethPos)) {
    // Hard stop at 3 sigma deviation
    if (btcPos) {
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, btcPos, 'Hard stop: 3 sigma deviation', indicators)
      actions.push(action)
    }
    if (ethPos) {
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, ethPos, 'Hard stop: 3 sigma deviation', indicators)
      actions.push(action)
    }
    signalSummary = `SELL ▼ Hard stop at 3σ deviation (z=${spreadZScore.toFixed(2)})`
  } else if (meanReverted && (btcPos || ethPos)) {
    // Exit when mean-reverted
    if (btcPos) {
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, btcPos, 'Mean reversion: spread normalized', indicators)
      actions.push(action)
    }
    if (ethPos) {
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, ethPos, 'Mean reversion: spread normalized', indicators)
      actions.push(action)
    }
    signalSummary = `SELL ◆ Mean reverted (z=${spreadZScore.toFixed(2)} → 0)`
  } else if (btcPos || ethPos) {
    // Check hard stops on individual positions
    const btcHardStop = btcPos && btcPrice < btcPos.avg_entry * 0.96
    const ethHardStop = ethPos && ethPrice < ethPos.avg_entry * 0.96

    if (btcHardStop) {
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, btcPos!, 'Hard stop -4%', indicators)
      actions.push(action)
    }
    if (ethHardStop) {
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, ethPos!, 'Hard stop -4%', indicators)
      actions.push(action)
    }

    if (actions.length === 0) {
      const btcPnl = btcPos ? calcPositionPnL(btcPos, btcPrice) : 0
      const ethPnl = ethPos ? calcPositionPnL(ethPos, ethPrice) : 0
      actions.push({
        action: 'HOLD',
        symbol: 'BTC/ETH',
        reason: `Holding pairs: z=${spreadZScore.toFixed(2)}, awaiting mean reversion`,
        indicators,
      })
      signalSummary = `HOLD · Spread z=${spreadZScore.toFixed(2)} · BTC P&L ${btcPnl > 0 ? '+' : ''}${btcPnl.toFixed(1)}% · ETH P&L ${ethPnl > 0 ? '+' : ''}${ethPnl.toFixed(1)}%`
    }
  } else if (strongDeviation && cash > 500) {
    // Entry: Buy the underperformer based on spread deviation
    const positionSize = (capitalCents / 100) * 0.25 / 2 // 25% per leg = 12.5% each
    const scaledNotional = Math.min(positionSize, (cash / 100) * 0.25)

    if (spreadZScore > 1.5) {
      // BTC spread too high, buy ETH (underperformer)
      if (scaledNotional > 1) {
        const action = await executeBuy(admin, agentId, alpacaKey, alpacaSecret, SYM.ETH, scaledNotional, ethPrice, indicators)
        actions.push(action)
        signalSummary = `BUY ETH ▲ Spread z=${spreadZScore.toFixed(2)} (BTC overperforming) · $${scaledNotional.toFixed(0)}`
      }
    } else if (spreadZScore < -1.5) {
      // ETH spread too high, buy BTC (underperformer)
      if (scaledNotional > 1) {
        const action = await executeBuy(admin, agentId, alpacaKey, alpacaSecret, SYM.BTC, scaledNotional, btcPrice, indicators)
        actions.push(action)
        signalSummary = `BUY BTC ▲ Spread z=${spreadZScore.toFixed(2)} (ETH overperforming) · $${scaledNotional.toFixed(0)}`
      }
    }
  }

  if (actions.length === 0) {
    const waitMsg = strongDeviation
      ? `entering at next signal (current z=${spreadZScore.toFixed(2)})`
      : `waiting for deviation >1.5σ (current z=${spreadZScore.toFixed(2)})`
    actions.push({
      action: 'HOLD',
      symbol: 'BTC/ETH',
      reason: `Pairs monitor: ${waitMsg}`,
      indicators,
    })
    signalSummary = `SCAN · Spread z=${spreadZScore.toFixed(2)} (target >1.5) · BTC ${btcPrice.toFixed(0)} · ETH ${ethPrice.toFixed(0)}`
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
      current: p.symbol === SYM.BTC ? btcPrice : ethPrice,
      pnl_pct: calcPositionPnL(p, p.symbol === SYM.BTC ? btcPrice : ethPrice),
    })),
    exposure_pct: (investedCents / capitalCents) * 100,
  }

  return { agent_slug: 'btc-eth-pairs', actions, portfolio, signal_summary: signalSummary }
}

// ... (rest of the code remains the same)

// ── STRATEGY 7: CRYPTO VOLATILITY HARVESTER ────────────────────────────────
// Sell volatility premium: buy after high-vol selloffs, sell into vol crushes
// Assets: BTC, ETH, SOL
// Entry: Vol ratio > 2x median AND RSI < 35
// Exit: Vol ratio < 1.2x median OR +10% profit
// Risk: Max 20% per position, -5% hard stop
export async function runVolHarvester(
  admin: SupabaseClient,
  agentId: string,
  alpacaKey: string,
  alpacaSecret: string,
  capitalCents = 1_000_000
): Promise<StrategyResult> {
  const symbols = [SYM.BTC, SYM.ETH, SYM.SOL]

  const positions = await getAgentPositions(admin, agentId)
  const cash = await getAgentCash(admin, agentId, capitalCents, positions)

  const actions: TradeAction[] = []
  const volScores: { symbol: string; volRatio: number; rsi: number; atr: number; price: number }[] = []

  // Batch fetch all symbol bars
  const barsPromises = symbols.map(symbol => getCryptoBars(symbol, '1Day', 60))
  const allBars = await Promise.all(barsPromises)

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i]
    const bars = allBars[i]

    if (bars.length < 30) continue

    const currentPrice = bars[bars.length - 1].c
    const currentAtr = calcATR(bars, 14)
    const rsi = calcRSI(bars, 14)

    // Vol ratio proxy: ATR / price (normalized volatility)
    const atrRatios = bars.map(b => calcATR([b], 1) / b.c)
    const medianVolRatio = atrRatios.slice(-30).sort((a, b) => a - b)[15]
    const currentVolRatio = currentAtr / currentPrice

    volScores.push({
      symbol,
      volRatio: currentVolRatio / (medianVolRatio || currentVolRatio),
      rsi,
      atr: currentAtr,
      price: currentPrice,
    })
  }

  let signalSummary = 'NEUTRAL'

  // Process existing positions for exit
  const symbolSet = new Set(symbols)
  for (const pos of positions) {
    if (!symbolSet.has(pos.symbol as any)) continue
    const score = volScores.find(s => s.symbol === pos.symbol)
    if (!score) continue

    const currentPrice = score.price
    const pnlPct = calcPositionPnL(pos, currentPrice)
    const hardStop = pos.avg_entry * 0.95
    const profitTarget = pos.avg_entry * 1.10

    if (currentPrice < hardStop) {
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos, 'Hard stop -5%', {
        vol_ratio: score.volRatio.toFixed(2),
        rsi: score.rsi.toFixed(1),
      })
      actions.push(action)
      signalSummary = `SELL ▼ Hard stop −5% on ${pos.symbol.split('/')[0]} · P&L ${pnlPct.toFixed(1)}%`
    } else if (currentPrice >= profitTarget || score.volRatio < 1.2) {
      const reason = currentPrice >= profitTarget ? '+10% profit' : 'Vol ratio crushed to 1.2x'
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos, reason, {
        vol_ratio: score.volRatio.toFixed(2),
        rsi: score.rsi.toFixed(1),
      })
      actions.push(action)
      signalSummary = `SELL ◆ ${reason} on ${pos.symbol.split('/')[0]} · P&L ${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(1)}%`
    }
  }

  // Enter new positions on vol spikes + selloffs
  for (const score of volScores) {
    const pos = positions.find(p => p.symbol === score.symbol)
    if (pos) continue // Already holding

    if (score.volRatio > 2.0 && score.rsi < 35 && cash > 100) {
      const positionSize = (capitalCents / 100) * 0.20
      const notional = Math.min(positionSize, (cash / 100) * 0.20)

      if (notional > 1) {
        const action = await executeBuy(admin, agentId, alpacaKey, alpacaSecret, score.symbol, notional, score.price, {
          vol_ratio: score.volRatio.toFixed(2),
          rsi: score.rsi.toFixed(1),
        })
        actions.push(action)
        signalSummary = `BUY ▲ Vol spike 2x median, RSI ${score.rsi.toFixed(0)} on ${score.symbol.split('/')[0]} · $${notional.toFixed(0)}`
      }
    }
  }

  if (actions.length === 0) {
    const topScore = volScores.sort((a, b) => b.volRatio - a.volRatio)[0]
    if (topScore) {
      actions.push({
        action: 'HOLD',
        symbol: 'VOLH',
        reason: `Monitoring vol across BTC/ETH/SOL, best: ${topScore.symbol.split('/')[0]} vol=${topScore.volRatio.toFixed(2)}x`,
      })
      signalSummary = `SCAN · Vol harvester ready · Best: ${topScore.symbol.split('/')[0]} vol ${topScore.volRatio.toFixed(2)}x median (need >2x)`
    }
  }

  const investedCents = positions.reduce((sum, p) => sum + Math.round(p.qty * p.avg_entry * 100), 0)
  const portfolio: StrategyResult['portfolio'] = {
    cash_cents: Math.max(0, capitalCents - investedCents),
    invested_cents: investedCents,
    total_value_cents: capitalCents,
    positions: positions.map(p => {
      const volScore = volScores.find(s => s.symbol === p.symbol)
      const price = volScore?.price || p.avg_entry
      return {
        symbol: p.symbol,
        qty: p.qty,
        entry: p.avg_entry,
        current: price,
        pnl_pct: calcPositionPnL(p, price),
      }
    }),
    exposure_pct: (investedCents / capitalCents) * 100,
  }

  return { agent_slug: 'vol-harvester', actions, portfolio, signal_summary: signalSummary }
}

// ... (rest of the code remains the same)

// ── STRATEGY 8: CRYPTO MOMENTUM CARRY ──────────────────────────────────────
// Multi-asset momentum with carry overlay
// Rank BTC, ETH, SOL, AVAX, LINK by 7-day momentum
// Weight top 3 by inverse volatility, add carry bonus for strong assets
// Entry: Top 3 by adjusted score, positive momentum
// Exit: Falls out of top 3, or -4% per position
// Risk: Max 30% per position, 60% total exposure
export async function runMomentumCarry(
  admin: SupabaseClient,
  agentId: string,
  alpacaKey: string,
  alpacaSecret: string,
  capitalCents = 1_000_000
): Promise<StrategyResult> {
  const symbols = [SYM.BTC, SYM.ETH, SYM.SOL, SYM.AVAX, SYM.LINK]

  const positions = await getAgentPositions(admin, agentId)
  const cash = await getAgentCash(admin, agentId, capitalCents, positions)

  const scores: { symbol: string; momentum: number; volatility: number; score: number; price: number; vwap24h: number; rank: number }[] = []

  // Batch fetch all symbol bars
  const barsPromises = symbols.map(symbol => getCryptoBars(symbol, '1Day', 30))
  const allBars = await Promise.all(barsPromises)

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i]
    const bars = allBars[i]
    if (bars.length < 8) continue

    const currentPrice = bars[bars.length - 1].c
    const momentum7d = calcMomentumScore(bars, 7) // 7-day momentum %
    const vol = calcVolatility(bars, 14)
    const vwap = calcVWAP(bars.slice(-24)) // Approx 24-hour VWAP

    // Carry bonus: +5% boost if price above 24h VWAP (positive funding rate proxy)
    const carryBonus = currentPrice > vwap ? 1.05 : 1.0

    // Score = momentum / volatility * carry adjustment
    const score = (momentum7d / (vol * 100 || 1)) * carryBonus

    scores.push({
      symbol,
      momentum: momentum7d,
      volatility: vol,
      score,
      price: currentPrice,
      vwap24h: vwap,
      rank: 0,
    })
  }

  // Rank by score
  scores.sort((a, b) => b.score - a.score)
  scores.forEach((s, i) => s.rank = i + 1)

  const top3 = scores.slice(0, 3)
  const actions: TradeAction[] = []
  let signalSummary = 'NEUTRAL'

  // Exit positions not in top 3
  for (const pos of positions) {
    const score = scores.find(s => s.symbol === pos.symbol)
    if (!score || score.rank > 3) {
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos, 'Fell out of top 3', {
        rank: score?.rank || 99,
        score: +(score?.score || 0).toFixed(2),
      })
      actions.push(action)
      signalSummary = `SELL ◆ ${pos.symbol.split('/')[0]} fell to rank ${score?.rank} (out of top 3)`
    } else if (score && score.momentum < 0) {
      // Hard stop if momentum reverses to negative
      const currentPrice = score.price
      if (currentPrice < pos.avg_entry * 0.96) {
        const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos, 'Hard stop -4%', {
          rank: score.rank,
          momentum_7d: score.momentum.toFixed(2),
        })
        actions.push(action)
        signalSummary = `SELL ▼ Hard stop −4% on ${pos.symbol.split('/')[0]} · Momentum reversed`
      }
    }
  }

  // Enter top 3 positions with inverse volatility weighting
  const totalInvVol = top3.reduce((sum, s) => sum + (1 / (s.volatility || 0.01)), 0)
  const perNotional = (capitalCents / 100) * 0.30 / 3 // 30% per position for top 3

  for (const score of top3) {
    const pos = positions.find(p => p.symbol === score.symbol)
    if (!pos && cash > perNotional * 100) {
      const invVolWeight = (1 / (score.volatility || 0.01)) / totalInvVol
      const notional = Math.min(perNotional * invVolWeight * 2, (cash / 100) * 0.30)

      if (notional > 1) {
        const action = await executeBuy(admin, agentId, alpacaKey, alpacaSecret, score.symbol, notional, score.price, {
          rank: score.rank,
          score: +score.score.toFixed(2),
          momentum_7d: +score.momentum.toFixed(2),
          volatility: +(score.volatility * 100).toFixed(2),
          carry_bonus: score.price > score.vwap24h ? 'yes' : 'no',
        })
        actions.push(action)
        signalSummary = `BUY ▲ ${score.symbol.split('/')[0]} rank #${score.rank} · score ${score.score.toFixed(2)} · mom ${score.momentum.toFixed(1)}%`
      }
    }
  }

  if (actions.length === 0) {
    const top1 = scores[0]
    actions.push({
      action: 'HOLD',
      symbol: 'MCAR',
      reason: `Top 3: ${top3.map(s => s.symbol.split('/')[0]).join(', ')} (scores ${top3.map(s => s.score.toFixed(2)).join(', ')})`,
    })
    signalSummary = `HOLD · Top 3 momentum: ${top3.map(s => s.symbol.split('/')[0]).join(', ')} · Leader ${top1.symbol.split('/')[0]} mom ${top1.momentum.toFixed(1)}%`
  }

  const investedCents = positions.reduce((sum, p) => sum + Math.round(p.qty * p.avg_entry * 100), 0)
  const portfolio: StrategyResult['portfolio'] = {
    cash_cents: Math.max(0, capitalCents - investedCents),
    invested_cents: investedCents,
    total_value_cents: capitalCents,
    positions: positions.map(p => {
      const score = scores.find(s => s.symbol === p.symbol)
      const price = score?.price || p.avg_entry
      return {
        symbol: p.symbol,
        qty: p.qty,
        entry: p.avg_entry,
        current: price,
        pnl_pct: calcPositionPnL(p, price),
      }
    }),
    exposure_pct: (investedCents / capitalCents) * 100,
  }

  return { agent_slug: 'momentum-carry', actions, portfolio, signal_summary: signalSummary }
}

// ... (rest of the code remains the same)

// ── STRATEGY 9: LIQUIDATION CASCADE DETECTOR ───────────────────────────────
// Detect potential liquidation cascades by monitoring rapid price drops + volume spikes
// Assets: BTC, ETH (with tight stops)
// Entry: Price drop >4% in 4 bars (1Hour) AND volume >3x 20-period avg AND RSI < 25
// Exit: 50% recovery of the drop, or +8% from entry, or 48h time stop
// Risk: Max 20% position, -3% hard stop (tight due to cascade risk)
export async function runCascadeDetect(
  admin: SupabaseClient,
  agentId: string,
  alpacaKey: string,
  alpacaSecret: string,
  capitalCents = 1_000_000
): Promise<StrategyResult> {
  const symbols = [SYM.BTC, SYM.ETH]

  const emptyPortfolio: StrategyResult['portfolio'] = {
    cash_cents: capitalCents,
    invested_cents: 0,
    total_value_cents: capitalCents,
    positions: [],
    exposure_pct: 0,
  }

  const positions = await getAgentPositions(admin, agentId)
  const cash = await getAgentCash(admin, agentId, capitalCents, positions)

  const actions: TradeAction[] = []
  const cascadeScores: { symbol: string; dropPct: number; volRatio: number; rsi: number; price: number; lowestPrice: number }[] = []

  for (const symbol of symbols) {
    const bars = await getCryptoBars(symbol, '1Hour', 100) // Hourly bars for better cascade detection
    if (bars.length < 30) continue

    const currentPrice = bars[bars.length - 1].c
    const recentBars = bars.slice(-4) // Last 4 hours
    const dropPct = ((recentBars[0].c - currentPrice) / recentBars[0].c) * 100
    const lowestRecent = Math.min(...recentBars.map(b => b.l))

    const vol20Avg = bars.slice(-20).reduce((sum, b) => sum + b.v, 0) / 20
    const currentVol = bars[bars.length - 1].v
    const volRatio = currentVol / (vol20Avg || 1)

    const rsi = calcRSI(bars, 14)

    cascadeScores.push({
      symbol,
      dropPct: dropPct,
      volRatio,
      rsi,
      price: currentPrice,
      lowestPrice: lowestRecent,
    })
  }

  let signalSummary = 'NEUTRAL'

  // Process exits for existing positions
  const symbolSet2 = new Set(symbols)
  for (const pos of positions) {
    if (!symbolSet2.has(pos.symbol as any)) continue
    const score = cascadeScores.find(s => s.symbol === pos.symbol)
    if (!score) continue

    const currentPrice = score.price
    const pnlPct = calcPositionPnL(pos, currentPrice)
    const dropRecovery = pos.avg_entry + (pos.avg_entry - score.lowestPrice) * 0.5
    const profitTarget = pos.avg_entry * 1.08
    const hardStop = pos.avg_entry * 0.97 // -3% hard stop (tight)

    if (currentPrice < hardStop) {
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos, 'Hard stop -3% (cascade risk)', {
        drop_pct: score.dropPct.toFixed(1),
        vol_ratio: score.volRatio.toFixed(2),
        rsi: score.rsi.toFixed(1),
      })
      actions.push(action)
      signalSummary = `SELL ▼ Hard stop −3% on ${pos.symbol.split('/')[0]} · Cascade continuing`
    } else if (currentPrice >= dropRecovery || currentPrice >= profitTarget) {
      const reason = currentPrice >= dropRecovery ? '50% recovery' : '+8% profit'
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos, reason, {
        drop_pct: score.dropPct.toFixed(1),
        vol_ratio: score.volRatio.toFixed(2),
      })
      actions.push(action)
      signalSummary = `SELL ▲ ${reason} on ${pos.symbol.split('/')[0]} · P&L ${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(1)}%`
    }
  }

  // Entry: 4% drop + volume spike + oversold
  for (const score of cascadeScores) {
    const pos = positions.find(p => p.symbol === score.symbol)
    if (pos) continue

    if (score.dropPct > 4.0 && score.volRatio > 3.0 && score.rsi < 25 && cash > 100) {
      const positionSize = (capitalCents / 100) * 0.20
      const notional = Math.min(positionSize, (cash / 100) * 0.20)

      if (notional > 1) {
        const action = await executeBuy(admin, agentId, alpacaKey, alpacaSecret, score.symbol, notional, score.price, {
          drop_4h: score.dropPct.toFixed(1),
          vol_ratio: score.volRatio.toFixed(2),
          rsi: score.rsi.toFixed(1),
        })
        actions.push(action)
        signalSummary = `BUY ▲ Cascade detected: ${score.dropPct.toFixed(1)}% drop, vol ${score.volRatio.toFixed(1)}x on ${score.symbol.split('/')[0]} · $${notional.toFixed(0)}`
      }
    }
  }

  if (actions.length === 0) {
    const topScore = cascadeScores.sort((a, b) => b.dropPct - a.dropPct)[0]
    if (topScore) {
      actions.push({
        action: 'HOLD',
        symbol: 'LCAS',
        reason: `Cascade monitor: ${topScore.symbol.split('/')[0]} drop ${topScore.dropPct.toFixed(1)}%, vol ${topScore.volRatio.toFixed(2)}x`,
      })
      signalSummary = `SCAN · Watching for cascades · Best setup: ${topScore.symbol.split('/')[0]} drop ${topScore.dropPct.toFixed(1)}% (need >4%)`
    }
  }

  const investedCents = positions.reduce((sum, p) => sum + Math.round(p.qty * p.avg_entry * 100), 0)
  const portfolio: StrategyResult['portfolio'] = {
    cash_cents: Math.max(0, capitalCents - investedCents),
    invested_cents: investedCents,
    total_value_cents: capitalCents,
    positions: positions.map(p => {
      const score = cascadeScores.find(s => s.symbol === p.symbol)
      const price = score?.price || p.avg_entry
      return {
        symbol: p.symbol,
        qty: p.qty,
        entry: p.avg_entry,
        current: price,
        pnl_pct: calcPositionPnL(p, price),
      }
    }),
    exposure_pct: (investedCents / capitalCents) * 100,
  }

  return { agent_slug: 'cascade-detect', actions, portfolio, signal_summary: signalSummary }
}

// ── STRATEGY 10: DEFI YIELD MOMENTUM ───────────────────────────────────────
// Track DeFi tokens (AAVE, UNI, LINK, AVAX) for positive momentum divergence from BTC
// Entry: Token 7d return > BTC 7d return + 2% AND token RSI > 55
// Exit: Token underperforms BTC by 1.5% over 3 days, or +12% profit, or -5% stop
// Risk: Max 25% per token, 50% total
export async function runDefiYield(
  admin: SupabaseClient,
  agentId: string,
  alpacaKey: string,
  alpacaSecret: string,
  capitalCents = 1_000_000
): Promise<StrategyResult> {
  const defiSymbols = [SYM.AAVE, SYM.UNI, SYM.LINK, SYM.AVAX]

  const positions = await getAgentPositions(admin, agentId)
  const cash = await getAgentCash(admin, agentId, capitalCents, positions)

  // Get BTC momentum as baseline
  const btcBars = await getCryptoBars(SYM.BTC, '1Day', 30)
  const btcMomentum = calcMomentumScore(btcBars, 7)

  const scores: { symbol: string; momentum: number; btcOutperformance: number; rsi: number; price: number; days: number }[] = []

  // Batch fetch all DeFi symbol bars
  const barsPromises = defiSymbols.map(symbol => getCryptoBars(symbol, '1Day', 30))
  const allBars = await Promise.all(barsPromises)

  for (let i = 0; i < defiSymbols.length; i++) {
    const symbol = defiSymbols[i]
    const bars = allBars[i]
    if (bars.length < 8) continue

    const tokenMomentum = calcMomentumScore(bars, 7)
    const rsi = calcRSI(bars, 14)
    const currentPrice = bars[bars.length - 1].c

    // Divergence: token outperforming BTC by >2%
    const outperformance = tokenMomentum - btcMomentum

    scores.push({
      symbol,
      momentum: tokenMomentum,
      btcOutperformance: outperformance,
      rsi,
      price: currentPrice,
      days: bars.length,
    })
  }

  scores.sort((a, b) => b.btcOutperformance - a.btcOutperformance)

  const actions: TradeAction[] = []
  let signalSummary = 'NEUTRAL'

  // Exit conditions: underperformance or profit targets
  const defiSymbolSet = new Set(defiSymbols)
  for (const pos of positions) {
    if (!defiSymbolSet.has(pos.symbol as any)) continue
    const score = scores.find(s => s.symbol === pos.symbol)
    if (!score) continue

    const currentPrice = score.price
    const pnlPct = calcPositionPnL(pos, currentPrice)
    const hardStop = pos.avg_entry * 0.95
    const profitTarget = pos.avg_entry * 1.12

    if (currentPrice < hardStop) {
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos, 'Hard stop -5%', {
        outperformance: score.btcOutperformance.toFixed(2),
        rsi: score.rsi.toFixed(1),
      })
      actions.push(action)
      signalSummary = `SELL ▼ Hard stop −5% on ${pos.symbol.split('/')[0]} · Divergence fading`
    } else if (currentPrice >= profitTarget) {
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos, '+12% profit target', {
        outperformance: score.btcOutperformance.toFixed(2),
      })
      actions.push(action)
      signalSummary = `SELL ▲ +12% profit target on ${pos.symbol.split('/')[0]} · P&L ${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(1)}%`
    } else if (score.btcOutperformance < -1.5) {
      // Underperforming BTC by 1.5% — signal fading
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos, 'Underperforming BTC by 1.5%', {
        outperformance: score.btcOutperformance.toFixed(2),
      })
      actions.push(action)
      signalSummary = `SELL ◆ Divergence fading on ${pos.symbol.split('/')[0]} (underperforming BTC) · P&L ${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(1)}%`
    }
  }

  // Entry: Positive divergence + strength
  for (const score of scores) {
    const pos = positions.find(p => p.symbol === score.symbol)
    if (pos) continue

    if (score.btcOutperformance > 2.0 && score.rsi > 55 && cash > 100) {
      const positionSize = (capitalCents / 100) * 0.25
      const notional = Math.min(positionSize, (cash / 100) * 0.25)

      if (notional > 1) {
        const action = await executeBuy(admin, agentId, alpacaKey, alpacaSecret, score.symbol, notional, score.price, {
          outperformance: score.btcOutperformance.toFixed(2),
          rsi: score.rsi.toFixed(1),
          defi_momentum: score.momentum.toFixed(1),
          btc_momentum: btcMomentum.toFixed(1),
        })
        actions.push(action)
        signalSummary = `BUY ▲ ${score.symbol.split('/')[0]} outperforming BTC by ${score.btcOutperformance.toFixed(1)}% · RSI ${score.rsi.toFixed(0)} · $${notional.toFixed(0)}`
      }
    }
  }

  if (actions.length === 0) {
    const topScore = scores[0]
    const waitMsg = topScore
      ? `${topScore.symbol.split('/')[0]} outperforming by ${topScore.btcOutperformance.toFixed(1)}% (need >2%)`
      : 'waiting for DeFi divergence'
    actions.push({
      action: 'HOLD',
      symbol: 'DYLD',
      reason: `DeFi momentum monitor: BTC momentum ${btcMomentum.toFixed(1)}% · ${waitMsg}`,
    })
    signalSummary = `SCAN · DeFi divergence ready · Best: ${topScore?.symbol.split('/')[0]} +${topScore?.btcOutperformance.toFixed(1)}% vs BTC (need >2%)`
  }

  const investedCents = positions.reduce((sum, p) => sum + Math.round(p.qty * p.avg_entry * 100), 0)
  const portfolio: StrategyResult['portfolio'] = {
    cash_cents: Math.max(0, capitalCents - investedCents),
    invested_cents: investedCents,
    total_value_cents: capitalCents,
    positions: positions.map(p => {
      const score = scores.find(s => s.symbol === p.symbol)
      const price = score?.price || p.avg_entry
      return {
        symbol: p.symbol,
        qty: p.qty,
        entry: p.avg_entry,
        current: price,
        pnl_pct: calcPositionPnL(p, price),
      }
    }),
    exposure_pct: (investedCents / capitalCents) * 100,
  }

  return { agent_slug: 'defi-yield', actions, portfolio, signal_summary: signalSummary }
}
