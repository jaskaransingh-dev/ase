import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const symbols = (searchParams.get('symbols') || 'BTC-USD,ETH-USD,SOL-USD').split(',').filter(Boolean)

  try {
    const prices: Record<string, { price: number; change: number }> = {}
    
    // Fetch BTC, ETH, SOL from CoinGecko free API
    const coinMap: Record<string, string> = {
      'BTC-USD': 'bitcoin',
      'ETH-USD': 'ethereum',
      'SOL-USD': 'solana',
    }
    
    const ids = symbols.map(s => coinMap[s]).filter(Boolean).join(',')
    if (!ids) throw new Error('No valid symbols')
    
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`,
      { next: { revalidate: 30 } }
    )
    
    if (!res.ok) throw new Error('CoinGecko API error')
    
    const data = await res.json()
    
    // Map back to symbols
    const revMap: Record<string, string> = Object.entries(coinMap).reduce((acc, [sym, id]) => {
      acc[id] = sym
      return acc
    }, {} as Record<string, string>)
    
    for (const coin of data) {
      const sym = revMap[coin.id]
      if (sym) {
        prices[sym] = {
          price: coin.current_price,
          change: coin.price_change_percentage_24h || 0,
        }
      }
    }
    
    return NextResponse.json({ prices })
  } catch (err) {
    console.error('[market/prices]', err)
    // Return fallback static prices on error
    return NextResponse.json({
      prices: {
        'BTC-USD': { price: 95000, change: 2.5 },
        'ETH-USD': { price: 3200, change: 1.8 },
        'SOL-USD': { price: 220, change: 3.2 },
      }
    })
  }
}