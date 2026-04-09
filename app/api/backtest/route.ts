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
import { runBacktest, runBuyAndHold, STRATEGIES, type OHLCV } from '@/lib/backtest'

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

// ─── Binance fallback for crypto pairs ──────────────────────────────────────

function toBinanceSymbol(yahooSymbol: string): string | null {
  const m = yahooSymbol.match(/^([A-Z0-9]+)-USD$/)
  return m ? `${m[1]}USDT` : null
}

async function fetchBinanceData(symbol: string, period: string, interval: string): Promise<OHLCV[]> {
  const binanceSym = toBinanceSymbol(symbol)
  if (!binanceSym) throw new Error(`No Binance mapping for ${symbol}`)

  const binanceInterval = interval === '1wk' ? '1w' : '1d'
  const days = PERIOD_DAYS[period] ?? 730
  const endMs = Date.now()
  const startMs = endMs - days * 86400000

  const bars: OHLCV[] = []
  let currentStart = startMs

  while (currentStart < endMs) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSym}&interval=${binanceInterval}&startTime=${currentStart}&endTime=${endMs}&limit=1000`
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw new Error(`Binance returned ${res.status} for ${symbol}`)

    const data = await res.json() as Array<[number, string, string, string, string, string]>
    if (data.length === 0) break

    for (const c of data) {
      bars.push({
        date: new Date(c[0]).toISOString().slice(0, 10),
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5]),
      })
    }

    if (data.length < 1000) break
    const msPerBar = interval === '1wk' ? 7 * 86400000 : 86400000
    currentStart = data[data.length - 1][0] + msPerBar
  }

  if (bars.length === 0) throw new Error(`No Binance data for ${symbol}`)
  return bars
}

// ─── Yahoo Finance response parser ──────────────────────────────────────────

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

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Simple in-memory cache to reduce repeated API calls
const cache = new Map<string, { data: OHLCV[], timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function getCacheKey(symbol: string, period: string, interval: string): string {
  return `${symbol}-${period}-${interval}`
}

function getCachedData(symbol: string, period: string, interval: string): OHLCV[] | null {
  const key = getCacheKey(symbol, period, interval)
  const cached = cache.get(key)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data
  }
  if (cached) {
    cache.delete(key) // Clean up expired cache
  }
  return null
}

function setCachedData(symbol: string, period: string, interval: string, data: OHLCV[]): void {
  const key = getCacheKey(symbol, period, interval)
  cache.set(key, { data, timestamp: Date.now() })
  
  // Prevent cache from growing too large
  if (cache.size > 50) {
    const oldestKey = Array.from(cache.keys())[0]
    cache.delete(oldestKey)
  }
}

export async function fetchYahooFinance(symbol: string, period: string, interval: string): Promise<OHLCV[]> {
  // Check cache first
  const cached = getCachedData(symbol, period, interval)
  if (cached) {
    console.log(`Cache hit for ${symbol} ${period} ${interval}`)
    return cached
  }

  // Try Binance first for crypto pairs — faster and more reliable than Yahoo Finance
  if (toBinanceSymbol(symbol)) {
    try {
      const data = await fetchBinanceData(symbol, period, interval)
      setCachedData(symbol, period, interval, data)
      console.log(`[backtest] Binance: ${data.length} bars for ${symbol}`)
      return data
    } catch (e) {
      console.warn(`[backtest] Binance failed for ${symbol}, falling back to Yahoo: ${e instanceof Error ? e.message : e}`)
    }
  }

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
    `https://yfapi.net/v8/finance/chart/${encoded}?${qs}`,
    `https://finance.yahoo.com/quote/${encoded}/history?${qs}`,
  ]

  const userAgents = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  ]
  
  const getRandomUserAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)]
  
  const getHeaders = () => ({
    'User-Agent': getRandomUserAgent(),
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'max-age=0',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'sec-ch-ua': '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
  })

  let lastError: Error = new Error(`Failed to fetch data for ${symbol}`)

  for (const url of urls) {
    // Retry logic with exponential backoff for rate limiting
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // Add longer delays between retries and URLs
        if (attempt > 0 || url !== urls[0]) {
          const delay = Math.random() * 2000 + 1000 // 1000-3000ms
          await sleep(delay)
        }
        
        // Refresh headers for each retry to get new user agent
        const freshHeaders = getHeaders()
        
        const timeout = 25000 + (attempt * 10000) // Increase timeout for retries
        const res = await fetch(url, { headers: freshHeaders, signal: AbortSignal.timeout(timeout) })
        
        if (res.status === 429) {
          // Rate limited - wait with exponential backoff
          const waitTime = Math.min(3000 * Math.pow(2, attempt), 20000) // Max 20 seconds
          console.warn(`Yahoo Finance rate limited for ${symbol}, waiting ${waitTime}ms (attempt ${attempt + 1})`)
          if (attempt < 2) {
            await sleep(waitTime)
            continue
          }
        }
        
        if (res.status === 403) {
          // Forbidden - likely blocked, try next URL
          console.warn(`Yahoo Finance blocked request for ${symbol} (${res.status}), trying next endpoint`)
          lastError = new Error(`Yahoo Finance returned ${res.status} for ${symbol}`)
          break // Exit retry loop for this URL, try next one
        }
        
        if (!res.ok) {
          lastError = new Error(`Yahoo Finance returned ${res.status} for ${symbol}`)
          break // Exit retry loop for this URL
        }
        
        const json = await res.json() as YahooChartResponse
        const data = parseYahooResponse(json, symbol)
        
        // Cache the successful result
        setCachedData(symbol, period, interval, data)
        
        return data
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
          lastError = new Error(`Request timeout for ${symbol}`)
        } else {
          lastError = e instanceof Error ? e : new Error('Fetch failed')
        }
        
        // Only retry on network errors or timeouts, not on parsing errors
        if (attempt < 2 && (lastError.message.includes('timeout') || lastError.message.includes('fetch'))) {
          const waitTime = Math.min(2000 * Math.pow(2, attempt), 8000)
          await sleep(waitTime)
        }
      }
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

// Agent slug → locked symbol mapping (mirrors /api/backtest/agents)
const AGENT_LOCKED_SYMBOLS: Record<string, string> = {
  'btc-momentum':    'BTC-USD',
  'eth-mean-revert': 'ETH-USD',
  'sol-breakout':    'SOL-USD',
  'crypto-trend':    'BTC-USD',
  'defi-basket':     'ETH-USD',
  'vol-harvester':   'ETH-USD',
  'btc-eth-pairs':   'BTC-USD',
  'momentum-carry':  'BTC-USD',
  'cascade-detect':  'BTC-USD',
  'defi-yield':      'ETH-USD',
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
      agent_slug?: string  // optional — enforces symbol lock for agent backtests
      // Monte Carlo fields
      monteCarlo?: boolean
      nTrials?: number
      windowDays?: number
      seed?: number
    }

    const requestedSymbol = (body.symbol ?? 'BTC-USD').toUpperCase().trim()
    const strategyId = body.strategy ?? 'momentum_crossover'

    // If an agent_slug is provided, enforce that the symbol matches the agent's locked symbol
    let symbol = requestedSymbol
    if (body.agent_slug) {
      const locked = AGENT_LOCKED_SYMBOLS[body.agent_slug]
      if (locked && locked !== requestedSymbol) {
        return NextResponse.json(
          { error: `Agent "${body.agent_slug}" must be backtested with ${locked}, not ${requestedSymbol}` },
          { status: 400 }
        )
      }
      if (locked) symbol = locked
    }
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
