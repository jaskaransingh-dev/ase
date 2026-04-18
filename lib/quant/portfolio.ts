// ============================================================
// Quant Framework — Portfolio Optimizer
// Solves mean-variance and risk-parity problems under constraints.
// Pure TypeScript — no external solver dependency.
// ============================================================

import type { CovarianceMatrix, OptimizerConfig, AllocationRow } from './types'

// ── Helpers ───────────────────────────────────────────────────

function dot(a: number[], b: number[]): number {
  return a.reduce((s, v, i) => s + v * b[i], 0)
}

function matVec(M: number[][], v: number[]): number[] {
  return M.map(row => dot(row, v))
}

function vecAdd(a: number[], b: number[]): number[] {
  return a.map((v, i) => v + b[i])
}

function vecScale(a: number[], s: number): number[] {
  return a.map(v => v * s)
}

function norm(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0))
}

function clip(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

// ── Unconstrained Mean-Variance (closed-form) ─────────────────
// w* = (1/λ) · Σ⁻¹ · μ

function meanVarianceUnconstrained(
  mu: number[],
  cov: number[][],
  riskAversion: number,
): number[] {
  const inv = invertMatrix(cov)
  const w = matVec(inv, mu).map(v => v / riskAversion)
  return w
}

// ── Projected Gradient Descent ────────────────────────────────
// For constrained mean-variance with per-name bounds and leverage

function projectOntoSimplex(
  w: number[],
  lo: number,
  hi: number,
  leverage: number,
): number[] {
  // Project each weight to [lo, hi], then rescale to match leverage target
  const clipped = w.map(v => clip(v, lo, hi))
  const gross = clipped.reduce((a, v) => a + Math.abs(v), 0)
  if (gross === 0) return clipped.map(() => 0)
  // Rescale gross to target leverage
  return clipped.map(v => v * leverage / gross)
}

function constrainedMeanVariance(
  mu: number[],
  cov: number[][],
  config: OptimizerConfig,
  currentWeights: number[],
): number[] {
  const n = mu.length
  const { riskAversion, turnoverPenalty, maxWeight, minWeight, leverage } = config

  // Initialise from current weights or unconstrained solution
  let w = [...currentWeights]
  if (w.every(x => x === 0)) {
    w = meanVarianceUnconstrained(mu, cov, riskAversion)
    w = projectOntoSimplex(w, minWeight, maxWeight, leverage)
  }

  const lr  = 0.01
  const maxIter = 300
  let prevObj = Infinity

  for (let iter = 0; iter < maxIter; iter++) {
    // Gradient of f = -μᵀw + λ·wᵀΣw + γ·|w - w_prev|
    const Sw = matVec(cov, w)
    const grad = w.map((wi, i) => {
      const g = -mu[i] + 2 * riskAversion * Sw[i]
      // Turnover penalty gradient
      const diff = wi - currentWeights[i]
      return g + turnoverPenalty * Math.sign(diff)
    })

    // Gradient step
    const wNew = w.map((wi, i) => wi - lr * grad[i])

    // Project onto feasible set
    const wProj = projectOntoSimplex(wNew, minWeight, maxWeight, leverage)

    const obj = computeObjective(wProj, mu, cov, riskAversion, turnoverPenalty, currentWeights)

    if (Math.abs(prevObj - obj) < 1e-8 || norm(wProj.map((v, i) => v - w[i])) < 1e-6) {
      w = wProj
      break
    }
    prevObj = obj
    w = wProj
  }

  return w
}

function computeObjective(
  w: number[],
  mu: number[],
  cov: number[][],
  lambda: number,
  gamma: number,
  prevW: number[],
): number {
  const Sw = matVec(cov, w)
  const ret = dot(mu, w)
  const risk = dot(w, Sw)
  const turnover = w.reduce((a, wi, i) => a + Math.abs(wi - prevW[i]), 0)
  return -ret + lambda * risk + gamma * turnover
}

// ── Risk Parity ───────────────────────────────────────────────
// All positions contribute equally to total portfolio variance

function riskParityWeights(cov: number[][]): number[] {
  const n = cov.length
  let w = new Array(n).fill(1 / n)

  for (let iter = 0; iter < 500; iter++) {
    const portVar = Math.max(w.reduce((a, wi, i) => a + wi * dot(cov[i], w), 0), 1e-10)
    const portVol = Math.sqrt(portVar)

    // Marginal risk contribution
    const mrc = cov.map(row => dot(row, w) / portVol)
    const riskContrib = w.map((wi, i) => wi * mrc[i])
    const targetContrib = portVol / n  // equal contribution

    // Update weights proportionally
    const wNew = w.map((wi, i) => wi * targetContrib / Math.max(riskContrib[i], 1e-10))
    const gross = wNew.reduce((a, b) => a + Math.abs(b), 0)
    const wNorm = wNew.map(v => v / gross)

    if (norm(wNorm.map((v, i) => v - w[i])) < 1e-8) { w = wNorm; break }
    w = wNorm
  }
  return w
}

// ── Minimum Variance ──────────────────────────────────────────

function minVarianceWeights(cov: number[][], maxWeight: number): number[] {
  const n = cov.length
  // Use equal weights as starting point, then optimise
  return constrainedMeanVariance(
    new Array(n).fill(0),  // no return target
    cov,
    {
      method: 'min_variance', riskAversion: 50,
      turnoverPenalty: 0, maxWeight, minWeight: 0,
      leverage: 1, sectorNeutral: false, maxTurnover: 1,
    },
    new Array(n).fill(1 / n),
  )
}

// ── Matrix inversion (Gauss-Jordan) ──────────────────────────

function invertMatrix(M: number[][]): number[][] {
  const n = M.length
  const aug = M.map((row, i) => [...row, ...new Array(n).fill(0).map((_, j) => i === j ? 1 : 0)])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let row = col + 1; row < n; row++)
      if (Math.abs(aug[row][col]) > Math.abs(aug[pivot][col])) pivot = row
    ;[aug[col], aug[pivot]] = [aug[pivot], aug[col]]
    if (Math.abs(aug[col][col]) < 1e-12) aug[col][col] = 1e-12
    const s = aug[col][col]
    aug[col] = aug[col].map(v => v / s)
    for (let row = 0; row < n; row++) {
      if (row !== col) {
        const f = aug[row][col]
        aug[row] = aug[row].map((v, c) => v - f * aug[col][c])
      }
    }
  }
  return aug.map(row => row.slice(n))
}

