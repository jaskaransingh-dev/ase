'use client'

import { useState } from 'react'

interface Props {
  onClose: () => void
  onSuccess?: () => void
}

export default function CoinbaseConnectModal({ onClose, onSuccess }: Props) {
  const [step, setStep] = useState<'method' | 'credentials' | 'loading'>('method')
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [apiPassphrase, setApiPassphrase] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleConnect() {
    if (!apiKey || !apiSecret || !apiPassphrase) {
      setError('All fields are required')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/coinbase-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          api_secret: apiSecret,
          api_passphrase: apiPassphrase,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to connect account')
      }

      onSuccess?.()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed')
    } finally {
      setLoading(false)
    }
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
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, marginBottom: '.25rem' }}>
              Connect Coinbase
            </h2>
            <p style={{ fontSize: '.85rem', color: 'var(--muted)', margin: 0 }}>
              Link your account to sync balance
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              background: 'rgba(255,255,255,.06)',
              border: '1px solid var(--border)',
              borderRadius: 9,
              width: 36,
              height: 36,
              cursor: loading ? 'not-allowed' : 'pointer',
              color: 'var(--faint)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.2rem',
              opacity: loading ? 0.5 : 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Info Box */}
        <div
          style={{
            background: 'rgba(59,127,255,.06)',
            border: '1px solid rgba(59,127,255,.15)',
            borderRadius: 14,
            padding: '1rem',
            marginBottom: '1.5rem',
            fontSize: '.85rem',
            color: 'var(--muted)',
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: 'inherit', display: 'block', marginBottom: '.5rem' }}>
            How to get API credentials:
          </strong>
          <ol style={{ margin: 0, paddingLeft: '1.2rem' }}>
            <li>Go to Coinbase.com → Settings → API</li>
            <li>Create a new API key with "View Account" and "Transfer" permissions</li>
            <li>Copy the key, secret, and passphrase below</li>
          </ol>
        </div>

        {/* API Credentials Form */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            <label
              style={{
                display: 'block',
                fontWeight: 700,
                marginBottom: '.5rem',
                fontSize: '.9rem',
              }}
            >
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              disabled={loading}
              placeholder="cb-abc123..."
              style={{
                width: '100%',
                padding: '.75rem',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'rgba(255,255,255,.03)',
                color: 'white',
                fontFamily: 'var(--font-mono)',
                fontSize: '.85rem',
                boxSizing: 'border-box',
                opacity: loading ? 0.6 : 1,
              }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label
              style={{
                display: 'block',
                fontWeight: 700,
                marginBottom: '.5rem',
                fontSize: '.9rem',
              }}
            >
              API Secret (Base64)
            </label>
            <input
              type="password"
              value={apiSecret}
              onChange={e => setApiSecret(e.target.value)}
              disabled={loading}
              placeholder="[base64 encoded secret]"
              style={{
                width: '100%',
                padding: '.75rem',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'rgba(255,255,255,.03)',
                color: 'white',
                fontFamily: 'var(--font-mono)',
                fontSize: '.85rem',
                boxSizing: 'border-box',
                opacity: loading ? 0.6 : 1,
              }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label
              style={{
                display: 'block',
                fontWeight: 700,
                marginBottom: '.5rem',
                fontSize: '.9rem',
              }}
            >
              Passphrase
            </label>
            <input
              type="password"
              value={apiPassphrase}
              onChange={e => setApiPassphrase(e.target.value)}
              disabled={loading}
              placeholder="Your passphrase"
              style={{
                width: '100%',
                padding: '.75rem',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'rgba(255,255,255,.03)',
                color: 'white',
                fontFamily: 'var(--font-mono)',
                fontSize: '.85rem',
                boxSizing: 'border-box',
                opacity: loading ? 0.6 : 1,
              }}
            />
          </div>
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
          onClick={handleConnect}
          disabled={loading || !apiKey || !apiSecret || !apiPassphrase}
          style={{
            width: '100%',
            padding: '1rem',
            borderRadius: 12,
            border: 'none',
            background:
              !loading && apiKey && apiSecret && apiPassphrase
                ? 'linear-gradient(135deg, #3b7eff, #3b7eff)'
                : 'rgba(59,127,255,.3)',
            color: 'white',
            fontFamily: 'var(--font-head)',
            fontWeight: 700,
            fontSize: '1rem',
            cursor:
              loading || !apiKey || !apiSecret || !apiPassphrase
                ? 'not-allowed'
                : 'pointer',
            opacity:
              loading || !apiKey || !apiSecret || !apiPassphrase ? 0.6 : 1,
          }}
          onMouseEnter={e => {
            if (!loading && apiKey && apiSecret && apiPassphrase) {
              (e.currentTarget as HTMLElement).style.boxShadow =
                '0 12px 32px rgba(59,127,255,.4)'
            }
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.boxShadow = 'none'
          }}
        >
          {loading ? 'Connecting...' : 'Connect Account'}
        </button>

        <p style={{ fontSize: '.75rem', color: 'var(--faint)', textAlign: 'center', marginTop: '1rem', margin: 0 }}>
          Your credentials are encrypted and stored securely.
        </p>
      </div>
    </div>
  )
}
