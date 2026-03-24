import { getBars, getPositions, submitOrder, closePosition, isTradingHours, getAccount, AlpacaBar } from './alpaca'

export interface AgentConfig {
  id: string
  slug: string
  name: string
  description: string
  strategyType: 'momentum' | 'mean_reversion' | 'trend_following' | 'crypto_momentum' | 'crypto_mean_reversion'
  tagline: string
  ticker: string
  asset: 'equity' | 'crypto'
}

export const AGENT_CONFIGS: AgentConfig[] = [
  {
    id: 'btc-momentum',
    slug: 'btc-momentum',
    name: 'BTC Momentum',
    description: 'Rides Bitcoin momentum using 20/50 EMA crossovers on BTC/USD. Goes long when short-term trend is bullish, exits on bearish cross. Trades 24/7 on crypto markets.',
    strategyType: 'crypto_momentum',
    tagline: 'EMA-based momentum trading on Bitcoin',
    ticker: 'BTCM',
    asset: 'crypto',
  },
  {
    id: 'eth-mean-revert',
    slug: 'eth-mean-revert',
    name: 'ETH Mean Revert',
    description: 'Buys ETH when RSI drops below 35 and sells when RSI exceeds 60. Targets oversold bounces on Ethereum with strict position sizing and max 2 concurrent entries.',
    strategyType: 'crypto_mean_reversion',
    tagline: 'RSI-based mean reversion on Ethereum',
    ticker: 'ETHR',
    asset: 'crypto',
  },
  {
    id: 'crypto-trend',
    slug: 'crypto-trend',
    name: 'Crypto Trend',
    description: 'Systematic trend follower across BTC, ETH, and SOL. Uses 10/30 EMA on 1D bars. Equal-weight allocation across trending assets. Flat when no trend detected.',
    strategyType: 'crypto_momentum',
    tagline: 'Multi-asset crypto trend following',
    ticker: 'CRTR',
    asset: 'crypto',
  },
  {
    id: 'sol-breakout',
    slug: 'sol-breakout',
    name: 'SOL Breakout',
    description: 'Detects SOL/USD breakouts using Bollinger Band expansion and volume surges. Enters on upper band breaks with momentum confirmation. Tight stop-loss at middle band.',
    strategyType: 'crypto_momentum',
    tagline: 'Volatility breakout strategy on Solana',
    ticker: 'SOLB',
    asset: 'crypto',
  },
  {
    id: 'defi-basket',
    slug: 'defi-basket',
    name: 'DeFi Basket',
    description: 'Rotates between top DeFi tokens (LINK, UNI, AAVE, AVAX) based on 14-day momentum scores. Weekly rebalance into top 2 performers. Equal weight positions.',
    strategyType: 'crypto_momentum',
    tagline: 'Momentum rotation across DeFi blue chips',
    ticker: 'DEFI',
    asset: 'crypto',
  },
]

// Crypto symbols on Alpaca use slash format for paper trading
const CRYPTO_SYMBOLS = {
  BTC: 'BTC/USD',
  ETH: 'ETH/USD',
  SOL: 'SOL/USD',
  LINK: 'LINK/USD',
  UNI: 'UNI/USD',
  AAVE: 'AAVE/USD',
  AVAX: 'AVAX/USD',
}

// ── HELPER: Calculate RSI ──────────────────────────────────────────────
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

// ── HELPER: Calculate EMA ──────────────────────────────────────────────
function calcEMA(bars: AlpacaBar[], period: number): number {
  if (bars.length < period) return bars[bars.length - 1]?.c || 0
  const k = 2 / (period + 1)
  let ema = bars.slice(0, period).reduce((a, b) => a + b.c, 0) / period
  for (const bar of bars.slice(period)) {
    ema = bar.c * k + ema * (1 - k)
  }
  return ema
}

