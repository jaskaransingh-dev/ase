/**
 * GET /api/holdings/active
 *
 * Returns every active holding for the current user — including ones whose
 * parent subscription was cancelled or whose agent is delisted. The dashboard
 * uses this to surface "orphaned" capital that's pledged but invisible from
 * the subscriptions list, so the user can reclaim it.
 *
 * Each row is enriched with the parent agent's name, slug, primary_symbol,
 * latest NAV (for current value + P&L), AND a flag indicating whether the
 * agent has run recently (idle agents are the ones the user explicitly
 * complained about — "in agents that are doing nothing").
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserFromRequest } from '@/lib/supabase/get-user'

export const dynamic = 'force-dynamic'

const IDLE_THRESHOLD_MIN = 30

export async function GET() {
  const user = await getUserFromRequest()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: holdings, error } = await admin
    .from('holdings')
    .select('id, agent_id, shares, invested_cents, status, created_at')
    .eq('user_id', user.id)
    .eq('status', 'active')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!holdings || holdings.length === 0) {
    return NextResponse.json({ holdings: [], total_invested_cents: 0, idle_invested_cents: 0 })
  }

  const agentIds = holdings.map(h => h.agent_id)

  const [agentRowsRes, statsRes, subsRes] = await Promise.all([
    admin.from('agents').select('id, name, slug, ticker, primary_symbol, status, share_price_cents, last_run_at').in('id', agentIds),
    admin.from('agent_stats').select('agent_id, nav_cents, snapshot_at').in('agent_id', agentIds).order('snapshot_at', { ascending: false }),
    admin.from('subscriptions').select('agent_id, status').eq('user_id', user.id).in('agent_id', agentIds),
  ])

  const agentMap: Record<string, { id: string; name: string; slug: string; ticker?: string; primary_symbol?: string; status: string; share_price_cents?: number; last_run_at?: string | null }> = {}
  for (const a of (agentRowsRes.data ?? [])) agentMap[a.id] = a

  const navMap: Record<string, number> = {}
  for (const s of (statsRes.data ?? [])) {
    if (!navMap[s.agent_id]) navMap[s.agent_id] = s.nav_cents
  }

  const subStatusMap: Record<string, string> = {}
  for (const s of (subsRes.data ?? [])) subStatusMap[s.agent_id] = s.status

  const idleCutoff = Date.now() - IDLE_THRESHOLD_MIN * 60_000
  let totalInvestedCents = 0
  let idleInvestedCents = 0

  const enriched = holdings.map(h => {
    const agent = agentMap[h.agent_id]
    const navCents = navMap[h.agent_id] ?? agent?.share_price_cents ?? 10_000
    const shares = Number(h.shares ?? 0)
    const investedCents = Number(h.invested_cents ?? 0)
    const currentValueCents = Math.round(shares * navCents)
    const pnlCents = currentValueCents - investedCents
    const lastRunAt = agent?.last_run_at ? new Date(agent.last_run_at).getTime() : 0
    const isIdle = !lastRunAt || lastRunAt < idleCutoff
    const subStatus = subStatusMap[h.agent_id] ?? null
    const isOrphaned = subStatus !== 'active'

    totalInvestedCents += investedCents
    if (isIdle || isOrphaned) idleInvestedCents += investedCents

    return {
      id: h.id,
      agent_id: h.agent_id,
      agent_name: agent?.name ?? '(unknown agent)',
      agent_slug: agent?.slug ?? null,
      agent_ticker: agent?.ticker ?? null,
      primary_symbol: agent?.primary_symbol ?? null,
      agent_status: agent?.status ?? 'unknown',
      shares,
      invested_cents: investedCents,
      current_value_cents: currentValueCents,
      pnl_cents: pnlCents,
      last_run_at: agent?.last_run_at ?? null,
      is_idle: isIdle,
      is_orphaned: isOrphaned,
      subscription_status: subStatus,
      created_at: h.created_at,
    }
  })

  return NextResponse.json({
    holdings: enriched,
    total_invested_cents: totalInvestedCents,
    idle_invested_cents: idleInvestedCents,
    idle_threshold_minutes: IDLE_THRESHOLD_MIN,
  })
}
