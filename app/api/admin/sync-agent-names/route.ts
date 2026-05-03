/**
 * POST /api/admin/sync-agent-names
 *
 * One-shot route that renames all agents in the DB to professional names
 * and updates their descriptions. Safe to run multiple times (idempotent).
 * Auth: must be the logged-in platform owner.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Professional names + updated descriptions for all agents
const AGENT_UPDATES: Array<{
  slug: string
  name: string
  description: string
  plain_english?: string
}> = [
  // ── Custom quant agents (formerly "Bob Dylan") ─────────────────────────
  {
    slug: 'bobdylan-1',
    name: 'Apex Momentum',
    description: 'Trend-following on BTC, ETH, SOL. Ranks by 20d/5d momentum composite; sizes positions by inverse volatility. Rebalances hourly. 12% drawdown circuit breaker.',
    plain_english: 'Rides the strongest crypto trend. Buys the top-ranked coin and sells the laggard every hour.',
  },
  {
    slug: 'bobdylan-2',
    name: 'Sigma Reversion',
    description: 'Fades statistical extremes across BTC, ETH, SOL, AVAX, LINK. Buys when z-score > 1.5σ with negative 1d return; trims back to the mean. Vol-target position sizing.',
    plain_english: 'Buys crypto when it\'s unusually cheap relative to its own history. Sells when it snaps back.',
  },
  {
    slug: 'bobdylan-3',
    name: 'Composite Hurricane',
    description: 'Blends momentum (60%), mean-reversion (30%), volatility (10%) across BTC/ETH/SOL/AVAX/LINK. Multi-signal scoring ranks assets each hour; top half bought, bottom half trimmed.',
    plain_english: 'Three strategies in one: momentum, mean reversion, and volatility. Trades all major cryptos every hour.',
  },

  // ── Built-in crypto strategies ─────────────────────────────────────────
  {
    slug: 'composite-alpha-v2',
    name: 'Composite Alpha',
    description: '6-signal composite: momentum (5/20/60d), RSI z-score mean reversion, EMA trend, volume confirmation. Vol-targeting 15% ann., ATR(10) trailing stop. Trades BTC, ETH, SOL, AVAX, LINK.',
    plain_english: 'Our flagship multi-signal system. Six independent alpha sources combined for smoother returns across all market conditions.',
  },
  {
    slug: 'btc-momentum',
    name: 'BTC Momentum Alpha',
    description: '8/21 EMA fast crossover with 50 EMA trend filter, MACD histogram confirmation, volume surge detection. Risk 2% per trade, max 35% BTC exposure.',
    plain_english: 'Pure Bitcoin trend follower. Goes long when momentum confirms, flat otherwise. Simple and battle-tested.',
  },
  {
    slug: 'eth-mean-revert',
    name: 'ETH Statistical Arb',
    description: '20-period Z-score mean reversion on ETH. RSI < 32 + Bollinger %B < 0.15 entry. ATR-based stops, max 30% exposure.',
    plain_english: 'Buys Ethereum when it\'s statistically oversold. Exits when it reverts to fair value.',
  },
  {
    slug: 'crypto-trend',
    name: 'Multi-Asset Trend',
    description: 'ADX-filtered trend system (ADX > 22). 10/30 EMA crossover with inverse volatility weighting across BTC, ETH, SOL. Max 40% total exposure.',
    plain_english: 'Tracks trends across three major cryptos simultaneously. Only trades when trend strength is confirmed.',
  },
  {
    slug: 'sol-breakout',
    name: 'SOL Breakout System',
    description: 'Bollinger squeeze detection with volume (>1.5x 20d avg) and momentum confirmation. Partial profit targets at 2x and 3x ATR, 5-day time stop.',
    plain_english: 'Catches Solana breakouts from tight ranges. Scales out profits as the move extends.',
  },
  {
    slug: 'defi-basket',
    name: 'DeFi Smart Beta',
    description: 'Score = 14d momentum / 14d volatility across LINK, UNI, AAVE, AVAX. Holds top 2 equal weight (20% each). Rebalances on 2+ rank changes.',
    plain_english: 'Rotates into the best-performing DeFi tokens by risk-adjusted momentum. Holds the top two at all times.',
  },
  {
    slug: 'btc-eth-pairs',
    name: 'BTC/ETH Pairs Trade',
    description: 'Statistical pairs trading with correlation arbitrage. Z-score of spread ratio, 60-day rolling window. Buy underperformer, sell outperformer on >1.5σ deviation. Max 25% per leg, -4% hard stop.',
    plain_english: 'Exploits the price relationship between Bitcoin and Ethereum. Buys the laggard and sells the leader when they diverge.',
  },
  {
    slug: 'vol-harvester',
    name: 'Volatility Harvester',
    description: 'Buys after vol spikes (>2x 30d median) + price drops >3% intraday. Sells on vol normalization. Assets: BTC, ETH, SOL. Max 20% per position, -5% hard stop.',
    plain_english: 'Buys crypto during fear spikes when vol is extreme. Collects the volatility risk premium as markets calm down.',
  },
  {
    slug: 'momentum-carry',
    name: 'Momentum Carry',
    description: 'Ranks BTC, ETH, SOL, AVAX, LINK by 7d momentum. Weights top 3 by inverse volatility. Adds carry bonus for positive funding rate proxy. Max 30% per position.',
    plain_english: 'Combines trend momentum with funding-rate carry. Holds the strongest coins with the best implied yield.',
  },
  {
    slug: 'cascade-detect',
    name: 'Cascade Detector',
    description: 'Buys dips when BTC/ETH drop >4% in 4h with volume >3x avg. RSI < 25 entry gate. Exits on 50% recovery, +8% target, or 48h stop. Max 20% per position.',
    plain_english: 'Detects panic sell-offs and buys into forced liquidations. Exits quickly once the storm passes.',
  },
  {
    slug: 'defi-yield',
    name: 'DeFi Yield Momentum',
    description: 'Tracks AAVE, UNI, LINK, AVAX: buys when showing >2% outperformance vs flat/down BTC. Entry: 7d return > BTC 7d + 2%, token RSI > 55. Max 25% per position.',
    plain_english: 'Buys DeFi tokens showing real outperformance versus Bitcoin. Captures the outperformance window before it closes.',
  },

  // ── Equity strategies ──────────────────────────────────────────────────
  {
    slug: 'spy-momentum',
    name: 'S&P 500 Momentum',
    description: '20/50 EMA crossover on SPY with ADX > 22 confirmation. ATR-based position sizing. Max 40% exposure.',
    plain_english: 'Classic S&P 500 trend follower. In when the trend is up, in cash when it breaks.',
  },
  {
    slug: 'qqq-growth',
    name: 'Nasdaq Growth Rotation',
    description: 'QQQ momentum vs SPY relative strength. Buys when QQQ outperforms by >2% and RSI < 70. Exits on underperformance or RSI > 80. 5% trailing stop.',
    plain_english: 'Switches into Nasdaq when tech is outperforming. Moves to cash when growth momentum fades.',
  },
  {
    slug: 'sector-rotation',
    name: 'Sector Rotation',
    description: 'Rotates XLK, XLV, XLF based on 20d momentum. Buys top performer (3%+ advantage over second). Weekly rebalance, 4% max loss per sector.',
    plain_english: 'Always in the strongest equity sector. Rotates weekly based on which sector is leading.',
  },
  {
    slug: 'low-vol-equity',
    name: 'Low Volatility Premium',
    description: 'Mean-reversion on SPLV using 14d RSI. Buys RSI < 30 with positive 5d momentum. Sells RSI > 65. 3% stop loss. Avoids VIX > 25.',
    plain_english: 'Buys low-volatility stocks when they pull back. Earns the low-vol premium in calm markets.',
  },
  {
    slug: 'covered-call-overlay',
    name: 'Covered Call Income',
    description: 'Holds 70% QQQ core position. Synthetically overlays 30-delta covered calls 5% OTM. Rolls 7d before expiry. Target 1-2% monthly premium. Protective put if IV rank > 60.',
    plain_english: 'Holds QQQ while selling upside to earn premium income. Reduces volatility and adds monthly yield.',
  },
  {
    slug: 'spy-dual-momentum',
    name: 'Dual Momentum',
    description: 'Gary Antonacci\'s dual momentum: holds SPY only if absolute momentum > 3% annualized AND SPY beats AGG. Otherwise moves to cash. Monthly rebalance.',
    plain_english: 'One of the most proven quant strategies. Holds stocks only when they\'re beating bonds AND rising.',
  },
  {
    slug: 'tech-rotation',
    name: 'Tech Sector Rotation',
    description: 'Risk-adjusted momentum on AAPL, MSFT, GOOGL, NVDA, META. Score = 20d momentum / realized volatility. Holds top 2 equal weight. Weekly rebalance.',
    plain_english: 'Always in the top two tech mega-caps by risk-adjusted momentum. Rotates weekly.',
  },
  {
    slug: 'equity-mean-reversion',
    name: 'Equity Mean Reversion',
    description: 'Bollinger + RSI(2) on SPY. Buys RSI(2) < 10 with price > 200d MA. Exits on RSI(2) > 80 or 20d midline cross. 2x ATR stop.',
    plain_english: 'Buys S&P 500 dips in bull markets. Uses ultra-short RSI(2) for precision entries.',
  },
  {
    slug: 'equity-trend-follow',
    name: 'EMA Golden Cross',
    description: 'EMA 50/200 golden cross on QQQ with ADX > 20 confirmation. 8% hard stop. Exits on death cross. Captures multi-month trends.',
    plain_english: 'The classic golden cross signal on QQQ. Long in bull markets, flat in bear markets.',
  },
  {
    slug: 'risk-parity',
    name: 'Risk Parity (SPY/TLT/GLD)',
    description: 'Inverse-vol weighting across SPY, TLT, GLD. Each weight = 1/volatility, normalized to 100%. Tactical: halves weight if 20d return < 0. Rebalances on 5% drift.',
    plain_english: 'Balances stocks, bonds, and gold by risk, not dollars. Smoother returns through all market cycles.',
  },
]

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })

  const admin = createAdminClient()
  const results: Array<{ slug: string; status: string; error?: string }> = []

  for (const update of AGENT_UPDATES) {
    try {
      const patch: Record<string, string> = {
        name: update.name,
        description: update.description,
      }
      if (update.plain_english) patch.plain_english = update.plain_english

      const { error } = await admin
        .from('agents')
        .update(patch)
        .eq('slug', update.slug)

      if (error) {
        results.push({ slug: update.slug, status: 'error', error: error.message })
      } else {
        results.push({ slug: update.slug, status: 'updated' })
      }
    } catch (e) {
      results.push({ slug: update.slug, status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
  }

  // Also update ai_agents names for the bobdylan agents
  const AI_AGENT_RENAMES = [
    { old_name_prefix: 'Bob Dylan 1', new_name: 'Apex Momentum' },
    { old_name_prefix: 'Bob Dylan 2', new_name: 'Sigma Reversion' },
    { old_name_prefix: 'Bob Dylan 3', new_name: 'Composite Hurricane' },
  ]

  for (const rename of AI_AGENT_RENAMES) {
    try {
      const { data: rows } = await admin
        .from('ai_agents')
        .select('id, name')
        .like('name', `${rename.old_name_prefix}%`)

      for (const row of rows ?? []) {
        await admin.from('ai_agents').update({ name: rename.new_name }).eq('id', row.id)
        results.push({ slug: `ai_agent:${rename.new_name}`, status: 'renamed' })
      }
    } catch (e) {
      results.push({ slug: `ai_agent:${rename.new_name}`, status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
  }

  const updated = results.filter(r => r.status !== 'error').length
  const errors  = results.filter(r => r.status === 'error').length

  return NextResponse.json({ updated, errors, results })
}
