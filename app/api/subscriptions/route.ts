/**
 * /api/subscriptions
 *
 * GET  — list current user's active subscriptions
 * POST — subscribe to an agent  { agent_id, wallet_address }
 * DELETE — cancel subscription  { agent_id }
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*, agents(id, name, slug, ticker, description, strategy_type, status, signal_summary, monthly_fee_cents, subscriber_count, primary_symbol)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ subscriptions: data ?? [] })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { agent_id?: string; wallet_address?: string }
  const { agent_id, wallet_address } = body

  if (!agent_id) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

  // Verify agent exists and is active
  const { data: agent } = await supabase
    .from('agents').select('id, status').eq('id', agent_id).single()

  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  if (agent.status !== 'active') return NextResponse.json({ error: 'Agent not accepting subscriptions' }, { status: 422 })

  const { data, error } = await supabase
    .from('subscriptions')
    .upsert({
      user_id: user.id,
      agent_id,
      wallet_address: wallet_address ?? null,
      status: 'active',
      plan: 'beta',
    }, { onConflict: 'user_id,agent_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Ensure wallet + profile exist (use admin to bypass RLS on writes)
  const admin = createAdminClient()
  await Promise.all([
    admin.from('profiles').upsert({ id: user.id, display_name: user.email!.split('@')[0] }, { onConflict: 'id' }),
    admin.from('wallets').upsert({ user_id: user.id, balance_cents: 10000 }, { onConflict: 'user_id' }),
  ])

  return NextResponse.json({ subscription: data })
}

export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { agent_id?: string }
  const { agent_id } = body
  if (!agent_id) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

  const { error } = await supabase
    .from('subscriptions')
    .update({ status: 'cancelled' })
    .eq('user_id', user.id)
    .eq('agent_id', agent_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
