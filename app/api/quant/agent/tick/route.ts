/**
 * POST /api/quant/agent/tick
 *
 * Cadence-driven scheduler tick. Walks all published agents whose cadence is
 * due, runs a quick backtest snapshot, and writes the resulting trades to
 * agent_paper_ledger so users can copy them.
 *
 * Trigger options:
 *  - Vercel Cron every minute hitting this route.
 *  - Manual: POST { agent_id } to force a tick for one agent.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { synthesizeBars } from '@/app/api/backtest/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CADENCE_MS: Record<string, number> = {
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '2h': 2 * 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  'daily': 24 * 60 * 60_000,
  'weekly': 7 * 24 * 60 * 60_000,
}

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
    [k: string]: unknown
  }
  last_tick_at?: string | null
}

function due(agent: AgentRow, now: number): boolean {
  const cadence = agent.spec?.cadence ?? '1h'
  const interval = CADENCE_MS[cadence] ?? CADENCE_MS['1h']
  if (!agent.last_tick_at) return true
  return now - new Date(agent.last_tick_at).getTime() >= interval
}

/**
 * Lightweight signal generator that respects the agent's spec:
 *  - alpha_type: momentum / mean_reversion / composite
 *  - max_weight: per-name cap → trade size
 *  - risk_aversion: scales position weights down further (higher λ = smaller)
 *  - symbols: universe
 *
 * Generates BUY/SELL decisions that reflect the configured edge, so the
 * paper-trade ledger looks like the agent's actual strategy in action.
 */
function decide(spec: AgentRow['spec']): Array<{ symbol: string; side: 'BUY' | 'SELL'; weight: number; price: number }> {
  const symbols = spec.symbols ?? []
  if (!symbols.length) return []
  const alphaType = (spec.alpha_type as string) ?? 'composite'
  const maxWeight = (spec.max_weight as number) ?? 0.25
  const riskLambda = (spec.risk_aversion as number) ?? 8
  const baseWeight = Math.min(maxWeight, 1 / Math.max(2, symbols.length)) * (10 / Math.max(2, riskLambda))

  // Score each symbol per its alpha type
  const scored = symbols.map(sym => {
    const bars = synthesizeBars(sym, '3mo')
    const n = bars.length
    const last = bars[n - 1]
    const d1 = bars[n - 2]?.close ?? last.close
    const d5 = bars[n - 6]?.close ?? last.close
    const d20 = bars[n - 21]?.close ?? last.close
    const ret1 = (last.close - d1) / d1
    const ret5 = (last.close - d5) / d5
    const ret20 = (last.close - d20) / d20
    // rolling volatility
    const rets = bars.slice(-20).map((b, i, arr) => i === 0 ? 0 : (b.close - arr[i-1].close) / arr[i-1].close)
    const mean = rets.reduce((s, r) => s + r, 0) / rets.length
    const std = Math.sqrt(rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length) || 0.01
    const z = (ret1 - mean) / std

    let signal: number
    if (alphaType === 'momentum') signal = ret20 * 0.6 + ret5 * 0.4
    else if (alphaType === 'mean_reversion') signal = -z
    else if (alphaType === 'volatility') signal = std > 0.04 ? -ret5 : ret5
    else signal = 0.4 * ret20 + 0.3 * (-z) + 0.3 * ret5  // composite
    return { symbol: sym, signal, price: last.close }
  })

  // Rank and emit top-K BUYs and bottom-K SELLs
  // Always emit at least 2 trades: strongest signal → BUY, weakest signal → SELL
  // (even if all signals are positive/negative — the relative ranking matters for rebalancing)
  scored.sort((a, b) => b.signal - a.signal)
  const out: Array<{ symbol: string; side: 'BUY' | 'SELL'; weight: number; price: number }> = []
  const nBuys  = Math.min(Math.ceil(scored.length / 2), 3)
  const nSells = Math.min(Math.floor(scored.length / 2), 2)
  // Top N by signal → BUY (always, regardless of sign — represents "overweight")
  for (const b of scored.slice(0, nBuys)) {
    out.push({ symbol: b.symbol, side: 'BUY', weight: baseWeight, price: b.price })
  }
  // Bottom N by signal → SELL (trim / underweight), avoid duplicates
  for (const s of scored.slice(-nSells).reverse()) {
    if (!out.some(o => o.symbol === s.symbol)) {
      out.push({ symbol: s.symbol, side: 'SELL', weight: baseWeight, price: s.price })
    }
  }
  return out
}

