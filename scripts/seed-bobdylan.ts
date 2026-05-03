#!/usr/bin/env -S npx tsx
/**
 * scripts/seed-bobdylan.ts
 *
 * Creates and publishes three flagship demo agents — Bob Dylan 1, 2, 3 —
 * each pinned to a different theory subsector so they spread across the
 * galaxy view. Designed to actually trade on cron the moment they go live.
 *
 *   1. Bob Dylan 1 — Momentum Tambourine    (top-3 BTC/ETH/SOL momentum)
 *   2. Bob Dylan 2 — Mean Reversion Highway (z-score reversal on top-5 alts)
 *   3. Bob Dylan 3 — Composite Hurricane    (blended alpha 60/30/10)
 *
 * Run: `npx tsx scripts/seed-bobdylan.ts`
 *   - Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or hits
 *     the running dev server if --remote http://localhost:3000 is passed).
 *
 * Dual mode:
 *   - --remote <url>  posts to /api/quant/agent/save then /publish via HTTP
 *                     (requires a logged-in cookie OR a service-role token)
 *   - default          uses the supabase admin client directly
 */

import { createClient } from '@supabase/supabase-js'

interface BobDylan {
  slug: string
  name: string
  thesis: string
  spec: Record<string, unknown>
}

// Strategy source (TS) — kept inline so the script ships standalone. We
// declare these BEFORE STRATEGIES references them so TS hoisting is happy.
const BOBDYLAN_1_TS = `import type { EvalContext, Decision } from './types'

export const config = { primary: 'BTC-USD', cadence: '1h', maxWeight: 0.35, riskAversion: 4, killSwitch: 0.12 }

export async function evaluate(ctx: EvalContext): Promise<Decision> {
  const bars = await ctx.data.binance(ctx.primary, '1h', 200)
  const c = bars.close.at(-1)!
  const ret20 = (c / bars.close.at(-20)! - 1)
  const ret5  = (c / bars.close.at(-5)!  - 1)
  const raw = Math.tanh(ret20 * 6 + ret5 * 4)
  const conviction = Math.max(0.05, Math.abs(raw))
  const side = raw >= 0 ? 'BUY' : 'SELL'
  const qty  = (ctx.nav * conviction * config.maxWeight) / c
  const thinking = (raw >= 0 ? 'momentum intact ' : 'momentum fading ') +
                   '20d ' + (ret20 * 100).toFixed(2) + '%, 5d ' + (ret5 * 100).toFixed(2) + '%'
  const fill = await ctx.exec.kraken({ symbol: ctx.primary, side, qty })
  await ctx.postLedger({ ...fill, thinking })
  return { side, qty, conviction, thinking }
}
`
const BOBDYLAN_2_TS = `import type { EvalContext, Decision } from './types'

export const config = { primary: 'BTC-USD', cadence: '1h', maxWeight: 0.20, riskAversion: 6, killSwitch: 0.18 }

export async function evaluate(ctx: EvalContext): Promise<Decision> {
  const bars = await ctx.data.binance(ctx.primary, '1h', 200)
  const closes = bars.close
  const rets = closes.slice(-30).map((c, i, a) => i === 0 ? 0 : (c - a[i-1]) / a[i-1])
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length
  const std  = Math.sqrt(rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length) || 0.01
  const ret1 = (closes.at(-1)! - closes.at(-2)!) / closes.at(-2)!
  const z = (ret1 - mean) / std
  const raw = Math.tanh(-z * 0.7)
  const conviction = Math.max(0.05, Math.abs(raw))
  const side = raw >= 0 ? 'BUY' : 'SELL'
  const qty = (ctx.nav * conviction * config.maxWeight) / closes.at(-1)!
  const thinking = 'z=' + z.toFixed(2) + ' ' + (Math.abs(z) > 1.5 ? 'stretched, fading' : 'near fair value')
  const fill = await ctx.exec.kraken({ symbol: ctx.primary, side, qty })
  await ctx.postLedger({ ...fill, thinking })
  return { side, qty, conviction, thinking }
}
`
const BOBDYLAN_3_TS = `import type { EvalContext, Decision } from './types'

export const config = { primary: 'BTC-USD', cadence: '1h', maxWeight: 0.25, riskAversion: 5, killSwitch: 0.15 }

export async function evaluate(ctx: EvalContext): Promise<Decision> {
  const bars = await ctx.data.binance(ctx.primary, '1h', 200)
  const c = bars.close.at(-1)!
  const ret20 = (c / bars.close.at(-20)! - 1)
  const ret5  = (c / bars.close.at(-5)!  - 1)
  const closes = bars.close
  const rets = closes.slice(-30).map((x, i, a) => i === 0 ? 0 : (x - a[i-1]) / a[i-1])
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length
  const std  = Math.sqrt(rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length) || 0.01
  const z = (((c - closes.at(-2)!) / closes.at(-2)!) - mean) / std
  const blend = 0.6 * Math.tanh(ret20 * 6) + 0.3 * Math.tanh(-z * 0.7) + 0.1 * (std > 0.04 ? -ret5 : ret5)
  const conviction = Math.max(0.05, Math.abs(blend))
  const side = blend >= 0 ? 'BUY' : 'SELL'
  const qty = (ctx.nav * conviction * config.maxWeight) / c
  const thinking = 'composite ' + (blend >= 0 ? 'long' : 'short') + ' mom ' + (ret20 * 100).toFixed(1) + '%, z ' + z.toFixed(2)
  const fill = await ctx.exec.kraken({ symbol: ctx.primary, side, qty })
  await ctx.postLedger({ ...fill, thinking })
  return { side, qty, conviction, thinking }
}
`

