import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  
  const admin = createAdminClient()
  
  // Get agent by slug
  const { data: agent } = await admin
    .from('agents')
    .select('id')
    .eq('slug', slug)
    .single()
  
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }
  
  // Get latest reasoning (last 10 runs)
  const { data: reasoning, error } = await admin
    .from('agent_reasoning')
    .select('*')
    .eq('agent_id', agent.id)
    .order('run_at', { ascending: false })
    .limit(10)
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  return NextResponse.json({ reasoning: reasoning ?? [] })
}