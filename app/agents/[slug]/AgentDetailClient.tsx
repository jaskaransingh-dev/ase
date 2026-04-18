'use client'
import React, { useState, useMemo, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { fmtDate } from '@/lib/utils'
import { useWallet } from '@/components/WalletProvider'

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

const TABS = ['Overview', 'Performance', 'Live', 'Backtest', 'Trades', 'Thinking', 'Strategy', 'Monte Carlo'] as const
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
  const { wallet, shortAddress, openModal } = useWallet()
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

  async function handleInvest() {
    if (cappedAmount < 10) { setMsg('Minimum $10'); return }
    setLoading(true); setMsg('')
    console.log('[Invest] Starting purchase of $' + cappedAmount)
    try {
      const res = await fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_id: agentId, amount_cents: Math.round(cappedAmount * 100) }) })
      const data = await res.json()
      console.log('[Invest] Response:', res.status, data)
      if (!res.ok) throw new Error(data.error || 'Purchase failed')
      setMsg('Success! Shares: ' + data.shares?.toFixed(4))
      onSuccess({ shares: data.shares, amount: cappedAmount })
    } catch (e) { 
      console.error('[Invest] Error:', e)
      setMsg(e instanceof Error ? e.message : 'Investment failed') 
    }
    setLoading(false)
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(4,3,12,.9)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid rgba(59,127,255,.22)', borderRadius: 20, padding: '2rem', width: '100%', maxWidth: 400, boxShadow: '0 40px 80px rgba(0,0,0,.7)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.1rem' }}>Buy Shares</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--faint)', marginTop: '.18rem' }}>{agentName}</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid var(--border)', borderRadius: 9, width: 32, height: 32, cursor: 'pointer', color: 'var(--faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>x</button>
        </div>

        <div style={{ background: 'rgba(59,127,255,.05)', border: '1px solid rgba(59,127,255,.16)', borderRadius: 11, padding: '.8rem 1rem', marginBottom: '1.2rem' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.22rem' }}>AVAILABLE BALANCE</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 700, color: fetching ? 'var(--faint)' : (notConnected ? 'var(--red)' : 'var(--blue2)') }}>
            {fetching ? '—' : notConnected ? 'Not Connected' : fmt$(balance ?? 0)}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: 'var(--faint)', marginTop: '.16rem' }}>
            {notConnected ? 'Connect your broker' : 'Ready to invest'}
          </div>
        </div>

        {notConnected ? (
          <div style={{ padding: '0.5rem 0' }}>
            {/* Wallet option */}
            {wallet.address ? (
              <div style={{ background: 'rgba(22,199,132,.06)', border: '1px solid rgba(22,199,132,.2)', borderRadius: 11, padding: '.9rem 1rem', marginBottom: '.85rem', display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--mint)', display: 'inline-block', flexShrink: 0 }} />
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--mint)', fontWeight: 700 }}>Wallet connected</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', marginTop: '.1rem' }}>{shortAddress} — on-chain settlement coming soon</div>
                </div>
              </div>
            ) : (
              <button onClick={openModal} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem', padding: '.7rem 1rem', borderRadius: 10, border: '1px solid rgba(79,140,255,.25)', background: 'rgba(79,140,255,.08)', color: 'var(--blue2)', fontFamily: 'var(--font-mono)', fontSize: '.76rem', fontWeight: 700, cursor: 'pointer', marginBottom: '.75rem' }}>
                🦊 Connect Wallet
              </button>
            )}
            <p style={{ color: 'var(--muted)', fontSize: '.78rem', marginBottom: '.85rem', lineHeight: 1.6, textAlign: 'center' }}>
              Connect your Alpaca account to invest with USD.
            </p>
            <a href="/dashboard/settings" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '.65rem 1.5rem', borderRadius: 10, border: 0, background: 'var(--blue)', color: '#fff', fontFamily: 'var(--font-head)', fontSize: '.88rem', fontWeight: 700, textDecoration: 'none' }}>
              Connect Alpaca →
            </a>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '1.2rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.45rem' }}>USD AMOUNT</div>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-mono)', fontSize: '.88rem', color: 'var(--muted)' }}>$</span>
                <input type="number" value={amount} min={10} max={maxAmount} onChange={e => setAmount(Number(e.target.value))} style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '.68rem 1rem .68rem 1.7rem', color: 'var(--white)', fontFamily: 'var(--font-mono)', fontSize: '.92rem', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: '.35rem', marginTop: '.4rem' }}>
                {[25, 50, 100].filter(v => v <= maxAmount).map(v => (
                  <button key={v} onClick={() => setAmount(v)} style={{ flex: 1, padding: '.28rem', background: amount === v ? 'rgba(59,127,255,.1)' : 'rgba(255,255,255,.03)', border: `1px solid ${amount === v ? 'rgba(59,127,255,.28)' : 'var(--border)'}`, borderRadius: 6, color: amount === v ? 'var(--blue2)' : 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.58rem', cursor: 'pointer', fontWeight: 600 }}>${v}</button>
                ))}
                {maxAmount >= 10 && (
                  <button onClick={() => setAmount(maxAmount)} style={{ flex: 1, padding: '.28rem', background: amount === maxAmount ? 'rgba(59,127,255,.1)' : 'rgba(255,255,255,.03)', border: `1px solid ${amount === maxAmount ? 'rgba(59,127,255,.28)' : 'var(--border)'}`, borderRadius: 6, color: amount === maxAmount ? 'var(--blue2)' : 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.58rem', cursor: 'pointer', fontWeight: 600 }}>MAX</button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '.35rem', marginTop: '.35rem' }}>
                {[10, 25, 50].map(pct => (
                  <button key={pct} onClick={() => setAmount(Math.floor(maxAmount * pct / 100))} disabled={maxAmount < 100} style={{ flex: 1, padding: '.22rem', background: 'rgba(255,255,255,.02)', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.52rem', cursor: maxAmount < 100 ? 'not-allowed' : 'pointer', opacity: maxAmount < 100 ? 0.4 : 1 }}>{pct}% of balance</button>
                ))}
              </div>
            </div>

            <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '.7rem 1rem', marginBottom: '1.2rem' }}>
              {[['Projected shares', projectedShares.toFixed(4)]].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', letterSpacing: '.07em' }}>{k}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.8rem', fontWeight: 700 }}>{v}</span>
                </div>
              ))}
            </div>

            {msg && <div style={{ marginBottom: '.9rem', padding: '.65rem .9rem', background: 'rgba(242,54,69,.07)', border: '1px solid rgba(242,54,69,.18)', borderRadius: 9, fontFamily: 'var(--font-mono)', fontSize: '.68rem', color: 'var(--red)' }}>{msg}</div>}

            <button onClick={handleInvest} disabled={loading || fetching || cappedAmount < 10} style={{ width: '100%', padding: '.75rem', borderRadius: 10, border: 0, background: 'var(--blue)', color: '#fff', fontFamily: 'var(--font-head)', fontSize: '.88rem', fontWeight: 700, cursor: loading || fetching || cappedAmount < 10 ? 'not-allowed' : 'pointer', opacity: loading || fetching || cappedAmount < 10 ? .5 : 1, letterSpacing: '-.01em' }}>
              {loading ? 'Processing...' : `Buy $${Math.max(0, cappedAmount)} →`}
            </button>
            <div style={{ marginTop: '.85rem', fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', lineHeight: 1.65, textAlign: 'center' }}>
              Real USD investment. Algorithmic trading involves substantial risk of loss.
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Deallocate Modal ─────────────────────────────────────────────────────────

function DeallocateModal({ holding, agentName, navCents, onClose, onSuccess }: {
  holding: UserHolding; agentName: string; navCents: number
  onClose: () => void; onSuccess: (returnedCents: number) => void
}) {
  const maxShares = holding.shares
  const [sharesToSell, setSharesToSell] = useState(maxShares)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const sellValue = Math.round(Math.min(sharesToSell, maxShares) * navCents)
  const pctToSell = maxShares > 0 ? Math.round((sharesToSell / maxShares) * 100) : 0

  async function handleSell() {
    setLoading(true); setMsg('')
    try {
      const res = await fetch('/api/holdings/sell', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ holding_id: holding.id, shares_to_sell: sharesToSell }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onSuccess(data.returned_cents)
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed') }
    setLoading(false)
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(4,3,12,.9)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid rgba(242,54,69,.2)', borderRadius: 20, padding: '2rem', width: '100%', maxWidth: 400, boxShadow: '0 40px 80px rgba(0,0,0,.7)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.1rem' }}>Sell Position</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--faint)', marginTop: '.18rem' }}>{agentName}</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid var(--border)', borderRadius: 9, width: 32, height: 32, cursor: 'pointer', color: 'var(--faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>x</button>
        </div>

        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 11, padding: '.85rem 1rem', marginBottom: '1.2rem' }}>
          {[['Total shares', maxShares.toFixed(4)], ['Current value', fmt$(holding.current_value_cents)], ['P&L', `${holding.pnl_cents >= 0 ? '+' : ''}${fmt$(holding.pnl_cents)}`]].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: k !== 'P&L' ? '.35rem' : 0 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', letterSpacing: '.07em' }}>{k}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.8rem', fontWeight: 700, color: k === 'P&L' ? (holding.pnl_cents >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--white)' }}>{v}</span>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: '1.2rem' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.45rem' }}>SHARES TO SELL</div>
          <input type="number" value={sharesToSell} min={0} max={maxShares} step={maxShares / 100} onChange={e => setSharesToSell(Math.min(Number(e.target.value), maxShares))} style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '.68rem 1rem', color: 'var(--white)', fontFamily: 'var(--font-mono)', fontSize: '.92rem', outline: 'none', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: '.35rem', marginTop: '.4rem' }}>
            {[25, 50, 75, 100].map(pct => (
              <button key={pct} onClick={() => setSharesToSell(maxShares * pct / 100)} style={{ flex: 1, padding: '.28rem', background: pctToSell === pct ? 'rgba(242,54,69,.1)' : 'rgba(255,255,255,.03)', border: `1px solid ${pctToSell === pct ? 'rgba(242,54,69,.28)' : 'var(--border)'}`, borderRadius: 6, color: pctToSell === pct ? 'var(--red)' : 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.58rem', cursor: 'pointer', fontWeight: 600 }}>{pct}%</button>
            ))}
          </div>
        </div>

        <div style={{ background: 'rgba(242,54,69,.04)', border: '1px solid rgba(242,54,69,.14)', borderRadius: 10, padding: '.7rem 1rem', marginBottom: '1.2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', letterSpacing: '.07em' }}>USD RETURNED</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.88rem', fontWeight: 700, color: 'var(--white)' }}>{fmt$(sellValue)}</span>
          </div>
        </div>

        {msg && <div style={{ marginBottom: '.9rem', padding: '.65rem .9rem', background: 'rgba(242,54,69,.07)', border: '1px solid rgba(242,54,69,.18)', borderRadius: 9, fontFamily: 'var(--font-mono)', fontSize: '.68rem', color: 'var(--red)' }}>{msg}</div>}

        <button onClick={handleSell} disabled={loading || sharesToSell <= 0} style={{ width: '100%', padding: '.75rem', borderRadius: 10, border: 0, background: 'rgba(242,54,69,.9)', color: '#fff', fontFamily: 'var(--font-head)', fontSize: '.88rem', fontWeight: 700, cursor: loading || sharesToSell <= 0 ? 'not-allowed' : 'pointer', opacity: loading || sharesToSell <= 0 ? .5 : 1, letterSpacing: '-.01em' }}>
          {loading ? 'Processing...' : `Sell $${(sellValue / 100).toFixed(2)} →`}
        </button>
        <div style={{ marginTop: '.85rem', fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', lineHeight: 1.65, textAlign: 'center' }}>
          Proceeds returned to your ASE wallet within 2 business days.
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

  useEffect(() => { if (isSubscribed) refreshHolding() }, [isSubscribed, refreshHolding])

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
                      { title: 'Verification', body: 'Methodology disclosure submitted, ledger format validated, out-of-sample test passed. Real-time execution via Alpaca.' },
                      { title: 'Execution', body: 'Trades execute on Alpaca at real market prices. Positions tracked per subscriber account for accurate P&L attribution.' },
                      { title: 'Investment', body: 'Allocate real USD from your Alpaca account to fund the agent. Cancel anytime.' },
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
                      { n: '01', title: 'Allocate Funds', desc: 'Connect your Alpaca account and allocate USD to fund the agent.' },
                      { n: '02', title: 'Agent Trades', desc: 'The algorithm trades on Alpaca at real prices. Track P&L in real-time.' },
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
                  {trades.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.66rem', letterSpacing: '.08em' }}>NO TRADES RECORDED YET</div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: '.7rem' }}>
                        <thead>
                          <tr>{['Symbol', 'Side', 'Qty', 'Fill Price', 'P&L', 'Date'].map(h => (
                            <th key={h} style={{ padding: '.5rem .7rem', textAlign: 'left', color: 'var(--faint)', fontWeight: 600, fontSize: '.52rem', letterSpacing: '.1em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h.toUpperCase()}</th>
                          ))}</tr>
                        </thead>
                        <tbody>
                          {trades.map((t, i) => {
                            const pnl = t.pnl_cents ?? 0
                            return (
                              <tr key={t.id} style={{ borderBottom: i < trades.length - 1 ? '1px solid rgba(255,255,255,.04)' : 'none' }}>
                                <td style={{ padding: '.5rem .7rem', fontWeight: 700 }}>{t.symbol}</td>
                                <td style={{ padding: '.5rem .7rem', color: t.side === 'buy' ? 'var(--green)' : 'var(--red)', fontWeight: 700, textTransform: 'uppercase', fontSize: '.63rem' }}>{t.side}</td>
                                <td style={{ padding: '.5rem .7rem', color: 'var(--muted)' }}>{Number(t.qty).toFixed(4)}</td>
                                <td style={{ padding: '.5rem .7rem', color: 'var(--muted)' }}>${Number(t.fill_price).toFixed(2)}</td>
                                <td style={{ padding: '.5rem .7rem', color: pnl > 0 ? 'var(--green)' : pnl < 0 ? 'var(--red)' : 'var(--faint)', fontWeight: pnl !== 0 ? 700 : 400 }}>
                                  {pnl !== 0 ? `${pnl > 0 ? '+' : ''}$${(pnl / 100).toFixed(2)}` : '—'}
                                </td>
                                <td style={{ padding: '.5rem .7rem', color: 'var(--faint)', whiteSpace: 'nowrap' }}>{new Date(t.filled_at).toLocaleDateString()}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
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
                    { title: 'Infrastructure', body: 'Executes via Alpaca at real market prices. Market data sourced from Alpaca. Positions tracked per subscriber account.' },
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem', background: 'rgba(22,199,132,.06)', border: '1px solid rgba(22,199,132,.16)', borderRadius: 8, padding: '.45rem .7rem', marginBottom: '.55rem' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--green)', fontWeight: 700, letterSpacing: '.06em', flex: 1 }}>ACTIVE</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: 'var(--faint)' }}>{subscribers} investors</span>
                </div>
                <button onClick={handleUnsubscribe} disabled={loading} style={{ width: '100%', padding: '.45rem', borderRadius: 7, border: '1px solid rgba(242,54,69,.18)', background: 'transparent', color: 'rgba(242,54,69,.6)', fontFamily: 'var(--font-mono)', fontSize: '.6rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '.04em' }}>
                  {loading ? 'Processing...' : 'Deallocate'}
                </button>
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
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.45rem' }}>LIVE TRADING</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: 'var(--muted)', lineHeight: 1.62, marginBottom: '.65rem' }}>
                      Invest real USD from your Alpaca account to activate live trading.
                    </div>
                    <button onClick={() => setShowInvestModal(true)} disabled={agent.alert_level === 'hard'} style={{ width: '100%', padding: '.62rem', borderRadius: 8, border: 0, background: 'linear-gradient(135deg, #3b7eff 0%, #7c5cff 100%)', color: '#fff', fontFamily: 'var(--font-head)', fontSize: '.84rem', fontWeight: 700, cursor: agent.alert_level === 'hard' ? 'not-allowed' : 'pointer', letterSpacing: '-.01em', opacity: agent.alert_level === 'hard' ? .4 : 1 }}>
                      Invest USD
                    </button>
                    {!isSubscribed && (
                      <button onClick={toggleWatchlist} style={{ marginTop: '.5rem', width: '100%', padding: '.45rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: isWatched ? 'var(--muted)' : 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.7rem', cursor: 'pointer' }}>
                        {isWatched ? '★ Remove from watchlist' : '☆ Add to watchlist'}
                      </button>
                    )}
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
