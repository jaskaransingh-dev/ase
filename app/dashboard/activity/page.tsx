'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PageHeader, Card, EmptyState, Tabs, Badge } from '@/components/dashboard/UIComponents'

export const dynamic = 'force-dynamic'

type Trade = {
  id: string
  agent_id: string
  symbol: string
  side: 'buy' | 'sell'
  qty: number
  fill_price: number
  filled_at: string
  pnl_cents: number | null
  thinking?: string | null
  agents?: { name: string; slug: string }
}

type LedgerTrade = {
  id: string
  agent_id: string
  symbol: string
  side: string
  qty: number
  price: number
  notional: number
  executed_at: string
  thinking?: string | null
  mode: string
  ai_agents?: { name: string; slug: string }
}

type Transaction = {
  id: string
  type: string
  amount_cents: number
  created_at: string
  note: string | null
}

type Subscription = {
  id: string
  agent_id: string
  subscribed_at: string
  agents: { name: string; slug: string }
}

// Combined event for the feed
type FeedEvent =
  | { kind: 'trade'; ts: string; data: Trade }
  | { kind: 'ledger'; ts: string; data: LedgerTrade }
  | { kind: 'transaction'; ts: string; data: Transaction }

function fmt$(cents: number) {
  return `${cents >= 0 ? '+' : '-'}$${(Math.abs(cents) / 100).toFixed(2)}`
}