const STRATEGIES: BobDylan[] = [
  {
    slug: 'bobdylan-1',
    name: 'Bob Dylan 1 — Momentum Tambourine',
    thesis: 'Trend-following on BTC, ETH, SOL. Goes long when 20d momentum stays positive and 5d confirms. Tight 12% drawdown kill.',
    spec: {
      symbols: ['BTC-USD', 'ETH-USD', 'SOL-USD'],
      cadence: '1h',
      alpha_type: 'momentum',
      alpha_weights: { momentum: 1.0 },
      risk_aversion: 4,
      max_weight: 0.35,
      initial_capital: 100_000,
      template: 'momentum_conservative',
      strategy_code: BOBDYLAN_1_TS,
      config_json: JSON.stringify({ primary: 'BTC-USD', cadence: '1h', maxWeight: 0.35, riskAversion: 4, killSwitch: 0.12 }, null, 2),
      blocks: ['data.binance', 'ind.ema_cross', 'ind.atr', 'risk.killswitch', 'exec.twap'],
    },
  },
  {
    slug: 'bobdylan-2',
    name: 'Bob Dylan 2 — Mean Reversion Highway',
    thesis: 'Fades extremes on top-5 majors. Buys when |z| > 1.5 and 1d return is negative; trims at the mean. Pair with vol-target sizing.',
    spec: {
      symbols: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'ADA-USD'],
      cadence: '1h',
      alpha_type: 'mean_reversion',
      alpha_weights: { mean_reversion: 1.0 },
      risk_aversion: 6,
      max_weight: 0.20,
      initial_capital: 100_000,
      template: 'mean_reversion_active',
      strategy_code: BOBDYLAN_2_TS,
      config_json: JSON.stringify({ primary: 'BTC-USD', cadence: '1h', maxWeight: 0.20, riskAversion: 6, killSwitch: 0.18 }, null, 2),
      blocks: ['data.binance', 'ind.zscore', 'ind.bb', 'ind.rsi', 'risk.vol_target', 'exec.vwap'],
    },
  },
  {
    slug: 'bobdylan-3',
    name: 'Bob Dylan 3 — Composite Hurricane',
    thesis: 'Blends momentum (60%), mean-reversion (30%), and volatility (10%) across BTC/ETH/SOL/AVAX/LINK. Rebalances daily.',
    spec: {
      symbols: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'AVAX-USD', 'LINK-USD'],
      cadence: '1h',
      alpha_type: 'composite',
      alpha_weights: { momentum: 0.6, mean_reversion: 0.3, volatility: 0.1 },
      risk_aversion: 5,
      max_weight: 0.25,
      initial_capital: 100_000,
      template: 'composite_balanced',
      strategy_code: BOBDYLAN_3_TS,
      config_json: JSON.stringify({ primary: 'BTC-USD', cadence: '1h', maxWeight: 0.25, riskAversion: 5, killSwitch: 0.15 }, null, 2),
      blocks: ['data.binance', 'data.fearGreed', 'ind.ema_cross', 'ind.zscore', 'ind.atr', 'sig.composite', 'risk.parity', 'exec.twap'],
    },
  },
]

