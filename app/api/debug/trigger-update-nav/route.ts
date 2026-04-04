/**
 * POST /api/debug/trigger-update-nav
 *
 * Manually trigger the NAV update cron for testing.
 * This is the same logic as the scheduled cron in /cron/update-nav/route.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { POST as navUpdateHandler } from '@/app/api/cron/update-nav/route'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  console.log('[DEBUG] Manual NAV update triggered')
  try {
    const response = await navUpdateHandler(req)
    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch (err) {
    console.error('[DEBUG] Manual NAV update failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to trigger NAV update' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Send POST to manually trigger NAV update',
    description: 'This runs the same logic as the scheduled cron job',
    usage: 'POST /api/debug/trigger-update-nav',
  })
}
