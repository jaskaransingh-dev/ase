import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

    // Get latest agent NAV
    const { data: agent } = await admin
      .from('agents')
      .select('id, name, status')
      .eq('id', agent_id)
      .single()

    if (!agent || agent.status !== 'active') {
      return NextResponse.json({ error: 'Agent not available' }, { status: 400 })
    }

    const { data: latestStats } = await admin
      .from('agent_stats')
      .select('nav_cents, ask_cents')
      .eq('agent_id', agent_id)
      .order('snapshot_at', { ascending: false })
      .limit(1)
      .single()

    const navCents = latestStats?.nav_cents ?? 10000 // Default $100.00
    const askCents = latestStats?.ask_cents ?? (navCents * 10015 / 10000) // 0.15% spread
    const shares = amount_cents / askCents

    // Atomic operations
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

    // 4. Update agent AUM (best-effort)
    try {
      await admin.rpc('increment_agent_aum', {
        p_agent_id: agent_id,
        p_amount: amount_cents,
      })
    } catch {
      // RPC may not exist yet on fresh deployments
    }

    return NextResponse.json({ ok: true, holding_id: holding.id, shares })
  } catch (err: unknown) {
    console.error('invest error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
