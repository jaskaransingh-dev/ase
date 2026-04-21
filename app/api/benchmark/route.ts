import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const cache = new Map<string, { data: EquityPoint[]; ts: number }>()
const TTL = 5 * 60 * 1000

interface EquityPoint {
  date: string
  returnPct: number
}

const PERIOD_SECONDS: Record<string, number> = {
  '14d': 14 * 86400,
  '30d': 30 * 86400,
  '90d': 90 * 86400,
  '180d': 180 * 86400,
  '270d': 270 * 86400,
  '1y': 365 * 86400,
  '2y': 730 * 86400,
  '5y': 1825 * 86400,
}

async function fetchYahooBuyHold(symbol: string, period: string): Promise<EquityPoint[]> {
  const seconds = PERIOD_SECONDS[period] ?? PERIOD_SECONDS['1y']
  const end = Math.floor(Date.now() / 1000)
  const start = end - seconds

  const encoded = encodeURIComponent(symbol)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&period1=${start}&period2=${end}&includePrePost=false`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`Yahoo Finance ${res.status} for ${symbol}`)

  const json = await res.json() as {
    chart: {
      result?: Array<{
        timestamp: number[]
        indicators: { quote: Array<{ close: (number | null)[] }> }
      }>
    }
  }

  const result = json.chart?.result?.[0]
  if (!result) throw new Error(`No data for ${symbol}`)

  const closes = result.indicators.quote[0].close
  const timestamps = result.timestamp

  const bars: { date: string; close: number }[] = []
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] == null) continue
    bars.push({
      date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
      close: closes[i]!,
    })
  }
  if (bars.length < 2) throw new Error(`Insufficient data for ${symbol}`)

  const start0 = bars[0].close
  return bars.map(b => ({
    date: b.date,
    returnPct: ((b.close - start0) / start0) * 100,
  }))
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const symbol = (searchParams.get('symbol') ?? 'SPY').toUpperCase().trim()
  const period = searchParams.get('period') ?? '1y'

  const key = `${symbol}-${period}`
  const cached = cache.get(key)
  if (cached && Date.now() - cached.ts < TTL) {
    return NextResponse.json(cached.data)
  }

  try {
    const data = await fetchYahooBuyHold(symbol, period)
    cache.set(key, { data, ts: Date.now() })
    return NextResponse.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch benchmark'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
