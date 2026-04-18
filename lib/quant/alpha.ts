// ============================================================
// Quant Framework — Alpha Model Layer
// Converts features → normalized signal scores → return forecasts.
// Output is always cross-sectionally z-scored, centered at 0.
// ============================================================

import type { FeatureRow, SignalRow, SignalSnapshot } from './types'

// ── Base interface ────────────────────────────────────────────

export abstract class AlphaModel {
  abstract name: string

  abstract score(features: FeatureRow): number

  /**
   * Compute signals for all symbols on a given date.
   * Automatically cross-sectionally normalizes scores.
   */
  computeSignals(
    rows: FeatureRow[],
    signalScaleBps = 20,
  ): SignalSnapshot {
    const rawScores: Record<string, number> = {}
    for (const row of rows) {
      if (!isFinite(row.ret_20d)) continue
      rawScores[row.symbol] = this.score(row)
    }

    // Cross-sectional z-score
    const vals = Object.values(rawScores).filter(isFinite)
    const m  = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
    const sd = vals.length > 1
      ? Math.sqrt(vals.reduce((a, v) => a + (v - m) ** 2, 0) / (vals.length - 1))
      : 1

    const snapshot: SignalSnapshot = {}
    for (const [symbol, raw] of Object.entries(rawScores)) {
      const z = sd > 0 ? (raw - m) / sd : 0
      const rank = computeRank(rawScores, symbol)
      snapshot[symbol] = {
        date:         rows[0].date,
        symbol,
        raw_score:    raw,
        z_score:      z,
        rank_score:   rank,
        forecast_ret: z * signalScaleBps, // bps
      }
    }
    return snapshot
  }
}

function computeRank(scores: Record<string, number>, symbol: string): number {
  const vals = Object.values(scores).filter(isFinite).sort((a, b) => a - b)
  const v = scores[symbol]
  if (!isFinite(v) || vals.length === 0) return 0
  const pos = vals.findIndex(x => x >= v)
  return vals.length > 1 ? pos / (vals.length - 1) - 0.5 : 0
}

// ── Momentum Alpha ────────────────────────────────────────────
// Classic cross-sectional momentum: rank by trailing return,
// penalised by short-term reversal and excess vol.

export class MomentumAlpha extends AlphaModel {
  name = 'momentum'

  constructor(
    private params = {
      w_ret20:  0.40,
      w_ret60:  0.30,
      w_trend:  0.20,
      w_vol_pen: -0.10,  // penalise high volatility
    },
  ) { super() }

  score(f: FeatureRow): number {
    const { w_ret20, w_ret60, w_trend, w_vol_pen } = this.params
    return (
      w_ret20  * (isFinite(f.ret_20d)      ? f.ret_20d      : 0) +
      w_ret60  * (isFinite(f.ret_60d)      ? f.ret_60d      : 0) +
      w_trend  * (isFinite(f.trend_spread) ? f.trend_spread : 0) +
      w_vol_pen * (isFinite(f.vol_20d)     ? f.vol_20d      : 0)
    )
  }
}

// ── Mean Reversion Alpha ──────────────────────────────────────
// Short-term reversal: fade overextended RSI, buy vol spikes

export class MeanReversionAlpha extends AlphaModel {
  name = 'mean_reversion'

  constructor(
    private params = {
      rsi_oversold:  30,
      rsi_overbought: 70,
      w_rsi:        -0.50,   // negative: buy oversold
      w_ret5:       -0.30,   // fade 5-day momentum
      w_vol_shock:   0.20,   // buy vol spikes
    },
  ) { super() }

  score(f: FeatureRow): number {
    const { w_rsi, w_ret5, w_vol_shock } = this.params
    // Normalise RSI to [-1, +1]: -1 = oversold (buy signal), +1 = overbought (sell)
    const rsi_norm = isFinite(f.rsi_14) ? (f.rsi_14 - 50) / 50 : 0
    return (
      w_rsi       * rsi_norm +
      w_ret5      * (isFinite(f.ret_5d)    ? f.ret_5d    : 0) +
      w_vol_shock * (isFinite(f.vol_shock) ? Math.min(f.vol_shock, 3) : 0)
    )
  }
}

// ── Volatility Alpha ──────────────────────────────────────────
// Low-vol anomaly: persistently lower volatility → better risk-adj returns

export class VolatilityAlpha extends AlphaModel {
  name = 'volatility'

  score(f: FeatureRow): number {
    // Score high for low vol, low for high vol
    // Also penalise vol expansion (high vol_ratio)
    const vol = isFinite(f.vol_20d) ? f.vol_20d : 0.5
    const ratio = isFinite(f.vol_ratio) ? f.vol_ratio : 1.0
    return -vol - 0.3 * (ratio - 1)
  }
}

// ── Volume Alpha ──────────────────────────────────────────────
// Informed order flow proxy: volume shock combined with direction

export class VolumeAlpha extends AlphaModel {
  name = 'volume'

  score(f: FeatureRow): number {
    const vs = isFinite(f.vol_shock) ? Math.min(f.vol_shock, 4) : 0
    const ret = isFinite(f.ret_1d) ? f.ret_1d : 0
    // High volume + positive return = strong buy signal
    return vs * Math.sign(ret) * Math.abs(ret)
  }
}

// ── Composite Alpha ───────────────────────────────────────────
// Weighted combination of multiple alpha models.
// Diversification across uncorrelated signals improves IC stability.

export class CompositeAlpha extends AlphaModel {
  name = 'composite'

  private models: AlphaModel[]
  private weights: number[]

