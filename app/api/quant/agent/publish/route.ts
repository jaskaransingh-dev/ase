/**
 * POST /api/quant/agent/publish?id=<agentId>
 *
 * NO GATING (test mode): flips status='published' so the agent is visible
 * on the exchange and the cadence-based paper-trade scheduler will pick it up.
 *
 * Body: { live?: boolean }   // default false → paper trades only
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { live?: boolean }

  // Read agent
  const { data: agent, error: readErr } = await supabase
    .from('ai_agents').select('*').eq('id', id).eq('owner_id', user.id).single()
  if (readErr || !agent) return NextResponse.json({ error: 'agent not found' }, { status: 404 })

  // No gating, no risk-grade requirement — testing mode.
  const admin = createAdminClient()
  const { data: published, error: writeErr } = await admin
    .from('ai_agents')
    .update({ status: 'published', spec: { ...(agent.spec as object), live_mode: !!body.live } })
    .eq('id', id)
    .select('id, name, status, spec')
    .single()

  if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 500 })

  return NextResponse.json({
    agent: published,
    note: body.live
      ? 'Published in LIVE mode — broker execution required at cadence.'
      : 'Published in PAPER mode — trades will be posted to the public ledger every cadence interval.',
  })
}
