/**
 * POST /api/admin/enable-trading
 *
 * Admin endpoint to enable trading for all existing broker accounts.
 * This ensures all users can trade regardless of their stored trading_enabled flag.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const adminToken = req.headers.get('x-admin-token')
  const expectedToken = process.env.ADMIN_TOKEN || 'admin-token-not-configured'

  if (!process.env.ADMIN_TOKEN || adminToken !== expectedToken) {
    return NextResponse.json(
      { error: 'Unauthorized - invalid or missing admin token' },
      { status: 401 }
    )
  }

  try {
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('broker_accounts')
      .update({ trading_enabled: true })
      .eq('status', 'ACTIVE')

    console.log('[Enable Trading] Updated broker_accounts, result:', data)

    const { count } = await admin
      .from('broker_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ACTIVE')

    return NextResponse.json({
      ok: true,
      message: `Enabled trading for ${count || 0} broker accounts`,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[Enable Trading] Error:', msg)
    return NextResponse.json({ error: msg, ok: false }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
