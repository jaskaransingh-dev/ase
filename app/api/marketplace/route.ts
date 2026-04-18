/**
 * GET  /api/marketplace  — paginated list of active listings, sorted by rank_score
 * POST /api/marketplace  — submit a strategy for marketplace listing
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

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const page  = parseInt(searchParams.get('page')  ?? '1')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50)
  const sort  = searchParams.get('sort') ?? 'rank'   // rank | return | sharpe | drawdown
  const tag   = searchParams.get('tag')

  const db = supabase()

  let query = db
    .from('marketplace_listings')
    .select(`
      id, tagline, tags, price_cents, is_free,
      rank_score, sharpe, max_drawdown, total_return, win_rate, backtest_period,
      subscriber_count, view_count, listed_at,
      strategy:strategy_id(id, slug, name, description, symbol, interval),
      owner:owner_id(display_name)
    `)
    .eq('status', 'active')

  if (tag) query = query.contains('tags', [tag])

  const sortCol: Record<string, string> = {
    rank:     'rank_score',
    return:   'total_return',
    sharpe:   'sharpe',
    drawdown: 'max_drawdown',
  }
  query = query
    .order(sortCol[sort] ?? 'rank_score', { ascending: sort === 'drawdown' })
    .range((page - 1) * limit, page * limit - 1)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ listings: data ?? [], page, limit, total: count })
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabase()
  const { data: { user } } = await db.auth.getUser(auth.replace('Bearer ', ''))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    strategy_id:     string
    backtest_run_id: string
    tagline?:        string
    tags?:           string[]
    price_cents?:    number
    is_free?:        boolean
  }

  if (!body.strategy_id)     return NextResponse.json({ error: 'strategy_id required' },     { status: 400 })
  if (!body.backtest_run_id) return NextResponse.json({ error: 'backtest_run_id required' },  { status: 400 })

  // Verify ownership + strategy is validated
  const { data: strategy } = await db
    .from('strategies')
    .select('id, status, name')
    .eq('id', body.strategy_id)
    .eq('owner_id', user.id)
    .single()

  if (!strategy) return NextResponse.json({ error: 'Strategy not found' }, { status: 404 })
  if (!['validated', 'listed'].includes(strategy.status)) {
    return NextResponse.json({ error: 'Strategy must be validated before listing' }, { status: 422 })
  }

  // Verify backtest run is completed and belongs to this strategy
  const { data: bRun } = await db
    .from('backtest_runs')
    .select('id, status, sharpe, max_drawdown, full_stats, period')
    .eq('id', body.backtest_run_id)
    .eq('strategy_id', body.strategy_id)
    .eq('owner_id', user.id)
    .single()

  if (!bRun) return NextResponse.json({ error: 'Backtest run not found' }, { status: 404 })
  if (bRun.status !== 'completed') return NextResponse.json({ error: 'Backtest run must be completed' }, { status: 422 })

  // Minimum quality gate: Sharpe ≥ 0.5 and max drawdown ≤ 50%
  if ((bRun.sharpe ?? 0) < 0.5) {
    return NextResponse.json({ error: 'Sharpe ratio must be ≥ 0.5 to list' }, { status: 422 })
  }
  if ((bRun.max_drawdown ?? 100) > 50) {
    return NextResponse.json({ error: 'Max drawdown must be ≤ 50% to list' }, { status: 422 })
  }

  const stats = bRun.full_stats as Record<string, number> | null
  const rankScore = (bRun.sharpe ?? 0) * 0.4
    - ((bRun.max_drawdown ?? 100) / 100) * 0.3
    - 0.3 * 0.3   // placeholder stability

  // Upsert listing (allow re-listing with a new qualifying run)
  const { data: listing, error: listErr } = await db
    .from('marketplace_listings')
    .upsert({
      strategy_id:     body.strategy_id,
      owner_id:        user.id,
      backtest_run_id: body.backtest_run_id,
      tagline:         body.tagline ?? null,
      tags:            body.tags    ?? [],
      price_cents:     body.price_cents ?? 999,
      is_free:         body.is_free ?? false,
      rank_score:      rankScore,
      sharpe:          bRun.sharpe,
      max_drawdown:    bRun.max_drawdown,
      total_return:    stats?.totalReturnPct ?? null,
      win_rate:        stats?.winRate ?? null,
      backtest_period: bRun.period,
      status:          'pending_review',
    }, { onConflict: 'strategy_id' })
    .select()
    .single()

  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 })

  // Mark strategy as listed
  await db.from('strategies').update({ status: 'listed' }).eq('id', body.strategy_id)

  return NextResponse.json({ listing }, { status: 201 })
}
