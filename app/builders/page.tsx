'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import PublicNav from '@/components/ui/PublicNav'
import { Plus, List, TrendingUp, Shield, BarChart3, Clock, CheckCircle, XCircle, AlertCircle, Settings } from 'lucide-react'

interface MyAgent {
  id: string
  slug: string
  name: string
  description: string | null
  ticker: string | null
  status: string
  display_status: string
  strategy_type: string | null
  primary_symbol: string | null
  backtest_stats: any
  latest_stats: any
  total_aum_cents: number
  subscriber_count: number
  created_at: string
  monthly_fee_cents: number | null
  max_drawdown_pct: number | null
  prod_max_allocation_cents: number | null
  prod_max_position_pct: number | null
  prod_stop_loss_pct: number | null
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; color: string; icon: any }> = {
    listed:  { bg: 'var(--mint-dim)', color: 'var(--mint)', icon: CheckCircle },
    paused:  { bg: 'rgba(245,158,11,.1)', color: 'var(--orange)', icon: AlertCircle },
    pending: { bg: 'rgba(107,131,162,.1)', color: 'var(--muted)', icon: Clock },
    removed: { bg: 'var(--red-dim)', color: 'var(--red)', icon: XCircle },
    unknown: { bg: 'var(--bg3)', color: 'var(--faint)', icon: AlertCircle },
  }
  const style = styles[status] || styles.unknown
  const Icon = style.icon
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '.3rem',
      padding: '.25rem .6rem', borderRadius: 999,
      background: style.bg, color: style.color,
      fontFamily: 'var(--font-mono)', fontSize: '.6rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em',
    }}>
      <Icon size={10} /> {status}
    </span>
  )
}

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--bg3)', border: '1px solid var(--border)',
  borderRadius: 10, padding: '.65rem .85rem',
  color: 'var(--white)', fontSize: '.9rem',
  outline: 'none', width: '100%', boxSizing: 'border-box',
  fontFamily: 'inherit',
}
const LABEL_STYLE: React.CSSProperties = {
  display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.58rem',
  color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.35rem', textTransform: 'uppercase',
}

