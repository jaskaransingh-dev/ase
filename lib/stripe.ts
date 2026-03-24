import Stripe from 'stripe'

let stripeClient: Stripe | null = null

export function getStripe(): Stripe {
  if (!stripeClient) {
    const apiKey = process.env.STRIPE_SECRET_KEY
    if (!apiKey) {
      throw new Error('STRIPE_SECRET_KEY is not set')
    }
    stripeClient = new Stripe(apiKey)
  }
  return stripeClient
}

// For backward compatibility, also export stripe as a getter
export const stripe = {
  get customers() { return getStripe().customers },
  get paymentIntents() { return getStripe().paymentIntents },
  get charges() { return getStripe().charges },
  get prices() { return getStripe().prices },
  get products() { return getStripe().products },
  get subscriptions() { return getStripe().subscriptions },
  get setupIntents() { return getStripe().setupIntents },
} as any
