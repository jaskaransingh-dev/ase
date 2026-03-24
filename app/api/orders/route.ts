import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
      .select('id, name, status')
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
      const bidCents = latestStats?.bid_cents ?? (navCents * 9985 / 10000)
      const askCents = latestStats?.ask_cents ?? (navCents * 10015 / 10000)
      
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

      // Create or update holding
      if (side === 'buy') {
        await admin
          .from('holdings')
          .upsert({
            user_id: user.id,
            agent_id,
            shares: orderShares,
            entry_nav_cents: executionPrice,
            invested_cents: totalCents,
            current_value_cents: totalCents,
            status: 'active',
          }, {
            onConflict: 'user_id,agent_id',
            ignoreDuplicates: false
          })
      } else {
        // For sells, close existing holdings
        const { data: existingHolding } = await admin
          .from('holdings')
          .select('*')
          .eq('user_id', user.id)
          .eq('agent_id', agent_id)
          .eq('status', 'active')
          .single()

        if (existingHolding) {
          await admin
            .from('holdings')
            .update({
              status: 'sold',
              sold_at: new Date().toISOString(),
            })
            .eq('id', existingHolding.id)

          // Credit wallet for sells
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
      }

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
        total_cents: totalCents 
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
