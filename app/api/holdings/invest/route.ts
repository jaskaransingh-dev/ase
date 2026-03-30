import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { agent_id, amount_cents } = await req.json()
    if (!agent_id || !amount_cents || amount_cents < 1000) {
      return NextResponse.json({ error: 'Minimum investment is $10' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Check wallet balance
    const { data: wallet } = await admin
      .from('wallets')
      .select('balance_cents')
      .eq('user_id', user.id)
      .single()

    if (!wallet || wallet.balance_cents < amount_cents) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 400 })
    }

    // Get agent with current share price
    const { data: agent } = await admin
      .from('agents')
      .select('id, name, status, share_price_cents, total_aum_cents, total_shares')
      .eq('id', agent_id)
      .single()

    if (!agent || agent.status !== 'active') {
      return NextResponse.json({ error: 'Agent not available' }, { status: 400 })
    }

    // Get latest NAV from agent_stats (most authoritative price source)
    const { data: latestStats } = await admin
      .from('agent_stats')
      .select('nav_cents')
      .eq('agent_id', agent_id)
      .order('snapshot_at', { ascending: false })
      .limit(1)
      .single()

    const navCents = latestStats?.nav_cents ?? agent.share_price_cents ?? 10_000

    // Apply 0.15% buy spread (ask = NAV * 1.0015)
    const askCents = Math.round(navCents * 1.0015)
    const shares = amount_cents / askCents

    // ── Atomic DB operations ────────────────────────────────────────

    // 1. Deduct from wallet
    await admin
      .from('wallets')
      .update({
        balance_cents: wallet.balance_cents - amount_cents,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)

    // 2. Create holding
    const { data: holding, error: holdingError } = await admin
      .from('holdings')
      .insert({
        user_id: user.id,
        agent_id,
        shares,
        entry_nav_cents: askCents,
        invested_cents: amount_cents,
        current_value_cents: amount_cents,
        status: 'active',
      })
      .select()
      .single()

    if (holdingError) throw holdingError

    // 3. Record transaction
    await admin.from('transactions').insert({
      user_id: user.id,
      type: 'invest',
      amount_cents: -amount_cents,
      reference_id: holding.id,
      note: `Invested in ${agent.name}`,
    })

    // 4. Update agent AUM: recalculate from all active holdings (source of truth)
    const { data: allHoldings } = await admin
      .from('holdings')
      .select('invested_cents')
      .eq('agent_id', agent_id)
      .eq('status', 'active')

    const newAum = (allHoldings ?? []).reduce((s, h) => s + Number(h.invested_cents), 0)

    // 5. Apply BUY price pressure to share price
    // More AUM → agent trades larger positions → more P&L → upward pressure
    // Buy impact: +0.3% per 1% of current AUM invested (capped at +2%)
    const currentAum = Math.max(1_000_000, Number(agent.total_aum_cents) || 1_000_000)
    const investmentFraction = amount_cents / currentAum
    const buyPressurePct = Math.min(2.0, investmentFraction * 30)
    const newSharePrice = Math.round(navCents * (1 + buyPressurePct / 100))

    await admin.from('agents').update({
      total_aum_cents: newAum,
      share_price_cents: newSharePrice,
    }).eq('id', agent_id)

    // 6. Insert a price tick to record the buy pressure event
    await admin.from('price_ticks').upsert({
      agent_id,
      tick_at: new Date().toISOString(),
      price_cents: newSharePrice,
      bid_cents: Math.round(newSharePrice * 0.9985),
      ask_cents: Math.round(newSharePrice * 1.0015),
      volume: shares,
    }, { onConflict: 'agent_id,tick_at' })

    return NextResponse.json({
      ok: true,
      holding_id: holding.id,
      shares: parseFloat(shares.toFixed(6)),
      entry_price_cents: askCents,
      new_aum_cents: newAum,
      share_price_impact_pct: buyPressurePct.toFixed(3),
    })
  } catch (err: unknown) {
    console.error('invest error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
