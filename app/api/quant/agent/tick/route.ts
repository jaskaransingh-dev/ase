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

/** Toy signal: pick the symbol with highest 1-day return as BUY, lowest as SELL. */
function decide(symbols: string[]): Array<{ symbol: string; side: 'BUY' | 'SELL'; weight: number; price: number }> {
  if (!symbols.length) return []
  const scored = symbols.map(sym => {
    const bars = synthesizeBars(sym, '1mo')
    const last = bars[bars.length - 1]
    const prev = bars[bars.length - 2] ?? last
    const ret = (last.close - prev.close) / prev.close
    return { symbol: sym, ret, price: last.close }
  })
  scored.sort((a, b) => b.ret - a.ret)
  const top = scored[0]
  const bot = scored[scored.length - 1]
  const out: Array<{ symbol: string; side: 'BUY' | 'SELL'; weight: number; price: number }> = []
  if (top && top.ret > 0) out.push({ symbol: top.symbol, side: 'BUY', weight: 0.25, price: top.price })
  if (bot && bot.ret < 0 && bot.symbol !== top?.symbol) out.push({ symbol: bot.symbol, side: 'SELL', weight: 0.25, price: bot.price })
  return out
}

export async function POST(req: Request) {
  const admin = createAdminClient()
  const body = await req.json().catch(() => ({})) as { agent_id?: string }

  let q = admin.from('ai_agents').select('*').eq('status', 'published')
  if (body.agent_id) q = q.eq('id', body.agent_id)
  const { data: agents, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const now = Date.now()
  const ticked: Array<{ agent_id: string; trades: number }> = []

  for (const agent of (agents ?? []) as AgentRow[]) {
    if (!body.agent_id && !due(agent, now)) continue

    const symbols = agent.spec?.symbols ?? []
    const decisions = decide(symbols)
    if (decisions.length === 0) {
      await admin.from('ai_agents').update({ last_tick_at: new Date().toISOString() }).eq('id', agent.id)
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

    await admin.from('agent_paper_ledger').insert(rows)
    await admin.from('ai_agents').update({ last_tick_at: new Date().toISOString() }).eq('id', agent.id)
    ticked.push({ agent_id: agent.id, trades: rows.length })
  }

  return NextResponse.json({ ticked, ts: new Date().toISOString() })
}

export async function GET() {
  return NextResponse.json({ status: 'ok', cadences: Object.keys(CADENCE_MS) })
}