// ── BTC MOMENTUM ──────────────────────────────────────────────────────
export async function runBtcMomentum(apiKey: string, secretKey: string, capitalAllocation: number = 1000000) {
  const symbol = CRYPTO_SYMBOLS.BTC
  const bars = await getBars(symbol, '1Day', 60)
  if (bars.length < 50) return { skipped: true, reason: 'Not enough BTC data' }

  const ema20 = calcEMA(bars.slice(-30), 20)
  const ema50 = calcEMA(bars, 50)
  const bullish = ema20 > ema50

  const positions = await getPositions(apiKey, secretKey)
  const pos = positions.find(p => p.symbol === symbol || p.symbol === 'BTCUSD')
  const allocation = (capitalAllocation / 100) * 0.30 // 30% of capital allocation

  const results: unknown[] = []

  if (bullish && !pos) {
    const price = bars[bars.length - 1].c
    const qty = Math.max(0.001, Math.floor((allocation / price) * 1000) / 1000)
    try {
      const order = await submitOrder({ symbol, qty, side: 'buy' }, apiKey, secretKey)
      results.push({ action: 'BUY', symbol, qty, ema20, ema50, order })
    } catch (e) {
      results.push({ action: 'BUY_FAILED', symbol, error: (e as Error).message })
    }
  } else if (!bullish && pos) {
    try {
      await closePosition(symbol, apiKey, secretKey)
      results.push({ action: 'CLOSE', symbol, ema20, ema50 })
    } catch (e) {
      results.push({ action: 'CLOSE_FAILED', symbol, error: (e as Error).message })
    }
  } else {
    results.push({ action: 'HOLD', symbol, ema20, ema50 })
  }

  return { results }
}

// ── ETH MEAN REVERT ──────────────────────────────────────────────────
export async function runEthMeanRevert(apiKey: string, secretKey: string, capitalAllocation: number = 1000000) {
  const symbol = CRYPTO_SYMBOLS.ETH
  const bars = await getBars(symbol, '1Day', 20)
  if (bars.length < 15) return { skipped: true, reason: 'Not enough ETH data' }

  const rsi = calcRSI(bars)
  const positions = await getPositions(apiKey, secretKey)
  const pos = positions.find(p => p.symbol === symbol || p.symbol === 'ETHUSD')

  const exits: unknown[] = []
  const entries: unknown[] = []

  // Check exit
  if (pos && rsi > 60) {
    try {
      await closePosition(symbol, apiKey, secretKey)
      exits.push({ symbol, reason: `RSI ${rsi.toFixed(1)} > 60` })
    } catch (e) {
      exits.push({ symbol, error: (e as Error).message })
    }
  }

  // Check entry
  if (!pos && rsi < 35) {
    const allocation = (capitalAllocation / 100) * 0.25 // 25% of capital allocation
    const price = bars[bars.length - 1].c
    const qty = Math.max(0.01, Math.floor((allocation / price) * 100) / 100)
    try {
      const order = await submitOrder({ symbol, qty, side: 'buy' }, apiKey, secretKey)
      entries.push({ symbol, rsi: rsi.toFixed(1), order })
    } catch (e) {
      entries.push({ symbol, error: (e as Error).message })
    }
  }

  return { exits, entries, rsi: rsi.toFixed(1) }
}

// ── CRYPTO TREND ──────────────────────────────────────────────────────
export async function runCryptoTrend(apiKey: string, secretKey: string, capitalAllocation: number = 1000000) {
  const symbols = [CRYPTO_SYMBOLS.BTC, CRYPTO_SYMBOLS.ETH, CRYPTO_SYMBOLS.SOL]
  const positions = await getPositions(apiKey, secretKey)
  const perPosition = (capitalAllocation / 100) / symbols.length * 0.30 // 10% per asset

  const results: unknown[] = []

  for (const symbol of symbols) {
    const bars = await getBars(symbol, '1Day', 40)
    if (bars.length < 30) { results.push({ symbol, action: 'SKIP', reason: 'Insufficient data' }); continue }

    const ema10 = calcEMA(bars.slice(-15), 10)
    const ema30 = calcEMA(bars, 30)
    const trending = ema10 > ema30
    const pos = positions.find(p => p.symbol === symbol || p.symbol === symbol.replace('/', ''))

    if (trending && !pos) {
      const price = bars[bars.length - 1].c
      const qty = Math.max(0.001, Math.floor((perPosition / price) * 1000) / 1000)
      try {
        const order = await submitOrder({ symbol, qty, side: 'buy' }, apiKey, secretKey)
        results.push({ symbol, action: 'BUY', ema10, ema30, order })
      } catch (e) {
        results.push({ symbol, action: 'BUY_FAILED', error: (e as Error).message })
      }
    } else if (!trending && pos) {
      try {
        await closePosition(symbol, apiKey, secretKey)
        results.push({ symbol, action: 'CLOSE', ema10, ema30 })
      } catch (e) {
        results.push({ symbol, action: 'CLOSE_FAILED', error: (e as Error).message })
      }
    } else {
      results.push({ symbol, action: 'HOLD', ema10, ema30 })
    }
  }

  return { results }
}

