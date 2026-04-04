import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentHoldings } from '@/lib/agents'

export const dynamic = 'force-dynamic'

export async function GET() {
  const admin = createAdminClient()

  const { data: agents } = await admin
    .from('agents')
    .select('id, slug, name')
    .eq('status', 'active')

  const results: Record<string, any> = {}

  for (const agent of agents ?? []) {
    try {
      const holdings = await getCurrentHoldings(admin, agent.id)
      results[agent.slug] = {
        agent_name: agent.name,
        holdings,
        total_market_value_cents: holdings.reduce((s, h) => s + h.market_value_cents, 0),
        total_unrealized_pnl_cents: holdings.reduce((s, h) => s + h.unrealized_pnl_cents, 0),
      }
    } catch (err) {
      results[agent.slug] = { error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  return NextResponse.json({ ok: true, holdings: results })
}
