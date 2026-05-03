/**
 * GET /api/news?limit=12
 *
 * Live crypto news headlines, used by:
 *  - The galaxy view (right-side news strip)
 *  - The Build canvas (in-canvas news rail)
 *
 * Pulls from CryptoCompare's free News API (no key required for low volume),
 * which is the most reliable free source. Cached at the edge for 60s so the
 * upstream isn't hammered. Falls back to an empty array on error — the UI
 * hides the strip if items.length === 0, so a failure is silent.
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 60

interface NewsItem { title: string; source: string; url: string; ts: number }

interface CryptoCompareNews {
  Data?: Array<{ title: string; source_info?: { name?: string }; source?: string; url: string; published_on: number }>
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '12', 10), 50)

  try {
    const r = await fetch('https://min-api.cryptocompare.com/data/v2/news/?lang=EN&excludeCategories=Sponsored', {
      next: { revalidate: 60 },
    })
    if (!r.ok) return NextResponse.json({ items: [] })
    const j = await r.json() as CryptoCompareNews
    const items: NewsItem[] = (j.Data ?? []).slice(0, limit).map(n => ({
      title: n.title,
      source: n.source_info?.name ?? n.source ?? 'CryptoCompare',
      url: n.url,
      ts: (n.published_on ?? 0) * 1000,
    }))
    return NextResponse.json({ items })
  } catch (err) {
    return NextResponse.json({ items: [], error: String(err).slice(0, 120) })
  }
}
