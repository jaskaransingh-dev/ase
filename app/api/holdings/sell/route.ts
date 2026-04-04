import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateQuoteFromNav } from '@/lib/market'
import { reduceHoldingPosition, syncAgentMarketState } from '@/lib/exchange'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { holding_id, shares_to_sell } = body
    if (!holding_id) return NextResponse.json({ error: 'Missing holding_id' }, { status: 400 })

    const admin = createAdminClient()

    // Fetch holding with agent info
    const { data: holding, error: holdingErr } = await admin
      .from('holdings')
      .select('*, agents(id, name, slug, share_price_cents, total_aum_cents)')
      .eq('id', holding_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (holdingErr || !holding) {
      return NextResponse.json({ error: 'Holding not found or already closed' }, { status: 404 })
    }

    const agentId = holding.agent_id
    const totalShares = Number(holding.shares)
    const sellShares = shares_to_sell ? Math.min(Number(shares_to_sell), totalShares) : totalShares
    // Get current NAV for pricing
    const { data: latestStats } = await admin
      .from('agent_stats')
      .select('nav_cents, bid_cents, ask_cents')
      .eq('agent_id', agentId)
      .order('snapshot_at', { ascending: false })
      .limit(1)
      .single()

    const navCents = latestStats?.nav_cents ?? holding.agents?.share_price_cents ?? 10_000

    const quote = latestStats?.ask_cents && latestStats?.bid_cents
      ? { askCents: Number(latestStats.ask_cents), bidCents: Number(latestStats.bid_cents) }
      : calculateQuoteFromNav({
          navCents,
          totalPoolCents: Math.round((navCents / 10_000) * 1_000_000),
        })
    const bidCents = quote.bidCents
    const sellValue = Math.round(sellShares * bidCents)

    const reduction = await reduceHoldingPosition(admin, {
      holdingId: holding_id,
      sharesToSell: sellShares,
    })
    const pnlCents = sellValue - reduction.costBasisCents

    // Fetch current wallet
    const { data: wallet } = await admin
      .from('wallets')
      .select('balance_cents')
      .eq('user_id', user.id)
      .single()

    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 400 })

    // 1. Credit wallet with sell proceeds
    await admin
      .from('wallets')
      .update({
        balance_cents: wallet.balance_cents + sellValue,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)

    // 2. Record transaction
    await admin.from('transactions').insert({
      user_id: user.id,
      type: 'divest',
      amount_cents: sellValue,
      reference_id: holding_id,
      note: `Sold ${sellShares.toFixed(4)} shares of ${holding.agents?.name}`,
    })

    // 3. Reprice from actual post-sale capital.
    const synced = await syncAgentMarketState(admin, {
      agentId,
      previousInvestorCapitalCents: Number(holding.agents?.total_aum_cents) || 0,
      previousNavCents: navCents,
      volumeShares: sellShares,
    })

    // 4. Send email (non-blocking)
    try {
      const { sendSellConfirmation } = await import('@/lib/email')
      const { data: authUser } = await admin.auth.admin.getUserById(user.id)
      if (authUser?.user?.email) {
        await sendSellConfirmation(
          authUser.user.email,
          holding.agents?.name || 'Unknown Agent',
          sellValue
        )
      }
    } catch {
      // Email failure shouldn't block the sell
    }

    return NextResponse.json({
      ok: true,
      shares_sold: parseFloat(sellShares.toFixed(6)),
      returned_cents: sellValue,
      pnl_cents: pnlCents,
      nav_cents: synced.navCents,
      bid_cents: synced.bidCents,
      ask_cents: synced.askCents,
      new_aum_cents: synced.investorCapitalCents,
      partial: reduction.partial,
    })
  } catch (err: unknown) {
    console.error('sell error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
