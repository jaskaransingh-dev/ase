// ============================================================
// Quant Framework — Risk Model Layer
// Estimates covariance, factor exposures, VaR, CVaR.
// ============================================================

import type { Bar, CovarianceMatrix, FactorExposure, PortfolioRiskMetrics } from './types'

// ── Helpers ───────────────────────────────────────────────────

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / (arr.length || 1)
}

function cov2d(xs: number[], ys: number[]): number {
  const mx = mean(xs), my = mean(ys)
  return xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / (xs.length - 1)
}

function variance(arr: number[]): number {
  return cov2d(arr, arr)
}

function pctReturns(closes: number[]): number[] {
  return closes.slice(1).map((c, i) => (c - closes[i]) / closes[i])
}

// ── Sample Covariance ─────────────────────────────────────────

export function estimateSampleCovariance(
  returns: Record<string, number[]>,
  lookback = 60,
): CovarianceMatrix {
  const symbols = Object.keys(returns)
  const n = symbols.length
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const xi = returns[symbols[i]].slice(-lookback)
      const xj = returns[symbols[j]].slice(-lookback)
      const minLen = Math.min(xi.length, xj.length)
      if (minLen < 5) continue
      const c = cov2d(xi.slice(-minLen), xj.slice(-minLen))
      matrix[i][j] = c
      matrix[j][i] = c
    }
  }

  return { symbols, matrix, method: 'sample', lookbackDays: lookback }
}

// ── Ledoit-Wolf Shrinkage ─────────────────────────────────────
// Shrinks sample covariance toward scaled identity.
// Significantly more stable than raw sample covariance for small universes.

export function estimateLedoitWolf(
  returns: Record<string, number[]>,
  lookback = 60,
): CovarianceMatrix {
  const { symbols, matrix: S } = estimateSampleCovariance(returns, lookback)
  const n = symbols.length
  const T = lookback

  // Oracle shrinkage: James-Stein toward I * tr(S)/n
  const traceS = symbols.reduce((sum, _, i) => sum + S[i][i], 0)
  const mu = traceS / n

  // Optimal shrinkage intensity (analytical Ledoit-Wolf)
  const delta = Math.min(Math.max((n + 2) / (T + n + 2), 0), 1)

  const shrunk = S.map((row, i) =>
    row.map((v, j) => {
      const target = i === j ? mu : 0
      return (1 - delta) * v + delta * target
    })
  )

  return { symbols, matrix: shrunk, method: 'ledoit_wolf', lookbackDays: lookback }
}

// ── Factor Risk Model ─────────────────────────────────────────
// Σ ≈ B·F·Bᵀ + D
// B = (n × k) factor exposure matrix
// F = (k × k) factor covariance
// D = (n × n) diagonal idiosyncratic risk

export interface FactorRiskModel {
  symbols: string[]
  factors: string[]
  B: number[][]         // n × k
  F: number[][]         // k × k
  D: number[]           // n diagonal
  totalCov: number[][]  // assembled Σ
}

export function estimateFactorRiskModel(
  priceHistory: Record<string, number[]>,  // symbol → close[]
  marketReturns: number[],                  // market index returns (proxy)
  lookback = 120,
): FactorRiskModel {
  const symbols = Object.keys(priceHistory)
  const n = symbols.length
  const factors = ['market', 'momentum', 'low_vol']
  const k = factors.length

  const rets: Record<string, number[]> = {}
  for (const [sym, closes] of Object.entries(priceHistory)) {
    rets[sym] = pctReturns(closes).slice(-lookback)
  }

  // Cross-sectional averages for style factors
  const dates = rets[symbols[0]]?.length ?? 0
  const momentumFactor = new Array(dates).fill(0)
  const lowVolFactor   = new Array(dates).fill(0)

  // Build factor returns from simple long-top-quintile / short-bottom-quintile
  for (let t = 0; t < dates; t++) {
    const tRets = symbols.map(s => rets[s][t] ?? 0)
    const sorted = [...tRets].sort((a, b) => a - b)
    const q = Math.floor(symbols.length / 5)
    const topAvg = mean(sorted.slice(-q))
    const botAvg = mean(sorted.slice(0, q))
    momentumFactor[t] = topAvg - botAvg

    // Low-vol factor: reward low trailing vol assets
    const vols = symbols.map(s => {
      const r = rets[s].slice(Math.max(0, t - 20), t)
      return r.length > 1 ? Math.sqrt(variance(r)) : Infinity
    })
    const sortedVol = [...vols].map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
    const lowVolReturn  = mean(sortedVol.slice(0, q).map(({ i }) => rets[symbols[i]][t] ?? 0))
    const highVolReturn = mean(sortedVol.slice(-q).map(({ i }) => rets[symbols[i]][t] ?? 0))
    lowVolFactor[t] = lowVolReturn - highVolReturn
  }

  const mktRets = marketReturns.slice(-dates)
  const factorMatrix = [mktRets, momentumFactor, lowVolFactor]

  // OLS regression: sym_ret = α + β₁·mkt + β₂·mom + β₃·lowvol + ε
  const B: number[][] = []
  const D: number[] = []

  for (const sym of symbols) {
    const y = rets[sym]
    const betas = olsMulti(y, factorMatrix)
    B.push(betas)
    const fitted = y.map((_, t) => betas.reduce((a, b, fi) => a + b * (factorMatrix[fi][t] ?? 0), 0))
    const resid  = y.map((r, t) => r - fitted[t])
    D.push(Math.max(variance(resid) * 252, 1e-8))
  }

  // Factor covariance (k × k)
  const F: number[][] = Array.from({ length: k }, () => new Array(k).fill(0))
  for (let i = 0; i < k; i++) {
    for (let j = i; j < k; j++) {
      const c = cov2d(factorMatrix[i], factorMatrix[j]) * 252
      F[i][j] = c
      F[j][i] = c
    }
  }

  // Assemble Σ = B·F·Bᵀ + diag(D)
  const totalCov: number[][] = matAdd(matMulBFBt(B, F), diag(D, n))

  return { symbols, factors, B, F, D, totalCov }
}

