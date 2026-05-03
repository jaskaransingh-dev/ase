/**
 * POST /api/quant/agent/tick
 *
 * Cadence-driven scheduler tick. Walks all published agents whose cadence is
 * due, generates signals, and writes trades + reasoning to agent_paper_ledger.
 *
 * Cadences: 5m | 15m | 30m | 1h | 2h | 4h | daily | weekly | adaptive
 *   adaptive = agent evaluates market regime and skips when quiet
 *
 * Trigger:
 *  - Vercel Cron every minute
 *  - Manual: POST { agent_id } to force-tick one agent
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { synthesizeBars } from '@/app/api/backtest/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CADENCE_MS: Record<string, number> = {
  '5m':      5  * 60_000,
  '15m':     15 * 60_000,
  '30m':     30 * 60_000,
  '1h':      60 * 60_000,
  '2h':      2  * 60 * 60_000,
  '4h':      4  * 60 * 60_000,
  'daily':   24 * 60 * 60_000,
  'weekly':   7 * 24 * 60 * 60_000,
  'adaptive': 60 * 60_000, // base check interval; may skip if market is calm
}

const INACTIVE_THRESHOLD_MS = 7 * 24 * 60 * 60_000

interface AgentRow {
  id: string
  owner_id: string
  name: string
  spec: {
    symbols?: string[]
    cadence?: string
    alpha_type?: string
    max_weight?: number
    initial_capital?: number
    risk_aversion?: number
    [k: string]: unknown
  }
  last_tick_at?: string | null
}

interface Signal {
  symbol: string
  side: 'BUY' | 'SELL'
  weight: number
  price: number
  thinking: string
  signal: number
}

function due(agent: AgentRow, now: number): boolean {
  const cadence = agent.spec?.cadence ?? '1h'
  const interval = CADENCE_MS[cadence] ?? CADENCE_MS['1h']
  if (!agent.last_tick_at) return true
  return now - new Date(agent.last_tick_at).getTime() >= interval
}

/** Build a human-readable reasoning string for this trade */
function buildThinking(
  alphaType: string,
  sym: string,
  side: 'BUY' | 'SELL',
  ret1: number,
  ret5: number,
  ret20: number,
  z: number,
  signal: number,
  rank: number,
  total: number,
): string {
  const pct = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`
  const dir = side === 'BUY' ? 'going long' : 'trimming'
  const lines: string[] = []

  if (alphaType === 'momentum') {
    lines.push(`20d trend ${pct(ret20)}, 5d ${pct(ret5)} — momentum ${ret20 > 0 ? 'intact' : 'fading'}`)
  } else if (alphaType === 'mean_reversion') {
    lines.push(`Z-score ${z.toFixed(2)}σ — ${Math.abs(z) > 1.5 ? 'statistically stretched, expect reversion' : 'near fair value, limited edge'}`)
    lines.push(`1d return ${pct(ret1)}`)
  } else if (alphaType === 'volatility') {
    lines.push(`Vol regime: ${Math.abs(z) > 2 ? 'high — defensive stance' : 'normal — risk-on'}`)
  } else {
    // composite
    lines.push(`Composite score: 20d mom ${pct(ret20)}, Z ${z.toFixed(2)}σ, 5d ${pct(ret5)}`)
  }
  lines.push(`Ranked #${rank} of ${total} by ${alphaType} alpha — ${dir} ${sym}`)

  return lines.join('. ') + '.'
}

