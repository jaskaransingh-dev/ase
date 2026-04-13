'use client'

import { useState } from 'react'

interface OnboardingModalProps {
  onClose: () => void
  onSuccess?: () => void
}

export default function OnboardingModal({ onClose, onSuccess }: OnboardingModalProps) {
  const [step, setStep] = useState<'input' | 'connecting' | 'done'>('input')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')

  async function handleConnect() {
    if (!apiKey || !apiSecret) {
      setError('Please enter both API key and secret')
      return
    }

    setLoading(true)
    setError('')
    setStep('connecting')

    try {
      const res = await fetch('/api/broker/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, api_secret: apiSecret }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || data.message || 'Failed to connect')
      }

      setStep('done')
      onSuccess?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error connecting account')
      setStep('input')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'input') {
    return (
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(4,3,12,.95)', backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 20,
          padding: '2rem', width: '100%', maxWidth: 420
        }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Link Alpaca Paper Account
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>
            Enter your Alpaca paper trading API credentials to connect.
          </p>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--faint)', marginBottom: '0.4rem' }}>
              API KEY
            </label>
            <input
              type="text"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="PK..."
              style={{
                width: '100%', padding: '0.75rem', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg3)',
                color: 'white', fontSize: '0.85rem', fontFamily: 'var(--font-mono)'
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--faint)', marginBottom: '0.4rem' }}>
              API SECRET
            </label>
            <input
              type="password"
              value={apiSecret}
              onChange={e => setApiSecret(e.target.value)}
              placeholder="Your API secret"
              style={{
                width: '100%', padding: '0.75rem', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg3)',
                color: 'white', fontSize: '0.85rem', fontFamily: 'var(--font-mono)'
              }}
            />
          </div>

          {error && (
            <div style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: 8, background: 'rgba(255,90,95,0.1)', border: '1px solid rgba(255,90,95,0.3)', color: 'var(--red)', fontSize: '0.8rem' }}>
              {error}
            </div>
          )}

          <button
            onClick={handleConnect}
            disabled={loading}
            style={{
              width: '100%', padding: '1rem', borderRadius: 10, border: 'none',
              background: loading ? 'var(--border)' : 'var(--blue)', color: 'white',
              fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1
            }}
          >
            {loading ? 'Connecting...' : 'Link Account'}
          </button>

          <button onClick={onClose} style={{
            marginTop: '0.75rem', width: '100%', padding: '0.75rem', borderRadius: 10,
            background: 'transparent', color: 'var(--muted)', cursor: 'pointer'
          }}>
            Cancel
          </button>

          <a href="https://app.alpaca.markets/dashboard/api" target="_blank" rel="noopener" style={{
            display: 'block', marginTop: '1rem', fontSize: '0.75rem', color: 'var(--blue)', textAlign: 'center'
          }}>
            Get API credentials ↗
          </a>

          <p style={{ fontSize: '0.65rem', color: 'var(--faint)', marginTop: '1rem', textAlign: 'center' }}>
            Paper trading only — no real money
          </p>
        </div>
      </div>
    )
  }

  if (step === 'connecting') {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(4,3,12,.95)', backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Connecting to Alpaca...</div>
        </div>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(4,3,12,.95)', backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 20,
          padding: '2rem', width: '100%', maxWidth: 400, textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✓</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Account Linked!</h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>
            Your Alpaca paper trading account is connected.
          </p>
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '1rem', borderRadius: 10, border: 'none',
              background: 'var(--blue)', color: 'white', fontWeight: 700, cursor: 'pointer'
            }}
          >
            Continue
          </button>
        </div>
      </div>
    )
  }

  return null
}