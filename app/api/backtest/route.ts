/**
 * POST /api/backtest
 *
 * Run a strategy backtest against historical OHLCV data fetched from Yahoo Finance.
 * Uses yfinance-equivalent Yahoo Chart API with multiple fallback endpoints.
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
 * Monte Carlo mode (blind test):
 * {
 *   ...same as above,
 *   monteCarlo:  true
 *   nTrials:     number  — number of random windows (default 80)
 *   windowDays:  number  — days per window (default 180)
 *   seed:        number  — random seed for reproducibility (default 42)
 * }
 */

import { NextResponse } from 'next/server'
import { runBacktest, runBuyAndHold, STRATEGIES, type OHLCV, type BacktestStats } from '@/lib/backtest'

// DO NOT use edge runtime — Yahoo Finance blocks Cloudflare edge IPs
// and edge runtime has memory limits that cause "Internal Server Error"
export const dynamic = 'force-dynamic'

const PERIOD_DAYS: Record<string, number> = {
  '1mo': 30,
  '3mo': 91,
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

export async function fetchYahooFinance(symbol: string, period: string, interval: string): Promise<OHLCV[]> {
  const days = PERIOD_DAYS[period] ?? 730
  const end = Math.floor(Date.now() / 1000)
  const start = end - days * 86400

  const qs = `interval=${interval}&period1=${start}&period2=${end}&includePrePost=false&events=history`
  const encoded = encodeURIComponent(symbol)

  // Multiple Yahoo Finance endpoints — try them all
  // query1/query2 are primary Yahoo; yfapi.net is a public proxy
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?${qs}`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encoded}?${qs}`,
  ]

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
  }

  let lastError: Error = new Error(`Failed to fetch data for ${symbol}`)
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) })
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

// ─── Seeded random for reproducible Monte Carlo ─────────────────────

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface MonteCarloResult {
  start: string
  end: string
  bars: number
  strategyReturn: number
  marketReturn: number
  excessReturn: number
  sharpe: number
  maxDrawdown: number
  winRate: number
  totalTrades: number
}

export interface MonteCarloSummary {
  nTrials: number
  windowDays: number
  medianReturn: number
  meanReturn: number
  medianExcess: number
  meanExcess: number
  medianSharpe: number
  beatRate: number
  medianDrawdown: number
  p10Return: number
  p90Return: number
  results: MonteCarloResult[]
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0
  const s = [...arr].sort((a, b) => a - b)
  const idx = Math.floor(s.length * p)
  return s[Math.min(idx, s.length - 1)]
}

