import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const cache = new Map<string, { data: Record<string, { price: number; change: number }>; ts: number }>()
const TTL = 5 * 60 * 1000

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const symbols = (searchParams.get('symbols') ?? '').split(',').filter(Boolean)
  if (!symbols.length) return NextResponse.json({})

  const cacheKey = symbols.sort().join(',')
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.ts < TTL) {
    return NextResponse.json(cached.data)
  }

  const result: Record<string, { price: number; change: number }> = {}

  await Promise.allSettled(symbols.map(async sym => {
    try {
      const encoded = encodeURIComponent(sym)
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=2d`
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      })
      if (!res.ok) return
      const json = await res.json() as {
        chart: {
          result?: Array<{
            meta: { regularMarketPrice: number; previousClose: number }
          }>
        }
      }
      const r = json.chart?.result?.[0]
      if (!r) return
      const price = r.meta.regularMarketPrice
      const prev  = r.meta.previousClose
      if (!price || !prev) return
      result[sym] = { price, change: ((price - prev) / prev) * 100 }
    } catch {}
  }))

  cache.set(cacheKey, { data: result, ts: Date.now() })
  return NextResponse.json(result)
}
