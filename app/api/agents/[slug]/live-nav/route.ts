import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLatestCryptoPrice } from '@/lib/market-data'

export const dynamic = 'force-dynamic'

interface Trade {
  symbol: string
  side: string
  qty: number
  fill_price: number
  pnl_cents: number | null
  filled_at: string
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const admin = createAdminClient()

  const { data: agent } = await admin
    .from('agents')
    .select('id, primary_symbol, total_aum_cents')
    .eq('slug', slug)
    .single()

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  const { data: trades } = await admin
    .from('agent_trades')
    .select('symbol, side, qty, fill_price, pnl_cents, filled_at')
    .eq('agent_id', agent.id)
    .order('filled_at', { ascending: true })

  if (!trades || trades.length === 0) {
    return NextResponse.json({ 
      nav: 100,
      change_1d: 0,
      trades: [],
      prices: {},
    })
  }

  const positions: Record<string, { qty: number; avgPrice: number }> = {}
  let realizedPnl = 0

  for (const trade of trades as Trade[]) {
    if (!positions[trade.symbol]) {
      positions[trade.symbol] = { qty: 0, avgPrice: 0 }
    }

    const pos = positions[trade.symbol]
    if (trade.side === 'buy') {
      const newQty = pos.qty + trade.qty
      const newCost = (pos.qty * pos.avgPrice) + (trade.qty * trade.fill_price)
      pos.qty = newQty
      pos.avgPrice = newCost / newQty
    } else {
      const pnl = (trade.fill_price - pos.avgPrice) * trade.qty * 100
      realizedPnl += pnl
      pos.qty -= trade.qty
      if (pos.qty <= 0) {
        delete positions[trade.symbol]
      }
    }
  }

  const prices: Record<string, number> = {}
  for (const symbol of Object.keys(positions)) {
    try {
      let price: number | null = null
      
      if (symbol.includes('/')) {
        price = await getLatestCryptoPrice(symbol)
      } else {
        price = await getLatestCryptoPrice(symbol)
      }
      
      if (price) {
        prices[symbol] = price
      }
    } catch (e) {
      console.error(`Failed to get price for ${symbol}:`, e)
    }
  }

  let portfolioValue = 0
  for (const [symbol, pos] of Object.entries(positions)) {
    if (prices[symbol]) {
      portfolioValue += pos.qty * prices[symbol] * 100
    }
  }

  const PLATFORM_SEED = 10000
  const investorCapital = Number(agent.total_aum_cents) || 0
  const tradingCapital = PLATFORM_SEED + investorCapital
  const totalValue = tradingCapital + realizedPnl + (portfolioValue - tradingCapital)
  
  const nav = totalValue / PLATFORM_SEED * 100

  const latestTrade = trades[trades.length - 1] as Trade
  const prevDayTrades = trades.filter((t: Trade) => {
    const tradeDate = new Date(t.filled_at)
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    return tradeDate.toDateString() === yesterday.toDateString()
  })

  let prevNav = PLATFORM_SEED
  const prevDayTradesCount = prevDayTrades.length
  if (prevDayTradesCount > 0) {
    let prevRealizedPnl = 0
    let prevPortfolioValue = 0
    const prevPositions: Record<string, { qty: number; avgPrice: number }> = {}
    
    for (const trade of trades.slice(0, -1) as Trade[]) {
      if (!prevPositions[trade.symbol]) {
        prevPositions[trade.symbol] = { qty: 0, avgPrice: 0 }
      }
      const pos = prevPositions[trade.symbol]
      if (trade.side === 'buy') {
        const newQty = pos.qty + trade.qty
        const newCost = (pos.qty * pos.avgPrice) + (trade.qty * trade.fill_price)
        pos.qty = newQty
        pos.avgPrice = newCost / newQty
      } else {
        const pnl = (trade.fill_price - pos.avgPrice) * trade.qty * 100
        prevRealizedPnl += pnl
        pos.qty -= trade.qty
        if (pos.qty <= 0) delete prevPositions[trade.symbol]
      }
    }
    
    for (const [symbol, pos] of Object.entries(prevPositions)) {
      if (prices[symbol]) {
        prevPortfolioValue += pos.qty * prices[symbol] * 100
      }
    }
    prevNav = (PLATFORM_SEED + investorCapital + prevRealizedPnl + (prevPortfolioValue - PLATFORM_SEED - investorCapital)) / PLATFORM_SEED * 100
  }

  const change_1d = prevNav > 0 ? ((nav - prevNav) / prevNav) * 100 : 0

  return NextResponse.json({
    nav: Math.round(nav * 100) / 100,
    change_1d: Math.round(change_1d * 100) / 100,
    realized_pnl_cents: realizedPnl,
    portfolio_value_cents: Math.round(portfolioValue),
    positions: Object.entries(positions).map(([symbol, pos]) => ({
      symbol,
      qty: pos.qty,
      avg_price: pos.avgPrice,
      current_price: prices[symbol] || null,
      pnl_pct: prices[symbol] ? ((prices[symbol] - pos.avgPrice) / pos.avgPrice) * 100 : null,
    })),
    prices,
    trade_count: trades.length,
  })
}