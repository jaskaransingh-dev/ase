/**
 * POST /api/admin/reconcile
 *
 * Reconciles agent_trades DB positions with real Alpaca positions.
 * Fixes stale DB ledger by syncing Alpaca's actual open positions.
 * 
 * Also triggers a fresh agent run after reconciliation.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get('x-cron-secret')
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const results: Record<string, unknown> = {}

  try {
    // ── 1. Fetch ALL open positions from Alpaca ──────────────────────
    const ALPACA_KEY = process.env.ALPACA_KEY_ID || ''
    const ALPACA_SECRET = process.env.ALPACA_SECRET_KEY || ''
    const ALPACA_BASE = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets'

    let alpacaPositions: Record<string, number> = {}
    try {
      const res = await fetch(`${ALPACA_BASE}/v2/positions`, {
        headers: {
          'APCA-API-KEY-ID': ALPACA_KEY,
          'APCA-API-SECRET-KEY': ALPACA_SECRET,
        },
      })
      if (res.ok) {
        const positions = await res.json()
        for (const pos of positions) {
          alpacaPositions[pos.symbol] = parseFloat(pos.qty)
        }
      }
    } catch (e) {
      results['alpaca_fetch_error'] = e instanceof Error ? e.message : String(e)
    }

    results['alpaca_positions'] = alpacaPositions

    // ── 2. Get all agents and their DB-tracked positions ────────────────
    const { data: agents } = await admin
      .from('agents')
      .select('id, slug, name')
      .eq('status', 'active')
      .eq('asset_class', 'crypto')

    if (!agents) {
      return NextResponse.json({ error: 'No agents found' }, { status: 404 })
    }

    const reconciliationReports = []

    for (const agent of agents) {
      // Get open positions from DB (no closing trade = still open)
      const { data: dbTrades } = await admin
        .from('agent_trades')
        .select('*')
        .eq('agent_id', agent.id)
        .is('closed_at', null)
        .order('filled_at', { ascending: true })

      // Group by symbol to find open positions
      const dbPositions: Record<string, { qty: number; avg_price: number; trade_id: string }> = {}
      for (const t of dbTrades || []) {
        const sym = t.symbol
        if (!dbPositions[sym]) {
          dbPositions[sym] = { qty: 0, avg_price: 0, trade_id: t.id }
        }
        const qty = t.side === 'buy' ? parseFloat(String(t.qty)) : -parseFloat(String(t.qty))
        dbPositions[sym].qty += qty
      }

      // Clean up zero qty positions
      for (const sym of Object.keys(dbPositions)) {
        if (Math.abs(dbPositions[sym].qty) < 0.0001) {
          delete dbPositions[sym]
        }
      }

      // Compare DB vs Alpaca for this agent's symbols
      // Note: All agents share the same Alpaca account, so we track per-agent in the DB
      // The "correct" state is what Alpaca says is open
      const dbSymbols = Object.keys(dbPositions)
      const alpacaSymbols = Object.keys(alpacaPositions)

      const report = {
        agent: agent.slug,
        db_symbols: dbSymbols,
        alpaca_symbols: alpacaSymbols,
        discrepancies: [] as string[],
        actions: [] as string[],
      }

      // Find symbols in DB but not in Alpaca (should be closed but not marked)
      for (const sym of dbSymbols) {
        if (!alpacaSymbols.includes(sym) && Math.abs(dbPositions[sym].qty) > 0.0001) {
          report.discrepancies.push(`${sym}: DB thinks ${dbPositions[sym].qty.toFixed(4)}, Alpaca has 0 — CLOSING TRADE NEEDED`)
          report.actions.push(`SELL ${sym} ${dbPositions[sym].qty.toFixed(8)}`)
        }
      }

      // Find symbols in Alpaca but not in DB (should be open but not logged)
      for (const sym of alpacaSymbols) {
        if (!dbSymbols.includes(sym) && Math.abs(alpacaPositions[sym]) > 0.0001) {
          report.discrepancies.push(`${sym}: DB thinks 0, Alpaca has ${alpacaPositions[sym].toFixed(4)} — MISSING OPEN TRADE`)
          report.actions.push(`BUY ${sym} ${alpacaPositions[sym].toFixed(8)} (from Alpaca)`)
        }
      }

      // Execute corrective actions if any
      for (const action of report.actions) {
        const parts = action.split(' ')
        const side = parts[0]
        const symbol = parts[1]
        const qtyStr = parts[2]
        const notionalStr = parts[3]

        if (side === 'SELL' && symbol && qtyStr) {
          const qty = parseFloat(qtyStr)
          try {
            const orderRes = await fetch(`${ALPACA_BASE}/v2/orders`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'APCA-API-KEY-ID': ALPACA_KEY,
                'APCA-API-SECRET-KEY': ALPACA_SECRET,
              },
              body: JSON.stringify({
                symbol,
                side: 'sell',
                qty: qty.toFixed(8),
                type: 'market',
                time_in_force: 'gtc',
              }),
            })
            if (orderRes.ok) {
              const order = await orderRes.json()
              // Wait for fill
              await new Promise(r => setTimeout(r, 3000))
              const fillRes = await fetch(`${ALPACA_BASE}/v2/orders/${order.id}`, {
                headers: {
                  'APCA-API-KEY-ID': ALPACA_KEY,
                  'APCA-API-SECRET-KEY': ALPACA_SECRET,
                },
              })
              if (fillRes.ok) {
                const filled = await fillRes.json()
                // Log to DB
                await admin.from('agent_trades').insert({
                  agent_id: agent.id,
                  alpaca_order_id: order.id,
                  symbol,
                  side: 'sell',
                  qty: parseFloat(filled.filled_qty || '0'),
                  fill_price: parseFloat(filled.filled_avg_price || '0'),
                  filled_at: new Date().toISOString(),
                  pnl_cents: Math.round((parseFloat(filled.filled_avg_price || '0') - dbPositions[symbol]?.avg_price || 0) * parseFloat(filled.filled_qty || '0') * 100),
                  note: 'Reconciliation: closed stale DB position',
                })
                report.actions.push(`✓ Closed ${symbol} via reconciliation`)
              }
            } else {
              const err = await orderRes.text()
              report.actions.push(`✗ Failed to close ${symbol}: ${err.substring(0, 100)}`)
            }
          } catch (e) {
            report.actions.push(`✗ Error closing ${symbol}: ${e instanceof Error ? e.message : String(e)}`)
          }
        }
      }

      reconciliationReports.push(report)
    }

    // ── 3. Check Alpaca account balance ─────────────────────────────────
    let accountBalance = null
    try {
      const accRes = await fetch(`${ALPACA_BASE}/v2/account`, {
        headers: {
          'APCA-API-KEY-ID': ALPACA_KEY,
          'APCA-API-SECRET-KEY': ALPACA_SECRET,
        },
      })
      if (accRes.ok) {
        const acc = await accRes.json()
        accountBalance = {
          cash: acc.cash,
          equity: acc.equity,
          buying_power: acc.buying_power,
          status: acc.status,
        }
      }
    } catch (e) {
      results['account_check_error'] = e instanceof Error ? e.message : String(e)
    }

    results['account'] = accountBalance
    results['reports'] = reconciliationReports

    // ── 4. Trigger fresh agent run ───────────────────────────────
    let agentRun = null
    try {
      const runRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/cron/run-agents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': process.env.CRON_SECRET || '',
        },
      })
      if (runRes.ok) {
        agentRun = await runRes.json()
      } else {
        agentRun = { error: `HTTP ${runRes.status}` }
      }
    } catch (e) {
      agentRun = { error: e instanceof Error ? e.message : String(e) }
    }

    results['agent_run'] = agentRun

    return NextResponse.json({
      ok: true,
      reconciled_at: new Date().toISOString(),
      ...results,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}