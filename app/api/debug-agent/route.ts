import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  
  try {
    const slug = 'mean-reversion-pro'
    
    // Test agent query
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, name, slug, description, strategy_type, status, total_aum_cents')
      .eq('slug', slug)
      .single()

    if (agentError) {
      return NextResponse.json({ 
        error: 'Agent query failed',
        details: agentError 
      }, { status: 500 })
    }

    // Test stats query
    const { data: stats, error: statsError } = await supabase
      .from('agent_stats')
      .select('id, nav_cents, total_return_pct, sharpe_ratio, max_drawdown_pct, win_rate_pct, total_trades, snapshot_at')
      .eq('agent_id', agent?.id ?? '')
      .order('snapshot_at', { ascending: true })
      .limit(5)

    if (statsError) {
      return NextResponse.json({ 
        error: 'Stats query failed',
        details: statsError 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true,
      agent,
      statsCount: stats?.length || 0,
      latestStats: stats?.[stats.length - 1] || null
    })
  } catch (error) {
    return NextResponse.json({ 
      error: 'Unexpected error',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 })
  }
}
