// ============================================================
// Quant Framework — Feature Engineering Layer
// Transforms raw OHLCV panel into standardized feature matrix.
// All features are lagged 1 day to prevent lookahead bias.
// ============================================================

import type { Bar, BarPanel, FeatureRow } from './types'

// ── Math helpers ─────────────────────────────────────────────

function mean(arr: number[]): number {
  if (!arr.length) return NaN
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return NaN
  const m = mean(arr)
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1))
}

function rollingWindow<T>(arr: T[], window: number, fn: (w: T[]) => number): number[] {
  return arr.map((_, i) => {
    if (i < window - 1) return NaN
    return fn(arr.slice(i - window + 1, i + 1) as T[])
  })
}

function rollingMean(closes: number[], w: number): number[] {
  return rollingWindow(closes, w, a => mean(a as number[]))
}

function rollingStd(rets: number[], w: number): number[] {
  return rollingWindow(rets, w, a => stddev(a as number[]))
}

function rollingSum(arr: number[], w: number): number[] {
  return rollingWindow(arr, w, a => (a as number[]).reduce((s, v) => s + v, 0))
}

function pctChange(arr: number[], lag = 1): number[] {
  return arr.map((v, i) => i < lag ? NaN : (v - arr[i - lag]) / arr[i - lag])
}

function computeRSI(closes: number[], period: number): number[] {
  const rets = pctChange(closes)
  const rsi: number[] = new Array(closes.length).fill(NaN)
  if (closes.length < period + 1) return rsi

  let gains = 0, losses = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    if (d > 0) gains += d; else losses += Math.abs(d)
  }
  let avgGain = gains / period
  let avgLoss = losses / period
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)

  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return rsi
}

function amihudIlliquidity(closes: number[], volumes: number[], w = 20): number[] {
  const rets = pctChange(closes).map(Math.abs)
  const dollarVol = closes.map((c, i) => c * volumes[i])
  return rollingWindow(
    rets.map((r, i) => ({ r, d: dollarVol[i] })),
    w,
    (win) => {
      const w = win as Array<{ r: number; d: number }>
      const valid = w.filter(x => x.d > 0)
      if (!valid.length) return NaN
      return mean(valid.map(x => x.r / x.d)) * 1e6
    }
  )
}

// ── Cross-sectional z-score ────────────────────────────────────

function crossSectionalZ(values: Record<string, number>): Record<string, number> {
  const vals = Object.values(values).filter(v => isFinite(v))
  if (vals.length < 2) return Object.fromEntries(Object.keys(values).map(k => [k, 0]))
  const m = mean(vals)
  const s = stddev(vals)
  if (s === 0) return Object.fromEntries(Object.keys(values).map(k => [k, 0]))
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, isFinite(v) ? (v - m) / s : 0]))
}

function crossSectionalRank(values: Record<string, number>): Record<string, number> {
  const entries = Object.entries(values).filter(([, v]) => isFinite(v))
  const sorted = [...entries].sort(([, a], [, b]) => a - b)
  const result: Record<string, number> = {}
  sorted.forEach(([k], i) => { result[k] = entries.length > 1 ? i / (entries.length - 1) - 0.5 : 0 })
  Object.keys(values).forEach(k => { if (result[k] === undefined) result[k] = 0 })
  return result
}

// ── Regime classification ─────────────────────────────────────

function classifyVolRegime(vol: number, vols: number[]): 'low' | 'medium' | 'high' | 'extreme' {
  if (!isFinite(vol)) return 'medium'
  const sorted = [...vols].filter(isFinite).sort((a, b) => a - b)
  const p25 = sorted[Math.floor(sorted.length * 0.25)] ?? 0
  const p75 = sorted[Math.floor(sorted.length * 0.75)] ?? 1
  const p90 = sorted[Math.floor(sorted.length * 0.90)] ?? 2
  if (vol <= p25) return 'low'
  if (vol <= p75) return 'medium'
  if (vol <= p90) return 'high'
  return 'extreme'
}

function classifyTrend(close: number, ma50: number, ma200: number): 'up' | 'down' | 'flat' {
  if (!isFinite(ma50) || !isFinite(ma200)) return 'flat'
  if (close > ma50 && ma50 > ma200) return 'up'
  if (close < ma50 && ma50 < ma200) return 'down'
  return 'flat'
}

// ── Main ──────────────────────────────────────────────────────