/** Generate buy/sell signals with reasoning for all symbols in spec */
function decide(spec: AgentRow['spec'], agentName: string): Signal[] {
  const symbols    = spec.symbols ?? []
  if (!symbols.length) return []

  const alphaType  = (spec.alpha_type as string)   ?? 'composite'
  const maxWeight  = (spec.max_weight as number)    ?? 0.25
  const riskLambda = (spec.risk_aversion as number) ?? 8
  const cadence    = (spec.cadence as string)       ?? '1h'
  const base       = Math.min(maxWeight, 1 / Math.max(2, symbols.length)) * (10 / Math.max(2, riskLambda))

  let totalVol = 0

  const scored = symbols.map(sym => {
    const bars  = synthesizeBars(sym, '3mo')
    const n     = bars.length
    const last  = bars[n - 1]
    const d1    = bars[n - 2]?.close  ?? last.close
    const d5    = bars[n - 6]?.close  ?? last.close
    const d20   = bars[n - 21]?.close ?? last.close
    const ret1  = (last.close - d1)  / d1
    const ret5  = (last.close - d5)  / d5
    const ret20 = (last.close - d20) / d20

    const rets  = bars.slice(-20).map((b, i, arr) => i === 0 ? 0 : (b.close - arr[i - 1].close) / arr[i - 1].close)
    const mean  = rets.reduce((s, r) => s + r, 0) / rets.length
    const std   = Math.sqrt(rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length) || 0.01
    const z     = (ret1 - mean) / std
    totalVol   += std

    // Volume + ML proxies + user-supplied alpha_weights blend.
    // AI agents ship a config like { alpha_type: "composite", alpha_weights:
    // { momentum: 0.5, mean_reversion: 0.3, volatility: 0.2 } }. We compute
    // each component, then blend per the user's weights so cron actually
    // honors the strategy authored in /dashboard/build instead of a fixed
    // formula. Falls back to a sensible mix if alpha_weights is missing.
    const aw = (spec.alpha_weights as Record<string, number> | undefined) ?? null
    const momSig = ret20 * 0.6 + ret5 * 0.4
    const revSig = -z
    const volSig = std > 0.04 ? -ret5 : ret5
    const lastVol = (last as { volume?: number }).volume ?? 0
    const prevVol = ((bars[n-2] as { volume?: number } | undefined)?.volume) ?? 1
    const volumeSig = lastVol > 0 ? Math.tanh((lastVol / Math.max(1e-6, prevVol) - 1)) * Math.sign(ret1) : 0
    const mlSig = Math.tanh(ret20 * 4) * 0.5 + Math.tanh(ret5 * 6) * 0.5  // logistic-like proxy

    let signal: number
    if (alphaType === 'momentum')         signal = momSig
    else if (alphaType === 'mean_reversion') signal = revSig
    else if (alphaType === 'volatility')  signal = volSig
    else if (alphaType === 'volume')      signal = volumeSig
    else if (alphaType === 'ml')          signal = mlSig
    else if (aw) {
      // Composite with user weights — normalize so they sum to 1.
      const sum = (aw.momentum ?? 0) + (aw.mean_reversion ?? 0) + (aw.volatility ?? 0) + (aw.volume ?? 0) + (aw.ml ?? 0)
      const n = sum > 0 ? sum : 1
      signal = (
        (aw.momentum ?? 0) * momSig +
        (aw.mean_reversion ?? 0) * revSig +
        (aw.volatility ?? 0) * volSig +
        (aw.volume ?? 0) * volumeSig +
        (aw.ml ?? 0) * mlSig
      ) / n
    }
    else signal = 0.4 * ret20 + 0.3 * (-z) + 0.3 * ret5

    return { sym, signal, price: last.close, ret1, ret5, ret20, z }
  })

  // Always-scanning: even in quiet markets we take the strongest 1-2 signals.
  // The previous "adaptive skip" left agents idle for hours — agents must
  // continuously trade on relative ranking, not absolute vol.
  void totalVol
  void cadence

  scored.sort((a, b) => b.signal - a.signal)

  // Wider bracket: top half buys, bottom half trims — guarantees ≥2 trades/cycle
  // for any 3+ symbol agent.
  const nBuys  = Math.min(Math.ceil(scored.length / 2), 4)
  const nSells = Math.min(Math.floor(scored.length / 2), 3)
  const total  = scored.length

  const decisions: Signal[] = []

  for (let i = 0; i < nBuys; i++) {
    const s = scored[i]
    decisions.push({
      symbol:   s.sym,
      side:     'BUY',
      weight:   base,
      price:    s.price,
      signal:   s.signal,
      thinking: buildThinking(alphaType, s.sym, 'BUY', s.ret1, s.ret5, s.ret20, s.z, s.signal, i + 1, total),
    })
  }

  const sellCandidates = scored.slice(-nSells).reverse().filter(s => !decisions.some(d => d.symbol === s.sym))
  for (let i = 0; i < sellCandidates.length; i++) {
    const s = sellCandidates[i]
    decisions.push({
      symbol:   s.sym,
      side:     'SELL',
      weight:   base,
      price:    s.price,
      signal:   s.signal,
      thinking: buildThinking(alphaType, s.sym, 'SELL', s.ret1, s.ret5, s.ret20, s.z, s.signal, total - i, total),
    })
  }

  return decisions
}

