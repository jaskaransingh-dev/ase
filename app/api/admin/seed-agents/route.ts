import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * /api/admin/seed-agents
 *
 * Seeds the agents table with 10 trading strategies.
 * Safe to run multiple times (uses ON CONFLICT ... DO NOTHING).
 *
 * Usage: POST http://localhost:3000/api/admin/seed-agents
 */

export const dynamic = 'force-dynamic'

const INITIAL_AGENTS = [
  {
    slug: 'btc-momentum',
    name: 'BTC Momentum Alpha',
    ticker: 'BTCM',
    description: 'Multi-timeframe momentum with volume confirmation. 8/21 EMA fast crossover with 50 EMA trend filter, MACD histogram confirmation, and volume surge detection. Risk 2% per trade, max 35% exposure.',
    strategy_type: 'crypto_momentum',
    asset_class: 'crypto',
  },
  {
    slug: 'eth-mean-revert',
    name: 'ETH Statistical Arbitrage',
    ticker: 'ETHR',
    description: 'Z-score mean reversion with multi-indicator confirmation. 20-period Z-score of closing price with RSI < 32 and Bollinger %B < 0.15 entry conditions. ATR-based stops, max 30% exposure.',
    strategy_type: 'crypto_mean_reversion',
    asset_class: 'crypto',
  },
  {
    slug: 'crypto-trend',
    name: 'Multi-Asset Trend System',
    ticker: 'CRTR',
    description: 'ADX-filtered trend following with volatility-weighted allocation across BTC, ETH, SOL. Only enters when ADX > 22. Uses 10/30 EMA crossover with inverse volatility weighting. Max 40% total exposure.',
    strategy_type: 'crypto_momentum',
    asset_class: 'crypto',
  },
  {
    slug: 'sol-breakout',
    name: 'SOL Volatility Breakout',
    ticker: 'SOLB',
    description: 'Bollinger squeeze detection with volume and momentum confirmation. Enters on upper band breaks after squeeze with volume > 1.5x 20-day average. Partial profit targets at 2x and 3x ATR with 5-day time stop.',
    strategy_type: 'crypto_momentum',
    asset_class: 'crypto',
  },
  {
    slug: 'defi-basket',
    name: 'DeFi Smart Beta Rotation',
    ticker: 'DEFI',
    description: 'Risk-adjusted momentum rotation across LINK, UNI, AAVE, AVAX. Score = 14-day momentum / 14-day volatility. Hold top 2 with equal weight (cap 20% each). Only rebalance on 2+ rank changes to avoid whipsaw.',
    strategy_type: 'crypto_momentum',
    asset_class: 'crypto',
  },
  {
    slug: 'btc-eth-pairs',
    name: 'BTC/ETH Pair Trading',
    ticker: 'BEPV',
    description: 'Correlation arbitrage using 60-day rolling correlation and z-score of BTC/ETH spread ratio. Exploits mean reversion in pair dynamics.',
    strategy_type: 'crypto_momentum',
    asset_class: 'crypto',
  },
  {
    slug: 'vol-harvester',
    name: 'Crypto Volatility Harvester',
    ticker: 'VOLH',
    description: 'Sells volatility premium by buying high-volatility selloffs and selling into volatility crushes. Uses 20-period realized vs implied vol.',
    strategy_type: 'crypto_momentum',
    asset_class: 'crypto',
  },
  {
    slug: 'momentum-carry',
    name: 'Crypto Momentum Carry',
    ticker: 'MCAR',
    description: 'Multi-asset momentum with inverse-volatility weighting across BTC, ETH, SOL, and top DeFi tokens. Adds funding rate carry overlay.',
    strategy_type: 'crypto_momentum',
    asset_class: 'crypto',
  },
  {
    slug: 'cascade-detect',
    name: 'Liquidation Cascade Detector',
    ticker: 'LCAS',
    description: 'Buy-the-dip strategy detecting liquidation cascades through volume spike detection (>4% drop in 4 hours with volume >3x mean).',
    strategy_type: 'crypto_momentum',
    asset_class: 'crypto',
  },
  {
    slug: 'defi-yield',
    name: 'DeFi Yield Momentum',
    ticker: 'DYLD',
    description: 'Detects momentum divergence in DeFi tokens outperforming BTC. Rotates into top 5 DeFi performers with weekly rebalance.',
    strategy_type: 'crypto_momentum',
    asset_class: 'crypto',
  },
]

export async function POST() {
  try {
    const admin = createAdminClient()

    // Insert agents (skip if they already exist)
    const { data: agents, error: insertError } = await admin
      .from('agents')
      .upsert(
        INITIAL_AGENTS.map(a => ({
          ...a,
          status: 'active',
          share_price_cents: 10000,
          total_shares: 100000,
        })),
        { onConflict: 'slug' }
      )
      .select('slug, name, status')

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message, details: insertError },
        { status: 500 }
      )
    }

    // Verify count
    const { data: allAgents, count } = await admin
      .from('agents')
      .select('slug, name, status', { count: 'exact' })
      .eq('status', 'active')

    return NextResponse.json({
      success: true,
      message: `Seeded ${agents?.length ?? 0} agents`,
      total_active_agents: count,
      agents: allAgents ?? [],
    })
  } catch (error) {
    console.error('[SeedAgents] Error:', error)
    return NextResponse.json(
      { error: 'Failed to seed agents', details: String(error) },
      { status: 500 }
    )
  }
}
