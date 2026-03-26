/**
 * Real Statistics Calculation Engine
 *
 * Calculates actual trading metrics from agent_trades data:
 * - NAV (Net Asset Value)
 * - Total Return %
 * - Sharpe Ratio
 * - Max Drawdown
 * - Win Rate
 * - Trade Count
 */

import { SupabaseClient } from '@supabase/supabase-js'

export interface TradeRecord {
  symbol: string
  side: 'buy' | 'sell'
  qty: number
  fill_price: number
  filled_at: string
  pnl_cents: number | null
}

export interface AgentStats {
  nav_cents: bigint
  bid_cents: bigint
  ask_cents: bigint
  total_return_pct: number
  sharpe_ratio: number
  max_drawdown_pct: number
  win_rate_pct: number
  total_trades: number
}

/**
 * Calculate real agent statistics from trading history
 */
export async function calculateAgentStats(
  admin: SupabaseClient,
  agentId: string,
  baseCapitalCents: bigint = BigInt(1_000_000) // $10,000
): Promise<AgentStats> {
  // Fetch all trades for this agent
  const { data: trades, error } = await admin
    .from('agent_trades')
    .select('symbol, side, qty, fill_price, filled_at, pnl_cents')
    .eq('agent_id', agentId)
    .order('filled_at', { ascending: true })

  if (error || !trades) {
    console.error('Error fetching trades:', error)
    return getEmptyStats(baseCapitalCents)
  }

  if (trades.length === 0) {
    // No trades yet - agent at base capital
    return getEmptyStats(baseCapitalCents)
  }

  // Calculate metrics
  const nav = calculateNAV(trades, baseCapitalCents)
  const totalReturn = calculateTotalReturn(nav, baseCapitalCents)
  const winRate = calculateWinRate(trades)
  const maxDrawdown = calculateMaxDrawdown(trades, baseCapitalCents)
  const sharpeRatio = calculateSharpeRatio(trades, baseCapitalCents)
  const tradeCount = trades.length

  return {
    nav_cents: nav,
    bid_cents: BigInt(Math.round(Number(nav) * 0.998)),
    ask_cents: BigInt(Math.round(Number(nav) * 1.002)),
    total_return_pct: totalReturn,
    sharpe_ratio: sharpeRatio,
    max_drawdown_pct: maxDrawdown,
    win_rate_pct: winRate,
    total_trades: tradeCount,
  }
}

/**
 * Calculate Net Asset Value by summing open positions + realized P&L
 */
function calculateNAV(trades: TradeRecord[], baseCapitalCents: bigint): bigint {
  // Track positions by symbol
  const positions: Record<
    string,
    { qty: number; cost: number; realized_pnl_cents: number }
  > = {}

  // Process trades in order
  for (const trade of trades) {
    const sym = trade.symbol
    if (!positions[sym]) {
      positions[sym] = { qty: 0, cost: 0, realized_pnl_cents: 0 }
    }

    if (trade.side === 'buy') {
      positions[sym].qty += trade.qty
      positions[sym].cost += trade.qty * trade.fill_price
    } else {
      positions[sym].qty -= trade.qty
      // Add realized P&L from sells
      if (trade.pnl_cents !== null) {
        positions[sym].realized_pnl_cents += trade.pnl_cents
      }
    }
  }

  // Get latest prices (from last trade of each symbol)
  const lastPrices: Record<string, number> = {}
  for (const trade of [...trades].reverse()) {
    if (!lastPrices[trade.symbol]) {
      lastPrices[trade.symbol] = trade.fill_price
    }
  }

  // Calculate unrealized P&L
  let unrealizedPnlCents = 0
  for (const [sym, pos] of Object.entries(positions)) {
    if (pos.qty > 0) {
      const currentValue = pos.qty * lastPrices[sym]
      const cost = pos.cost
      unrealizedPnlCents += Math.round((currentValue - cost) * 100)
    }
  }

  // Total realized + unrealized P&L
  let totalPnlCents = 0
  for (const pos of Object.values(positions)) {
    totalPnlCents += pos.realized_pnl_cents
  }
  totalPnlCents += unrealizedPnlCents

  // NAV = base capital + P&L
  const nav = baseCapitalCents + BigInt(totalPnlCents)
  return nav > BigInt(0) ? nav : baseCapitalCents
}