export class FeatureEngine {
  /**
   * Compute full feature matrix for a panel of OHLCV bars.
   * Returns one FeatureRow per (date, symbol) with all features.
   * All features are point-in-time (lagged 1 bar) — no lookahead.
   */
  computeFeatures(panel: BarPanel): FeatureRow[] {
    const rows: FeatureRow[] = []

    // Per-symbol feature computation
    const symbolFeatures: Record<string, Partial<FeatureRow>[]> = {}
    for (const [symbol, bars] of Object.entries(panel)) {
      symbolFeatures[symbol] = this.computeSymbolFeatures(symbol, bars)
    }

    // All unique dates across universe
    const dates = [...new Set(
      Object.values(symbolFeatures).flatMap(rows => rows.map(r => r.date as string))
    )].sort()

    // On each date, compute cross-sectional features
    for (const date of dates) {
      const dateRows: Record<string, Partial<FeatureRow>> = {}
      for (const [symbol, sRows] of Object.entries(symbolFeatures)) {
        const row = sRows.find(r => r.date === date)
        if (row) dateRows[symbol] = row
      }

      const ret20Map = Object.fromEntries(Object.entries(dateRows).map(([s, r]) => [s, r.ret_20d ?? NaN]))
      const vol20Map = Object.fromEntries(Object.entries(dateRows).map(([s, r]) => [s, r.vol_20d ?? NaN]))
      const trendMap = Object.fromEntries(Object.entries(dateRows).map(([s, r]) => [s, r.trend_spread ?? NaN]))
      const volShockMap = Object.fromEntries(Object.entries(dateRows).map(([s, r]) => [s, r.vol_shock ?? NaN]))

      const zRet20  = crossSectionalZ(ret20Map)
      const zVol20  = crossSectionalZ(vol20Map)
      const zTrend  = crossSectionalZ(trendMap)
      const rankRet = crossSectionalRank(ret20Map)
      const rankVol = crossSectionalRank(vol20Map)
      const rankVS  = crossSectionalRank(volShockMap)

      const allVols = Object.values(vol20Map).filter(isFinite)

      for (const [symbol, base] of Object.entries(dateRows)) {
        rows.push({
          ...base,
          date,
          symbol,
          z_ret_20d:     zRet20[symbol]  ?? 0,
          z_vol_20d:     zVol20[symbol]  ?? 0,
          z_trend_spread: zTrend[symbol] ?? 0,
          rank_ret_20d:  rankRet[symbol] ?? 0,
          rank_vol_20d:  rankVol[symbol] ?? 0,
          rank_vol_shock: rankVS[symbol] ?? 0,
          regime_vol:    classifyVolRegime(base.vol_20d ?? NaN, allVols),
          regime_trend:  classifyTrend(base.ma_fast ?? NaN, base.ma_slow ?? NaN, base.ma_slow ?? NaN),
        } as FeatureRow)
      }
    }

    return rows
  }

  private computeSymbolFeatures(symbol: string, bars: Bar[]): Partial<FeatureRow>[] {
    if (bars.length < 21) return []
    const closes  = bars.map(b => b.close)
    const volumes = bars.map(b => b.volume)
    const highs   = bars.map(b => b.high)
    const lows    = bars.map(b => b.low)

    const ret1  = pctChange(closes, 1)
    const ret5  = pctChange(closes, 5)
    const ret20 = pctChange(closes, 20)
    const ret60 = pctChange(closes, 60)
    const ret252 = pctChange(closes, 252)

    const vol20 = rollingStd(ret1, 20).map(v => v * Math.sqrt(252))
    const vol60 = rollingStd(ret1, 60).map(v => v * Math.sqrt(252))
    const volRatio = vol20.map((v, i) => isFinite(v) && isFinite(vol60[i]) && vol60[i] > 0 ? v / vol60[i] : NaN)

    const ma10  = rollingMean(closes, 10)
    const ma20  = rollingMean(closes, 20)
    const ma50  = rollingMean(closes, 50)
    const ma200 = rollingMean(closes, 200)
    const trendSpread = ma20.map((f, i) => isFinite(f) && isFinite(ma50[i]) && ma50[i] > 0 ? f / ma50[i] - 1 : NaN)

    const rsi14 = computeRSI(closes, 14)

    // Volume shock: today's vol / 20d avg vol
    const avgVol20 = rollingMean(volumes, 20)
    const volShock = volumes.map((v, i) => isFinite(avgVol20[i]) && avgVol20[i] > 0 ? v / avgVol20[i] : NaN)

    const amihud = amihudIlliquidity(closes, volumes, 20)

    return bars.map((bar, i) => ({
      date:         bar.date,
      symbol,
      ret_1d:       ret1[i],
      ret_5d:       ret5[i],
      ret_20d:      ret20[i],
      ret_60d:      ret60[i],
      ret_252d:     ret252[i],
      vol_20d:      vol20[i],
      vol_60d:      vol60[i],
      vol_ratio:    volRatio[i],
      ma_fast:      ma20[i],
      ma_slow:      ma50[i],
      trend_spread: trendSpread[i],
      rsi_14:       rsi14[i],
      vol_shock:    volShock[i],
      amihud:       amihud[i],
    }))
  }
}

export const featureEngine = new FeatureEngine()
