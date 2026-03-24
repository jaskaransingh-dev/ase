/**
 * ASE Agent Trading Engine
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
    name: 'BTC Momentum',
    description: 'Rides Bitcoin momentum using 20/50 EMA crossovers on BTC/USD. Goes long when short-term trend is bullish, exits on bearish cross. Trades 24/7 on crypto markets.',
    strategyType: 'crypto_momentum',
    tagline: 'EMA-based momentum trading on Bitcoin',
    ticker: 'BTCM',
    asset: 'crypto',
  },
  {
    id: 'eth-mean-revert',
    slug: 'eth-mean-revert',
    name: 'ETH Mean Revert',
    description: 'Buys ETH when RSI drops below 35 and sells when RSI exceeds 65. Targets oversold bounces on Ethereum with strict position sizing.',
    strategyType: 'crypto_mean_reversion',
    tagline: 'RSI-based mean reversion on Ethereum',
    ticker: 'ETHR',
    asset: 'crypto',
  },
  {
    id: 'crypto-trend',
    slug: 'crypto-trend',
    name: 'Crypto Trend',
    description: 'Systematic trend follower across BTC, ETH, and SOL. Uses 10/30 EMA on 1D bars. Equal-weight allocation across trending assets. Flat when no trend detected.',
    strategyType: 'crypto_momentum',
    tagline: 'Multi-asset crypto trend following',
    ticker: 'CRTR',
    asset: 'crypto',
  },
  {
    id: 'sol-breakout',
    slug: 'sol-breakout',
    name: 'SOL Breakout',
    description: 'Detects SOL/USD breakouts using Bollinger Band expansion and volume surges. Enters on upper band breaks with momentum confirmation. Tight stop-loss at middle band.',
    strategyType: 'crypto_momentum',
    tagline: 'Volatility breakout strategy on Solana',
    ticker: 'SOLB',
    asset: 'crypto',
  },
  {
    id: 'defi-basket',
    slug: 'defi-basket',
    name: 'DeFi Basket',
    description: 'Rotates between top DeFi tokens (LINK, UNI, AAVE, AVAX) based on 14-day momentum scores. Rebalances into top 2 performers with equal-weight positions.',
    strategyType: 'crypto_momentum',
    tagline: 'Momentum rotation across DeFi blue chips',
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
  return { upper: sma + 2 * stdDev, middle: sma, lower: sma - 2 * stdDev }
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
export async function getAgentPositions(admin: SupabaseClient, agentId: string): Promise<AgentPosition[]> {
  const { data } = await admin
    .from('agent_trades')
    .select('symbol, side, qty, fill_price')
    .eq('agent_id', agentId)

  const map: Record<string, { buy_qty: number; buy_cost: number; sell_qty: number }> = {}
  for (const t of data || []) {
    const sym = t.symbol as string
    if (!map[sym]) map[sym] = { buy_qty: 0, buy_cost: 0, sell_qty: 0 }
    const qty = Number(t.qty) || 0
    const price = Number(t.fill_price) || 0
    if (t.side === 'buy') {
      map[sym].buy_qty += qty
      map[sym].buy_cost += qty * price
    } else {
      map[sym].sell_qty += qty
    }
  }

  return Object.entries(map)
    .map(([symbol, v]) => ({
      symbol,
      qty: v.buy_qty - v.sell_qty,
      avg_entry: v.buy_qty > 0 ? v.buy_cost / v.buy_qty : 0,
      total_cost: v.buy_cost,
    }))
    .filter(p => p.qty > 0.000001)
}

// Calculate realized P&L for a sell using FIFO cost basis
async function calcSellPnL(
  admin: SupabaseClient,
  agentId: string,
  symbol: string,
  sellQty: number,
  sellPrice: number
): Promise<number> {
  const { data: buys } = await admin
    .from('agent_trades')
    .select('qty, fill_price')
    .eq('agent_id', agentId)
    .eq('symbol', symbol)
    .eq('side', 'buy')
    .order('filled_at', { ascending: true })

  let remaining = sellQty
  let totalCost = 0

  for (const buy of buys || []) {
    if (remaining <= 0) break
    const buyQty = Number(buy.qty)
    const buyPrice = Number(buy.fill_price)
    const matched = Math.min(remaining, buyQty)
    totalCost += matched * buyPrice
    remaining -= matched
  }

  const matchedQty = sellQty - Math.max(0, remaining)
  const revenue = matchedQty * sellPrice
  return Math.round((revenue - totalCost) * 100) // cents
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
  if (error) console.error('Failed to log trade:', error)
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
  // Don't buy tiny amounts (Alpaca min is usually $1)
  if (notional < 1) {
    return { action: 'SKIP', symbol, reason: `Notional $${notional.toFixed(2)} below minimum`, indicators }
  }

  try {
    const order = await submitOrder({ symbol, notional, side: 'buy' }, alpacaKey, alpacaSecret)

    // Wait for fill (paper trading fills in <1s typically)
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
  // Round to reasonable precision for crypto
  const sellQty = Math.floor(qty * 1e6) / 1e6

  try {
    const order = await submitOrder({ symbol, qty: sellQty, side: 'sell' }, alpacaKey, alpacaSecret)

    const filled = await waitForFill(order.id, alpacaKey, alpacaSecret)
    const fillPrice = filled.filled_avg_price
      ? parseFloat(filled.filled_avg_price)
      : avg_entry // Fallback to entry price if fill price unavailable

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

// ── STRATEGY 1: BTC MOMENTUM ──────────────────────────────────────────────
// Signal: 20/50 EMA crossover on daily bars
// Entry:  EMA20 > EMA50 (bullish trend)
// Exit:   EMA20 < EMA50 (bearish cross)
// Capital: 30% of base ($3,000)
export async function runBtcMomentum(
  admin: SupabaseClient,
  agentId: string,
  alpacaKey: string,
  alpacaSecret: string,
  capitalCents = 1_000_000
): Promise<StrategyResult> {
  const symbol = SYM.BTC
  const bars = await getCryptoBars(symbol, '1Day', 60)
  if (bars.length < 51) {
    return { agent_slug: 'btc-momentum', actions: [], skipped: true }
  }

  const ema20 = calcEMA(bars.slice(-30), 20)
  const ema50 = calcEMA(bars, 50)
  const bullish = ema20 > ema50
  const currentPrice = bars[bars.length - 1].c
  const indicators = {
    ema20: +ema20.toFixed(2),
    ema50: +ema50.toFixed(2),
    price: +currentPrice.toFixed(2),
    signal: bullish ? 'BULLISH' : 'BEARISH',
  }

  const positions = await getAgentPositions(admin, agentId)
  const pos = positions.find(p => p.symbol === symbol)

  if (bullish && !pos) {
    // Enter: 30% of capital
    const notional = (capitalCents / 100) * 0.30
    const action = await executeBuy(admin, agentId, alpacaKey, alpacaSecret, symbol, notional, currentPrice, indicators)
    return { agent_slug: 'btc-momentum', actions: [action] }
  }

  if (!bullish && pos) {
    // Exit: bearish cross
    const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos, 'EMA20 < EMA50 bearish cross', indicators)
    return { agent_slug: 'btc-momentum', actions: [action] }
  }

  return {
    agent_slug: 'btc-momentum',
    actions: [{ action: 'HOLD', symbol, reason: bullish ? 'In position, still bullish' : 'No position, still bearish', indicators }],
  }
}

// ── STRATEGY 2: ETH MEAN REVERT ──────────────────────────────────────────
// Signal: RSI on daily bars
// Entry:  RSI < 35 (oversold — buy the dip)
// Exit:   RSI > 65 (overbought — take profit)
// Capital: 25% of base ($2,500)
export async function runEthMeanRevert(
  admin: SupabaseClient,
  agentId: string,
  alpacaKey: string,
  alpacaSecret: string,
  capitalCents = 1_000_000
): Promise<StrategyResult> {
  const symbol = SYM.ETH
  const bars = await getCryptoBars(symbol, '1Day', 30)
  if (bars.length < 16) {
    return { agent_slug: 'eth-mean-revert', actions: [], skipped: true }
  }

  const rsi = calcRSI(bars)
  const currentPrice = bars[bars.length - 1].c
  const indicators = {
    rsi: +rsi.toFixed(1),
    price: +currentPrice.toFixed(2),
    signal: rsi < 35 ? 'OVERSOLD' : rsi > 65 ? 'OVERBOUGHT' : 'NEUTRAL',
  }

  const positions = await getAgentPositions(admin, agentId)
  const pos = positions.find(p => p.symbol === symbol)
  const actions: TradeAction[] = []

  // Check exit first
  if (pos && rsi > 65) {
    const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos, `RSI ${rsi.toFixed(1)} > 65 overbought`, indicators)
    actions.push(action)
  }
  // Check entry (only if not already in position)
  else if (!pos && rsi < 35) {
    const notional = (capitalCents / 100) * 0.25
    const action = await executeBuy(admin, agentId, alpacaKey, alpacaSecret, symbol, notional, currentPrice, indicators)
    actions.push(action)
  } else {
    actions.push({ action: 'HOLD', symbol, reason: `RSI ${rsi.toFixed(1)} — no signal`, indicators })
  }

  return { agent_slug: 'eth-mean-revert', actions }
}

// ── STRATEGY 3: CRYPTO TREND ─────────────────────────────────────────────
// Signal: 10/30 EMA crossover per asset
// Assets: BTC, ETH, SOL (10% each = 30% total)
// Entry:  EMA10 > EMA30 per asset
// Exit:   EMA10 < EMA30 per asset
export async function runCryptoTrend(
  admin: SupabaseClient,
  agentId: string,
  alpacaKey: string,
  alpacaSecret: string,
  capitalCents = 1_000_000
): Promise<StrategyResult> {
  const symbols = [SYM.BTC, SYM.ETH, SYM.SOL]
  const positions = await getAgentPositions(admin, agentId)
  const perNotional = (capitalCents / 100) * 0.10 // 10% per asset
  const actions: TradeAction[] = []

  for (const symbol of symbols) {
    const bars = await getCryptoBars(symbol, '1Day', 40)
    if (bars.length < 31) {
      actions.push({ action: 'SKIP', symbol, reason: 'Insufficient data' })
      continue
    }

    const ema10 = calcEMA(bars.slice(-15), 10)
    const ema30 = calcEMA(bars, 30)
    const trending = ema10 > ema30
    const currentPrice = bars[bars.length - 1].c
    const indicators = {
      ema10: +ema10.toFixed(2),
      ema30: +ema30.toFixed(2),
      price: +currentPrice.toFixed(2),
      signal: trending ? 'UPTREND' : 'DOWNTREND',
    }

    const pos = positions.find(p => p.symbol === symbol)

    if (trending && !pos) {
      const action = await executeBuy(admin, agentId, alpacaKey, alpacaSecret, symbol, perNotional, currentPrice, indicators)
      actions.push(action)
    } else if (!trending && pos) {
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos, 'EMA10 < EMA30 downtrend', indicators)
      actions.push(action)
    } else {
      actions.push({ action: 'HOLD', symbol, reason: trending ? 'In trend, holding' : 'No trend, flat', indicators })
    }
  }

  return { agent_slug: 'crypto-trend', actions }
}

// ── STRATEGY 4: SOL BREAKOUT ─────────────────────────────────────────────
// Signal: Bollinger Band breakout
// Entry:  Price breaks above upper band (volatility expansion + momentum)
// Exit:   Price falls below middle band (stop)
// Capital: 20% of base ($2,000)
export async function runSolBreakout(
  admin: SupabaseClient,
  agentId: string,
  alpacaKey: string,
  alpacaSecret: string,
  capitalCents = 1_000_000
): Promise<StrategyResult> {
  const symbol = SYM.SOL
  const bars = await getCryptoBars(symbol, '1Day', 25)
  if (bars.length < 21) {
    return { agent_slug: 'sol-breakout', actions: [], skipped: true }
  }

  const { upper, middle } = calcBollingerBands(bars)
  const currentPrice = bars[bars.length - 1].c
  const prevPrice = bars[bars.length - 2].c
  const breakingOut = currentPrice > upper && prevPrice <= upper
  const indicators = {
    upper: +upper.toFixed(2),
    middle: +middle.toFixed(2),
    price: +currentPrice.toFixed(2),
    signal: breakingOut ? 'BREAKOUT' : currentPrice < middle ? 'BELOW_MID' : 'INSIDE_BANDS',
  }

  const positions = await getAgentPositions(admin, agentId)
  const pos = positions.find(p => p.symbol === symbol)

  if (breakingOut && !pos) {
    const notional = (capitalCents / 100) * 0.20
    const action = await executeBuy(admin, agentId, alpacaKey, alpacaSecret, symbol, notional, currentPrice, indicators)
    return { agent_slug: 'sol-breakout', actions: [action] }
  }

  if (pos && currentPrice < middle) {
    const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos, `Price ${currentPrice.toFixed(2)} < middle band ${middle.toFixed(2)}`, indicators)
    return { agent_slug: 'sol-breakout', actions: [action] }
  }

  return {
    agent_slug: 'sol-breakout',
    actions: [{ action: 'HOLD', symbol, reason: breakingOut ? 'Breakout but already in' : 'No breakout signal', indicators }],
  }
}

// ── STRATEGY 5: DEFI BASKET ──────────────────────────────────────────────
// Signal: 14-day momentum ranking
// Hold:   Top 2 of LINK, UNI, AAVE, AVAX by momentum
// Exit:   Any held asset drops out of top 2
// Capital: 15% per position (top 2 = 30% total)
export async function runDefiBasket(
  admin: SupabaseClient,
  agentId: string,
  alpacaKey: string,
  alpacaSecret: string,
  capitalCents = 1_000_000
): Promise<StrategyResult> {
  const defiSymbols = [SYM.LINK, SYM.UNI, SYM.AAVE, SYM.AVAX]
  const perNotional = (capitalCents / 100) * 0.15

  // Calculate 14-day momentum for each asset
  const momentums: { symbol: string; ret: number; price: number }[] = []
  for (const sym of defiSymbols) {
    const bars = await getCryptoBars(sym, '1Day', 15)
    if (bars.length < 14) continue
    const ret = (bars[bars.length - 1].c - bars[0].c) / bars[0].c
    momentums.push({ symbol: sym, ret, price: bars[bars.length - 1].c })
  }

  momentums.sort((a, b) => b.ret - a.ret)
  const top2 = momentums.slice(0, 2).map(m => m.symbol)
  const priceMap = Object.fromEntries(momentums.map(m => [m.symbol, m.price]))

  const positions = await getAgentPositions(admin, agentId)
  const actions: TradeAction[] = []

  // Exit positions that are no longer in top 2
  for (const pos of positions) {
    if (defiSymbols.includes(pos.symbol as typeof defiSymbols[number]) && !top2.includes(pos.symbol)) {
      const action = await executeSell(admin, agentId, alpacaKey, alpacaSecret, pos, 'Dropped out of top 2 momentum', {
        momentum_rank: 'BOTTOM',
        price: priceMap[pos.symbol] || pos.avg_entry,
      })
      actions.push(action)
    }
  }

  // Enter top 2 if not already held
  for (const sym of top2) {
    const pos = positions.find(p => p.symbol === sym)
    if (pos) {
      const rank = momentums.findIndex(m => m.symbol === sym) + 1
      actions.push({ action: 'HOLD', symbol: sym, reason: `Rank #${rank} momentum`, indicators: { rank } })
    } else {
      const price = priceMap[sym] || 1
      const action = await executeBuy(admin, agentId, alpacaKey, alpacaSecret, sym, perNotional, price, {
        momentum_rank: momentums.findIndex(m => m.symbol === sym) + 1,
        ret_14d: +((momentums.find(m => m.symbol === sym)?.ret ?? 0) * 100).toFixed(2),
      })
      actions.push(action)
    }
  }

  if (actions.length === 0) {
    actions.push({ action: 'SKIP', symbol: 'DEFI', reason: 'Insufficient momentum data', indicators: {} })
  }

  return { agent_slug: 'defi-basket', actions }
}
