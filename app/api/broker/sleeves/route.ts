/**
 * POST /api/broker/sleeves
 * 
 * Allocate funds to an agent (create/update sleeve)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * POST - Allocate to an agent
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { agent_id, amount_cents } = body

    if (!agent_id) {
      return NextResponse.json({ error: 'agent_id is required' }, { status: 400 })
    }

    if (!amount_cents || amount_cents < 1000) {  // Minimum $10
      return NextResponse.json({ error: 'Minimum allocation is $10' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Check broker account is active
    const { data: brokerAccount } = await admin
      .from('broker_accounts')
      .select('alpaca_account_id, status')
      .eq('user_id', user.id)
      .single()

    if (!brokerAccount || brokerAccount.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'No active brokerage account' }, { status: 400 })
    }

    // Check agent exists
    const { data: agent } = await admin
      .from('agents')
      .select('id, name, status')
      .eq('id', agent_id)
      .single()

    if (!agent || agent.status !== 'active') {
      return NextResponse.json({ error: 'Agent not available' }, { status: 400 })
    }

    // Calculate target weight based on current allocations
    const { data: existing } = await admin
      .from('agent_sleeves')
      .select('allocated_cents')
      .eq('user_id', user.id)
      .eq('status', 'active')

    const currentTotal = existing?.reduce((sum, s) => sum + (s.allocated_cents || 0), 0) || 0
    const newTotal = currentTotal + amount_cents
    
    // Upsert sleeve
    const { error: sleeveError } = await admin
      .from('agent_sleeves')
      .upsert({
        user_id: user.id,
        agent_id,
        allocated_cents: amount_cents,
        target_weight_pct: 0,
        status: 'active',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,agent_id' })

    if (sleeveError) {
      console.error('[Broker Sleeve] Error:', sleeveError)
      return NextResponse.json({ error: sleeveError.message }, { status: 500 })
    }

    // Create ledger entry
    await admin.from('ledger_entries').insert({
      user_id: user.id,
      type: 'allocation',
      amount_cents: amount_cents,
      reference_type: 'sleeve',
      reference_id: agent_id,
      running_balance_cents: newTotal,
      note: `Allocated to ${agent.name}`,
    })

    console.log('[Broker Sleeve] Allocated:', amount_cents, 'to agent:', agent_id)

    return NextResponse.json({
      agent_id,
      amount_cents,
      total_allocated_cents: newTotal,
      message: `Allocated $${(amount_cents/100).toFixed(2)} to ${agent.name}`,
    })
  } catch (err: unknown) {
    console.error('[Broker Sleeve] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Allocation failed' },
      { status: 500 }
    )
  }
}

/**
 * GET - List sleeves and allocation summary
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()

    // Get sleeves with agent info
    const { data: sleeves } = await admin
      .from('agent_sleeves')
      .select('*, agents(name, slug, primary_symbol)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('allocated_cents', { ascending: false })

    const totalAllocated = sleeves?.reduce((sum, s) => sum + (s.allocated_cents || 0), 0) || 0

    // Get broker account
    const { data: brokerAccount } = await admin
      .from('broker_accounts')
      .select('alpaca_account_id, status')
      .eq('user_id', user.id)
      .single()

    // Get balances
    let balances = null
    if (brokerAccount?.status === 'ACTIVE') {
      try {
        const { createBrokerAPI } = await import('@/lib/broker')
        const broker = createBrokerAPI()
        balances = await broker.getBalances(brokerAccount.alpaca_account_id)
      } catch (e) {
        console.log('[Broker] Could not get balances')
      }
    }

    return NextResponse.json({
      sleeves: sleeves || [],
      total_allocated_cents: totalAllocated,
      cash_available_cents: balances ? Math.round(parseFloat(balances.cash) * 100) : 0,
      cash_to_allocate_cents: balances ? Math.round(parseFloat(balances.cash) * 100) - totalAllocated : 0,
    })
  } catch (err: unknown) {
    console.error('[Broker Sleeve] GET Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to get allocations' },
      { status: 500 }
    )
  }
}

/**
 * DELETE - Remove allocation
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const agent_id = searchParams.get('agent_id')

    if (!agent_id) {
      return NextResponse.json({ error: 'agent_id is required' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Mark sleeve as exited (soft delete)
    await admin
      .from('agent_sleeves')
      .update({ status: 'exited', updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('agent_id', agent_id)

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('[Broker Sleeve] DELETE Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to remove allocation' },
      { status: 500 }
    )
  }
}