'use client'

import { FormEvent, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, CheckCircle, BarChart3, TrendingUp, Shield, ArrowLeft, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'

interface BacktestStats {
  totalReturn: number
  sharpe: number
  maxDD: number
  winRate: number
  totalTrades: number
  sortino: number
  profitFactor: number
  avgTrade: number
}

interface CustomIndicator {
  id: string
  type: 'sma' | 'ema' | 'rsi' | 'atr'
  params: Record<string, number>
}

interface CustomStrategy {
  name: string
  description: string
  indicators: CustomIndicator[]
  entryRules: string
  exitRules: string
}

const THRESHOLDS = {
  sharpe: 0.5,
  maxDD: 50,
  winRate: 40,
  minTrades: 20,
}

const STRATEGY_TYPES = [
  { value: 'crypto_momentum', label: 'Crypto Momentum', desc: 'Trend-following on crypto assets' },
  { value: 'crypto_mean_reversion', label: 'Crypto Mean Reversion', desc: 'Buy dips in crypto markets' },
  { value: 'trend_following', label: 'Trend Following', desc: 'Capture directional moves' },
  { value: 'momentum', label: 'Momentum', desc: 'Classic momentum strategy' },
  { value: 'mean_reversion', label: 'Mean Reversion', desc: 'Bet on price normalization' },
]

const BACKTEST_STRATEGIES = [
  { value: 'momentum_crossover', label: 'Momentum Crossover', desc: 'Fast/slow MA crossover' },
  { value: 'mean_reversion', label: 'Mean Reversion', desc: 'Z-score based reversion' },
  { value: 'rsi_trend_filter', label: 'RSI Trend Filter', desc: 'RSI + trend MA filter' },
  { value: 'volatility_breakout', label: 'Volatility Breakout', desc: 'ATR trailing stop' },
  { value: 'dual_momentum', label: 'Dual Momentum', desc: 'Absolute + relative momentum' },
  { value: 'rsi_mean_reversion', label: 'RSI Mean Reversion', desc: 'Pure RSI overbought/oversold' },
  { value: 'macd_trend', label: 'MACD Trend', desc: 'MACD crossover' },
  { value: 'custom', label: 'Custom Strategy', desc: 'Define your own rules' },
]

const ASSET_CLASSES = [
  { value: 'crypto', label: 'Crypto', desc: 'BTC, ETH, DeFi tokens' },
  { value: 'defi', label: 'DeFi', desc: 'Protocols and yield' },
  { value: 'multi', label: 'Multi-Asset', desc: 'Cross-asset strategy' },
]

type FormState = {
  name: string
  slug: string
  ticker: string
  description: string
  strategy_description: string
  plain_english: string
  best_for: string
  main_risk: string
  primary_symbol: string
  strategy_type: string
  backtest_strategy: string
  asset_class: string
  publish: boolean
  share_price_cents: number
  max_aum_cents: number
  monthly_fee_cents: number
}

const initialState: FormState = {
  name: '',
  slug: '',
  ticker: '',
  description: '',
  strategy_description: '',
  plain_english: '',
  best_for: '',
  main_risk: '',
  primary_symbol: 'BTC-USD',
  strategy_type: 'crypto_momentum',
  backtest_strategy: 'momentum_crossover',
  asset_class: 'crypto',
  publish: true,
  share_price_cents: 10000,
  max_aum_cents: 100000000,
  monthly_fee_cents: 0,
}

export default function AgentSubmitClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editSlug = searchParams.get('edit')

  const [form, setForm] = useState<FormState>(initialState)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingAgent, setLoadingAgent] = useState(!!editSlug)
  const [error, setError] = useState('')
  const [createdSlug, setCreatedSlug] = useState('')
  const [backtestStats, setBacktestStats] = useState<BacktestStats>({
    totalReturn: 0,
    sharpe: 0,
    maxDD: 0,
    winRate: 0,
    totalTrades: 0,
    sortino: 0,
    profitFactor: 0,
    avgTrade: 0,
  })
  const [validationError, setValidationError] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [originalSlug, setOriginalSlug] = useState('')
  const [expandedSection, setExpandedSection] = useState<string | null>('basic')
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    if (editSlug) {
      loadAgent(editSlug)
    }
  }, [editSlug])

  function autoGenerateSlug(name: string) {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    setForm(prev => ({ ...prev, slug }))
  }

  function autoGenerateTicker(name: string) {
    const words = name.split(/\s+/)
    if (words.length >= 2) {
      const ticker = words
        .slice(0, 3)
        .map(w => w[0])
        .join('')
        .toUpperCase()
      setForm(prev => ({ ...prev, ticker }))
    } else {
      setForm(prev => ({ ...prev, ticker: name.slice(0, 4).toUpperCase() }))
    }
  }

  async function loadAgent(slug: string) {
    setLoadingAgent(true)
    try {
      const res = await fetch(`/api/agents/${slug}`)
      const json = await res.json()
      if (json.agent) {
        const agent = json.agent
        setForm({
          name: agent.name || '',
          slug: agent.slug || '',
          ticker: agent.ticker || '',
          description: agent.description || '',
          strategy_description: agent.strategy_description || '',
          plain_english: agent.plain_english || '',
          best_for: agent.best_for || '',
          main_risk: agent.main_risk || '',
          primary_symbol: agent.primary_symbol?.replace(/\//g, '-') || 'BTC-USD',
          strategy_type: agent.strategy_type || 'crypto_momentum',
          backtest_strategy: agent.backtest_strategy || 'momentum_crossover',
          asset_class: agent.asset_class || 'crypto',
          publish: agent.status === 'active',
          share_price_cents: agent.share_price_cents || 10000,
          max_aum_cents: agent.max_aum_cents || 100000000,
          monthly_fee_cents: agent.monthly_fee_cents || 0,
        })
        setOriginalSlug(agent.slug)
        setIsEditing(true)

        if (agent.backtest_stats) {
          const stats = agent.backtest_stats
          setBacktestStats({
            totalReturn: stats.total_return_pct || 0,
            sharpe: stats.sharpe_ratio || 0,
            maxDD: stats.max_drawdown_pct || 0,
            winRate: stats.win_rate_pct || 0,
            totalTrades: stats.total_trades || 0,
            sortino: stats.sortino_ratio || 0,
            profitFactor: stats.profit_factor || 0,
            avgTrade: stats.avg_trade_return_pct || 0,
          })
        }
      }
    } catch (err) {
      setError('Failed to load agent')
    }
    setLoadingAgent(false)
  }

  function validateBacktestStats(stats: BacktestStats): { valid: boolean; issues: string[] } {
    const issues: string[] = []

    if (stats.sharpe < THRESHOLDS.sharpe) {
      issues.push(`Sharpe ratio ${stats.sharpe.toFixed(2)} is below minimum ${THRESHOLDS.sharpe}`)
    }
    if (stats.maxDD > THRESHOLDS.maxDD) {
      issues.push(`Max drawdown ${stats.maxDD.toFixed(1)}% exceeds limit of ${THRESHOLDS.maxDD}%`)
    }
    if (stats.winRate < THRESHOLDS.winRate) {
      issues.push(`Win rate ${stats.winRate.toFixed(1)}% is below minimum ${THRESHOLDS.winRate}%`)
    }
    if (stats.totalTrades < THRESHOLDS.minTrades) {
      issues.push(`Trade count ${stats.totalTrades} is below minimum ${THRESHOLDS.minTrades}`)
    }

    return { valid: issues.length === 0, issues }
  }

  function handleStatsInput(field: keyof BacktestStats, value: string) {
    const numValue = parseFloat(value)
    if (isNaN(numValue) && value !== '') return

    const newStats = { ...backtestStats, [field]: isNaN(numValue) ? 0 : numValue } as BacktestStats
    setBacktestStats(newStats)

    const validation = validateBacktestStats(newStats)
    if (validation.issues.length > 0) {
      setValidationError(validation.issues.join('. '))
    } else {
      setValidationError('')
    }
  }

  function toggleSection(section: string) {
    setExpandedSection(expandedSection === section ? null : section)
  }

  async function handle(e: FormEvent) {
    e.preventDefault()

    if (form.publish) {
      const validation = validateBacktestStats(backtestStats)
      if (!validation.valid) {
        setError('Backtest validation failed: ' + validation.issues.join('. '))
        return
      }
    }

    if (!form.name.trim()) {
      setError('Agent name is required')
      return
    }
    if (!form.description.trim()) {
      setError('Description is required')
      return
    }

    setLoading(true)
    setError('')

    try {
      const payload = {
        name: form.name,
        slug: form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        ticker: form.ticker || form.name.slice(0, 4).toUpperCase(),
        description: form.description,
        strategy_description: form.strategy_description,
        plain_english: form.plain_english,
        best_for: form.best_for,
        main_risk: form.main_risk,
        primary_symbol: form.primary_symbol.replace(/-/g, '/'),
        strategy_type: form.strategy_type,
        backtest_strategy: form.backtest_strategy,
        asset_class: form.asset_class,
        publish: form.publish,
        share_price_cents: form.share_price_cents,
        max_aum_cents: form.max_aum_cents,
        monthly_fee_cents: form.monthly_fee_cents,
        backtest_stats: form.publish ? {
          totalReturnPct: backtestStats.totalReturn,
          sharpeRatio: backtestStats.sharpe,
          maxDrawdownPct: backtestStats.maxDD,
          winRate: backtestStats.winRate,
          totalTrades: backtestStats.totalTrades,
          sortinoRatio: backtestStats.sortino,
          profitFactor: backtestStats.profitFactor,
          avgTradeReturnPct: backtestStats.avgTrade,
        } : null,
      }

      const res = isEditing
        ? await fetch(`/api/agents/${originalSlug}?slug=${form.slug}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/agents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || json.issues?.[0] || 'Submission failed')
      }

      setCreatedSlug(json.agent?.slug ?? form.slug)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed')
    } finally {
      setLoading(false)
    }
  }

  const validation = validateBacktestStats(backtestStats)

  if (loadingAgent) {
    return (
      <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto', marginBottom: '1rem' }} />
        <p style={{ color: 'var(--muted)' }}>Loading agent...</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem' }}>
      <Link href="/builders" style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: 'var(--faint)', display: 'inline-flex', alignItems: 'center', gap: '.35rem', marginBottom: '1.5rem' }}>
        <ArrowLeft size={12} />
        Back to Builders
      </Link>

      <div className="eyebrow" style={{ marginBottom: '.35rem', color: 'var(--blue)' }}>{isEditing ? 'EDIT AGENT' : 'CREATE AGENT'}</div>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', fontWeight: 800, marginBottom: '.5rem' }}>
        {isEditing ? 'Edit your agent' : 'List a trading strategy'}
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: '.95rem', lineHeight: 1.75, marginBottom: '2rem' }}>
        {isEditing
          ? 'Update your agent details and statistics.'
          : 'Fill out all the details below. Complete backtest statistics are required to publish directly to the exchange.'
        }
      </p>

      {done ? (
        <div style={{ background: 'var(--bg2)', border: '1px solid rgba(22,199,132,.2)', borderRadius: 20, padding: '2.5rem', textAlign: 'center' }}>
          <CheckCircle size={48} style={{ color: 'var(--mint)', marginBottom: '1rem' }} />
          <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.3rem', fontWeight: 800, marginBottom: '.5rem' }}>
            {isEditing ? 'Agent updated!' : `Agent ${validation.valid ? 'published' : 'created'}`}
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: '.9rem', marginBottom: '1.5rem' }}>
            {isEditing
              ? 'Your agent has been updated successfully.'
              : createdSlug
                ? `Your agent is now ${validation.valid ? 'live on the exchange!' : 'saved as pending.'}`
                : 'Your agent has been saved.'
            }
          </p>
          <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/builders" className="btn-secondary">Back to Builders</Link>
            {createdSlug && <Link href={`/agents/${createdSlug}`} target="_blank" rel="noopener noreferrer" className="btn-primary">View Agent</Link>}
          </div>
        </div>
      ) : (
        <form onSubmit={handle}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Basic Info Section */}
            <div className="card" style={{ overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => toggleSection('basic')}
                style={{
                  width: '100%',
                  padding: '1rem 1.25rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--bg3)',
                  border: 0,
                  cursor: 'pointer',
                  color: 'var(--white)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: 'var(--blue)' }}>01</span>
                  <span style={{ fontWeight: 600, fontSize: '.95rem' }}>Basic Information</span>
                </div>
                {expandedSection === 'basic' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>

              {expandedSection === 'basic' && (
                <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.6rem', letterSpacing: '.06em', color: 'var(--faint)', marginBottom: '.35rem' }}>
                        AGENT NAME *
                      </label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={e => {
                          setForm(prev => ({ ...prev, name: e.target.value }))
                          if (!form.slug) {
                            autoGenerateSlug(e.target.value)
                            autoGenerateTicker(e.target.value)
                          }
                        }}
                        placeholder="BTC Momentum Alpha"
                        className="input-base"
                        required
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.6rem', letterSpacing: '.06em', color: 'var(--faint)', marginBottom: '.35rem' }}>
                        TICKER (4 CHAR MAX)
                      </label>
                      <input
                        type="text"
                        value={form.ticker}
                        onChange={e => setForm(prev => ({ ...prev, ticker: e.target.value.slice(0, 4).toUpperCase() }))}
                        placeholder="BTCM"
                        className="input-base"
                        maxLength={4}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.6rem', letterSpacing: '.06em', color: 'var(--faint)', marginBottom: '.35rem' }}>
                        URL SLUG (AUTO-GENERATED)
                      </label>
                      <input
                        type="text"
                        value={form.slug}
                        onChange={e => setForm(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                        placeholder="btc-momentum-alpha"
                        className="input-base"
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.6rem', letterSpacing: '.06em', color: 'var(--faint)', marginBottom: '.35rem' }}>
                        TRADING SYMBOL *
                      </label>
                      <input
                        type="text"
                        value={form.primary_symbol}
                        onChange={e => setForm(prev => ({ ...prev, primary_symbol: e.target.value.toUpperCase() }))}
                        placeholder="BTC-USD"
                        className="input-base"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.6rem', letterSpacing: '.06em', color: 'var(--faint)', marginBottom: '.35rem' }}>
                      DESCRIPTION *
                      <span style={{ color: 'var(--muted)', marginLeft: '.5rem' }}>Public-facing summary</span>
                    </label>
                    <textarea
                      value={form.description}
                      onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Describe your strategy's edge, what markets it trades, and how it manages risk."
                      rows={3}
                      className="input-base"
                      style={{ resize: 'vertical' }}
                      required
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Strategy Section */}
            <div className="card" style={{ overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => toggleSection('strategy')}
                style={{
                  width: '100%',
                  padding: '1rem 1.25rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--bg3)',
                  border: 0,
                  cursor: 'pointer',
                  color: 'var(--white)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: 'var(--blue)' }}>02</span>
                  <span style={{ fontWeight: 600, fontSize: '.95rem' }}>Strategy Configuration</span>
                </div>
                {expandedSection === 'strategy' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>

              {expandedSection === 'strategy' && (
                <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.6rem', letterSpacing: '.06em', color: 'var(--faint)', marginBottom: '.35rem' }}>
                        STRATEGY TYPE
                      </label>
                      <select
                        value={form.strategy_type}
                        onChange={e => setForm(prev => ({ ...prev, strategy_type: e.target.value }))}
                        className="input-base"
                      >
                        {STRATEGY_TYPES.map(s => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.6rem', letterSpacing: '.06em', color: 'var(--faint)', marginBottom: '.35rem' }}>
                        BACKTEST ENGINE
                      </label>
                      <select
                        value={form.backtest_strategy}
                        onChange={e => setForm(prev => ({ ...prev, backtest_strategy: e.target.value }))}
                        className="input-base"
                      >
                        {BACKTEST_STRATEGIES.map(s => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.6rem', letterSpacing: '.06em', color: 'var(--faint)', marginBottom: '.35rem' }}>
                        ASSET CLASS
                      </label>
                      <select
                        value={form.asset_class}
                        onChange={e => setForm(prev => ({ ...prev, asset_class: e.target.value }))}
                        className="input-base"
                      >
                        {ASSET_CLASSES.map(a => (
                          <option key={a.value} value={a.value}>{a.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.6rem', letterSpacing: '.06em', color: 'var(--faint)', marginBottom: '.35rem' }}>
                      STRATEGY DETAILS (OPTIONAL)
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
                      <input
                        type="text"
                        value={form.strategy_description}
                        onChange={e => setForm(prev => ({ ...prev, strategy_description: e.target.value }))}
                        placeholder="Technical description"
                        className="input-base"
                      />
                      <input
                        type="text"
                        value={form.plain_english}
                        onChange={e => setForm(prev => ({ ...prev, plain_english: e.target.value }))}
                        placeholder="Plain English summary"
                        className="input-base"
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
                    <input
                      type="text"
                      value={form.best_for}
                      onChange={e => setForm(prev => ({ ...prev, best_for: e.target.value }))}
                      placeholder="Best for: trending markets"
                      className="input-base"
                    />
                    <input
                      type="text"
                      value={form.main_risk}
                      onChange={e => setForm(prev => ({ ...prev, main_risk: e.target.value }))}
                      placeholder="Main risk: whipsaws"
                      className="input-base"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Pricing Section */}
            <div className="card" style={{ overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => toggleSection('pricing')}
                style={{
                  width: '100%',
                  padding: '1rem 1.25rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--bg3)',
                  border: 0,
                  cursor: 'pointer',
                  color: 'var(--white)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: 'var(--blue)' }}>03</span>
                  <span style={{ fontWeight: 600, fontSize: '.95rem' }}>Pricing & Limits</span>
                </div>
                {expandedSection === 'pricing' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>

              {expandedSection === 'pricing' && (
                <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.6rem', letterSpacing: '.06em', color: 'var(--faint)', marginBottom: '.35rem' }}>
                        SHARE PRICE (CENTS)
                      </label>
                      <input
                        type="number"
                        value={form.share_price_cents}
                        onChange={e => setForm(prev => ({ ...prev, share_price_cents: parseInt(e.target.value) || 10000 }))}
                        className="input-base"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      />
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--muted)', marginTop: '.2rem' }}>
                        = ${(form.share_price_cents / 100).toFixed(2)} per share
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.6rem', letterSpacing: '.06em', color: 'var(--faint)', marginBottom: '.35rem' }}>
                        MAX AUM (CENTS)
                      </label>
                      <input
                        type="number"
                        value={form.max_aum_cents}
                        onChange={e => setForm(prev => ({ ...prev, max_aum_cents: parseInt(e.target.value) || 100000000 }))}
                        className="input-base"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      />
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--muted)', marginTop: '.2rem' }}>
                        Cap: ${(form.max_aum_cents / 100).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.6rem', letterSpacing: '.06em', color: 'var(--faint)', marginBottom: '.35rem' }}>
                        MONTHLY FEE (CENTS)
                      </label>
                      <input
                        type="number"
                        value={form.monthly_fee_cents}
                        onChange={e => setForm(prev => ({ ...prev, monthly_fee_cents: parseInt(e.target.value) || 0 }))}
                        className="input-base"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      />
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--muted)', marginTop: '.2rem' }}>
                        = ${(form.monthly_fee_cents / 100).toFixed(2)}/month
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Backtest Stats Section */}
            <div className="card" style={{ overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => toggleSection('backtest')}
                style={{
                  width: '100%',
                  padding: '1rem 1.25rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--bg3)',
                  border: 0,
                  cursor: 'pointer',
                  color: 'var(--white)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: 'var(--blue)' }}>04</span>
                  <span style={{ fontWeight: 600, fontSize: '.95rem' }}>Backtest Statistics</span>
                  {validation.valid && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--mint)', background: 'var(--mint-dim)', padding: '.2rem .5rem', borderRadius: 4 }}>
                      ✓ PASSED
                    </span>
                  )}
                  {!validation.valid && backtestStats.totalTrades > 0 && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--red)', background: 'var(--red-dim)', padding: '.2rem .5rem', borderRadius: 4 }}>
                      ✗ FAILED
                    </span>
                  )}
                </div>
                {expandedSection === 'backtest' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>

              {expandedSection === 'backtest' && (
                <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '.75rem' }}>
                    <div>
                      <label style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', marginBottom: '.3rem' }}>
                        <span>TOTAL RETURN %</span>
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={backtestStats.totalReturn || ''}
                        onChange={e => handleStatsInput('totalReturn', e.target.value)}
                        placeholder="24.5"
                        className="input-base"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', marginBottom: '.3rem' }}>
                        <span>SHARPE RATIO</span>
                        <span style={{ color: backtestStats.sharpe >= THRESHOLDS.sharpe ? 'var(--mint)' : 'var(--red)' }}>
                          ≥{THRESHOLDS.sharpe}
                        </span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={backtestStats.sharpe || ''}
                        onChange={e => handleStatsInput('sharpe', e.target.value)}
                        placeholder="1.5"
                        className="input-base"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', marginBottom: '.3rem' }}>
                        <span>MAX DD %</span>
                        <span style={{ color: backtestStats.maxDD <= THRESHOLDS.maxDD ? 'var(--mint)' : 'var(--red)' }}>
                          &lt;{THRESHOLDS.maxDD}%
                        </span>
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={backtestStats.maxDD || ''}
                        onChange={e => handleStatsInput('maxDD', e.target.value)}
                        placeholder="-12.5"
                        className="input-base"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', marginBottom: '.3rem' }}>
                        <span>WIN RATE %</span>
                        <span style={{ color: backtestStats.winRate >= THRESHOLDS.winRate ? 'var(--mint)' : 'var(--red)' }}>
                          ≥{THRESHOLDS.winRate}%
                        </span>
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={backtestStats.winRate || ''}
                        onChange={e => handleStatsInput('winRate', e.target.value)}
                        placeholder="55"
                        className="input-base"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', marginBottom: '.3rem' }}>
                        TOTAL TRADES
                      </label>
                      <input
                        type="number"
                        value={backtestStats.totalTrades || ''}
                        onChange={e => handleStatsInput('totalTrades', e.target.value)}
                        placeholder="150"
                        className="input-base"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', marginBottom: '.3rem' }}>
                        SORTINO RATIO
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={backtestStats.sortino || ''}
                        onChange={e => handleStatsInput('sortino', e.target.value)}
                        placeholder="2.0"
                        className="input-base"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', marginBottom: '.3rem' }}>
                        PROFIT FACTOR
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={backtestStats.profitFactor || ''}
                        onChange={e => handleStatsInput('profitFactor', e.target.value)}
                        placeholder="1.8"
                        className="input-base"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', marginBottom: '.3rem' }}>
                        AVG TRADE %
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={backtestStats.avgTrade || ''}
                        onChange={e => handleStatsInput('avgTrade', e.target.value)}
                        placeholder="1.2"
                        className="input-base"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      />
                    </div>
                  </div>

                  {validationError && (
                    <div style={{ padding: '.75rem', background: 'var(--red-dim)', border: '1px solid var(--red-border)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--red)' }}>
                      {validationError}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.75rem', background: 'rgba(79,140,255,.06)', border: '1px solid rgba(79,140,255,.15)', borderRadius: 10 }}>
                    <Shield size={16} style={{ color: 'var(--blue)', flexShrink: 0 }} />
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                      <strong style={{ color: 'var(--white)' }}>Publishing requires passing all thresholds:</strong>
                      {' '}Sharpe ≥ {THRESHOLDS.sharpe}, Max DD &lt; {THRESHOLDS.maxDD}%, Win Rate ≥ {THRESHOLDS.winRate}%, Trades ≥ {THRESHOLDS.minTrades}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Publish Toggle */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}>
                <div
                  onClick={() => setForm(prev => ({ ...prev, publish: !prev.publish }))}
                  style={{
                    width: 48,
                    height: 26,
                    borderRadius: 13,
                    background: form.publish ? 'var(--mint)' : 'var(--bg4)',
                    border: `1px solid ${form.publish ? 'var(--mint-border)' : 'var(--border2)'}`,
                    position: 'relative',
                    transition: 'all .2s ease',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: 'white',
                    position: 'absolute',
                    top: 2,
                    left: form.publish ? 24 : 2,
                    transition: 'left .2s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,.3)',
                  }} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '.95rem', color: 'var(--white)' }}>
                    {form.publish ? 'Publish immediately to exchange' : 'Save as draft (pending review)'}
                  </div>
                  <div style={{ fontSize: '.8rem', color: 'var(--muted)', marginTop: '.15rem' }}>
                    {form.publish
                      ? 'Agent will be live and available for subscribers immediately (requires valid backtest stats)'
                      : 'Agent will be saved as pending. You can publish it later once backtest validation passes.'
                    }
                  </div>
                </div>
              </label>
            </div>

            {/* Error */}
            {error && (
              <div style={{ padding: '.75rem 1rem', background: 'rgba(255,90,95,.08)', border: '1px solid rgba(255,90,95,.2)', borderRadius: 12, color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: '.72rem' }}>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || (form.publish && !validation.valid)}
              className="btn-primary"
              style={{
                justifyContent: 'center',
                padding: '1rem',
                fontSize: '1rem',
                opacity: (form.publish && !validation.valid) ? 0.5 : 1,
              }}
            >
              {loading ? (
                <><span className="spinner" />{isEditing ? 'Saving...' : 'Publishing...'}</>
              ) : isEditing ? (
                'Save Changes'
              ) : form.publish ? (
                validation.valid ? 'Publish to Exchange →' : 'Fix Validation Issues'
              ) : (
                'Save as Draft →'
              )}
            </button>

          </div>
        </form>
      )}

      {/* Flow info */}
      <div style={{ marginTop: '1.5rem', padding: '1rem 1.25rem', background: 'rgba(255,255,255,.02)', border: '1px solid var(--border)', borderRadius: 14 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', letterSpacing: '.08em', color: 'var(--faint)', marginBottom: '.35rem' }}>NEXT STEPS</div>
        <p style={{ color: 'var(--muted)', fontSize: '.82rem', margin: 0, lineHeight: 1.65 }}>
          After publishing, your agent will appear on the exchange. Connect your broker account to start trading with real capital.
        </p>
      </div>
    </div>
  )
}
