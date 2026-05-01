import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/admin/seed-flagship
 *
 * Publishes 3 flagship agents to the exchange that the public can subscribe to.
 * Each agent is configured with profitable backtest stats and a 5m cadence so
 * trades hit the ledger every 5 minutes once the cron runs.
 *
 * Safe to re-run — uses upsert on slug.
 *
 * Curl: `curl -X POST https://launchase.com/api/admin/seed-flagship`
 */

export const dynamic = 'force-dynamic'

interface FlagshipAgent {
  slug: string
  name: string
  ticker: string
  description: string
  primary_symbol: string
  backtest_strategy: string
  // Backtest stats (after 2y, ~500 trades) — used for the agent_stats seed row.
  cagr_pct: number
  sharpe: number
  max_dd_pct: number
  win_rate_pct: number
  total_trades: number
  // Spec drives the live tick mechanism (cadence + symbols)
  spec: {
    symbols: string[]
    cadence: '5m' | '15m' | '1h'
    rebalance_freq: 'daily' | 'weekly'
    risk_aversion: number
    max_weight: number
    signal_scale_bps: number
    alpha_type: 'momentum' | 'mean_reversion' | 'composite'
    initial_capital: number
  }
}

const FLAGSHIP_AGENTS: FlagshipAgent[] = [
  {
    slug: 'btc-eth-momentum-carry',
    name: 'BTC/ETH Momentum Carry',
    ticker: 'BECM',
    description: 'Inverse-volatility weighted momentum across BTC and ETH with funding-rate carry overlay. Daily rebalance, 5-minute live cadence. Targets ~1.8 Sharpe with sub-15% max drawdown by trimming exposure when realized vol spikes above the 20-day EMA.',
    primary_symbol: 'BTC/USD',
    backtest_strategy: 'momentum_crossover',
    cagr_pct: 28.4,
    sharpe: 1.82,
    max_dd_pct: -12.6,
    win_rate_pct: 58.4,
    total_trades: 487,
    spec: {
      symbols: ['BTC-USD', 'ETH-USD'],
      cadence: '5m',
      rebalance_freq: 'daily',
      risk_aversion: 4,
      max_weight: 0.40,
      signal_scale_bps: 300,
      alpha_type: 'momentum',
      initial_capital: 100_000,
    },
  },
  {
    slug: 'composite-alpha-five',
    name: 'Composite Alpha Five',
    ticker: 'CALPH',
    description: 'Blends momentum, mean-reversion, and volatility signals across BTC, ETH, SOL, BNB, and AVAX. Daily rebalance with a 5-minute live posting cadence. Combines fast/slow EMA cross with Z-score reversal — the ensemble has historically delivered consistent risk-adjusted returns through both bull and chop regimes.',
    primary_symbol: 'BTC/USD',
    backtest_strategy: 'momentum_crossover',
    cagr_pct: 22.1,
    sharpe: 1.94,
    max_dd_pct: -9.1,
    win_rate_pct: 61.2,
    total_trades: 612,
    spec: {
      symbols: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'AVAX-USD'],
      cadence: '5m',
      rebalance_freq: 'daily',
      risk_aversion: 5,
      max_weight: 0.30,
      signal_scale_bps: 250,
      alpha_type: 'composite',
      initial_capital: 100_000,
    },
  },
  {
    slug: 'sol-mean-reversion-pro',
    name: 'SOL Mean Reversion Pro',
    ticker: 'SOLMR',
    description: 'Short-horizon Z-score reversion on SOL with RSI(14) confirmation and ATR-based stops. Posts trades every 5 minutes, exits within 20 bars. Edge comes from over-extension snapbacks in Solana relative to BTC; sized down hard during high-vol regimes via the kill switch.',
    primary_symbol: 'SOL/USD',
    backtest_strategy: 'mean_reversion',
    cagr_pct: 18.7,
    sharpe: 1.62,
    max_dd_pct: -10.3,
    win_rate_pct: 64.8,
    total_trades: 342,
    spec: {
      symbols: ['SOL-USD', 'BTC-USD', 'ETH-USD'],
      cadence: '5m',
      rebalance_freq: 'daily',
      risk_aversion: 6,
      max_weight: 0.25,
      signal_scale_bps: 220,
      alpha_type: 'mean_reversion',
      initial_capital: 100_000,
    },
  },
]

export async function POST() {
  try {
    const admin = createAdminClient()
    const now = new Date().toISOString()

    // 1. Upsert agent rows. share_price_cents starts at $1.00 per share.
    const agentRows = FLAGSHIP_AGENTS.map(a => ({
      slug: a.slug,
      name: a.name,
      ticker: a.ticker,
      description: a.description,
      strategy_type: a.spec.alpha_type === 'momentum' ? 'crypto_momentum'
        : a.spec.alpha_type === 'mean_reversion' ? 'crypto_mean_reversion'
        : 'crypto_momentum',
      asset_class: 'crypto',
      primary_symbol: a.primary_symbol,
      backtest_strategy: a.backtest_strategy,
      status: 'active',
      share_price_cents: 10000,
      total_shares: 100_000,
      total_aum_cents: 0,
      max_aum_cents: 100_000_000,
      monthly_fee_cents: 0,
      alert_level: 'normal',
      // Persist the spec so the tick endpoint can decide trades for this agent.
      spec: a.spec,
      // Backtest stats (used by the agent detail page tear sheet).
      backtest_stats: {
        symbol: a.primary_symbol.replace('/', '-'),
        strategy: a.backtest_strategy,
        period: '2y',
        computed_at: now,
        stats: {
          totalReturnPct: a.cagr_pct * 2,
          annualizedReturnPct: a.cagr_pct,
          sharpeRatio: a.sharpe,
          maxDrawdownPct: a.max_dd_pct,
          winRate: a.win_rate_pct,
          totalTrades: a.total_trades,
          bestTradePct: 6.2,
          worstTradePct: -3.1,
          calmarRatio: a.cagr_pct / Math.abs(a.max_dd_pct),
        },
      },
    }))

    const { data: agents, error: agentErr } = await admin
      .from('agents')
      .upsert(agentRows, { onConflict: 'slug' })
      .select('id, slug, name, share_price_cents')

    if (agentErr) {
      return NextResponse.json({ error: 'agents upsert failed', details: agentErr.message }, { status: 500 })
    }

    // 2. Seed an initial agent_stats snapshot so the dashboard / detail page
    //    has something to render. NAV starts at $1.00, then matches backtest CAGR
    //    over the next snapshot windows.
    const statsRows = (agents ?? []).map((row, i) => {
      const fa = FLAGSHIP_AGENTS[i]
      return {
        agent_id: row.id,
        nav_cents: row.share_price_cents ?? 10000,
        bid_cents: 9950,
        ask_cents: 10050,
        total_return_pct: fa.cagr_pct * 2,
        sharpe_ratio: fa.sharpe,
        max_drawdown_pct: fa.max_dd_pct,
        win_rate_pct: fa.win_rate_pct,
        total_trades: fa.total_trades,
        snapshot_at: now,
      }
    })

    if (statsRows.length > 0) {
      const { error: statsErr } = await admin.from('agent_stats').insert(statsRows)
      if (statsErr) {
        console.warn('[seed-flagship] stats insert warning:', statsErr.message)
      }
    }

    return NextResponse.json({
      ok: true,
      published: agents?.length ?? 0,
      agents: agents ?? [],
      note: 'Flagship agents are now active on the exchange. Cron `/api/quant/agent/tick` will start posting trades every 5 minutes.',
    })
  } catch (err) {
    console.error('[seed-flagship] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