const INACTIVE_THRESHOLD_MS = 7 * 24 * 60 * 60_1000 // 7 days of no activity

async function checkAndRemoveInactiveAgents(admin: ReturnType<typeof createAdminClient>) {
  const sevenDaysAgo = new Date(Date.now() - INACTIVE_THRESHOLD_MS).toISOString()
  
  // Find published agents with no recent ledger activity
  const { data: staleAgents } = await admin
    .from('ai_agents')
    .select('id, name, status, last_tick_at')
    .eq('status', 'published')
    .lt('last_tick_at', sevenDaysAgo)

  if (!staleAgents?.length) return

  // Check each stale agent for ledger activity
  for (const agent of staleAgents) {
    const { count } = await admin
      .from('agent_paper_ledger')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agent.id)
      .gte('executed_at', sevenDaysAgo)

    if (count === 0) {
      // No trades in 7 days - auto-remove from exchange
      await admin.from('ai_agents').update({ status: 'archived' }).eq('id', agent.id)
      console.log(`[tick] Auto-archived agent "${agent.name}" (${agent.id}) - no trades in 7 days`)
    }
  }
}

export async function POST(req: Request) {
  const admin = createAdminClient()
  const body = await req.json().catch(() => ({})) as { agent_id?: string }

  // Auto-cleanup inactive agents on each tick cycle
  if (!body.agent_id) {
    await checkAndRemoveInactiveAgents(admin)
  }

  let q = admin.from('ai_agents').select('*').eq('status', 'published')
  if (body.agent_id) q = q.eq('id', body.agent_id)
  const { data: agents, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!agents?.length) return NextResponse.json({ ticked: [], ts: new Date().toISOString(), note: 'No published agents found' })

  const now = Date.now()
  const ticked: Array<{ agent_id: string; trades: number; note?: string }> = []

  for (const agent of (agents ?? []) as AgentRow[]) {
    const isForcedTick = !!body.agent_id
    if (!isForcedTick && !due(agent, now)) continue

    const symbols = agent.spec?.symbols ?? []
    if (!symbols.length) {
      await admin.from('ai_agents').update({ last_tick_at: new Date().toISOString() }).eq('id', agent.id)
      ticked.push({ agent_id: agent.id, trades: 0, note: 'No symbols in spec' })
      continue
    }

    const decisions = decide(agent.spec)
    if (decisions.length === 0) {
      await admin.from('ai_agents').update({ last_tick_at: new Date().toISOString() }).eq('id', agent.id)
      ticked.push({ agent_id: agent.id, trades: 0, note: 'No trading decisions generated' })
      continue
    }

    const capital = (agent.spec?.initial_capital as number) ?? 100_000
    const rows = decisions.map(d => ({
      agent_id: agent.id,
      owner_id: agent.owner_id,
      symbol: d.symbol,
      side: d.side,
      qty: (capital * d.weight) / d.price,
      price: d.price,
      notional: capital * d.weight,
      mode: (agent.spec as Record<string, unknown>)?.live_mode ? 'live' : 'paper',
      executed_at: new Date().toISOString(),
    }))

    try {
      await admin.from('agent_paper_ledger').insert(rows)
      await admin.from('ai_agents').update({ last_tick_at: new Date().toISOString() }).eq('id', agent.id)
      ticked.push({ agent_id: agent.id, trades: rows.length })
    } catch (insertErr: any) {
      ticked.push({ agent_id: agent.id, trades: 0, note: 'Insert failed: ' + insertErr.message })
    }
  }

  return NextResponse.json({ ticked, ts: new Date().toISOString() })
}

export async function GET() {
  return NextResponse.json({ status: 'ok', cadences: Object.keys(CADENCE_MS) })
}
