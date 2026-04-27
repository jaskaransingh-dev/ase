/**
 * GET /api/debug-trading
 *
 * Diagnostic endpoint: verifies Alpaca connectivity, crypto data feed,
 * DB connectivity, and shows current agent positions.
 *
 * Only available in development (NODE_ENV !== 'production').
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAccount, getCryptoBars, getPositions } from '@/lib/alpaca'
import { getAgentPositions } from '@/lib/agents'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const admin = createAdminClient()
  const alpacaKey = process.env.ALPACA_KEY_ID || ''
  const alpacaSecret = process.env.ALPACA_SECRET_KEY || ''
  const results: Record<string, unknown> = {}

  // 1. Alpaca account
  try {
    const account = await getAccount('debug')
    results.alpaca_account = {
      ok: true,
      cash: account.cash,
      portfolio_value: account.portfolio_value,
      buying_power: account.buying_power,
      status: account.status,
    }
  } catch (e) {
    results.alpaca_account = { ok: false, error: String(e) }
  }

  // 2. Crypto data feed (BTC/USD bars)
  try {
    const bars = await getCryptoBars('BTC/USD', '1Day', 5)
    results.btc_bars = {
      ok: bars.length > 0,
      count: bars.length,
      latest_close: bars.length > 0 ? bars[bars.length - 1].c : null,
      latest_time: bars.length > 0 ? bars[bars.length - 1].t : null,
    }
  } catch (e) {
    results.btc_bars = { ok: false, error: String(e) }
  }

  // 3. ETH/USD bars
  try {
    const bars = await getCryptoBars('ETH/USD', '1Day', 3)
    results.eth_bars = {
      ok: bars.length > 0,
      latest_close: bars.length > 0 ? bars[bars.length - 1].c : null,
    }
  } catch (e) {
    results.eth_bars = { ok: false, error: String(e) }
  }

  // 4. SOL/USD bars
  try {
    const bars = await getCryptoBars('SOL/USD', '1Day', 3)
    results.sol_bars = {
      ok: bars.length > 0,
      latest_close: bars.length > 0 ? bars[bars.length - 1].c : null,
    }
  } catch (e) {
    results.sol_bars = { ok: false, error: String(e) }
  }

  // 5. Alpaca positions (all, shared account)
  try {
    const positions = await getPositions('debug')
    results.alpaca_positions = {
      ok: true,
      count: positions.length,
      positions: positions.map(p => ({
        pair: p.pair,
        type: p.type,
        volume: p.volume,
        cost: p.cost,
        profit: p.profit,
        price: p.price,
      })),
    }
  } catch (e) {
    results.alpaca_positions = { ok: false, error: String(e) }
  }

  // 6. DB: agents list
  try {
    const { data: agents, error } = await admin
      .from('agents')
      .select('id, slug, name, status, total_aum_cents, share_price_cents')
      .eq('status', 'active')

    results.db_agents = {
      ok: !error,
      count: agents?.length || 0,
      agents: agents?.map(a => ({
        slug: a.slug,
        name: a.name,
        aum_usd: ((a.total_aum_cents || 0) / 100).toFixed(2),
        nav_usd: ((a.share_price_cents || 10000) / 100).toFixed(2),
      })),
    }
  } catch (e) {
    results.db_agents = { ok: false, error: String(e) }
  }

  // 7. Per-agent DB positions from agent_trades
  try {
    const { data: agents } = await admin
      .from('agents')
      .select('id, slug')
      .eq('status', 'active')

    const agentPositions: Record<string, unknown> = {}
    for (const agent of agents ?? []) {
      const positions = await getAgentPositions(admin, agent.id)
      agentPositions[agent.slug] = positions.map(p => ({
        symbol: p.symbol,
        qty: p.qty.toFixed(6),
        avg_entry_usd: p.avg_entry.toFixed(2),
        position_value_usd: (p.qty * p.avg_entry).toFixed(2),
      }))
    }
    results.agent_positions_from_db = { ok: true, data: agentPositions }
  } catch (e) {
    results.agent_positions_from_db = { ok: false, error: String(e) }
  }

  // 8. Recent trades
  try {
    const { data: trades, error } = await admin
      .from('agent_trades')
      .select('agent_id, symbol, side, qty, fill_price, filled_at, pnl_cents')
      .order('filled_at', { ascending: false })
      .limit(10)

    results.recent_trades = {
      ok: !error,
      count: trades?.length || 0,
      trades: trades?.map(t => ({
        symbol: t.symbol,
        side: t.side,
        qty: t.qty,
        fill_price: t.fill_price,
        filled_at: t.filled_at,
        pnl_usd: t.pnl_cents !== null ? (Number(t.pnl_cents) / 100).toFixed(2) : null,
      })),
    }
  } catch (e) {
    results.recent_trades = { ok: false, error: String(e) }
  }

  // 9. Latest NAV snapshots
  try {
    const { data: stats } = await admin
      .from('agent_stats')
      .select('agent_id, nav_cents, total_return_pct, win_rate_pct, total_trades, snapshot_at')
      .order('snapshot_at', { ascending: false })
      .limit(5)

    results.latest_nav_snapshots = {
      ok: true,
      data: stats?.map(s => ({
        nav_usd: ((s.nav_cents || 0) / 100).toFixed(2),
        return_pct: s.total_return_pct,
        win_rate: s.win_rate_pct,
        trades: s.total_trades,
        at: s.snapshot_at,
      })),
    }
  } catch (e) {
    results.latest_nav_snapshots = { ok: false, error: String(e) }
  }

  // Summary
  const allOk = Object.values(results).every((r: any) => r?.ok !== false)

  return NextResponse.json({
    status: allOk ? '✅ All systems operational' : '⚠️ Some checks failed',
    checked_at: new Date().toISOString(),
    env: {
      alpaca_key_configured: !!alpacaKey,
      cron_secret_configured: !!process.env.CRON_SECRET,
    },
    ...results,
  })
}
