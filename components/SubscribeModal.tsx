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
  const [balance, setBalance]         = useState<number | null>(null)
  const [amount, setAmount]           = useState(100)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [fetching, setFetching]       = useState(true)
  const [agreed, setAgreed]           = useState(false)
  const [connected, setConnected]     = useState(false)
  const [tradeResult, setTradeResult] = useState<{ order_id?: string; filled_qty?: number; fill_price?: number } | null>(null)

  useEffect(() => {
    fetch('/api/account/balance')
      .then(r => r.json())
      .then(d => {
        const cashCents = d.cash_cents ?? 0
        const availableCents = d.available_cents ?? cashCents
        if (d.error) {
          setError(d.error)
          setBalance(0)
          setConnected(false)
        } else if (d.status === 'connected' && cashCents > 0) {
          setBalance(availableCents > 0 ? availableCents : cashCents)
          setConnected(true)
        } else {
          setBalance(0)
          setConnected(d.status === 'connected')
        }
      })
      .catch(() => { setBalance(0); setConnected(false) })
      .finally(() => setFetching(false))
  }, [])

  const maxAmount = balance !== null ? Math.floor(balance / 100) : 0
  const cappedAmount = Math.min(Math.max(amount, 1), Math.max(maxAmount, 1))
  const canSubmit = agreed && cappedAmount >= 1 && !loading && balance !== null && balance >= 100

  async function handleSubscribe() {
    if (!canSubmit) return
    setLoading(true)
    setError('')
    setTradeResult(null)

    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId, amount_cents: Math.round(cappedAmount * 100) }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.redirect) { router.push(data.redirect); return }
        throw new Error(data.error || 'Subscription failed')
      }
      if (data.trade) setTradeResult(data.trade)
      router.refresh()
      onSuccess?.()
      if (!data.trade) onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Subscription failed')
    } finally {
      setLoading(false)
    }
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(4,3,12,.92)', backdropFilter: 'blur(24px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
  }

  if (fetching) {
    return (
      <div onClick={onClose} style={overlay}>
        <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '.9rem' }}>
          Connecting to Kraken…
        </div>
      </div>
    )
  }

  // ── Trade confirmed screen ─────────────────────────────────────────────────
  if (tradeResult) {
    return (
      <div onClick={onClose} style={overlay}>
        <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid rgba(22,199,132,.25)', borderRadius: 20, padding: '2.5rem', width: '100%', maxWidth: 440, textAlign: 'center', boxShadow: '0 40px 80px rgba(0,0,0,.8)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✓</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '.5rem', color: 'var(--mint)' }}>Trade Executed!</h2>
          <p style={{ color: 'var(--muted)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
            Your ${cappedAmount} was invested in <strong style={{ color: 'var(--white)' }}>{agentName}</strong> and a live order was placed on your Kraken account.
          </p>
          {tradeResult.order_id && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '1rem', marginBottom: '1.5rem', textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.35rem' }}>
                <span style={{ color: 'var(--faint)' }}>ORDER ID</span>
                <span style={{ color: 'var(--white)' }}>{String(tradeResult.order_id).slice(0, 16)}…</span>
              </div>
              {tradeResult.filled_qty && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.35rem' }}>
                  <span style={{ color: 'var(--faint)' }}>FILLED QTY</span>
                  <span style={{ color: 'var(--mint)' }}>{Number(tradeResult.filled_qty).toFixed(6)}</span>
                </div>
              )}
              {tradeResult.fill_price && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--faint)' }}>FILL PRICE</span>
                  <span style={{ color: 'var(--white)' }}>${Number(tradeResult.fill_price).toLocaleString()}</span>
                </div>
              )}
            </div>
          )}
          <button onClick={onClose} style={{ width: '100%', padding: '.85rem', borderRadius: 12, border: 'none', background: 'var(--mint)', color: '#000', fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}>
            View Dashboard →
          </button>
        </div>
      </div>
    )
  }

  // ── Not connected ─────────────────────────────────────────────────────────
  if (!connected) {
    return (
      <div onClick={onClose} style={overlay}>
        <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid rgba(88,65,212,.3)', borderRadius: 20, padding: '2.5rem', width: '100%', maxWidth: 480, textAlign: 'center', boxShadow: '0 40px 80px rgba(0,0,0,.8)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🐙</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '.75rem' }}>Connect Kraken First</h2>
          <p style={{ color: 'var(--muted)', marginBottom: '1rem', lineHeight: 1.65 }}>
            To invest in trading agents, you need to connect your Kraken API keys. ASE will trade directly on your Kraken account.
          </p>
          <p style={{ fontSize: '.82rem', color: 'var(--faint)', marginBottom: '2rem' }}>
            Takes 2 minutes — generate read+trade keys on Kraken, paste them in.
          </p>
          <div style={{ display: 'flex', gap: '.75rem' }}>
            <button onClick={onClose} style={{ flex: 1, padding: '.75rem', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '.82rem', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={() => router.push('/dashboard/connect/kraken')} style={{ flex: 2, padding: '.75rem', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#5741D9,#7B64FF)', color: '#fff', fontWeight: 700, fontSize: '.88rem', cursor: 'pointer' }}>
              Connect Kraken →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Insufficient balance ──────────────────────────────────────────────────
  if (connected && balance !== null && balance < 100) {
    return (
      <div onClick={onClose} style={overlay}>
        <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 20, padding: '2.5rem', width: '100%', maxWidth: 480, textAlign: 'center', boxShadow: '0 40px 80px rgba(0,0,0,.8)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>💸</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '.75rem' }}>No USD on Kraken</h2>
          <p style={{ color: 'var(--muted)', marginBottom: '1.5rem', lineHeight: 1.65 }}>
            Your Kraken account balance is ${(balance / 100).toFixed(2)}. Add USD to your Kraken account to start investing.
          </p>
          <p style={{ fontSize: '.78rem', color: 'var(--faint)', marginBottom: '2rem' }}>
            Minimum investment is $1. Deposit USD on Kraken, then come back here.
          </p>
          <button onClick={onClose} style={{ width: '100%', padding: '.85rem', borderRadius: 12, border: 'none', background: '#3b7eff', color: 'white', fontWeight: 700, cursor: 'pointer' }}>
            Got it
          </button>
        </div>
      </div>
    )
  }

  // ── Main invest modal ──────────────────────────────────────────────────────
  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid rgba(59,127,255,.2)', borderRadius: 20, padding: '2.5rem', width: '100%', maxWidth: 480, boxShadow: '0 40px 80px rgba(0,0,0,.8)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, marginBottom: '.25rem' }}>Allocate Funds</h2>
            <p style={{ fontSize: '.85rem', color: 'var(--muted)', margin: 0 }}>{agentName}</p>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid var(--border)', borderRadius: 9, width: 36, height: 36, cursor: 'pointer', color: 'var(--faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
            ×
          </button>
        </div>

        {/* Kraken Balance */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', background: 'rgba(88,65,212,0.08)', border: '1px solid rgba(88,65,212,0.25)', borderRadius: 14, padding: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#5841d4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 13, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>K</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.25rem' }}>KRAKEN USD BALANCE</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 900, color: '#7B64FF', lineHeight: 1 }}>
              ${maxAmount.toLocaleString()}
            </div>
          </div>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--mint)', boxShadow: '0 0 6px var(--mint)', animation: 'pulse 2s infinite', flexShrink: 0 }} />
        </div>

        {/* Amount Slider */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.75rem' }}>
            <label style={{ fontWeight: 700, fontSize: '1rem' }}>Amount to Invest</label>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 900, color: '#3b7eff' }}>
              ${cappedAmount.toFixed(0)}
            </span>
          </div>

          <input type="range" min="1" max={Math.max(maxAmount, 1)} step="1" value={cappedAmount}
            onChange={e => setAmount(parseInt(e.target.value))} disabled={loading}
            style={{ width: '100%', height: 8, borderRadius: 4, background: 'var(--border)', outline: 'none', WebkitAppearance: 'none', cursor: 'pointer', accentColor: '#3b7eff' }} />

          <div style={{ display: 'flex', gap: '.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            {[1, 5, 25, 50, 100, 250, 500].filter(v => v <= maxAmount).map(v => (
              <button key={v} onClick={() => setAmount(v)} disabled={loading}
                style={{ padding: '.45rem .9rem', borderRadius: 8, border: `2px solid ${cappedAmount === v ? '#3b7eff' : 'var(--border)'}`, background: cappedAmount === v ? 'rgba(59,127,255,.1)' : 'transparent', color: cappedAmount === v ? '#7aacff' : 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '.8rem', fontWeight: 600, cursor: 'pointer', transition: 'all .15s' }}>
                ${v}
              </button>
            ))}
            {maxAmount > 0 && (
              <button onClick={() => setAmount(maxAmount)} disabled={loading}
                style={{ padding: '.45rem .9rem', borderRadius: 8, border: `2px solid ${cappedAmount === maxAmount ? '#3b7eff' : 'var(--border)'}`, background: cappedAmount === maxAmount ? 'rgba(59,127,255,.1)' : 'transparent', color: cappedAmount === maxAmount ? '#7aacff' : 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '.8rem', fontWeight: 600, cursor: 'pointer' }}>
                MAX
              </button>
            )}
          </div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '.68rem', color: 'var(--faint)', marginTop: '.65rem' }}>
            Min: $1 · Available: ${maxAmount.toLocaleString()} · Trades execute on your Kraken account
          </p>
        </div>

        {/* Risk acknowledgment */}
        <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 12, padding: '1rem', marginBottom: '1.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '.6rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} disabled={loading}
              style={{ marginTop: '.2rem', cursor: 'pointer', width: 18, height: 18, accentColor: '#3b7eff' }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '.88rem', marginBottom: '.3rem', color: '#fb7185' }}>Real USD Risk Acknowledgment</div>
              <div style={{ fontSize: '.78rem', color: 'var(--muted)', lineHeight: 1.65 }}>
                This allocates real USD from my Kraken account. An AI agent will trade on my behalf. Algorithmic trading involves substantial risk — I may lose my entire investment. Past performance does not guarantee future results.
              </div>
            </div>
          </label>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 10, padding: '.75rem 1rem', marginBottom: '1rem', fontFamily: 'var(--font-mono)', fontSize: '.8rem', color: '#fb7185' }}>
            {error}
          </div>
        )}

        <button onClick={handleSubscribe} disabled={!canSubmit}
          style={{ width: '100%', padding: '1rem', borderRadius: 12, border: 'none', background: canSubmit ? 'linear-gradient(135deg,#3b7eff,#5741D9)' : 'rgba(59,127,255,.3)', color: 'white', fontWeight: 700, fontSize: '1rem', cursor: canSubmit ? 'pointer' : 'not-allowed', transition: 'all .2s', opacity: canSubmit ? 1 : 0.6 }}
          onMouseEnter={e => { if (canSubmit) (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 32px rgba(59,127,255,.4)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}>
          {loading ? '🔄 Placing order on Kraken…' : `Invest $${cappedAmount.toFixed(0)} on Kraken`}
        </button>

        <p style={{ fontSize: '.72rem', color: 'var(--faint)', textAlign: 'center', marginTop: '.85rem' }}>
          🐙 Order routes directly to your Kraken account · ASE never holds your funds
        </p>

        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
      </div>
    </div>
  )
}
