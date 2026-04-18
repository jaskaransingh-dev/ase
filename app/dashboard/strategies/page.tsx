'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Code2, CheckCircle, AlertCircle, Clock, Loader2, Trash2, ChevronRight, FlaskConical } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const C = {
  bg: '#06111F', bg2: '#0B1728', bg3: '#101A2D', bg4: '#162438',
  border: '#1E2A3D', border2: '#2A3A50',
  blue: '#4F8CFF', blue2: '#6BA3FF',
  mint: '#16C784', red: '#FF5468', orange: '#F5B942',
  text: '#B7C4D5', muted: '#7F8CA3', faint: '#55657A',
  white: '#F7FAFF',
}

const STATUS_META: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  draft:      { color: C.muted,   icon: <Clock size={12} />,         label: 'Draft' },
  validating: { color: C.orange,  icon: <Loader2 size={12} />,       label: 'Validating' },
  validated:  { color: C.mint,    icon: <CheckCircle size={12} />,   label: 'Validated' },
  rejected:   { color: C.red,     icon: <AlertCircle size={12} />,   label: 'Rejected' },
  listed:     { color: C.blue,    icon: <CheckCircle size={12} />,   label: 'Listed' },
}

interface Strategy {
  id: string
  slug: string
  name: string
  description: string | null
  symbol: string
  interval: string
  status: string
  created_at: string
  updated_at: string
}

