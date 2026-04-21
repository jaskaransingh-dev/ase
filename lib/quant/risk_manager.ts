// ============================================================
// Quant Framework — Risk Manager
// Pre-trade checks, intraday monitoring, and kill switches.
// The last line of defence before capital is deployed.
// ============================================================

import type {
  Order, RiskLimits, RiskCheckResult, PortfolioState,
  PortfolioRiskMetrics,
} from './types'

// ── Default limits ────────────────────────────────────────────

export const DEFAULT_RISK_LIMITS: RiskLimits = {
  maxGrossExposure:    1.5,     // 150% gross
  maxNetExposure:      0.20,    // ±20% net
  maxPositionWeight:   0.40,    // 40% single name
  maxSectorExposure:   0.30,    // 30% sector
  maxDrawdownTrigger:  0.20,    // halt at 20% drawdown from peak
  varConfidence:       0.95,
  varLimitPct:         25.0,    // daily VaR ≤ 25% of portfolio (appropriate for crypto)
  maxDailyTurnover:    0.40,    // ≤ 40% daily turnover
}

// ── Breach severity ───────────────────────────────────────────

type Severity = 'REJECT' | 'WARN'

interface RuleResult {
  severity: Severity
  message: string
}

// ── Pre-trade checks ──────────────────────────────────────────

export class RiskManager {
  constructor(private limits: RiskLimits = DEFAULT_RISK_LIMITS) {}

  /**
   * Pre-trade check: runs before submitting any orders.
   * Hard limits → REJECT (order removed from batch)
   * Soft limits → WARN (order passes but logged)
   */
  preTrade(
    orders: Order[],
    portfolioState: PortfolioState,
    riskMetrics: PortfolioRiskMetrics,
    proposedWeights: Record<string, number>,
  ): RiskCheckResult {
    const breaches: string[] = []
    const warnings: string[] = []
    const approvedOrders: Order[] = []
    const rejectedOrders: Order[] = []

    // ─ Portfolio-level hard limits ───────────────────────────

    // 1. Drawdown trigger (halt all new trades)
    if (portfolioState.currentDrawdown <= -this.limits.maxDrawdownTrigger) {
      return {
        passed:         false,
        breaches:       [`HALTED: Drawdown ${(portfolioState.currentDrawdown * 100).toFixed(1)}% exceeds limit ${(this.limits.maxDrawdownTrigger * 100).toFixed(0)}%`],
        warnings:       [],
        approvedOrders: [],
        rejectedOrders: orders,
      }
    }

    // 2. VaR limit
    if (riskMetrics.varPct > this.limits.varLimitPct) {
      breaches.push(`VaR ${riskMetrics.varPct.toFixed(1)}% exceeds limit ${this.limits.varLimitPct}%`)
    }

    // 3. Gross exposure
    const proposedGross = Object.values(proposedWeights).reduce((a, w) => a + Math.abs(w), 0)
    if (proposedGross > this.limits.maxGrossExposure) {
      breaches.push(`Gross exposure ${(proposedGross * 100).toFixed(0)}% exceeds limit ${(this.limits.maxGrossExposure * 100).toFixed(0)}%`)
    }

    // 4. Net exposure
    const proposedNet = Object.values(proposedWeights).reduce((a, w) => a + w, 0)
    if (Math.abs(proposedNet) > this.limits.maxNetExposure) {
      warnings.push(`Net exposure ${(proposedNet * 100).toFixed(1)}% exceeds limit ±${(this.limits.maxNetExposure * 100).toFixed(0)}%`)
    }

    // ─ Order-level checks ────────────────────────────────────

    for (const order of orders) {
      const orderBreaches: string[] = []

      // 5. Single-name concentration
      const postTradeWeight = Math.abs(proposedWeights[order.symbol] ?? 0)
      if (postTradeWeight > this.limits.maxPositionWeight) {
        orderBreaches.push(
          `${order.symbol}: position ${(postTradeWeight * 100).toFixed(1)}% exceeds max ${(this.limits.maxPositionWeight * 100).toFixed(0)}%`
        )
      }

      if (orderBreaches.length > 0) {
        breaches.push(...orderBreaches)
        rejectedOrders.push(order)
      } else {
        approvedOrders.push(order)
      }
    }

    // Portfolio-level breach → reject all orders
    if (breaches.some(b => b.startsWith('Gross') || b.startsWith('VaR'))) {
      return {
        passed: false,
        breaches,
        warnings,
        approvedOrders: [],
        rejectedOrders: orders,
      }
    }

    return {
      passed:         breaches.length === 0,
      breaches,
      warnings,
      approvedOrders,
      rejectedOrders,
    }
  }

  /**
   * Intraday check: called after each fill to detect intraday drift.
   */
  intradayCheck(
    portfolioState: PortfolioState,
    riskMetrics: PortfolioRiskMetrics,
  ): { shouldHalt: boolean; alerts: string[] } {
    const alerts: string[] = []
    let shouldHalt = false

    if (portfolioState.currentDrawdown <= -this.limits.maxDrawdownTrigger) {
      shouldHalt = true
      alerts.push(`HALT: Max drawdown ${(this.limits.maxDrawdownTrigger * 100).toFixed(0)}% breached`)
    }

    if (riskMetrics.varPct > this.limits.varLimitPct * 1.5) {
      alerts.push(`ALERT: VaR ${riskMetrics.varPct.toFixed(1)}% significantly exceeds limit`)
    }

    if (riskMetrics.concentrationHHI > 0.3) {
      alerts.push(`WARN: High concentration (HHI ${riskMetrics.concentrationHHI.toFixed(2)})`)
    }

    return { shouldHalt, alerts }
  }

  /**
   * Turnover check: prevent excessive trading costs.
   */
  checkTurnover(dailyTurnover: number): { exceeded: boolean; message: string } {
    if (dailyTurnover > this.limits.maxDailyTurnover) {
      return {
        exceeded: true,
        message: `Daily turnover ${(dailyTurnover * 100).toFixed(0)}% exceeds limit ${(this.limits.maxDailyTurnover * 100).toFixed(0)}%`,
      }
    }
    return { exceeded: false, message: '' }
  }

  /**
   * Scale weights back to comply with gross exposure limit.
   */
  scaleToGrossLimit(weights: Record<string, number>): Record<string, number> {
    const gross = Object.values(weights).reduce((a, w) => a + Math.abs(w), 0)
    if (gross <= this.limits.maxGrossExposure) return weights
    const scale = this.limits.maxGrossExposure / gross
    return Object.fromEntries(Object.entries(weights).map(([s, w]) => [s, w * scale]))
  }
}

// ── Kill Switch ───────────────────────────────────────────────

export class KillSwitch {
  private triggered = false
  private reason    = ''

  trigger(reason: string): void {
    this.triggered = true
    this.reason    = reason
    console.error(`[KILL SWITCH] ${reason}`)
  }

  reset(): void {
    this.triggered = false
    this.reason    = ''
  }

  get isActive(): boolean { return this.triggered }
  get triggerReason(): string { return this.reason }

  check(): void {
    if (this.triggered) {
      throw new Error(`Kill switch active: ${this.reason}`)
    }
  }
}

export const defaultRiskManager = new RiskManager()