async function seedDirect() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required for direct mode')
    process.exit(1)
  }
  const sb = createClient(url, key)
  const ownerEmail = process.env.SEED_OWNER_EMAIL
  if (!ownerEmail) {
    console.error('SEED_OWNER_EMAIL required (the user that should own these algos)')
    process.exit(1)
  }
  const { data: users, error: ue } = await sb.auth.admin.listUsers()
  if (ue) { console.error('listUsers failed', ue); process.exit(1) }
  const owner = users?.users?.find(u => u.email === ownerEmail)
  if (!owner) { console.error('owner not found:', ownerEmail); process.exit(1) }

  for (const s of STRATEGIES) {
    console.log(`\n→ ${s.name}`)
    // 1. ai_agents row (idempotent on (owner, name))
    const { data: existing } = await sb.from('ai_agents').select('id').eq('owner_id', owner.id).eq('name', s.name).maybeSingle()
    let aiAgentId = (existing as { id?: string } | null)?.id
    if (!aiAgentId) {
      const { data: ins, error: ie } = await sb.from('ai_agents').insert({
        owner_id: owner.id, name: s.name, thesis: s.thesis,
        prompt: s.thesis, spec: s.spec, status: 'tested',
      }).select('id').single()
      if (ie) { console.error('insert ai_agents failed', ie); continue }
      aiAgentId = ins.id
      console.log(`  ai_agents row inserted: ${aiAgentId}`)
    } else {
      await sb.from('ai_agents').update({ thesis: s.thesis, spec: s.spec, status: 'published' }).eq('id', aiAgentId)
      console.log(`  ai_agents row updated: ${aiAgentId}`)
    }

    // 2. agents (exchange listing)
    const { error: ee } = await sb.from('agents').upsert({
      slug: s.slug,
      name: s.name,
      ticker: s.slug.replace('bobdylan-', 'BD').toUpperCase(),
      description: s.thesis,
      strategy_type: s.spec.alpha_type as string,
      asset_class: 'crypto',
      status: 'active',
      primary_symbol: (s.spec.symbols as string[])[0],
      backtest_strategy: 'custom',
      backtest_stats: { ai_agent_id: aiAgentId, symbols: s.spec.symbols, cadence: s.spec.cadence },
      strategy_description: s.thesis,
      plain_english: s.thesis,
      best_for: 'demo flagship',
      main_risk: 'crypto volatility',
      monthly_fee_cents: 0, subscriber_count: 0,
      owner_id: owner.id, developer_email: ownerEmail,
      developer_name: 'Bob Dylan', developer_fee_pct: 0,
      share_price_cents: 1000, total_shares: 100_000, total_aum_cents: 0, max_aum_cents: 100_000_000,
      last_active_at: new Date().toISOString(),
    }, { onConflict: 'slug' })
    if (ee) { console.error('upsert agents failed', ee); continue }
    console.log(`  agents listing upserted: /agents/${s.slug}`)
  }
  console.log('\n✓ all seeded.')
}

async function seedRemote(remote: string) {
  console.log(`Remote seed against ${remote} — for production use the SQL/admin path. Skipping.`)
  console.log(`(Use seedDirect() with SUPABASE_SERVICE_ROLE_KEY in env.)`)
}

const remoteFlag = process.argv.indexOf('--remote')
if (remoteFlag >= 0 && process.argv[remoteFlag + 1]) {
  void seedRemote(process.argv[remoteFlag + 1])
} else {
  void seedDirect()
}
