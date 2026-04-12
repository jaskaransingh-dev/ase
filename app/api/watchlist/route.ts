/**
 * GET /api/watchlist
 * Get user's watchlist agents with stats
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: watchlist } = await supabase
      .from('watchlist')
      .select('id, agent_id, created_at, agents(id, name, slug, primary_symbol, strategy_type)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    return NextResponse.json({ watchlist: watchlist || [] })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}