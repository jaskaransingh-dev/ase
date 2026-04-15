/**
 * POST /api/auth/coinbase-accounts
 *
 * DEPRECATED: Coinbase account connections are no longer supported.
 * Users should connect their Alpaca trading account instead.
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST() {
  return NextResponse.json({
    error: 'Coinbase account connections are no longer supported. Please connect your Alpaca account via /api/broker/account.',
  }, { status: 410 })
}
