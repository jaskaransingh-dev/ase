'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const UNIVERSES = [
  { id: 'crypto', label: 'Crypto', symbols: ['BTC-USD', 'ETH-USD', 'SOL-USD'], icon: '₿' },
  { id: 'equity', label: 'Equities', symbols: ['SPY', 'QQQ', 'AAPL'], icon: '📈' },
  { id: 'etf', label: 'ETFs', symbols: ['XLK', 'XLV', 'XLF', 'SPLV'], icon: '🎯' },
  { id: 'multi', label: 'Multi-Asset', symbols: ['BTC-USD', 'ETH-USD', 'SPY'], icon: '🌐' },
]

const STRATEGIES = [
  { id: 'momentum', label: 'Momentum Crossover', desc: 'EMA fast/slow crossover with trend confirmation', color: '#4f7cff' },
  { id: 'mean_reversion', label: 'Mean Reversion', desc: 'RSI and Bollinger Band reversions', color: '#10b981' },
  { id: 'rsi', label: 'RSI Oscillator', desc: 'Buy oversold, sell overbought', color: '#f59e0b' },
  { id: 'breakout', label: 'Breakout', desc: 'Volatility squeeze and range breakouts', color: '#ff6b35' },
]

const STRATEGY_TYPES = [
  { value: 'crypto_momentum', label: 'Crypto Momentum' },
  { value: 'crypto_mean_reversion', label: 'Crypto Mean Reversion' },
  { value: 'trend_following', label: 'Trend Following' },
  { value: 'equity_momentum', label: 'Equity Momentum' },
  { value: 'equity_mean_reversion', label: 'Equity Mean Reversion' },
  { value: 'equity_rotation', label: 'Equity Rotation' },
]

function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

