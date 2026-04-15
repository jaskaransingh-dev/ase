import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/admin/seed-agents
 *
 * Seeds the agents table with 10 crypto trading strategies.
 * Each agent has a primary_symbol and backtest_strategy so backtests work immediately.
 * Safe to run multiple times (upsert on slug).
 *
 * Also runs the initial backtest for each agent and stores results.
 */

export const dynamic = 'force-dynamic'

const INITIAL_AGENTS = [
  {
    slug: 'btc-momentum',
    name: 'BTC Momentum Alpha',
    ticker: 'BTCM',
    description: 'Multi-timeframe momentum with volume confirmation. Uses fast/slow EMA crossover with MACD histogram confirmation. Risk 2% per trade, max 35% exposure.',
    strategy_type: 'crypto_momentum',
    asset_class: 'crypto',
    primary_symbol: 'BTC/USD',
    backtest_strategy: 'momentum_crossover',
  },
  {
    slug: 'eth-mean-revert',
    name: 'ETH Statistical Arbitrage',
    ticker: 'ETHR',
    description: 'Z-score mean reversion with multi-indicator confirmation. 20-period Z-score of closing price with RSI and Bollinger %B entry conditions. ATR-based stops.',
    strategy_type: 'crypto_mean_reversion',
    asset_class: 'crypto',
    primary_symbol: 'ETH/USD',
    backtest_strategy: 'mean_reversion',
  },
  {
    slug: 'crypto-trend',
    name: 'Multi-Asset Trend System',
    ticker: 'CRTR',
    description: 'ADX-filtered trend following with volatility-weighted allocation across BTC, ETH, SOL. Uses EMA crossover with inverse volatility weighting.',
    strategy_type: 'crypto_momentum',
    asset_class: 'crypto',
    primary_symbol: 'BTC/USD',
    backtest_strategy: 'momentum_crossover',
  },
  {
    slug: 'sol-breakout',
    name: 'SOL Volatility Breakout',
    ticker: 'SOLB',
    description: 'Bollinger squeeze detection with volume and momentum confirmation. Enters on upper band breaks with ATR trailing stop and partial profit targets.',
    strategy_type: 'crypto_momentum',
    asset_class: 'crypto',
    primary_symbol: 'SOL/USD',
    backtest_strategy: 'volatility_breakout',
  },
  {
    slug: 'defi-basket',
    name: 'DeFi Smart Beta Rotation',
    ticker: 'DEFI',
    description: 'Risk-adjusted momentum rotation across LINK, UNI, AAVE, AVAX. Score = 14-day momentum / 14-day volatility. Hold top 2 with equal weight.',
    strategy_type: 'crypto_momentum',
    asset_class: 'crypto',
    primary_symbol: 'LINK/USD',
    backtest_strategy: 'momentum_crossover',
  },
  {
    slug: 'btc-eth-pairs',
    name: 'BTC/ETH Pair Trading',
    ticker: 'BEPV',
    description: 'Correlation arbitrage using 60-day rolling correlation and z-score of BTC/ETH spread ratio. Exploits mean reversion in pair dynamics.',
    strategy_type: 'crypto_momentum',
    asset_class: 'crypto',
    primary_symbol: 'ETH/USD',
    backtest_strategy: 'mean_reversion',
  },
  {
    slug: 'vol-harvester',
    name: 'Crypto Volatility Harvester',
    ticker: 'VOLH',
    description: 'Sells volatility premium by buying high-volatility selloffs and selling into volatility crushes. Uses 20-period realized vs implied vol.',
    strategy_type: 'crypto_momentum',
    asset_class: 'crypto',
    primary_symbol: 'ETH/USD',
    backtest_strategy: 'rsi_trend_filter',
  },
  {
    slug: 'momentum-carry',
    name: 'Crypto Momentum Carry',
    ticker: 'MCAR',
    description: 'Multi-asset momentum with inverse-volatility weighting across BTC, ETH, SOL, and top DeFi tokens. Adds funding rate carry overlay.',
    strategy_type: 'crypto_momentum',
    asset_class: 'crypto',
    primary_symbol: 'BTC/USD',
    backtest_strategy: 'momentum_crossover',
  },
  {
    slug: 'cascade-detect',
    name: 'Liquidation Cascade Detector',
    ticker: 'LCAS',
    description: 'Buy-the-dip strategy detecting liquidation cascades through volume spike detection (>4% drop in 4 hours with volume >3x mean).',
    strategy_type: 'crypto_momentum',
    asset_class: 'crypto',
    primary_symbol: 'BTC/USD',
    backtest_strategy: 'rsi_trend_filter',
  },
  {
    slug: 'defi-yield',
    name: 'DeFi Yield Momentum',
    ticker: 'DYLD',
    description: 'Detects momentum divergence in DeFi tokens outperforming BTC. Rotates into top 5 DeFi performers with weekly rebalance.',
    strategy_type: 'crypto_momentum',
    asset_class: 'crypto',
    primary_symbol: 'LINK/USD',
    backtest_strategy: 'rsi_trend_filter',
  },
  {
    slug: 'spy-momentum',
    name: 'S&P 500 Momentum Edge',
    ticker: 'SPYM',
    description: 'Systematic trend-following on SPY using 20/50 EMA crossover with ADX confirmation. Entry on EMA bull cross + ADX>22. Max 40% exposure per signal.',
    strategy_type: 'trend_following',
    asset_class: 'equity',
    primary_symbol: 'SPY',
    backtest_strategy: 'momentum_crossover',
  },
  {
    slug: 'qqq-growth',
    name: 'Nasdaq Growth Rotation',
    ticker: 'QQQR',
    description: 'Tactical rotation for QQQ combining 20-day momentum with relative strength vs SPY. Buys when QQQ outperforms SPY by >2% and RSI <70. 5% trailing stop.',
    strategy_type: 'equity_momentum',
    asset_class: 'equity',
    primary_symbol: 'QQQ',
    backtest_strategy: 'momentum_crossover',
  },
  {
    slug: 'sector-rotation',
    name: 'Sector Momentum Rotation',
    ticker: 'SROT',
    description: 'Rotates between XLK, XLV, XLF ETFs based on 20-day momentum scores. Buys top performer with minimum 3% momentum advantage over #2. Weekly rebalance.',
    strategy_type: 'equity_rotation',
    asset_class: 'equity',
    primary_symbol: 'XLK',
    backtest_strategy: 'factor_rotation',
  },
  {
    slug: 'low-vol-equity',
    name: 'Low Volatility Premium Capture',
    ticker: 'LVOL',
    description: 'Mean-reversion on SPLV (low volatility ETF) using 14-day RSI. Buys RSI<30 with positive 5-day momentum. Avoids entries when VIX proxy >25. 3% stop.',
    strategy_type: 'equity_mean_reversion',
    asset_class: 'equity',
    primary_symbol: 'SPLV',
    backtest_strategy: 'rsi_mean_reversion',
  },
  {
    slug: 'covered-call-overlay',
    name: 'Covered Call Income Overlay',
    ticker: 'CCAL',
    description: 'Builds 70% delta position in QQQ, manages volatility risk via IV rank tracking. Protective exit at high IV. Target 1-2% monthly premium capture.',
    strategy_type: 'equity_momentum',
    asset_class: 'equity',
    primary_symbol: 'QQQ',
    backtest_strategy: 'rsi_trend_filter',
  },
]

