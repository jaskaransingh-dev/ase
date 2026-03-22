import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'

export async function GET() {
  try {
    // Test Stripe connection by creating a test payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 1000, // $10
      currency: 'usd',
      metadata: { test: 'true' },
      automatic_payment_methods: { enabled: true },
    })

    return NextResponse.json({
      status: 'Stripe is working',
      testPaymentIntent: paymentIntent.id,
      publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.slice(0, 10) + '...',
      webhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
      secretKey: !!process.env.STRIPE_SECRET_KEY,
    })
  } catch (error) {
    return NextResponse.json({
      status: 'Stripe error',
      error: error instanceof Error ? error.message : 'Unknown error',
      publishableKey: !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      webhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
      secretKey: !!process.env.STRIPE_SECRET_KEY,
    }, { status: 500 })
  }
}
