'use client'
import { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '')

const CARD_STYLE = {
  style: {
    base: {
      color: '#EEF2FF',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '15px',
      '::placeholder': { color: 'rgba(238,242,255,0.28)' },
    },
    invalid: { color: '#E84040' },
  },
}

const AMOUNTS = [10, 25, 50, 100, 250, 500]

function DepositForm({ userEmail }: { userEmail: string }) {
  const stripe = useStripe()
  const elements = useElements()
  const [amount, setAmount] = useState(100)
  const [custom, setCustom] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const finalAmount = custom ? parseFloat(custom) : amount
  const finalAmountCents = Math.round(finalAmount * 100)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) {
      setError('Payment system not ready. Please refresh the page.')
      return
    }
    if (finalAmount < 10) {
      setError('Minimum deposit is $10')
      return
    }

    setLoading(true)
    setError('')

    try {
      // 1. Create PaymentIntent server-side
      const intentRes = await fetch('/api/payments/create-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_cents: finalAmountCents }),
      })

      const intentData = await intentRes.json()
      if (!intentRes.ok) throw new Error(intentData.error || 'Failed to create payment intent')

      const { client_secret } = intentData
      if (!client_secret) throw new Error('No client secret received')

      // 2. Confirm card payment with Stripe
      const cardEl = elements.getElement(CardElement)
      if (!cardEl) throw new Error('Card element not found')

      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(client_secret, {
        payment_method: {
          card: cardEl,
          billing_details: { email: userEmail },
        },
      })

      if (stripeError) throw new Error(stripeError.message)

      if (!paymentIntent) throw new Error('No payment intent returned')

      // 3. Immediately credit wallet without waiting for webhook
      const confirmRes = await fetch('/api/payments/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_intent_id: paymentIntent.id }),
      })

      const confirmData = await confirmRes.json()
      if (!confirmRes.ok) throw new Error(confirmData.error || 'Failed to credit wallet')

      setSuccess(true)
      setTimeout(() => { window.location.href = '/dashboard' }, 2000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Payment failed')
    }

    setLoading(false)
  }

  if (success) {
    return (
      <div style={{ textAlign: 'center', padding: '2.5rem 0' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem', color: 'var(--green)' }}>✓</div>
        <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1.3rem', fontWeight: 800, marginBottom: '.5rem' }}>
          Credits added!
        </h3>
        <p style={{ color: 'var(--muted)', fontSize: '.9rem' }}>
          ${finalAmount.toFixed(2)} in buying power has been added to your account.
        </p>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--faint)', marginTop: '.75rem' }}>
          Redirecting to dashboard…
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Amount selector */}
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', letterSpacing: '.08em', color: 'var(--faint)', marginBottom: '.6rem' }}>
          SELECT AMOUNT
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '.5rem', marginBottom: '.75rem' }}>
          {AMOUNTS.map(a => (
            <button
              key={a}
              type="button"
              onClick={() => { setAmount(a); setCustom('') }}
              style={{
                padding: '.65rem',
                borderRadius: 10,
                border: `1px solid ${amount === a && !custom ? 'rgba(232,172,32,.4)' : 'var(--border2)'}`,
                background: amount === a && !custom ? 'rgba(232,172,32,.08)' : 'transparent',
                color: amount === a && !custom ? 'var(--gold)' : 'var(--muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: '.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all .15s',
              }}
            >
              ${a}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--faint)', fontFamily: 'var(--font-mono)' }}>
            $
          </span>
          <input
            type="number"
            value={custom}
            onChange={e => setCustom(e.target.value)}
            placeholder="Custom amount"
            min="10"
            step="any"
            className="input-base"
            style={{ paddingLeft: '1.75rem' }}
          />
        </div>
      </div>

      {/* Card input */}
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', letterSpacing: '.08em', color: 'var(--faint)', marginBottom: '.6rem' }}>
          CARD DETAILS
        </div>
        <div style={{
          padding: '.9rem 1rem',
          background: 'rgba(255,255,255,.05)',
          border: '1px solid var(--border2)',
          borderRadius: 12,
        }}>
          <CardElement options={CARD_STYLE} />
        </div>
      </div>

      {error && (
        <div style={{
          padding: '.75rem 1rem',
          background: 'rgba(232,64,64,.08)',
          border: '1px solid rgba(232,64,64,.2)',
          borderRadius: 10,
          fontSize: '.85rem',
          color: 'var(--red)',
        }}>
          {error}
        </div>
      )}

      {/* Summary */}
      <div style={{ padding: '1rem', background: 'rgba(232,172,32,.05)', border: '1px solid rgba(232,172,32,.12)', borderRadius: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.88rem' }}>
          <span style={{ color: 'var(--muted)' }}>You will receive</span>
          <span style={{ fontWeight: 800, color: 'var(--gold)' }}>${finalAmount.toFixed(2)} in ASE buying power</span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: 'var(--faint)', marginTop: '.35rem' }}>
          Funds are added to your ASE wallet and allocated across live Alpaca-traded agent pools.
        </div>
      </div>

      <button type="submit" disabled={loading || !stripe} className="btn-primary" style={{ justifyContent: 'center' }}>
        {loading ? <><span className="spinner" />Processing…</> : `Add $${finalAmount.toFixed(2)} Credits →`}
      </button>
    </form>
  )
}

export default function DepositClient({ userEmail }: { userEmail: string }) {
  return (
    <div style={{ padding: '2rem 2.5rem', maxWidth: 520 }}>
      <div style={{ marginBottom: '2rem' }}>
        <div className="eyebrow" style={{ marginBottom: '.35rem' }}>ADD CREDITS</div>
        <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '1.8rem', fontWeight: 800, marginBottom: '.5rem' }}>
          Deposit Paper Credits
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: '.9rem', lineHeight: 1.7 }}>
          Add funds to your ASE wallet and deploy capital into AI trading agents running on Alpaca.
        </p>
      </div>

      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,.5)' }}>
        <div className="win-bar">
          <span className="dot dot-r" /><span className="dot dot-y" /><span className="dot dot-g" />
          <span className="win-title">Secure Deposit · Stripe Test Mode</span>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--green)' }}>SECURED</span>
        </div>
        <div style={{ padding: '1.75rem' }}>
          <Elements stripe={stripePromise}>
            <DepositForm userEmail={userEmail} />
          </Elements>
        </div>
      </div>

      <div style={{ marginTop: '1.5rem', padding: '1rem 1.25rem', background: 'rgba(255,255,255,.02)', border: '1px solid var(--border)', borderRadius: 14 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', letterSpacing: '.08em', color: 'var(--faint)', marginBottom: '.5rem' }}>
          TEST CARD
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.8rem', color: 'var(--gold)' }}>
          4242 4242 4242 4242
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.75rem', color: 'var(--muted)', marginTop: '.25rem' }}>
          Exp: any future date · CVC: any 3 digits
        </div>
      </div>
    </div>
  )
}
