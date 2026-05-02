/**
 * POST /api/broker/fund-paper — REMOVED
 *
 * Sandbox / paper-mode funding has been removed from ASE. Every account
 * trades on the user's real Kraken wallet via /api/auth/kraken/connect.
 * This endpoint stays as a 410 Gone so any old client code that still
 * calls it gets a clear failure instead of silently appearing to work.
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST() {
  return NextResponse.json({
    error: 'Paper / sandbox funding has been removed. Connect your Kraken account at /dashboard/connect/kraken to fund the agent with real USD.',
    redirect: '/dashboard/connect/kraken',
  }, { status: 410 })
}

export async function GET() {
  return NextResponse.json({
    error: 'Paper / sandbox funding has been removed.',
  }, { status: 410 })
}
