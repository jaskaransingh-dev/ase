/**
 * Standalone backtest test script.
 * Run with: npx tsx scripts/test-backtest.ts
 * 
 * Tests the full backtest pipeline end-to-end and logs
 * number of fills, orders, signals, allocations.
 */
import { buildStrategyPackage, STRATEGY_TEMPLATES } from '../lib/quant/strategy'
import { QuantBacktester } from '../lib/quant/backtester'
import type { BarPanel } from '../lib/quant/types'

// ── Mock data generator ──────────────────────────────
// Generates realistic OHLCV bars for testing.

function generateBars(symbol: string, startDate: string, endDate: string, initialPrice: number, annualVol: number, annualDrift: number): Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }> {
  const bars: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }> = []
  const start = new Date(startDate)
  const end = new Date(endDate)
  let price = initialPrice
  const dailyVol = annualVol / Math.sqrt(252)
  const dailyDrift = annualDrift / 252
  let d = new Date(start)

  while (d <= end) {
    // Skip weekends
    if (d.getDay() === 0 || d.getDay() === 6) {
      d = new Date(d.getTime() + 86400000)
      continue
    }

    const ret = dailyDrift + dailyVol * randn()
    const open = price
    const close = open * (1 + ret)
    const high = Math.max(open, close) * (1 + Math.abs(randn()) * 0.005)
    const low = Math.min(open, close) * (1 - Math.abs(randn()) * 0.005)
    const volume = Math.round(1000000 + Math.random() * 5000000)

    bars.push({
      date: d.toISOString().slice(0, 10),
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume,
    })
    price = close
    d = new Date(d.getTime() + 86400000)
  }
  return bars
}

// Box-Muller transform for normal random numbers
let _spare: number | null = null
function randn(): number {
  if (_spare !== null) {
    const s = _spare
    _spare = null
    return s
  }
  const u1 = Math.random()
  const u2 = Math.random()
  const mag = Math.sqrt(-2 * Math.log(u1))
  const z0 = mag * Math.cos(2 * Math.PI * u2)
  const z1 = mag * Math.sin(2 * Math.PI * u2)
  _spare = z1
  return z0
}

async function main() {
  console.log('=== ASE Backtest Engine Test ===\n')

  const symbols = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'ADA-USD']
  const startDate = '2023-01-01'
  const endDate = '2024-01-01'

  // Generate mock panel
  const panel: BarPanel = {}
  const mockPrices: Record<string, number> = {
    'BTC-USD': 16800,
    'ETH-USD': 1200,
    'SOL-USD': 10,
    'BNB-USD': 260,
    'ADA-USD': 0.26,
  }
  const mockVols: Record<string, number> = {
    'BTC-USD': 0.75,
    'ETH-USD': 1.1,
    'SOL-USD': 1.8,
    'BNB-USD': 0.9,
    'ADA-USD': 1.5,
  }
  const mockDrifts: Record<string, number> = {
    'BTC-USD': 0.5,
    'ETH-USD': 0.3,
    'SOL-USD': 0.8,
    'BNB-USD': 0.2,
    'ADA-USD': 0.1,
  }

  for (const sym of symbols) {
    panel[sym] = generateBars(sym, startDate, endDate, mockPrices[sym], mockVols[sym], mockDrifts[sym])
    console.log(`${sym}: ${panel[sym].length} bars, start=${panel[sym][0]?.date}, end=${panel[sym][panel[sym].length-1]?.date}`)
  }
  console.log('')

  // Test each template
  for (const [templateId, _] of Object.entries(STRATEGY_TEMPLATES)) {
    console.log(`\n--- Template: ${templateId} ---`)
    const pkg = buildStrategyPackage(templateId, templateId, templateId as keyof typeof STRATEGY_TEMPLATES)
    console.log(`  Universe: ${pkg.universeConfig.symbols.join(', ')}`)
    console.log(`  Rebalance: ${pkg.rebalanceFreq}, Alpha: ${pkg.alphaType}`)
    console.log(`  Risk aversion: ${pkg.optimizerConfig.riskAversion}, Max weight: ${pkg.optimizerConfig.maxWeight}`)
    console.log(`  Risk limits: gross ${pkg.riskLimits.maxGrossExposure}, posW ${pkg.riskLimits.maxPositionWeight}, varPct ${pkg.riskLimits.varLimitPct}`)

    const backtester = new QuantBacktester()
    try {
      const result = await backtester.run(pkg, panel, {
        startDate,
        endDate,
        initialCapital: 1_000_000,
        feeBps: 7,
        symbols: pkg.universeConfig.symbols,
        rebalanceFreq: pkg.rebalanceFreq,
      })

      console.log(`  Equity curve points: ${result.equityCurve.length}`)
      console.log(`  Allocations: ${result.allocationHistory.length}`)
      console.log(`  Signals: ${result.signalHistory.length}`)
      console.log(`  IC series: ${result.icSeries.length}`)
      console.log(`  Orders: ${result.orders.length}`)
      console.log(`  Fills: ${result.fills.length}`)
      console.log(`  Final positions: ${JSON.stringify(result.finalPositions)}`)

      // Debug: show first 3 allocations
      if (result.allocationHistory.length > 0 && result.allocationHistory.length <= 5) {
        console.log(`  *** FEW ALLOCATIONS (${result.allocationHistory.length}) — likely kill switch or data issue ***`)
        result.allocationHistory.forEach((a, i) => {
          console.log(`    Alloc[${i}] date=${a.date} weights=${JSON.stringify(a.weights)} grossExp=${a.grossExposure?.toFixed(2)}`)
        })
      }
      console.log(`  CAGR: ${((result.tearSheet.cagr ?? 0)).toFixed(1)}%`)
      console.log(`  Sharpe: ${result.tearSheet.sharpeRatio?.toFixed(2)}`)
      console.log(`  Max DD: ${result.tearSheet.maxDrawdownPct?.toFixed(1)}%`)
      console.log(`  Total trades (fills): ${result.fills.length}`)
      console.log(`  Total trades (tearsheet): ${result.tearSheet.totalTrades}`)

      if (result.fills.length > 0) {
        // Show first 5 and last 5 fills
        const first5 = result.fills.slice(0, 5).map(f => `${f.date} ${f.side} ${f.symbol} ${f.filledShares.toFixed(4)} @ $${f.avgPrice.toFixed(2)}`)
        const last5 = result.fills.slice(-5).map(f => `${f.date} ${f.side} ${f.symbol} ${f.filledShares.toFixed(4)} @ $${f.avgPrice.toFixed(2)}`)
        console.log(`  First 5 fills:`)
        first5.forEach(f => console.log(`    ${f}`))
        if (result.fills.length > 10) console.log(`    ...`)
        console.log(`  Last 5 fills:`)
        last5.forEach(f => console.log(`    ${f}`))
      } else {
        console.log(`  *** NO TRADES EXECUTED ***`)
      }

      // Show allocation history sample
      if (result.allocationHistory.length > 0) {
        const alloc0 = result.allocationHistory[0]
        const allocMid = result.allocationHistory[Math.floor(result.allocationHistory.length / 2)]
        console.log(`  First allocation: ${JSON.stringify(alloc0.weights)}`)
        console.log(`  Mid allocation: ${JSON.stringify(allocMid.weights)}`)
      }
    } catch (err) {
      console.log(`  ERROR: ${err instanceof Error ? err.message : err}`)
    }
  }
}

main().catch(console.error)