export default function StrategiesPage() {
  const router = useRouter()
  const supabase = createClient()

  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    fetchStrategies()
  }, [])

  async function fetchStrategies() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/strategies', {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    if (res.ok) {
      const json = await res.json()
      setStrategies(json.strategies ?? [])
    }
    setLoading(false)
  }

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/strategies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({
        name: newName,
        description: newDesc || null,
        code: DEFAULT_CODE,
        symbol: 'BTC-USD',
        interval: '1d',
      }),
    })
    if (res.ok) {
      const json = await res.json()
      router.push(`/dashboard/strategies/${json.strategy.id}`)
    }
    setCreating(false)
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    const { data: { session } } = await supabase.auth.getSession()
    await fetch(`/api/strategies/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    setStrategies(prev => prev.filter(s => s.id !== id))
    setDeleting(null)
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: C.blue, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '.3rem' }}>
            QUANT PLATFORM
          </div>
          <h1 style={{ fontSize: '1.7rem', fontWeight: 800, color: C.white, letterSpacing: '-.03em', margin: 0 }}>
            My Strategies
          </h1>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: C.muted, marginTop: '0.3rem' }}>
            {strategies.length} strateg{strategies.length === 1 ? 'y' : 'ies'}
          </div>
        </div>
        <button
          onClick={() => setShowNew(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            background: C.blue, border: 'none', borderRadius: 8,
            padding: '0.6rem 1.1rem', color: '#fff', fontWeight: 700,
            fontSize: '0.8rem', cursor: 'pointer',
          }}
        >
          <Plus size={14} /> New Strategy
        </button>
      </div>

      {/* New strategy modal */}
      {showNew && (
        <div style={{
          background: C.bg2, border: `1px solid ${C.border2}`, borderRadius: 12,
          padding: '1.5rem', marginBottom: '1.5rem',
        }}>
          <div style={{ fontWeight: 700, color: C.white, marginBottom: '1rem' }}>New Strategy</div>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <input
              autoFocus
              placeholder="Strategy name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              style={inputStyle}
            />
            <input
              placeholder="Short description (optional)"
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              style={inputStyle}
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={handleCreate} disabled={creating || !newName.trim()} style={btnPrimaryStyle}>
                {creating ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : 'Create & Edit'}
              </button>
              <button onClick={() => { setShowNew(false); setNewName(''); setNewDesc('') }} style={btnGhostStyle}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Strategy list */}
      {loading ? (
        <div style={{ textAlign: 'center', color: C.muted, padding: '3rem' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : strategies.length === 0 ? (
        <EmptyState onNew={() => setShowNew(true)} />
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {strategies.map(s => {
            const meta = STATUS_META[s.status] ?? STATUS_META.draft
            return (
              <div
                key={s.id}
                style={{
                  background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10,
                  padding: '1rem 1.25rem', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '1rem',
                  transition: 'border-color 0.15s',
                }}
                onClick={() => router.push(`/dashboard/strategies/${s.id}`)}
                onMouseEnter={e => (e.currentTarget.style.borderColor = C.border2)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
              >
                <div style={{
                  background: C.bg3, borderRadius: 8, padding: '0.6rem',
                  display: 'flex', alignItems: 'center', color: C.blue,
                }}>
                  <Code2 size={16} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: C.white, fontSize: '0.9rem', marginBottom: '0.2rem' }}>
                    {s.name}
                  </div>
                  {s.description && (
                    <div style={{ color: C.muted, fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.description}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: meta.color, fontSize: '0.7rem', fontWeight: 600 }}>
                  {meta.icon} {meta.label}
                </div>

                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: C.faint }}>
                  {s.symbol} · {s.interval}
                </div>

                <button
                  onClick={e => { e.stopPropagation(); handleDelete(s.id) }}
                  disabled={deleting === s.id}
                  style={{
                    background: 'none', border: 'none', color: C.faint,
                    cursor: 'pointer', padding: '0.25rem', borderRadius: 4,
                  }}
                >
                  {deleting === s.id ? <Loader2 size={13} /> : <Trash2 size={13} />}
                </button>

                <ChevronRight size={14} color={C.faint} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div style={{
      background: C.bg2, border: `1px dashed ${C.border2}`, borderRadius: 12,
      padding: '3rem', textAlign: 'center',
    }}>
      <FlaskConical size={32} color={C.faint} style={{ marginBottom: '1rem' }} />
      <div style={{ fontWeight: 700, color: C.white, marginBottom: '0.5rem' }}>No strategies yet</div>
      <div style={{ color: C.muted, fontSize: '0.8rem', marginBottom: '1.5rem' }}>
        Create your first strategy and run it through the backtest engine.
      </div>
      <button onClick={onNew} style={btnPrimaryStyle}><Plus size={13} /> New Strategy</button>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: '#0B1728', border: '1px solid #1E2A3D', borderRadius: 7,
  padding: '0.6rem 0.85rem', color: C.white, fontSize: '0.85rem',
  outline: 'none', width: '100%', boxSizing: 'border-box',
}

const btnPrimaryStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
  background: C.blue, border: 'none', borderRadius: 7,
  padding: '0.55rem 1rem', color: '#fff', fontWeight: 700,
  fontSize: '0.8rem', cursor: 'pointer',
}

const btnGhostStyle: React.CSSProperties = {
  background: 'none', border: `1px solid ${C.border2}`, borderRadius: 7,
  padding: '0.55rem 1rem', color: C.muted, fontWeight: 600,
  fontSize: '0.8rem', cursor: 'pointer',
}

const DEFAULT_CODE = `# Strategy Interface
# Implement generate_signals(data) → Signal
# or a class with initialize(context) + on_data(context, data)
#
# Allowed imports: numpy, pandas, math, statistics

import numpy as np
import pandas as pd

def generate_signals(data):
    """
    data: pandas DataFrame with columns [date, open, high, low, close, volume]

    Yield signal dicts:
      { "action": "BUY" | "SELL" | "HOLD", "size": 0.0-1.0, "asset": "BTC-USD" }
    """
    closes = data['close'].values
    fast = pd.Series(closes).rolling(10).mean().values
    slow = pd.Series(closes).rolling(30).mean().values

    for i in range(len(data)):
        if fast[i] is None or slow[i] is None or np.isnan(fast[i]) or np.isnan(slow[i]):
            yield { "action": "HOLD", "size": 0, "asset": "BTC-USD" }
        elif fast[i] > slow[i]:
            yield { "action": "BUY", "size": 1.0, "asset": "BTC-USD" }
        else:
            yield { "action": "SELL", "size": 1.0, "asset": "BTC-USD" }
`
