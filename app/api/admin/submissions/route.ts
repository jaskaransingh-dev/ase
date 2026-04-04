/**
 * GET /api/admin/submissions — list all agent submissions
 * PATCH /api/admin/submissions — update a submission status
 *
 * Protected by ADMIN_TOKEN header (same as CRON_SECRET for simplicity).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

function isAuthorized(req: NextRequest): boolean {
  const token = req.headers.get('x-admin-token') || req.headers.get('x-cron-secret')
  const secret = process.env.CRON_SECRET
  if (!secret) return true // dev mode — no secret configured
  return token === secret
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('agent_submissions')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ submissions: data ?? [] })
}

export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { id, status, admin_notes } = body

  if (!id || !status) {
    return NextResponse.json({ error: 'id and status required' }, { status: 400 })
  }

  const validStatuses = ['submitted', 'reviewing', 'paper_trading', 'approved', 'rejected']
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 })
  }

  const admin = createAdminClient()
  const updatePayload: Record<string, unknown> = { status }

  if (admin_notes) updatePayload.admin_notes = admin_notes

  // If moving to paper_trading, set the start date
  if (status === 'paper_trading') {
    updatePayload.paper_trading_start_at = new Date().toISOString()
    updatePayload.paper_trading_end_at = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() // 90 days
  }

  const { data, error } = await admin
    .from('agent_submissions')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, submission: data })
}