// ── OLS helpers ───────────────────────────────────────────────

function olsMulti(y: number[], Xs: number[][]): number[] {
  const T = y.length
  const k = Xs.length
  // Closed-form: β = (XᵀX)⁻¹ Xᵀy
  const XtX: number[][] = Array.from({ length: k }, () => new Array(k).fill(0))
  const Xty: number[]   = new Array(k).fill(0)
  for (let t = 0; t < T; t++) {
    for (let i = 0; i < k; i++) {
      Xty[i] += (Xs[i][t] ?? 0) * y[t]
      for (let j = 0; j < k; j++) {
        XtX[i][j] += (Xs[i][t] ?? 0) * (Xs[j][t] ?? 0)
      }
    }
  }
  const inv = invertSmall(XtX)
  return inv.map((row) => row.reduce((a, v, j) => a + v * Xty[j], 0))
}

function invertSmall(M: number[][]): number[][] {
  const n = M.length
  // Augmented [M | I]
  const aug = M.map((row, i) => [...row, ...new Array(n).fill(0).map((_, j) => i === j ? 1 : 0)])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[pivot][col])) pivot = row
    }
    ;[aug[col], aug[pivot]] = [aug[pivot], aug[col]]
    if (Math.abs(aug[col][col]) < 1e-12) { aug[col][col] = 1e-12 }
    const scale = aug[col][col]
    aug[col] = aug[col].map(v => v / scale)
    for (let row = 0; row < n; row++) {
      if (row !== col) {
        const factor = aug[row][col]
        aug[row] = aug[row].map((v, c) => v - factor * aug[col][c])
      }
    }
  }
  return aug.map(row => row.slice(n))
}

function matMulBFBt(B: number[][], F: number[][]): number[][] {
  const n = B.length
  const k = F.length
  const BF: number[][] = Array.from({ length: n }, () => new Array(k).fill(0))
  for (let i = 0; i < n; i++)
    for (let j = 0; j < k; j++)
      for (let l = 0; l < k; l++)
        BF[i][j] += B[i][l] * F[l][j]
  const out: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      for (let l = 0; l < k; l++)
        out[i][j] += BF[i][l] * B[j][l]
  return out
}

function matAdd(A: number[][], B: number[][]): number[][] {
  return A.map((row, i) => row.map((v, j) => v + B[i][j]))
}

function diag(d: number[], n: number): number[][] {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? d[i] : 0))
}

// ── Portfolio Risk Metrics ────────────────────────────────────

export function computePortfolioRisk(
  weights: Record<string, number>,
  cov: CovarianceMatrix,
  date: string,
): PortfolioRiskMetrics {
  const { symbols, matrix } = cov
  const wVec = symbols.map(s => weights[s] ?? 0)

  // Portfolio variance: wᵀΣw
  let portVar = 0
  for (let i = 0; i < symbols.length; i++) {
    for (let j = 0; j < symbols.length; j++) {
      portVar += wVec[i] * wVec[j] * matrix[i][j]
    }
  }
  portVar = Math.max(portVar, 0)
  const portVol = Math.sqrt(portVar * 252)

  // VaR & CVaR (parametric normal, 95% confidence)
  const Z_95 = 1.645
  const varPct = portVol / Math.sqrt(252) * Z_95 * 100
  const cvarPct = varPct * 1.25 // ≈ normal CVaR

  const absWeights = wVec.map(Math.abs)
  const gross = absWeights.reduce((a, b) => a + b, 0)
  const net   = wVec.reduce((a, b) => a + b, 0)
  const top   = Math.max(...absWeights)

  // HHI concentration
  const hhi = absWeights.reduce((a, w) => a + (gross > 0 ? (w / gross) ** 2 : 0), 0)

  // Average pairwise correlation
  let corrSum = 0, corrCount = 0
  const vols = symbols.map((_, i) => Math.sqrt(Math.max(matrix[i][i] * 252, 0)))
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      if (vols[i] > 0 && vols[j] > 0) {
        corrSum += matrix[i][j] * 252 / (vols[i] * vols[j])
        corrCount++
      }
    }
  }
  const avgCorr = corrCount > 0 ? corrSum / corrCount : 0

  return {
    date,
    grossExposure:   gross,
    netExposure:     net,
    concentrationHHI: hhi,
    portfolioVol:    portVol * 100,
    varPct,
    cvarPct,
    topHolding:      top,
    avgCorrelation:  avgCorr,
  }
}

// ── Marginal Contribution to Risk ─────────────────────────────

export function marginalContributions(
  weights: Record<string, number>,
  cov: CovarianceMatrix,
): Record<string, number> {
  const { symbols, matrix } = cov
  const wVec = symbols.map(s => weights[s] ?? 0)
  const result: Record<string, number> = {}
  let portVar = 0
  for (let i = 0; i < symbols.length; i++)
    for (let j = 0; j < symbols.length; j++)
      portVar += wVec[i] * wVec[j] * matrix[i][j]
  const portVol = Math.sqrt(Math.max(portVar, 1e-10))

  for (let i = 0; i < symbols.length; i++) {
    const margVar = symbols.reduce((a, _, j) => a + matrix[i][j] * wVec[j], 0)
    result[symbols[i]] = (wVec[i] * margVar) / portVol * 100  // % contribution
  }
  return result
}
