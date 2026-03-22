import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const admin = createAdminClient()
  
  try {
    // Check agents table
    const { data: agents, error: agentsError } = await admin
      .from('agents')
      .select('*')
    
    if (agentsError) {
      return NextResponse.json({ error: agentsError.message }, { status: 500 })
    }

    return NextResponse.json({ 
      agents: agents || [],
      count: agents?.length || 0,
      sample: agents?.[0] || null
    })
  } catch (error) {
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}
