import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendDepositConfirmation } from '@/lib/email'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  console.log('Stripe webhook received')
  
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  console.log('Webhook signature present:', !!sig)
  console.log('Webhook secret present:', !!webhookSecret)

  if (!sig || !webhookSecret) {
    console.error('Missing webhook signature or secret')
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
    console.log('Webhook event constructed:', event.type)
  } catch (err) {
    console.error('Webhook signature error:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'payment_intent.succeeded') {
    console.log('Processing payment_intent.succeeded')
    const pi = event.data.object as Stripe.PaymentIntent
    const userId = pi.metadata?.user_id
    
    console.log('Payment intent ID:', pi.id)
    console.log('Amount:', pi.amount)
    console.log('User ID from metadata:', userId)
    
    if (!userId) {
      console.error('No user_id in payment intent metadata')
      return NextResponse.json({ ok: true })
    }

    const amountCents = pi.amount
    const supabase = createAdminClient()

    try {
      // Check if wallet exists
      const { data: wallet, error: walletError } = await supabase
        .from('wallets')
        .select('id, balance_cents')
        .eq('user_id', userId)
        .single()

      if (walletError && walletError.code !== 'PGRST116') {
        console.error('Wallet query error:', walletError)
        throw walletError
      }

      if (!wallet) {
        console.log('Creating new wallet for user:', userId)
        await supabase.from('wallets').insert({ 
          user_id: userId, 
          balance_cents: amountCents,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      } else {
        console.log('Updating existing wallet. Current balance:', wallet.balance_cents)
        const newBalance = wallet.balance_cents + amountCents
        await supabase
          .from('wallets')
          .update({ 
            balance_cents: newBalance, 
            updated_at: new Date().toISOString() 
          })
          .eq('user_id', userId)
        console.log('New balance:', newBalance)
      }

      // Record transaction
      await supabase.from('transactions').insert({
        user_id: userId,
        type: 'deposit',
        amount_cents: amountCents,
        reference_id: pi.id,
        note: `Stripe deposit — ${pi.id}`,
        created_at: new Date().toISOString(),
      })

      console.log('Transaction recorded')

      // Send confirmation email
      const { data: authUser } = await supabase.auth.admin.getUserById(userId)
      if (authUser?.user?.email) {
        console.log('Sending confirmation email to:', authUser.user.email)
        await sendDepositConfirmation(authUser.user.email, amountCents)
      }

      console.log('Payment processing completed successfully')
    } catch (error) {
      console.error('Error processing payment:', error)
      // Don't return error to Stripe to avoid retries
    }
  } else {
    console.log('Unhandled event type:', event.type)
  }

  return NextResponse.json({ ok: true })
}
