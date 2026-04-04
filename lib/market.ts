export const PLATFORM_SEED_CAPITAL_CENTS = 1_000_000
export const BASE_SHARE_PRICE_CENTS = 10_000

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function calculateTradingCapitalCents(investorCapitalCents: number): number {
  return PLATFORM_SEED_CAPITAL_CENTS + Math.max(0, Math.round(investorCapitalCents || 0))
}

export function calculateNavFromState(params: {
  investorCapitalCents: number
  totalPnlCents: number
}) {
  const investorCapitalCents = Math.max(0, Math.round(params.investorCapitalCents || 0))
  const totalPnlCents = Math.round(params.totalPnlCents || 0)
  const tradingCapitalCents = calculateTradingCapitalCents(investorCapitalCents)

  // Total pool = seed + investor capital + trading P&L.
  const totalPoolCents = Math.max(
    PLATFORM_SEED_CAPITAL_CENTS,
    tradingCapitalCents + totalPnlCents
  )

  // NAV is capital-backed: seed capital and investor capital both support price.
  // Formula: NAV = BASE × (seed + investor capital + P&L) / seed
  //   no investors, no P&L → $100
  //   +$1k capital         → $110
  //   +$1k capital, +$500 P&L → $115
  const navCents = Math.max(
    1,
    Math.round((totalPoolCents / PLATFORM_SEED_CAPITAL_CENTS) * BASE_SHARE_PRICE_CENTS)
  )

  const totalReturnPct = ((totalPoolCents - PLATFORM_SEED_CAPITAL_CENTS) / PLATFORM_SEED_CAPITAL_CENTS) * 100

  return {
    investorCapitalCents,
    tradingCapitalCents,
    totalPnlCents,
    totalPoolCents,
    navCents,
    totalReturnPct,
  }
}

export function estimatePnlFromNav(navCents: number, investorCapitalCents = 0): number {
  // Inverse of: nav = BASE × (seed + investor capital + pnl) / seed
  const safeNavCents = Math.max(1, Math.round(navCents || BASE_SHARE_PRICE_CENTS))
  const tradingCapitalCents = calculateTradingCapitalCents(investorCapitalCents)
  return Math.round(
    PLATFORM_SEED_CAPITAL_CENTS * safeNavCents / BASE_SHARE_PRICE_CENTS - tradingCapitalCents
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
