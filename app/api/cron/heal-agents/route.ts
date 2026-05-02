/**
 * GET/POST /api/cron/heal-agents
 *
 * Self-healing watchdog. Runs every 15 min on Vercel Cron and:
 *
 *   1. Finds active agents whose `last_run_at` is older than the
 *      heartbeat threshold (default 20 min — looser than the 5-min
 *      run-agents cadence so we don't double-fire on slow ticks).
 *   2. Triggers /api/cron/run-agents for each stale one with
 *      `agent_id` scoped, so missed cycles get filled in.
 *   3. Records what it healed for observability.
 *
 * This is the safety net that answers "ensure the agent is always
 * trading" — even if a tick gets killed mid-loop or a deploy interrupts
 * the cron, the next heal pass picks it up.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const STALE_MINUTES = 20

export async function GET(req: NextRequest) { return heal(req) }
export async function POST(req: NextRequest) { return heal(req) }

async function heal(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const headerSecret = req.headers.get('x-cron-secret')
    const authHeader = req.headers.get('authorization')
    const bearerSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (headerSecret !== cronSecret && bearerSecret !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString()

  // Stale = active AND (never run OR last_run_at older than cutoff)
  const { data: stale, error } = await admin
    .from('agents')
    .select('id, slug, last_run_at')
    .eq('status', 'active')
    .or(`last_run_at.is.null,last_run_at.lt.${cutoff}`)
    .limit(50)

  if (error) {
    console.error('[heal-agents] query failed:', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  if (!stale || stale.length === 0) {
    return NextResponse.json({ ok: true, healed: 0, ran_at: new Date().toISOString() })
  }

  console.log(`[heal-agents] ${stale.length} stale agents to heal`)

  // Trigger run-agents for each stale one. We post sequentially so we
  // don't fan out and overwhelm Yahoo / Kraken rate limits.
  const origin = new URL(req.url).origin
  const healed: { slug: string; ok: boolean; error?: string }[] = []
  for (const a of stale) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (cronSecret) headers['x-cron-secret'] = cronSecret
      const res = await fetch(`${origin}/api/cron/run-agents`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ agent_id: a.id }),
      })
      healed.push({ slug: a.slug, ok: res.ok })
    } catch (e) {
      healed.push({ slug: a.slug, ok: false, error: e instanceof Error ? e.message : 'fetch failed' })
    }
  }

  return NextResponse.json({
    ok: true,
    healed: healed.filter(h => h.ok).length,
    failed: healed.filter(h => !h.ok).length,
    details: healed,
    stale_threshold_minutes: STALE_MINUTES,
    ran_at: new Date().toISOString(),
  })
}
