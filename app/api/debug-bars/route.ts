/**
 * DEBUG: Check what Alpaca is returning for crypto bars
 *
 * GET /api/debug-bars?symbol=BTC/USD&timeframe=1Day&limit=60
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCryptoBars } from '@/lib/alpaca'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol') || 'BTC/USD'
  const timeframe = req.nextUrl.searchParams.get('timeframe') || '1Day'
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '60')

  try {
    console.log(`🔍 Fetching ${limit} bars for ${symbol} (${timeframe})...`)

    const bars = await getCryptoBars(symbol, timeframe as '1Day' | '1Hour' | undefined, limit)

    console.log(`📊 Received ${bars.length} bars`)

    if (bars.length > 0) {
      console.log('First bar:', bars[0])
      console.log('Last bar:', bars[bars.length - 1])
    }

    return NextResponse.json({
      ok: true,
      symbol,
      timeframe,
      limit_requested: limit,
      bars_received: bars.length,
      first_bar: bars[0] || null,
      last_bar: bars[bars.length - 1] || null,
      sample_bars: bars.slice(0, 3),
      all_bars: bars,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('Debug bars error:', msg)
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 }
    )
  }
}