// ── Main Optimizer ────────────────────────────────────────────

export class PortfolioOptimizer {
  optimize(
    forecasts: Record<string, number>,        // symbol → expected return (bps)
    cov: CovarianceMatrix,
    config: OptimizerConfig,
    currentWeights: Record<string, number>,
    date: string,
  ): AllocationRow {
    const { symbols, matrix } = cov
    const n = symbols.length

    if (n === 0) return {
      date, weights: {}, grossExposure: 0, netExposure: 0, turnover: 0, cash: 1,
    }

    // Scale forecasts from bps to decimal
    const mu = symbols.map(s => (forecasts[s] ?? 0) / 10000)
    const prevW = symbols.map(s => currentWeights[s] ?? 0)

    let wArr: number[]

    switch (config.method) {
      case 'equal_weight':
        wArr = new Array(n).fill(config.leverage / n)
        break

      case 'risk_parity': {
        const rp = riskParityWeights(matrix)
        wArr = rp.map(w => w * config.leverage)
        break
      }

      case 'min_variance':
        wArr = minVarianceWeights(matrix, config.maxWeight)
        wArr = wArr.map(w => w * config.leverage)
        break

      case 'mean_variance':
      default:
        wArr = constrainedMeanVariance(mu, matrix, config, prevW)
        break
    }

    // Drop very small positions (noise filter)
    const minAbsWeight = 0.005
    wArr = wArr.map(w => Math.abs(w) < minAbsWeight ? 0 : w)

    // Re-project after zeroing
    const gross = wArr.reduce((a, v) => a + Math.abs(v), 0)
    if (gross > 0 && Math.abs(gross - config.leverage) > 0.05) {
      wArr = wArr.map(w => w * config.leverage / gross)
    }

    const weights: Record<string, number> = {}
    symbols.forEach((s, i) => { if (wArr[i] !== 0) weights[s] = wArr[i] })

    const grossExposure = wArr.reduce((a, w) => a + Math.abs(w), 0)
    const netExposure   = wArr.reduce((a, w) => a + w, 0)
    const turnover = symbols.reduce((a, s, i) => a + Math.abs((wArr[i] ?? 0) - (currentWeights[s] ?? 0)), 0) / 2

    return {
      date,
      weights,
      grossExposure,
      netExposure,
      turnover,
      cash: Math.max(1 - grossExposure, 0),
    }
  }
}

export const portfolioOptimizer = new PortfolioOptimizer()
