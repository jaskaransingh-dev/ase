import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runBtcMomentum, runEthMeanRevert, runCryptoTrend, runSolBreakout, runDefiBasket } from '@/lib/agents'
import { getOpenOrders, getOrderHistory } from '@/lib/alpaca'

export const dynamic = 'force-dynamic'

export const runtime = 'nodejs'
export const maxDuration = 120

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

  // Get all active agents
  const { data: agents } = await admin
    .from('agents')
    .select('*')
    .eq('status', 'active')

  // Get filled orders before running strategies (to detect new fills)
  const existingOrderIds = new Set<string>()
  try {
    const { data: existingTrades } = await admin
      .from('agent_trades')
      .select('alpaca_order_id')
    if (existingTrades) {
      existingTrades.forEach(t => {
        if (t.alpaca_order_id) existingOrderIds.add(t.alpaca_order_id)
      })
    }
  } catch (e) {
    console.error('Failed to fetch existing trades:', e)
  }

  for (const agent of agents ?? []) {
    try {
      const runnerKey = SLUG_TO_RUNNER[agent.slug]
      const runner = runnerKey ? STRATEGY_RUNNERS[runnerKey] : null

      if (!runner) {
        results[agent.slug] = { skipped: true, reason: 'No runner configured' }
        continue
      }

      // Calculate capital allocation based on agent AUM
      // Base allocation: $10K (1,000,000 cents)
      // Scale up if agent has more AUM
      const baseAllocationCents = 1000000 // $10,000
      const agentAumCents = agent.total_aum_cents ?? 0
      const capitalAllocation = Math.max(baseAllocationCents, agentAumCents)

      // Run the strategy - it will execute trades via Alpaca
      const strategyResult = await runner(alpacaKey, alpacaSecret, capitalAllocation)
      results[agent.slug] = strategyResult

      // After running strategy, fetch recently filled orders and log them
      try {
        const orderHistory = await getOrderHistory(alpacaKey, alpacaSecret, 'all')

        // Filter for new orders filled since last check
        const newFills = (orderHistory || []).filter((order: any) => {
          return (
            order.status === 'filled' &&
            !existingOrderIds.has(order.id) &&
            order.filled_at &&
            // Only process orders from last few minutes
            new Date(order.filled_at).getTime() > Date.now() - 5 * 60 * 1000
          )
        })

        // Log each filled order
        for (const order of newFills) {
          try {
            const fillPrice = parseFloat(order.filled_avg_price || '0')
            const qty = parseFloat(order.qty || '0')
            const side = order.side?.toLowerCase() || 'buy'
            const symbol = order.symbol || ''

            // Calculate P&L if this is a sell order
            let pnlCents = null
            if (side === 'sell') {
              // Find matching buy order
              const { data: buyOrders } = await admin
                .from('agent_trades')
                .select('fill_price, qty')
                .eq('agent_id', agent.id)
                .eq('symbol', symbol)
                .eq('side', 'buy')
                .is('pnl_cents', null)
                .order('filled_at', { ascending: true })
                .limit(1)

              if (buyOrders && buyOrders.length > 0) {
                const buyOrder = buyOrders[0]
                const buyPrice = parseFloat(buyOrder.fill_price || '0')
                const matchQty = Math.min(qty, parseFloat(buyOrder.qty || '0'))

                // P&L = (sell_price - buy_price) * quantity * 100 (convert to cents)
                pnlCents = Math.round((fillPrice - buyPrice) * matchQty * 100)

                // Mark buy order with realized P&L
                await admin
                  .from('agent_trades')
                  .update({ pnl_cents: pnlCents })
                  .eq('agent_id', agent.id)
                  .eq('symbol', symbol)
                  .eq('side', 'buy')
                  .eq('fill_price', buyPrice.toString())
                  .is('pnl_cents', null)
              }
            }

            // Insert trade record
            await admin.from('agent_trades').insert({
              agent_id: agent.id,
              alpaca_order_id: order.id,
              symbol: symbol,
              side: side,
              qty: qty,
              fill_price: fillPrice,
              filled_at: order.filled_at || new Date().toISOString(),
              pnl_cents: pnlCents,
            })

            existingOrderIds.add(order.id)
            console.log(`Logged trade: ${agent.slug} ${side} ${qty} ${symbol} @ ${fillPrice}`)
          } catch (insertError) {
            console.error(`Failed to log trade for ${agent.slug}:`, insertError)
          }
        }
      } catch (orderError) {
        console.error(`Failed to fetch order history for ${agent.slug}:`, orderError)
      }
    } catch (err) {
      results[agent.slug] = { error: err instanceof Error ? err.message : 'Unknown error' }
      console.error(`Agent execution error for ${agent.slug}:`, err)
    }
  }

  return NextResponse.json({
    ok: true,
    results,
    ran_at: new Date().toISOString(),
    agents_run: (agents ?? []).length
  })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
