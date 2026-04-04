import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendDepositConfirmation } from '@/lib/email'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    console.error('Webhook signature error:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as Stripe.PaymentIntent
    const userId = pi.metadata?.user_id

    if (!userId) {
      return NextResponse.json({ ok: true })
    }

    const amountCents = pi.amount
    const supabase = createAdminClient()

    try {
      const { data: existingDeposit } = await supabase
        .from('transactions')
        .select('id')
        .eq('reference_id', pi.id)
        .eq('type', 'deposit')
        .maybeSingle()

      if (existingDeposit) {
        return NextResponse.json({ ok: true, duplicate: true })
      }

      const { data: wallet, error: walletError } = await supabase
        .from('wallets')
        .select('id, balance_cents')
        .eq('user_id', userId)
        .maybeSingle()

      if (walletError && walletError.code !== 'PGRST116') {
        throw walletError
      }

      if (!wallet) {
        await supabase.from('wallets').insert({
          user_id: userId,
          balance_cents: amountCents,
          updated_at: new Date().toISOString(),
        })
      } else {
        const newBalance = wallet.balance_cents + amountCents
        await supabase
          .from('wallets')
          .update({ balance_cents: newBalance, updated_at: new Date().toISOString() })
          .eq('user_id', userId)
      }

      await supabase.from('transactions').insert({
        user_id: userId,
        type: 'deposit',
        amount_cents: amountCents,
        reference_id: pi.id,
        note: `Stripe deposit — ${pi.id}`
      })

      const { data: authUser } = await supabase.auth.admin.getUserById(userId)
      if (authUser?.user?.email) {
        await sendDepositConfirmation(authUser.user.email, amountCents)
      }
    } catch (error) {
      console.error('Error processing payment:', error)
    }
  }

  return NextResponse.json({ ok: true })
}
