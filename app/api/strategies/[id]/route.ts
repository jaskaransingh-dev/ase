/**
 * GET    /api/strategies/[id]  — fetch one strategy (owner only)
 * PUT    /api/strategies/[id]  — update code/params (bumps version on code change)
 * DELETE /api/strategies/[id]  — delete strategy
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

export const dynamic = 'force-dynamic'

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function getUser(req: Request) {
  const auth = req.headers.get('authorization')
  if (!auth) return null
  const db = supabase()
  const { data: { user } } = await db.auth.getUser(auth.replace('Bearer ', ''))
  return user
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = supabase()
  const { data, error } = await db
    .from('strategies')
    .select(`
      *,
      strategy_versions(id, version, code_hash, params, dataset_version, change_note, created_at),
      backtest_runs(id, run_type, status, sharpe, max_drawdown, composite_score, created_at)
    `)
    .eq('id', id)
    .eq('owner_id', user.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ strategy: data })
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    name?: string
    description?: string
    code?: string
    params?: Record<string, number>
    symbol?: string
    interval?: string
  }

  const db = supabase()
  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name.trim()
  if (body.description !== undefined) updates.description = body.description
  if (body.params !== undefined) updates.params = body.params
  if (body.symbol !== undefined) updates.symbol = body.symbol
  if (body.interval !== undefined) updates.interval = body.interval
  if (body.code !== undefined) {
    updates.code = body.code
    updates.code_hash = createHash('sha256').update(body.code).digest('hex')
    updates.status = 'draft'  // reset validation on code change
  }

  const { data, error } = await db
    .from('strategies')
    .update(updates)
    .eq('id', id)
    .eq('owner_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ strategy: data })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = supabase()
  const { error } = await db
    .from('strategies')
    .delete()
    .eq('id', id)
    .eq('owner_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
