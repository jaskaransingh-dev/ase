export const PLATFORM_SEED_CAPITAL_CENTS = 1_000_000
export const BASE_SHARE_PRICE_CENTS = 10_000

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function calculateNavFromState(params: {
  investorCapitalCents: number
  totalPnlCents: number
}) {
  const investorCapitalCents = Math.max(0, Math.round(params.investorCapitalCents || 0))
  const totalPnlCents = Math.round(params.totalPnlCents || 0)

  // Total pool = seed + all investor capital + trading P&L (used for quote sizing & display)
  const totalPoolCents = Math.max(
    PLATFORM_SEED_CAPITAL_CENTS,
    PLATFORM_SEED_CAPITAL_CENTS + investorCapitalCents + totalPnlCents
  )

  // NAV is driven ONLY by trading P&L — NOT by investor capital inflows.
  // Buying shares alone must never inflate the share price.
  // More AUM expands the trading pool so the agent earns more absolute P&L
  // per cron run, which is what naturally drives NAV up over time.
  //
  // Formula: NAV = BASE × (seed + P&L) / seed
  //   no trades, any AUM   → $100
  //   10% P&L, any AUM     → $110
  //   investor buys shares → NAV unchanged until next trade
  const tradingPoolCents = PLATFORM_SEED_CAPITAL_CENTS + totalPnlCents
  const navCents = Math.max(
    1,
    Math.round((tradingPoolCents / PLATFORM_SEED_CAPITAL_CENTS) * BASE_SHARE_PRICE_CENTS)
  )

  // Total return = P&L as % of seed capital (pure trading performance metric)
  const totalReturnPct = (totalPnlCents / PLATFORM_SEED_CAPITAL_CENTS) * 100

  return {
    investorCapitalCents,
    totalPnlCents,
    totalPoolCents,
    navCents,
    totalReturnPct,
  }
}

export function estimatePnlFromNav(navCents: number, _investorCapitalCents?: number): number {
  // Inverse of: navCents = BASE × (seed + pnl) / seed
  // Solving for pnl: pnl = seed × (nav − BASE) / BASE
  const safeNavCents = Math.max(1, Math.round(navCents || BASE_SHARE_PRICE_CENTS))
  return Math.round(
    PLATFORM_SEED_CAPITAL_CENTS * (safeNavCents - BASE_SHARE_PRICE_CENTS) / BASE_SHARE_PRICE_CENTS
  )
}

export function calculateQuoteFromNav(params: {
  navCents: number
  totalPoolCents: number
  pendingBuyCents?: number
  pendingSellCents?: number
  exposureFraction?: number
}) {
  const navCents = Math.max(1, Math.round(params.navCents || BASE_SHARE_PRICE_CENTS))
  const totalPoolCents = Math.max(PLATFORM_SEED_CAPITAL_CENTS, Math.round(params.totalPoolCents || PLATFORM_SEED_CAPITAL_CENTS))
  const pendingBuyCents = Math.max(0, Math.round(params.pendingBuyCents || 0))
  const pendingSellCents = Math.max(0, Math.round(params.pendingSellCents || 0))
  const exposureFraction = clamp(params.exposureFraction || 0, 0, 1)

  const grossPendingCents = pendingBuyCents + pendingSellCents
  const imbalanceRatio = grossPendingCents > 0
    ? (pendingBuyCents - pendingSellCents) / grossPendingCents
    : 0

  const pendingLoadRatio = grossPendingCents / totalPoolCents
  const baseSpreadBps = 15
  const exposureSpreadBps = exposureFraction * 20
  const pendingSpreadBps = clamp(pendingLoadRatio * 150, 0, 35)
  const spreadBps = baseSpreadBps + exposureSpreadBps + pendingSpreadBps
  const skewBps = clamp(imbalanceRatio * Math.min(20, pendingLoadRatio * 200), -20, 20)

  const bidBps = spreadBps / 2 + Math.max(0, -skewBps)
  const askBps = spreadBps / 2 + Math.max(0, skewBps)
  const bidCents = Math.max(1, Math.round(navCents * (1 - bidBps / 10_000)))
  const askCents = Math.max(bidCents + 1, Math.round(navCents * (1 + askBps / 10_000)))

  return {
    navCents,
    bidCents,
    askCents,
    spreadBps,
    skewBps,
  }
}

export function calculateHoldingValueCents(shares: number, priceCents: number): number {
  return Math.max(0, Math.round((Number(shares) || 0) * Math.max(0, Number(priceCents) || 0)))
}
