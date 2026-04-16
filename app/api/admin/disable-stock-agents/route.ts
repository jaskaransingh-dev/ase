import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST() {
  const admin = createAdminClient()

  const stockAgents = [
    'spy-momentum',
    'qqq-growth', 
    'low-vol-equity',
    'sector-rotation',
    'covered-call-overlay',
  ]

  const { data, error } = await admin
    .from('agents')
    .update({ signal_summary: 'DISABLED', alert_level: 'hard' })
    .in('slug', stockAgents)
    .select('slug, signal_summary, alert_level')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ disabled: data })
}