// ── SOL BREAKOUT ──────────────────────────────────────────────────────
export async function runSolBreakout(apiKey: string, secretKey: string, capitalAllocation: number = 1000000) {
  const symbol = CRYPTO_SYMBOLS.SOL
  const bars = await getBars(symbol, '1Day', 25)
  if (bars.length < 20) return { skipped: true, reason: 'Not enough SOL data' }

  // Bollinger Bands: 20-period SMA ± 2 std dev
  const closes = bars.slice(-20).map(b => b.c)
  const sma = closes.reduce((a, b) => a + b, 0) / closes.length
  const variance = closes.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / closes.length
  const stdDev = Math.sqrt(variance)
  const upperBand = sma + 2 * stdDev
  const middleBand = sma
  const currentPrice = bars[bars.length - 1].c
  const prevPrice = bars[bars.length - 2].c

  const breakingOut = currentPrice > upperBand && prevPrice <= upperBand
  const positions = await getPositions(apiKey, secretKey)
  const pos = positions.find(p => p.symbol === symbol || p.symbol === 'SOLUSD')

  const results: unknown[] = []

  if (breakingOut && !pos) {
    const allocation = (capitalAllocation / 100) * 0.20 // 20% of capital allocation
    const qty = Math.max(0.1, Math.floor((allocation / currentPrice) * 10) / 10)
    try {
      const order = await submitOrder({ symbol, qty, side: 'buy' }, apiKey, secretKey)
      results.push({ action: 'BREAKOUT_BUY', symbol, qty, upperBand, currentPrice, order })
    } catch (e) {
      results.push({ action: 'BUY_FAILED', error: (e as Error).message })
    }
  } else if (pos && currentPrice < middleBand) {
    try {
      await closePosition(symbol, apiKey, secretKey)
      results.push({ action: 'STOP_CLOSE', symbol, middleBand, currentPrice })
    } catch (e) {
      results.push({ action: 'CLOSE_FAILED', error: (e as Error).message })
    }
  } else {
    results.push({ action: 'HOLD', symbol, upperBand, middleBand, currentPrice })
  }

  return { results }
}

// ── DEFI BASKET ──────────────────────────────────────────────────────
export async function runDefiBasket(apiKey: string, secretKey: string, capitalAllocation: number = 1000000) {
  const defiSymbols = [CRYPTO_SYMBOLS.LINK, CRYPTO_SYMBOLS.UNI, CRYPTO_SYMBOLS.AAVE, CRYPTO_SYMBOLS.AVAX]

  // Calculate 14-day momentum for each
  const returns: { symbol: string; ret: number }[] = []
  for (const sym of defiSymbols) {
    const bars = await getBars(sym, '1Day', 15)
    if (bars.length < 14) continue
    const ret = (bars[bars.length - 1].c - bars[0].c) / bars[0].c
    returns.push({ symbol: sym, ret })
  }

  returns.sort((a, b) => b.ret - a.ret)
  const top2 = returns.slice(0, 2).map(r => r.symbol)

  const positions = await getPositions(apiKey, secretKey)
  const perPosition = (capitalAllocation / 100) * 0.15 // 15% per position

  const results: unknown[] = []

  // Close positions not in top 2
  for (const pos of positions) {
    const posSymbol = pos.symbol.includes('/') ? pos.symbol : pos.symbol.replace('USD', '/USD')
    if (defiSymbols.includes(posSymbol) && !top2.includes(posSymbol)) {
      try {
        await closePosition(pos.symbol, apiKey, secretKey)
        results.push({ action: 'CLOSE', symbol: pos.symbol, reason: 'Not in top 2 momentum' })
      } catch (e) {
        results.push({ action: 'CLOSE_FAILED', symbol: pos.symbol, error: (e as Error).message })
      }
    }
  }

  // Open positions in top 2
  for (const sym of top2) {
    const existing = positions.find(p => p.symbol === sym || p.symbol === sym.replace('/', ''))
    if (existing) { results.push({ action: 'HOLD', symbol: sym }); continue }

    const bars = await getBars(sym, '1Day', 1)
    if (!bars.length) continue
    const price = bars[0].c
    const qty = Math.max(0.01, Math.floor((perPosition / price) * 100) / 100)
    try {
      const order = await submitOrder({ symbol: sym, qty, side: 'buy' }, apiKey, secretKey)
      results.push({ action: 'BUY', symbol: sym, qty, order })
    } catch (e) {
      results.push({ action: 'BUY_FAILED', symbol: sym, error: (e as Error).message })
    }
  }

  return { top2, returns, results }
}
