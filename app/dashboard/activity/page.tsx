'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

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
  agents?: { name: string; slug: string }
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

function fmt$(cents: number) {
  return `${cents >= 0 ? '+' : '-'}$${(Math.abs(cents) / 100).toFixed(2)}`
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function statusColor(side: string) {
  return side === 'buy' ? 'var(--blue2)' : 'var(--red)'
}

export default function ActivityPage() {
  const supabase = createClient()
  const router = useRouter()
  const [trades, setTrades] = useState<Trade[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [tab, setTab] = useState<'trades' | 'transactions' | 'subscriptions'>('trades')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [t, tx, s] = await Promise.all([
        supabase.from('agent_trades').select('*, agents(name,slug)').order('filled_at', { ascending: false }).limit(50),
        supabase.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
        supabase.from('subscriptions').select('*, agents(name,slug)').eq('user_id', user.id).order('subscribed_at', { ascending: false }).limit(20),
      ])

      setTrades((t.data ?? []) as Trade[])
      setTransactions((tx.data ?? []) as Transaction[])
      setSubscriptions((s.data ?? []) as Subscription[])
      setLoading(false)
    }
    void load()
  }, [])

  const counts = { trades: trades.length, transactions: transactions.length, subscriptions: subscriptions.length }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: '.25rem' }}>ACTIVITY</div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-.02em' }}>Your Activity</h1>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
        {(['trades', 'transactions', 'subscriptions'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '0.5rem 1.25rem',
            borderRadius: '8px 8px 0 0',
            border: 'none',
            background: tab === t ? 'var(--bg2)' : 'transparent',
            color: tab === t ? 'var(--blue2)' : 'var(--muted)',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            borderBottom: tab === t ? '2px solid var(--blue)' : '2px solid transparent',
            marginBottom: '-1px',
            textTransform: 'capitalize',
          }}>
            {t} {counts[t] > 0 && <span style={{ opacity: 0.5 }}>({counts[t]})</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: 'var(--muted)', fontSize: '0.85rem', padding: '2rem 0', textAlign: 'center' }}>Loading…</div>
      ) : (
        <>
          {/* TRADES */}
          {tab === 'trades' && (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
              {trades.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.3 }}>📊</div>
                  <div style={{ fontWeight: 600, marginBottom: '0.3rem' }}>No trades yet</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--faint)' }}>Trades will appear here when agents execute.</div>
                  <Link href="/agents" style={{ display: 'inline-block', marginTop: '1rem', color: 'var(--blue2)', fontSize: '0.82rem', fontWeight: 600 }}>Browse Agents →</Link>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Agent', 'Side', 'Symbol', 'Qty', 'Price', 'P&L', 'Time'].map(h => (
                        <th key={h} style={{ padding: '0.65rem 1rem', textAlign: 'left', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.08em' }}>{h.toUpperCase()}</th>
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
                          <span style={{ color: statusColor(trade.side), fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase' }}>
                            {trade.side}
                          </span>
                        </td>
                        <td style={{ padding: '0.7rem 1rem', fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>{trade.symbol}</td>
                        <td style={{ padding: '0.7rem 1rem', fontFamily: 'var(--font-mono)', color: 'var(--white)' }}>{trade.qty.toFixed(4)}</td>
                        <td style={{ padding: '0.7rem 1rem', fontFamily: 'var(--font-mono)', color: 'var(--white)' }}>${trade.fill_price.toFixed(2)}</td>
                        <td style={{ padding: '0.7rem 1rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: trade.pnl_cents !== null ? (trade.pnl_cents >= 0 ? 'var(--mint)' : 'var(--red)') : 'var(--faint)' }}>
                          {trade.pnl_cents !== null ? fmt$(trade.pnl_cents) : '—'}
                        </td>
                        <td style={{ padding: '0.7rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--faint)' }}>{fmtTime(trade.filled_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* TRANSACTIONS */}
          {tab === 'transactions' && (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
              {transactions.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.3 }}>💳</div>
                  <div style={{ fontWeight: 600, marginBottom: '0.3rem' }}>No transactions yet</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--faint)' }}>Deposits and withdrawals appear here.</div>
                  <Link href="/dashboard/deposit" style={{ display: 'inline-block', marginTop: '1rem', color: 'var(--blue2)', fontSize: '0.82rem', fontWeight: 600 }}>Add Funds →</Link>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Type', 'Amount', 'Note', 'Time'].map(h => (
                        <th key={h} style={{ padding: '0.65rem 1rem', textAlign: 'left', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.08em' }}>{h.toUpperCase()}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx, i) => (
                      <tr key={tx.id} style={{ borderBottom: i === transactions.length - 1 ? 'none' : '1px solid rgba(30,55,100,.15)' }}>
                        <td style={{ padding: '0.7rem 1rem' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 600, textTransform: 'capitalize', color: 'var(--muted)' }}>{tx.type}</span>
                        </td>
                        <td style={{ padding: '0.7rem 1rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: tx.amount_cents >= 0 ? 'var(--mint)' : 'var(--red)' }}>
                          {fmt$(tx.amount_cents)}
                        </td>
                        <td style={{ padding: '0.7rem 1rem', color: 'var(--faint)', fontSize: '0.75rem', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {tx.note ?? '—'}
                        </td>
                        <td style={{ padding: '0.7rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--faint)' }}>{fmtTime(tx.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* SUBSCRIPTIONS */}
          {tab === 'subscriptions' && (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
              {subscriptions.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.3 }}>🤖</div>
                  <div style={{ fontWeight: 600, marginBottom: '0.3rem' }}>No subscriptions</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--faint)' }}>Subscribe to agents to see them here.</div>
                  <Link href="/agents" style={{ display: 'inline-block', marginTop: '1rem', color: 'var(--blue2)', fontSize: '0.82rem', fontWeight: 600 }}>Browse Agents →</Link>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Agent', 'Subscribed', 'Status'].map(h => (
                        <th key={h} style={{ padding: '0.65rem 1rem', textAlign: 'left', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.08em' }}>{h.toUpperCase()}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptions.map((sub, i) => (
                      <tr key={sub.id} style={{ borderBottom: i === subscriptions.length - 1 ? 'none' : '1px solid rgba(30,55,100,.15)' }}>
                        <td style={{ padding: '0.7rem 1rem' }}>
                          <Link href={`/agents/${sub.agents?.slug}`} style={{ color: 'var(--white)', fontWeight: 600, textDecoration: 'none' }}>
                            {sub.agents?.name ?? '—'}
                          </Link>
                        </td>
                        <td style={{ padding: '0.7rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--faint)' }}>{fmtTime(sub.subscribed_at)}</td>
                        <td style={{ padding: '0.7rem 1rem' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', padding: '0.2rem 0.5rem', borderRadius: 4, background: 'rgba(0,229,153,0.1)', color: 'var(--mint)', fontWeight: 600 }}>ACTIVE</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
