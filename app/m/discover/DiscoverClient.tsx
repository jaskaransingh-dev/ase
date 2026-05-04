'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import TabBar from '../_components/TabBar'
import { ChevronRight, SearchIcon } from '../_components/icons'
import { fmtPct } from '../_components/format'

type Agent = {
  id: string
  name: string
  slug: string
  ticker?: string
  description: string | null
  strategy_type: string
  primary_symbol?: string | null
  status: string
  share_price_cents?: number | null
  subscriber_count?: number
  sharpe?: number | null
  maxDD?: number | null
  winRate?: number | null
  return30d?: number | null
}

type SortKey = 'rank' | 'return' | 'sharpe'

const SORTS: { v: SortKey; label: string }[] = [
  { v: 'rank', label: 'Top' },
  { v: 'return', label: 'Return' },
  { v: 'sharpe', label: 'Sharpe' },
]

export default function DiscoverClient() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [sort, setSort] = useState<SortKey>('rank')
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    setErr('')
    try {
      const res = await fetch('/api/agents', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load agents')
      const json = await res.json()
      setAgents((json.data ?? []) as Agent[])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let arr = agents.filter(a => a.status === 'active')
    if (needle) {
      arr = arr.filter(a =>
        a.name.toLowerCase().includes(needle) ||
        (a.ticker || '').toLowerCase().includes(needle) ||
        (a.primary_symbol || '').toLowerCase().includes(needle)
      )
    }
    if (sort === 'return') arr = [...arr].sort((a, b) => (b.return30d ?? -999) - (a.return30d ?? -999))
    else if (sort === 'sharpe') arr = [...arr].sort((a, b) => (b.sharpe ?? -999) - (a.sharpe ?? -999))
    else arr = [...arr].sort((a, b) => ((b.sharpe ?? 0) + (b.return30d ?? 0) * 0.1) - ((a.sharpe ?? 0) + (a.return30d ?? 0) * 0.1))
    return arr
  }, [agents, sort, q])

  return (
    <div className="m-page">
      <div className="m-title">Discover</div>
      <div className="m-subtitle">Browse verified AI trading agents.</div>

      <div className="m-search">
        <SearchIcon />
        <input
          placeholder="Search by name or symbol"
          value={q}
          onChange={e => setQ(e.target.value)}
          inputMode="search"
          autoCorrect="off"
          autoCapitalize="none"
        />
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '0 16px 12px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {SORTS.map(s => (
          <button
            key={s.v}
            onClick={() => setSort(s.v)}
            className={`m-pill ${sort === s.v ? 'm-pill-blue' : 'm-pill-muted'}`}
            style={{ border: 0, padding: '8px 14px', fontSize: 13 }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="m-section" style={{ marginTop: 0 }}>
        {loading ? (
          <div className="m-loading"><div className="m-spin" /></div>
        ) : err ? (
          <div className="m-error">{err}</div>
        ) : filtered.length === 0 ? (
          <div className="m-card m-empty">
            <div className="m-empty-emoji">🔍</div>
            <div className="m-empty-title">No agents</div>
            <div className="m-empty-sub">Try a different filter.</div>
          </div>
        ) : (
          <div className="m-list">
            {filtered.map(a => (
              <Link key={a.id} href={`/m/agent/${a.slug}`} className="m-list-row">
                <div className="m-list-row-main">
                  <div className="m-list-row-title">{a.name}</div>
                  <div className="m-list-row-sub">
                    {a.primary_symbol || a.ticker || a.strategy_type}
                    {a.sharpe != null && <> · Sharpe {a.sharpe.toFixed(2)}</>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {a.return30d != null ? (
                    <div className={a.return30d >= 0 ? 'm-pos' : 'm-neg'} style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtPct(a.return30d, { sign: true })}
                    </div>
                  ) : (
                    <div style={{ color: 'var(--m-faint)', fontSize: 13 }}>—</div>
                  )}
                  <div style={{ color: 'var(--m-faint)', fontSize: 12 }}>30d</div>
                </div>
                <ChevronRight className="m-list-row-chev" />
              </Link>
            ))}
          </div>
        )}
      </div>

      <TabBar />
    </div>
  )
}
