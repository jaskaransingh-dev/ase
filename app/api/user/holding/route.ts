import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// GET /api/user/holding?agent_id=xxx
// Returns the authenticated user's active holding for a given agent
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const agentId = req.nextUrl.searchParams.get('agent_id')
  if (!agentId) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

  const admin = createAdminClient()

  const { data: holding } = await admin
    .from('holdings')
    .select('id, shares, invested_cents, status, created_at')
    .eq('user_id', user.id)
    .eq('agent_id', agentId)
    .eq('status', 'active')
    .maybeSingle()

  // Get current NAV for valuation
  let navCents = 10_000
  if (holding) {
    const { data: stats } = await admin
      .from('agent_stats')
      .select('nav_cents')
      .eq('agent_id', agentId)
      .order('snapshot_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (stats?.nav_cents) navCents = stats.nav_cents
  }

  const currentValueCents = holding
    ? Math.round((holding.shares ?? 0) * navCents)
    : 0
  const pnlCents = holding ? currentValueCents - (holding.invested_cents ?? 0) : 0

  return NextResponse.json({
    holding: holding ? {
      id: holding.id,
      shares: holding.shares,
      invested_cents: holding.invested_cents,
      current_value_cents: currentValueCents,
      pnl_cents: pnlCents,
      status: holding.status,
    } : null,
  })
}
