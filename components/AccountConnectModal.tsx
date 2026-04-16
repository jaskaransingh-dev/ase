'use client'

import { useState } from 'react'

interface Props {
  onClose: () => void
  onSuccess?: () => void
}

export default function AccountConnectModal({ onClose, onSuccess }: Props) {
  const [step, setStep] = useState<'method' | 'credentials' | 'loading'>('method')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleConnect() {
    if (!apiKey || !apiSecret) {
      setError('API Key and Secret are required')
      return
    }

    setLoading(true)
    setError('')
    setStep('loading')

    try {
      const res = await fetch('/api/auth/alpaca/direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          api_secret: apiSecret,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to connect account')
      }

      setSuccess(true)
      setTimeout(() => {
        onSuccess?.()
        window.location.reload()
      }, 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed')
      setStep('credentials')
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, marginBottom: '.25rem' }}>
              Connect Your Trading Account
            </h2>
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

        {/* Required Exchange Disclosure */}
        <div
          style={{
            background: 'rgba(255,200,0,.08)',
            border: '1px solid rgba(255,200,0,.2)',
            borderRadius: 12,
            padding: '1rem',
            marginBottom: '1.25rem',
            fontSize: '.78rem',
            color: 'var(--white)',
            lineHeight: 1.5,
          }}
        >
          <strong style={{ display: 'block', marginBottom: '.4rem', color: '#fbbf24' }}>
            Important Disclosure
          </strong>
          <p style={{ margin: 0 }}>
            By allowing ASE to access your trading account, you grant ASE authorization to execute trades on your behalf. ASE does not custody your funds — trades execute directly on your exchange. 
          </p>
        </div>

        {step === 'method' && (
          <>
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
                How to connect:
              </strong>
              <ol style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: 1.8 }}>
                <li>
                  <strong>Connect with Kraken</strong> (recommended)<br/>
                  <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>Securely sign in with your Kraken account</span>
                </li>
                <li style={{ marginTop: '0.75rem' }}>
                  <strong>Connect with Alpaca</strong><br/>
                  <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>US stocks & crypto trading</span>
                </li>
              </ol>
            </div>

            <button
              onClick={() => window.location.href = '/api/auth/kraken/connect'}
              style={{
                width: '100%',
                padding: '1rem',
                borderRadius: 10,
                border: 'none',
                background: 'linear-gradient(135deg, #5741D9, #5741D9)',
                color: 'white',
                fontFamily: 'var(--font-head)',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: 'pointer',
                marginBottom: '1rem',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 32px rgba(87,65,217,.4)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.boxShadow = 'none'
              }}
            >
              Connect with Kraken →
            </button>

            <button
              onClick={() => window.location.href = '/api/auth/alpaca/connect'}
              style={{
                width: '100%',
                padding: '1rem',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--blue)',
                fontFamily: 'var(--font-head)',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: 'pointer',
                marginBottom: '1rem',
              }}
            >
              Connect with Alpaca →
            </button>

            <div style={{ textAlign: 'center', marginBottom: '1rem', color: 'var(--faint)', fontSize: '0.8rem' }}>or enter API credentials directly</div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '.5rem', fontSize: '.9rem' }}>
                API Key
              </label>
              <input
                type="text"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="PKXXXXXXXXXXXXXXXX"
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
                }}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '.5rem', fontSize: '.9rem' }}>
                API Secret
              </label>
              <input
                type="password"
                value={apiSecret}
                onChange={e => setApiSecret(e.target.value)}
                placeholder="Your API secret"
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
                }}
              />
            </div>

            <button
              onClick={handleConnect}
              disabled={loading || !apiKey || !apiSecret}
              style={{
                width: '100%',
                padding: '1rem',
                borderRadius: 12,
                border: 'none',
                background: !loading && apiKey && apiSecret ? 'linear-gradient(135deg, #3b7eff, #3b7eff)' : 'rgba(59,127,255,.3)',
                color: 'white',
                fontFamily: 'var(--font-head)',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: loading || !apiKey || !apiSecret ? 'not-allowed' : 'pointer',
                opacity: loading || !apiKey || !apiSecret ? 0.6 : 1,
              }}
              onMouseEnter={e => {
                if (!loading && apiKey && apiSecret) {
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 32px rgba(59,127,255,.4)'
                }
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.boxShadow = 'none'
              }}
            >
              {loading ? 'Connecting...' : 'Connect Account'}
            </button>
          </>
        )}

        {step === 'credentials' && !success && (
          <div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '.5rem', fontSize: '.9rem' }}>
                API Key
              </label>
              <input
                type="text"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="PKXXXXXXXXXXXXXXXX"
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
                }}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '.5rem', fontSize: '.9rem' }}>
                API Secret
              </label>
              <input
                type="password"
                value={apiSecret}
                onChange={e => setApiSecret(e.target.value)}
                placeholder="Your API secret"
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
                }}
              />
            </div>

            <button
              onClick={handleConnect}
              disabled={loading || !apiKey || !apiSecret}
              style={{
                width: '100%',
                padding: '1rem',
                borderRadius: 12,
                border: 'none',
                background: !loading && apiKey && apiSecret ? 'linear-gradient(135deg, #3b7eff, #3b7eff)' : 'rgba(59,127,255,.3)',
                color: 'white',
                fontFamily: 'var(--font-head)',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: loading || !apiKey || !apiSecret ? 'not-allowed' : 'pointer',
                opacity: loading || !apiKey || !apiSecret ? 0.6 : 1,
              }}
            >
              {loading ? 'Connecting...' : 'Connect Account'}
            </button>
          </div>
        )}

        {step === 'loading' && (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <div style={{ 
              width: 40, 
              height: 40, 
              border: '3px solid rgba(59,127,255,.2)', 
              borderTopColor: '#3b7eff',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 1rem',
            }} />
            <p style={{ color: 'var(--muted)', fontSize: '.9rem' }}>
              Connecting...
            </p>
          </div>
        )}

        {success && (
          <div
            style={{
              background: 'rgba(110,231,183,.1)',
              border: '1px solid rgba(110,231,183,.3)',
              borderRadius: 10,
              padding: '.75rem 1rem',
              marginBottom: '1rem',
              fontFamily: 'var(--font-mono)',
              fontSize: '.8rem',
              color: '#6EE7B7',
            }}
          >
            Account connected! Reloading...
          </div>
        )}

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

        <p style={{ fontSize: '.75rem', color: 'var(--faint)', textAlign: 'center', marginTop: '1rem', margin: 0 }}>
          Your credentials are encrypted and never leave your brokerage.
        </p>
      </div>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}