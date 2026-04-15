/**
 * POST /api/backtest/save — Save a backtest result to the user's history
 * GET  /api/backtest/save?id= — Load a saved backtest by ID
 * DELETE /api/backtest/save?id= — Delete a saved backtest
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, name, symbol, strategy, params, period, results, share_token, is_public } = body

    const admin = createAdminClient()

    if (id) {
      // Update existing
      const { data, error } = await admin
        .from('saved_backtests')
        .update({ name, symbol, strategy, params, period, results, share_token, is_public, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ saved: data })
    }

    // Insert new — get user_id from session
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Must be logged in to save backtests' }, { status: 401 })
    }

    const { data, error } = await admin
      .from('saved_backtests')
      .insert({ user_id: user.id, name, symbol, strategy, params: params ?? {}, period, results, share_token, is_public })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ saved: data })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Save failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const shareToken = searchParams.get('token')

  const admin = createAdminClient()

  // Share token lookup (public)
  if (shareToken) {
    const { data, error } = await admin
      .from('saved_backtests')
      .select('*')
      .eq('share_token', shareToken)
      .single()
    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ backtest: data })
  }

  // ID lookup
  if (id) {
    const { data, error } = await admin
      .from('saved_backtests')
      .select('*')
      .eq('id', id)
      .single()
    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ backtest: data })
  }

  // List user's saved backtests
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await admin
    .from('saved_backtests')
    .select('id, name, symbol, strategy, period, created_at, share_token, is_public')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ backtests: data })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('saved_backtests').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
