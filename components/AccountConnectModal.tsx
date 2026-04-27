'use client'

import { useState } from 'react'

interface Props {
  onClose: () => void
  onSuccess?: () => void
}

export default function AccountConnectModal({ onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false)
  const [connected, setConnected] = useState(false)

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
          border: '1px solid rgba(87,65,217,.2)',
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

        <div
          style={{
            background: 'rgba(255,200,0,.08)',
            border: '1px solid rgba(255,200,0,.2)',
            borderRadius: 12,
            padding: '1rem',
            marginBottom: '1.5rem',
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

        {connected ? (
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
        ) : (
          <>
            <div
              style={{
                background: 'rgba(87,65,217,.06)',
                border: '1px solid rgba(87,65,217,.15)',
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
              <ul style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: 1.8 }}>
                <li>
                  <strong>Connect with Kraken</strong><br/>
                  <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>Securely sign in with your Kraken account</span>
                </li>
              </ul>
            </div>

            <button
              onClick={() => {
                setLoading(true)
                window.location.href = '/api/auth/kraken/connect'
              }}
              disabled={loading}
              style={{
                width: '100%',
                padding: '1rem',
                borderRadius: 10,
                border: 'none',
                background: loading ? 'rgba(87,65,217,.3)' : 'linear-gradient(135deg, #5741D9, #5741D9)',
                color: 'white',
                fontFamily: 'var(--font-head)',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
              onMouseEnter={e => {
                if (!loading) {
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 32px rgba(87,65,217,.4)'
                }
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.boxShadow = 'none'
              }}
            >
              {loading ? 'Connecting...' : 'Connect with Kraken →'}
            </button>

            <p style={{ fontSize: '.75rem', color: 'var(--faint)', textAlign: 'center', marginTop: '1rem', margin: 0 }}>
              Your credentials are encrypted and never leave your brokerage.
            </p>
          </>
        )}
      </div>
    </div>
  )
}