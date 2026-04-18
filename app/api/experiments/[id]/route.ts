/**
 * GET /api/experiments/[id]
 * Returns experiment + all ranked runs for the comparison UI.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

  const { data: experiment, error } = await db
    .from('experiments')
    .select('*')
    .eq('id', id)
    .eq('owner_id', user.id)
    .single()

  if (error || !experiment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: runs } = await db
    .from('experiment_runs')
    .select(`
      id, params, sharpe, total_return, max_drawdown, win_rate, rank,
      backtest_run:backtest_run_id(id, bars, train_stats, status, duration_ms)
    `)
    .eq('experiment_id', id)
    .order('rank', { ascending: true })

  return NextResponse.json({ experiment, runs: runs ?? [] })
}