function EditAgentModal({ agent, onClose, onSaved }: { agent: MyAgent; onClose: () => void; onSaved: () => void }) {
  const [tab, setTab] = useState<'details' | 'prod'>('details')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const [name, setName] = useState(agent.name)
  const [description, setDescription] = useState(agent.description ?? '')
  const [strategyType, setStrategyType] = useState(agent.strategy_type ?? '')
  const [feeMonthly, setFeeMonthly] = useState(agent.monthly_fee_cents !== null ? String(agent.monthly_fee_cents / 100) : '0')
  const [status, setStatus] = useState(agent.status)

  // Production restrictions
  const [maxAlloc, setMaxAlloc] = useState(
    agent.prod_max_allocation_cents !== null ? String(agent.prod_max_allocation_cents / 100) : '10000'
  )
  const [maxPosPct, setMaxPosPct] = useState(
    agent.prod_max_position_pct !== null ? String(agent.prod_max_position_pct) : '25'
  )
  const [stopLoss, setStopLoss] = useState(
    agent.prod_stop_loss_pct !== null ? String(agent.prod_stop_loss_pct) : '20'
  )
  const [hardPause, setHardPause] = useState(false)

  async function save() {
    setSaving(true); setMsg('')
    try {
      const body: Record<string, any> = {
        name, description, strategy_type: strategyType,
        monthly_fee_cents: Math.round(parseFloat(feeMonthly || '0') * 100),
        status,
        prod_max_allocation_cents: Math.round(parseFloat(maxAlloc || '0') * 100),
        prod_max_position_pct: parseFloat(maxPosPct || '0'),
        prod_stop_loss_pct: parseFloat(stopLoss || '0'),
      }
      const res = await fetch(`/api/builders/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Save failed')
      }
      onSaved()
      onClose()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error saving')
    }
    setSaving(false)
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(4,3,12,.88)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 20, padding: '2rem', width: '100%', maxWidth: 520, boxShadow: '0 40px 80px rgba(0,0,0,.7)', maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--white)' }}>Edit Agent</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--faint)', marginTop: '.2rem' }}>{agent.name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 9, width: 32, height: 32, cursor: 'pointer', color: 'var(--faint)', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '.4rem', marginBottom: '1.5rem', padding: '.3rem', background: 'var(--bg3)', borderRadius: 10 }}>
          {(['details', 'prod'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '.45rem', borderRadius: 8, border: 'none',
              background: tab === t ? 'var(--bg2)' : 'transparent',
              color: tab === t ? 'var(--white)' : 'var(--muted)',
              fontWeight: 600, fontSize: '.8rem', cursor: 'pointer', transition: 'all .15s',
            }}>
              {t === 'details' ? 'Details' : 'Prod Restrictions'}
            </button>
          ))}
        </div>

        {tab === 'details' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={LABEL_STYLE}>Agent Name</label>
              <input value={name} onChange={e => setName(e.target.value)} style={INPUT_STYLE} placeholder="e.g. BTC Momentum Alpha" />
            </div>
            <div>
              <label style={LABEL_STYLE}>Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ ...INPUT_STYLE, resize: 'vertical' }} placeholder="Describe your strategy..." />
            </div>
            <div>
              <label style={LABEL_STYLE}>Strategy Type</label>
              <select value={strategyType} onChange={e => setStrategyType(e.target.value)} style={INPUT_STYLE}>
                <option value="">Select type</option>
                <option value="momentum">Momentum</option>
                <option value="mean_reversion">Mean Reversion</option>
                <option value="trend_following">Trend Following</option>
                <option value="composite">Composite</option>
                <option value="ml">Machine Learning</option>
                <option value="arbitrage">Arbitrage</option>
                <option value="dca">DCA</option>
              </select>
            </div>
            <div>
              <label style={LABEL_STYLE}>Monthly Fee (USD)</label>
              <input type="number" min="0" step="1" value={feeMonthly} onChange={e => setFeeMonthly(e.target.value)} style={INPUT_STYLE} placeholder="0" />
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', marginTop: '.25rem' }}>Enter 0 for free. Platform takes 20% of fees.</div>
            </div>
            <div>
              <label style={LABEL_STYLE}>Listing Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} style={INPUT_STYLE}>
                <option value="active">Listed (active)</option>
                <option value="paused">Paused</option>
                <option value="pending">Pending review</option>
              </select>
            </div>
          </div>
        )}

        {tab === 'prod' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: 'rgba(245,158,11,.07)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 11, padding: '.85rem 1rem', marginBottom: '.5rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--orange)', fontWeight: 700, marginBottom: '.35rem', letterSpacing: '.08em' }}>⚠ PRODUCTION RESTRICTIONS</div>
              <div style={{ fontSize: '.8rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                These limits apply globally across all subscriber accounts. They protect investors from excessive risk exposure.
              </div>
            </div>

            <div>
              <label style={LABEL_STYLE}>Max Total Allocation Per Subscriber (USD)</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '.85rem', top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-mono)', fontSize: '.85rem', color: 'var(--muted)' }}>$</span>
                <input type="number" min="100" step="100" value={maxAlloc} onChange={e => setMaxAlloc(e.target.value)} style={{ ...INPUT_STYLE, paddingLeft: '1.6rem' }} />
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', marginTop: '.25rem' }}>Maximum USD any single subscriber can allocate to this agent.</div>
            </div>

            <div>
              <label style={LABEL_STYLE}>Max Position Size (% of allocated capital)</label>
              <div style={{ position: 'relative' }}>
                <input type="number" min="1" max="100" step="1" value={maxPosPct} onChange={e => setMaxPosPct(e.target.value)} style={{ ...INPUT_STYLE, paddingRight: '2rem' }} />
                <span style={{ position: 'absolute', right: '.85rem', top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-mono)', fontSize: '.82rem', color: 'var(--muted)' }}>%</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', marginTop: '.25rem' }}>No single position can exceed this % of allocated capital. Recommended: 20–33%.</div>
            </div>

            <div>
              <label style={LABEL_STYLE}>Automatic Stop-Loss (% drawdown from peak)</label>
              <div style={{ position: 'relative' }}>
                <input type="number" min="5" max="99" step="1" value={stopLoss} onChange={e => setStopLoss(e.target.value)} style={{ ...INPUT_STYLE, paddingRight: '2rem' }} />
                <span style={{ position: 'absolute', right: '.85rem', top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-mono)', fontSize: '.82rem', color: 'var(--muted)' }}>%</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', marginTop: '.25rem' }}>Agent is automatically paused if portfolio drawdown exceeds this threshold.</div>
            </div>

            <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem', marginTop: '.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '.9rem', color: 'var(--white)', marginBottom: '.2rem' }}>Emergency Pause</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.56rem', color: 'var(--faint)' }}>Immediately halt all trading for all subscribers</div>
                </div>
                <button
                  onClick={() => setHardPause(p => !p)}
                  style={{
                    padding: '.45rem 1rem', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '.75rem',
                    border: `1px solid ${hardPause ? 'rgba(228,88,103,.4)' : 'var(--border)'}`,
                    background: hardPause ? 'rgba(228,88,103,.15)' : 'transparent',
                    color: hardPause ? 'var(--red)' : 'var(--muted)',
                    transition: 'all .15s',
                  }}
                >
                  {hardPause ? '⏸ Paused' : 'Pause All'}
                </button>
              </div>
            </div>
          </div>
        )}

        {msg && (
          <div style={{ margin: '1rem 0 0', padding: '.65rem .9rem', background: 'var(--red-dim)', border: '1px solid var(--red-border)', borderRadius: 9, fontFamily: 'var(--font-mono)', fontSize: '.68rem', color: 'var(--red)' }}>
            {msg}
          </div>
        )}

        <div style={{ display: 'flex', gap: '.75rem', marginTop: '1.5rem' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '.7rem', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontWeight: 600, fontSize: '.88rem', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={save} disabled={saving} style={{ flex: 2, padding: '.7rem', borderRadius: 10, border: 0, background: 'var(--blue)', color: '#fff', fontWeight: 700, fontSize: '.88rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .6 : 1 }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AgentCard({ agent, onEdit }: { agent: MyAgent; onEdit: () => void }) {
  const stats = agent.latest_stats
  const returnPct = stats?.total_return_pct ?? agent.backtest_stats?.stats?.totalReturnPct ?? null
  const sharpe = stats?.sharpe_ratio ?? agent.backtest_stats?.stats?.sharpeRatio ?? null

  return (
    <div className="card" style={{ padding: '1.25rem', transition: 'border-color .15s' }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(79,140,255,0.3)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.75rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href={`/agents/${agent.slug}`} style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--white)', textDecoration: 'none' }}>
            {agent.name}
          </Link>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--faint)', marginTop: '.2rem', display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
            <span>{agent.primary_symbol}</span>
            {agent.ticker && <span>{agent.ticker}</span>}
            {agent.strategy_type && <span style={{ textTransform: 'capitalize' }}>{agent.strategy_type.replace(/_/g, ' ')}</span>}
          </div>
        </div>
        <StatusBadge status={agent.display_status} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '.5rem', marginBottom: '.85rem' }}>
        {[
          { label: 'Return', value: returnPct !== null ? `${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(1)}%` : '—', color: returnPct !== null ? (returnPct >= 0 ? 'var(--mint)' : 'var(--red)') : 'var(--faint)' },
          { label: 'Sharpe', value: sharpe !== null ? sharpe.toFixed(2) : '—', color: 'var(--white)' },
          { label: 'Subs', value: String(agent.subscriber_count), color: 'var(--white)' },
        ].map(m => (
          <div key={m.label} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '.5rem', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: 'var(--faint)', marginBottom: '.15rem' }}>{m.label.toUpperCase()}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '.85rem', color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Prod restrictions summary if set */}
      {(agent.prod_max_allocation_cents || agent.prod_stop_loss_pct) && (
        <div style={{ background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.18)', borderRadius: 8, padding: '.5rem .75rem', marginBottom: '.75rem', display: 'flex', flexWrap: 'wrap', gap: '.75rem' }}>
          {agent.prod_max_allocation_cents && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--orange)' }}>
              Max alloc: ${(agent.prod_max_allocation_cents / 100).toLocaleString()}
            </span>
          )}
          {agent.prod_stop_loss_pct && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--orange)' }}>
              Stop: {agent.prod_stop_loss_pct}%
            </span>
          )}
          {agent.prod_max_position_pct && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--orange)' }}>
              Max pos: {agent.prod_max_position_pct}%
            </span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '.5rem' }}>
        <button onClick={onEdit} style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.35rem',
          padding: '.5rem', borderRadius: 9, border: '1px solid var(--border)',
          background: 'transparent', color: 'var(--muted)',
          fontSize: '.75rem', fontWeight: 600, cursor: 'pointer', transition: 'all .15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(79,140,255,.3)'; e.currentTarget.style.color = 'var(--blue2)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
        >
          <Settings size={13} /> Edit
        </button>
        <Link href={`/agents/${agent.slug}`} style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '.5rem', borderRadius: 9, border: 0,
          background: 'var(--blue-dim)', color: 'var(--blue2)',
          fontSize: '.75rem', fontWeight: 600, textDecoration: 'none', transition: 'background .15s',
        }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,140,255,.18)'}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--blue-dim)'}
        >
          View →
        </Link>
      </div>
    </div>
  )
}

export default function BuildersPage() {
  const [activeTab, setActiveTab] = useState<'create' | 'manage'>('create')
  const [agents, setAgents] = useState<MyAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [editingAgent, setEditingAgent] = useState<MyAgent | null>(null)

  useEffect(() => {
    if (activeTab === 'manage') loadMyAgents()
  }, [activeTab])

  async function loadMyAgents() {
    setLoading(true)
    try {
      const res = await fetch('/api/agents/my')
      const json = await res.json()
      if (json.agents) setAgents(json.agents)
    } catch {}
    setLoading(false)
  }

  const TABS = [
    { key: 'create', label: 'Create Agent', icon: Plus },
    { key: 'manage', label: 'Manage Agents', icon: List },
  ] as const

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--white)', fontFamily: 'var(--font-body)' }}>
      <PublicNav variant="dark" />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '7rem 1.5rem 3rem' }}>
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: 'var(--purple)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: '.5rem' }}>BUILDERS</div>
          <h1 style={{ fontFamily: 'var(--font-body)', fontSize: '1.9rem', fontWeight: 800, letterSpacing: '-.04em', marginBottom: '.4rem' }}>
            Agent Builder Studio
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '.92rem' }}>
            Create and manage your trading agents. Set production restrictions to protect your subscribers.
          </p>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: '.5rem', marginBottom: '2rem', borderBottom: '1px solid var(--border)', paddingBottom: '.75rem' }}>
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              style={{
                display: 'flex', alignItems: 'center', gap: '.5rem',
                padding: '.65rem 1.25rem', borderRadius: 10, border: '1px solid',
                borderColor: activeTab === key ? 'var(--blue)' : 'var(--border)',
                background: activeTab === key ? 'var(--blue-dim)' : 'transparent',
                color: activeTab === key ? 'var(--blue)' : 'var(--muted)',
                fontWeight: 600, fontSize: '.85rem', cursor: 'pointer', transition: 'all .15s',
              }}
            >
              <Icon size={15} />
              {label}
              {key === 'manage' && agents.length > 0 && (
                <span style={{ background: 'var(--bg3)', borderRadius: 999, padding: '.1rem .4rem', fontSize: '.62rem', fontFamily: 'var(--font-mono)' }}>
                  {agents.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'create' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }} className="steps-grid">
            <div>
              <h2 style={{ fontFamily: 'var(--font-body)', fontSize: '1.15rem', fontWeight: 700, marginBottom: '.75rem' }}>Quick Create</h2>
              <p style={{ color: 'var(--muted)', fontSize: '.88rem', marginBottom: '1.5rem', lineHeight: 1.65 }}>
                Create a new agent with basic info. You'll need to pass backtest validation before publishing to the marketplace.
              </p>
              <Link href="/agents/submit" style={{
                display: 'inline-flex', alignItems: 'center', gap: '.5rem',
                padding: '.7rem 1.4rem', borderRadius: 10,
                background: 'linear-gradient(135deg, var(--blue3), var(--blue))',
                color: '#fff', fontWeight: 700, fontSize: '.88rem', textDecoration: 'none',
              }}>
                <Plus size={15} /> New Agent
              </Link>
            </div>

            <div>
              <h2 style={{ fontFamily: 'var(--font-body)', fontSize: '1.15rem', fontWeight: 700, marginBottom: '.75rem' }}>From Quant Lab</h2>
              <p style={{ color: 'var(--muted)', fontSize: '.88rem', marginBottom: '1.5rem', lineHeight: 1.65 }}>
                Build and backtest strategies in the Quant Lab, then publish directly to the exchange once validation passes.
              </p>
              <Link href="/dashboard/quant" style={{
                display: 'inline-flex', alignItems: 'center', gap: '.5rem',
                padding: '.7rem 1.4rem', borderRadius: 10,
                border: '1px solid var(--border2)', background: 'transparent',
                color: 'var(--text)', fontWeight: 600, fontSize: '.88rem', textDecoration: 'none',
                transition: 'all .15s',
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(79,140,255,.3)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border2)'}
              >
                <BarChart3 size={15} /> Quant Lab
              </Link>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <div className="card" style={{ padding: '1.5rem' }}>
                <h3 style={{ fontFamily: 'var(--font-body)', fontWeight: 700, marginBottom: '1rem' }}>Publishing Requirements</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '.75rem' }} className="steps-grid">
                  {[
                    { icon: TrendingUp, label: 'Sharpe Ratio', value: '≥ 0.5', color: 'var(--blue)' },
                    { icon: Shield,     label: 'Max Drawdown', value: '< 50%',  color: 'var(--mint)' },
                    { icon: BarChart3,  label: 'Win Rate',     value: '≥ 40%',  color: 'var(--purple)' },
                    { icon: Clock,      label: 'Trade Count',  value: '≥ 20',   color: 'var(--orange)' },
                  ].map(({ icon: Icon, label, value, color }) => (
                    <div key={label} style={{ background: 'var(--bg3)', borderRadius: 10, padding: '1rem', textAlign: 'center' }}>
                      <Icon size={20} style={{ color, marginBottom: '.5rem' }} />
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', marginBottom: '.25rem' }}>{label.toUpperCase()}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '.88rem', color }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'manage' && (
          <div>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted)' }}>Loading your agents...</div>
            ) : agents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', background: 'var(--bg2)', borderRadius: 16, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📊</div>
                <h3 style={{ fontFamily: 'var(--font-body)', fontWeight: 700, marginBottom: '.5rem' }}>No agents yet</h3>
                <p style={{ color: 'var(--muted)', fontSize: '.88rem', marginBottom: '1.5rem' }}>
                  Create your first agent to start trading on the exchange.
                </p>
                <Link href="/agents/submit" style={{
                  display: 'inline-flex', alignItems: 'center', gap: '.5rem',
                  padding: '.7rem 1.4rem', borderRadius: 10,
                  background: 'var(--blue)', color: '#fff', fontWeight: 700, fontSize: '.88rem', textDecoration: 'none',
                }}>
                  <Plus size={15} /> Create Agent
                </Link>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
                {agents.map(agent => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onEdit={() => setEditingAgent(agent)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {editingAgent && (
        <EditAgentModal
          agent={editingAgent}
          onClose={() => setEditingAgent(null)}
          onSaved={() => { loadMyAgents(); setEditingAgent(null) }}
        />
      )}

      <style>{`
        @media (max-width: 640px) {
          .steps-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
