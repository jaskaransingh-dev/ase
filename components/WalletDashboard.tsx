'use client'

import { useState, useEffect } from 'react'
import AccountConnectModal from './AccountConnectModal'

export default function WalletDashboard() {
  const [balance, setBalance] = useState<{
    equity_cents: number
    cash_cents: number
    buying_power_cents: number
  } | null>(null)
  const [status, setStatus] = useState<'loading' | 'connected' | 'not_connected'>('loading')
  const [showConnect, setShowConnect] = useState(false)
  const [lastSynced, setLastSynced] = useState<string | null>(null)

  async function fetchBalance() {
    try {
      const res = await fetch('/api/account/balance')
      const data = await res.json()

      setBalance({
        equity_cents: data.equity_cents ?? 0,
        cash_cents: data.cash_cents ?? 0,
        buying_power_cents: data.buying_power_cents ?? 0,
      })
      setStatus(data.status === 'connected' ? 'connected' : 'not_connected')
      if (data.updated_at) {
        setLastSynced(new Date(data.updated_at).toLocaleTimeString())
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

  const equityDisplay = balance?.equity_cents != null ? `$${(balance.equity_cents / 100).toFixed(2)}` : '—'
  const cashDisplay = balance?.cash_cents != null ? `$${(balance.cash_cents / 100).toFixed(2)}` : '—'
  const buyingPowerDisplay = balance?.buying_power_cents != null ? `$${(balance.buying_power_cents / 100).toFixed(2)}` : '—'

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
              Trading Account Balance
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
              {equityDisplay}
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

        {status === 'connected' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ background: 'rgba(255,255,255,.03)', borderRadius: 10, padding: '.75rem 1rem' }}>
              <div style={{ fontSize: '.65rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.25rem' }}>Cash</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{cashDisplay}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,.03)', borderRadius: 10, padding: '.75rem 1rem' }}>
              <div style={{ fontSize: '.65rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.25rem' }}>Buying Power</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{buyingPowerDisplay}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,.03)', borderRadius: 10, padding: '.75rem 1rem' }}>
              <div style={{ fontSize: '.65rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.25rem' }}>Total Equity</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{equityDisplay}</div>
            </div>
          </div>
        )}

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
              This is your Kraken trading account balance. Your funds remain in your brokerage.
              When you invest in agents, they trade on your behalf using this capital.
            </>
          ) : (
            <>
              Connect your trading account to see your balance and invest in trading agents.
              Your capital stays in your brokerage — ASE only executes trades.
            </>
          )}
        </div>
      </div>

      {showConnect && (
        <AccountConnectModal
          onClose={() => setShowConnect(false)}
          onSuccess={() => {
            fetchBalance()
          }}
        />
      )}
    </>
  )
}