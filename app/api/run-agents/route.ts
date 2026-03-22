import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runMomentumAlpha, runMeanReversionPro, runTrendFollower } from '@/lib/agents'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST() {
  const admin = createAdminClient()
  const results: Record<string, unknown> = {}

  // Fetch all active agents
  const alpacaKey = process.env.ALPACA_KEY_ID || ''
  const alpacaSecret = process.env.ALPACA_SECRET_KEY || ''

  if (!alpacaKey) {
    return NextResponse.json({ skipped: true, reason: 'No Alpaca credentials configured' })
  }

  const { data: agents } = await admin
    .from('agents')
    .select('*')
    .eq('status', 'active')

  console.log(`Running ${agents?.length || 0} active agents...`)

  for (const agent of agents ?? []) {
    try {
      console.log(`Running agent: ${agent.slug} (${agent.strategy_type})`)
      let result

      if (agent.strategy_type === 'momentum') {
        result = await runMomentumAlpha(alpacaKey, alpacaSecret)
      } else if (agent.strategy_type === 'mean_reversion') {
        result = await runMeanReversionPro(alpacaKey, alpacaSecret)
      } else if (agent.strategy_type === 'trend_following') {
        result = await runTrendFollower(alpacaKey, alpacaSecret)
      }

      results[agent.slug] = result
      console.log(`Agent ${agent.slug} result:`, result)

      // Log orders to agent_trades with P&L calculation
      if (result && !('skipped' in result)) {
        const orders = extractOrders(result)
        console.log(`Processing ${orders.length} orders for ${agent.slug}`)
        
        for (const order of orders) {
          try {
            // Calculate P&L for sell orders
            let pnlCents = null
            if (order.side === 'sell') {
              // Find corresponding buy order for P&L calculation
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
                pnlCents = Math.round((sellPrice - buyPrice) * quantity * 100) // Convert to cents
                
                // Mark buy order as closed
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
              created_at: new Date().toISOString(),
            })
            
            console.log(`Recorded trade: ${order.side} ${order.qty} ${order.symbol} at $${order.filled_avg_price}`)
          } catch (insertError) { 
            console.error('Failed to insert trade:', insertError)
          }
        }
      }
    } catch (err) {
      console.error(`Error running agent ${agent.slug}:`, err)
      results[agent.slug] = { error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  return NextResponse.json({ ok: true, results, ran_at: new Date().toISOString() })
}

// Also allow GET for manual trigger
export async function GET() {
  return POST()
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
