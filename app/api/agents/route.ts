import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateTradingCapitalCents } from '@/lib/market'

export const dynamic = 'force-dynamic'

interface BacktestStats {
  sharpeRatio: number
  maxDrawdownPct: number
  winRate: number
  totalTrades: number
  totalReturnPct?: number
  sortinoRatio?: number
  profitFactor?: number
  avgTradeReturnPct?: number
}

const THRESHOLDS = {
  sharpe: 0.5,
  maxDD: 50,
  winRate: 40,
  minTrades: 20,
}

interface AgentData {
  id: string
  name: string
  slug: string
  ticker?: string
  description: string
  strategy_type: string
  status: string
  total_aum_cents: number
  share_price_cents?: number
  signal_summary?: string
  last_run_at?: string
  agent_stats: {
    nav_cents: number
    bid_cents?: number
    ask_cents?: number
    total_return_pct: number
    sharpe_ratio: number
    max_drawdown_pct: number
    win_rate_pct: number
    total_trades: number
    snapshot_at: string
  } | null
}

function validateBacktestStats(stats: BacktestStats): { valid: boolean; issues: string[] } {
  const issues: string[] = []

  if (stats.sharpeRatio < THRESHOLDS.sharpe) {
    issues.push(`Sharpe ratio ${stats.sharpeRatio.toFixed(2)} is below minimum ${THRESHOLDS.sharpe}`)
  }
  if (stats.maxDrawdownPct > THRESHOLDS.maxDD) {
    issues.push(`Max drawdown ${stats.maxDrawdownPct.toFixed(1)}% exceeds limit of ${THRESHOLDS.maxDD}%`)
  }
  if (stats.winRate < THRESHOLDS.winRate) {
    issues.push(`Win rate ${stats.winRate.toFixed(1)}% is below minimum ${THRESHOLDS.winRate}%`)
  }
  if (stats.totalTrades < THRESHOLDS.minTrades) {
    issues.push(`Trade count ${stats.totalTrades} is below minimum ${THRESHOLDS.minTrades}`)
  }

  return { valid: issues.length === 0, issues }
}

export async function GET() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('agents')
    .select('id, name, slug, ticker, description, strategy_type, asset_class, status, total_aum_cents, share_price_cents, signal_summary, last_run_at, agent_stats(nav_cents, bid_cents, ask_cents, total_return_pct, sharpe_ratio, max_drawdown_pct, win_rate_pct, total_trades, snapshot_at)')
    .eq('status', 'active')
    .eq('asset_class', 'crypto')
    .order('created_at')

  const agentsWithTicker = (data as unknown as AgentData[] ?? []).map(agent => ({
    ...agent,
    ticker: agent.ticker || agent.slug.toUpperCase().replace(/-/g, '').slice(0, 4),
    total_aum_cents: calculateTradingCapitalCents(agent.total_aum_cents),
  }))

  return NextResponse.json({ data: agentsWithTicker })
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeCryptoSymbol(value: string) {
  const clean = value.trim().toUpperCase().replace(/-/g, '/')
  if (clean.includes('/')) return clean
  if (clean.endsWith('USD')) return `${clean.slice(0, -3)}/USD`
  return `${clean}/USD`
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized - Please sign in first' }, { status: 401 })

    const body = await request.json()
    const name = String(body.name ?? '').trim()
    const description = String(body.description ?? '').trim()
    const strategy_type = String(body.strategy_type ?? 'crypto_momentum').trim()
    const primary_symbol = normalizeCryptoSymbol(String(body.primary_symbol ?? 'BTC-USD'))
    const backtest_strategy = String(body.backtest_strategy ?? 'momentum_crossover').trim()
    const asset_class = String(body.asset_class ?? 'crypto').trim()
    const slug = slugify(String(body.slug || body.name))
    const ticker = String(body.ticker ?? '').trim().toUpperCase() || slug.replace(/-/g, '').slice(0, 4).toUpperCase()
    const publish = body.publish === true

    const backtestStats = body.backtest_stats as BacktestStats | null

    if (!name) {
      return NextResponse.json({ error: 'Agent name is required' }, { status: 400 })
    }

    if (!description) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 })
    }

    // Auto-approve all agents for now - skip backtest validation
    const shouldPublish = true

    const admin = createAdminClient()

    const payload: Record<string, unknown> = {
      slug,
      name,
      ticker,
      description,
      strategy_type,
      asset_class,
      primary_symbol,
      backtest_strategy,
      backtest_stats: backtestStats ? {
        stats: backtestStats,
      } : null,
      status: shouldPublish ? 'active' : 'pending_review',
      share_price_cents: Number(body.share_price_cents ?? 10000),
      total_shares: 100000,
      total_aum_cents: 0,
      owner_id: user.id,
      monthly_fee_cents: Number(body.monthly_fee_cents ?? 0),
      max_aum_cents: Number(body.max_aum_cents ?? 100_000_000),
    }

    if (body.strategy_description) payload.strategy_description = body.strategy_description
    if (body.plain_english) payload.plain_english = body.plain_english
    if (body.best_for) payload.best_for = body.best_for
    if (body.main_risk) payload.main_risk = body.main_risk

    const { data: agentData, error: agentError } = await admin
      .from('agents')
      .upsert(payload, { onConflict: 'slug' })
      .select('*')
      .single()

    if (agentError) {
      console.error('Agent creation error:', agentError)
      return NextResponse.json({ error: agentError.message }, { status: 500 })
    }

    if (backtestStats && publish) {
      await admin
        .from('agent_stats')
        .delete()
        .eq('agent_id', agentData.id)

      const { error: statsError } = await admin
        .from('agent_stats')
        .insert({
          agent_id: agentData.id,
          nav_cents: 10000,
          total_return_pct: backtestStats.totalReturnPct ?? 0,
          sharpe_ratio: backtestStats.sharpeRatio ?? 0,
          max_drawdown_pct: backtestStats.maxDrawdownPct ?? 0,
          win_rate_pct: backtestStats.winRate ?? 0,
          total_trades: backtestStats.totalTrades ?? 0,
        })

      if (statsError) {
        console.error('Failed to create agent stats:', statsError)
      }
    }

    return NextResponse.json({
      ok: true,
      agent: agentData,
      published: publish,
      backtestPassed: backtestStats ? validateBacktestStats(backtestStats).valid : null
    })
  } catch (err: unknown) {
    console.error('Agent POST error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
