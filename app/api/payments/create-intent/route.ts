import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { amount_cents } = await req.json()
    if (!amount_cents || amount_cents < 1000) {
      return NextResponse.json({ error: 'Minimum deposit is $10' }, { status: 400 })
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount_cents,
      currency: 'usd',
      metadata: { user_id: user.id, type: 'ase_credits' },
    })

    return NextResponse.json({ client_secret: paymentIntent.client_secret })
  } catch (err: unknown) {
    console.error('create-intent error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
