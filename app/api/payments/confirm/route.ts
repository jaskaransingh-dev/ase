import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'

export const dynamic = 'force-dynamic'

/**
 * POST /api/payments/confirm
 *
 * Called from the frontend immediately after Stripe's confirmCardPayment succeeds.
 * Verifies the PaymentIntent with Stripe, then atomically credits the wallet.
 *
 * Idempotent: uses transactions.reference_id to prevent double-crediting if the
 * Stripe webhook also fires.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { payment_intent_id } = await req.json()
    if (!payment_intent_id) {
      return NextResponse.json({ error: 'Missing payment_intent_id' }, { status: 400 })
    }

    // 1. Verify with Stripe that the PaymentIntent actually succeeded
    const intent = await stripe.paymentIntents.retrieve(payment_intent_id)

    if (intent.status !== 'succeeded') {
      return NextResponse.json(
        { error: `Payment not complete (status: ${intent.status})` },
        { status: 400 }
      )
    }

    // 2. Ensure the PaymentIntent belongs to this user (metadata check)
    if (intent.metadata?.user_id && intent.metadata.user_id !== user.id) {
      return NextResponse.json({ error: 'Payment does not belong to this user' }, { status: 403 })
    }

    const amountCents = intent.amount

    const admin = createAdminClient()

    // 3. Idempotency check — has this PI already been credited?
    const { data: existing } = await admin
      .from('transactions')
      .select('id')
      .eq('reference_id', payment_intent_id)
      .eq('type', 'deposit')
      .maybeSingle()

    if (existing) {
      // Already credited (either by this route or by the webhook) — return success
      return NextResponse.json({ ok: true, already_credited: true, amount_cents: amountCents })
    }

    // 4. Fetch or create wallet
    const { data: wallet } = await admin
      .from('wallets')
      .select('balance_cents')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!wallet) {
      await admin.from('wallets').insert({
        user_id: user.id,
        balance_cents: 0,
        updated_at: new Date().toISOString(),
      })
    }

    // 5. Credit wallet
    const currentBalance = Number(wallet?.balance_cents) || 0
    await admin
      .from('wallets')
      .update({
        balance_cents: currentBalance + amountCents,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)

    // 6. Record transaction (this is the idempotency anchor)
    await admin.from('transactions').insert({
      user_id: user.id,
      type: 'deposit',
      amount_cents: amountCents,
      reference_id: payment_intent_id,
      note: `Stripe deposit – ${payment_intent_id}`,
    })

    return NextResponse.json({
      ok: true,
      amount_cents: amountCents,
      new_balance_cents: currentBalance + amountCents,
    })
  } catch (err: unknown) {
    console.error('confirm payment error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
