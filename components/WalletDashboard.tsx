'use client'

import { useState, useEffect } from 'react'
import CoinbaseConnectModal from './CoinbaseConnectModal'

export default function WalletDashboard() {
  const [balance, setBalance] = useState<number | null>(null)
  const [status, setStatus] = useState<'loading' | 'connected' | 'not_connected'>('loading')
  const [showConnect, setShowConnect] = useState(false)
  const [lastSynced, setLastSynced] = useState<string | null>(null)

  async function fetchBalance() {
    try {
      const res = await fetch('/api/coinbase/balance')
      const data = await res.json()

      setBalance(data.usd_balance_cents)
      setStatus(data.status)
      if (data.last_synced_at) {
        setLastSynced(new Date(data.last_synced_at).toLocaleTimeString())
      }
    } catch (error) {
      console.error('Failed to fetch balance:', error)
      setStatus('not_connected')
    }
  }

  useEffect(() => {
    fetchBalance()
    const interval = setInterval(fetchBalance, 30000)
    return () => clearInterval(interval)
  }, [])

  const balanceDisplay =
    balance !== null ? `$${(balance / 100).toFixed(2)}` : '—'

  return (
    <>
      <div
        style={{
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '1.5rem',
          marginBottom: '2rem',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1.5rem',
          }}
        >
          <div>
            <h3
              style={{
                fontSize: '.9rem',
                fontWeight: 700,
                color: 'var(--muted)',
                margin: 0,
                marginBottom: '.5rem',
                textTransform: 'uppercase',
                letterSpacing: '.05em',
              }}
            >
              Coinbase USD Balance
            </h3>
            <div
              style={{
                fontSize: '2.5rem',
                fontWeight: 900,
                color: status === 'connected' ? '#7aacff' : 'var(--faint)',
                margin: 0,
                fontFamily: 'var(--font-mono)',
              }}
            >
              {balanceDisplay}
            </div>
          </div>

          {status === 'not_connected' ? (
            <button
              onClick={() => setShowConnect(true)}
              style={{
                padding: '.75rem 1.5rem',
                borderRadius: 10,
                border: 'none',
                background: 'linear-gradient(135deg, #3b7eff, #3b7eff)',
                color: 'white',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: '.9rem',
              }}
            >
              Connect Account
            </button>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: '.5rem',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  background: 'rgba(34,197,94,.1)',
                  border: '1px solid rgba(34,197,94,.3)',
                  borderRadius: 6,
                  padding: '.25rem .75rem',
                  fontSize: '.75rem',
                  fontWeight: 600,
                  color: '#22c55e',
                }}
              >
                Connected
              </span>
              {lastSynced && (
                <span
                  style={{
                    fontSize: '.7rem',
                    color: 'var(--faint)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  Synced at {lastSynced}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Info */}
        <div
          style={{
            background: 'rgba(59,127,255,.06)',
            border: '1px solid rgba(59,127,255,.15)',
            borderRadius: 10,
            padding: '.75rem 1rem',
            fontSize: '.8rem',
            color: 'var(--muted)',
            lineHeight: 1.5,
          }}
        >
          {status === 'connected' ? (
            <>
              This is your real Coinbase USD balance. When you invest in agents, this
              amount is deducted and used for live trading.
            </>
          ) : (
            <>
              Connect your Coinbase account to see your USD balance and invest in
              trading agents.
            </>
          )}
        </div>
      </div>

      {showConnect && (
        <CoinbaseConnectModal
          onClose={() => setShowConnect(false)}
          onSuccess={() => {
            fetchBalance()
          }}
        />
      )}
    </>
  )
}