  constructor(
    weights: {
      momentum?:       number
      mean_reversion?: number
      volatility?:     number
      volume?:         number
    } = { momentum: 0.40, mean_reversion: 0.35, volatility: 0.15, volume: 0.10 },
  ) {
    super()
    this.models  = []
    this.weights = []

    if (weights.momentum       !== undefined) { this.models.push(new MomentumAlpha());      this.weights.push(weights.momentum) }
    if (weights.mean_reversion !== undefined) { this.models.push(new MeanReversionAlpha()); this.weights.push(weights.mean_reversion) }
    if (weights.volatility     !== undefined) { this.models.push(new VolatilityAlpha());    this.weights.push(weights.volatility) }
    if (weights.volume         !== undefined) { this.models.push(new VolumeAlpha());        this.weights.push(weights.volume) }

    // Normalise weights
    const sum = this.weights.reduce((a, b) => a + Math.abs(b), 0)
    if (sum > 0) this.weights = this.weights.map(w => w / sum)
  }

  score(f: FeatureRow): number {
    return this.models.reduce((total, model, i) => total + this.weights[i] * model.score(f), 0)
  }
}

// ── ML Alpha (gradient boosted proxy) ────────────────────────
// Deterministic feature-weighted model that approximates
// a trained boosted tree for demonstration purposes.
// In production this would deserialise a trained model artifact.

export class MLAlpha extends AlphaModel {
  name = 'ml'

  // Learned feature importance weights (normalised)
  private readonly featureWeights: Record<string, number> = {
    ret_20d:      0.22,
    ret_60d:      0.18,
    vol_ratio:    -0.12,
    trend_spread: 0.15,
    rsi_14:       -0.08,  // negative: RSI > 50 → sell; < 50 → buy (reversal)
    vol_shock:    0.10,
    ret_5d:       -0.09,  // short-term reversal
    amihud:       -0.06,  // penalise illiquid names
  }

  score(f: FeatureRow): number {
    // Simple depth-2 tree proxy
    let score = 0
    const vals: Record<string, number> = {
      ret_20d:      isFinite(f.ret_20d)      ? f.ret_20d      : 0,
      ret_60d:      isFinite(f.ret_60d)      ? f.ret_60d      : 0,
      vol_ratio:    isFinite(f.vol_ratio)    ? f.vol_ratio - 1 : 0,
      trend_spread: isFinite(f.trend_spread) ? f.trend_spread : 0,
      rsi_14:       isFinite(f.rsi_14)       ? (f.rsi_14 - 50) / 50 : 0,
      vol_shock:    isFinite(f.vol_shock)    ? Math.min(f.vol_shock - 1, 2) : 0,
      ret_5d:       isFinite(f.ret_5d)       ? f.ret_5d       : 0,
      amihud:       isFinite(f.amihud)       ? -Math.min(f.amihud, 10) : 0,
    }

    for (const [feat, w] of Object.entries(this.featureWeights)) {
      score += w * (vals[feat] ?? 0)
    }

    // Interaction term: momentum × vol regime
    if (f.regime_vol === 'low' && isFinite(f.ret_20d) && f.ret_20d > 0) {
      score += 0.05 * f.ret_20d
    }

    return score
  }
}

// ── Factory ───────────────────────────────────────────────────

export function createAlphaModel(
  type: 'momentum' | 'mean_reversion' | 'volatility' | 'volume' | 'composite' | 'ml',
  weights?: Record<string, number>,
): AlphaModel {
  switch (type) {
    case 'momentum':       return new MomentumAlpha()
    case 'mean_reversion': return new MeanReversionAlpha()
    case 'volatility':     return new VolatilityAlpha()
    case 'volume':         return new VolumeAlpha()
    case 'ml':             return new MLAlpha()
    case 'composite':
    default:
      return new CompositeAlpha(weights ?? {})
  }
}

// ── Information Coefficient ───────────────────────────────────
// Measures signal quality: IC = correlation between forecast and realised return.

export function computeIC(
  signals: Record<string, number>,   // symbol → forecast_ret
  realisedRets: Record<string, number>, // symbol → actual next-period return
): number {
  const symbols = Object.keys(signals).filter(s => s in realisedRets)
  if (symbols.length < 5) return NaN

  const xs = symbols.map(s => signals[s])
  const ys = symbols.map(s => realisedRets[s])

  const mx = xs.reduce((a, b) => a + b, 0) / xs.length
  const my = ys.reduce((a, b) => a + b, 0) / ys.length
  const cov = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.length
  const sx = Math.sqrt(xs.reduce((a, x) => a + (x - mx) ** 2, 0) / xs.length)
  const sy = Math.sqrt(ys.reduce((a, y) => a + (y - my) ** 2, 0) / ys.length)
  if (sx === 0 || sy === 0) return NaN
  return cov / (sx * sy)
}

// Rank IC (Spearman correlation) — more robust to outliers
export function computeRankIC(
  signals: Record<string, number>,
  realisedRets: Record<string, number>,
): number {
  const symbols = Object.keys(signals).filter(s => s in realisedRets)
  if (symbols.length < 5) return NaN

  const toRanks = (vals: number[]) => {
    const sorted = [...vals].map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
    const ranks = new Array(vals.length)
    sorted.forEach(({ i }, rank) => { ranks[i] = rank + 1 })
    return ranks
  }

  const xRanks = toRanks(symbols.map(s => signals[s]))
  const yRanks = toRanks(symbols.map(s => realisedRets[s]))

  return computeIC(
    Object.fromEntries(symbols.map((s, i) => [s, xRanks[i]])),
    Object.fromEntries(symbols.map((s, i) => [s, yRanks[i]])),
  )
}
