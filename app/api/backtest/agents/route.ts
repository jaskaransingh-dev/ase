/**
 * GET /api/backtest/agents
 *
 * Returns the list of ASE agents with their mapped backtest strategy + symbol,
 * so the frontend can let users backtest any of the 10 live agents.
 */

import { NextResponse } from 'next/server'
import { AGENT_CONFIGS } from '@/lib/agents'

export const runtime = 'edge'

// Map each agent to the best matching backtest strategy + primary symbol
const AGENT_BACKTEST_MAP: Record<string, { symbol: string; strategy: string; params: Record<string, number> }> = {
  'btc-momentum':    { symbol: 'BTC-USD', strategy: 'momentum_crossover', params: { fast_window: 8, slow_window: 21 } },
  'eth-mean-revert': { symbol: 'ETH-USD', strategy: 'mean_reversion',      params: { window: 20, z_threshold: 2.0 } },
  'crypto-trend':    { symbol: 'BTC-USD', strategy: 'momentum_crossover',  params: { fast_window: 10, slow_window: 30 } },
  'sol-breakout':    { symbol: 'SOL-USD', strategy: 'volatility_breakout', params: { breakout_window: 20, atr_window: 14, stop_atr_mult: 2.5 } },
  'defi-basket':     { symbol: 'LINK-USD', strategy: 'momentum_crossover', params: { fast_window: 7, slow_window: 14 } },
  'btc-eth-pairs':   { symbol: 'ETH-USD', strategy: 'mean_reversion',      params: { window: 60, z_threshold: 1.5 } },
  'vol-harvester':   { symbol: 'ETH-USD', strategy: 'rsi_trend_filter',    params: { rsi_window: 14, trend_window: 30, buy_below: 30, exit_above: 55 } },
  'momentum-carry':  { symbol: 'BTC-USD', strategy: 'momentum_crossover',  params: { fast_window: 7, slow_window: 21 } },
  'cascade-detect':  { symbol: 'BTC-USD', strategy: 'rsi_trend_filter',    params: { rsi_window: 10, trend_window: 20, buy_below: 25, exit_above: 50 } },
  'defi-yield':      { symbol: 'LINK-USD', strategy: 'rsi_trend_filter',   params: { rsi_window: 14, trend_window: 50, buy_below: 40, exit_above: 60 } },
}

export async function GET() {
  const agents = AGENT_CONFIGS.map(a => ({
    id: a.id,
    slug: a.slug,
    name: a.name,
    description: a.description,
    ticker: a.ticker,
    ...AGENT_BACKTEST_MAP[a.id],
  }))
  return NextResponse.json({ agents })
}
