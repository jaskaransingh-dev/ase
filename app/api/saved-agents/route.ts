/**
 * GET/POST/DELETE /api/saved-agents
 * Save/favorite agents
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const lightweight = searchParams.get('lightweight')

    if (lightweight === 'true') {
      const { data: saved } = await supabase
        .from('saved_agents')
        .select('agent_id, agents(id, name, slug)')
        .order('created_at', { ascending: false })
      return NextResponse.json({ saved_agents: saved || [] })
    }

    const { data: savedAgents } = await supabase
      .from('saved_agents')
      .select('id, agent_id, created_at, agents(id, name, slug, ticker, description, strategy_type, status, total_aum_cents, share_price_cents, agent_stats(nav_cents, total_return_pct, sharpe_ratio, max_drawdown_pct, win_rate_pct, total_trades, snapshot_at))')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    return NextResponse.json({ saved_agents: savedAgents || [] })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { agent_id } = await request.json()
    if (!agent_id) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

    const { data: existing } = await supabase
      .from('saved_agents')
      .select('id')
      .eq('user_id', user.id)
      .eq('agent_id', agent_id)
      .single()

    if (existing) {
      return NextResponse.json({ saved: true, message: 'Already saved' })
    }

    const { error } = await supabase
      .from('saved_agents')
      .insert({ user_id: user.id, agent_id })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ saved: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const agent_id = searchParams.get('agent_id')
    if (!agent_id) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

    const { error } = await supabase
      .from('saved_agents')
      .delete()
      .eq('user_id', user.id)
      .eq('agent_id', agent_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ saved: false })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}