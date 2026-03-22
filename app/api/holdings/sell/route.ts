import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOpenOrders } from '@/lib/alpaca'
import { sendSellConfirmation } from '@/lib/email'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { holding_id } = await req.json()
    if (!holding_id) return NextResponse.json({ error: 'Missing holding_id' }, { status: 400 })

    const admin = createAdminClient()

    // Fetch holding with agent info
    const { data: holding } = await admin
      .from('holdings')
      .select('*, agents(id, name, slug, alpaca_account)')
      .eq('id', holding_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!holding) {
      return NextResponse.json({ error: 'Holding not found or already closed' }, { status: 404 })
    }

    // Check if agent has open Alpaca orders (sell lock)
    if (holding.agents?.alpaca_account && process.env.ALPACA_KEY_ID) {
      try {
        const openOrders = await getOpenOrders(
          process.env.ALPACA_KEY_ID,
          process.env.ALPACA_SECRET_KEY
        )
        if (openOrders.length > 0) {
          return NextResponse.json({
            error: 'Agent currently has open trades. You can sell after positions settle.',
            open_orders: openOrders.length,
          }, { status: 409 })
        }
      } catch {
        // If Alpaca check fails, allow sell (don't block on infra issue)
      }
    }

    // Get current bid price
    const { data: latestStats } = await admin
      .from('agent_stats')
      .select('bid_cents')
      .eq('agent_id', holding.agent_id)
      .order('snapshot_at', { ascending: false })
      .limit(1)
      .single()

    const bidCents = latestStats?.bid_cents ?? holding.current_value_cents
    const currentValue = Math.round(holding.shares * bidCents)
    const returnAmount = currentValue - holding.invested_cents

    // Fetch current wallet
    const { data: wallet } = await admin
      .from('wallets')
      .select('balance_cents')
      .eq('user_id', user.id)
      .single()

    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 400 })

    // 1. Credit wallet
    await admin
      .from('wallets')
      .update({
        balance_cents: wallet.balance_cents + currentValue,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)

    // 2. Close holding
    await admin
      .from('holdings')
      .update({
        status: 'sold',
        sold_at: new Date().toISOString(),
      })
      .eq('id', holding_id)

    // 3. Record transaction
    await admin.from('transactions').insert({
      user_id: user.id,
      type: 'divest',
      amount_cents: currentValue,
      reference_id: holding_id,
      note: `Closed position in ${holding.agents?.name}`,
    })

    // 4. Send email
    const { data: authUser } = await admin.auth.admin.getUserById(user.id)
    if (authUser?.user?.email) {
      await sendSellConfirmation(
        authUser.user.email,
        holding.agents?.name || 'Unknown Agent',
        currentValue
      )
    }

    return NextResponse.json({
      ok: true,
      returned_cents: currentValue,
      pnl_cents: returnAmount,
    })
  } catch (err: unknown) {
    console.error('sell error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
