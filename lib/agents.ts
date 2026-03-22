import { getBars, getPositions, submitOrder, closePosition, isTradingHours, AlpacaBar } from './alpaca'

export interface AgentConfig {
  id: string
  slug: string
  name: string
  description: string
  strategyType: 'momentum' | 'mean_reversion' | 'trend_following'
  tagline: string
  ticker: string
}

export const AGENT_CONFIGS: AgentConfig[] = [
  {
    id: 'momentum-alpha',
    slug: 'momentum-alpha',
    name: 'Momentum Alpha',
    description: 'Targets the top 5 momentum stocks from a liquid 50-stock watchlist. Rebalances weekly based on 3-month price returns.',
    strategyType: 'momentum',
    tagline: 'High-conviction momentum rotator across S&P 500 leaders',
    ticker: 'MOMO',
  },
  {
    id: 'mean-reversion-pro',
    slug: 'mean-reversion-pro',
    name: 'Mean Reversion Pro',
    description: 'Buys oversold blue chips when RSI drops below 30. Exits at RSI > 55 or +8% gain. Max 3 concurrent positions.',
    strategyType: 'mean_reversion',
    tagline: 'RSI-based mean reversion on liquid large-cap equities',
    ticker: 'REVT',
  },
  {
    id: 'trend-follower',
    slug: 'trend-follower',
    name: 'Trend Follower',
    description: 'Classic 50/200 EMA crossover on SPY, QQQ, and IWM. Long when trend is up, flat when trend is down.',
    strategyType: 'trend_following',
    tagline: 'Systematic EMA-based trend following on index ETFs',
    ticker: 'TRND',
  },
]

// ── MOMENTUM ALPHA ──────────────────────────────────────────────────────────

const MOMENTUM_WATCHLIST = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'BRK.B',
  'JPM', 'V', 'UNH', 'XOM', 'JNJ', 'MA', 'HD', 'PG', 'LLY', 'MRK',
  'ABBV', 'CVX', 'CRM', 'TMO', 'COST', 'ACN', 'NEE', 'AVGO', 'PEP',
  'ORCL', 'WMT', 'BAC', 'ABT', 'DHR', 'QCOM', 'AMD', 'TXN', 'HON',
  'AMAT', 'MS', 'IBM', 'GE', 'CAT', 'INTU', 'SPGI', 'AXP', 'GS',
  'ELV', 'MDT', 'VRTX', 'ISRG', 'PLD',
]

export async function runMomentumAlpha(apiKey: string, secretKey: string) {
  if (!isTradingHours()) return { skipped: true, reason: 'Outside trading hours' }

  // Only run on Mondays
  const day = new Date().getDay()
  if (day !== 1) return { skipped: true, reason: 'Not Monday — momentum rebalances weekly' }

  // Get 3-month returns for each symbol
  const returns: { symbol: string; ret: number }[] = []
  for (const sym of MOMENTUM_WATCHLIST.slice(0, 20)) { // Limit API calls
    const bars = await getBars(sym, '1Day', 65)
    if (bars.length < 60) continue
    const ret = (bars[bars.length - 1].c - bars[0].c) / bars[0].c
    returns.push({ symbol: sym, ret })
  }

  returns.sort((a, b) => b.ret - a.ret)
  const top5 = returns.slice(0, 5).map(r => r.symbol)

  // Close positions not in top 5
  const positions = await getPositions(apiKey, secretKey)
  for (const pos of positions) {
    if (!top5.includes(pos.symbol)) {
      await closePosition(pos.symbol, apiKey, secretKey)
    }
  }

  // Open positions in top 5 (equal weight, ~20% each)
  const account = await (await import('./alpaca')).getAccount(apiKey, secretKey)
  const equity = parseFloat(account.equity)
  const perPosition = equity * 0.20

  const orders = []
  for (const sym of top5) {
    const bars = await getBars(sym, '1Day', 1)
    if (!bars.length) continue
    const price = bars[0].c
    const qty = Math.floor(perPosition / price)
    if (qty < 1) continue
    const existing = positions.find(p => p.symbol === sym)
    if (existing) continue // Already holding
    const order = await submitOrder({ symbol: sym, qty, side: 'buy' }, apiKey, secretKey)
    orders.push(order)
  }

  return { top5, orders }
}

