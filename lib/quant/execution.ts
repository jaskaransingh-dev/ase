// ============================================================
// Quant Framework — Execution Model
// Order generation, slippage estimation, and fill simulation.
// This is where real alpha gets eaten or preserved.
// ============================================================

import type { ExecutionConfig, Order, Fill, Bar } from './types'

// ── Slippage Models ───────────────────────────────────────────

/**
 * Fixed slippage: constant bps regardless of order size.
 * Floor model for liquid crypto.
 */
function fixedSlippage(priceBps: number): number {
  return priceBps
}

/**
 * Volatility-scaled slippage: proportional to intraday vol.
 * Higher volatility → wider bid/ask → higher cost.
 */
function volatilitySlippage(vol20d: number, baseBps: number): number {
  const annualVol = vol20d  // already annualised
  const dailyVol  = annualVol / Math.sqrt(252)
  // Rough half-spread approximation: 0.5 × daily_vol × scaling factor
  return Math.max(baseBps, dailyVol * 100 * 0.15)
}

/**
 * Market impact model: square-root model (Kyle λ).
 * Cost grows with √(order_size / ADV).
 * Standard institutional approximation.
 */
function marketImpactSlippage(
  orderNotionalUsd: number,
  advNotionalUsd: number,
  vol20d: number,
  baseBps: number,
): number {
  const adv = Math.max(advNotionalUsd, 1)
  const participation = orderNotionalUsd / adv
  // Almgren-Chriss square-root impact: I = σ × √(participation)
  const impact = vol20d / Math.sqrt(252) * Math.sqrt(participation) * 10000  // bps
  return baseBps + impact
}

// ── Order Generation ──────────────────────────────────────────

export class ExecutionModel {
  constructor(private config: ExecutionConfig = {
    orderType: 'market',
    slippageModel: 'market_impact',
    slippageBps: 5,
    participationRate: 0.10,
    minTradeSizeUsd: 100,
    roundLots: false,
  }) {}

  /**
   * Generate orders to move from current positions to target weights.
   * Returns sorted by urgency (highest alpha-signal moves first).
   */
  generateOrders(
    currentPositions: Record<string, number>,   // symbol → shares held
    targetWeights: Record<string, number>,       // symbol → target weight (0-1)
    prices: Record<string, number>,              // symbol → current price
    adv: Record<string, number>,                 // symbol → avg daily volume ($)
    portfolioValue: number,
    date: string,
    vol20d: Record<string, number>,              // symbol → annualised vol
  ): Order[] {
    const orders: Order[] = []

    // Compute target positions in USD and shares
    const allSymbols = new Set([
      ...Object.keys(currentPositions),
      ...Object.keys(targetWeights),
    ])

    for (const symbol of allSymbols) {
      const price = prices[symbol]
      if (!price || price <= 0) continue

      const currentShares    = currentPositions[symbol] ?? 0
      const targetWeightFrac = targetWeights[symbol] ?? 0
      const targetUsd        = targetWeightFrac * portfolioValue
      const targetShares     = this.config.roundLots
        ? Math.round(targetUsd / price)
        : targetUsd / price

      const deltaShares = targetShares - currentShares
      const deltaNot    = Math.abs(deltaShares) * price

      if (deltaNot < this.config.minTradeSizeUsd) continue

      const slipBps = this.estimateSlippage(
        deltaNot,
        adv[symbol] ?? deltaNot * 10,
        vol20d[symbol] ?? 0.5,
      )

      orders.push({
        date,
        symbol,
        side: deltaShares > 0 ? 'BUY' : 'SELL',
        targetShares: Math.abs(deltaShares),
        estimatedPrice: price,
        estimatedSlippageBps: slipBps,
        estimatedCostUsd: deltaNot * slipBps / 10000,
        urgency: this.classifyUrgency(targetWeightFrac, currentShares * price / portfolioValue),
      })
    }

    // Sort: reduce-weight (sells) first to free cash, then buys by urgency
    return orders.sort((a, b) => {
      if (a.side !== b.side) return a.side === 'SELL' ? -1 : 1
      return b.estimatedSlippageBps - a.estimatedSlippageBps
    })
  }

