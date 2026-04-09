/**
 * POST /api/backtest
 *
 * Run a strategy backtest against historical OHLCV data fetched from Yahoo Finance.
 *
 * Request body:
 * {
 *   symbol:     string   — e.g. "BTC-USD", "SPY", "AAPL"
 *   strategy:   string   — one of: mean_reversion | momentum_crossover | breakout_trend | rsi_trend_filter | volatility_breakout
 *   params:     object   — strategy-specific parameters (see /dashboard/backtest/docs)
 *   period:     string   — "1y" | "2y" | "5y" | "10y"  (default "2y")
 *   interval:   string   — "1d" | "1wk"                (default "1d")
 *   fee:        number   — per-trade fee fraction       (default 0.001)
 * }
 *
 * Response:
 * {
 *   bars:    BacktestBar[]   — daily equity curve + positions
 *   stats:   BacktestStats   — performance metrics
 *   strategy: StrategyMeta   — strategy metadata
 *   buyHold: BacktestBar[]   — buy-and-hold benchmark
 *   symbol:  string
 * }
 */

import { NextResponse } from 'next/server'
import { runBacktest, runBuyAndHold, STRATEGIES, type OHLCV } from '@/lib/backtest'

export const runtime = 'edge'

const PERIOD_DAYS: Record<string, number> = {
  '6mo': 183,
  '1y': 365,
  '2y': 730,
  '5y': 1825,
  '10y': 3650,
}

type YahooChartResponse = {
  chart: {
    result?: Array<{
      timestamp: number[]
      indicators: {
        quote: Array<{
          open: number[]
          high: number[]
          low: number[]
          close: number[]
          volume: number[]
        }>
      }
    }>
    error?: { description: string }
  }
}

function parseYahooResponse(json: YahooChartResponse, symbol: string): OHLCV[] {
  const chart = json.chart
  if (chart.error) throw new Error(chart.error.description)
  const result = chart.result?.[0]
  if (!result) throw new Error(`No data returned for ${symbol}`)

  const { timestamp, indicators } = result
  const q = indicators.quote[0]

  const bars: OHLCV[] = []
  for (let i = 0; i < timestamp.length; i++) {
    if (q.close[i] == null) continue
    bars.push({
      date: new Date(timestamp[i] * 1000).toISOString().slice(0, 10),
      open: q.open[i] ?? q.close[i],
      high: q.high[i] ?? q.close[i],
      low: q.low[i] ?? q.close[i],
      close: q.close[i],
      volume: q.volume[i] ?? 0,
    })
  }
  return bars
}

async function fetchYahooFinance(symbol: string, period: string, interval: string): Promise<OHLCV[]> {
  const days = PERIOD_DAYS[period] ?? 730
  const end = Math.floor(Date.now() / 1000)
  const start = end - days * 86400

  const qs = `interval=${interval}&period1=${start}&period2=${end}&includePrePost=false&events=history`
  const encoded = encodeURIComponent(symbol)

  // Try both Yahoo Finance hosts — query1 is primary, query2 is fallback
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?${qs}`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encoded}?${qs}`,
  ]

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://finance.yahoo.com',
    'Referer': 'https://finance.yahoo.com/',
  }

  let lastError: Error = new Error(`Failed to fetch data for ${symbol}`)
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers })
      if (!res.ok) {
        lastError = new Error(`Yahoo Finance returned ${res.status} for ${symbol}`)
        continue
      }
      const json = await res.json() as YahooChartResponse
      return parseYahooResponse(json, symbol)
    } catch (e) {
      lastError = e instanceof Error ? e : new Error('Fetch failed')
    }
  }
  throw lastError
}

export async function GET() {
  return NextResponse.json({
    strategies: Object.values(STRATEGIES).map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      defaultParams: s.defaultParams,
      paramSchema: s.paramSchema,
    })),
  })
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      symbol?: string
      strategy?: string
      params?: Record<string, number>
      period?: string
      interval?: string
      fee?: number
    }

    const symbol = (body.symbol ?? 'BTC-USD').toUpperCase().trim()
    const strategyId = body.strategy ?? 'momentum_crossover'
    const params = body.params ?? {}
    const period = body.period ?? '2y'
    const interval = body.interval ?? '1d'
    const fee = body.fee ?? 0.001

    if (!STRATEGIES[strategyId]) {
      return NextResponse.json(
        { error: `Unknown strategy "${strategyId}". Valid options: ${Object.keys(STRATEGIES).join(', ')}` },
        { status: 400 }
      )
    }

    const bars = await fetchYahooFinance(symbol, period, interval)
    if (bars.length < 60) {
      return NextResponse.json(
        { error: `Not enough data for ${symbol} (got ${bars.length} bars, need at least 60)` },
        { status: 422 }
      )
    }

    // Fill missing params with defaults
    const meta = STRATEGIES[strategyId]
    const mergedParams = { ...meta.defaultParams, ...params }

    const result = runBacktest(bars, strategyId, mergedParams, fee)
    const buyHold = runBuyAndHold(bars)

    return NextResponse.json({
      symbol,
      period,
      interval,
      strategy: result.strategy,
      stats: result.stats,
      bars: result.bars,
      buyHold,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
