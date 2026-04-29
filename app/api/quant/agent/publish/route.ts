/**
 * POST /api/quant/agent/publish?id=<aiAgentId>
 *
 * Publishes an AI-generated agent everywhere:
 *   1. Flips ai_agents.status = 'published'
 *   2. Inserts a row in public.agents (the exchange marketplace table)
 *      so the agent appears on /dashboard/marketplace and /agents.
 *   3. Triggers an immediate paper-trade tick.
 *
 * NO GATING (test mode). Body: { live?: boolean } — default paper.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'agent'
}

function tickerFromName(name: string): string {
  // 3-5 char ticker — first letters of words, fallback to first chars
  const words = name.split(/\s+/).filter(Boolean)
  let t = words.map(w => w[0]).join('').toUpperCase()
  if (t.length < 3) t = name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)
  return t.slice(0, 5) || 'AIAG'
}

export async function POST(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { live?: boolean; monthly_fee_cents?: number; skip_tick?: boolean }

  // Read AI agent
  const { data: aiAgent, error: readErr } = await supabase
    .from('ai_agents').select('*').eq('id', id).eq('owner_id', user.id).single()
  if (readErr || !aiAgent) return NextResponse.json({ error: 'agent not found' }, { status: 404 })

  const admin = createAdminClient()
  const spec = aiAgent.spec as Record<string, any>
  const symbols: string[] = spec?.symbols ?? []
  const primarySymbol = symbols[0] ?? 'BTC-USD'

  // 1) Flip ai_agents status
  const { error: flipErr } = await admin
    .from('ai_agents')
    .update({ status: 'published', spec: { ...spec, live_mode: !!body.live } })
    .eq('id', id)
  if (flipErr) return NextResponse.json({ error: flipErr.message }, { status: 500 })

  // 2) Upsert exchange listing in public.agents
  const baseSlug = slugify(aiAgent.name)
  // Avoid slug collisions by appending the ai_agent uuid prefix
  const slug = `${baseSlug}-${id.slice(0, 6)}`

  const exchangeRow = {
    slug,
    name: aiAgent.name,
    ticker: tickerFromName(aiAgent.name),
    description: aiAgent.thesis,
    strategy_type: spec?.alpha_type ?? 'composite',
    asset_class: 'crypto',
    status: 'active',
    primary_symbol: primarySymbol,
    backtest_strategy: spec?.template ?? 'composite_balanced',
    backtest_stats: {
      grade: aiAgent.last_grade,
      score: aiAgent.last_score,
      sharpe: aiAgent.last_sharpe,
      cagr: aiAgent.last_cagr,
      max_dd: aiAgent.last_max_dd,
      cadence: spec?.cadence ?? '1h',
      symbols,
      ai_agent_id: id,        // back-link
    },
    strategy_description: aiAgent.thesis,
    plain_english: aiAgent.thesis,
    best_for: spec?.cadence?.includes('m') || spec?.cadence?.includes('h') ? 'Active traders' : 'Swing / position',
    main_risk: 'Crypto volatility · synthetic-data warm-up if live data is unavailable',
    monthly_fee_cents: body.monthly_fee_cents ?? 0,   // free during test mode
    subscriber_count: 0,
    owner_id: user.id,
    developer_email: user.email,
    developer_name: (user.user_metadata?.name as string) ?? user.email?.split('@')[0],
    developer_fee_pct: 0,
    last_active_at: new Date().toISOString(),
  }

  // Try insert; if slug exists, update
  const { data: listing, error: listErr } = await admin
    .from('agents')
    .upsert(exchangeRow, { onConflict: 'slug' })
    .select('id, slug, name, ticker, status')
    .single()

  if (listErr) {
    return NextResponse.json({
      error: `published ai_agent but exchange listing failed: ${listErr.message}`,
      ai_agent_id: id,
    }, { status: 500 })
  }

  // 3) Trigger immediate paper-trade tick only when NOT called from the builder UI
  //    (the builder awaits its own tick after publish to avoid double-posting).
  //    Callers that want the tick to be suppressed pass skip_tick=true in the body.
  if (!body.skip_tick) {
    fetch(new URL('/api/quant/agent/tick', req.url).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: id }),
    }).catch(() => {})
  }

  return NextResponse.json({
    ai_agent_id: id,
    listing,
    note: body.live
      ? 'Published in LIVE mode + listed on the exchange. Paper trades will start on the next cadence tick.'
      : 'Published in PAPER mode + listed on the exchange. First tick fired now.',
    marketplace_url: `/dashboard/marketplace`,
    agent_url: `/agents/${listing.slug}`,
  })
}