export async function POST() {
  try {
    const admin = createAdminClient()

    // Upsert all agents with full config including backtest fields
    const { data: agents, error: insertError } = await admin
      .from('agents')
      .upsert(
        INITIAL_AGENTS.map(a => ({
          ...a,
          status: 'active',
          share_price_cents: 10000,
          total_shares: 100000,
          monthly_fee_cents: 0,
        })),
        { onConflict: 'slug' }
      )
      .select('slug, name, status, primary_symbol, backtest_strategy')

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message, details: insertError },
        { status: 500 }
      )
    }

    // Also update any existing agents that are missing primary_symbol/backtest_strategy
    for (const agent of INITIAL_AGENTS) {
      await admin
        .from('agents')
        .update({
          primary_symbol: agent.primary_symbol,
          backtest_strategy: agent.backtest_strategy,
        })
        .eq('slug', agent.slug)
        .is('primary_symbol', null)
    }

    // Verify count
    const { count } = await admin
      .from('agents')
      .select('slug', { count: 'exact' })
      .eq('status', 'active')

    return NextResponse.json({
      success: true,
      message: `Seeded ${agents?.length ?? 0} agents with backtest configuration`,
      total_active_agents: count,
      agents: agents ?? [],
      next_step: 'Run POST /api/cron/run-backtests to populate backtest stats for all agents',
    })
  } catch (error) {
    console.error('[SeedAgents] Error:', error)
    return NextResponse.json(
      { error: 'Failed to seed agents', details: String(error) },
      { status: 500 }
    )
  }
}