  estimateSlippage(
    orderNotionalUsd: number,
    advNotionalUsd: number,
    vol20d: number,
  ): number {
    switch (this.config.slippageModel) {
      case 'fixed':
        return fixedSlippage(this.config.slippageBps)
      case 'volatility':
        return volatilitySlippage(vol20d, this.config.slippageBps)
      case 'market_impact':
      default:
        return marketImpactSlippage(
          orderNotionalUsd,
          advNotionalUsd,
          vol20d,
          this.config.slippageBps,
        )
    }
  }

  private classifyUrgency(
    targetWeight: number,
    currentWeight: number,
  ): 'low' | 'medium' | 'high' {
    const delta = Math.abs(targetWeight - currentWeight)
    if (delta > 0.05) return 'high'
    if (delta > 0.02) return 'medium'
    return 'low'
  }

  /**
   * Simulate fills from orders.
   * Models:
   *  - TWAP: fills at VWAP-approximated price (close ± half-spread)
   *  - Participation limit: cannot trade > participationRate × ADV
   *  - Partial fills for illiquid names
   */
  simulateFills(
    orders: Order[],
    bar: Record<string, Bar>,
    adv: Record<string, number>,
    commissionBps = 5,
  ): Fill[] {
    return orders.map(order => {
      const b = bar[order.symbol]
      if (!b) return null

      // Price = midpoint + slippage in direction of trade
      const slipMult = order.side === 'BUY' ? 1 : -1
      const fillPrice = b.close * (1 + slipMult * order.estimatedSlippageBps / 10000)

      // Participation constraint: max fill = participation_rate × ADV
      const advShares = (adv[order.symbol] ?? 0) / b.close
      const maxFill   = advShares * this.config.participationRate
      const filledShares = Math.min(order.targetShares, Math.max(maxFill, order.targetShares * 0.5))

      const notional = filledShares * fillPrice
      const commission = notional * commissionBps / 10000

      return {
        date:          order.date,
        symbol:        order.symbol,
        side:          order.side,
        filledShares:  this.config.roundLots ? Math.floor(filledShares) : filledShares,
        avgPrice:      fillPrice,
        commission,
        slippageBps:   order.estimatedSlippageBps,
        totalCostUsd:  commission + order.estimatedCostUsd,
      } as Fill
    }).filter((f): f is Fill => f !== null)
  }
}

// ── TWAP execution simulator ──────────────────────────────────
// Splits a large order into slices across intraday bars.

export function simulateTWAP(
  totalShares: number,
  bars: Bar[],         // intraday bars for the symbol
  side: 'BUY' | 'SELL',
  nSlices = 8,         // spread over 8 intervals
): { avgFillPrice: number; slipBps: number } {
  if (!bars.length) return { avgFillPrice: 0, slipBps: 0 }

  const step  = Math.max(1, Math.floor(bars.length / nSlices))
  const slice = totalShares / nSlices
  const slipMult = side === 'BUY' ? 1 : -1
  let totalNotional = 0, totalSharesFilled = 0

  for (let i = 0; i < nSlices; i++) {
    const b = bars[Math.min(i * step, bars.length - 1)]
    const participation = slice / (b.volume || 1)
    const slipBps = 5 + Math.min(participation * 1000, 50)
    const price = b.close * (1 + slipMult * slipBps / 10000)
    totalNotional += slice * price
    totalSharesFilled += slice
  }

  const vwap    = totalNotional / totalSharesFilled
  const refPrice = bars[0].close
  const slipBps  = Math.abs(vwap - refPrice) / refPrice * 10000

  return { avgFillPrice: vwap, slipBps }
}

// ── Implementation Shortfall ──────────────────────────────────
// Measures actual cost vs decision price.

export function implementationShortfall(
  decisionPrice: number,
  avgFillPrice: number,
  side: 'BUY' | 'SELL',
): number {
  const slipMult = side === 'BUY' ? 1 : -1
  return slipMult * (avgFillPrice - decisionPrice) / decisionPrice * 10000  // bps
}

export const defaultExecutionModel = new ExecutionModel()
