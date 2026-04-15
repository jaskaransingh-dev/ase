import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST() {
  const admin = createAdminClient()
  
  const { data, error } = await admin
    .from('agents')
    .update({ alert_level: null, drawdown_pct: 0 })
    .eq('slug', 'crypto-trend')
    .select('slug, alert_level, drawdown_pct')
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  return NextResponse.json({ success: true, data })
}