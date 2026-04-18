/**
 * POST /api/strategies/[id]/backtest
 *
 * Runs a formal backtest with train/validation/test splits.
 * Final test-set stats are stored but NOT returned until the strategy is listed
 * (anti-overfitting: quants can't optimize against the hidden test window).
 *
 * Body:
 * {
 *   symbol?:        string   — e.g. "BTC-USD"  (defaults to strategy.symbol)
 *   interval?:      string   — "1d" | "4h" | etc.
 *   period?:        string   — "1y" | "2y" | "5y"
 *   params?:        object   — overrides strategy defaults
 *   fee?:           number   — per-trade fee fraction (default 0.001)
 *   run_type?:      "standard" | "walk_forward" | "monte_carlo"
 *   train_pct?:     number   — 0.0-1.0 (default 0.6)
 *   val_pct?:       number   — 0.0-1.0 (default 0.2)
 *   // walk_forward options
 *   train_days?:    number
 *   test_days?:     number
 *   // monte_carlo options
 *   n_trials?:      number
 *   window_days?:   number
 *   seed?:          number
 * }
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchYahooFinance } from '@/app/api/backtest/route'
import { runBacktest, runBuyAndHold, runWalkForward, runMonteCarlo, STRATEGIES, OHLCV } from '@/lib/backtest'

export const dynamic = 'force-dynamic'

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const MAX_EQUITY_POINTS = 500

function sampleBars(bars: unknown[], n: number): unknown[] {
  if (bars.length <= n) return bars
  const step = Math.floor(bars.length / n)
  return bars.filter((_, i) => i % step === 0)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = supabase()
  const { data: { user } } = await db.auth.getUser(auth.replace('Bearer ', ''))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Load strategy
  const { data: strategy, error: fetchErr } = await db
    .from('strategies')
    .select('*')
    .eq('id', id)
    .eq('owner_id', user.id)
    .single()

  if (fetchErr || !strategy) return NextResponse.json({ error: 'Strategy not found' }, { status: 404 })
  if (strategy.status === 'draft') {
    return NextResponse.json({ error: 'Validate your strategy before running a backtest' }, { status: 422 })
  }

  // Rate-limit: max 10 formal backtests per strategy per day
  const { count } = await db
    .from('backtest_runs')
    .select('id', { count: 'exact', head: true })
    .eq('strategy_id', id)
    .gte('created_at', new Date(Date.now() - 86400000).toISOString())

  if ((count ?? 0) >= 10) {
    return NextResponse.json({ error: 'Daily backtest limit (10) reached for this strategy' }, { status: 429 })
  }

  const body = await req.json() as {
    symbol?: string
    interval?: string
    period?: string
    params?: Record<string, number>
    fee?: number
    run_type?: 'standard' | 'walk_forward' | 'monte_carlo'
    train_pct?: number
    val_pct?: number
    train_days?: number
    test_days?: number
    n_trials?: number
    window_days?: number
    seed?: number
    strategy_id?: string  // built-in strategy id from lib/backtest
  }

  const symbol   = body.symbol   ?? strategy.symbol   ?? 'BTC-USD'
  const interval = body.interval ?? strategy.interval ?? '1d'
  const period   = body.period   ?? '2y'
  const fee      = body.fee      ?? 0.001
  const runType  = body.run_type ?? 'standard'
  const trainPct = body.train_pct ?? 0.6
  const valPct   = body.val_pct   ?? 0.2
  const strategyId = body.strategy_id ?? 'momentum_crossover'

  if (!STRATEGIES[strategyId]) {
    return NextResponse.json({ error: `Unknown built-in strategy "${strategyId}"` }, { status: 400 })
  }

  const mergedParams = { ...STRATEGIES[strategyId].defaultParams, ...(strategy.params as object), ...(body.params ?? {}) }

  // Create a pending run record
  const { data: run, error: runErr } = await db
    .from('backtest_runs')
    .insert({
      strategy_id:    id,
      owner_id:       user.id,
      symbol,
      interval,
      period,
      params:         mergedParams,
      fee,
      run_type:       runType,
      split_train_pct: trainPct,
      split_val_pct:  valPct,
      status:         'running',
    })
    .select()
    .single()

  if (runErr || !run) return NextResponse.json({ error: 'Failed to create run' }, { status: 500 })

  const startMs = Date.now()

  try {
    const allBars = await fetchYahooFinance(symbol, period, interval)
    if (allBars.length < 120) throw new Error(`Not enough data: ${allBars.length} bars (need ≥120)`)

    // Split bars into train / val / test
    const n = allBars.length
    const trainEnd  = Math.floor(n * trainPct)
    const valEnd    = Math.floor(n * (trainPct + valPct))
    const trainBars = allBars.slice(0, trainEnd)
    const valBars   = allBars.slice(trainEnd, valEnd)
    const testBars  = allBars.slice(valEnd)     // hidden

    let trainStats = null, valStats = null, testStats = null
    let wfResult = null, mcResult = null
    let fullBars = allBars

    if (runType === 'walk_forward') {
      const trainDays = body.train_days ?? 252
      const testDays  = body.test_days  ?? 63
      wfResult = runWalkForward(allBars, strategyId, mergedParams, { fee }, trainDays, testDays)
    } else if (runType === 'monte_carlo') {
      const nTrials    = body.n_trials    ?? 80
      const windowDays = body.window_days ?? 180
      const seed       = body.seed        ?? 42
      mcResult = runMonteCarlo(allBars, strategyId, mergedParams, nTrials, windowDays, fee)
    } else {
      // Standard split backtest
      if (trainBars.length >= 60) {
        const r = runBacktest(trainBars, strategyId, mergedParams, fee)
        trainStats = r.stats
      }
      if (valBars.length >= 30) {
        const r = runBacktest(valBars, strategyId, mergedParams, fee)
        valStats = r.stats
      }
      if (testBars.length >= 30) {
        const r = runBacktest(testBars, strategyId, mergedParams, fee)
        testStats = r.stats   // stored but NOT returned
      }
      const fullResult = runBacktest(allBars, strategyId, mergedParams, fee)
      trainStats = trainStats ?? fullResult.stats
      fullBars = fullResult.bars as unknown as OHLCV[]
    }

    // Stability: std of rolling Sharpe windows (lower = better)
    const sharpe = trainStats?.sharpeRatio ?? 0
    const maxDD  = trainStats?.maxDrawdownPct ?? 100
    const stability = 0.3   // placeholder — real value from rolling Sharpe std

    const compositeScore = (sharpe * 0.40) - (maxDD / 100 * 0.30) - (stability * 0.30)

    await db
      .from('backtest_runs')
      .update({
        status:              'completed',
        train_stats:         trainStats,
        val_stats:           valStats,
        test_stats:          testStats,   // hidden
        full_stats:          trainStats,
        bars:                sampleBars(fullBars, MAX_EQUITY_POINTS),
        walk_forward_result: wfResult,
        monte_carlo_result:  mcResult,
        sharpe,
        max_drawdown:        maxDD,
        stability_score:     stability,
        composite_score:     compositeScore,
        duration_ms:         Date.now() - startMs,
      })
      .eq('id', run.id)

    // Return train + val only (never test)
    return NextResponse.json({
      run_id:       run.id,
      symbol,
      interval,
      period,
      run_type:     runType,
      splits: {
        train_bars: trainBars.length,
        val_bars:   valBars.length,
        test_bars:  testBars.length,  // count only, no stats
      },
      train_stats:         trainStats,
      val_stats:           valStats,
      bars:                sampleBars(fullBars, MAX_EQUITY_POINTS),
      buy_hold:            runBuyAndHold(allBars),
      walk_forward_result: wfResult,
      monte_carlo_result:  mcResult,
      composite_score:     compositeScore,
      sharpe,
      max_drawdown:        maxDD,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Backtest failed'
    await db.from('backtest_runs').update({ status: 'failed', error: msg }).eq('id', run.id)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
