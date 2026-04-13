'use client'

import { useState, useEffect } from 'react'

interface Holding {
  id: string
  agent_id: string
  agent_name?: string
  shares: number
  invested_cents: number
  current_value_cents: number
  pnl_cents: number
}

interface InvestmentTerminalProps {
  agentId?: string
  agentName?: string
  existingHolding?: Holding | null
  navCents?: number
  onClose: () => void
  onSuccess?: (result: { action: 'buy' | 'sell'; shares: number; amount: number }) => void
}

export default function InvestmentTerminal({ 
  agentId, 
  agentName, 
  existingHolding, 
  navCents = 10000,
  onClose, 
  onSuccess 
}: InvestmentTerminalProps) {
  const [balance, setBalance] = useState<number | null>(null)
  const [accountStatus, setAccountStatus] = useState<string>('loading')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [mode, setMode] = useState<'buy' | 'sell'>(existingHolding && existingHolding.invested_cents > 0 ? 'sell' : 'buy')
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    fetch('/api/account/balance').then(r => r.json()).then(d => {
      setBalance((d.equity_cents ?? d.cash_cents ?? 0) / 100)
      setAccountStatus(d.status ?? 'connected')
    }).catch(() => { setBalance(0); setAccountStatus('error') }).finally(() => setFetching(false))
  }, [])

  const amountNum = parseFloat(amount) || 0
  const maxBuy = balance !== null ? Math.floor(balance) : 0
  const maxSell = existingHolding ? Math.floor(existingHolding.invested_cents / 100) : 0
  
  const isValidAmount = mode === 'buy' 
    ? amountNum >= 10 && amountNum <= maxBuy 
    : amountNum >= 10 && amountNum <= maxSell

  const projectedShares = navCents > 0 ? (amountNum * 100) / navCents : 0

  async function handleSubmit() {
    if (!isValidAmount) return
    if (!agentId) {
      setMsg('No agent selected')
      return
    }

    setLoading(true)
    setMsg('')

    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          agent_id: agentId, 
          amount_cents: Math.round(amountNum * 100),
          action: mode 
        })
      })
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Transaction failed')
      }
      
      onSuccess?.({ action: mode, shares: data.shares, amount: amountNum })
      onClose()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Transaction failed')
    }
    
    setLoading(false)
  }

  const notConnected = accountStatus === 'not_connected' || accountStatus === 'error'

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(4,3,12,.95)', backdropFilter: 'blur(20px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16,
        padding: '1.5rem', width: '100%', maxWidth: 440
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--muted)', letterSpacing: '0.1em' }}>INVESTMENT TERMINAL</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '0.25rem' }}>
              {agentName || 'Portfolio'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.25rem' }}>x</button>
        </div>

        {/* Balance Display */}
        <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--muted)', letterSpacing: '0.08em' }}>AVAILABLE BALANCE</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, color: fetching ? 'var(--faint)' : notConnected ? 'var(--red)' : 'var(--white)' }}>
                {fetching ? '...' : notConnected ? 'Not Connected' : `$${balance?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}`}
              </div>
            </div>
            {existingHolding && existingHolding.invested_cents > 0 && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--muted)', letterSpacing: '0.08em' }}>INVESTED</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 600, color: 'var(--blue)' }}>
                  ${(existingHolding.invested_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: existingHolding.pnl_cents >= 0 ? 'var(--mint)' : 'var(--red)' }}>
                  {existingHolding.pnl_cents >= 0 ? '+' : ''}${((existingHolding.pnl_cents || 0) / 100).toFixed(2)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mode Toggle */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <button
            onClick={() => setMode('buy')}
            disabled={!agentId}
            style={{
              flex: 1, padding: '0.75rem', borderRadius: 10, border: 'none',
              background: mode === 'buy' ? 'var(--mint)' : 'var(--bg3)',
              color: mode === 'buy' ? 'var(--bg)' : 'var(--muted)',
              fontWeight: 600, cursor: agentId ? 'pointer' : 'not-allowed',
              opacity: agentId ? 1 : 0.5
            }}
          >
            BUY / INVEST
          </button>
          <button
            onClick={() => setMode('sell')}
            disabled={!existingHolding || existingHolding.invested_cents <= 0}
            style={{
              flex: 1, padding: '0.75rem', borderRadius: 10, border: 'none',
              background: mode === 'sell' ? 'var(--red)' : 'var(--bg3)',
              color: mode === 'sell' ? 'white' : existingHolding && existingHolding.invested_cents > 0 ? 'var(--muted)' : 'var(--faint)',
              fontWeight: 600, cursor: existingHolding && existingHolding.invested_cents > 0 ? 'pointer' : 'not-allowed',
              opacity: existingHolding && existingHolding.invested_cents > 0 ? 1 : 0.5
            }}
          >
            SELL / EXIT
          </button>
        </div>

        {/* Amount Input */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--faint)', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>
            {mode === 'buy' ? 'INVEST AMOUNT (USD)' : 'EXIT AMOUNT (USD)'}
          </label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', fontSize: '1.25rem', color: 'var(--muted)' }}>$</span>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              min={0}
              style={{
                width: '100%', padding: '0.85rem 1rem 0.85rem 2rem',
                borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg3)',
                color: 'white', fontSize: '1.25rem', fontFamily: 'var(--font-mono)', fontWeight: 600
              }}
            />
          </div>
          
          {/* Quick amounts */}
          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.75rem' }}>
            {mode === 'buy' ? (
              <>
                {[100, 500, 1000, 5000].filter(v => v <= maxBuy).map(v => (
                  <button
                    key={v}
                    onClick={() => setAmount(String(v))}
                    disabled={v > maxBuy}
                    style={{
                      flex: 1, padding: '0.4rem', borderRadius: 6, border: '1px solid var(--border)',
                      background: amount === String(v) ? 'var(--blue)' : 'transparent',
                      color: amount === String(v) ? 'white' : v > maxBuy ? 'var(--faint)' : 'var(--muted)',
                      fontSize: '0.7rem', cursor: v <= maxBuy ? 'pointer' : 'not-allowed',
                      fontFamily: 'var(--font-mono)'
                    }}
                  >
                    ${v >= 1000 ? `${v/1000}k` : v}
                  </button>
                ))}
                {maxBuy > 0 && (
                  <button
                    onClick={() => setAmount(String(maxBuy))}
                    style={{
                      flex: 1, padding: '0.4rem', borderRadius: 6, border: '1px solid var(--border)',
                      background: amount === String(maxBuy) ? 'var(--blue)' : 'transparent',
                      color: amount === String(maxBuy) ? 'white' : 'var(--muted)',
                      fontSize: '0.7rem', cursor: 'pointer', fontFamily: 'var(--font-mono)'
                    }}
                  >
                    MAX
                  </button>
                )}
              </>
            ) : (
              <>
                {[100, 500, 'half', 'all'].map(v => {
                  const val = v === 'half' ? Math.floor(maxSell / 2) : v === 'all' ? maxSell : v as number
                  const label = v === 'half' ? 'HALF' : v === 'all' ? 'ALL' : `$${v}`
                  return (
                    <button
                      key={String(v)}
                      onClick={() => setAmount(String(val))}
                      disabled={val <= 0}
                      style={{
                        flex: 1, padding: '0.4rem', borderRadius: 6, border: '1px solid var(--border)',
                        background: amount === String(val) ? 'var(--red)' : 'transparent',
                        color: amount === String(val) ? 'white' : val <= 0 ? 'var(--faint)' : 'var(--muted)',
                        fontSize: '0.65rem', cursor: val > 0 ? 'pointer' : 'not-allowed',
                        fontFamily: 'var(--font-mono)'
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </>
            )}
          </div>
        </div>

        {/* Projected Shares */}
        {amountNum > 0 && isValidAmount && (
          <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '0.85rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
              <span style={{ color: 'var(--muted)' }}>Projected Shares</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{projectedShares.toFixed(4)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
              <span style={{ color: 'var(--muted)' }}>NAV per Share</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${(navCents / 100).toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Error Message */}
        {msg && (
          <div style={{ padding: '0.75rem', borderRadius: 8, background: 'rgba(255,90,95,0.1)', color: 'var(--red)', fontSize: '0.8rem', marginBottom: '1rem' }}>
            {msg}
          </div>
        )}

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={loading || !isValidAmount || notConnected}
          style={{
            width: '100%', padding: '1rem', borderRadius: 10, border: 'none',
            background: loading ? 'var(--border)' : mode === 'buy' ? 'var(--mint)' : 'var(--red)',
            color: loading ? 'var(--faint)' : mode === 'buy' ? 'var(--bg)' : 'white',
            fontWeight: 700, cursor: loading || !isValidAmount || notConnected ? 'not-allowed' : 'pointer',
            opacity: loading || !isValidAmount || notConnected ? 0.6 : 1,
            fontSize: '0.95rem'
          }}
        >
          {loading ? 'Processing...' : notConnected 
            ? 'Connect Account to Invest' 
            : mode === 'buy' 
              ? `Invest $${amountNum.toFixed(2)}` 
              : `Exit $${amountNum.toFixed(2)}`
          }
        </button>

        <div style={{ marginTop: '1rem', fontSize: '0.65rem', color: 'var(--faint)', textAlign: 'center' }}>
          {mode === 'buy' 
            ? 'Real USD investment. Returns not guaranteed.'
            : 'Selling exits your position at current NAV.'
          }
        </div>
      </div>
    </div>
  )
}