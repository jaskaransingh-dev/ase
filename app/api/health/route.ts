import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const admin = createAdminClient()
  const { data: agents } = await admin
    .from('agents')
    .select('slug, last_run_at, signal_summary, last_error, share_price_cents')
    .eq('status', 'active')
    .order('last_run_at', { ascending: false, nullsFirst: true })

  const now = new Date()
  const status = (agents ?? []).map(a => ({
    slug: a.slug,
    last_run_at: a.last_run_at,
    minutes_since_run: a.last_run_at
      ? Math.round((now.getTime() - new Date(a.last_run_at).getTime()) / 60000)
      : null,
    status: !a.last_run_at ? 'NEVER_RUN'
      : (now.getTime() - new Date(a.last_run_at).getTime()) > 5 * 60000 ? 'STALE' : 'OK',
    signal: a.signal_summary,
    error: a.last_error,
    nav: ((a.share_price_cents ?? 10000) / 100).toFixed(2),
  }))

  const allOk = status.every(s => s.status === 'OK')
  return NextResponse.json({ ok: allOk, checked_at: now.toISOString(), agents: status })
}
