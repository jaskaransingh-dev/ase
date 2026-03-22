import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runMomentumAlpha, runMeanReversionPro, runTrendFollower } from '@/lib/agents'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('x-cron-secret')
  if (authHeader !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const results: Record<string, unknown> = {}

  // Fetch all active agents with their Alpaca keys
  // In production, each agent has its own Alpaca paper account
  // For MVP, we use the same account with the env vars
  const alpacaKey = process.env.ALPACA_KEY_ID || ''
  const alpacaSecret = process.env.ALPACA_SECRET_KEY || ''

  if (!alpacaKey) {
    return NextResponse.json({ skipped: true, reason: 'No Alpaca credentials configured' })
  }

  const { data: agents } = await admin
    .from('agents')
    .select('*')
    .eq('status', 'active')

  for (const agent of agents ?? []) {
    try {
      let result

      if (agent.strategy_type === 'momentum') {
        result = await runMomentumAlpha(alpacaKey, alpacaSecret)
      } else if (agent.strategy_type === 'mean_reversion') {
        result = await runMeanReversionPro(alpacaKey, alpacaSecret)
      } else if (agent.strategy_type === 'trend_following') {
        result = await runTrendFollower(alpacaKey, alpacaSecret)
      }

      results[agent.slug] = result

      // Log orders to agent_trades
      if (result && !('skipped' in result)) {
        const orders = extractOrders(result)
        for (const order of orders) {
          try {
            await admin.from('agent_trades').insert({
              agent_id: agent.id,
              alpaca_order_id: order.id,
              symbol: order.symbol,
              side: order.side,
              qty: parseFloat(order.qty || '0'),
              fill_price: parseFloat(order.filled_avg_price || '0'),
              filled_at: order.filled_at || new Date().toISOString(),
              pnl_cents: null,
            })
          } catch { /* ignore duplicate inserts */ }
        }
      }
    } catch (err) {
      results[agent.slug] = { error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  return NextResponse.json({ ok: true, results, ran_at: new Date().toISOString() })
}

// Also allow GET for manual trigger in dev
export async function GET(req: NextRequest) {
  return POST(req)
}

function extractOrders(result: unknown): Array<{ id: string; symbol: string; side: string; qty: string; filled_avg_price: string; filled_at: string }> {
  const orders: Array<{ id: string; symbol: string; side: string; qty: string; filled_avg_price: string; filled_at: string }> = []
  if (!result || typeof result !== 'object') return orders

  // Handle different result shapes from different agents
  const r = result as Record<string, unknown>

  if (Array.isArray(r.orders)) orders.push(...r.orders)
  if (Array.isArray(r.entries)) {
    for (const e of r.entries as Array<{ order: unknown }>) {
      if (e.order) orders.push(e.order as typeof orders[0])
    }
  }
  if (Array.isArray(r.results)) {
    for (const e of r.results as Array<{ order: unknown }>) {
      if (e.order) orders.push(e.order as typeof orders[0])
    }
  }
  return orders
}