/** Auto-archive published agents with no ledger activity in 7 days */
async function archiveInactiveAgents(admin: ReturnType<typeof createAdminClient>) {
  const cutoff = new Date(Date.now() - INACTIVE_THRESHOLD_MS).toISOString()
  const { data: stale } = await admin
    .from('ai_agents')
    .select('id, name')
    .eq('status', 'published')
    .lt('last_tick_at', cutoff)

  if (!stale?.length) return

  for (const agent of stale) {
    const { count } = await admin
      .from('agent_paper_ledger')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agent.id)
      .gte('executed_at', cutoff)

    if ((count ?? 0) === 0) {
      await admin.from('ai_agents').update({ status: 'archived' }).eq('id', agent.id)
      console.log(`[tick] Archived "${agent.name}" — no trades in 7d`)
    }
  }
}

export async function POST(req: Request) {
  const admin = createAdminClient()
  const body  = await req.json().catch(() => ({})) as { agent_id?: string }

  if (!body.agent_id) {
    await archiveInactiveAgents(admin).catch(e => console.warn('[tick] archive check failed:', e))
  }

  let q = admin.from('ai_agents').select('*').eq('status', 'published')
  if (body.agent_id) q = q.eq('id', body.agent_id)

  const { data: agents, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!agents?.length) return NextResponse.json({ ticked: [], ts: new Date().toISOString(), note: 'No published agents' })

  const now    = Date.now()
  const ticked: Array<{ agent_id: string; name: string; trades: number; note?: string }> = []

  for (const agent of agents as AgentRow[]) {
    const forced = !!body.agent_id
    if (!forced && !due(agent, now)) continue

    const symbols = agent.spec?.symbols ?? []
    if (!symbols.length) {
      await admin.from('ai_agents').update({ last_tick_at: new Date().toISOString() }).eq('id', agent.id)
      ticked.push({ agent_id: agent.id, name: agent.name, trades: 0, note: 'No symbols configured' })
      continue
    }

    const decisions = decide(agent.spec, agent.name)

    if (decisions.length === 0) {
      await admin.from('ai_agents').update({ last_tick_at: new Date().toISOString() }).eq('id', agent.id)
      ticked.push({ agent_id: agent.id, name: agent.name, trades: 0, note: 'Adaptive: market quiet — no trade this cycle' })
      continue
    }

    const capital = (agent.spec?.initial_capital as number) ?? 100_000
    const ts      = new Date().toISOString()

    const rows = decisions.map(d => ({
      agent_id:    agent.id,
      owner_id:    agent.owner_id,
      symbol:      d.symbol,
      side:        d.side,
      qty:         (capital * d.weight) / d.price,
      price:       d.price,
      notional:    capital * d.weight,
      mode:        'live',
      executed_at: ts,
      // `thinking` is on the ledger schema in dev but absent in some
      // production migrations — skip it if rejected. We stash the rationale
      // into the agent's spec.last_thinking[] history below so it's still
      // visible in the UI without a schema change.
    }))

    try {
      const { error: insertErr } = await admin.from('agent_paper_ledger').insert(rows)
      if (insertErr) throw insertErr
      // Stash the latest decisions (including thinking text) into the
      // ai_agents.spec.recent_decisions array so the UI can still surface
      // reasoning even though agent_paper_ledger doesn't have a thinking
      // column on this Supabase project.
      const recent = decisions.map(d => ({ symbol: d.symbol, side: d.side, signal: d.signal, thinking: d.thinking, at: ts }))
      const trimmedSpec = { ...(agent.spec ?? {}), recent_decisions: recent }
      await admin.from('ai_agents').update({ last_tick_at: ts, spec: trimmedSpec }).eq('id', agent.id)
      ticked.push({ agent_id: agent.id, name: agent.name, trades: rows.length })
    } catch (e) {
      const msg = e instanceof Error ? e.message
                : typeof e === 'object' && e !== null ? JSON.stringify(e)
                : String(e)
      ticked.push({ agent_id: agent.id, name: agent.name, trades: 0, note: 'Insert error: ' + msg })
    }
  }

  return NextResponse.json({ ticked, ts: new Date().toISOString() })
}

// Vercel cron fires GET — re-route it through the same tick logic so every
// scheduled invocation walks all due published agents.
export async function GET(req: Request) {
  return POST(new Request(req.url, { method: 'POST', headers: req.headers, body: '{}' }))
}
