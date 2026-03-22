import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const admin = createAdminClient()
  
  try {
    // Check if new columns exist
    const { data: testStats } = await admin
      .from('agent_stats')
      .select('nav_cents, bid_cents, ask_cents')
      .limit(1)
      .single()

    // Check if limit_orders table exists
    const { data: testOrders } = await admin
      .from('limit_orders')
      .select('id')
      .limit(1)

    return NextResponse.json({
      status: 'ok',
      hasBidAsk: !!testStats && 'bid_cents' in testStats,
      hasLimitOrders: !!testOrders,
      sampleStats: testStats,
      sampleOrders: testOrders
    })
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      hint: 'You need to run the database migration first'
    }, { status: 500 })
  }
}
