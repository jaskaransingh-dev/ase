/**
 * GET /api/quant/agent/ledger?agent_id=...&limit=100
 *
 * Returns the public paper-trade ledger for one agent. Two tables can hold
 * fills depending on which subsystem owns the agent:
 *   - `agent_paper_ledger` — user-built quant agents (ai_agents.id refs)
 *   - `agent_trades`       — AGENT_CONFIGS strategies executed by the
 *                            run-agents cron (public.agents.id refs)
 *
 * The marketplace doesn't know or care which one an agent came from, so we
 * read both and union them. Empty rows from a non-matching table are
 * harmless.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

type LedgerRow = {
  agent_id: string
  symbol: string
  side: 'BUY' | 'SELL'
  qty: number
  price: number
  notional: number
  executed_at: string
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const agentId = url.searchParams.get('agent_id')
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10), 500)
  if (!agentId) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

  const admin = createAdminClient()

  const [paperRes, tradesRes] = await Promise.all([
    admin
      .from('agent_paper_ledger')
      .select('agent_id, symbol, side, qty, price, notional, executed_at')
      .eq('agent_id', agentId)
      .order('executed_at', { ascending: false })
      .limit(limit),
    admin
      .from('agent_trades')
      .select('agent_id, symbol, side, qty, fill_price, filled_at')
      .eq('agent_id', agentId)
      .order('filled_at', { ascending: false })
      .limit(limit),
  ])

  const rows: LedgerRow[] = []

  for (const r of paperRes.data ?? []) {
    rows.push({
      agent_id: r.agent_id,
      symbol: r.symbol,
      side: String(r.side).toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
      qty: Number(r.qty) || 0,
      price: Number(r.price) || 0,
      notional: Number(r.notional) || 0,
      executed_at: r.executed_at,
    })
  }

  for (const t of tradesRes.data ?? []) {
    const qty = Number(t.qty) || 0
    const price = Number(t.fill_price) || 0
    rows.push({
      agent_id: t.agent_id,
      symbol: t.symbol,
      side: String(t.side).toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
      qty,
      price,
      notional: qty * price,
      executed_at: t.filled_at,
    })
  }

  rows.sort((a, b) => +new Date(b.executed_at) - +new Date(a.executed_at))
  return NextResponse.json({ trades: rows.slice(0, limit) })
}
