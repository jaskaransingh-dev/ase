import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runBtcMomentum, runEthMeanRevert, runCryptoTrend, runSolBreakout, runDefiBasket } from '@/lib/agents'

export const dynamic = 'force-dynamic'

export const runtime = 'nodejs'
export const maxDuration = 60

const STRATEGY_RUNNERS: Record<string, (key: string, secret: string, capitalAllocation?: number) => Promise<unknown>> = {
  crypto_momentum_btc: runBtcMomentum,
  crypto_mean_reversion_eth: runEthMeanRevert,
  crypto_momentum_multi: runCryptoTrend,
  crypto_momentum_sol: runSolBreakout,
  crypto_momentum_defi: runDefiBasket,
}

// Map agent slugs to their runner
const SLUG_TO_RUNNER: Record<string, string> = {
  'btc-momentum': 'crypto_momentum_btc',
  'eth-mean-revert': 'crypto_mean_reversion_eth',
  'crypto-trend': 'crypto_momentum_multi',
  'sol-breakout': 'crypto_momentum_sol',
  'defi-basket': 'crypto_momentum_defi',
}

export async function POST(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('x-cron-secret')
  if (authHeader !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const results: Record<string, unknown> = {}

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
      const runnerKey = SLUG_TO_RUNNER[agent.slug]
      const runner = runnerKey ? STRATEGY_RUNNERS[runnerKey] : null

      if (!runner) {
        results[agent.slug] = { skipped: true, reason: 'No runner configured' }
        continue
      }

      // Calculate capital allocation: max($10K, agent AUM)
      const baseAllocation = 1000000 // $10K in cents
      const agentAum = agent.total_aum_cents ?? 0
      const capitalAllocation = Math.max(baseAllocation, agentAum)

      const result = await runner(alpacaKey, alpacaSecret, capitalAllocation)
      results[agent.slug] = result

      // Log orders to agent_trades
      if (result && typeof result === 'object' && !('skipped' in (result as Record<string, unknown>))) {
        const orders = extractOrders(result)
        for (const order of orders) {
          try {
            let pnlCents = null
            if (order.side === 'sell') {
              const { data: buyOrders } = await admin
                .from('agent_trades')
                .select('fill_price, qty')
                .eq('agent_id', agent.id)
                .eq('symbol', order.symbol)
                .eq('side', 'buy')
                .is('pnl_cents', null)
                .order('filled_at', { ascending: true })
                .limit(1)

              if (buyOrders && buyOrders.length > 0) {
                const buyOrder = buyOrders[0]
                const buyPrice = parseFloat(buyOrder.fill_price || '0')
                const sellPrice = parseFloat(order.filled_avg_price || '0')
                const quantity = Math.min(parseFloat(order.qty || '0'), parseFloat(buyOrder.qty || '0'))
                pnlCents = Math.round((sellPrice - buyPrice) * quantity * 100)

                await admin
                  .from('agent_trades')
                  .update({ pnl_cents: 0 })
                  .eq('agent_id', agent.id)
                  .eq('symbol', order.symbol)
                  .eq('side', 'buy')
                  .eq('fill_price', buyPrice)
                  .is('pnl_cents', null)
              }
            }

            await admin.from('agent_trades').insert({
              agent_id: agent.id,
              alpaca_order_id: order.id,
              symbol: order.symbol,
              side: order.side,
              qty: parseFloat(order.qty || '0'),
              fill_price: parseFloat(order.filled_avg_price || '0'),
              filled_at: order.filled_at || new Date().toISOString(),
              pnl_cents: pnlCents,
            })
          } catch (insertError) {
            console.error('Failed to insert trade:', insertError)
          }
        }
      }
    } catch (err) {
      results[agent.slug] = { error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  return NextResponse.json({ ok: true, results, ran_at: new Date().toISOString() })
}

export async function GET(req: NextRequest) {
  return POST(req)
}

function extractOrders(result: unknown): Array<{ id: string; symbol: string; side: string; qty: string; filled_avg_price: string; filled_at: string }> {
  const orders: Array<{ id: string; symbol: string; side: string; qty: string; filled_avg_price: string; filled_at: string }> = []
  if (!result || typeof result !== 'object') return orders

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
