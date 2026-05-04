/**
 * GET /api/account/portfolio-history?days=30
 * Returns hourly portfolio value snapshots for the authenticated user.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const days = Math.min(parseInt(req.nextUrl.searchParams.get('days') ?? '30', 10), 365)
  const since = new Date(Date.now() - days * 86_400_000).toISOString()

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('user_portfolio_snapshots')
    .select('snapshot_at, total_value_cents, invested_cents, cash_cents, pnl_cents')
    .eq('user_id', user.id)
    .gte('snapshot_at', since)
    .order('snapshot_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ snapshots: data ?? [] })
}
