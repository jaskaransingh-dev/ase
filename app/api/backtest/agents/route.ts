/**
 * GET /api/backtest/agents
 *
 * Returns the list of ASE agents with their mapped backtest strategy + symbol,
 * so the frontend can let users backtest any of the 10 live agents.
 * Uses force-dynamic to ensure fresh data on each request.
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const AGENTS = [
  { id: 'btc-momentum',    slug: 'btc-momentum',    ticker: '$BTCM', name: 'BTC Momentum',       description: 'Dual-EMA crossover with RSI confirmation on Bitcoin',            symbol: 'BTC-USD',  strategy: 'momentum_crossover',  params: { fast_window: 8,  slow_window: 21, rsi_window: 14 } },
  { id: 'eth-mean-revert', slug: 'eth-mean-revert', ticker: '$ETHR', name: 'ETH Mean Reversion',  description: 'Z-score mean reversion on Ethereum price extremes',                symbol: 'ETH-USD',  strategy: 'mean_reversion',       params: { window: 20, z_threshold: 2.0 } },
  { id: 'sol-breakout',    slug: 'sol-breakout',    ticker: '$SOLB', name: 'SOL Breakout',        description: 'Donchian channel volatility breakout on Solana',                  symbol: 'SOL-USD',  strategy: 'volatility_breakout',  params: { breakout_window: 20, atr_window: 14, stop_atr_mult: 2.5 } },
  { id: 'crypto-trend',    slug: 'crypto-trend',    ticker: '$CRTR', name: 'Crypto Trend',        description: 'RSI-filtered trend following on Bitcoin',                         symbol: 'BTC-USD',  strategy: 'rsi_trend_filter',     params: { rsi_window: 14, trend_window: 50, buy_below: 40, exit_above: 60 } },
  { id: 'defi-basket',     slug: 'defi-basket',     ticker: '$DEFI', name: 'DeFi Basket',         description: 'Momentum crossover across DeFi blue-chips via ETH proxy',         symbol: 'ETH-USD',  strategy: 'momentum_crossover',   params: { fast_window: 7,  slow_window: 14, rsi_window: 10 } },
  { id: 'vol-harvester',   slug: 'vol-harvester',   ticker: '$VOLH', name: 'Vol Harvester',       description: 'Buys volatility selloffs, sells into vol crushes on ETH',          symbol: 'ETH-USD',  strategy: 'rsi_trend_filter',     params: { rsi_window: 14, trend_window: 30, buy_below: 30, exit_above: 55 } },
  { id: 'btc-eth-pairs',   slug: 'btc-eth-pairs',   ticker: '$PAIR', name: 'BTC/ETH Pairs',       description: 'Spread mean reversion between BTC and ETH',                       symbol: 'BTC-USD',  strategy: 'mean_reversion',       params: { window: 60, z_threshold: 1.5 } },
  { id: 'momentum-carry',  slug: 'momentum-carry',  ticker: '$MCAR', name: 'Momentum Carry',      description: 'Inverse-vol weighted momentum across altcoins via BTC proxy',      symbol: 'BTC-USD',  strategy: 'momentum_crossover',   params: { fast_window: 7,  slow_window: 21, rsi_window: 14 } },
  { id: 'cascade-detect',  slug: 'cascade-detect',  ticker: '$CASC', name: 'Cascade Detector',    description: 'RSI-filtered liquidation cascade detection on Bitcoin',             symbol: 'BTC-USD',  strategy: 'rsi_trend_filter',     params: { rsi_window: 10, trend_window: 20, buy_below: 25, exit_above: 50 } },
  { id: 'defi-yield',      slug: 'defi-yield',      ticker: '$DYLD', name: 'DeFi Yield',          description: 'DeFi token momentum divergence on Ethereum',                       symbol: 'ETH-USD',  strategy: 'rsi_trend_filter',     params: { rsi_window: 14, trend_window: 50, buy_below: 35, exit_above: 65 } },
  { id: 'spy-momentum',   slug: 'spy-momentum',   ticker: '$SPYM', name: 'S&P 500 Momentum',    description: '20/50 EMA crossover with ADX>22 on SPY',                          symbol: 'SPY',     strategy: 'momentum_crossover',  params: { fast_window: 20, slow_window: 50 } },
  { id: 'qqq-growth',    slug: 'qqq-growth',     ticker: '$QQQR', name: 'Nasdaq Growth',        description: 'QQQ momentum vs SPY relative strength + 5% trailing stop',      symbol: 'QQQ',     strategy: 'momentum_crossover',  params: { fast_window: 20, slow_window: 50 } },
  { id: 'sector-rotation', slug: 'sector-rotation', ticker: '$SROT', name: 'Sector Rotation',     description: 'XLK/XLV/XLF momentum ranking, weekly rebalance',                 symbol: 'XLK',     strategy: 'factor_rotation',       params: { momentum_window: 20, vol_window: 20, threshold: 0.5 } },
  { id: 'low-vol-equity',  slug: 'low-vol-equity',  ticker: '$LVOL', name: 'Low Vol Equity',     description: 'RSI<30 oversold on SPLV, 3% stop loss',                           symbol: 'SPLV',    strategy: 'rsi_mean_reversion',   params: { rsi_window: 14, buy_below: 30, sell_above: 65 } },
  { id: 'covered-call-overlay', slug: 'covered-call-overlay', ticker: '$CCAL', name: 'Covered Call', description: '70% QQQ position with IV rank risk management',            symbol: 'QQQ',     strategy: 'rsi_trend_filter',     params: { rsi_window: 14, trend_window: 50, buy_below: 60, exit_above: 80 } },
]

export async function GET() {
  return NextResponse.json({ agents: AGENTS })
}
