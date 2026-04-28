/**
 * POST /api/quant/run
 *
 * Full 9-layer quant strategy backtest:
 *   data → features → alpha → forecast → risk model →
 *   portfolio optimizer → risk manager → execution → metrics
 *
 * Body:
 * {
 *   strategy_id?:    uuid          — load from DB, or use inline package
 *   template?:       string        — "momentum_conservative" | "composite_balanced" | etc.
 *   alpha_type?:     string        — "momentum" | "mean_reversion" | "composite" | "ml"
 *   alpha_weights?:  object        — { momentum: 0.4, mean_reversion: 0.3, ... }
 *   symbols?:        string[]      — override universe
 *   start_date?:     string        — ISO date (default: 2 years ago)
 *   end_date?:       string        — ISO date (default: today)
 *   initial_capital?:number        — default 1_000_000
 *   rebalance_freq?: string        — "daily" | "weekly" | "monthly"
 *   risk_aversion?:  number        — optimizer λ
 *   max_weight?:     number        — per-name cap
 *   walk_forward?:   boolean       — also run walk-forward analysis
 *   save?:           boolean       — save to quant_runs table
 * }
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchYahooFinance } from '@/app/api/backtest/route'
import { quantBacktester } from '@/lib/quant/backtester'
import { buildStrategyPackage, STRATEGY_TEMPLATES, describeStrategy } from '@/lib/quant/strategy'
import { strategyGrade } from '@/lib/quant/metrics'
import type { QuantStrategyPackage, Bar, BarPanel } from '@/lib/quant/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 120   // 2 minutes

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function sampleArray<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr
  const step = Math.floor(arr.length / n)
  return arr.filter((_, i) => i % step === 0)
}

export async function GET() {
  return NextResponse.json({
    templates: Object.keys(STRATEGY_TEMPLATES),
    alpha_types: ['momentum', 'mean_reversion', 'volatility', 'volume', 'composite', 'ml'],
    default_symbols: ['BTC-USD','ETH-USD','SOL-USD','BNB-USD','ADA-USD'],
  })
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  let userId: string | null = null
  if (auth) {
    const db = supabase()
    const { data: { user } } = await db.auth.getUser(auth.replace('Bearer ', ''))
    userId = user?.id ?? null
  }

  const body = await req.json() as {
    strategy_id?:    string
    template?:       string
    alpha_type?:     string
    alpha_weights?:  Record<string, number>
    symbols?:        string[]
    start_date?:     string
    end_date?:       string
    initial_capital?: number
    rebalance_freq?: 'daily' | 'weekly' | 'monthly'
    risk_aversion?:  number
    max_weight?:     number
    walk_forward?:   boolean
    save?:           boolean
    forecast_horizon?: number
    signal_scale_bps?: number
    benchmark?:      string
  }

  const template = body.template ?? 'composite_balanced'
  if (!STRATEGY_TEMPLATES[template]) {
    return NextResponse.json({ error: `Unknown template "${template}". Valid: ${Object.keys(STRATEGY_TEMPLATES).join(', ')}` }, { status: 400 })
  }

  // Build strategy package
  const overrides: Partial<Omit<QuantStrategyPackage, 'id' | 'name'>> = {}
  if (body.alpha_type) overrides.alphaType = body.alpha_type as QuantStrategyPackage['alphaType']
  if (body.alpha_weights) overrides.alphaWeights = body.alpha_weights
  if (body.rebalance_freq) overrides.rebalanceFreq = body.rebalance_freq
  if (body.forecast_horizon) overrides.forecastHorizon = body.forecast_horizon
  if (body.signal_scale_bps) overrides.signalScaleBps = body.signal_scale_bps
  if (body.symbols) overrides.universeConfig = {
      symbols:       body.symbols,
      minAdvUsd:     500_000,
      minPriceUsd:   0.001,
      maxAssets:     body.symbols.length,
      rebalanceFreq: body.rebalance_freq ?? 'daily',
    }
  if (body.risk_aversion != null || body.max_weight != null) overrides.optimizerConfig = {
      ...body.risk_aversion != null && { riskAversion: body.risk_aversion },
      ...body.max_weight != null && { maxWeight: body.max_weight },
    } as Partial<QuantStrategyPackage['optimizerConfig']> as QuantStrategyPackage['optimizerConfig']
  const pkg: QuantStrategyPackage = buildStrategyPackage(
    body.strategy_id ?? 'adhoc',
    template,
    template as keyof typeof STRATEGY_TEMPLATES,
    overrides,
  )

  const endDate   = body.end_date   ?? new Date().toISOString().slice(0, 10)
  const startDate = body.start_date ?? new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10)
  const capital   = body.initial_capital ?? 1_000_000
  const benchmark = body.benchmark ?? 'BTC-USD'

  const symbols = pkg.universeConfig.symbols
  if (!symbols.length) return NextResponse.json({ error: 'No symbols in universe' }, { status: 400 })

  // Fetch data for all symbols + benchmark
  const allSymbols = [...new Set([benchmark, ...symbols])]
  const panelEntries = await Promise.allSettled(
    allSymbols.map(async sym => {
      const raw = await fetchYahooFinance(sym, '2y', '1d')
      const bars: Bar[] = raw.map(b => ({
        date:   b.date,
        open:   b.open,
        high:   b.high,
        low:    b.low,
        close:  b.close,
        volume: b.volume,
      }))
      return [sym, bars] as [string, Bar[]]
    })
  )

  const panel: BarPanel = {}
  for (const result of panelEntries) {
    if (result.status === 'fulfilled') {
      const [sym, bars] = result.value
      const filtered = bars.filter(b => b.date >= startDate && b.date <= endDate)
      if (filtered.length >= 60) panel[sym] = filtered
    }
  }

  if (Object.keys(panel).length < 2) {
    return NextResponse.json({ error: 'Not enough symbols with sufficient data (need ≥2 with ≥60 bars)' }, { status: 422 })
  }

  // Update pkg universe to only include symbols we have data for (exclude benchmark)
  pkg.universeConfig.symbols = Object.keys(panel)

  // Compute benchmark CAGR for comparison
  const benchStartPrice = panel[benchmark]?.find(b => b.date >= startDate)?.close ?? 1
  const benchEndPrice = panel[benchmark]?.filter(b => b.date <= endDate).at(-1)?.close ?? benchStartPrice
  const benchYears = Math.max((new Date(endDate).getTime() - new Date(startDate).getTime()) / (365.25 * 86400000), 0.01)
  const benchCagrValue = Math.pow(benchEndPrice / benchStartPrice, 1 / benchYears) - 1

  const startMs = Date.now()

  try {
    const result = await quantBacktester.run(pkg, panel, {
      startDate,
      endDate,
      initialCapital: capital,
      feeBps:         pkg.executionConfig.slippageBps,
      symbols:        Object.keys(panel),
      rebalanceFreq:  pkg.rebalanceFreq,
    })

    const { grade, score, breakdown } = strategyGrade(result.tearSheet)

    let walkForwardResult = null
    if (body.walk_forward) {
      try {
        walkForwardResult = await quantBacktester.walkForward(pkg, panel, startDate, endDate, 126, 42, capital)
      } catch { /* skip if not enough data */ }
    }

    // Sample heavy arrays for response size
    const sampledEquity     = sampleArray(result.equityCurve, 500)
    const sampledAllocations = sampleArray(result.allocationHistory, 100)
    const sampledSignals    = sampleArray(result.signalHistory, 50)

    // Optionally save to DB
    let savedRunId: string | null = null
    if (body.save && userId && body.strategy_id) {
      const db = supabase()
      const { data: saved } = await db.from('quant_runs').insert({
        strategy_id:       body.strategy_id,
        owner_id:          userId,
        symbols,
        start_date:        startDate,
        end_date:          endDate,
        rebalance_freq:    pkg.rebalanceFreq,
        initial_capital:   capital,
        fee_bps:           pkg.executionConfig.slippageBps,
        equity_curve:      sampledEquity,
        ic_series:         result.icSeries,
        allocation_history: sampledAllocations,
        signal_snapshots:  sampledSignals,
        metrics:           result.tearSheet,
        walkforward_windows: walkForwardResult?.windows ?? [],
        status:            'completed',
        runtime_ms:        Date.now() - startMs,
      }).select('id').single()
      savedRunId = saved?.id ?? null

      if (savedRunId) {
        await db.rpc('upsert_quant_leaderboard', {
          p_strategy_id: body.strategy_id,
          p_run_id:      savedRunId,
          p_metrics:     result.tearSheet,
        })
      }
    }

    return NextResponse.json({
      run_id:             savedRunId,
      strategy_summary:   describeStrategy(pkg),
      symbols:            Object.keys(panel),
      date_range:         { start: startDate, end: endDate },
      n_rebalances:       result.allocationHistory.length,
      n_trades:           result.fills.length,
      runtime_ms:         Date.now() - startMs,

      // Performance
      tear_sheet:         result.tearSheet,
      grade,
      score,
      grade_breakdown:    breakdown,

      // Equity curve (sampled)
      equity_curve:       sampledEquity,
      benchmark_equity:   sampleArray(result.benchmarkEquity.map((e, i) => ({
        i, equity: e,
      })), 500),

      // Signal quality
      ic_series:          result.icSeries,

      // Allocation history (sampled)
      allocation_history: sampledAllocations,
      final_positions:    result.finalPositions,

      // Trade ledger
      fills:              result.fills,
      orders:             result.orders,
      signal_history:      sampledSignals,

      // Walk-forward
      walk_forward:       walkForwardResult,

      // Monte Carlo robustness (200 trials on random windows)
      monte_carlo:        runMonteCarloSimple(result.equityCurve, 200, 126),

      // VaR (95th and 99th percentile daily losses)
      var_95:             percentile(result.equityCurve.map(e => e.dailyReturn).filter(isFinite), 0.05),
      var_99:             percentile(result.equityCurve.map(e => e.dailyReturn).filter(isFinite), 0.01),
      cvar_95:            cvarCalc(result.equityCurve.map(e => e.dailyReturn).filter(isFinite), 0.05),

      // Benchmark comparison
      benchmark_cagr:     benchCagrValue * 100,
      alpha_vs_benchmark: result.tearSheet.alphaAnnualizedPct,
      beta_to_benchmark:  result.tearSheet.betaToMarket,
      tracking_error:     result.tearSheet.informationRatio > 0
                           ? (result.tearSheet.cagr * 100 - benchCagrValue) / result.tearSheet.informationRatio * 100
                           : null,

      // Trade ledger (detailed fills)
      trade_ledger:       result.fills.map(f => ({
        date:             f.date,
        symbol:           f.symbol,
        side:             f.side,
        shares:           f.filledShares,
        price:            f.avgPrice,
        notional:         f.filledShares * f.avgPrice,
        slippage_bps:     f.slippageBps,
        commission:       f.commission,
        total_cost:       f.totalCostUsd,
      })),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Backtest failed'
    console.error('[quant/run]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function percentile(arr: number[], p: number): number {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length * p)] ?? sorted[sorted.length - 1]
}

function cvarCalc(returns: number[], alpha: number): number {
  if (!returns.length) return 0
  const sorted = [...returns].sort((a, b) => a - b)
  const cutoff = Math.floor(sorted.length * alpha)
  if (cutoff === 0) return sorted[0]
  const tail = sorted.slice(0, cutoff)
  return tail.reduce((a, b) => a + b, 0) / tail.length
}

function runMonteCarloSimple(equity: { equity: number; date: string }[], nTrials: number, windowDays: number) {
  const dailyRets = equity.slice(1).map((e, i) => (e.equity - equity[i].equity) / equity[i].equity)
  if (dailyRets.length < windowDays + 10) return null

  const trials: Array<{ returnPct: number; sharpe: number; maxDD: number }> = []
  for (let t = 0; t < nTrials; t++) {
    const startIdx = Math.floor(Math.random() * (dailyRets.length - windowDays))
    const window = dailyRets.slice(startIdx, startIdx + windowDays)
    if (window.length < 30) continue

    let equity = 1
    let peak = 1
    let maxDD = 0
    for (const r of window) {
      equity *= (1 + r)
      if (equity > peak) peak = equity
      const dd = (equity - peak) / peak
      if (dd < maxDD) maxDD = dd
    }
    const totalRet = equity - 1
    const annRet = Math.pow(1 + totalRet, 252 / window.length) - 1
    const vol = Math.sqrt(window.reduce((s, r) => s + r * r, 0) / window.length - Math.pow(window.reduce((s, r) => s + r, 0) / window.length, 2)) * Math.sqrt(252)
    const sharpe = vol > 0 ? annRet / vol : 0

    trials.push({ returnPct: totalRet * 100, sharpe, maxDD: maxDD * 100 })
  }

  if (!trials.length) return null
  const returns = trials.map(t => t.returnPct).sort((a, b) => a - b)
  const sharpes = trials.map(t => t.sharpe).sort((a, b) => a - b)
  const mid = Math.floor(returns.length / 2)

  return {
    nTrials: trials.length,
    windowDays,
    medianReturn: returns[mid],
    p10Return: returns[Math.floor(returns.length * 0.1)],
    p90Return: returns[Math.floor(returns.length * 0.9)],
    medianSharpe: sharpes[sharpes.length / 2 | 0],
    medianMaxDD: trials.map(t => t.maxDD).sort((a, b) => a - b)[mid],
    beatBuyHoldRate: trials.filter(t => t.returnPct > 0).length / trials.length,
  }
}