/**
 * Calculate total return percentage
 */
function calculateTotalReturn(navCents: bigint, baseCapitalCents: bigint): number {
  const navNum = Number(navCents)
  const baseNum = Number(baseCapitalCents)
  if (baseNum === 0) return 0
  return parseFloat(
    (((navNum - baseNum) / baseNum) * 100).toFixed(2)
  )
}

/**
 * Calculate win rate: (winning trades / total trades) * 100
 * A trade is winning if pnl_cents > 0
 */
function calculateWinRate(trades: TradeRecord[]): number {
  // Only count closes (sells)
  const closedTrades = trades.filter(t => t.side === 'sell')
  if (closedTrades.length === 0) return 0

  const winners = closedTrades.filter(t => t.pnl_cents && t.pnl_cents > 0)
  return parseFloat(
    ((winners.length / closedTrades.length) * 100).toFixed(1)
  )
}

/**
 * Calculate maximum drawdown: (lowest point - peak) / peak * 100
 * Simulates portfolio value over time based on trades
 */
function calculateMaxDrawdown(
  trades: TradeRecord[],
  baseCapitalCents: bigint
): number {
  if (trades.length === 0) return 0

  const navProgression: number[] = [Number(baseCapitalCents)]
  let currentValue = Number(baseCapitalCents)

  for (const trade of trades) {
    if (trade.side === 'sell' && trade.pnl_cents !== null) {
      currentValue += trade.pnl_cents
    }
    navProgression.push(Math.max(currentValue, Number(baseCapitalCents)))
  }

  if (navProgression.length < 2) return 0

  let maxDrawdown = 0
  let peak = navProgression[0]

  for (let i = 1; i < navProgression.length; i++) {
    if (navProgression[i] > peak) {
      peak = navProgression[i]
    } else {
      const drawdown = ((peak - navProgression[i]) / peak) * 100
      maxDrawdown = Math.max(maxDrawdown, drawdown)
    }
  }

  return parseFloat(maxDrawdown.toFixed(2))
}

/**
 * Calculate Sharpe Ratio: (Mean Return - Risk Free Rate) / Std Dev of Returns
 * Uses realized P&L from sells as daily returns
 * Risk-free rate = 2% annually (~0.005% daily)
 */
function calculateSharpeRatio(
  trades: TradeRecord[],
  baseCapitalCents: bigint
): number {
  const closedTrades = trades.filter(t => t.side === 'sell')
  if (closedTrades.length < 2) return 0

  // Calculate returns per trade (as % of capital)
  const returns = closedTrades
    .filter(t => t.pnl_cents !== null)
    .map(t => (t.pnl_cents! / Number(baseCapitalCents)) * 100)

  if (returns.length === 0) return 0

  // Mean return
  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length

  // Standard deviation
  const variance =
    returns.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) /
    returns.length
  const stdDev = Math.sqrt(variance)

  if (stdDev === 0) return 0

  // Risk-free rate: 2% annual = 0.0077% per trade
  const riskFreeRate = 0.02 / returns.length

  // Sharpe ratio (capped at 5.0 for display)
  const sharpe = (meanReturn - riskFreeRate) / stdDev
  return parseFloat(Math.min(sharpe, 5.0).toFixed(2))
}

/**
 * Return zero stats (before any trades)
 */
function getEmptyStats(baseCapitalCents: bigint): AgentStats {
  return {
    nav_cents: baseCapitalCents,
    bid_cents: BigInt(Math.round(Number(baseCapitalCents) * 0.998)),
    ask_cents: BigInt(Math.round(Number(baseCapitalCents) * 1.002)),
    total_return_pct: 0,
    sharpe_ratio: 0,
    max_drawdown_pct: 0,
    win_rate_pct: 0,
    total_trades: 0,
  }
}
