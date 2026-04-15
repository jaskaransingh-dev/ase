/**
 * POST /api/backtest/csv
 *
 * Run a strategy backtest on user-supplied OHLCV bars (from CSV upload).
 * Does NOT fetch external data — all price data comes from the request body.
 */

import { NextRequest, NextResponse } from 'next/server'
import { runBacktest, runBuyAndHold, STRATEGIES, type OHLCV } from '@/lib/backtest'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      bars: OHLCV[]
      strategy?: string
      params?: Record<string, number>
      fee?: number
    }

    const { bars, strategy = 'momentum_crossover', params = {}, fee = 0.001 } = body

    if (!Array.isArray(bars) || bars.length < 60) {
      return NextResponse.json(
        { error: `Need at least 60 bars, got ${bars?.length ?? 0}` },
        { status: 400 }
      )
    }

    if (!STRATEGIES[strategy]) {
      return NextResponse.json(
        { error: `Unknown strategy "${strategy}". Valid: ${Object.keys(STRATEGIES).join(', ')}` },
        { status: 400 }
      )
    }

    // Validate bars structure
    const validBars: OHLCV[] = bars
      .filter(b => b.date && typeof b.close === 'number' && !isNaN(b.close) && b.close > 0)
      .map(b => ({
        date: String(b.date).slice(0, 10),
        open: Number(b.open) || Number(b.close),
        high: Number(b.high) || Number(b.close),
        low: Number(b.low) || Number(b.close),
        close: Number(b.close),
        volume: Number(b.volume) || 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    if (validBars.length < 60) {
      return NextResponse.json(
        { error: `After validation, only ${validBars.length} valid bars remain (need ≥60)` },
        { status: 422 }
      )
    }

    const meta = STRATEGIES[strategy]
    const mergedParams = { ...meta.defaultParams, ...params }

    const result = runBacktest(validBars, strategy, mergedParams, fee)
    const buyHold = runBuyAndHold(validBars)

    return NextResponse.json({
      strategy: result.strategy,
      stats: result.stats,
      bars: result.bars,
      buyHold,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    console.error('[backtest/csv]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
