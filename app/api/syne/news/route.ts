/**
 * GET /api/syne/news
 *
 * Fetches live crypto news headlines from multiple sources:
 *  1. CryptoPanic API (free tier, no key needed for basic headlines)
 *  2. CoinDesk RSS feed
 *  3. Static curated headlines as fallback
 *
 * Returns structured NewsItem array with sentiment scoring.
 * Cached for 5 minutes to avoid hammering external APIs.
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 300   // 5-min cache

export interface CryptoNewsItem {
  id: string
  t: string          // HH:MM
  ts: number         // unix ms
  tag: string        // BTC | ETH | MARKET | DEFI | MACRO
  severity: 'info' | 'risk' | 'alert'
  headline: string
  body: string
  source: string
  url?: string
  sentiment: number  // -1 (bearish) .. +1 (bullish)
}

// ── Sentiment scorer ───────────────────────────────────────────────────────
const BULLISH_WORDS = ['rally', 'surge', 'gain', 'bull', 'rise', 'up', 'inflow', 'record', 'high', 'pump', 'adoption', 'partnership', 'etf', 'approval', 'launch', 'growth', 'strong', 'beat', 'upgrade', 'buy']
const BEARISH_WORDS = ['drop', 'crash', 'fall', 'bear', 'down', 'outflow', 'hack', 'exploit', 'liquidat', 'ban', 'restrict', 'fine', 'probe', 'investigation', 'sell', 'weak', 'miss', 'downgrade', 'dump', 'fear', 'panic']

function scoreSentiment(text: string): number {
  const lower = text.toLowerCase()
  let score = 0
  for (const w of BULLISH_WORDS) if (lower.includes(w)) score += 0.15
  for (const w of BEARISH_WORDS) if (lower.includes(w)) score -= 0.15
  return Math.max(-1, Math.min(1, score))
}

function tagFromText(text: string): string {
  const lower = text.toLowerCase()
  if (lower.includes('bitcoin') || lower.includes('btc')) return 'BTC'
  if (lower.includes('ethereum') || lower.includes('eth')) return 'ETH'
  if (lower.includes('solana') || lower.includes('sol')) return 'SOL'
  if (lower.includes('defi') || lower.includes('dex') || lower.includes('uniswap')) return 'DEFI'
  if (lower.includes('fed') || lower.includes('rate') || lower.includes('inflation') || lower.includes('macro')) return 'MACRO'
  if (lower.includes('regulation') || lower.includes('sec') || lower.includes('cftc') || lower.includes('ban')) return 'REGU'
  if (lower.includes('nft') || lower.includes('dao')) return 'NFT'
  return 'MARKET'
}

function severityFromSentiment(s: number): CryptoNewsItem['severity'] {
  if (s < -0.3) return 'alert'
  if (s < 0) return 'risk'
  return 'info'
}

function fmtHHMM(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

// ── CryptoPanic free tier ─────────────────────────────────────────────────
async function fetchCryptoPanic(): Promise<CryptoNewsItem[]> {
  const url = 'https://cryptopanic.com/api/v1/posts/?auth_token=free&currencies=BTC,ETH,SOL,BNB,ADA&kind=news&public=true'
  const res = await fetch(url, { next: { revalidate: 300 } })
  if (!res.ok) throw new Error(`CryptoPanic HTTP ${res.status}`)
  const json = await res.json() as { results?: Array<{ id: number; title: string; published_at: string; source: { title: string }; url: string; currencies?: Array<{ code: string }> }> }
  const items = json.results ?? []
  return items.slice(0, 15).map((item, i) => {
    const ts = new Date(item.published_at).getTime()
    const headline = item.title
    const sentiment = scoreSentiment(headline)
    const tag = item.currencies?.[0]?.code ?? tagFromText(headline)
    return {
      id: `cp-${item.id}`,
      t: fmtHHMM(ts),
      ts,
      tag: tag.toUpperCase().slice(0, 6),
      severity: severityFromSentiment(sentiment),
      headline: headline.length > 120 ? headline.slice(0, 120) + '…' : headline,
      body: `Via ${item.source.title} · sentiment ${sentiment > 0 ? '+' : ''}${(sentiment * 100).toFixed(0)}%`,
      source: item.source.title,
      url: item.url,
      sentiment,
    }
  })
}

// ── CoinDesk RSS ──────────────────────────────────────────────────────────
async function fetchCoinDeskRSS(): Promise<CryptoNewsItem[]> {
  const url = 'https://www.coindesk.com/arc/outboundfeeds/rss/'
  const res = await fetch(url, { next: { revalidate: 300 } })
  if (!res.ok) throw new Error(`CoinDesk RSS HTTP ${res.status}`)
  const text = await res.text()

  const items: CryptoNewsItem[] = []
  const itemRe = /<item>([\s\S]*?)<\/item>/g
  let match: RegExpExecArray | null

  while ((match = itemRe.exec(text)) !== null && items.length < 12) {
    const block = match[1]
    const titleM = /<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(block) ?? /<title>(.*?)<\/title>/.exec(block)
    const descM  = /<description><!\[CDATA\[(.*?)\]\]><\/description>/.exec(block) ?? /<description>(.*?)<\/description>/.exec(block)
    const dateM  = /<pubDate>(.*?)<\/pubDate>/.exec(block)
    const linkM  = /<link>(.*?)<\/link>/.exec(block)
    if (!titleM) continue
    const headline = titleM[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'")
    const body = (descM?.[1] ?? '').replace(/<[^>]+>/g, '').slice(0, 200)
    const ts = dateM ? new Date(dateM[1]).getTime() : Date.now()
    const sentiment = scoreSentiment(headline + ' ' + body)
    items.push({
      id: `cd-${items.length}-${ts}`,
      t: fmtHHMM(ts),
      ts,
      tag: tagFromText(headline),
      severity: severityFromSentiment(sentiment),
      headline: headline.length > 120 ? headline.slice(0, 120) + '…' : headline,
      body: body || `Via CoinDesk · ${new Date(ts).toLocaleDateString()}`,
      source: 'CoinDesk',
      url: linkM?.[1],
      sentiment,
    })
  }
  return items
}

// ── Static fallback headlines ─────────────────────────────────────────────
const STATIC_HEADLINES: Omit<CryptoNewsItem, 'id' | 'ts' | 't'>[] = [
  { tag: 'BTC', severity: 'info',  headline: 'Bitcoin holds $60K support as spot ETF inflows resume',              body: 'US spot ETFs recorded net inflows for the third consecutive day. Cumulative AUM now $58.2B.', source: 'ASE Data', sentiment: 0.45 },
  { tag: 'ETH', severity: 'info',  headline: 'Ethereum staking yield rises to 4.8% post-Dencun',                   body: 'EIP-4844 blob transactions reducing L2 fees 95%+. TVL across L2s hit $42B.', source: 'ASE Data', sentiment: 0.38 },
  { tag: 'MACRO',severity:'risk',  headline: 'Fed holds rates; Powell flags higher-for-longer in press conf',      body: 'FOMC unchanged at 5.25-5.50%. Dot plot revised up. Risk assets initially sold off.', source: 'ASE Data', sentiment: -0.20 },
  { tag: 'DEFI', severity: 'alert',headline: 'DeFi protocol exploit drains $12M from Ethereum lending pool',      body: 'Reentrancy vulnerability in governance contract. $12.4M extracted. Funds partially frozen.', source: 'ASE Data', sentiment: -0.80 },
  { tag: 'SOL',  severity: 'info', headline: 'Solana DEX volume surpasses Ethereum for third straight week',       body: 'Jupiter aggregator and Raydium AMM driving record volume on SOL. Ecosystem TVL $9.8B.', source: 'ASE Data', sentiment: 0.55 },
  { tag: 'REGU', severity: 'risk', headline: 'SEC issues subpoenas to three crypto exchanges over staking',        body: 'Enforcement investigation into yield-bearing products. Exchanges consulting counsel.', source: 'ASE Data', sentiment: -0.40 },
  { tag: 'BTC',  severity: 'info', headline: 'MicroStrategy adds 2,100 BTC to treasury; total now 214,400',       body: 'Purchase at $67,200 average. Strategy remains largest corporate BTC holder.', source: 'ASE Data', sentiment: 0.30 },
  { tag: 'MARKET',severity:'info', headline: 'Crypto total market cap tops $2.4T for first time since 2021',      body: 'BTC dominance 54.2%. Altcoin season index at 62 (in altseason territory).', source: 'ASE Data', sentiment: 0.60 },
]

function getStaticHeadlines(): CryptoNewsItem[] {
  const now = Date.now()
  return STATIC_HEADLINES.map((h, i) => ({
    ...h,
    id: `static-${i}`,
    ts: now - i * 8 * 60_000,   // space them 8 minutes apart
    t: fmtHHMM(now - i * 8 * 60_000),
  }))
}

export async function GET() {
  // Try live sources in parallel, fall back to static
  const results = await Promise.allSettled([
    fetchCryptoPanic(),
    fetchCoinDeskRSS(),
  ])

  let items: CryptoNewsItem[] = []

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.length > 0) {
      items.push(...r.value)
    }
  }

  // De-dupe by headline similarity and sort by time desc
  if (items.length > 0) {
    const seen = new Set<string>()
    items = items.filter(item => {
      const key = item.headline.toLowerCase().slice(0, 40)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).sort((a, b) => b.ts - a.ts).slice(0, 20)
  } else {
    items = getStaticHeadlines()
  }

  return NextResponse.json({
    items,
    source: items[0]?.source === 'ASE Data' ? 'static' : 'live',
    ts: new Date().toISOString(),
    count: items.length,
  }, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  })
}
