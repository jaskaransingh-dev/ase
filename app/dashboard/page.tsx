'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { fmtUSD, fmtPct, fmtDateTime } from '@/lib/utils'

export const dynamic = 'force-dynamic'

interface Wallet { balance_cents: number }
interface Agent { id: string; name: string; slug: string; ticker: string }
interface Holding { id: string; agent_id: string; shares: number; invested_cents: number; current_value_cents: number; status: string; agents: Agent }
interface AgentTrade { id: string; agent_id: string; symbol: string; side: string; qty: number; fill_price: number; filled_at: string; pnl_cents: number | null; agents: Agent }
interface Transaction { id: string; type: string; amount_cents: number; created_at: string }

const COLORS = ['#E8AC20', '#0EAD6E', '#4A90E2', '#FF6B6B', '#9B59B6', '#F39C12']

export default function DashboardPage() {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [trades, setTrades] = useState<AgentTrade[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    async function load() {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        router.push('/login')
        return
      }
      setUser(authUser)

      const [walletRes, holdingsRes, tradesRes, txnsRes] = await Promise.all([
        supabase.from('wallets').select('balance_cents').eq('user_id', authUser.id).single(),
        supabase.from('holdings').select('*, agents(id, name, slug, ticker)').eq('user_id', authUser.id).eq('status', 'active'),
        supabase.from('agent_trades').select('*, agents(id, name, slug, ticker)').order('filled_at', { ascending: false }).limit(20),
        supabase.from('transactions').select('*').eq('user_id', authUser.id).order('created_at', { ascending: false }).limit(10),
      ])

      setWallet(walletRes.data)
      setHoldings(holdingsRes.data ?? [])
      setTrades(tradesRes.data ?? [])
      setTransactions(txnsRes.data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div style={{ padding: '2rem', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <div className="skeleton" style={{ height: 14, width: 140, margin: '0 auto .5rem' }} />
        <div className="skeleton" style={{ height: 28, width: 280, margin: '0 auto' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginBottom: '2rem' }}>
        {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 90, borderRadius: 16 }} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '1.5rem' }}>
        <div>{[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 110, borderRadius: 16, marginBottom: '.75rem' }} />)}</div>
        <div><div className="skeleton" style={{ height: 300, borderRadius: 16 }} /></div>
      </div>
    </div>
  )

  const balance = wallet?.balance_cents ?? 0
  const activeHoldings = holdings
  const totalInvested = activeHoldings.reduce((s, h) => s + h.invested_cents, 0)
  const totalCurrentValue = activeHoldings.reduce((s, h) => s + (h.current_value_cents ?? h.invested_cents), 0)
  const totalReturn = totalCurrentValue - totalInvested
  const totalReturnPct = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0
  const totalNav = balance + totalCurrentValue

  // Allocation chart
  const chartData = activeHoldings.map((h) => ({
    name: h.agents?.name || 'Unknown',
    value: h.current_value_cents ?? h.invested_cents,
  }))

  const txTypeLabel: Record<string, string> = {
    deposit: 'Deposit',
    invest: 'Invested',
    divest: 'Divested',
    return: 'Return',
  }

  return (
    <div style={{
      padding: '2rem',
      maxWidth: '1400px',
      margin: '0 auto',
      minHeight: '100vh',
      fontFamily: 'var(--font-body)',
      color: '#E0E0E0'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', letterSpacing: '.15em', color: '#888', marginBottom: '.5rem' }}>PORTFOLIO TERMINAL</div>
        <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '2rem', fontWeight: 900, marginBottom: '.25rem' }}>Dashboard</h1>
      </div>

      {/* Top metrics strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        {[
          { label: 'TOTAL NAV', value: fmtUSD(totalNav), color: '#E8AC20' },
          { label: 'AVAILABLE CREDITS', value: fmtUSD(balance), color: '#0EAD6E' },
          { label: 'INVESTED VALUE', value: fmtUSD(totalCurrentValue), color: '#4A90E2' },
          { label: 'TOTAL RETURN', value: fmtPct(totalReturnPct), sub: fmtUSD(Math.abs(totalReturn)), color: totalReturn >= 0 ? '#0EAD6E' : '#E84040' },
        ].map((stat, i) => (
          <div key={i} style={{ background: '#0D1018', border: '1px solid #1a1f2e', borderRadius: '12px', padding: '1.5rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', letterSpacing: '.12em', color: '#666', marginBottom: '.75rem', textTransform: 'uppercase' }}>
              {stat.label}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 700, color: stat.color, marginBottom: stat.sub ? '.35rem' : 0 }}>
              {stat.value}
            </div>
            {stat.sub && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: '#888' }}>{stat.sub}</div>}
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.5rem', alignItems: 'start' }}>
        {/* Holdings table */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 800 }}>Agent Holdings</h2>
            <Link href="/dashboard/exchange" style={{ fontFamily: 'var(--font-mono)', fontSize: '.75rem', padding: '.5rem 1rem', background: '#1a1f2e', border: '1px solid #333', borderRadius: '8px', color: '#E8AC20', textDecoration: 'none', cursor: 'pointer', transition: 'all .2s' }}>
              + Invest More
            </Link>
          </div>

          {activeHoldings.length === 0 ? (
            <div style={{ background: '#0D1018', border: '1px solid #1a1f2e', borderRadius: '12px', padding: '3rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '1rem', opacity: 0.5 }}>⬡</div>
              <div style={{ fontWeight: 600, marginBottom: '.5rem' }}>No holdings yet</div>
              <div style={{ color: '#888', fontSize: '.9rem', marginBottom: '1.5rem' }}>Start investing in verified AI agents</div>
              <Link href="/dashboard/exchange" style={{ fontFamily: 'var(--font-mono)', fontSize: '.8rem', padding: '.6rem 1.2rem', background: '#E8AC20', color: '#000', borderRadius: '8px', textDecoration: 'none', fontWeight: 700, display: 'inline-block' }}>
                Explore Agents →
              </Link>
            </div>
          ) : (
            <div style={{ background: '#0D1018', border: '1px solid #1a1f2e', borderRadius: '12px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: '.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1a1f2e', background: '#07090F' }}>
                    <th style={{ padding: '1rem', textAlign: 'left', color: '#666', fontWeight: 600, fontSize: '.7rem', letterSpacing: '.1em' }}>AGENT</th>
                    <th style={{ padding: '1rem', textAlign: 'right', color: '#666', fontWeight: 600, fontSize: '.7rem', letterSpacing: '.1em' }}>POSITION</th>
                    <th style={{ padding: '1rem', textAlign: 'right', color: '#666', fontWeight: 600, fontSize: '.7rem', letterSpacing: '.1em' }}>ENTRY/CURRENT</th>
                    <th style={{ padding: '1rem', textAlign: 'right', color: '#666', fontWeight: 600, fontSize: '.7rem', letterSpacing: '.1em' }}>P&L</th>
                    <th style={{ padding: '1rem', textAlign: 'center', color: '#666', fontWeight: 600, fontSize: '.7rem', letterSpacing: '.1em' }}>STATUS</th>
                    <th style={{ padding: '1rem', textAlign: 'right', color: '#666', fontWeight: 600, fontSize: '.7rem', letterSpacing: '.1em' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {activeHoldings.map((h, i) => {
                    const currentVal = h.current_value_cents ?? h.invested_cents
                    const ret = currentVal - h.invested_cents
                    const retPct = h.invested_cents > 0 ? (ret / h.invested_cents) * 100 : 0
                    const entryPrice = h.invested_cents / h.shares
                    const currentPrice = currentVal / h.shares
                    return (
                      <tr key={h.id} style={{ borderBottom: i < activeHoldings.length - 1 ? '1px solid #1a1f2e' : 'none', background: i % 2 === 0 ? 'transparent' : '#0A0D14', transition: 'background .15s' }}>
                        <td style={{ padding: '1rem', color: '#E0E0E0' }}>
                          <div style={{ fontWeight: 700 }}>{h.agents?.name}</div>
                          <div style={{ fontSize: '.7rem', color: '#666', marginTop: '.15rem' }}>{h.agents?.ticker}</div>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right', color: '#E0E0E0' }}>
                          {h.shares.toFixed(3)} @ {fmtUSD(currentPrice * 100)}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right', color: '#999', fontSize: '.8rem' }}>
                          {fmtUSD(entryPrice * 100)} → {fmtUSD(currentPrice * 100)}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right', color: ret >= 0 ? '#0EAD6E' : '#E84040', fontWeight: 600 }}>
                          {ret >= 0 ? '+' : ''}{fmtUSD(ret)} ({fmtPct(retPct)})
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', padding: '.3rem .6rem', background: '#0EAD6E', color: '#000', borderRadius: '6px', fontWeight: 700 }}>
                            ACTIVE
                          </span>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                          <Link href={`/dashboard/agents/${h.agents?.slug}`} style={{ color: '#888', textDecoration: 'none', fontSize: '.75rem', fontWeight: 600, transition: 'color .15s' }}>
                            View →
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Allocation chart */}
          {chartData.length > 0 && (
            <div style={{ background: '#0D1018', border: '1px solid #1a1f2e', borderRadius: '12px', padding: '1.5rem' }}>
              <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '.95rem', fontWeight: 700, marginBottom: '1rem', color: '#E0E0E0' }}>Allocation</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={chartData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2} dataKey="value">
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ marginTop: '1rem', fontSize: '.7rem', color: '#888', display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                {chartData.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                    <div style={{ width: '8px', height: '8px', background: COLORS[i % COLORS.length], borderRadius: '2px' }} />
                    <span>{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent trades */}
          <div style={{ background: '#0D1018', border: '1px solid #1a1f2e', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid #1a1f2e' }}>
              <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '.95rem', fontWeight: 700, color: '#E0E0E0' }}>Live Trades</h3>
            </div>
            {trades.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#666', fontSize: '.85rem' }}>No trades yet</div>
            ) : (
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {trades.slice(0, 10).map((t, i) => (
                  <div key={t.id} style={{ padding: '.9rem 1.2rem', borderTop: i > 0 ? '1px solid #1a1f2e' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '.75rem', fontFamily: 'var(--font-mono)' }}>
                    <div>
                      <div style={{ color: t.side === 'buy' ? '#0EAD6E' : '#E84040', fontWeight: 700, marginBottom: '.2rem' }}>
                        {t.side === 'buy' ? '↓ BUY' : '↑ SELL'} {t.symbol}
                      </div>
                      <div style={{ color: '#666', fontSize: '.65rem' }}>{fmtDateTime(t.filled_at)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: '#E0E0E0' }}>{t.qty.toFixed(4)} @ {fmtUSD(t.fill_price * 100)}</div>
                      {t.pnl_cents !== null && <div style={{ color: t.pnl_cents >= 0 ? '#0EAD6E' : '#E84040', fontSize: '.65rem', marginTop: '.1rem' }}>
                        {t.pnl_cents >= 0 ? '+' : ''}{fmtUSD(t.pnl_cents)}
                      </div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent transactions */}
          <div style={{ background: '#0D1018', border: '1px solid #1a1f2e', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid #1a1f2e' }}>
              <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '.95rem', fontWeight: 700, color: '#E0E0E0' }}>Recent Transactions</h3>
            </div>
            {transactions.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#666', fontSize: '.85rem' }}>No transactions</div>
            ) : (
              <div>
                {transactions.map((t, i) => {
                  const isIncoming = ['deposit', 'divest', 'return'].includes(t.type)
                  return (
                    <div key={t.id} style={{ padding: '.9rem 1.2rem', borderTop: i > 0 ? '1px solid #1a1f2e' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: '.8rem' }}>
                        <div style={{ fontWeight: 600, marginBottom: '.15rem' }}>{txTypeLabel[t.type] || t.type}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: '#666' }}>{fmtDateTime(t.created_at)}</div>
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.8rem', fontWeight: 700, color: isIncoming ? '#0EAD6E' : '#E84040' }}>
                        {isIncoming ? '+' : ''}{fmtUSD(t.amount_cents)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @media(max-width:1000px){
          div:has(> h2) { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
