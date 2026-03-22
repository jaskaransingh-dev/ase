import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('slug', slug)
    .single()

  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: stats } = await supabase
    .from('agent_stats')
    .select('*')
    .eq('agent_id', agent.id)
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .single()

  return NextResponse.json({ stats })
}
