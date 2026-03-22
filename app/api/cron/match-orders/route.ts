import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface LimitOrder {
  id: string
  user_id: string
  agent_id: string
  side: 'buy' | 'sell'
  order_type: 'market' | 'limit' | 'stop_loss' | 'recurring'
  notional_cents?: number
  shares?: number
  limit_price_cents?: number
  stop_price_cents?: number
  recurring_interval?: 'weekly' | 'monthly'
  next_execute_at?: string
  expires_at?: string
  status: 'open' | 'filled' | 'cancelled' | 'expired' | 'failed'
}

interface Agent {
  id: string
  slug: string
  name: string
}


export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('x-cron-secret')
  if (authHeader !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const results: Record<string, unknown> = {}

  try {
    // Get all active agents with current pricing
    const { data: agents } = await admin
      .from('agents')
      .select('id, slug, name')
      .eq('status', 'active')

    for (const agent of agents ?? []) {
      try {
        // Get current bid/ask
        const { data: latestStats } = await admin
          .from('agent_stats')
          .select('nav_cents, bid_cents, ask_cents')
          .eq('agent_id', agent.id)
          .order('snapshot_at', { ascending: false })
          .limit(1)
          .single()

        if (!latestStats) continue

        const { bid_cents, ask_cents } = latestStats

        // Get open limit orders for this agent
        const { data: openOrders } = await admin
          .from('limit_orders')
          .select('*')
          .eq('agent_id', agent.id)
          .eq('status', 'open')
          .order('created_at', { ascending: true }) // FIFO

        // Process stop-loss orders first (market orders triggered by price)
        const stopOrders = openOrders?.filter(o => o.order_type === 'stop_loss') || []
        for (const order of stopOrders) {
          if (order.side === 'sell' && bid_cents <= order.stop_price_cents!) {
            await executeStopLoss(admin, order, bid_cents, agent)
          }
        }

        // Process limit orders
        const limitOrders = openOrders?.filter(o => o.order_type === 'limit') || []
        for (const order of limitOrders) {
          const shouldFill = order.side === 'buy' 
            ? ask_cents <= order.limit_price_cents!    // Buy if ask is at or below limit
            : bid_cents >= order.limit_price_cents!    // Sell if bid is at or above limit

          if (shouldFill) {
            await executeLimitOrder(admin, order, order.side === 'buy' ? ask_cents : bid_cents, agent)
          }
        }

        // Process recurring orders
        const recurringOrders = openOrders?.filter(o => 
          o.order_type === 'recurring' && 
          o.next_execute_at && 
          new Date(o.next_execute_at) <= new Date()
        ) || []

        for (const order of recurringOrders) {
          await executeRecurringOrder(admin, order, ask_cents, agent)
        }

        // Check for expired orders
        const now = new Date()
        const expiredOrders = openOrders?.filter(o => 
          o.expires_at && new Date(o.expires_at) <= now
        ) || []

        for (const order of expiredOrders) {
          await admin
            .from('limit_orders')
            .update({ status: 'expired' })
            .eq('id', order.id)
        }

        results[agent.slug] = {
          processed: (stopOrders?.length || 0) + (limitOrders?.length || 0) + (recurringOrders?.length || 0),
          expired: expiredOrders?.length || 0,
        }

      } catch (err) {
        results[agent.slug] = { error: err instanceof Error ? err.message : 'Unknown error' }
      }
    }

    return NextResponse.json({ ok: true, results, processed_at: new Date().toISOString() })

  } catch (err) {
    console.error('match-orders error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}

async function executeStopLoss(admin: ReturnType<typeof createAdminClient>, order: LimitOrder, currentBid: number, agent: Agent) {
  const shares = order.shares || (order.notional_cents! / currentBid)
  const totalCents = Math.round(shares * currentBid)

  // Get user wallet
  const { data: wallet } = await admin
    .from('wallets')
    .select('balance_cents')
    .eq('user_id', order.user_id)
    .single()

  if (!wallet) return

  // Credit wallet for stop-loss sell
  await admin
    .from('wallets')
    .update({ balance_cents: wallet.balance_cents + totalCents })
    .eq('user_id', order.user_id)

  // Close holding
  await admin
    .from('holdings')
    .update({ 
      status: 'sold', 
      sold_at: new Date().toISOString() 
    })
    .eq('user_id', order.user_id)
    .eq('agent_id', agent.id)
    .eq('status', 'active')

  // Record fill
  await admin.from('order_fills').insert({
    limit_order_id: order.id,
    user_id: order.user_id,
    agent_id: agent.id,
    side: 'sell',
    shares,
    fill_price_cents: currentBid,
    total_cents: totalCents,
    spread_earned_cents: 0, // Stop-loss gets market rate
  })

  // Update order status
  await admin
    .from('limit_orders')
    .update({ 
      status: 'filled',
      filled_price_cents: currentBid,
      filled_shares: shares,
      filled_at: new Date().toISOString()
    })
    .eq('id', order.id)

  // Record transaction
  await admin.from('transactions').insert({
    user_id: order.user_id,
    type: 'divest',
    amount_cents: totalCents,
    reference_id: order.id,
    note: `Stop-loss triggered for ${agent.name} at $${(currentBid / 100).toFixed(2)}`,
  })
}

async function executeLimitOrder(admin: ReturnType<typeof createAdminClient>, order: LimitOrder, executionPrice: number, agent: Agent) {
  const shares = order.shares || (order.notional_cents! / executionPrice)
  const totalCents = Math.round(shares * executionPrice)

  // Get user wallet
  const { data: wallet } = await admin
    .from('wallets')
    .select('balance_cents')
    .eq('user_id', order.user_id)
    .single()

  if (!wallet) return

  if (order.side === 'buy') {
    // Check balance
    if (wallet.balance_cents < totalCents) return

    // Deduct from wallet
    await admin
      .from('wallets')
      .update({ balance_cents: wallet.balance_cents - totalCents })
      .eq('user_id', order.user_id)

    // Create or update holding
    await admin
      .from('holdings')
      .upsert({
        user_id: order.user_id,
        agent_id: agent.id,
        shares: shares,
        entry_nav_cents: executionPrice,
        invested_cents: totalCents,
        current_value_cents: totalCents,
        status: 'active',
      }, {
        onConflict: 'user_id,agent_id',
        ignoreDuplicates: false
      })
  } else {
    // Credit wallet for sell
    await admin
      .from('wallets')
      .update({ balance_cents: wallet.balance_cents + totalCents })
      .eq('user_id', order.user_id)

    // Close holding
    await admin
      .from('holdings')
      .update({ 
        status: 'sold', 
        sold_at: new Date().toISOString() 
      })
      .eq('user_id', order.user_id)
      .eq('agent_id', agent.id)
      .eq('status', 'active')
  }

  // Calculate spread earned
  const { data: latestStats } = await admin
    .from('agent_stats')
    .select('nav_cents')
    .eq('agent_id', agent.id)
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .single()

  const navCents = latestStats?.nav_cents ?? 10000
  const spreadEarned = order.side === 'buy' 
    ? (executionPrice - navCents) * shares / 10000
    : (navCents - executionPrice) * shares / 10000

  // Record fill
  await admin.from('order_fills').insert({
    limit_order_id: order.id,
    user_id: order.user_id,
    agent_id: agent.id,
    side: order.side,
    shares,
    fill_price_cents: executionPrice,
    total_cents: totalCents,
    spread_earned_cents: Math.round(spreadEarned),
  })

  // Update order status
  await admin
    .from('limit_orders')
    .update({ 
      status: 'filled',
      filled_price_cents: executionPrice,
      filled_shares: shares,
      filled_at: new Date().toISOString()
    })
    .eq('id', order.id)

  // Record transaction
  await admin.from('transactions').insert({
    user_id: order.user_id,
    type: order.side === 'buy' ? 'invest' : 'divest',
    amount_cents: order.side === 'buy' ? -totalCents : totalCents,
    reference_id: order.id,
    note: `Limit order filled for ${agent.name} at $${(executionPrice / 100).toFixed(2)}`,
  })
}

async function executeRecurringOrder(admin: ReturnType<typeof createAdminClient>, order: LimitOrder, askPrice: number, agent: Agent) {
  const shares = order.shares || (order.notional_cents! / askPrice)
  const totalCents = Math.round(shares * askPrice)

  // Get user wallet
  const { data: wallet } = await admin
    .from('wallets')
    .select('balance_cents')
    .eq('user_id', order.user_id)
    .single()

  if (!wallet || wallet.balance_cents < totalCents) return

  // Execute as market buy
  await admin
    .from('wallets')
    .update({ balance_cents: wallet.balance_cents - totalCents })
    .eq('user_id', order.user_id)

  // Create or update holding
  await admin
    .from('holdings')
    .upsert({
      user_id: order.user_id,
      agent_id: agent.id,
      shares: shares,
      entry_nav_cents: askPrice,
      invested_cents: totalCents,
      current_value_cents: totalCents,
      status: 'active',
    }, {
      onConflict: 'user_id,agent_id',
      ignoreDuplicates: false
    })

  // Record fill
  await admin.from('order_fills').insert({
    limit_order_id: order.id,
    user_id: order.user_id,
    agent_id: agent.id,
    side: 'buy',
    shares,
    fill_price_cents: askPrice,
    total_cents: totalCents,
    spread_earned_cents: (askPrice - (askPrice * 9985 / 10000)) * shares / 10000,
  })

  // Schedule next execution
  const nextExecuteAt = new Date(Date.now() + 
    (order.recurring_interval === 'weekly' ? 7 : 30) * 24 * 60 * 60 * 1000)

  // Update order with next execution
  await admin
    .from('limit_orders')
    .update({ 
      next_execute_at: nextExecuteAt.toISOString(),
      filled_price_cents: askPrice,
      filled_shares: shares,
      filled_at: new Date().toISOString()
    })
    .eq('id', order.id)

  // Record transaction
  await admin.from('transactions').insert({
    user_id: order.user_id,
    type: 'invest',
    amount_cents: -totalCents,
    reference_id: order.id,
    note: `Recurring buy for ${agent.name}: $${(totalCents / 100).toFixed(2)}`,
  })
}
