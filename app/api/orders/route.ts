import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateQuoteFromNav } from '@/lib/market'
import { mergeHoldingPosition, reduceHoldingPosition, syncAgentMarketState } from '@/lib/exchange'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { 
      agent_id, 
      side, 
      order_type, 
      notional_cents, 
      shares, 
      limit_price_cents,
      stop_price_cents,
      recurring_interval,
      expires_at 
    } = await req.json()

    if (!agent_id || !side || !order_type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!notional_cents && !shares) {
      return NextResponse.json({ error: 'Must specify either amount or shares' }, { status: 400 })
    }

    if (order_type === 'limit' && !limit_price_cents) {
      return NextResponse.json({ error: 'Limit orders require a limit price' }, { status: 400 })
    }

    if (order_type === 'stop_loss' && !stop_price_cents) {
      return NextResponse.json({ error: 'Stop-loss orders require a stop price' }, { status: 400 })
    }

    if (order_type === 'recurring' && !recurring_interval) {
      return NextResponse.json({ error: 'Recurring orders require an interval' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Check agent is active
    const { data: agent } = await admin
      .from('agents')
      .select('id, name, status, total_aum_cents')
      .eq('id', agent_id)
      .single()

    if (!agent || agent.status !== 'active') {
      return NextResponse.json({ error: 'Agent not available' }, { status: 400 })
    }

    // For market orders, execute immediately
    if (order_type === 'market') {
      const { data: latestStats } = await admin
        .from('agent_stats')
        .select('nav_cents, bid_cents, ask_cents')
        .eq('agent_id', agent_id)
        .order('snapshot_at', { ascending: false })
        .limit(1)
        .single()

      const navCents = latestStats?.nav_cents ?? 10000
      const quote = latestStats?.ask_cents && latestStats?.bid_cents
        ? { bidCents: Number(latestStats.bid_cents), askCents: Number(latestStats.ask_cents) }
        : calculateQuoteFromNav({
            navCents,
            totalPoolCents: Math.round((navCents / 10_000) * 1_000_000),
          })
      const bidCents = quote.bidCents
      const askCents = quote.askCents
      
      const executionPrice = side === 'buy' ? askCents : bidCents
      const orderShares = shares ? Number(shares) : (notional_cents! / executionPrice)
      const totalCents = Math.round(orderShares * executionPrice)

      // Check wallet balance for buys
      if (side === 'buy') {
        const { data: wallet } = await admin
          .from('wallets')
          .select('balance_cents')
          .eq('user_id', user.id)
          .single()

        if (!wallet || wallet.balance_cents < totalCents) {
          return NextResponse.json({ error: 'Insufficient credits' }, { status: 400 })
        }

        // Deduct from wallet
        await admin
          .from('wallets')
          .update({ balance_cents: wallet.balance_cents - totalCents })
          .eq('user_id', user.id)
      }

      if (side === 'buy') {
        await mergeHoldingPosition(admin, {
          userId: user.id,
          agentId: agent_id,
          shares: orderShares,
          executionPriceCents: executionPrice,
          investedCents: totalCents,
        })
      } else {
        const { data: existingHolding } = await admin
          .from('holdings')
          .select('id, shares')
          .eq('user_id', user.id)
          .eq('agent_id', agent_id)
          .eq('status', 'active')
          .single()

        if (!existingHolding) {
          return NextResponse.json({ error: 'No holding available to sell' }, { status: 400 })
        }

        await reduceHoldingPosition(admin, {
          holdingId: existingHolding.id,
          sharesToSell: Math.min(orderShares, Number(existingHolding.shares) || 0),
        })

        const { data: wallet } = await admin
          .from('wallets')
          .select('balance_cents')
          .eq('user_id', user.id)
          .single()

        if (wallet) {
          await admin
            .from('wallets')
            .update({ balance_cents: wallet.balance_cents + totalCents })
            .eq('user_id', user.id)
        }
      }

      const synced = await syncAgentMarketState(admin, {
        agentId: agent_id,
        previousInvestorCapitalCents: Number(agent.total_aum_cents) || 0,
        previousNavCents: navCents,
        volumeShares: orderShares,
      })

      // Record order fill
      const { data: orderFill } = await admin
        .from('order_fills')
        .insert({
          user_id: user.id,
          agent_id,
          side,
          shares: orderShares,
          fill_price_cents: executionPrice,
          total_cents: totalCents,
          spread_earned_cents: side === 'buy' ? (askCents - navCents) * orderShares / 10000 : (navCents - bidCents) * orderShares / 10000,
        })
        .select()
        .single()

      // Record transaction
      await admin.from('transactions').insert({
        user_id: user.id,
        type: side === 'buy' ? 'invest' : 'divest',
        amount_cents: side === 'buy' ? -totalCents : totalCents,
        reference_id: orderFill.id,
        note: `${side === 'buy' ? 'Bought' : 'Sold'} ${agent.name} at market`,
      })

      return NextResponse.json({ 
        ok: true, 
        order_type: 'market',
        shares: orderShares,
        fill_price_cents: executionPrice,
        total_cents: totalCents,
        nav_cents: synced.navCents,
        bid_cents: synced.bidCents,
        ask_cents: synced.askCents,
      })
    }

    // For non-market orders, create limit order
    const nextExecuteAt = recurring_interval 
      ? new Date(Date.now() + (recurring_interval === 'weekly' ? 7 : 30) * 24 * 60 * 60 * 1000)
      : null

    const { data: limitOrder } = await admin
      .from('limit_orders')
      .insert({
        user_id: user.id,
        agent_id,
        side,
        order_type,
        notional_cents,
        shares,
        limit_price_cents,
        stop_price_cents,
        recurring_interval,
        next_execute_at: nextExecuteAt,
        expires_at,
      })
      .select()
      .single()

    return NextResponse.json({ 
      ok: true, 
      order_type: 'limit',
      order_id: limitOrder.id 
    })

  } catch (err: unknown) {
    console.error('order error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const agentId = searchParams.get('agent_id')
    const status = searchParams.get('status') || 'open'

    let query = supabase
      .from('limit_orders')
      .select(`
        *,
        agents(id, name, slug, ticker),
        agent_stats(nav_cents, bid_cents, ask_cents)
      `)
      .eq('user_id', user.id)
      .eq('status', status)

    if (agentId) {
      query = query.eq('agent_id', agentId)
    }

    const { data: orders } = await query.order('created_at', { ascending: false })

    return NextResponse.json({ orders })

  } catch (err: unknown) {
    console.error('get orders error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
