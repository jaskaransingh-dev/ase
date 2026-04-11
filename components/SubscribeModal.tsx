'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  agentId: string
  agentName: string
  onClose: () => void
  onSuccess?: () => void
}

export default function SubscribeModal({ agentId, agentName, onClose, onSuccess }: Props) {
  const router = useRouter()
  const [balance, setBalance] = useState<number | null>(null)
  const [amount, setAmount] = useState(100) // Default $100
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fetching, setFetching] = useState(true)
  const [agreed, setAgreed] = useState(false)

  const [coinbaseStatus, setCoinbaseStatus] = useState<string>('cached')

  useEffect(() => {
    fetch('/api/coinbase/balance')
      .then(r => r.json())
      .then(d => {
        if (d.usd_balance_cents) {
          setBalance(d.usd_balance_cents)
          setCoinbaseStatus(d.status || 'cached')
        } else {
          setBalance(0)
          setCoinbaseStatus(d.status || 'not_connected')
        }
      })
      .catch(() => {
        console.warn('Could not fetch Coinbase balance')
        setBalance(0)
        setCoinbaseStatus('error')
      })
      .finally(() => setFetching(false))
  }, [])

  const maxAmount = balance !== null ? Math.floor(balance / 100) : 0
  const cappedAmount = Math.min(Math.max(amount, 10), maxAmount)
  const canSubmit = agreed && cappedAmount >= 10 && !loading && balance !== null && balance > 0

  async function handleSubscribe() {
    if (!canSubmit) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          amount_cents: Math.round(cappedAmount * 100),
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Subscription failed')

      // Success - refresh page to show updated holding
      router.refresh()
      onSuccess?.()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Subscription failed')
    } finally {
      setLoading(false)
    }
  }

  if (fetching) {
    return (
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(4,3,12,.92)',
          backdropFilter: 'blur(24px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '.9rem' }}>Loading balance...</div>
      </div>
    )
  }

  if (balance === null || balance <= 0) {
    return (
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(4,3,12,.92)',
          backdropFilter: 'blur(24px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: 'var(--bg2)',
            border: '1px solid rgba(239,68,68,.2)',
            borderRadius: 20,
            padding: '2.5rem',
            width: '100%',
            maxWidth: 480,
            textAlign: 'center',
          }}
        >
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '1rem' }}>No USD Available</h2>
          <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>
            You need USD in your Coinbase account to invest in trading agents.
          </p>
          <p style={{ fontSize: '.85rem', color: 'var(--faint)', marginBottom: '2rem' }}>
            Go to Coinbase.com to deposit USD, then come back here to subscribe.
          </p>
          <button
            onClick={onClose}
            style={{
              padding: '.85rem 2rem',
              borderRadius: 12,
              border: 'none',
              background: '#3b7eff',
              color: 'white',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Got it
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(4,3,12,.92)',
        backdropFilter: 'blur(24px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg2)',
          border: '1px solid rgba(59,127,255,.2)',
          borderRadius: 20,
          padding: '2.5rem',
          width: '100%',
          maxWidth: 480,
          boxShadow: '0 40px 80px rgba(0,0,0,.8)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, marginBottom: '.25rem' }}>Allocate Funds</h2>
            <p style={{ fontSize: '.85rem', color: 'var(--muted)', margin: 0 }}>{agentName}</p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,.06)',
              border: '1px solid var(--border)',
              borderRadius: 9,
              width: 36,
              height: 36,
              cursor: 'pointer',
              color: 'var(--faint)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.2rem',
            }}
          >
            x
          </button>
        </div>

        {/* Coinbase Balance */}
        <div style={{ background: 'rgba(59,127,255,.06)', border: '1px solid rgba(59,127,255,.15)', borderRadius: 14, padding: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.4rem', textTransform: 'uppercase' }}>
            Coinbase USD Balance
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '2rem', fontWeight: 900, color: '#7aacff', marginBottom: '.25rem' }}>
            ${(maxAmount).toFixed(0)}
          </div>
          <div style={{ fontSize: '.7rem', color: 'var(--muted)' }}>
            Real USD in your Coinbase account
          </div>
        </div>

        {/* Amount Input */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.75rem' }}>
            <label style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1rem' }}>Amount to Invest</label>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 900, color: '#3b7eff' }}>
              ${cappedAmount.toFixed(2)}
            </span>
          </div>

          {/* Slider */}
          <input
            type="range"
            min="10"
            max={maxAmount}
            step="10"
            value={cappedAmount}
            onChange={e => setAmount(parseInt(e.target.value))}
            disabled={loading}
            style={{
              width: '100%',
              height: 8,
              borderRadius: 4,
              background: 'var(--border)',
              outline: 'none',
              WebkitAppearance: 'none',
              cursor: 'pointer',
            }}
          />

          {/* Quick Amount Buttons */}
          <div style={{ display: 'flex', gap: '.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            {[50, 100, 250, 500].filter(v => v <= maxAmount).map(v => (
              <button
                key={v}
                onClick={() => setAmount(v)}
                disabled={loading}
                style={{
                  padding: '.5rem 1rem',
                  borderRadius: 8,
                  border: `2px solid ${cappedAmount === v ? '#3b7eff' : 'var(--border)'}`,
                  background: cappedAmount === v ? 'rgba(59,127,255,.1)' : 'transparent',
                  color: cappedAmount === v ? '#7aacff' : 'var(--muted)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all .2s',
                }}
              >
                ${v}
              </button>
            ))}
          </div>

          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: 'var(--faint)', marginTop: '.8rem', margin: 0 }}>
            Min: $10 • Max: ${maxAmount}
          </p>
        </div>

        {/* Risk Warning */}
        <div
          style={{
            background: 'rgba(239,68,68,.08)',
            border: '1px solid rgba(239,68,68,.2)',
            borderRadius: 12,
            padding: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '.6rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              disabled={loading}
              style={{
                marginTop: '.2rem',
                cursor: 'pointer',
                width: 18,
                height: 18,
              }}
            />
            <div>
              <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: '.3rem', color: '#fb7185' }}>Real USD Risk Acknowledgment</div>
              <div style={{ fontSize: '.78rem', color: 'var(--muted)', lineHeight: 1.65 }}>
                I understand this is real money from my Coinbase account. Algorithmic trading involves substantial risk of loss. I may lose my entire investment. Past performance does not guarantee future results.
              </div>
            </div>
          </label>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              background: 'rgba(239,68,68,.1)',
              border: '1px solid rgba(239,68,68,.3)',
              borderRadius: 10,
              padding: '.75rem 1rem',
              marginBottom: '1rem',
              fontFamily: 'var(--font-mono)',
              fontSize: '.8rem',
              color: '#fb7185',
            }}
          >
            {error}
          </div>
        )}

        {/* Submit Button */}
        <button
          onClick={handleSubscribe}
          disabled={!canSubmit}
          style={{
            width: '100%',
            padding: '1rem',
            borderRadius: 12,
            border: 'none',
            background: canSubmit ? 'linear-gradient(135deg, #3b7eff, #3b7eff)' : 'rgba(59,127,255,.3)',
            color: 'white',
            fontFamily: 'var(--font-head)',
            fontWeight: 700,
            fontSize: '1rem',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            transition: 'all .3s',
            opacity: canSubmit ? 1 : 0.6,
          }}
          onMouseEnter={e => {
            if (canSubmit) (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 32px rgba(59,127,255,.4)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.boxShadow = 'none'
          }}
        >
          {loading ? 'Processing...' : `Invest $${cappedAmount.toFixed(0)}`}
        </button>

        <p style={{ fontSize: '.75rem', color: 'var(--faint)', textAlign: 'center', marginTop: '1rem', margin: 0 }}>
          Agent starts trading immediately. View your position anytime.
        </p>
      </div>
    </div>
  )
}
