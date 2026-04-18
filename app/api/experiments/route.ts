/**
 * GET  /api/experiments  — list user's experiments
 * POST /api/experiments  — create + run a parameter sweep experiment
 *
 * Body:
 * {
 *   strategy_id:  string
 *   name:         string
 *   description?: string
 *   param_grid:   { [param]: number[] }  — e.g. { fast_period: [5,10,20], slow_period: [50,100] }
 *   strategy_id_builtin: string          — built-in strategy key (e.g. "momentum_crossover")
 *   symbol:       string
 *   interval:     string
 *   period:       string
 *   fee?:         number
 * }
 *
 * Generates every combination of params in param_grid, runs each as a backtest_run,
 * ranks by Sharpe ratio, and stores everything under one experiment record.
 *
 * Max 50 combinations per experiment to prevent runaway compute.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchYahooFinance } from '@/app/api/backtest/route'
import { runBacktest, runBuyAndHold, STRATEGIES } from '@/lib/backtest'

export const dynamic = 'force-dynamic'

const MAX_COMBOS = 50
const MAX_EQUITY_POINTS = 300

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function cartesian(grid: Record<string, number[]>): Record<string, number>[] {
  const keys = Object.keys(grid)
  if (keys.length === 0) return [{}]
  const [first, ...rest] = keys
  const subCombos = cartesian(Object.fromEntries(rest.map(k => [k, grid[k]])))
  return grid[first].flatMap(v => subCombos.map(s => ({ [first]: v, ...s })))
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabase()
  const { data: { user } } = await db.auth.getUser(auth.replace('Bearer ', ''))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await db
    .from('experiments')
    .select('id, name, description, symbol, interval, period, status, total_runs, completed_runs, created_at, completed_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ experiments: data })
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabase()
  const { data: { user } } = await db.auth.getUser(auth.replace('Bearer ', ''))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    strategy_id: string
    name: string
    description?: string
    param_grid: Record<string, number[]>
    strategy_id_builtin: string
    symbol: string
    interval: string
    period: string
    fee?: number
  }

  if (!body.strategy_id)       return NextResponse.json({ error: 'strategy_id required' }, { status: 400 })
  if (!body.name?.trim())      return NextResponse.json({ error: 'name required' },        { status: 400 })
  if (!body.param_grid)        return NextResponse.json({ error: 'param_grid required' },  { status: 400 })
  if (!STRATEGIES[body.strategy_id_builtin]) {
    return NextResponse.json({ error: `Unknown built-in strategy "${body.strategy_id_builtin}"` }, { status: 400 })
  }

  const combos = cartesian(body.param_grid)
  if (combos.length === 0) return NextResponse.json({ error: 'param_grid produced 0 combinations' }, { status: 400 })
  if (combos.length > MAX_COMBOS) {
    return NextResponse.json({ error: `Too many combinations (${combos.length}). Max is ${MAX_COMBOS}.` }, { status: 400 })
  }

  const fee = body.fee ?? 0.001
  const stratMeta = STRATEGIES[body.strategy_id_builtin]

  // Create experiment record
  const { data: experiment, error: expErr } = await db
    .from('experiments')
    .insert({
      strategy_id:  body.strategy_id,
      owner_id:     user.id,
      name:         body.name.trim(),
      description:  body.description ?? null,
      param_grid:   body.param_grid,
      symbol:       body.symbol,
      interval:     body.interval,
      period:       body.period,
      fee,
      status:       'running',
      total_runs:   combos.length,
      completed_runs: 0,
    })
    .select()
    .single()

  if (expErr || !experiment) return NextResponse.json({ error: 'Failed to create experiment' }, { status: 500 })

  // Fetch data once, reuse across all combos
  let allBars
  try {
    allBars = await fetchYahooFinance(body.symbol, body.period, body.interval)
  } catch (e) {
    await db.from('experiments').update({ status: 'failed' }).eq('id', experiment.id)
    return NextResponse.json({ error: `Data fetch failed: ${e instanceof Error ? e.message : e}` }, { status: 500 })
  }

  if (allBars.length < 60) {
    await db.from('experiments').update({ status: 'failed' }).eq('id', experiment.id)
    return NextResponse.json({ error: 'Not enough data for experiment' }, { status: 422 })
  }

  const runResults: Array<{
    params: Record<string, number>
    sharpe: number
    total_return: number
    max_drawdown: number
    win_rate: number
    bars: unknown[]
  }> = []

  // Insert all run records as pending, then execute
  const backtest_run_ids: string[] = []
  for (const combo of combos) {
    const merged = { ...stratMeta.defaultParams, ...combo }
    const { data: bRun } = await db
      .from('backtest_runs')
      .insert({
        strategy_id: body.strategy_id,
        owner_id:    user.id,
        symbol:      body.symbol,
        interval:    body.interval,
        period:      body.period,
        params:      merged,
        fee,
        run_type:    'standard',
        status:      'running',
      })
      .select('id')
      .single()
    if (bRun) backtest_run_ids.push(bRun.id)
  }

  // Run all combos
  for (let i = 0; i < combos.length; i++) {
    const combo = combos[i]
    const merged = { ...stratMeta.defaultParams, ...combo }
    const bRunId = backtest_run_ids[i]

    try {
      const result = runBacktest(allBars, body.strategy_id_builtin, merged, fee)
      const s = result.stats
      const sampledBars = result.bars.filter((_, idx) => idx % Math.max(1, Math.floor(result.bars.length / MAX_EQUITY_POINTS)) === 0)

      runResults.push({
        params:       combo,
        sharpe:       s.sharpeRatio,
        total_return: s.totalReturnPct,
        max_drawdown: s.maxDrawdownPct,
        win_rate:     s.winRate,
        bars:         sampledBars,
      })

      await db.from('backtest_runs').update({
        status:      'completed',
        train_stats: s,
        sharpe:      s.sharpeRatio,
        max_drawdown: s.maxDrawdownPct,
        composite_score: s.sharpeRatio * 0.4 - (s.maxDrawdownPct / 100) * 0.3,
        bars:        sampledBars,
      }).eq('id', bRunId)
    } catch {
      await db.from('backtest_runs').update({ status: 'failed' }).eq('id', bRunId)
      runResults.push({ params: combo, sharpe: -999, total_return: -999, max_drawdown: 100, win_rate: 0, bars: [] })
    }

    await db.from('experiments').update({ completed_runs: i + 1 }).eq('id', experiment.id)
  }

  // Rank by Sharpe
  runResults.sort((a, b) => b.sharpe - a.sharpe)
  const ranked = runResults.map((r, idx) => ({ ...r, rank: idx + 1 }))

  // Insert experiment_runs
  for (let i = 0; i < ranked.length; i++) {
    const r = ranked[i]
    const bRunId = backtest_run_ids[combos.findIndex(c => JSON.stringify(c) === JSON.stringify(r.params))]
    if (bRunId) {
      await db.from('experiment_runs').insert({
        experiment_id:   experiment.id,
        backtest_run_id: bRunId,
        params:          r.params,
        sharpe:          r.sharpe,
        total_return:    r.total_return,
        max_drawdown:    r.max_drawdown,
        win_rate:        r.win_rate,
        rank:            r.rank,
      })
    }
  }

  await db
    .from('experiments')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', experiment.id)

  return NextResponse.json({
    experiment_id: experiment.id,
    total_runs:    combos.length,
    results:       ranked,
    best:          ranked[0] ?? null,
    buy_hold:      runBuyAndHold(allBars),
  })
}