function runMonteCarloBacktest(
  allBars: OHLCV[],
  strategyId: string,
  params: Record<string, number>,
  fee: number,
  nTrials: number,
  windowDays: number,
  seed: number,
): MonteCarloSummary {
  const rng = mulberry32(seed)
  const results: MonteCarloResult[] = []

  // Calculate valid start range
  const msPerDay = 86400000
  const firstDate = new Date(allBars[0].date).getTime()
  const lastDate = new Date(allBars[allBars.length - 1].date).getTime()
  const latestValidStart = lastDate - windowDays * msPerDay

  if (latestValidStart <= firstDate) {
    throw new Error(`Not enough data for ${windowDays}-day windows. Have ${Math.round((lastDate - firstDate) / msPerDay)} days.`)
  }

  for (let trial = 0; trial < nTrials; trial++) {
    // Pick random start date
    const startMs = firstDate + rng() * (latestValidStart - firstDate)
    const endMs = startMs + windowDays * msPerDay

    // Slice bars for this window
    const windowBars = allBars.filter(b => {
      const t = new Date(b.date).getTime()
      return t >= startMs && t <= endMs
    })

    // Need minimum lookback + some bars
    const lookback = Math.max(
      ...Object.values(params).map(v => Math.abs(v)),
      50,
    )
    if (windowBars.length < lookback + 10) continue

    try {
      const result = runBacktest(windowBars, strategyId, params, fee)
      const buyHold = runBuyAndHold(windowBars)

      const stratReturn = result.stats.totalReturnPct
      const mktReturn = buyHold.length > 1
        ? ((buyHold[buyHold.length - 1].equity - buyHold[0].equity) / buyHold[0].equity) * 100
        : 0

      results.push({
        start: windowBars[0].date,
        end: windowBars[windowBars.length - 1].date,
        bars: windowBars.length,
        strategyReturn: stratReturn,
        marketReturn: mktReturn,
        excessReturn: stratReturn - mktReturn,
        sharpe: result.stats.sharpeRatio,
        maxDrawdown: result.stats.maxDrawdownPct,
        winRate: result.stats.winRate,
        totalTrades: result.stats.totalTrades,
      })
    } catch {
      // Skip windows that can't be backtested
    }
  }

  if (results.length === 0) {
    throw new Error('No valid Monte Carlo windows could be computed')
  }

  const returns = results.map(r => r.strategyReturn)
  const excesses = results.map(r => r.excessReturn)
  const sharpes = results.map(r => r.sharpe)
  const drawdowns = results.map(r => r.maxDrawdown)

  return {
    nTrials: results.length,
    windowDays,
    medianReturn: median(returns),
    meanReturn: returns.reduce((a, b) => a + b, 0) / returns.length,
    medianExcess: median(excesses),
    meanExcess: excesses.reduce((a, b) => a + b, 0) / excesses.length,
    medianSharpe: median(sharpes),
    beatRate: excesses.filter(e => e > 0).length / excesses.length,
    medianDrawdown: median(drawdowns),
    p10Return: percentile(returns, 0.1),
    p90Return: percentile(returns, 0.9),
    results,
  }
}

// ─── Route handlers ──────────────────────────────────────────

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
      // Monte Carlo fields
      monteCarlo?: boolean
      nTrials?: number
      windowDays?: number
      seed?: number
    }

    const symbol = (body.symbol ?? 'BTC-USD').toUpperCase().trim()
    const strategyId = body.strategy ?? 'momentum_crossover'
    const params = body.params ?? {}
    const period = body.period ?? '2y'
    const interval = body.interval ?? '1d'
    const fee = body.fee ?? 0.001

    if (!STRATEGIES[strategyId]) {
      return NextResponse.json(
        { error: `Unknown strategy "${strategyId}". Valid: ${Object.keys(STRATEGIES).join(', ')}` },
        { status: 400 }
      )
    }

    const meta = STRATEGIES[strategyId]
    const mergedParams = { ...meta.defaultParams, ...params }

    // Fetch OHLCV from Yahoo Finance (same as yfinance in Python)
    const bars = await fetchYahooFinance(symbol, period, interval)
    if (bars.length < 60) {
      return NextResponse.json(
        { error: `Not enough data for ${symbol} (got ${bars.length} bars, need ≥60)` },
        { status: 422 }
      )
    }

    // ─── Monte Carlo mode (blind test) ───────────────────────────
    if (body.monteCarlo) {
      const nTrials = body.nTrials ?? 80
      const windowDays = body.windowDays ?? 180
      const seed = body.seed ?? 42

      // For Monte Carlo, always fetch max data (use 10y if requested period is shorter)
      const mcPeriod = PERIOD_DAYS[period] < 1825 ? '5y' : period
      let mcBars = bars
      if (mcPeriod !== period) {
        mcBars = await fetchYahooFinance(symbol, mcPeriod, interval)
      }

      const summary = runMonteCarloBacktest(mcBars, strategyId, mergedParams, fee, nTrials, windowDays, seed)

      return NextResponse.json({
        symbol,
        period: mcPeriod,
        strategy: meta,
        monteCarlo: summary,
      })
    }

    // ─── Standard single backtest ────────────────────────────────
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
    console.error('[backtest]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
