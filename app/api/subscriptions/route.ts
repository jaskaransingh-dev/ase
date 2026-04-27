/**
 * /api/subscriptions
 *
 * GET  — list current user's active subscriptions with holdings
 * POST — subscribe to an agent with investment { agent_id, amount_cents }
 * DELETE — cancel subscription  { agent_id }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  
  // Get user's active subscriptions
  const { data: subscriptions, error } = await admin
    .from('subscriptions')
    .select(`
      *,
      agents(id, name, slug, ticker, description, strategy_type, status, signal_summary, monthly_fee_cents, subscriber_count, primary_symbol)
    `)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  
  // Fetch latest NAV for all agent IDs in one batch
  const agentIds = (subscriptions ?? []).map(s => s.agent_id)
  const navMap: Record<string, number> = {}
  if (agentIds.length > 0) {
    const { data: statsRows } = await admin
      .from('agent_stats')
      .select('agent_id, nav_cents, snapshot_at')
      .in('agent_id', agentIds)
      .order('snapshot_at', { ascending: false })
    for (const row of (statsRows ?? [])) {
      if (!navMap[row.agent_id]) navMap[row.agent_id] = row.nav_cents
    }
    // Also fall back to agents.share_price_cents
    const { data: agentRows } = await admin
      .from('agents')
      .select('id, share_price_cents')
      .in('id', agentIds)
    for (const a of (agentRows ?? [])) {
      if (!navMap[a.id] && a.share_price_cents) navMap[a.id] = a.share_price_cents
    }
  }

  // For each subscription, get the holding with current value computed from live NAV
  const subscriptionsWithHoldings = await Promise.all((subscriptions ?? []).map(async (sub) => {
    const { data: holding } = await admin
      .from('holdings')
      .select('id, shares, invested_cents, status')
      .eq('user_id', user.id)
      .eq('agent_id', sub.agent_id)
      .eq('status', 'active')
      .maybeSingle()

    const navCents = navMap[sub.agent_id] ?? 10_000
    const shares = Number(holding?.shares ?? 0)
    const investedCents = Number(holding?.invested_cents ?? 0)
    const currentValueCents = holding ? Math.round(shares * navCents) : 0
    const pnlCents = holding ? currentValueCents - investedCents : 0

    return {
      ...sub,
      holding: holding ? {
        id: holding.id,
        shares,
        invested_cents: investedCents,
        current_value_cents: currentValueCents,
        pnl_cents: pnlCents,
      } : null,
      has_investment: !!(holding && investedCents > 0),
    }
  }))

  return NextResponse.json({ subscriptions: subscriptionsWithHoldings })
}

export async function POST(req: Request) {
  // This endpoint is deprecated - use /api/subscribe instead which handles both subscription and investment
  return NextResponse.json({ 
    error: 'Use /api/subscribe to invest in an agent. This endpoint creates free subscriptions which are no longer supported.' 
  }, { status: 410 })
}

export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { agent_id?: string }
  const { agent_id } = body
  if (!agent_id) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

  const admin = createAdminClient()
  
  // Cancel subscription
  const { error } = await admin
    .from('subscriptions')
    .update({ status: 'cancelled' })
    .eq('user_id', user.id)
    .eq('agent_id', agent_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  
  // Also mark holding as exited (don't delete, just mark status)
  await admin
    .from('holdings')
    .update({ status: 'exited' })
    .eq('user_id', user.id)
    .eq('agent_id', agent_id)
    .eq('status', 'active')

  return NextResponse.json({ success: true })
}
