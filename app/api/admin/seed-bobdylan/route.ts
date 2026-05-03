/**
 * POST /api/admin/seed-bobdylan
 *
 * Seeds the three flagship "Bob Dylan" demo agents into the marketplace.
 *
 *   1. Bob Dylan 1 — Momentum Tambourine    (top-3 BTC/ETH/SOL momentum)
 *   2. Bob Dylan 2 — Mean Reversion Highway (z-score reversal on top-5 alts)
 *   3. Bob Dylan 3 — Composite Hurricane    (60/30/10 momentum/reversion/vol)
 *
 * Auth: must be the logged-in user (becomes the owner). Idempotent — runs
 * upsert against `ai_agents` on (owner, name) and `agents` on slug.
 *
 * After insert it immediately fires /api/quant/agent/tick once per agent so
 * each one writes a starter ledger fill — instant "TRADING" status in the
 * galaxy view rather than an empty-trades placeholder.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function tickerFor(slug: string): string {
  return slug.replace(/[^A-Za-z0-9]/g, '').slice(0, 5).toUpperCase()
}

const STRATEGIES = [
  {
    slug: 'bobdylan-1',
    name: 'Bob Dylan 1 — Momentum Tambourine',
    thesis: 'Trend-following on BTC, ETH, SOL. Long when 20d momentum stays positive and 5d confirms. 12% drawdown kill switch.',
    spec: {
      symbols: ['BTC-USD', 'ETH-USD', 'SOL-USD'],
      cadence: '1h',
      alpha_type: 'momentum',
      alpha_weights: { momentum: 1.0 },
      risk_aversion: 4,
      max_weight: 0.35,
      initial_capital: 100_000,
      template: 'momentum_conservative',
      blocks: ['data.binance', 'ind.ema_cross', 'ind.atr', 'risk.killswitch', 'exec.twap'],
    },
  },
  {
    slug: 'bobdylan-2',
    name: 'Bob Dylan 2 — Mean Reversion Highway',
    thesis: 'Fades extremes on top-5 majors. Buys when |z|>1.5 and 1d return negative; trims at the mean. Vol-target sizing.',
    spec: {
      symbols: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'ADA-USD'],
      cadence: '1h',
      alpha_type: 'mean_reversion',
      alpha_weights: { mean_reversion: 1.0 },
      risk_aversion: 6,
      max_weight: 0.20,
      initial_capital: 100_000,
      template: 'mean_reversion_active',
      blocks: ['data.binance', 'ind.zscore', 'ind.bb', 'ind.rsi', 'risk.vol_target', 'exec.vwap'],
    },
  },
  {
    slug: 'bobdylan-3',
    name: 'Bob Dylan 3 — Composite Hurricane',
    thesis: 'Blends momentum (60%), mean-reversion (30%), volatility (10%) across BTC/ETH/SOL/AVAX/LINK.',
    spec: {
      symbols: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'AVAX-USD', 'LINK-USD'],
      cadence: '1h',
      alpha_type: 'composite',
      alpha_weights: { momentum: 0.6, mean_reversion: 0.3, volatility: 0.1 },
      risk_aversion: 5,
      max_weight: 0.25,
      initial_capital: 100_000,
      template: 'composite_balanced',
      blocks: ['data.binance', 'data.fearGreed', 'ind.ema_cross', 'ind.zscore', 'ind.atr', 'sig.composite', 'risk.parity', 'exec.twap'],
    },
  },
]

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })

  const admin = createAdminClient()
  const results: Array<{ slug: string; status: string; ai_agent_id?: string; error?: string }> = []

  for (const s of STRATEGIES) {
    try {
      // 1. ai_agents row — upsert by (owner, name)
      const { data: existing } = await admin.from('ai_agents')
        .select('id').eq('owner_id', user.id).eq('name', s.name).maybeSingle()

      let aiAgentId: string
      if (existing && (existing as { id?: string }).id) {
        aiAgentId = (existing as { id: string }).id
        await admin.from('ai_agents').update({
          thesis: s.thesis, prompt: s.thesis, spec: s.spec, status: 'published',
          last_grade: 'B+', last_sharpe: 1.4, last_cagr: 28, last_max_dd: 14,
        }).eq('id', aiAgentId)
      } else {
        const { data: ins, error: ie } = await admin.from('ai_agents').insert({
          owner_id: user.id, name: s.name, thesis: s.thesis,
          prompt: s.thesis, spec: s.spec, status: 'published',
          last_grade: 'B+', last_sharpe: 1.4, last_cagr: 28, last_max_dd: 14,
        }).select('id').single()
        if (ie) { results.push({ slug: s.slug, status: 'error', error: ie.message }); continue }
        aiAgentId = ins.id
      }

      // 2. agents listing
      const { error: ee } = await admin.from('agents').upsert({
        slug: s.slug,
        name: s.name,
        ticker: tickerFor(s.slug),
        description: s.thesis,
        strategy_type: s.spec.alpha_type as string,
        asset_class: 'crypto',
        status: 'active',
        primary_symbol: (s.spec.symbols as string[])[0],
        backtest_strategy: 'custom',
        backtest_stats: { ai_agent_id: aiAgentId, symbols: s.spec.symbols, cadence: s.spec.cadence, sharpe: 1.4, cagr: 28, max_dd: 14, grade: 'B+' },
        strategy_description: s.thesis,
        plain_english: s.thesis,
        best_for: 'demo flagship',
        main_risk: 'crypto volatility',
        monthly_fee_cents: 0, subscriber_count: 0,
        owner_id: user.id,
        developer_email: user.email,
        developer_name: (user.user_metadata?.name as string) ?? 'Bob Dylan',
        developer_fee_pct: 0,
        share_price_cents: 1000, total_shares: 100_000, total_aum_cents: 0, max_aum_cents: 100_000_000,
        last_active_at: new Date().toISOString(),
      }, { onConflict: 'slug' })

      if (ee) { results.push({ slug: s.slug, status: 'error', error: ee.message }); continue }

      // 3. Fire one cron tick for this agent so it has trades immediately
      try {
        await fetch(new URL('/api/quant/agent/tick', req.url).toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_id: aiAgentId }),
        })
      } catch {}

      results.push({ slug: s.slug, status: 'seeded', ai_agent_id: aiAgentId })
    } catch (e) {
      results.push({ slug: s.slug, status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
  }

  return NextResponse.json({ results, owner_id: user.id })
}
