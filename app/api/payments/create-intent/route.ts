import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    console.log('Creating payment intent...')
    
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.error('No user found in request')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { amount_cents } = await req.json()
    console.log('Amount requested:', amount_cents)
    
    if (!amount_cents || amount_cents < 1000) {
      console.error('Invalid amount:', amount_cents)
      return NextResponse.json({ error: 'Minimum deposit is $10' }, { status: 400 })
    }

    console.log('Creating Stripe payment intent for user:', user.id)
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount_cents,
      currency: 'usd',
      metadata: { user_id: user.id, type: 'ase_credits' },
      automatic_payment_methods: { enabled: true },
    })

    console.log('Payment intent created:', paymentIntent.id)
    return NextResponse.json({ client_secret: paymentIntent.client_secret })
  } catch (err: unknown) {
    console.error('create-intent error:', err)
    if (err instanceof Error) {
      console.error('Error stack:', err.stack)
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
