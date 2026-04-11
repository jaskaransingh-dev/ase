import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { fmtPct } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const strategyColor: Record<string, string> = {
  momentum:              '#4f7cff',
  mean_reversion:        '#10b981',
  trend_following:       '#818cf8',
  crypto_momentum:       '#ff6b35',
  crypto_mean_reversion:  '#06b6d4',
}

export default async function AgentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch agents, 1mo backtest history, and user subscriptions in parallel
  const [agentsRes, historyRes] = await Promise.all([
    supabase
      .from('agents')
      .select('*, agent_stats(nav_cents,total_return_pct,sharpe_ratio,max_drawdown_pct,win_rate_pct,total_trades,snapshot_at), backtest_stats')
      .eq('status', 'active')
      .order('created_at'),
    supabase
      .from('agent_backtest_history')
      .select('agent_id, period, stats, buy_hold_return_pct')
      .in('period', ['1mo', '1y']),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AgentRow = NonNullable<typeof agentsRes.data>[number] & { backtest_stats?: any; monthly_fee_cents?: number; subscriber_count?: number; primary_symbol?: string; alert_level?: string }

  const agentsList = (agentsRes.data ?? []) as AgentRow[]

  // Build backtest map: agent_id -> { '1mo': stats, '1y': stats }
  const btMap: Record<string, Record<string, { totalReturnPct: number; sharpeRatio: number; maxDrawdownPct: number; winRate: number; totalTrades: number }>> = {}
  for (const row of historyRes.data ?? []) {
    if (!btMap[row.agent_id]) btMap[row.agent_id] = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    btMap[row.agent_id][row.period] = row.stats as any
  }

  // Get user subscriptions
  let userSubAgentIds = new Set<string>()
  if (user) {
    const { data: subs } = await supabase
      .from('subscriptions')
      .select('agent_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
    userSubAgentIds = new Set((subs ?? []).map(s => s.agent_id))
  }

  // Trigger backtest cron in background if agents lack stats
  const agentsNeedingBacktest = agentsList.filter(a => !a.backtest_stats && !btMap[a.id]?.['1mo'])
  if (agentsNeedingBacktest.length > 0) {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
    const cronSecret = process.env.CRON_SECRET ?? ''
    fetch(`${baseUrl}/api/cron/run-backtests`, {
      method: 'POST',
      cache: 'no-store',
      headers: cronSecret ? { 'x-cron-secret': cronSecret } : {},
    }).catch(() => null)
  }

  // Build display data for each agent
  const displayAgents = agentsList.map(agent => {
    const statsArr = Array.isArray(agent.agent_stats) ? agent.agent_stats : (agent.agent_stats ? [agent.agent_stats] : [])
    const latestStats = statsArr.length > 0 ? statsArr.reduce((a: typeof statsArr[0], b: typeof statsArr[0]) => (a.snapshot_at > b.snapshot_at ? a : b)) : null

    const bt1mo = btMap[agent.id]?.['1mo'] ?? agent.backtest_stats?.stats
    const bt1y = btMap[agent.id]?.['1y'] ?? null
    const cachedBt = agent.backtest_stats?.stats

    // Use live stats for recent performance, fallback to backtest for historical stats
    const todayReturn = latestStats?.total_return_pct ?? null
    
    // For 30d return: use live 30-day window or 1mo backtest
    const return30d = latestStats?.total_return_pct ?? bt1mo?.totalReturnPct ?? cachedBt?.totalReturnPct ?? null

    // Use 1y backtest for overall stats if no live data
    const sharpe = latestStats?.sharpe_ratio ?? bt1y?.sharpeRatio ?? bt1mo?.sharpeRatio ?? cachedBt?.sharpeRatio ?? null
    const maxDD = latestStats?.max_drawdown_pct ?? bt1y?.maxDrawdownPct ?? bt1mo?.maxDrawdownPct ?? cachedBt?.maxDrawdownPct ?? null
    const winRate = latestStats?.win_rate_pct ?? bt1y?.winRate ?? bt1mo?.winRate ?? cachedBt?.winRate ?? null
    const isLive = !!latestStats
    const lastRun = latestStats?.snapshot_at ?? agent.last_run_at ?? null
    const navCents = latestStats?.nav_cents ?? agent.share_price_cents ?? 10_000
    const nav = navCents / 100

    return {
      ...agent,
      todayReturn,
      return30d,
      sharpe,
      maxDD,
      winRate,
      isLive,
      lastRun,
      navCents,
      nav,
      isSubscribed: userSubAgentIds.has(agent.id),
    }
  }).sort((a, b) => {
    // Sort by 30d return desc
    const ra = a.return30d ?? -999
    const rb = b.return30d ?? -999
    return rb - ra
  })

  const totalSubscribers = agentsList.reduce((s, a: AgentRow) => s + (a.subscriber_count ?? 0), 0)
  const avgReturn30d = displayAgents.filter(a => a.return30d !== null).reduce((s, a) => s + (a.return30d ?? 0), 0) / Math.max(displayAgents.filter(a => a.return30d !== null).length, 1)
  const totalNav = displayAgents.reduce((s, a) => s + (a.navCents ?? 0), 0)

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: 1400, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: '.25rem' }}>Exchange</div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-.02em' }}>AI Trading Agents</h1>
        </div>
        <Link href="/dashboard/backtest" className="btn-secondary" style={{ fontSize: '.82rem', padding: '.5rem 1rem' }}>
          Backtest Lab
        </Link>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '.75rem', marginBottom: '1.5rem' }} className="exchange-top-strip">
        {[
          { label: 'Agents', value: agentsList.length.toString(), color: 'var(--white)' },
          { label: 'Subscribers', value: totalSubscribers.toString(), color: 'var(--muted)' },
          { label: 'Avg Return', value: avgReturn30d !== 0 ? fmtPct(avgReturn30d) : '--', color: avgReturn30d >= 0 ? '#10b981' : '#ef4444' },
          { label: 'Total NAV', value: `$${(totalNav / 100 / 100).toLocaleString()}K`, color: 'var(--orange)' },
        ].map(item => (
          <div key={item.label} style={{ borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg2)', padding: '.8rem 1rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.25rem', textTransform: 'uppercase' }}>{item.label}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1rem', color: item.color, letterSpacing: '-.01em' }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Table wrapper */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        {agentsList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '5rem 2rem', color: 'var(--muted)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', letterSpacing: '.1em', color: 'var(--faint)', marginBottom: '.75rem' }}>NO AGENTS</div>
            <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '.4rem' }}>Agents launching soon</div>
            <div style={{ fontSize: '.85rem', color: 'var(--muted)' }}>The first verified strategies are being onboarded.</div>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="desktop-table" style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ paddingLeft: '1.25rem', width: '24%' }}>Agent</th>
                    <th style={{ width: '9%' }}>Market</th>
                    <th style={{ width: '10%', textAlign: 'right' }}>Today</th>
                    <th style={{ width: '10%', textAlign: 'right' }}>30D Return</th>
                    <th style={{ width: '10%', textAlign: 'right' }}>NAV</th>
                    <th style={{ width: '7%', textAlign: 'right' }}>Sharpe</th>
                    <th style={{ width: '8%', textAlign: 'right' }}>Max DD</th>
                    <th style={{ width: '7%', textAlign: 'right' }}>Win %</th>
                    <th style={{ width: '12%', textAlign: 'right', paddingRight: '1.25rem' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {displayAgents.map((agent, i) => {
                    const sColor = strategyColor[agent.strategy_type] ?? 'var(--muted)'
                    const todayPos = (agent.todayReturn ?? 0) >= 0
                    const ret30dPos = (agent.return30d ?? 0) >= 0
                    const lastRunTime = agent.lastRun ? new Date(agent.lastRun).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null
                    return (
                      <tr key={agent.id} style={{ borderBottom: i === displayAgents.length - 1 ? 'none' : '1px solid rgba(30,55,100,.2)' }}>
                        {/* Agent name */}
                        <td style={{ paddingLeft: '1.25rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                            <div style={{ width: 36, height: 36, borderRadius: 9, background: `${sColor}18`, border: `1px solid ${sColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', fontWeight: 700, color: sColor }}>
                                {(agent.primary_symbol ?? 'XX').split('-')[0].slice(0, 3)}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '.9rem', color: 'var(--white)', marginBottom: '.12rem' }}>{agent.name}</div>
                              <div style={{ display: 'flex', gap: '.35rem', alignItems: 'center' }}>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--faint)' }}>
                                  {agent.description?.slice(0, 42)}{(agent.description?.length ?? 0) > 42 ? '…' : ''}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        {/* Market */}
                        <td>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', fontWeight: 600, color: 'var(--muted)' }}>
                            {agent.primary_symbol ?? 'MULTI'}
                          </span>
                        </td>
                        {/* Today Return */}
                        <td style={{ textAlign: 'right' }}>
                          {agent.todayReturn !== null ? (
                            <div>
                              <div className={`num ${todayPos ? 'pos-num' : 'neg-num'}`} style={{ fontFamily: 'var(--font-mono)', fontSize: '.88rem', fontWeight: 700 }}>
                                {fmtPct(agent.todayReturn)}
                              </div>
                              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: 'var(--faint)', marginTop: '.08rem' }}>
                                {lastRunTime ?? 'LIVE'}
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--faint)', fontSize: '.72rem' }}>—</span>
                          )}
                        </td>
                        {/* 30D Return */}
                        <td style={{ textAlign: 'right' }}>
                          {agent.return30d !== null ? (
                            <span className={`num ${ret30dPos ? 'pos-num' : 'neg-num'}`} style={{ fontFamily: 'var(--font-mono)', fontSize: '.8rem', fontWeight: 600 }}>
                              {fmtPct(agent.return30d)}
                            </span>
                          ) : (
                            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--faint)', fontSize: '.72rem' }}>—</span>
                          )}
                        </td>
                        {/* NAV */}
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.8rem', fontWeight: 600, color: 'var(--gold)' }}>
                            ${agent.nav?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '10,000.00'}
                          </span>
                        </td>
                        {/* Sharpe */}
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.8rem', fontWeight: 600, color: agent.sharpe !== null && agent.sharpe > 1 ? 'var(--white)' : 'var(--muted)' }}>
                            {agent.sharpe !== null ? agent.sharpe.toFixed(2) : '—'}
                          </span>
                        </td>
                        {/* Max DD */}
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.8rem', fontWeight: 600, color: 'var(--red)' }}>
                            {agent.maxDD !== null ? fmtPct(-agent.maxDD) : '—'}
                          </span>
                        </td>
                        {/* Win % */}
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.8rem', fontWeight: 600, color: 'var(--muted)' }}>
                            {agent.winRate !== null ? agent.winRate.toFixed(1) + '%' : '—'}
                          </span>
                        </td>
                        {/* Action */}
                        <td style={{ textAlign: 'right', paddingRight: '1.25rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', justifyContent: 'flex-end' }}>
                            <Link href={`/agents/${agent.slug}`} style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: 'var(--faint)' }}>
                              Details
                            </Link>
                            <Link
                              href={user ? `/agents/${agent.slug}` : '/login'}
                              className={agent.isSubscribed ? 'btn-subscribed' : 'btn-subscribe'}
                              style={{ fontSize: '.72rem', padding: '.35rem .85rem' }}
                            >
                              {agent.isSubscribed ? 'Manage' : 'Allocate'}
                            </Link>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="mobile-cards" style={{ display: 'none', flexDirection: 'column', gap: 0 }}>
              {displayAgents.map((agent, i) => {
                const ret30dPos = (agent.return30d ?? 0) >= 0
                return (
                  <div key={agent.id} style={{ padding: '1rem 1.1rem', borderBottom: i === displayAgents.length - 1 ? 'none' : '1px solid rgba(30,55,100,.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '.65rem' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '.9rem', marginBottom: '.1rem' }}>{agent.name}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)' }}>
                          {agent.primary_symbol ?? 'MULTI'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, color: ret30dPos ? 'var(--green)' : 'var(--red)' }}>
                          {agent.return30d !== null ? fmtPct(agent.return30d) : '—'}
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: 'var(--faint)' }}>
                          30D {agent.isLive ? 'LIVE' : 'BACKTEST'}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '.4rem', marginBottom: '.75rem' }}>
                      {[
                        { k: 'SHARPE', v: agent.sharpe !== null ? agent.sharpe.toFixed(2) : '—' },
                        { k: 'MAX DD', v: agent.maxDD !== null ? fmtPct(-agent.maxDD) : '—', red: true },
                        { k: 'WIN %', v: agent.winRate !== null ? agent.winRate.toFixed(0) + '%' : '—' },
                      ].map(({ k, v, red }) => (
                        <div key={k} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 7, padding: '.35rem .5rem' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.1rem' }}>{k}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.75rem', fontWeight: 700, color: red ? 'var(--red)' : 'var(--white)' }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
                      <Link href={`/agents/${agent.slug}`} style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--faint)' }}>Details</Link>
                      <Link href={user ? `/agents/${agent.slug}` : '/login'} className={agent.isSubscribed ? 'btn-subscribed' : 'btn-subscribe'} style={{ fontSize: '.75rem', padding: '.38rem .9rem' }}>
                        {agent.isSubscribed ? 'Manage' : 'Allocate'}
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      <style>{`
        @media (max-width: 820px) {
          .desktop-table { display: none !important; }
          .mobile-cards { display: flex !important; }
        }
        .data-table tbody tr:hover td { background: rgba(59,127,255,.03); }
      `}</style>
    </div>
  )
}