// ── MEAN REVERSION PRO ──────────────────────────────────────────────────────

const MR_WATCHLIST = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'AMD']

function calcRSI(bars: AlpacaBar[], period = 14): number {
  if (bars.length < period + 1) return 50
  const changes = bars.slice(1).map((b, i) => b.c - bars[i].c)
  const recent = changes.slice(-period)
  const gains = recent.filter(c => c > 0)
  const losses = recent.filter(c => c < 0).map(Math.abs)
  const avgGain = gains.length ? gains.reduce((a, b) => a + b, 0) / period : 0
  const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / period : 0.001
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

export async function runMeanReversionPro(apiKey: string, secretKey: string) {
  if (!isTradingHours()) return { skipped: true, reason: 'Outside trading hours' }

  const positions = await getPositions(apiKey, secretKey)

  // Check exits first
  const exits = []
  for (const pos of positions) {
    if (!MR_WATCHLIST.includes(pos.symbol)) continue
    const bars = await getBars(pos.symbol, '1Day', 20)
    const rsi = calcRSI(bars)
    const plPct = parseFloat(pos.unrealized_plpc) * 100

    if (rsi > 55 || plPct > 8) {
      await closePosition(pos.symbol, apiKey, secretKey)
      exits.push({ symbol: pos.symbol, reason: rsi > 55 ? 'RSI > 55' : '+8% target hit' })
    }
  }

  // Check entries (max 3 positions)
  const activePositions = positions.filter(p => MR_WATCHLIST.includes(p.symbol))
  const entries = []

  if (activePositions.length < 3) {
    const account = await (await import('./alpaca')).getAccount(apiKey, secretKey)
    const equity = parseFloat(account.equity)
    const perPosition = equity * 0.30

    for (const sym of MR_WATCHLIST) {
      if (activePositions.find(p => p.symbol === sym)) continue
      if (entries.length + activePositions.length >= 3) break

      const bars = await getBars(sym, '1Day', 20)
      const rsi = calcRSI(bars)

      if (rsi < 30) {
        const price = bars[bars.length - 1].c
        const qty = Math.floor(perPosition / price)
        if (qty < 1) continue
        const order = await submitOrder({ symbol: sym, qty, side: 'buy' }, apiKey, secretKey)
        entries.push({ symbol: sym, rsi, order })
      }
    }
  }

  return { exits, entries }
}

// ── TREND FOLLOWER ──────────────────────────────────────────────────────────

const TREND_SYMBOLS = ['SPY', 'QQQ', 'IWM']

function calcEMA(bars: AlpacaBar[], period: number): number {
  if (bars.length < period) return bars[bars.length - 1]?.c || 0
  const k = 2 / (period + 1)
  let ema = bars.slice(0, period).reduce((a, b) => a + b.c, 0) / period
  for (const bar of bars.slice(period)) {
    ema = bar.c * k + ema * (1 - k)
  }
  return ema
}

export async function runTrendFollower(apiKey: string, secretKey: string) {
  if (!isTradingHours()) return { skipped: true, reason: 'Outside trading hours' }

  const positions = await getPositions(apiKey, secretKey)
  const account = await (await import('./alpaca')).getAccount(apiKey, secretKey)
  const equity = parseFloat(account.equity)
  const perPosition = equity / TREND_SYMBOLS.length

  const results = []

  for (const sym of TREND_SYMBOLS) {
    const bars = await getBars(sym, '1Day', 220)
    if (bars.length < 200) continue

    const ema50 = calcEMA(bars.slice(-100), 50)
    const ema200 = calcEMA(bars, 200)
    const trending = ema50 > ema200

    const pos = positions.find(p => p.symbol === sym)

    if (trending && !pos) {
      // Enter long
      const price = bars[bars.length - 1].c
      const qty = Math.floor(perPosition / price)
      if (qty < 1) continue
      const order = await submitOrder({ symbol: sym, qty, side: 'buy' }, apiKey, secretKey)
      results.push({ symbol: sym, action: 'BUY', ema50, ema200, order })
    } else if (!trending && pos) {
      // Exit long
      await closePosition(sym, apiKey, secretKey)
      results.push({ symbol: sym, action: 'CLOSE', ema50, ema200 })
    } else {
      results.push({ symbol: sym, action: 'HOLD', ema50, ema200 })
    }
  }

  return { results }
}