function fmtTime(iso: string) {
  const d = new Date(iso)
  const now = Date.now()
  const diff = now - d.getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function sideColor(side: string) {
  const s = side.toLowerCase()
  return s === 'buy' || s === 'BUY' ? 'var(--mint)' : 'var(--red)'
}

export default function ActivityPage() {
  const supabase = createClient()
  const router = useRouter()

  const [trades, setTrades]           = useState<Trade[]>([])
  const [ledger, setLedger]           = useState<LedgerTrade[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [tab, setTab]                 = useState<'feed' | 'trades' | 'ledger' | 'transactions' | 'subscriptions'>('feed')
  const [loading, setLoading]         = useState(true)
  const [expandedThinking, setExpandedThinking] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const [t, l, tx, s] = await Promise.all([
      supabase.from('agent_trades').select('*, agents(name,slug)').order('filled_at', { ascending: false }).limit(50),
      supabase.from('agent_paper_ledger').select('*, ai_agents(name,slug)').order('executed_at', { ascending: false }).limit(100),
      supabase.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('subscriptions').select('*, agents(name,slug)').eq('user_id', user.id).order('subscribed_at', { ascending: false }).limit(20),
    ])

    setTrades((t.data ?? []) as Trade[])
    setLedger((l.data ?? []) as LedgerTrade[])
    setTransactions((tx.data ?? []) as Transaction[])
    setSubscriptions((s.data ?? []) as Subscription[])
    setLoading(false)
  }, [supabase, router])

  useEffect(() => { void load() }, [load])

  // Live refresh every 20 seconds
  useEffect(() => {
    const id = setInterval(() => void load(), 20_000)
    return () => clearInterval(id)
  }, [load])

  // Build combined feed sorted by time
  const feed: FeedEvent[] = [
    ...trades.map(t => ({ kind: 'trade' as const, ts: t.filled_at, data: t })),
    ...ledger.map(l => ({ kind: 'ledger' as const, ts: l.executed_at, data: l })),
    ...transactions.map(tx => ({ kind: 'transaction' as const, ts: tx.created_at, data: tx })),
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).slice(0, 80)

  const counts = { feed: feed.length, trades: trades.length, ledger: ledger.length, transactions: transactions.length, subscriptions: subscriptions.length }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <PageHeader
        title="Activity"
        subtitle="Live feed of every agent decision — trades, reasoning, and transactions"
      />

      <Tabs
        tabs={[
          { id: 'feed',          label: 'Live Feed',     count: counts.feed },
          { id: 'ledger',        label: 'Agent Ledger',  count: counts.ledger },
          { id: 'trades',        label: 'Filled Trades', count: counts.trades },
          { id: 'transactions',  label: 'Transactions',  count: counts.transactions },
          { id: 'subscriptions', label: 'Allocations',   count: counts.subscriptions },
        ]}
        activeTab={tab}
        onChange={(id) => setTab(id as typeof tab)}
      />

      {loading ? (
        <div style={{ color: 'var(--muted)', fontSize: '0.85rem', padding: '2rem 0', textAlign: 'center' }}>Loading…</div>
      ) : (
        <>

          {/* ── LIVE FEED ── */}
          {tab === 'feed' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {feed.length === 0 ? (
                <Card>
                  <EmptyState icon="📡" title="No activity yet" description="Agent trades and decisions will stream here in real time." action={{ label: 'Browse Agents', href: '/agents' }} />
                </Card>
              ) : feed.map((ev, i) => {
                const key = `${ev.kind}-${i}`
                const thinking = ev.kind === 'ledger' ? ev.data.thinking : ev.kind === 'trade' ? ev.data.thinking : null
                const isExpanded = expandedThinking === key

                if (ev.kind === 'ledger') {
                  const d = ev.data
                  const agentName = d.ai_agents?.name ?? 'Agent'
                  const agentSlug = d.ai_agents?.slug ?? ''
                  return (
                    <div key={key} style={{ padding: '0.75rem 1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, transition: 'border-color 0.2s', borderLeft: `3px solid ${sideColor(d.side)}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: thinking ? 4 : 0 }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: sideColor(d.side), fontFamily: 'var(--font-mono)' }}>{d.side.toUpperCase()}</span>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--white)' }}>{d.symbol}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>${d.price?.toFixed(2)}</span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--faint)', marginLeft: 'auto' }}>{fmtTime(d.executed_at)}</span>
                        <span style={{ fontSize: '0.55rem', color: d.mode === 'live' ? 'var(--mint)' : 'var(--faint)', background: d.mode === 'live' ? 'rgba(22,199,132,0.1)' : 'transparent', padding: '1px 5px', borderRadius: 3, fontFamily: 'var(--font-mono)' }}>{d.mode.toUpperCase()}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {agentSlug ? (
                          <Link href={`/agents/${agentSlug}`} style={{ fontSize: '0.65rem', color: 'var(--blue)', textDecoration: 'none' }}>
                            🤖 {agentName}
                          </Link>
                        ) : (
                          <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>🤖 {agentName}</span>
                        )}
                        <span style={{ fontSize: '0.6rem', color: 'var(--faint)', fontFamily: 'var(--font-mono)' }}>qty {d.qty?.toFixed(4)} · ${d.notional?.toFixed(0)}</span>
                        {thinking && (
                          <button
                            onClick={() => setExpandedThinking(isExpanded ? null : key)}
                            style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.6rem', color: 'var(--violet)', fontFamily: 'var(--font-mono)', padding: '1px 4px' }}
                          >
                            🧠 {isExpanded ? 'hide' : 'why?'}
                          </button>
                        )}
                      </div>
                      {isExpanded && thinking && (
                        <div style={{ marginTop: 6, padding: '0.4rem 0.6rem', background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 6 }}>
                          <div style={{ fontSize: '0.62rem', color: 'var(--text)', lineHeight: 1.55, fontStyle: 'italic' }}>"{thinking}"</div>
                        </div>
                      )}
                    </div>
                  )
                }

                if (ev.kind === 'trade') {
                  const d = ev.data
                  return (
                    <div key={key} style={{ padding: '0.75rem 1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, borderLeft: `3px solid ${sideColor(d.side)}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: sideColor(d.side), fontFamily: 'var(--font-mono)' }}>{d.side.toUpperCase()}</span>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--white)' }}>{d.symbol}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>${d.fill_price?.toFixed(2)}</span>
                        {d.pnl_cents != null && (
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: d.pnl_cents >= 0 ? 'var(--mint)' : 'var(--red)', fontFamily: 'var(--font-mono)' }}>
                            {fmt$(d.pnl_cents)}
                          </span>
                        )}
                        <span style={{ fontSize: '0.65rem', color: 'var(--faint)', marginLeft: 'auto' }}>{fmtTime(d.filled_at)}</span>
                      </div>
                      {d.agents?.name && (
                        <Link href={`/agents/${d.agents.slug}`} style={{ fontSize: '0.65rem', color: 'var(--blue)', textDecoration: 'none', display: 'block', marginTop: 2 }}>
                          🤖 {d.agents.name}
                        </Link>
                      )}
                    </div>
                  )
                }

                if (ev.kind === 'transaction') {
                  const d = ev.data
                  return (
                    <div key={key} style={{ padding: '0.75rem 1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, borderLeft: '3px solid var(--blue)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--white)' }}>{d.type.charAt(0).toUpperCase() + d.type.slice(1)}</span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: d.amount_cents >= 0 ? 'var(--mint)' : 'var(--red)', fontFamily: 'var(--font-mono)' }}>{fmt$(d.amount_cents)}</span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--faint)', marginLeft: 'auto' }}>{fmtTime(d.created_at)}</span>
                      </div>
                      {d.note && <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: 2 }}>{d.note}</div>}
                    </div>
                  )
                }

                return null
              })}
            </div>
          )}

          {/* ── AGENT LEDGER ── */}
          {tab === 'ledger' && (
            <Card noPadding>
              {ledger.length === 0 ? (
                <EmptyState icon="📋" title="No ledger entries yet" description="Agent paper trades will appear here once agents start running." action={{ label: 'My Agents', href: '/dashboard/build/manage' }} />
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Agent', 'Side', 'Symbol', 'Qty', 'Price', 'Notional', 'Mode', 'When', 'Thinking'].map(h => (
                        <th key={h} style={{ padding: '0.65rem 1rem', textAlign: 'left', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.1em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((r, i) => {
                      const key = `ledger-row-${r.id}`
                      const isExp = expandedThinking === key
                      return (
                        <>
                          <tr key={r.id} style={{ borderBottom: '1px solid rgba(30,55,100,.15)' }}>
                            <td style={{ padding: '0.7rem 1rem' }}>
                              {r.ai_agents?.slug ? (
                                <Link href={`/agents/${r.ai_agents.slug}`} style={{ color: 'var(--white)', fontWeight: 600, fontSize: '0.78rem', textDecoration: 'none' }}>{r.ai_agents?.name ?? '—'}</Link>
                              ) : <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{r.ai_agents?.name ?? '—'}</span>}
                            </td>
                            <td style={{ padding: '0.7rem 1rem' }}>
                              <Badge color={sideColor(r.side)} bgColor={`${sideColor(r.side)}15`}>{r.side.toUpperCase()}</Badge>
                            </td>
                            <td style={{ padding: '0.7rem 1rem', fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>{r.symbol}</td>
                            <td style={{ padding: '0.7rem 1rem', fontFamily: 'var(--font-mono)', color: 'var(--white)' }}>{r.qty?.toFixed(4)}</td>
                            <td style={{ padding: '0.7rem 1rem', fontFamily: 'var(--font-mono)', color: 'var(--white)' }}>${r.price?.toFixed(2)}</td>
                            <td style={{ padding: '0.7rem 1rem', fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>${r.notional?.toFixed(0)}</td>
                            <td style={{ padding: '0.7rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: r.mode === 'live' ? 'var(--mint)' : 'var(--faint)' }}>{r.mode}</td>
                            <td style={{ padding: '0.7rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--faint)' }}>{fmtTime(r.executed_at)}</td>
                            <td style={{ padding: '0.7rem 1rem' }}>
                              {r.thinking ? (
                                <button onClick={() => setExpandedThinking(isExp ? null : key)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--violet)', fontSize: '0.62rem', fontFamily: 'var(--font-mono)', padding: '2px 4px' }}>
                                  🧠 {isExp ? '▲' : '▼'}
                                </button>
                              ) : <span style={{ color: 'var(--faint)', fontSize: '0.6rem' }}>—</span>}
                            </td>
                          </tr>
                          {isExp && r.thinking && (
                            <tr key={key + '-thinking'}>
                              <td colSpan={9} style={{ padding: '0.5rem 1rem 0.75rem', background: 'rgba(139,92,246,0.04)', borderBottom: '1px solid var(--border)' }}>
                                <div style={{ fontSize: '0.68rem', color: 'var(--text)', lineHeight: 1.55, fontStyle: 'italic', maxWidth: 700 }}>
                                  🧠 "{r.thinking}"
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </Card>
          )}

          {/* ── FILLED TRADES ── */}
          {tab === 'trades' && (
            <Card noPadding>
              {trades.length === 0 ? (
                <EmptyState icon="📊" title="No filled trades yet" description="Trades will appear here when agents execute live orders." action={{ label: 'Browse Agents', href: '/agents' }} />
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Agent', 'Side', 'Symbol', 'Qty', 'Price', 'P&L', 'Time'].map(h => (
                        <th key={h} style={{ padding: '0.65rem 1rem', textAlign: 'left', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((trade, i) => (
                      <tr key={trade.id} style={{ borderBottom: i === trades.length - 1 ? 'none' : '1px solid rgba(30,55,100,.15)' }}>
                        <td style={{ padding: '0.7rem 1rem' }}>
                          <Link href={`/agents/${trade.agents?.slug}`} style={{ color: 'var(--white)', fontWeight: 600, fontSize: '0.82rem', textDecoration: 'none' }}>
                            {trade.agents?.name ?? '—'}
                          </Link>
                        </td>
                        <td style={{ padding: '0.7rem 1rem' }}>
                          <Badge color={sideColor(trade.side)} bgColor={`${sideColor(trade.side)}15`}>{trade.side.toUpperCase()}</Badge>
                        </td>
                        <td style={{ padding: '0.7rem 1rem', fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>{trade.symbol}</td>
                        <td style={{ padding: '0.7rem 1rem', fontFamily: 'var(--font-mono)', color: 'var(--white)' }}>{trade.qty?.toFixed(4)}</td>
                        <td style={{ padding: '0.7rem 1rem', fontFamily: 'var(--font-mono)', color: 'var(--white)' }}>${trade.fill_price?.toFixed(2)}</td>
                        <td style={{ padding: '0.7rem 1rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: trade.pnl_cents !== null ? (trade.pnl_cents >= 0 ? 'var(--mint)' : 'var(--red)') : 'var(--faint)' }}>
                          {trade.pnl_cents !== null ? fmt$(trade.pnl_cents) : '—'}
                        </td>
                        <td style={{ padding: '0.7rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--faint)' }}>{fmtTime(trade.filled_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          )}

          {/* ── TRANSACTIONS ── */}
          {tab === 'transactions' && (
            <Card noPadding>
              {transactions.length === 0 ? (
                <EmptyState icon="💳" title="No transactions yet" description="Deposits and withdrawals appear here." action={{ label: 'Add Funds', href: '/dashboard/deposit' }} />
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Type', 'Amount', 'Note', 'Time'].map(h => (
                        <th key={h} style={{ padding: '0.65rem 1rem', textAlign: 'left', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx, i) => (
                      <tr key={tx.id} style={{ borderBottom: i === transactions.length - 1 ? 'none' : '1px solid rgba(30,55,100,.15)' }}>
                        <td style={{ padding: '0.7rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--white)' }}>
                          {tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}
                        </td>
                        <td style={{ padding: '0.7rem 1rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: tx.amount_cents >= 0 ? 'var(--mint)' : 'var(--red)' }}>
                          {fmt$(tx.amount_cents)}
                        </td>
                        <td style={{ padding: '0.7rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--muted)' }}>{tx.note || '—'}</td>
                        <td style={{ padding: '0.7rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--faint)' }}>{fmtTime(tx.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          )}

          {/* ── SUBSCRIPTIONS ── */}
          {tab === 'subscriptions' && (
            <Card noPadding>
              {subscriptions.length === 0 ? (
                <EmptyState icon="🤖" title="No allocations yet" description="Allocate funds to agents to start trading." action={{ label: 'Browse Agents', href: '/agents' }} />
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Agent', 'Status', 'Date'].map(h => (
                        <th key={h} style={{ padding: '0.65rem 1rem', textAlign: 'left', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptions.map((sub, i) => (
                      <tr key={sub.id} style={{ borderBottom: i === subscriptions.length - 1 ? 'none' : '1px solid rgba(30,55,100,.15)' }}>
                        <td style={{ padding: '0.7rem 1rem' }}>
                          <Link href={`/agents/${sub.agents?.slug}`} style={{ color: 'var(--white)', fontWeight: 600, fontSize: '0.82rem', textDecoration: 'none' }}>
                            {sub.agents?.name ?? '—'}
                          </Link>
                        </td>
                        <td style={{ padding: '0.7rem 1rem' }}>
                          <Badge color="var(--mint)" bgColor="rgba(0,229,153,0.15)">Active</Badge>
                        </td>
                        <td style={{ padding: '0.7rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--faint)' }}>{fmtTime(sub.subscribed_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  )
}
