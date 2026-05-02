/**
 * POST /api/holdings/deallocate-all
 *
 * Sells every active holding for the current user and returns the proceeds
 * to their Kraken cash. Used by the dashboard "Reclaim idle capital" CTA
 * for the case where holdings are orphaned (no active subscription) or
 * tied to agents that haven't run recently.
 *
 * Body (optional): { only_idle?: boolean } — when true, skip holdings whose
 * agent has run inside the last 30 min. Defaults to false (sell everything).
 *
 * The actual sell logic stays in /api/holdings/sell so we don't drift —
 * this endpoint just iterates and aggregates. Failures on one holding don't
 * stop the others; they're returned in a per-holding result list.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const IDLE_THRESHOLD_MIN = 30

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const onlyIdle = !!body?.only_idle

    const admin = createAdminClient()

    const { data: holdings, error } = await admin
      .from('holdings')
      .select('id, agent_id, shares, invested_cents')
      .eq('user_id', user.id)
      .eq('status', 'active')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!holdings || holdings.length === 0) {
      return NextResponse.json({ ok: true, sold: 0, returned_cents: 0, results: [] })
    }

    let targetIds = holdings.map(h => h.id)

    if (onlyIdle) {
      const cutoff = new Date(Date.now() - IDLE_THRESHOLD_MIN * 60_000).toISOString()
      const { data: agentRows } = await admin
        .from('agents')
        .select('id, last_run_at')
        .in('id', holdings.map(h => h.agent_id))
      const idleAgentIds = new Set(
        (agentRows ?? [])
          .filter(a => !a.last_run_at || a.last_run_at < cutoff)
          .map(a => a.id)
      )
      targetIds = holdings.filter(h => idleAgentIds.has(h.agent_id)).map(h => h.id)
    }

    if (targetIds.length === 0) {
      return NextResponse.json({ ok: true, sold: 0, returned_cents: 0, results: [], message: onlyIdle ? 'No idle holdings — every agent is currently running.' : 'No active holdings.' })
    }

    // Forward the user's auth so /api/holdings/sell sees them as the caller.
    const cookieHeader = req.headers.get('cookie') ?? ''
    const origin = new URL(req.url).origin

    const results: Array<{ holding_id: string; ok: boolean; returned_cents?: number; pnl_cents?: number; error?: string }> = []

    for (const holdingId of targetIds) {
      try {
        const res = await fetch(`${origin}/api/holdings/sell`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie: cookieHeader },
          body: JSON.stringify({ holding_id: holdingId }),
        })
        const data = await res.json()
        if (!res.ok) {
          results.push({ holding_id: holdingId, ok: false, error: data.error ?? 'Sell failed' })
        } else {
          results.push({
            holding_id: holdingId,
            ok: true,
            returned_cents: data.returned_cents ?? 0,
            pnl_cents: data.pnl_cents ?? 0,
          })
        }
      } catch (e) {
        results.push({ holding_id: holdingId, ok: false, error: e instanceof Error ? e.message : 'Network failure' })
      }
    }

    const returnedCents = results.reduce((sum, r) => sum + (r.returned_cents ?? 0), 0)
    const sold = results.filter(r => r.ok).length

    return NextResponse.json({
      ok: true,
      sold,
      failed: results.length - sold,
      returned_cents: returnedCents,
      total_pnl_cents: results.reduce((sum, r) => sum + (r.pnl_cents ?? 0), 0),
      results,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Internal error' }, { status: 500 })
  }
}
