'use client'

import { useState } from 'react'

interface FundingModalProps {
  onClose: () => void
}

export default function FundingModal({ onClose }: FundingModalProps) {
  const [amount, setAmount] = useState('10000')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  async function handleAddFunds() {
    const amountNum = parseInt(amount)
    if (!amountNum || amountNum < 100) {
      setError('Minimum $100')
      return
    }

    setLoading(true)
    setError('')

    try {
      // For paper trading, we simulate a deposit
      // In real implementation, this would call Alpaca transfer API
      const res = await fetch('/api/broker/fund-paper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_cents: amountNum }),
      })

      if (res.ok) {
        setSuccess(true)
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to add funds')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(4,3,12,.95)', backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 20,
          padding: '2rem', width: '100%', maxWidth: 380, textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✓</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Funds Added!</h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>
            ${parseInt(amount).toLocaleString()} in virtual cash added to your paper account.
          </p>
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '1rem', borderRadius: 10, border: 'none',
              background: 'var(--blue)', color: 'white', fontWeight: 700, cursor: 'pointer'
            }}
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(4,3,12,.95)', backdropFilter: 'blur(20px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 20,
        padding: '2rem', width: '100%', maxWidth: 380
      }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Add Virtual Funds</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>
          Add virtual cash to your paper trading account for testing.
        </p>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--faint)', marginBottom: '0.5rem' }}>
            AMOUNT (USD)
          </label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>$</span>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              min={100}
              max={100000}
              style={{
                width: '100%', padding: '0.75rem 0.75rem 0.75rem 1.5rem',
                borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)',
                color: 'white', fontSize: '1rem', fontFamily: 'var(--font-mono)'
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            {[5000, 10000, 25000, 50000].map(amt => (
              <button
                key={amt}
                onClick={() => setAmount(String(amt))}
                style={{
                  flex: 1, padding: '0.4rem', borderRadius: 6, border: '1px solid var(--border)',
                  background: amount === String(amt) ? 'var(--blue)' : 'transparent',
                  color: amount === String(amt) ? 'white' : 'var(--muted)',
                  fontSize: '0.7rem', cursor: 'pointer'
                }}
              >
                ${amt.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ marginBottom: '1rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,90,95,0.1)', color: 'var(--red)', fontSize: '0.8rem' }}>
            {error}
          </div>
        )}

        <button
          onClick={handleAddFunds}
          disabled={loading}
          style={{
            width: '100%', padding: '1rem', borderRadius: 10, border: 'none',
            background: loading ? 'var(--border)' : 'var(--blue)', color: 'white',
            fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Adding...' : `Add $${parseInt(amount).toLocaleString()}`}
        </button>

        <button onClick={onClose} style={{
          marginTop: '0.75rem', width: '100%', padding: '0.75rem', borderRadius: 10,
          background: 'transparent', color: 'var(--muted)', cursor: 'pointer'
        }}>
          Cancel
        </button>

        <p style={{ fontSize: '0.65rem', color: 'var(--faint)', marginTop: '1rem', textAlign: 'center' }}>
          Paper trading - no real money
        </p>
      </div>
    </div>
  )
}