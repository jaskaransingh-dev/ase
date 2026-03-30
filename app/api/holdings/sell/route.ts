import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendSellConfirmation } from '@/lib/email'

export const dynamic = 'force-dynamic'

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
      .select('*, agents(id, name, slug, share_price_cents, total_aum_cents)')
      .eq('id', holding_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!holding) {
      return NextResponse.json({ error: 'Holding not found or already closed' }, { status: 404 })
    }

    // Get latest NAV (bid price = NAV * 0.9985 for 0.15% sell spread)
    const { data: latestStats } = await admin
      .from('agent_stats')
      .select('nav_cents')
      .eq('agent_id', holding.agent_id)
      .order('snapshot_at', { ascending: false })
      .limit(1)
      .single()

    const navCents = latestStats?.nav_cents ?? holding.agents?.share_price_cents ?? 10_000
    const bidCents = Math.round(navCents * 0.9985) // 0.15% spread
    const currentValue = Math.round(Number(holding.shares) * bidCents)
    const returnAmount = currentValue - holding.invested_cents

    // Fetch current wallet
    const { data: wallet } = await admin
      .from('wallets')
      .select('balance_cents')
      .eq('user_id', user.id)
      .single()

    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 400 })

    // 1. Credit wallet with current value
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

    // 4. Recalculate AUM from remaining active holdings
    const { data: remainingHoldings } = await admin
      .from('holdings')
      .select('invested_cents')
      .eq('agent_id', holding.agent_id)
      .eq('status', 'active')

    const newAum = (remainingHoldings ?? []).reduce((s, h) => s + Number(h.invested_cents), 0)

    // 5. Apply SELL price pressure to share price
    // Selling removes capital → agent trades smaller → mild downward pressure
    // Sell impact: -0.2% per 1% of AUM sold (capped at -1.5%)
    const currentAum = Math.max(1_000_000, Number(holding.agents?.total_aum_cents) || 1_000_000)
    const sellFraction = holding.invested_cents / currentAum
    const sellPressurePct = Math.min(1.5, sellFraction * 20)
    const newSharePrice = Math.round(navCents * (1 - sellPressurePct / 100))

    await admin.from('agents').update({
      total_aum_cents: Math.max(0, newAum),
      share_price_cents: newSharePrice,
    }).eq('id', holding.agent_id)

    // 6. Insert price tick for the sell event
    await admin.from('price_ticks').upsert({
      agent_id: holding.agent_id,
      tick_at: new Date().toISOString(),
      price_cents: newSharePrice,
      bid_cents: Math.round(newSharePrice * 0.9985),
      ask_cents: Math.round(newSharePrice * 1.0015),
      volume: Number(holding.shares),
    }, { onConflict: 'agent_id,tick_at' })

    // 7. Send email
    const { data: authUser } = await admin.auth.admin.getUserById(user.id)
    if (authUser?.user?.email) {
      try {
        await sendSellConfirmation(
          authUser.user.email,
          holding.agents?.name || 'Unknown Agent',
          currentValue
        )
      } catch {
        // Email failure shouldn't block the sell
      }
    }

    return NextResponse.json({
      ok: true,
      returned_cents: currentValue,
      pnl_cents: returnAmount,
      nav_cents: navCents,
      bid_cents: bidCents,
      new_aum_cents: newAum,
      sell_pressure_pct: sellPressurePct.toFixed(3),
    })
  } catch (err: unknown) {
    console.error('sell error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
