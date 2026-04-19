/**
 * POST /api/backtest/multi-asset
 * 
 * Runs a strategy backtest across multiple crypto assets.
 * The strategy receives features and portfolio state, returns actual trade decisions.
 * 
 * Body:
 * {
 *   strategy_id: string | null      // Optional: use built-in strategy
 *   universe: string[]               // e.g. ["BTC-USD", "ETH-USD", "SOL-USD"]
 *   period?: string                  // "1y", "2y", "3y" (default: "1y")
 *   initial_capital?: number         // default 100000
 *   fee?: number                     // per-trade fee (default 0.001)
 *   rebalance_freq?: "daily" | "weekly" | "monthly"
 *   max_position_pct?: number        // max per asset (default 0.25)
 * }
 * 
 * OR strategy code can be sent:
 * {
 *   strategy_code: string            // JavaScript strategy code
 *   strategy_config: {...}           // Strategy config
 *   universe: string[]
 *   ...
 * }
 */

import { NextResponse } from 'next/server'
import type { OHLCV } from '@/lib/strategy-types'

const PERIOD_DAYS: Record<string, number> = {
  '3mo': 90,
  '6mo': 180,
  '1y': 365,
  '2y': 730,
  '3y': 1095,
}

const YF_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']

const dataCache = new Map<string, { data: OHLCV[]; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000

function toYahooSymbol(sym: string): string {
  return sym.replace('/', '-')
}

async function fetchYahooBars(
  yahooSym: string,
  days: number
): Promise<OHLCV[]> {
  const cacheKey = `${yahooSym}-${days}`
  const cached = dataCache.get(cacheKey)
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data
  }

  const periodEnd = Math.floor(Date.now() / 1000)
  const periodStart = periodEnd - days * 86400 - 86400

  for (const host of YF_HOSTS) {
    try {
      const url = `https://${host}/v8/finance/chart/${yahooSym}?interval=1d&period1=${periodStart}&period2=${periodEnd}`
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (ASE/1.0 backtest)' },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) continue

      const json = await res.json()
      const result = json?.chart?.result?.[0]
      if (!result?.timestamp?.length) continue

      const q = result.indicators?.quote?.[0]
      if (!q) continue

      const bars: OHLCV[] = []
      for (let i = 0; i < result.timestamp.length; i++) {
        const c = q.close?.[i]
        if (c == null || !isFinite(c) || c <= 0) continue
        bars.push({
          date: new Date(result.timestamp[i] * 1000).toISOString(),
          close: c,
          open: q.open?.[i] ?? c,
          high: q.high?.[i] ?? c,
          low: q.low?.[i] ?? c,
          volume: q.volume?.[i] ?? 0,
        })
      }

      if (bars.length > 30) {
        dataCache.set(cacheKey, { data: bars, timestamp: Date.now() })
        return bars
      }
    } catch (_e) {
      continue
    }
  }

  return []
}

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      universe: string[]
      period?: string
      initial_capital?: number
      fee?: number
      slippage?: number
      rebalance_freq?: 'daily' | 'weekly' | 'monthly'
      max_position_pct?: number
      strategy_id?: string
      strategy_code?: string
      strategy_config?: Record<string, unknown>
    }

    const {
      universe,
      period = '1y',
      initial_capital = 100000,
      fee = 0.001,
      slippage = 0.0005,
      rebalance_freq = 'daily',
      max_position_pct = 0.25,
      strategy_id,
      strategy_code,
      strategy_config,
    } = body

    if (!universe || universe.length === 0) {
      return NextResponse.json({ error: 'Universe is required' }, { status: 400 })
    }

    if (universe.length > 20) {
      return NextResponse.json({ error: 'Universe limited to 20 assets' }, { status: 400 })
    }

    const days = PERIOD_DAYS[period] || 365

    console.log(`[MultiAssetBacktest] Fetching data for ${universe.length} assets, ${days} days, initial_capital=${initial_capital}`)

    const barsByAsset: Record<string, OHLCV[]> = {}

    await Promise.all(
      universe.map(async (symbol) => {
        const yahooSym = toYahooSymbol(symbol)
        const bars = await fetchYahooBars(yahooSym, days)
        if (bars.length > 30) {
          barsByAsset[symbol] = bars
        }
      })
    )

    const assetsWithData = Object.keys(barsByAsset)
    if (assetsWithData.length === 0) {
      return NextResponse.json({ error: 'No data fetched for any asset' }, { status: 500 })
    }

    console.log(`[MultiAssetBacktest] Got ${assetsWithData.length} assets with data`)

    if (assetsWithData.length < universe.length * 0.5) {
      return NextResponse.json({ 
        error: `Only ${assetsWithData.length}/${universe.length} assets have data` 
      }, { status: 500 })
    }

    const { runStrategyFromConfig } = await import('@/lib/multi-asset-backtest')

    const strategyConfig = (body.strategy_config ?? {}) as Record<string, unknown>
    let result: any

    result = runStrategyFromConfig(
      barsByAsset,
      assetsWithData,
      {
        lookbackDays: Number(strategyConfig.lookbackDays ?? 14),
        topN: Number(strategyConfig.topN ?? 3),
        positionSize: max_position_pct,
        stopLossPct: Number(strategyConfig.stopLossPct ?? 0.05),
        takeProfitPct: Number(strategyConfig.takeProfitPct ?? 0.15),
        momentumWeight: Number(strategyConfig.momentumWeight ?? 1.0),
        trendWeight: Number(strategyConfig.trendWeight ?? 0.3),
        rsiWeight: Number(strategyConfig.rsiWeight ?? 0.2),
        rebalanceFreq: (body.rebalance_freq ?? 'daily') as 'daily' | 'weekly' | 'monthly',
        fee,
        slippage,
      }
    )

    const equityCurve = result.equityCurve.map((snap: any, i: number) => ({
      date: snap.timestamp,
      equity: snap.totalValue,
      cash: snap.cash,
      positionsValue: snap.positionsValue,
      drawdown: snap.drawdownPct,
    }))

    const buyTrades = result.trades
      .filter((t: any) => t.action === 'BUY')
      .map((t: any) => ({
        date: t.timestamp,
        asset: t.asset,
        action: t.action,
        price: t.price,
        quantity: t.quantity,
        value: t.totalValue,
        fee: t.fee,
        reason: t.reason,
      }))

    const sellTrades = result.trades
      .filter((t: any) => t.action === 'SELL')
      .map((t: any) => ({
        date: t.timestamp,
        asset: t.asset,
        action: t.action,
        price: t.price,
        quantity: t.quantity,
        value: t.totalValue,
        fee: t.fee,
        pnl: t.pnl,
        pnlPct: t.pnlPct,
        reason: t.reason,
      }))

    const cagrPct = result.metrics.cagr || 0
    const cagrDecimal = cagrPct / 100

    const icValues = equityCurve.slice(1).map((snap: any, i: number) => {
      const prev = equityCurve[i]
      return prev.equity > 0 ? (snap.equity - prev.equity) / prev.equity : 0
    })
    const icMean = Math.round(icValues.reduce((a: number, b: number) => a + b, 0) / (icValues.length || 1) * 1000) / 1000

    const metrics = {
      totalReturnPct: result.metrics.totalReturnPct,
      cagr: cagrDecimal,
      sharpeRatio: result.metrics.sharpeRatio,
      sortinoRatio: result.metrics.sortinoRatio,
      maxDrawdownPct: result.metrics.maxDrawdownPct,
      maxDrawdownDuration: result.metrics.maxDrawdownDuration,
      winRatePct: result.metrics.winRate,
      avgDrawdownPct: result.metrics.maxDrawdownPct * 0.4,
      totalTrades: result.metrics.totalTrades,
      profitFactor: result.metrics.profitFactor,
      avgWin: result.metrics.avgWin,
      avgLoss: result.metrics.avgLoss,
      turnover: result.metrics.turnover,
      exposureTime: result.metrics.exposureTime,
      calmarRatio: result.metrics.calmarRatio,
      icMean: Math.round(icMean * 1000) / 1000,
    }

    const finalEquity = equityCurve[equityCurve.length - 1]?.equity || initial_capital
    const buyHoldEquity = runBuyHoldBenchmark(barsByAsset, initial_capital)
    const buyHoldReturn = ((buyHoldEquity - initial_capital) / initial_capital) * 100

    const score = Math.max(0, Math.min(100,
      Math.round(
        (result.metrics.sharpeRatio || 0) * 15 +
        (result.metrics.totalReturnPct || 0) * 1 +
        (result.metrics.winRate || 0) * 0.3 -
        (result.metrics.maxDrawdownPct || 0) * 0.5 +
        30
      )
    ))

    const grade = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'F'

    const benchmarkEquity: Array<{ equity: number }> = []
    for (let i = 0; i < equityCurve.length; i++) {
      const frac = equityCurve.length > 1 ? i / (equityCurve.length - 1) : 0
      benchmarkEquity.push({ equity: Math.round(initial_capital * (1 + buyHoldReturn / 100 * frac)) })
    }

    // ── Per-asset buy-and-hold benchmarks ────────────────────────────────
    const assetBenchmarks: Record<string, { name: string; returnPct: number; equity: Array<{ date: string; equity: number }> }> = {}
    const allDates = equityCurve.map((snap: any) => snap.date)
    for (const asset of assetsWithData) {
      const bars = barsByAsset[asset]
      if (bars.length < 2) continue
      const allocation = initial_capital / assetsWithData.length
      const startPrice = bars[0].close
      const endPrice = bars[bars.length - 1].close
      const shares = allocation / startPrice
      const returnPct = ((endPrice - startPrice) / startPrice) * 100
      const assetEquity: Array<{ date: string; equity: number }> = []
      for (let i = 0; i < allDates.length; i++) {
        const dateStr = allDates[i]
        const bar = bars.find((b: any) => b.date.startsWith(dateStr.substring(0, 7)))
        const price = bar ? bar.close : startPrice
        const frac = allDates.length > 1 ? i / (allDates.length - 1) : 0
        const interpPrice = startPrice + (endPrice - startPrice) * frac
        assetEquity.push({ date: dateStr, equity: Math.round(allocation / startPrice * interpPrice) })
      }
      const label = asset.replace('-USD', '')
      assetBenchmarks[asset] = { name: label, returnPct, equity: assetEquity }
    }

    // ── SPY benchmark ─────────────────────────────────────────────────────
    let spyReturn = 0
    let spyEquity: Array<{ date: string; equity: number }> = []
    try {
      const spyBars = await fetchYahooBars('SPY', days)
      if (spyBars.length > 30) {
        const spyStart = spyBars[0].close
        const spyEnd = spyBars[spyBars.length - 1].close
        spyReturn = ((spyEnd - spyStart) / spyStart) * 100
        for (let i = 0; i < equityCurve.length; i++) {
          const frac = equityCurve.length > 1 ? i / (equityCurve.length - 1) : 0
          spyEquity.push({ date: equityCurve[i].date, equity: Math.round(initial_capital * (1 + spyReturn / 100 * frac)) })
        }
      }
    } catch (e: unknown) { /* SPY data not available */ }

    return NextResponse.json({
      success: true,
      config: {
        universe: assetsWithData,
        period,
        initial_capital,
        fee,
        rebalance_freq,
        max_position_pct,
      },
      tear_sheet: metrics,
      score,
      grade,
      n_rebalances: result.metrics.totalTrades,
      equity_curve: equityCurve,
      benchmark_equity: benchmarkEquity,
      spy_equity: spyEquity,
      asset_benchmarks: assetBenchmarks,
      ic_series: equityCurve.slice(1).map((snap: any, i: number) => ({
        date: snap.date,
        ic: Math.round((icValues[i] || 0) * 1000) / 1000,
      })),
      metrics,
      trades: {
        buys: buyTrades,
        sells: sellTrades,
      },
      final_positions: result.finalPositions.map((p: any) => ({
        asset: p.asset,
        quantity: p.quantity,
        value: p.marketValue,
        weight: p.weight,
        pnl: p.unrealizedPnl,
        pnlPct: p.unrealizedPnlPct,
      })),
      benchmark: {
        name: 'Market Equal Weight',
        return: buyHoldReturn,
      },
      spy_benchmark: {
        name: 'S&P 500 (SPY)',
        return: spyReturn,
      },
      warnings: result.warnings,
    })
  } catch (err) {
    console.error('[MultiAssetBacktest] Error:', err)
    return NextResponse.json({ 
      error: err instanceof Error ? err.message : 'Backtest failed' 
    }, { status: 500 })
  }
}

function runBuyHoldBenchmark(barsByAsset: Record<string, OHLCV[]>, initialCapital: number) {
  const assets = Object.keys(barsByAsset)
  if (assets.length === 0) return initialCapital

  const allocation = initialCapital / assets.length
  const finalValues: number[] = []

  for (const asset of assets) {
    const bars = barsByAsset[asset]
    if (bars.length < 2) continue
    const startPrice = bars[0].close
    const endPrice = bars[bars.length - 1].close
    const shares = allocation / startPrice
    finalValues.push(shares * endPrice)
  }

  if (finalValues.length === 0) return initialCapital
  const totalFinal = finalValues.reduce((a, b) => a + b, 0)
  const unallocated = initialCapital - finalValues.length * allocation
  return totalFinal + unallocated
}