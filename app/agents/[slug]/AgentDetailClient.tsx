'use client'
import React, { useState, useMemo, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { fmtDate } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Agent {
  id: string; name: string; slug: string; description: string
  strategy_type: string; status: string; alert_level?: string
  drawdown_pct?: number; monthly_fee_cents?: number; subscriber_count?: number
  primary_symbol?: string; backtest_strategy?: string; signal_summary?: string
}
interface Stats {
  id: string; nav_cents: number; total_return_pct: number; sharpe_ratio: number
  max_drawdown_pct: number; win_rate_pct: number; total_trades: number; snapshot_at: string
}
interface Trade {
  id: string; symbol: string; side: string; qty: number
  fill_price: number; filled_at: string; pnl_cents: number
}
interface CachedBacktestStats {
  symbol: string; strategy: string; period: string; computed_at: string
  stats: BacktestStats; buyHold: { totalReturnPct: number }
  equityCurve: Array<{ date: string; equity: number }>
  buyHoldCurve: Array<{ date: string; equity: number }>
}
interface BacktestStats {
  totalReturnPct: number; annualizedReturnPct: number; sharpeRatio: number
  maxDrawdownPct: number; winRate: number; totalTrades: number
  bestTradePct: number; worstTradePct: number; calmarRatio: number
}
interface BacktestBar { date: string; equity: number }
interface BacktestResult {
  stats: BacktestStats; bars: BacktestBar[]; buyHold: BacktestBar[]
  symbol: string; period: string
}
interface MCResult {
  start: string; end: string; bars: number; strategyReturn: number; marketReturn: number
  excessReturn: number; sharpe: number; maxDrawdown: number; winRate: number; totalTrades: number
}
interface MCSummary {
  nTrials: number; windowDays: number; medianReturn: number; meanReturn: number
  medianExcess: number; meanExcess: number; medianSharpe: number; beatRate: number
  medianDrawdown: number; p10Return: number; p90Return: number; results: MCResult[]
}
interface UserHolding {
  id: string; shares: number; invested_cents: number
  current_value_cents: number; pnl_cents: number; status: string
}
interface Props {
  agent: Agent; statsHistory: Stats[]; latestStats: Stats | null
  trades: Trade[]; isLoggedIn: boolean; isSubscribed: boolean
  cachedBacktestStats: CachedBacktestStats | null; initialHolding?: UserHolding | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = ['Overview', 'Performance', 'Live', 'Backtest', 'Trades', 'Activity', 'Thinking', 'Strategy', 'Monte Carlo'] as const
type Tab = typeof TABS[number]

const strategyDescriptions: Record<string, string> = {
  momentum: 'Weekly rebalance targeting highest-momentum assets. Position-size capped per holding.',
  mean_reversion: 'Enters when RSI drops below oversold levels on large-cap assets. Exits on RSI recovery or profit target.',
  trend_following: 'Classic EMA crossover system. Long when fast EMA crosses above slow EMA, flat otherwise.',
  crypto_momentum: 'BTC/ETH momentum with EMA crossovers, MACD confirmation, and RSI filters.',
  crypto_mean_reversion: 'Statistical arbitrage using Bollinger Band and Z-score mean reversion.',
}

const strategyColor: Record<string, string> = {
  momentum: '#3b7eff', mean_reversion: '#16c784', trend_following: '#7c5cff',
  crypto_momentum: '#f59e0b', crypto_mean_reversion: '#06b6d4',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fP = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
const col = (v: number) => v >= 0 ? 'var(--green)' : 'var(--red)'
const fmt$ = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ─── UI atoms ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '.7rem .9rem' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: 'var(--faint)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '.28rem' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 700, color: color ?? 'var(--white)', letterSpacing: '-.01em' }}>{value}</div>
      {sub && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.46rem', color: 'var(--faint)', marginTop: '.12rem' }}>{sub}</div>}
    </div>
  )
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,.025)', border: '1px solid var(--border)', borderRadius: 7, padding: '.38rem .5rem' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.44rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.08rem' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.76rem', fontWeight: 700, color: color ?? 'var(--white)' }}>{value}</div>
    </div>
  )
}

// ─── Invest Modal ─────────────────────────────────────────────────────────────

