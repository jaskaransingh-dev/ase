import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { fmtPct } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const strategyLabel: Record<string, string> = {
  momentum:              'Momentum',
  mean_reversion:        'Mean Rev',
  trend_following:       'Trend',
  crypto_momentum:       'Crypto Mom',
  crypto_mean_reversion: 'Crypto Arb',
}

const strategyColor: Record<string, string> = {
  momentum:              '#3b7eff',
  mean_reversion:        '#16c784',
  trend_following:       '#7c5cff',
  crypto_momentum:       '#f59e0b',
  crypto_mean_reversion: '#06b6d4',
}

export default async function AgentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch agents, 5y backtest history, and user subscriptions in parallel
  const [agentsRes, historyRes] = await Promise.all([
    supabase
      .from('agents')
      .select('*, agent_stats(nav_cents,total_return_pct,sharpe_ratio,max_drawdown_pct,win_rate_pct,total_trades,snapshot_at), backtest_stats')
      .eq('status', 'active')
      .order('created_at'),
    supabase
      .from('agent_backtest_history')
      .select('agent_id, period, stats, buy_hold_return_pct')
      .in('period', ['5y', '2y']),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AgentRow = NonNullable<typeof agentsRes.data>[number] & { backtest_stats?: any; monthly_fee_cents?: number; subscriber_count?: number; primary_symbol?: string; alert_level?: string }

  const agentsList = (agentsRes.data ?? []) as AgentRow[]

  // Build backtest map: agent_id -> { '5y': stats, '2y': stats }
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
  const agentsNeedingBacktest = agentsList.filter(a => !a.backtest_stats && !btMap[a.id]?.['5y'])
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

    const bt5y = btMap[agent.id]?.['5y']
    const bt2y = btMap[agent.id]?.['2y'] ?? agent.backtest_stats?.stats
    const cachedBt = agent.backtest_stats?.stats

    // 5y return: prefer agent_backtest_history 5y, else null
    const ret5y = bt5y?.totalReturnPct ?? null
    // 2y return: prefer history 2y, else cached
    const ret2y = latestStats?.total_return_pct ?? bt2y?.totalReturnPct ?? cachedBt?.totalReturnPct ?? null

    const sharpe = latestStats?.sharpe_ratio ?? bt2y?.sharpeRatio ?? cachedBt?.sharpeRatio ?? null
    const maxDD = latestStats?.max_drawdown_pct ?? bt2y?.maxDrawdownPct ?? cachedBt?.maxDrawdownPct ?? null
    const winRate = latestStats?.win_rate_pct ?? bt2y?.winRate ?? cachedBt?.winRate ?? null
    const isLive = !!latestStats

    return {
      ...agent,
      ret5y,
      ret2y,
      sharpe,
      maxDD,
      winRate,
      isLive,
      isSubscribed: userSubAgentIds.has(agent.id),
    }
  }).sort((a, b) => {
    // Sort by 5y return desc, then 2y return desc
    const r5a = a.ret5y ?? a.ret2y ?? -999
    const r5b = b.ret5y ?? b.ret2y ?? -999
    return r5b - r5a
  })

  const totalSubscribers = agentsList.reduce((s, a: AgentRow) => s + (a.subscriber_count ?? 0), 0)
  const avgReturn5y = displayAgents.filter(a => a.ret5y !== null).reduce((s, a) => s + (a.ret5y ?? 0), 0) / Math.max(displayAgents.filter(a => a.ret5y !== null).length, 1)

  return (
    <div style={{ padding: '2rem 2rem', maxWidth: 1400, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: '.3rem' }}>Marketplace</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-.025em' }}>AI Trading Agents</h1>
          <p style={{ color: 'var(--muted)', fontSize: '.82rem', marginTop: '.25rem' }}>
            Subscribe to verified algorithmic strategies — transparent performance, live execution
          </p>
        </div>
        <Link href="/builders/submit" className="btn-secondary" style={{ fontSize: '.8rem' }}>
          Submit Agent
        </Link>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '.6rem', marginBottom: '1.5rem' }} className="exchange-top-strip">
        {[
          { label: 'Active Strategies', value: agentsList.length.toString(), color: 'var(--white)' },
          { label: 'Total Subscribers', value: totalSubscribers.toString(), color: 'var(--blue2)' },
          { label: 'Avg 5Y Return', value: avgReturn5y !== 0 ? fmtPct(avgReturn5y) : '--', color: avgReturn5y >= 0 ? 'var(--green)' : 'var(--red)' },
          { label: 'Subscription Tier', value: 'Beta — Free', color: 'var(--green)' },
        ].map(item => (
          <div key={item.label} style={{ borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg2)', padding: '.7rem .9rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.2rem', textTransform: 'uppercase' }}>{item.label}</div>
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
                    <th style={{ paddingLeft: '1.25rem', width: '26%' }}>Agent</th>
                    <th style={{ width: '8%' }}>Market</th>
                    <th style={{ width: '10%', textAlign: 'right' }}>5Y Return</th>
                    <th style={{ width: '9%', textAlign: 'right' }}>2Y Return</th>
                    <th style={{ width: '8%', textAlign: 'right' }}>Sharpe</th>
                    <th style={{ width: '9%', textAlign: 'right' }}>Max DD</th>
                    <th style={{ width: '8%', textAlign: 'right' }}>Win %</th>
                    <th style={{ width: '8%', textAlign: 'right' }}>Subs</th>
                    <th style={{ width: '14%', textAlign: 'right', paddingRight: '1.25rem' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {displayAgents.map((agent, i) => {
                    const sColor = strategyColor[agent.strategy_type] ?? 'var(--muted)'
                    const r5pos = (agent.ret5y ?? 0) >= 0
                    const r2pos = (agent.ret2y ?? 0) >= 0
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
                        {/* 5Y Return */}
                        <td style={{ textAlign: 'right' }}>
                          {agent.ret5y !== null ? (
                            <div>
                              <div className={`num ${r5pos ? 'pos-num' : 'neg-num'}`} style={{ fontFamily: 'var(--font-mono)', fontSize: '.88rem', fontWeight: 700 }}>
                                {fmtPct(agent.ret5y)}
                              </div>
                              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: 'var(--faint)', marginTop: '.08rem' }}>
                                {agent.isLive ? 'LIVE' : 'BACKTEST'}
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--faint)', fontSize: '.72rem' }}>—</span>
                          )}
                        </td>
                        {/* 2Y Return */}
                        <td style={{ textAlign: 'right' }}>
                          {agent.ret2y !== null ? (
                            <span className={`num ${r2pos ? 'pos-num' : 'neg-num'}`} style={{ fontFamily: 'var(--font-mono)', fontSize: '.8rem', fontWeight: 600 }}>
                              {fmtPct(agent.ret2y)}
                            </span>
                          ) : (
                            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--faint)', fontSize: '.72rem' }}>—</span>
                          )}
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
                        {/* Subs */}
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.8rem', color: 'var(--faint)' }}>
                            {agent.subscriber_count ?? 0}
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
                              {agent.isSubscribed ? 'Manage' : 'Subscribe'}
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
                const r5pos = (agent.ret5y ?? 0) >= 0
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
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, color: r5pos ? 'var(--green)' : 'var(--red)' }}>
                          {agent.ret5y !== null ? fmtPct(agent.ret5y) : (agent.ret2y !== null ? fmtPct(agent.ret2y) : '—')}
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: 'var(--faint)' }}>
                          {agent.ret5y !== null ? '5Y' : '2Y'} {agent.isLive ? 'LIVE' : 'BACKTEST'}
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
                        {agent.isSubscribed ? 'Manage' : 'Subscribe'}
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
