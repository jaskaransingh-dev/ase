/**
 * GET /api/quant/agent/ledger?agent_id=...&limit=100
 * Returns the public paper-trade ledger for one agent.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const agentId = url.searchParams.get('agent_id')
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10), 500)
  if (!agentId) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('agent_paper_ledger')
    .select('*')
    .eq('agent_id', agentId)
    .order('executed_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ trades: data ?? [] })
}
