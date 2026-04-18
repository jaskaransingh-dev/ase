/**
 * GET /api/quant/tearsheet/[id]
 * Returns the full tear sheet, IC series, and allocation history for a completed quant run.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { strategyGrade } from '@/lib/quant/metrics'

export const dynamic = 'force-dynamic'

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = supabase()
  const { data: { user } } = await db.auth.getUser(auth.replace('Bearer ', ''))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: run, error } = await db
    .from('quant_runs')
    .select('*')
    .eq('id', id)
    .eq('owner_id', user.id)
    .single()

  if (error || !run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const ts = run.metrics as unknown as Parameters<typeof strategyGrade>[0]
  const { grade, score, breakdown } = ts ? strategyGrade(ts) : { grade: 'F', score: 0, breakdown: {} }

  return NextResponse.json({
    run_id:             run.id,
    strategy_id:        run.strategy_id,
    status:             run.status,
    date_range:         { start: run.start_date, end: run.end_date },
    symbols:            run.symbols,
    tear_sheet:         run.metrics,
    grade,
    score,
    grade_breakdown:    breakdown,
    equity_curve:       run.equity_curve,
    ic_series:          run.ic_series,
    allocation_history: run.allocation_history,
    signal_snapshots:   run.signal_snapshots,
    walkforward_windows: run.walkforward_windows,
    factor_exposures:   run.factor_exposures,
    pnl_attribution:    run.pnl_attribution,
    runtime_ms:         run.runtime_ms,
  })
}
