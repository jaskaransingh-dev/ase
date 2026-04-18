/**
 * POST /api/marketplace/[id]/subscribe
 * Subscribe the authed user to a marketplace listing.
 * (Payment integration is out of scope — this creates the subscription record.)
 *
 * DELETE /api/marketplace/[id]/subscribe
 * Cancel subscription.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabase()
  const { data: { user } } = await db.auth.getUser(auth.replace('Bearer ', ''))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: listing } = await db
    .from('marketplace_listings')
    .select('id, strategy_id, price_cents, is_free, owner_id, status')
    .eq('id', id)
    .eq('status', 'active')
    .single()

  if (!listing) return NextResponse.json({ error: 'Listing not found or not active' }, { status: 404 })
  if (listing.owner_id === user.id) {
    return NextResponse.json({ error: 'You cannot subscribe to your own strategy' }, { status: 422 })
  }

  const { data: existing } = await db
    .from('subscriptions')
    .select('id, status')
    .eq('user_id', user.id)
    .eq('listing_id', id)
    .single()

  if (existing?.status === 'active') {
    return NextResponse.json({ error: 'Already subscribed' }, { status: 409 })
  }

  const expiresAt = new Date(Date.now() + 30 * 86400 * 1000).toISOString()

  const { data: sub, error } = await db
    .from('subscriptions')
    .upsert({
      user_id:     user.id,
      listing_id:  id,
      strategy_id: listing.strategy_id,
      status:      'active',
      price_cents: listing.is_free ? 0 : listing.price_cents,
      started_at:  new Date().toISOString(),
      expires_at:  expiresAt,
      cancelled_at: null,
    }, { onConflict: 'user_id,listing_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await db.rpc('increment_subscriber_count', { p_listing_id: id }).maybeSingle()

  return NextResponse.json({ subscription: sub }, { status: 201 })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabase()
  const { data: { user } } = await db.auth.getUser(auth.replace('Bearer ', ''))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await db
    .from('subscriptions')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('listing_id', id)
    .eq('status', 'active')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