function InvestModal({ agentId, agentName, navCents, onClose, onSuccess }: {
  agentId: string; agentName: string; navCents: number
  onClose: () => void; onSuccess: (result: { shares: number; amount: number }) => void
}) {
  const [balance, setBalance] = useState<number | null>(null)
  const [accountStatus, setAccountStatus] = useState<string>('loading')
  const [amount, setAmount] = useState(50)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    fetch('/api/account/balance').then(r => r.json()).then(d => {
      setBalance(d.equity_cents ?? 0)
      setAccountStatus(d.status === 'connected' ? 'connected' : 'not_connected')
    }).catch(() => { setBalance(0); setAccountStatus('error') }).finally(() => setFetching(false))
  }, [])

  const notConnected = accountStatus === 'not_connected'
  const maxAmount = balance !== null ? Math.floor(balance / 100) : 0
  const cappedAmount = Math.min(Math.max(amount, 0), maxAmount)
  const projectedShares = navCents > 0 ? (cappedAmount * 100) / navCents : 0
  const sharePriceUsd = (navCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  async function handleInvest() {
    if (cappedAmount < 1) { setMsg('Minimum $1'); return }
    setLoading(true); setMsg('')
    try {
      const res = await fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_id: agentId, amount_cents: Math.round(cappedAmount * 100) }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Purchase failed')
      onSuccess({ shares: data.shares, amount: cappedAmount })
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Investment failed')
    }
    setLoading(false)
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(4,3,12,.92)', backdropFilter: 'blur(24px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0d0d14', border: '1px solid rgba(59,127,255,.28)', borderRadius: 16, width: '100%', maxWidth: 420, boxShadow: '0 48px 96px rgba(0,0,0,.8), 0 0 0 1px rgba(255,255,255,.04)' }}>

        {/* Header bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--blue)', boxShadow: '0 0 6px var(--blue)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', letterSpacing: '.12em', textTransform: 'uppercase' }}>Market Buy · {agentName}</span>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 7, width: 28, height: 28, cursor: 'pointer', color: 'var(--faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.75rem' }}>✕</button>
        </div>

        <div style={{ padding: '1.25rem' }}>
          {/* Share price ticker */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem', marginBottom: '1.1rem' }}>
            <div style={{ background: 'rgba(59,127,255,.06)', border: '1px solid rgba(59,127,255,.14)', borderRadius: 10, padding: '.65rem .85rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.44rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.28rem' }}>SHARE PRICE (NAV)</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.05rem', fontWeight: 700, color: 'var(--blue2)', letterSpacing: '-.01em' }}>${sharePriceUsd}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 10, padding: '.65rem .85rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.44rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.28rem' }}>AVAILABLE CASH</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.05rem', fontWeight: 700, color: fetching ? 'var(--faint)' : (notConnected ? 'var(--red)' : 'var(--white)'), letterSpacing: '-.01em' }}>
                {fetching ? '—' : notConnected ? 'Not Connected' : fmt$(balance ?? 0)}
              </div>
            </div>
          </div>

          {notConnected ? (
            <div style={{ padding: '.5rem 0' }}>
              <p style={{ color: 'var(--muted)', fontSize: '.82rem', marginBottom: '1rem', lineHeight: 1.6, textAlign: 'center' }}>
                Connect your Kraken API keys to invest. Trades execute live on your account.
              </p>
              <a href="/dashboard/connect/kraken" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem', padding: '.75rem 1.5rem', borderRadius: 10, border: 0, background: 'linear-gradient(135deg,#5741D9,#7B64FF)', color: '#fff', fontFamily: 'var(--font-head)', fontSize: '.88rem', fontWeight: 700, textDecoration: 'none' }}>
                Connect Kraken →
              </a>
            </div>
          ) : (
            <>
              {/* Amount input */}
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.46rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.4rem' }}>ORDER SIZE (USD)</div>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '.9rem', top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-mono)', fontSize: '.88rem', color: 'rgba(255,255,255,.3)' }}>$</span>
                  <input type="number" value={amount} min={1} max={maxAmount} onChange={e => setAmount(Number(e.target.value))} style={{ width: '100%', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: '.72rem 1rem .72rem 1.65rem', color: 'var(--white)', fontFamily: 'var(--font-mono)', fontSize: '1rem', outline: 'none', boxSizing: 'border-box', letterSpacing: '-.01em' }} />
                </div>
                <div style={{ display: 'flex', gap: '.3rem', marginTop: '.4rem' }}>
                  {[25, 50, 100, 'MAX'].map(v => {
                    const val = v === 'MAX' ? maxAmount : v as number
                    const active = amount === val
                    return (
                      <button key={v} onClick={() => setAmount(val)} disabled={val > maxAmount} style={{ flex: 1, padding: '.3rem', background: active ? 'rgba(59,127,255,.15)' : 'rgba(255,255,255,.03)', border: `1px solid ${active ? 'rgba(59,127,255,.35)' : 'rgba(255,255,255,.07)'}`, borderRadius: 7, color: active ? 'var(--blue2)' : 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.54rem', cursor: val > maxAmount ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: val > maxAmount ? 0.35 : 1 }}>{v === 'MAX' ? 'MAX' : `$${v}`}</button>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: '.3rem', marginTop: '.3rem' }}>
                  {[10, 25, 50].map(pct => (
                    <button key={pct} onClick={() => setAmount(Math.floor(maxAmount * pct / 100))} disabled={maxAmount < 1} style={{ flex: 1, padding: '.24rem', background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 6, color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.5rem', cursor: maxAmount < 1 ? 'not-allowed' : 'pointer', opacity: maxAmount < 1 ? 0.35 : 1 }}>{pct}%</button>
                  ))}
                </div>
              </div>

              {/* Order summary */}
              <div style={{ background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 10, padding: '.75rem .9rem', marginBottom: '1rem' }}>
                {[
                  ['Order type', 'Market'],
                  ['Share price', `$${sharePriceUsd}`],
                  ['Shares to receive', projectedShares.toFixed(6)],
                  ['Total cost', `$${cappedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
                ].map(([k, v], i, arr) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: i < arr.length - 1 ? '.32rem' : 0, paddingBottom: i < arr.length - 1 ? '.32rem' : 0, borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,.05)' : 'none' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: 'var(--faint)', letterSpacing: '.07em' }}>{k}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', fontWeight: 700, color: k === 'Total cost' ? 'var(--white)' : 'var(--muted)' }}>{v}</span>
                  </div>
                ))}
              </div>

              {msg && <div style={{ marginBottom: '.8rem', padding: '.6rem .85rem', background: 'rgba(242,54,69,.08)', border: '1px solid rgba(242,54,69,.2)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--red)' }}>{msg}</div>}

              <button onClick={handleInvest} disabled={loading || fetching || cappedAmount < 1} style={{ width: '100%', padding: '.8rem', borderRadius: 10, border: 0, background: cappedAmount >= 1 ? 'linear-gradient(135deg, var(--blue), #5741D9)' : 'rgba(255,255,255,.05)', color: '#fff', fontFamily: 'var(--font-head)', fontSize: '.88rem', fontWeight: 700, cursor: loading || fetching || cappedAmount < 1 ? 'not-allowed' : 'pointer', opacity: loading || fetching || cappedAmount < 1 ? .45 : 1, letterSpacing: '-.01em', transition: 'opacity .15s' }}>
                {loading ? 'Placing order...' : `Buy ${projectedShares.toFixed(4)} shares · $${cappedAmount}`}
              </button>
              <div style={{ marginTop: '.75rem', fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: 'var(--faint)', lineHeight: 1.7, textAlign: 'center' }}>
                Market order · executes immediately on Kraken · algorithmic trading involves risk of loss
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Deallocate Modal ─────────────────────────────────────────────────────────

function DeallocateModal({ holding, agentName, navCents, primarySymbol, onClose, onSuccess }: {
  holding: UserHolding; agentName: string; navCents: number; primarySymbol?: string
  onClose: () => void; onSuccess: (returnedCents: number) => void
}) {
  const maxShares = holding.shares
  const [sharesToSell, setSharesToSell] = useState(maxShares)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  const sellShares = Math.min(sharesToSell, maxShares)
  const sellValue = Math.round(sellShares * navCents)
  const pctToSell = maxShares > 0 ? Math.round((sellShares / maxShares) * 100) : 0
  const pnl = holding.pnl_cents
  const baseAsset = primarySymbol ? primarySymbol.replace(/-USD$/, '') : 'crypto'
  const isFullSell = pctToSell >= 100

  async function handleSell() {
    setLoading(true); setMsg('')
    try {
      const res = await fetch('/api/holdings/sell', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ holding_id: holding.id, shares_to_sell: sellShares }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onSuccess(data.returned_cents)
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed') }
    setLoading(false)
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(4,3,12,.92)', backdropFilter: 'blur(24px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0d0d14', border: '1px solid rgba(242,54,69,.24)', borderRadius: 16, width: '100%', maxWidth: 420, boxShadow: '0 48px 96px rgba(0,0,0,.8), 0 0 0 1px rgba(255,255,255,.04)' }}>

        {/* Header bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--red)', boxShadow: '0 0 6px var(--red)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', letterSpacing: '.12em', textTransform: 'uppercase' }}>Market Sell · {agentName}</span>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 7, width: 28, height: 28, cursor: 'pointer', color: 'var(--faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.75rem' }}>✕</button>
        </div>

        <div style={{ padding: '1.25rem' }}>
          {/* Position summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem', marginBottom: '1rem' }}>
            <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 10, padding: '.65rem .85rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.44rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.28rem' }}>POSITION VALUE</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.05rem', fontWeight: 700, color: 'var(--white)' }}>{fmt$(holding.current_value_cents)}</div>
            </div>
            <div style={{ background: pnl >= 0 ? 'rgba(22,199,132,.05)' : 'rgba(242,54,69,.05)', border: `1px solid ${pnl >= 0 ? 'rgba(22,199,132,.14)' : 'rgba(242,54,69,.14)'}`, borderRadius: 10, padding: '.65rem .85rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.44rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.28rem' }}>UNREALIZED P&L</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.05rem', fontWeight: 700, color: pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{pnl >= 0 ? '+' : ''}{fmt$(pnl)}</div>
            </div>
          </div>

          {/* Shares slider */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.46rem', color: 'var(--faint)', letterSpacing: '.1em' }}>SHARES TO SELL</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--muted)' }}>{sellShares.toFixed(4)} / {maxShares.toFixed(4)}</div>
            </div>
            <input type="range" value={sellShares} min={0} max={maxShares} step={maxShares / 1000} onChange={e => { setSharesToSell(Number(e.target.value)); setConfirmed(false) }} style={{ width: '100%', accentColor: 'var(--red)', marginBottom: '.4rem' }} />
            <div style={{ display: 'flex', gap: '.3rem' }}>
              {[25, 50, 75, 100].map(pct => (
                <button key={pct} onClick={() => { setSharesToSell(maxShares * pct / 100); setConfirmed(false) }} style={{ flex: 1, padding: '.3rem', background: pctToSell === pct ? 'rgba(242,54,69,.15)' : 'rgba(255,255,255,.03)', border: `1px solid ${pctToSell === pct ? 'rgba(242,54,69,.3)' : 'rgba(255,255,255,.07)'}`, borderRadius: 7, color: pctToSell === pct ? 'var(--red)' : 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.54rem', cursor: 'pointer', fontWeight: 600 }}>{pct}%</button>
              ))}
            </div>
          </div>

          {/* Market sell warning */}
          <div style={{ background: 'rgba(245,158,11,.05)', border: '1px solid rgba(245,158,11,.18)', borderRadius: 10, padding: '.7rem .9rem', marginBottom: '1rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: '#f59e0b', fontWeight: 700, letterSpacing: '.06em', marginBottom: '.28rem' }}>MARKET ORDER — EXECUTES IMMEDIATELY</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--muted)', lineHeight: 1.6 }}>
              {isFullSell
                ? `All ${baseAsset} positions acquired by this agent will be sold at the current market price. Estimated proceeds: ${fmt$(sellValue)}.`
                : `${pctToSell}% of your ${baseAsset} position will be sold at market price. Estimated proceeds: ${fmt$(sellValue)}.`
              }
            </div>
          </div>

          {/* Order summary */}
          <div style={{ background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 10, padding: '.75rem .9rem', marginBottom: '1rem' }}>
            {[
              ['Order type', 'Market'],
              ['Shares selling', sellShares.toFixed(6)],
              ['Share price (NAV)', fmt$(navCents)],
              ['Est. proceeds', fmt$(sellValue)],
            ].map(([k, v], i, arr) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: i < arr.length - 1 ? '.32rem' : 0, paddingBottom: i < arr.length - 1 ? '.32rem' : 0, borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,.05)' : 'none' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: 'var(--faint)', letterSpacing: '.07em' }}>{k}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', fontWeight: 700, color: k === 'Est. proceeds' ? 'var(--white)' : 'var(--muted)' }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Confirm checkbox for full sell */}
          {isFullSell && (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '.5rem', marginBottom: '.85rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} style={{ marginTop: '.1rem', accentColor: 'var(--red)', width: 14, height: 14, flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.56rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                I understand this will sell all {baseAsset} acquired by this agent at market price and close my position.
              </span>
            </label>
          )}

          {msg && <div style={{ marginBottom: '.8rem', padding: '.6rem .85rem', background: 'rgba(242,54,69,.08)', border: '1px solid rgba(242,54,69,.2)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--red)' }}>{msg}</div>}

          <button
            onClick={handleSell}
            disabled={loading || sellShares <= 0 || (isFullSell && !confirmed)}
            style={{ width: '100%', padding: '.8rem', borderRadius: 10, border: 0, background: 'rgba(242,54,69,.85)', color: '#fff', fontFamily: 'var(--font-head)', fontSize: '.88rem', fontWeight: 700, cursor: loading || sellShares <= 0 || (isFullSell && !confirmed) ? 'not-allowed' : 'pointer', opacity: loading || sellShares <= 0 || (isFullSell && !confirmed) ? .4 : 1, letterSpacing: '-.01em', transition: 'opacity .15s' }}
          >
            {loading ? 'Executing sell...' : `Sell ${pctToSell}% · est. ${fmt$(sellValue)}`}
          </button>
          <div style={{ marginTop: '.75rem', fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: 'var(--faint)', lineHeight: 1.7, textAlign: 'center' }}>
            Market order · fills at current Kraken price · price may differ slightly from estimate
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AgentDetailClient({
  agent, statsHistory, latestStats, trades,
  isLoggedIn, isSubscribed: initialIsSubscribed,
  cachedBacktestStats, initialHolding,
}: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('Overview')
  const [isSubscribed, setIsSubscribed] = useState(initialIsSubscribed)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const [showInvestModal, setShowInvestModal]       = useState(false)
  const [showDeallocateModal, setShowDeallocateModal] = useState(false)
  const [holding, setHolding] = useState<UserHolding | null>(initialHolding ?? null)
  const [statusMsg, setStatusMsg] = useState('')
  const [isWatched, setIsWatched] = useState(false)

  // Backtest
  const [btResult, setBtResult] = useState<BacktestResult | null>(() => {
    if (!cachedBacktestStats) return null
    return { stats: cachedBacktestStats.stats, bars: cachedBacktestStats.equityCurve, buyHold: cachedBacktestStats.buyHoldCurve, symbol: cachedBacktestStats.symbol, period: cachedBacktestStats.period }
  })
  const [btLoading, setBtLoading]     = useState(false)
  const [btError, setBtError]         = useState('')
  const [btPeriod, setBtPeriod]       = useState(cachedBacktestStats?.period ?? '2y')
  const [btRefreshing, setBtRefreshing] = useState(false)

  // Monte Carlo
  const [mcResult, setMcResult]   = useState<MCSummary | null>(null)
  const [mcLoading, setMcLoading] = useState(false)
  const [mcError, setMcError]     = useState('')
  const [mcTrials, setMcTrials]   = useState(80)
  const [mcWindow, setMcWindow]   = useState(180)

  // Period performance
  const [livePerf, setLivePerf]       = useState<Record<string, BacktestResult | null>>({})
  const [livePerfLoading, setLivePerfLoading] = useState<Record<string, boolean>>({})
  const [livePerfErrors, setLivePerfErrors]   = useState<Record<string, string>>({})

  const refreshHolding = useCallback(async () => {
    if (!isLoggedIn) return
    try {
      const res = await fetch(`/api/user/holding?agent_id=${agent.id}`)
      if (res.ok) { const d = await res.json(); setHolding(d.holding) }
    } catch { /* silent */ }
  }, [isLoggedIn, agent.id])

  // Check if in watchlist
  useEffect(() => {
    if (!isLoggedIn || isSubscribed) return
    fetch('/api/watchlist').then(r => r.json()).then(d => {
      const watched = d.watchlist?.some((w: {agent_id: string}) => w.agent_id === agent.id)
      setIsWatched(watched)
    }).catch(() => {})
  }, [isLoggedIn, isSubscribed, agent.id])

  async function toggleWatchlist() {
    if (!isLoggedIn) { router.push(`/login?redirect=/agents/${agent.slug}`); return }
    try {
      const method = isWatched ? 'DELETE' : 'POST'
      await fetch('/api/watchlist', { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ agent_id: agent.id }) })
      setIsWatched(!isWatched)
    } catch {}
  }

  const loadLivePerf = useCallback(async (period: string) => {
    setLivePerfLoading(p => ({ ...p, [period]: true }))
    setLivePerfErrors(p => ({ ...p, [period]: '' }))
    try {
      const res = await fetch(`/api/agent-backtest-history?agent_id=${agent.id}&period=${period}`)
      const d = await res.json()
      if (!res.ok || d.error) throw new Error(d.error ?? 'Fetch failed')
      if (d.data?.length > 0) {
        const h = d.data[0]
        setLivePerf(p => ({ ...p, [period]: { symbol: h.symbol, period: h.period, stats: h.stats, bars: h.equityCurve || [], buyHold: h.buyHoldCurve || [] } }))
      } else if (agent.primary_symbol && agent.backtest_strategy) {
        const fb = await (await fetch('/api/backtest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: agent.primary_symbol, strategy: agent.backtest_strategy, period }) })).json()
        if (!fb.error) setLivePerf(p => ({ ...p, [period]: fb as BacktestResult }))
      }
    } catch (e) { setLivePerfErrors(p => ({ ...p, [period]: e instanceof Error ? e.message : 'Error' })) }
    finally { setLivePerfLoading(p => ({ ...p, [period]: false })) }
  }, [agent.id, agent.primary_symbol, agent.backtest_strategy])

  useEffect(() => { if (agent.id) ['5y', '2y', '1y'].forEach(p => loadLivePerf(p)) }, [agent.id, loadLivePerf])

  async function loadBacktest(period = btPeriod) {
    if (!agent.primary_symbol || !agent.backtest_strategy) { setBtError('No backtest configuration.'); return }
    setBtLoading(true); setBtError('')
    try {
      const res = await fetch('/api/backtest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: agent.primary_symbol, strategy: agent.backtest_strategy, period }) })
      const d = await res.json()
      if (!res.ok || d.error) throw new Error(d.error ?? 'Backtest failed')
      setBtResult(d as BacktestResult)
    } catch (e) { setBtError(e instanceof Error ? e.message : 'Error') }
    finally { setBtLoading(false) }
  }

  async function loadMonteCarlo() {
    if (!agent.primary_symbol || !agent.backtest_strategy) { setMcError('No config.'); return }
    setMcLoading(true); setMcError('')
    try {
      const res = await fetch('/api/backtest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: agent.primary_symbol, strategy: agent.backtest_strategy, period: '10y', monteCarlo: true, nTrials: mcTrials, windowDays: mcWindow, seed: 42 }) })
      const d = await res.json()
      if (!res.ok || d.error) throw new Error(d.error ?? 'MC failed')
      setMcResult(d.monteCarlo as MCSummary)
    } catch (e) { setMcError(e instanceof Error ? e.message : 'Error') }
    finally { setMcLoading(false) }
  }

  async function refreshBacktestStats() {
    setBtRefreshing(true)
    try {
      await fetch('/api/cron/run-backtests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_id: agent.id }) })
      router.refresh()
    } finally { setBtRefreshing(false) }
  }

  function handleTabChange(t: Tab) {
    setTab(t)
    if (t === 'Backtest' && !btResult && !btLoading) loadBacktest()
    if (t === 'Monte Carlo' && !mcResult && !mcLoading) loadMonteCarlo()
  }

  async function handleSubscribe() {
    if (!isLoggedIn) { router.push(`/login?redirect=/agents/${agent.slug}`); return }
    setShowInvestModal(true)
  }

  async function handleUnsubscribe() {
    setLoading(true); setMsg('')
    try {
      const res = await fetch('/api/subscriptions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_id: agent.id }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setIsSubscribed(false); router.refresh()
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : 'Error') }
    setLoading(false)
  }

  // ── Derived values ─────────────────────────────────────────────────────────

  const bt = cachedBacktestStats?.stats
  const ret = latestStats?.total_return_pct ?? bt?.totalReturnPct ?? 0
  const sharpe = latestStats?.sharpe_ratio ?? bt?.sharpeRatio ?? 0
  const maxDD = latestStats?.max_drawdown_pct ?? bt?.maxDrawdownPct ?? 0
  const winRate = latestStats?.win_rate_pct ?? bt?.winRate ?? 0
  const totalTrades = latestStats?.total_trades ?? bt?.totalTrades ?? 0
  const pos = ret >= 0
  const hasBacktestData = !!cachedBacktestStats
  const isLive = !!latestStats
  const monthlyFee = agent.monthly_fee_cents ?? 0
  const subscribers = agent.subscriber_count ?? 0
  const sColor = strategyColor[agent.strategy_type] ?? 'var(--muted)'
  const currentNavCents = latestStats?.nav_cents ?? 10_000
  const chartColor = pos ? '#16c784' : '#f23645'

  const annualizedVolPct = useMemo(() => {
    if (statsHistory.length < 3) return null
    const navs = statsHistory.map(s => s.nav_cents)
    const returns: number[] = []
    for (let i = 1; i < navs.length; i++) {
      if (navs[i - 1] > 0) returns.push((navs[i] - navs[i - 1]) / navs[i - 1])
    }
    if (returns.length < 2) return null
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length
    return Math.sqrt(variance) * Math.sqrt(365) * 100
  }, [statsHistory])

  const perfChartData = useMemo(() => {
    if (cachedBacktestStats?.equityCurve?.length) {
      const step = Math.max(1, Math.floor(cachedBacktestStats.equityCurve.length / 200))
      return cachedBacktestStats.equityCurve.filter((_, i) => i % step === 0).map(p => ({ date: p.date.slice(5), value: p.equity }))
    }
    return statsHistory.map(s => ({ date: fmtDate(s.snapshot_at), value: s.nav_cents / 100 }))
  }, [cachedBacktestStats, statsHistory])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '1.5rem 2rem 4rem', maxWidth: 1260, margin: '0 auto' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginBottom: '1.25rem' }}>
        <Link href="/agents" style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', letterSpacing: '.06em', textDecoration: 'none' }}>
          AGENTS
        </Link>
        <span style={{ color: 'var(--border)', fontSize: '.6rem' }}>/</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--muted)', letterSpacing: '.04em' }}>{agent.name}</span>
      </div>

      {/* Alert banners */}
      {agent.alert_level === 'yellow' && (
        <div style={{ background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 9, padding: '.65rem 1rem', marginBottom: '.75rem', color: '#f59e0b', fontSize: '.78rem', fontFamily: 'var(--font-mono)' }}>
          Soft alert — agent is {agent.drawdown_pct?.toFixed(1)}% below peak NAV. Monitor closely.
        </div>
      )}
      {agent.alert_level === 'hard' && (
        <div style={{ background: 'rgba(242,54,69,.06)', border: '1px solid rgba(242,54,69,.2)', borderRadius: 9, padding: '.65rem 1rem', marginBottom: '.75rem', color: 'var(--red)', fontSize: '.78rem', fontFamily: 'var(--font-mono)' }}>
          Hard alert — 40%+ drawdown. Agent under review. New investments suspended.
        </div>
      )}

      {/* ── 2-column layout: left=content, right=sticky card ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 296px', gap: '1.75rem', alignItems: 'start' }} className="detail-main-grid">

        {/* ── LEFT COLUMN ── */}
        <div>
          {/* Agent identity */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.8rem', marginBottom: '.9rem' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: `${sColor}12`, border: `1.5px solid ${sColor}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '.1rem' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', fontWeight: 800, color: sColor }}>
                {(agent.primary_symbol ?? 'XX').split('-')[0].slice(0, 3)}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.15, marginBottom: '.32rem' }}>{agent.name}</h1>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', alignItems: 'center' }}>
                {agent.primary_symbol && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.56rem', color: 'var(--faint)', letterSpacing: '.05em' }}>{agent.primary_symbol}</span>}
                <span style={{ color: 'var(--border)', fontSize: '.5rem' }}>·</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.54rem', letterSpacing: '.07em', padding: '.1rem .4rem', borderRadius: 4, background: `${sColor}10`, color: sColor, border: `1px solid ${sColor}24` }}>
                  {agent.strategy_type.replace(/_/g, ' ').toUpperCase()}
                </span>
                <span style={{ color: 'var(--border)', fontSize: '.5rem' }}>·</span>
                {isLive
                  ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', padding: '.08rem .38rem', borderRadius: 4, background: 'rgba(22,199,132,.08)', border: '1px solid rgba(22,199,132,.2)', color: 'var(--green)', letterSpacing: '.06em' }}>LIVE</span>
                  : <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', padding: '.08rem .38rem', borderRadius: 4, background: 'rgba(59,127,255,.07)', border: '1px solid rgba(59,127,255,.18)', color: 'var(--blue2)', letterSpacing: '.06em' }}>BACKTEST</span>
                }
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', padding: '.08rem .38rem', borderRadius: 4, background: 'rgba(110,231,183,.07)', border: '1px solid rgba(110,231,183,.18)', color: '#6EE7B7', letterSpacing: '.06em' }}>VERIFIED</span>
              </div>
            </div>
          </div>

          <p style={{ fontSize: '.84rem', color: 'var(--muted)', lineHeight: 1.72, marginBottom: '1.25rem', maxWidth: 560 }}>{agent.description}</p>

          {/* KPI strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: '.45rem', marginBottom: '1.5rem' }} className="kpi-strip">
            <KpiCard label="Total Return" value={fP(ret)} color={pos ? 'var(--green)' : 'var(--red)'} sub={isLive ? 'LIVE' : hasBacktestData ? cachedBacktestStats!.period.toUpperCase() + ' BT' : undefined} />
            <KpiCard label="Sharpe" value={sharpe.toFixed(2)} color={sharpe >= 1.5 ? 'var(--green)' : sharpe >= 0.7 ? 'var(--amber)' : 'var(--red)'} />
            <KpiCard label="Max DD" value={fP(-maxDD)} color="var(--red)" />
            <KpiCard label="Win Rate" value={winRate.toFixed(1) + '%'} color={winRate >= 55 ? 'var(--green)' : winRate >= 45 ? 'var(--amber)' : 'var(--red)'} />
            <KpiCard label="Trades" value={totalTrades.toString()} />
            <KpiCard label="Ann. Vol" value={annualizedVolPct !== null ? annualizedVolPct.toFixed(1) + '%' : 'N/A'} />
          </div>

          {/* Performance chart */}
          {perfChartData.length > 1 && (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 13, padding: '1.1rem 1.2rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.85rem', flexWrap: 'wrap', gap: '.4rem' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '.86rem', letterSpacing: '-.01em' }}>
                    {isLive ? 'Live NAV History' : 'Backtest Equity Curve'}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', marginTop: '.1rem', letterSpacing: '.07em' }}>
                    {hasBacktestData ? `${cachedBacktestStats!.symbol} · ${cachedBacktestStats!.period.toUpperCase()} · $10K INITIAL` : 'LIVE PORTFOLIO NAV'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                  <div style={{ width: 10, height: 2, background: chartColor, borderRadius: 2 }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: 'var(--faint)', letterSpacing: '.08em' }}>STRATEGY</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={perfChartData} margin={{ top: 2, right: 4, bottom: 2, left: -16 }}>
                  <defs>
                    <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartColor} stopOpacity={0.18} />
                      <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fill: 'var(--faint)', fontSize: 9, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: 'var(--faint)', fontSize: 9, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 10 }} labelStyle={{ color: 'var(--faint)' }} formatter={(v: unknown) => [`$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, 'Value']} />
                  <Area type="monotone" dataKey="value" stroke={chartColor} strokeWidth={2} fill="url(#pg)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Tabs */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 13, overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: '.12rem', padding: '.45rem .6rem', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,.1)', overflowX: 'auto' }}>
              {TABS.map(t => (
                <button key={t} onClick={() => handleTabChange(t)} style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', fontWeight: 600, letterSpacing: '.06em', padding: '.35rem .7rem', borderRadius: 6, whiteSpace: 'nowrap', border: `1px solid ${tab === t ? 'rgba(59,127,255,.28)' : 'transparent'}`, color: tab === t ? 'var(--blue2)' : 'var(--faint)', background: tab === t ? 'rgba(59,127,255,.07)' : 'transparent', cursor: 'pointer', transition: 'all .12s' }}>
                  {t.toUpperCase()}
                </button>
              ))}
            </div>

            <div style={{ padding: '1.25rem' }}>

              {/* OVERVIEW */}
              {tab === 'Overview' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.7rem', marginBottom: '.7rem' }} className="tab-grid">
                    {[
                      { title: 'Strategy Logic', body: strategyDescriptions[agent.strategy_type] || 'Systematic algorithmic strategy with defined entry and exit signals based on technical indicators.' },
                      { title: 'Verification', body: 'Methodology disclosure submitted, ledger format validated, out-of-sample test passed. Real-time execution via Kraken.' },
                      { title: 'Execution', body: 'Trades execute on Kraken at real market prices. Positions tracked per subscriber account for accurate P&L attribution.' },
                      { title: 'Investment', body: 'Allocate real USD from your Kraken account to fund the agent. Cancel anytime.' },
                    ].map(({ title, body }) => (
                      <div key={title} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '1rem 1.1rem' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.54rem', fontWeight: 700, letterSpacing: '.1em', color: 'var(--blue2)', marginBottom: '.45rem', textTransform: 'uppercase' }}>{title}</div>
                        <p style={{ fontSize: '.8rem', color: 'var(--muted)', lineHeight: 1.68, margin: 0 }}>{body}</p>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: 'rgba(59,127,255,.04)', border: '1px solid rgba(59,127,255,.12)', borderRadius: 10, padding: '1rem 1.1rem' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.54rem', fontWeight: 700, letterSpacing: '.1em', color: 'var(--blue2)', marginBottom: '.6rem' }}>HOW IT WORKS</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem' }} className="how-grid">
                    {[
                      { n: '01', title: 'Allocate Funds', desc: 'Connect your Kraken account and allocate USD to fund the agent.' },
                      { n: '02', title: 'Agent Trades', desc: 'The algorithm trades on Kraken at real prices. Track P&L in real-time.' },
                      { n: '03', title: 'Track Returns', desc: 'View your holdings and performance in your dashboard anytime.' },
                    ].map(({ n, title, desc }) => (
                        <div key={n}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 800, color: 'rgba(59,127,255,.28)', marginBottom: '.3rem' }}>{n}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.64rem', fontWeight: 700, color: 'var(--white)', marginBottom: '.22rem' }}>{title}</div>
                          <div style={{ fontSize: '.78rem', color: 'var(--muted)', lineHeight: 1.62 }}>{desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* PERFORMANCE */}
              {tab === 'Performance' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '.55rem', marginBottom: '1.3rem' }} className="perf-grid">
                    {[
                      { label: 'Total Return', value: fP(ret), color: col(ret) },
                      { label: 'Sharpe Ratio', value: sharpe.toFixed(2), color: sharpe >= 1 ? 'var(--green)' : sharpe >= 0.5 ? 'var(--amber)' : 'var(--red)' },
                      { label: 'Max Drawdown', value: fP(-maxDD), color: 'var(--red)' },
                      { label: 'Win Rate', value: winRate.toFixed(1) + '%', color: winRate >= 55 ? 'var(--green)' : 'var(--red)' },
                      { label: 'Total Trades', value: totalTrades.toString(), color: 'var(--white)' },
                      { label: 'Ann. Volatility', value: annualizedVolPct !== null ? annualizedVolPct.toFixed(1) + '%' : 'N/A', color: 'var(--white)' },
                    ].map(({ label, value, color }) => <KpiCard key={label} label={label} value={value} color={color} />)}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.54rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.55rem', textTransform: 'uppercase' }}>Backtest Period Breakdown</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '.55rem' }}>
                    {['5y', '2y', '1y'].map(period => {
                      const perf = livePerf[period]
                      const isLoadingPeriod = livePerfLoading[period]
                      return (
                        <div key={period} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '.9rem 1rem' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.38rem' }}>
                            {period === '5y' ? '5 YEARS' : period === '2y' ? '2 YEARS' : '1 YEAR'}
                          </div>
                          {isLoadingPeriod ? (
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: 'var(--faint)' }}>Loading...</div>
                          ) : perf ? (
                            <div>
                              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.05rem', fontWeight: 800, color: perf.stats.totalReturnPct >= 0 ? 'var(--green)' : 'var(--red)', marginBottom: '.32rem' }}>
                                {fP(perf.stats.totalReturnPct)}
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.2rem' }}>
                                {[['Sharpe', perf.stats.sharpeRatio.toFixed(2)], ['Max DD', fP(-perf.stats.maxDrawdownPct)], ['Win%', perf.stats.winRate.toFixed(0) + '%'], ['Trades', perf.stats.totalTrades.toString()]].map(([k, v]) => (
                                  <div key={k} style={{ fontFamily: 'var(--font-mono)', fontSize: '.56rem', color: 'var(--muted)' }}>
                                    <span style={{ color: 'var(--faint)', fontSize: '.48rem' }}>{k} </span>{v}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : livePerfErrors[period] ? (
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--red)' }}>Error</div>
                          ) : (
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: 'var(--faint)' }}>No data</div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* LIVE NAV - Real-time portfolio based on Yahoo Finance prices */}
              {tab === 'Live' && (
                <LiveNavPanel agentSlug={agent.slug} />
              )}

{/* TRADES */}
              {tab === 'Trades' && (
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', fontWeight: 700, letterSpacing: '.1em', color: 'var(--faint)', marginBottom: '.8rem', textTransform: 'uppercase' }}>
                    {trades.length} Trades
                  </div>
                  {trades.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.66rem', letterSpacing: '.08em' }}>
                      NO TRADES YET
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: '.7rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--faint)', fontSize: '.5rem', letterSpacing: '.08em' }}>
                          <th style={{ padding: '.4rem .5rem', textAlign: 'left' }}>SIDE</th>
                          <th style={{ padding: '.4rem .5rem', textAlign: 'left' }}>SYMBOL</th>
                          <th style={{ padding: '.4rem .5rem', textAlign: 'right' }}>QTY</th>
                          <th style={{ padding: '.4rem .5rem', textAlign: 'right' }}>PRICE</th>
                          <th style={{ padding: '.4rem .5rem', textAlign: 'right' }}>P&L</th>
                          <th style={{ padding: '.4rem .5rem', textAlign: 'right' }}>DATE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trades.map((t, i) => (
                          <tr key={t.id || i} style={{ borderBottom: '1px solid var(--border)', color: 'var(--white)' }}>
                            <td style={{ padding: '.45rem .5rem', color: t.side === 'buy' ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{t.side?.toUpperCase()}</td>
                            <td style={{ padding: '.45rem .5rem' }}>{t.symbol}</td>
                            <td style={{ padding: '.45rem .5rem', textAlign: 'right', color: 'var(--muted)' }}>{t.qty?.toFixed(4)}</td>
                            <td style={{ padding: '.45rem .5rem', textAlign: 'right', color: 'var(--muted)' }}>${t.fill_price?.toFixed(2)}</td>
                            <td style={{ padding: '.45rem .5rem', textAlign: 'right', color: t.pnl_cents !== null ? (t.pnl_cents >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--faint)' }}>
                              {t.pnl_cents != null ? `${t.pnl_cents >= 0 ? '+' : ''}${(t.pnl_cents / 100).toFixed(2)}` : '—'}
                            </td>
                            <td style={{ padding: '.45rem .5rem', textAlign: 'right', color: 'var(--faint)' }}>{t.filled_at ? new Date(t.filled_at).toLocaleDateString() : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* ACTIVITY - Real-time agent execution feed */}
              {tab === 'Activity' && (
                <AgentActivityPanel agentSlug={agent.slug} />
              )}

              {/* THINKING */}
              {tab === 'Thinking' && (
                <ThinkingPanel agentSlug={agent.slug} />
              )}

              {/* STRATEGY */}
              {tab === 'Strategy' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.7rem' }} className="tab-grid">
                  {[
                    { title: 'Logic', body: strategyDescriptions[agent.strategy_type] || 'Systematic strategy with defined entry and exit signals based on technical indicators.' },
                    { title: 'Infrastructure', body: 'Executes via Kraken at real market prices. Market data sourced from Kraken + Binance. Positions tracked per subscriber account.' },
                    { title: 'Risk Management', body: 'Hard circuit breaker at 40% max drawdown — agent paused automatically. Position sizing enforced per signal. Verified via out-of-sample testing and Deflated Sharpe Ratio analysis.' },
                    { title: 'On-Chain Settlement (Planned)', body: 'ERC-3643 tokenized shares, Chainlink price feeds, and on-chain settlement planned for Phase 2. Current subscriptions tracked off-chain.' },
                  ].map(({ title, body }) => (
                    <div key={title} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '1rem 1.1rem' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.54rem', fontWeight: 700, letterSpacing: '.1em', color: 'var(--blue2)', marginBottom: '.45rem', textTransform: 'uppercase' }}>{title}</div>
                      <p style={{ fontSize: '.8rem', color: 'var(--muted)', lineHeight: 1.68, margin: 0 }}>{body}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* BACKTEST */}
              {tab === 'Backtest' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.9rem', flexWrap: 'wrap', gap: '.5rem' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '.86rem', marginBottom: '.12rem' }}>Backtest Results</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.54rem', color: 'var(--faint)', letterSpacing: '.06em' }}>
                        {agent.primary_symbol ?? '—'} · {agent.backtest_strategy?.replace(/_/g, ' ') ?? '—'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
                      <button onClick={refreshBacktestStats} disabled={btRefreshing} style={{ padding: '.3rem .6rem', borderRadius: 6, fontSize: '.58rem', fontFamily: 'var(--font-mono)', border: '1px solid rgba(22,199,132,.18)', background: 'rgba(22,199,132,.04)', color: btRefreshing ? 'var(--faint)' : 'var(--green)', cursor: btRefreshing ? 'default' : 'pointer', letterSpacing: '.04em' }}>
                        {btRefreshing ? 'UPDATING...' : 'REFRESH'}
                      </button>
                      {(['1y', '2y', '5y'] as const).map(p => (
                        <button key={p} onClick={() => { setBtPeriod(p); setBtResult(null); loadBacktest(p) }} style={{ padding: '.3rem .6rem', borderRadius: 6, fontSize: '.6rem', fontFamily: 'var(--font-mono)', border: `1px solid ${btPeriod === p ? 'rgba(59,127,255,.3)' : 'var(--border)'}`, background: btPeriod === p ? 'rgba(59,127,255,.07)' : 'transparent', color: btPeriod === p ? 'var(--blue2)' : 'var(--faint)', cursor: 'pointer' }}>
                          {p.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {btLoading && <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.66rem', letterSpacing: '.08em' }}>RUNNING BACKTEST...</div>}
                  {btError && !btLoading && <div style={{ padding: '.7rem .9rem', background: 'rgba(242,54,69,.06)', border: '1px solid rgba(242,54,69,.16)', borderRadius: 9, color: 'var(--red)', fontSize: '.8rem', fontFamily: 'var(--font-mono)' }}>{btError}</div>}

                  {btResult && !btLoading && (() => {
                    const bs = btResult.stats
                    const step = Math.max(1, Math.floor(btResult.bars.length / 250))
                    const cd = btResult.bars.filter((_, i) => i % step === 0).map((b, i) => ({
                      date: b.date.slice(5),
                      strategy: Math.round(b.equity),
                      buyHold: Math.round(btResult.buyHold[Math.min(i * step, btResult.buyHold.length - 1)]?.equity ?? 0),
                    }))
                    return (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: '.45rem', marginBottom: '1.1rem' }}>
                          {[
                            { label: 'Total Return', value: fP(bs.totalReturnPct), color: col(bs.totalReturnPct) },
                            { label: 'Ann. Return', value: fP(bs.annualizedReturnPct), color: col(bs.annualizedReturnPct) },
                            { label: 'Sharpe', value: bs.sharpeRatio.toFixed(2), color: bs.sharpeRatio >= 1 ? 'var(--green)' : bs.sharpeRatio >= 0 ? 'var(--amber)' : 'var(--red)' },
                            { label: 'Max DD', value: `-${bs.maxDrawdownPct.toFixed(2)}%`, color: 'var(--red)' },
                            { label: 'Win Rate', value: bs.winRate.toFixed(1) + '%', color: bs.winRate >= 50 ? 'var(--green)' : 'var(--red)' },
                            { label: 'Trades', value: String(bs.totalTrades) },
                            { label: 'Best Trade', value: fP(bs.bestTradePct), color: 'var(--green)' },
                            { label: 'Worst Trade', value: fP(bs.worstTradePct), color: 'var(--red)' },
                            { label: 'Calmar', value: bs.calmarRatio.toFixed(2), color: col(bs.calmarRatio) },
                          ].map(({ label, value, color }) => <KpiCard key={label} label={label} value={value} color={color} />)}
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.45rem' }}>
                          EQUITY CURVE · $10K INITIAL · {btResult.symbol} · {btResult.period.toUpperCase()}
                        </div>
                        <ResponsiveContainer width="100%" height={220}>
                          <AreaChart data={cd} margin={{ top: 2, right: 4, bottom: 2, left: -16 }}>
                            <defs>
                              <linearGradient id="bsg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--blue)" stopOpacity={0.22} /><stop offset="95%" stopColor="var(--blue)" stopOpacity={0} /></linearGradient>
                              <linearGradient id="bbg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--muted)" stopOpacity={0.08} /><stop offset="95%" stopColor="var(--muted)" stopOpacity={0} /></linearGradient>
                            </defs>
                            <XAxis dataKey="date" tick={{ fill: 'var(--faint)', fontSize: 9, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                            <YAxis tick={{ fill: 'var(--faint)', fontSize: 9, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                            <Tooltip contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 10 }} formatter={(v: unknown, name: unknown) => [`$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, name === 'strategy' ? 'Strategy' : 'Buy & Hold']} />
                            <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--faint)', paddingTop: 8 }} />
                            <Area type="monotone" dataKey="buyHold" stroke="var(--muted)" strokeWidth={1} fill="url(#bbg)" dot={false} name="buyHold" />
                            <Area type="monotone" dataKey="strategy" stroke="var(--blue)" strokeWidth={2} fill="url(#bsg)" dot={false} name="strategy" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </>
                    )
                  })()}
                </div>
              )}

              {/* MONTE CARLO */}
              {tab === 'Monte Carlo' && (
                <div>
                  <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    {[['TRIALS', mcTrials, 10, 500, (v: number) => setMcTrials(v), 80], ['WINDOW (DAYS)', mcWindow, 60, 365, (v: number) => setMcWindow(v), 90]].map(([label, value, min, max, setter]) => (
                      <div key={label as string}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.28rem' }}>{label as string}</div>
                        <input type="number" value={value as number} min={min as number} max={max as number} onChange={e => (setter as (v: number) => void)(Number(e.target.value))} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 7, padding: '.38rem .6rem', color: 'var(--white)', fontFamily: 'var(--font-mono)', fontSize: '.76rem', width: label === 'TRIALS' ? 78 : 90, outline: 'none' }} />
                      </div>
                    ))}
                    <button onClick={loadMonteCarlo} disabled={mcLoading} style={{ padding: '.48rem 1rem', borderRadius: 8, background: 'var(--blue)', color: '#fff', border: 0, fontFamily: 'var(--font-head)', fontSize: '.78rem', fontWeight: 700, cursor: mcLoading ? 'not-allowed' : 'pointer', opacity: mcLoading ? .6 : 1 }}>
                      {mcLoading ? 'Running...' : 'Run Monte Carlo'}
                    </button>
                  </div>
                  {mcError && <div style={{ padding: '.7rem .9rem', background: 'rgba(242,54,69,.06)', border: '1px solid rgba(242,54,69,.16)', borderRadius: 9, color: 'var(--red)', fontSize: '.8rem', fontFamily: 'var(--font-mono)', marginBottom: '1rem' }}>{mcError}</div>}
                  {mcResult && (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(125px,1fr))', gap: '.45rem', marginBottom: '1.1rem' }}>
                        {[
                          { label: 'Trials Run', value: mcResult.nTrials.toString() },
                          { label: 'Median Return', value: fP(mcResult.medianReturn), color: col(mcResult.medianReturn) },
                          { label: 'Median Excess', value: fP(mcResult.medianExcess), color: col(mcResult.medianExcess) },
                          { label: 'Beat Market', value: (mcResult.beatRate * 100).toFixed(0) + '%', color: mcResult.beatRate >= 0.5 ? 'var(--green)' : 'var(--red)' },
                          { label: 'Median Sharpe', value: mcResult.medianSharpe.toFixed(2), color: mcResult.medianSharpe >= 1 ? 'var(--green)' : 'var(--muted)' },
                          { label: 'P10 Return', value: fP(mcResult.p10Return), color: col(mcResult.p10Return) },
                          { label: 'P90 Return', value: fP(mcResult.p90Return), color: col(mcResult.p90Return) },
                          { label: 'Median DD', value: fP(-mcResult.medianDrawdown), color: 'var(--red)' },
                        ].map(({ label, value, color }) => <KpiCard key={label} label={label} value={value} color={color} />)}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.45rem' }}>
                        RETURN DISTRIBUTION ({mcResult.nTrials} windows of {mcResult.windowDays}d)
                      </div>
                      <ResponsiveContainer width="100%" height={170}>
                        <AreaChart data={mcResult.results.sort((a, b) => a.strategyReturn - b.strategyReturn).map((r, i) => ({ i, strategy: +r.strategyReturn.toFixed(2), market: +r.marketReturn.toFixed(2) }))} margin={{ top: 2, right: 4, bottom: 2, left: -16 }}>
                          <XAxis dataKey="i" tick={false} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: 'var(--faint)', fontSize: 9, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                          <Tooltip contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 10 }} formatter={(v: unknown, n: unknown) => [`${Number(v).toFixed(2)}%`, n === 'strategy' ? 'Strategy' : 'Market']} />
                          <Area type="monotone" dataKey="market" stroke="var(--muted)" strokeWidth={1} fill="rgba(120,140,180,.06)" dot={false} name="market" />
                          <Area type="monotone" dataKey="strategy" stroke="var(--blue)" strokeWidth={1.5} fill="rgba(59,127,255,.09)" dot={false} name="strategy" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN — sticky card ── */}
        <div style={{ position: 'sticky', top: 72 }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 15, padding: '1.3rem', overflow: 'hidden' }}>

            {/* Return */}
            <div style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: 'var(--faint)', letterSpacing: '.12em', marginBottom: '.28rem' }}>
                {isLive ? 'LIVE TOTAL RETURN' : hasBacktestData ? `${cachedBacktestStats!.period.toUpperCase()} BACKTEST RETURN` : 'RETURN'}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '2rem', fontWeight: 800, color: pos ? 'var(--green)' : 'var(--red)', letterSpacing: '-.02em', lineHeight: 1 }}>
                {fP(ret)}
              </div>
              {hasBacktestData && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.46rem', color: 'var(--faint)', marginTop: '.28rem' }}>
                  {cachedBacktestStats!.symbol} · {new Date(cachedBacktestStats!.computed_at).toLocaleDateString()}
                </div>
              )}
            </div>

            {/* Mini stats 2x2 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.38rem', marginBottom: '1rem' }}>
              <MiniStat label="Sharpe" value={sharpe.toFixed(2)} color={sharpe >= 1 ? 'var(--green)' : sharpe >= 0.5 ? 'var(--amber)' : 'var(--red)'} />
              <MiniStat label="Max DD" value={fP(-maxDD)} color="var(--red)" />
              <MiniStat label="Win %" value={winRate.toFixed(0) + '%'} color={winRate >= 55 ? 'var(--green)' : 'var(--amber)'} />
              <MiniStat label="Trades" value={totalTrades.toString()} />
            </div>

            {/* Subscribe */}
            {isSubscribed ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem', background: holding ? 'rgba(22,199,132,.06)' : 'rgba(79,127,255,.06)', border: `1px solid ${holding ? 'rgba(22,199,132,.16)' : 'rgba(79,127,255,.16)'}`, borderRadius: 8, padding: '.45rem .7rem', marginBottom: '.55rem' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: holding ? 'var(--green)' : 'var(--blue2)', display: 'inline-block', flexShrink: 0 }} />
                  <span suppressHydrationWarning style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: holding ? 'var(--green)' : 'var(--blue2)', fontWeight: 700, letterSpacing: '.06em', flex: 1 }}>
                    {holding ? 'INVESTED' : 'SUBSCRIBED'}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: 'var(--faint)' }}>{subscribers} investors</span>
                </div>
                {holding && (
                  <button suppressHydrationWarning onClick={() => setShowDeallocateModal(true)} disabled={loading} style={{ width: '100%', padding: '.45rem', borderRadius: 7, border: '1px solid rgba(242,54,69,.18)', background: 'transparent', color: 'rgba(242,54,69,.6)', fontFamily: 'var(--font-mono)', fontSize: '.6rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '.04em' }}>
                    {loading ? 'Processing...' : 'Deallocate Position'}
                  </button>
                )}
              </div>
            ) : (
              <div>
                {!isLoggedIn && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.56rem', color: 'var(--faint)', textAlign: 'center', marginBottom: '.55rem' }}>
                    <Link href={`/login?redirect=/agents/${agent.slug}`} style={{ color: 'var(--blue2)', textDecoration: 'none' }}>Sign in</Link> to allocate funds
                  </div>
                )}
                <button onClick={handleSubscribe} disabled={loading || agent.alert_level === 'hard'} style={{ width: '100%', padding: '.72rem', borderRadius: 9, border: 0, background: agent.alert_level === 'hard' ? 'var(--bg3)' : 'var(--blue)', color: agent.alert_level === 'hard' ? 'var(--faint)' : '#fff', fontFamily: 'var(--font-head)', fontSize: '.86rem', fontWeight: 700, cursor: loading || agent.alert_level === 'hard' ? 'not-allowed' : 'pointer', letterSpacing: '-.01em', transition: 'background .15s' }}
                  onMouseEnter={e => { if (!loading && agent.alert_level !== 'hard') (e.currentTarget as HTMLButtonElement).style.background = 'var(--blue2)' }}
                  onMouseLeave={e => { if (agent.alert_level !== 'hard') (e.currentTarget as HTMLButtonElement).style.background = 'var(--blue)' }}
                >
                  {loading ? 'Processing...' : 'Allocate Funds'}
                </button>
                {subscribers > 0 && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: 'var(--faint)', textAlign: 'center', marginTop: '.4rem' }}>
                    {subscribers} investor{subscribers !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            )}

            {msg && <div style={{ marginTop: '.45rem', fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--red)', textAlign: 'center' }}>{msg}</div>}

            {/* Investment section */}
            {isSubscribed && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '.85rem', marginTop: '.85rem' }}>
                {holding ? (
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.55rem' }}>YOUR POSITION</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.35rem', marginBottom: '.6rem' }}>
                      {[
                        { label: 'INVESTED', value: fmt$(holding.invested_cents), color: undefined },
                        { label: 'VALUE', value: fmt$(holding.current_value_cents), color: undefined },
                        { label: 'SHARES', value: holding.shares.toFixed(4), color: undefined },
                        { label: 'P&L', value: `${holding.pnl_cents >= 0 ? '+' : ''}${fmt$(holding.pnl_cents)}`, color: holding.pnl_cents >= 0 ? 'var(--green)' : 'var(--red)' },
                      ].map(({ label, value, color }) => (
                        <div key={label} style={{ background: label === 'P&L' ? (holding.pnl_cents >= 0 ? 'rgba(22,199,132,.05)' : 'rgba(242,54,69,.05)') : 'var(--bg3)', border: `1px solid ${label === 'P&L' ? (holding.pnl_cents >= 0 ? 'rgba(22,199,132,.16)' : 'rgba(242,54,69,.16)') : 'var(--border)'}`, borderRadius: 7, padding: '.4rem .55rem' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.44rem', color: 'var(--faint)', marginBottom: '.1rem' }}>{label}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.76rem', fontWeight: 700, color: color ?? 'var(--white)' }}>{value}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.35rem' }}>
                      <button onClick={() => setShowInvestModal(true)} style={{ padding: '.5rem', borderRadius: 7, border: '1px solid rgba(59,127,255,.24)', background: 'rgba(59,127,255,.06)', color: 'var(--blue2)', fontFamily: 'var(--font-mono)', fontSize: '.6rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '.04em' }}>
                        Add More
                      </button>
                      <button onClick={() => setShowDeallocateModal(true)} style={{ padding: '.5rem', borderRadius: 7, border: '1px solid rgba(242,54,69,.2)', background: 'rgba(242,54,69,.05)', color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: '.6rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '.04em' }}>
                        Deallocate
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.35rem' }}>NO ACTIVE POSITION</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--muted)', lineHeight: 1.6, marginBottom: '.55rem' }}>
                      You're subscribed but have no open position. Allocate funds to start trading.
                    </div>
                    <button
                      onClick={() => setShowInvestModal(true)}
                      disabled={agent.alert_level === 'hard'}
                      style={{ width: '100%', padding: '.62rem', borderRadius: 8, border: 0, background: agent.alert_level === 'hard' ? 'var(--bg3)' : 'var(--blue)', color: agent.alert_level === 'hard' ? 'var(--faint)' : '#fff', fontFamily: 'var(--font-head)', fontSize: '.84rem', fontWeight: 700, cursor: agent.alert_level === 'hard' ? 'not-allowed' : 'pointer', letterSpacing: '-.01em' }}
                    >
                      Allocate Funds
                    </button>
                  </div>
                )}

                {statusMsg && (
                  <div style={{ marginTop: '.5rem', fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--green)', textAlign: 'center' }}>
                    {statusMsg}
                  </div>
                )}
              </div>
            )}

            {/* Signal */}
            {agent.signal_summary && (
              <div style={{ marginTop: '.85rem', paddingTop: '.85rem', borderTop: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: '.56rem', color: 'var(--muted)', lineHeight: 1.55 }}>
                <span style={{ color: 'var(--faint)', fontSize: '.46rem', letterSpacing: '.08em' }}>LAST SIGNAL </span>
                {agent.signal_summary}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showInvestModal && (
        <InvestModal
          agentId={agent.id}
          agentName={agent.name}
          navCents={currentNavCents}
          onClose={() => setShowInvestModal(false)}
          onSuccess={({ shares, amount }) => {
            setShowInvestModal(false)
            setIsSubscribed(true)
            setStatusMsg(`Invested $${amount} — ${shares.toFixed(4)} shares acquired`)
            refreshHolding()
            router.refresh()
          }}
        />
      )}

      {showDeallocateModal && holding && (
        <DeallocateModal
          holding={holding}
          agentName={agent.name}
          navCents={currentNavCents}
          primarySymbol={agent.primary_symbol}
          onClose={() => setShowDeallocateModal(false)}
          onSuccess={returnedCents => {
            setShowDeallocateModal(false)
            setStatusMsg(`Deallocated — ${fmt$(returnedCents)} returned to balance`)
            refreshHolding()
            router.refresh()
          }}
        />
      )}

      <style>{`
        @media (max-width: 920px) {
          .detail-main-grid { grid-template-columns: 1fr !important; }
          .kpi-strip { grid-template-columns: repeat(3,1fr) !important; }
        }
        @media (max-width: 580px) {
          .kpi-strip { grid-template-columns: repeat(2,1fr) !important; }
          .tab-grid, .perf-grid { grid-template-columns: 1fr !important; }
          .how-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

// ─── Thinking Panel ───────────────────────────────────────────────────────────
// Shows the agent's recent reasoning, indicators, and decision history

interface ReasoningEntry {
  id: string
  run_at: string
  signal_summary: string
  thinking: string | null
  indicators_json: Record<string, number | string> | null
  portfolio_json: Record<string, unknown> | null
  actions_json: Record<string, unknown> | null
  price_source: string
}

function ThinkingPanel({ agentSlug }: { agentSlug: string }) {
  const [reasoning, setReasoning] = useState<ReasoningEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/agents/${agentSlug}/reasoning`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error)
        else setReasoning(data.reasoning || [])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [agentSlug])

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.66rem', letterSpacing: '.08em' }}>
        LOADING THOUGHTS...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: '.66rem', letterSpacing: '.08em' }}>
        ERROR: {error}
      </div>
    )
  }

  if (reasoning.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.66rem', letterSpacing: '.08em' }}>
        NO THOUGHTS YET · Agent hasn't run yet
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {reasoning.map((entry, i) => (
        <div key={entry.id} style={{ 
          background: 'var(--bg3)', 
          border: '1px solid var(--border)', 
          borderRadius: 12, 
          padding: '1.2rem',
          borderLeft: `3px solid ${entry.signal_summary.startsWith('BUY') ? 'var(--green)' : entry.signal_summary.startsWith('SELL') ? 'var(--red)' : 'var(--blue2)'}`,
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.8rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
              <span style={{ 
                fontFamily: 'var(--font-mono)', 
                fontSize: '.52rem', 
                fontWeight: 700, 
                letterSpacing: '.1em',
                color: entry.signal_summary.startsWith('BUY') ? 'var(--green)' : entry.signal_summary.startsWith('SELL') ? 'var(--red)' : 'var(--blue2)',
                textTransform: 'uppercase',
              }}>
                {entry.signal_summary.split(' ')[0]}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: 'var(--faint)' }}>
                {new Date(entry.run_at).toLocaleString()}
              </span>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.42rem', color: 'var(--muted)', background: 'rgba(255,255,255,.04)', padding: '.2rem .5rem', borderRadius: 4 }}>
              {entry.price_source}
            </span>
          </div>

          {/* Signal Summary */}
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', color: 'var(--white)', marginBottom: '.6rem', lineHeight: 1.5 }}>
            {entry.signal_summary}
          </div>

          {/* Thinking */}
          {entry.thinking && (
            <div style={{ fontSize: '.74rem', color: 'var(--muted)', lineHeight: 1.6, marginBottom: '.8rem', padding: '.6rem', background: 'rgba(0,0,0,.2)', borderRadius: 8 }}>
              💭 {entry.thinking}
            </div>
          )}

          {/* Indicators */}
          {entry.indicators_json && (
            <div style={{ marginBottom: '.8rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', fontWeight: 700, letterSpacing: '.1em', color: 'var(--faint)', marginBottom: '.4rem', textTransform: 'uppercase' }}>
                Technical Indicators
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
                {Object.entries(entry.indicators_json).slice(0, 8).map(([k, v]) => (
                  <span key={k} style={{ 
                    fontFamily: 'var(--font-mono)', 
                    fontSize: '.6rem', 
                    background: 'rgba(59,127,255,.08)', 
                    border: '1px solid rgba(59,127,255,.15)', 
                    padding: '.25rem .5rem', 
                    borderRadius: 5,
                    color: 'var(--white)',
                  }}>
                    {k}: <span style={{ color: typeof v === 'number' ? 'var(--blue2)' : 'var(--muted)' }}>{typeof v === 'number' ? v.toFixed(2) : v}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {entry.actions_json && Array.isArray(entry.actions_json) && entry.actions_json.length > 0 && (
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', fontWeight: 700, letterSpacing: '.1em', color: 'var(--faint)', marginBottom: '.4rem', textTransform: 'uppercase' }}>
                Actions Taken
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
                {entry.actions_json.map((action: any, j: number) => (
                  <div key={j} style={{ 
                    fontFamily: 'var(--font-mono)', 
                    fontSize: '.62rem', 
                    padding: '.4rem .6rem',
                    background: action.action === 'BUY' ? 'rgba(22,199,132,.08)' : action.action === 'SELL' ? 'rgba(239,68,68,.08)' : 'rgba(255,255,255,.03)',
                    border: `1px solid ${action.action === 'BUY' ? 'rgba(22,199,132,.2)' : action.action === 'SELL' ? 'rgba(239,68,68,.2)' : 'var(--border)'}`,
                    borderRadius: 6,
                    color: 'var(--white)',
                  }}>
                    <span style={{ fontWeight: 700, color: action.action === 'BUY' ? 'var(--green)' : action.action === 'SELL' ? 'var(--red)' : 'var(--muted)' }}>
                      {action.action}
                    </span>
                    {' '}{action.symbol}{action.notional ? ` $${action.notional.toFixed(0)}` : ''}{action.reason ? ` · ${action.reason}` : ''}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

    </div>
  )
}

// ─── Live NAV Panel ───────────────────────────────────────────────────────────
// Real-time NAV calculated from agent_trades ledger + Yahoo Finance prices

interface LivePosition {
  symbol: string
  qty: number
  avg_price: number
  current_price: number | null
  pnl_pct: number | null
}

interface LiveNavData {
  nav: number
  change_1d: number
  realized_pnl_cents: number
  portfolio_value_cents: number
  positions: LivePosition[]
  prices: Record<string, number>
  trade_count: number
}

function LiveNavPanel({ agentSlug }: { agentSlug: string }) {
  const [data, setData] = useState<LiveNavData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    async function fetchLiveNav() {
      try {
        const res = await fetch(`/api/agents/${agentSlug}/live-nav`)
        const json = await res.json()
        if (json.error) throw new Error(json.error)
        setData(json)
        setLastUpdated(new Date())
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }

    fetchLiveNav()
    const interval = setInterval(fetchLiveNav, 60000) // Refresh every minute
    return () => clearInterval(interval)
  }, [agentSlug])

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.66rem', letterSpacing: '.08em' }}>
        CALCULATING LIVE NAV...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: '.66rem', letterSpacing: '.08em' }}>
        ERROR: {error}
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.66rem', letterSpacing: '.08em' }}>
        NO DATA AVAILABLE
      </div>
    )
  }

  const navChangeColor = data.change_1d >= 0 ? 'var(--green)' : 'var(--red)'
  const unrealizedPositions = data.positions.filter(p => p.pnl_pct !== null)
  const totalUnrealized = unrealizedPositions.reduce((sum, p) => sum + (p.pnl_pct || 0), 0)

  return (
    <div>
      {/* Header Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '.55rem', marginBottom: '1.25rem' }}>
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '.9rem 1rem', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.2rem' }}>NAV</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 800, color: 'var(--white)' }}>${data.nav.toFixed(2)}</div>
        </div>
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '.9rem 1rem', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.2rem' }}>24H</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 800, color: navChangeColor }}>
            {data.change_1d >= 0 ? '+' : ''}{data.change_1d.toFixed(2)}%
          </div>
        </div>
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '.9rem 1rem', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.2rem' }}>REALIZED P&L</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 800, color: data.realized_pnl_cents >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {data.realized_pnl_cents >= 0 ? '+' : ''}${(data.realized_pnl_cents / 100).toFixed(2)}
          </div>
        </div>
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '.9rem 1rem', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.2rem' }}>TRADES</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 800, color: 'var(--white)' }}>{data.trade_count}</div>
        </div>
      </div>

      {/* Last Updated */}
      {lastUpdated && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: 'var(--faint)', marginBottom: '.8rem', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <span style={{ opacity: 0.6 }}>⟳</span> Last updated: {lastUpdated.toLocaleTimeString()}
          <span style={{ opacity: 0.5, fontSize: '.4rem' }}>· Prices from Yahoo Finance</span>
        </div>
      )}

      {/* Positions */}
      {data.positions.length > 0 ? (
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', fontWeight: 700, letterSpacing: '.1em', color: 'var(--faint)', marginBottom: '.6rem', textTransform: 'uppercase' }}>
            Open Positions
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
            {data.positions.map((pos, i) => (
              <div key={pos.symbol} style={{ 
                background: 'var(--bg3)', 
                border: '1px solid var(--border)', 
                borderRadius: 10, 
                padding: '.8rem 1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.8rem', fontWeight: 700, color: 'var(--white)' }}>{pos.symbol}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.54rem', color: 'var(--faint)' }}>
                    {pos.qty.toFixed(4)} @ ${pos.avg_price.toFixed(2)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.8rem', fontWeight: 700, color: pos.pnl_pct && pos.pnl_pct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {pos.pnl_pct !== null ? `${pos.pnl_pct >= 0 ? '+' : ''}${pos.pnl_pct.toFixed(2)}%` : '—'}
                  </div>
                  {pos.current_price && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.54rem', color: 'var(--muted)' }}>
                      ${pos.current_price.toFixed(2)} now
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.66rem', letterSpacing: '.08em' }}>
          NO OPEN POSITIONS
        </div>
      )}

      {/* Market Prices */}
      {Object.keys(data.prices).length > 0 && (
        <div style={{ marginTop: '1.25rem' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', fontWeight: 700, letterSpacing: '.1em', color: 'var(--faint)', marginBottom: '.6rem', textTransform: 'uppercase' }}>
            Live Market Prices (Yahoo Finance)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
            {Object.entries(data.prices).map(([symbol, price]) => (
              <span key={symbol} style={{ 
                fontFamily: 'var(--font-mono)', 
                fontSize: '.6rem', 
                background: 'rgba(59,127,255,.06)', 
                border: '1px solid rgba(59,127,255,.12)', 
                padding: '.35rem .6rem', 
                borderRadius: 6,
                color: 'var(--white)',
              }}>
                {symbol}: <span style={{ color: 'var(--blue2)' }}>${price.toFixed(2)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Agent Activity Panel ────────────────────────────────────────────────────
// Live feed of agent executions: trades, signals, decisions from cron runs

interface ActivityEntry {
  run_at: string
  signal_summary: string
  thinking: string | null
  actions_json: string | null
  indicators_json: string | null
  price_source: string
}

interface AgentActivityData {
  runs: ActivityEntry[]
  recentTrades: Trade[]
  lastRunAt: string | null
  totalRuns: number
}

function AgentActivityPanel({ agentSlug }: { agentSlug: string }) {
  interface TradeAction {
    action: string
    symbol: string
    qty?: number
    notional?: number
    fill_price?: number
  }
  const [data, setData] = useState<AgentActivityData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchActivity = useCallback(async () => {
    try {
      const [reasoningRes, tradesRes] = await Promise.all([
        fetch(`/api/agents/${agentSlug}/reasoning`),
        fetch(`/api/agents/${agentSlug}/trades`),
      ])

      const [reasoningJson, tradesJson] = await Promise.all([
        reasoningRes.json(),
        tradesRes.json(),
      ])

      const runs = (reasoningJson.reasoning ?? []).slice(0, 10)
      const recentTrades = (tradesJson.trades ?? []).slice(0, 20).map((t: Trade) => t)

      setData({
        runs,
        recentTrades,
        lastRunAt: runs[0]?.run_at ?? null,
        totalRuns: reasoningJson.reasoning?.length ?? 0,
      })
      setLastUpdated(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load activity')
    } finally {
      setLoading(false)
    }
  }, [agentSlug])

  useEffect(() => {
    fetchActivity()
    if (!autoRefresh) return
    const interval = setInterval(fetchActivity, 30000)
    return () => clearInterval(interval)
  }, [fetchActivity, autoRefresh])

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.66rem', letterSpacing: '.08em' }}>
        LOADING AGENT ACTIVITY...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '1rem', background: 'rgba(242,54,69,.06)', border: '1px solid rgba(242,54,69,.16)', borderRadius: 9, color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: '.7rem' }}>
        ERROR: {error}
      </div>
    )
  }

  const latestRun = data?.runs[0]
  const actions = latestRun?.actions_json ? JSON.parse(latestRun.actions_json) : []
  const indicators = latestRun?.indicators_json ? JSON.parse(latestRun.indicators_json) : null

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', fontWeight: 700, letterSpacing: '.1em', color: 'var(--faint)', textTransform: 'uppercase' }}>
            {data?.totalRuns ?? 0} RUNS LOGGED
          </span>
          {data?.lastRunAt && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: 'var(--muted)' }}>
              · Last: {new Date(data.lastRunAt).toLocaleString()}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
          <label style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: 'var(--faint)', display: 'flex', alignItems: 'center', gap: '.3rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} style={{ accentColor: 'var(--blue2)' }} />
            AUTO-REFRESH (30s)
          </label>
          <button onClick={fetchActivity} style={{ padding: '.25rem .5rem', borderRadius: 5, fontSize: '.48rem', fontFamily: 'var(--font-mono)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', letterSpacing: '.04em' }}>
            REFRESH
          </button>
        </div>
      </div>

      {/* Latest Signal */}
      {latestRun && (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '.9rem 1rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.5rem' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', fontWeight: 700, letterSpacing: '.1em', color: 'var(--blue2)', textTransform: 'uppercase' }}>Latest Signal</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: 'var(--muted)' }}>
              {new Date(latestRun.run_at).toLocaleString()}
            </span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.9rem', fontWeight: 700, color: latestRun.signal_summary?.includes('BUY') ? 'var(--green)' : latestRun.signal_summary?.includes('SELL') ? 'var(--red)' : 'var(--white)' }}>
            {latestRun.signal_summary || 'SCANNING'}
          </div>
          {latestRun.thinking && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.56rem', color: 'var(--muted)', marginTop: '.5rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {latestRun.thinking}
            </div>
          )}
        </div>
      )}

      {/* Actions / Trades in last run */}
      {actions.length > 0 && (
        <div style={{ marginBottom: '1.1rem' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', fontWeight: 700, letterSpacing: '.1em', color: 'var(--faint)', marginBottom: '.6rem', textTransform: 'uppercase' }}>
            Executed in Latest Run
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
            {actions.map((a: TradeAction, i: number) => (
              <div key={i} style={{ background: 'var(--bg3)', border: `1px solid ${a.action === 'BUY' ? 'rgba(22,199,132,.18)' : a.action === 'SELL' ? 'rgba(242,54,69,.18)' : 'var(--border)'}`, borderRadius: 8, padding: '.65rem .85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', fontWeight: 700, padding: '.15rem .35rem', borderRadius: 4, background: a.action === 'BUY' ? 'rgba(22,199,132,.1)' : a.action === 'SELL' ? 'rgba(242,54,69,.1)' : 'rgba(59,127,255,.1)', color: a.action === 'BUY' ? 'var(--green)' : a.action === 'SELL' ? 'var(--red)' : 'var(--blue2)' }}>
                    {a.action}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', color: 'var(--white)' }}>{a.symbol}</span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--muted)' }}>
                  {a.notional ? `$${a.notional.toFixed(0)}` : a.qty ? `${a.qty.toFixed(4)} units` : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Indicators */}
      {indicators && (
        <div style={{ marginBottom: '1.1rem' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', fontWeight: 700, letterSpacing: '.1em', color: 'var(--faint)', marginBottom: '.6rem', textTransform: 'uppercase' }}>
            Technical Indicators
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
            {Object.entries(indicators).map(([key, value]) => (
              <div key={key} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 7, padding: '.35rem .6rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.44rem', color: 'var(--faint)', letterSpacing: '.08em' }}>{String(key).toUpperCase()}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', fontWeight: 700, color: 'var(--white)' }}>{typeof value === 'number' ? value.toFixed(4) : String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Trades Log */}
      {data?.recentTrades && data.recentTrades.length > 0 && (
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', fontWeight: 700, letterSpacing: '.1em', color: 'var(--faint)', marginBottom: '.6rem', textTransform: 'uppercase' }}>
            Recent Trades ({data.recentTrades.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
            {data.recentTrades.map((t, i) => (
              <div key={t.id || i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.35rem 0', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: '.6rem' }}>
                <span style={{ color: t.side === 'buy' ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{t.side?.toUpperCase()}</span>
                <span style={{ color: 'var(--white)' }}>{t.symbol}</span>
                <span style={{ color: 'var(--muted)' }}>{t.qty?.toFixed(4)}</span>
                <span style={{ color: 'var(--muted)' }}>${t.fill_price?.toFixed(2)}</span>
                <span style={{ color: 'var(--faint)' }}>{t.filled_at ? new Date(t.filled_at).toLocaleDateString() : '—'}</span>
                {t.pnl_cents != null && (
                  <span style={{ color: t.pnl_cents >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                    {t.pnl_cents >= 0 ? '+' : ''}${(t.pnl_cents / 100).toFixed(2)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Run History */}
      {data?.runs && data.runs.length > 1 && (
        <div style={{ marginTop: '1.1rem' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', fontWeight: 700, letterSpacing: '.1em', color: 'var(--faint)', marginBottom: '.6rem', textTransform: 'uppercase' }}>
            Run History
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
            {data.runs.slice(1).map((run, i) => {
              const prevRun = data.runs[i + 1]
              const actions = run.actions_json ? JSON.parse(run.actions_json) : []
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 7, padding: '.4rem .7rem', fontFamily: 'var(--font-mono)', fontSize: '.56rem' }}>
                  <span style={{ color: 'var(--faint)' }}>{new Date(run.run_at).toLocaleString()}</span>
                  <span style={{ color: run.signal_summary?.includes('BUY') ? 'var(--green)' : run.signal_summary?.includes('SELL') ? 'var(--red)' : 'var(--muted)', fontWeight: 600 }}>
                    {run.signal_summary || 'SCANNING'}
                  </span>
                  <span style={{ color: 'var(--blue2)' }}>
                    {actions.length > 0 ? `${actions.length} trade(s)` : '—no trades'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