export default function BuildPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'builder' | 'submit'>('builder')
  const [universe, setUniverse] = useState('crypto')
  const [strategy, setStrategy] = useState('momentum')
  const [symbol, setSymbol] = useState('BTC-USD')
  const [period, setPeriod] = useState('1y')
  const [stopLoss, setStopLoss] = useState(5)
  const [positionSize, setPositionSize] = useState(25)
  const [backtesting, setBacktesting] = useState(false)
  const [result, setResult] = useState<{ totalReturn: number; sharpe: number; maxDD: number; winRate: number; trades: number } | null>(null)
  const [error, setError] = useState('')

  // Submit form
  const [submitName, setSubmitName] = useState('')
  const [submitDesc, setSubmitDesc] = useState('')
  const [submitType, setSubmitType] = useState('crypto_momentum')
  const [submitFee, setSubmitFee] = useState(2)
  const [submitting, setSubmitting] = useState(false)
  const [submitMsg, setSubmitMsg] = useState('')

  async function runBacktest() {
    setBacktesting(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          strategy: strategy === 'momentum' ? 'momentum_crossover' : strategy === 'mean_reversion' ? 'mean_reversion' : strategy === 'rsi' ? 'rsi_trend_filter' : 'volatility_breakout',
          params: { fast_window: 20, slow_window: 50 },
          period,
          fee: 0.001,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Backtest failed')
      setResult({
        totalReturn: data.stats?.totalReturnPct ?? 0,
        sharpe: data.stats?.sharpeRatio ?? 0,
        maxDD: data.stats?.maxDrawdownPct ?? 0,
        winRate: data.stats?.winRate ?? 0,
        trades: data.stats?.totalTrades ?? 0,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backtest failed')
    }
    setBacktesting(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!submitName.trim()) { setSubmitMsg('Agent name is required'); return }
    if (!submitDesc.trim()) { setSubmitMsg('Description is required'); return }
    setSubmitting(true)
    setSubmitMsg('')
    try {
      const res = await fetch('/api/agents/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: submitName,
          description: submitDesc,
          strategy_type: submitType,
          monthly_fee_pct: submitFee,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Submission failed')
      setSubmitMsg('Agent submitted for review! We will notify you once it is approved.')
      setSubmitName('')
      setSubmitDesc('')
      setSubmitFee(2)
    } catch (e) {
      setSubmitMsg(e instanceof Error ? e.message : 'Submission failed')
    }
    setSubmitting(false)
  }

  const selectedStrategy = STRATEGIES.find(s => s.id === strategy)
  const selectedUniverse = UNIVERSES.find(u => u.id === universe)

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div className="eyebrow" style={{ marginBottom: '.25rem' }}>CREATE</div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-.02em' }}>Build</h1>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {([
          { id: 'builder', label: 'Strategy Builder' },
          { id: 'submit', label: 'Submit Agent' },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '0.6rem 1.5rem',
              borderRadius: '8px 8px 0 0',
              border: 'none',
              background: tab === t.id ? 'var(--bg2)' : 'transparent',
              color: tab === t.id ? 'var(--blue2)' : 'var(--muted)',
              fontSize: '.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              borderBottom: tab === t.id ? '2px solid var(--blue)' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── STRATEGY BUILDER ─────────────────────────────────── */}
      {tab === 'builder' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Universe */}
          <section style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem' }}>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Choose Universe</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '.75rem' }}>
              {UNIVERSES.map(u => (
                <button
                  key={u.id}
                  onClick={() => { setUniverse(u.id); setSymbol(u.symbols[0]) }}
                  style={{
                    padding: '1rem',
                    borderRadius: 12,
                    border: `1px solid ${universe === u.id ? 'rgba(59,127,255,.4)' : 'var(--border)'}`,
                    background: universe === u.id ? 'rgba(59,127,255,.08)' : 'var(--bg3)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all .15s',
                  }}
                >
                  <div style={{ fontSize: '1.4rem', marginBottom: '.35rem' }}>{u.icon}</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '.82rem', color: universe === u.id ? 'var(--blue2)' : 'var(--white)' }}>{u.label}</div>
                </button>
              ))}
            </div>
            {/* Symbol picker */}
            {selectedUniverse && (
              <div style={{ marginTop: '.75rem' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.4rem' }}>SELECT SYMBOL</div>
                <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
                  {selectedUniverse.symbols.map(s => (
                    <button key={s} onClick={() => setSymbol(s)} style={{
                      padding: '.3rem .75rem',
                      borderRadius: 7,
                      border: `1px solid ${symbol === s ? 'rgba(59,127,255,.4)' : 'var(--border)'}`,
                      background: symbol === s ? 'rgba(59,127,255,.1)' : 'transparent',
                      color: symbol === s ? 'var(--blue2)' : 'var(--muted)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '.7rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Strategy */}
          <section style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem' }}>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Choose Strategy Logic</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '.75rem' }}>
              {STRATEGIES.map(s => (
                <button
                  key={s.id}
                  onClick={() => setStrategy(s.id)}
                  style={{
                    padding: '1rem',
                    borderRadius: 12,
                    border: `1px solid ${strategy === s.id ? s.color + '60' : 'var(--border)'}`,
                    background: strategy === s.id ? `${s.color}10` : 'var(--bg3)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all .15s',
                  }}
                >
                  <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '.85rem', color: strategy === s.id ? s.color : 'var(--white)', marginBottom: '.25rem' }}>{s.label}</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--muted)', lineHeight: 1.4 }}>{s.desc}</div>
                </button>
              ))}
            </div>
          </section>

          {/* Risk Controls */}
          <section style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem' }}>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Risk Controls</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.5rem' }}>
                  <label style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', letterSpacing: '.08em' }}>STOP LOSS</label>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', fontWeight: 700, color: 'var(--red)' }}>-{stopLoss}%</span>
                </div>
                <input type="range" min={1} max={20} value={stopLoss} onChange={e => setStopLoss(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--blue)' }} />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.5rem' }}>
                  <label style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', letterSpacing: '.08em' }}>POSITION SIZE</label>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', fontWeight: 700, color: 'var(--white)' }}>{positionSize}%</span>
                </div>
                <input type="range" min={5} max={100} value={positionSize} onChange={e => setPositionSize(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--blue)' }} />
              </div>
            </div>
          </section>

          {/* Time Period */}
          <section style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem' }}>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Backtest Period</h2>
            <div style={{ display: 'flex', gap: '.4rem' }}>
              {[['1mo', '1M'], ['3mo', '3M'], ['6mo', '6M'], ['1y', '1Y'], ['2y', '2Y'], ['5y', '5Y']].map(([val, label]) => (
                <button key={val} onClick={() => setPeriod(val)} style={{
                  padding: '.45rem 1.1rem',
                  borderRadius: 8,
                  border: `1px solid ${period === val ? 'rgba(59,127,255,.4)' : 'var(--border)'}`,
                  background: period === val ? 'rgba(59,127,255,.1)' : 'var(--bg3)',
                  color: period === val ? 'var(--blue2)' : 'var(--muted)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}>
                  {label}
                </button>
              ))}
            </div>
          </section>

          {/* Summary */}
          <div style={{ padding: '1rem 1.25rem', background: 'rgba(59,127,255,.04)', border: '1px solid rgba(59,127,255,.15)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--faint)' }}>
              SUMMARY:
            </div>
            {[
              { label: 'Symbol', value: symbol },
              { label: 'Strategy', value: selectedStrategy?.label ?? '—' },
              { label: 'Stop Loss', value: `-${stopLoss}%` },
              { label: 'Position', value: `${positionSize}%` },
              { label: 'Period', value: period.toUpperCase() },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', gap: '.35rem', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)' }}>{item.label}:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.68rem', fontWeight: 700, color: 'var(--white)' }}>{item.value}</span>
              </div>
            ))}
          </div>

          {/* Run */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
            <button
              onClick={runBacktest}
              disabled={backtesting}
              style={{
                padding: '.85rem',
                borderRadius: 12,
                border: 0,
                background: backtesting ? 'rgba(59,127,255,.5)' : 'var(--blue)',
                color: '#fff',
                fontFamily: 'var(--font-head)',
                fontSize: '.9rem',
                fontWeight: 700,
                cursor: backtesting ? 'not-allowed' : 'pointer',
                letterSpacing: '-.01em',
              }}
            >
              {backtesting ? 'Running Backtest…' : 'Run Backtest →'}
            </button>

            {error && (
              <div style={{ padding: '.75rem 1rem', background: 'rgba(242,54,69,.08)', border: '1px solid rgba(242,54,69,.2)', borderRadius: 10, fontFamily: 'var(--font-mono)', fontSize: '.72rem', color: 'var(--red)' }}>
                {error}
              </div>
            )}
          </div>

          {/* Results */}
          {result && (
            <section style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>Results</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '.75rem', marginBottom: '1.25rem' }}>
                {[
                  { label: 'Total Return', value: fmtPct(result.totalReturn), color: result.totalReturn >= 0 ? 'var(--mint)' : 'var(--red)' },
                  { label: 'Sharpe Ratio', value: result.sharpe.toFixed(2), color: result.sharpe > 1 ? 'var(--white)' : 'var(--muted)' },
                  { label: 'Max Drawdown', value: fmtPct(-result.maxDD), color: 'var(--red)' },
                  { label: 'Win Rate', value: `${result.winRate.toFixed(1)}%`, color: 'var(--white)' },
                  { label: 'Total Trades', value: result.trades.toString(), color: 'var(--white)' },
                ].map(item => (
                  <div key={item.label} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '.85rem .75rem', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.35rem' }}>{item.label.toUpperCase()}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 800, color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '.75rem' }}>
                <Link href={`/dashboard/backtest?symbol=${symbol}&strategy=${strategy}&period=${period}`} style={{ padding: '.6rem 1.25rem', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: '.78rem', fontWeight: 600, textDecoration: 'none' }}>
                  Advanced Backtest →
                </Link>
                <button style={{ padding: '.6rem 1.25rem', borderRadius: 10, border: 0, background: 'var(--blue)', color: '#fff', fontSize: '.78rem', fontWeight: 700, cursor: 'pointer' }}>
                  Deploy Agent →
                </button>
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── SUBMIT AGENT ───────────────────────────────────── */}
      {tab === 'submit' && (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <section style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem' }}>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>Submit Your Agent</h2>
            <p style={{ fontSize: '.82rem', color: 'var(--muted)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              Submit a verified strategy to be listed on the ASE marketplace. Your strategy will be reviewed within 2-3 business days.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.45rem' }}>AGENT NAME</label>
                <input
                  type="text"
                  value={submitName}
                  onChange={e => setSubmitName(e.target.value)}
                  placeholder="e.g. Bitcoin Momentum Alpha"
                  className="input-base"
                  maxLength={60}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.45rem' }}>STRATEGY TYPE</label>
                <select
                  value={submitType}
                  onChange={e => setSubmitType(e.target.value)}
                  className="input-base"
                  style={{ cursor: 'pointer' }}
                >
                  {STRATEGY_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.45rem' }}>DESCRIPTION</label>
                <textarea
                  value={submitDesc}
                  onChange={e => setSubmitDesc(e.target.value)}
                  placeholder="Describe your trading strategy, indicators used, risk management approach, and historical performance..."
                  rows={5}
                  className="input-base"
                  style={{ resize: 'vertical', lineHeight: 1.6 }}
                  maxLength={500}
                />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', marginTop: '.3rem', textAlign: 'right' }}>{submitDesc.length}/500</div>
              </div>

              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.45rem' }}>PERFORMANCE FEE (%)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                  <input
                    type="number"
                    value={submitFee}
                    onChange={e => setSubmitFee(Number(e.target.value))}
                    min={0}
                    max={50}
                    step={0.5}
                    className="input-base"
                    style={{ width: 100 }}
                  />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', color: 'var(--muted)' }}>% of profits charged to subscribers</span>
                </div>
              </div>
            </div>
          </section>

          <div style={{ background: 'rgba(59,127,255,.04)', border: '1px solid rgba(59,127,255,.15)', borderRadius: 12, padding: '1rem 1.25rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.4rem' }}>SUBMISSION CHECKLIST</div>
            {[
              'Strategy logic is fully disclosed',
              'Backtesting results attached (optional)',
              'You have verified historical performance',
              'Risk parameters are clearly defined',
            ].map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '.35rem' }}>
                <div style={{ width: 14, height: 14, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg3)', flexShrink: 0 }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.68rem', color: 'var(--muted)' }}>{item}</span>
              </div>
            ))}
          </div>

          {submitMsg && (
            <div style={{ padding: '.75rem 1rem', background: submitMsg.includes('submitted') ? 'rgba(0,229,153,.08)' : 'rgba(242,54,69,.08)', border: `1px solid ${submitMsg.includes('submitted') ? 'rgba(0,229,153,.2)' : 'rgba(242,54,69,.2)'}`, borderRadius: 10, fontFamily: 'var(--font-mono)', fontSize: '.72rem', color: submitMsg.includes('submitted') ? 'var(--mint)' : 'var(--red)' }}>
              {submitMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: '.85rem',
              borderRadius: 12,
              border: 0,
              background: submitting ? 'rgba(59,127,255,.5)' : 'var(--blue)',
              color: '#fff',
              fontFamily: 'var(--font-head)',
              fontSize: '.9rem',
              fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer',
              letterSpacing: '-.01em',
            }}
          >
            {submitting ? 'Submitting…' : 'Submit for Review →'}
          </button>

          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--faint)', textAlign: 'center', lineHeight: 1.6 }}>
            By submitting, you confirm that all information is accurate and that you have the right to list this strategy.
            ASE reserves the right to reject submissions that do not meet our quality standards.
          </div>
        </form>
      )}
    </div>
  )
}
