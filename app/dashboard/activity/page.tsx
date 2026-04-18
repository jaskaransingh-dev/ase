'use client'

import { useEffect, useState } from 'react'
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
  return side === 'buy' ? 'var(--mint)' : 'var(--red)'
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
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <PageHeader 
        title="Activity" 
        subtitle="Track your trades, transactions, and allocations"
      />

      <Tabs
        tabs={[
          { id: 'trades', label: 'Trades', count: counts.trades },
          { id: 'transactions', label: 'Transactions', count: counts.transactions },
          { id: 'subscriptions', label: 'Allocations', count: counts.subscriptions },
        ]}
        activeTab={tab}
        onChange={(id) => setTab(id as typeof tab)}
      />

      {loading ? (
        <div style={{ color: 'var(--muted)', fontSize: '0.85rem', padding: '2rem 0', textAlign: 'center' }}>Loading…</div>
      ) : (
        <>
          {tab === 'trades' && (
            <Card noPadding>
              {trades.length === 0 ? (
                <EmptyState icon="📊" title="No trades yet" description="Trades will appear here when agents execute." action={{ label: 'Browse Agents', href: '/agents' }} />
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
                          <Badge color={statusColor(trade.side)} bgColor={`${statusColor(trade.side)}15`}>
                            {trade.side.toUpperCase()}
                          </Badge>
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
            </Card>
          )}

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
                        <td style={{ padding: '0.7rem 1rem' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--white)' }}>
                            {tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}
                          </span>
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