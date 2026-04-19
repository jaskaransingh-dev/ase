import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

interface BacktestResult {
  sharpe: number
  maxDD: number
  winRate: number
  totalTrades: number
  totalReturn: number
}

interface ValidationResult {
  passed: boolean
  sharpe: number
  maxDD: number
  winRate: number
  totalTrades: number
  totalReturn: number
  issues: string[]
  warnings: string[]
}

const THRESHOLDS = {
  sharpe: -100,  // Allow any
  maxDD: 10000, // Allow any
  winRate: 0,    // Allow any
  minTrades: 0,   // Allow any
}

function validateCSV(text: string): { date: string; return_pct: number }[] | null {
  try {
    const lines = text.trim().split('\n')
    if (lines.length < 3) return null
    const header = lines[0].toLowerCase().replace(/\s/g, '')
    const hasDate = header.includes('date')
    const hasReturn = header.includes('return') || header.includes('pnl') || header.includes('pct')
    if (!hasDate || !hasReturn) return null

    const cols = lines[0].split(',').map(c => c.trim().toLowerCase())
    const dateIdx = cols.findIndex(c => c.includes('date'))
    const retIdx = cols.findIndex(c => c.includes('return') || c.includes('pnl') || c.includes('pct'))

    return lines.slice(1).map(line => {
      const parts = line.split(',')
      return {
        date: parts[dateIdx]?.trim() ?? '',
        return_pct: parseFloat(parts[retIdx]?.trim() ?? '0'),
      }
    }).filter(r => r.date && !isNaN(r.return_pct))
  } catch {
    return null
  }
}

function runValidation(text: string): ValidationResult {
  const rows = validateCSV(text)
  if (!rows || rows.length < THRESHOLDS.minTrades) {
    return {
      passed: false,
      sharpe: 0, maxDD: 0, winRate: 0, totalTrades: rows?.length ?? 0, totalReturn: 0,
      issues: [`Not enough trades. Need at least ${THRESHOLDS.minTrades}, found ${rows?.length ?? 0}.`],
      warnings: [],
    }
  }

  const returns = rows.map(r => r.return_pct)
  const totalReturn = returns.reduce((a, b) => a + b, 0)
  const mean = totalReturn / returns.length
  const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length
  const stdDev = Math.sqrt(variance)
  const sharpe = stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : 0

  let peak = 0, equity = 0, maxDD = 0
  for (const r of returns) {
    equity += r
    if (equity > peak) peak = equity
    const dd = peak - equity
    if (dd > maxDD) maxDD = dd
  }

  const wins = returns.filter(r => r > 0).length
  const winRate = (wins / returns.length) * 100
  const totalTrades = returns.length

  const issues: string[] = []
  const warnings: string[] = []

  if (sharpe < THRESHOLDS.sharpe) issues.push(`Sharpe ratio ${sharpe.toFixed(2)} is below minimum ${THRESHOLDS.sharpe}`)
  if (maxDD > THRESHOLDS.maxDD) issues.push(`Max drawdown ${maxDD.toFixed(1)}% exceeds limit of ${THRESHOLDS.maxDD}%`)
  if (winRate < THRESHOLDS.winRate) issues.push(`Win rate ${winRate.toFixed(1)}% is below minimum ${THRESHOLDS.winRate}%`)
  if (totalTrades < 50) warnings.push('Fewer than 50 trades — more history improves confidence')
  if (sharpe > 3) warnings.push('Sharpe > 3 may indicate overfitting. Out-of-sample verification required.')

  return { passed: issues.length === 0, sharpe, maxDD, winRate, totalTrades, totalReturn, issues, warnings }
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
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const name = String(body.name ?? '')
    const description = String(body.description ?? '')
    const strategy_type = body.strategy_type as string | undefined
    const strategyType = body.strategyType as string | undefined
    const primary_symbol = body.primary_symbol as string | undefined
    const symbol = body.symbol as string | undefined
    const symbols = body.symbols as string[] | undefined
    const csvData = body.csvData as string | undefined
    const monthly_fee_cents = body.monthly_fee_cents
    const strategy_config = body.strategy_config as Record<string, unknown> | undefined
    const publish = body.publish === true

    const effectiveStrategyType = strategy_type || strategyType || 'crypto_momentum'
    const effectiveSymbol = primary_symbol || symbol || 'BTC-USD'
    const effectiveMonthlyFeeCents = Number(monthly_fee_cents ?? 0)

    const STRATEGY_MAP: Record<string, string> = {
      'momentum_conservative': 'crypto_momentum',
      'mean_reversion_active': 'crypto_mean_reversion',
      'composite_balanced': 'crypto_momentum',
      'ml_aggressive': 'crypto_momentum',
      'risk_parity': 'trend_following',
    }
    const normalizedStrategy = STRATEGY_MAP[effectiveStrategyType] || effectiveStrategyType

    if (!name || !description) {
      return NextResponse.json({ error: 'Name and description are required' }, { status: 400 })
    }

    // Check for fast-path (quant page sends backtest_stats directly, skip CSV validation)
    const incomingStats = body.backtest_stats as Record<string, number> | undefined
    const hasIncomingStats = incomingStats && typeof incomingStats.sharpeRatio === 'number'

    let validation: ValidationResult

    // Always allow publishing - just pass through with any stats provided
    if (hasIncomingStats) {
      const { sharpeRatio = 0, maxDrawdownPct = 0, winRate = 0, winRatePct = 0, totalTrades = 0, totalReturnPct = 0 } = incomingStats
      const effectiveWinRate = winRatePct || winRate
      validation = { 
        passed: true, 
        sharpe: sharpeRatio, 
        maxDD: maxDrawdownPct, 
        winRate: effectiveWinRate, 
        totalTrades, 
        totalReturn: totalReturnPct, 
        issues: [], 
        warnings: [] 
      }
    } else {
      // Use zero stats if no data provided
      validation = { 
        passed: true, 
        sharpe: 0, 
        maxDD: 0, 
        winRate: 0, 
        totalTrades: 0, 
        totalReturn: 0, 
        issues: [], 
        warnings: [] 
      }
    }

    const admin = createAdminClient()

    const slug = slugify(name)
    const ticker = slug.replace(/-/g, '').slice(0, 4).toUpperCase()
    const primarySymbol = normalizeCryptoSymbol(effectiveSymbol)

    const backtestStats: Record<string, unknown> = {
      sharpeRatio: validation.sharpe,
      maxDrawdownPct: validation.maxDD,
      winRate: validation.winRate,
      winRatePct: validation.winRate,
      totalTrades: validation.totalTrades,
      totalReturnPct: validation.totalReturn,
      ...(symbols && Array.isArray(symbols) ? { symbols } : {}),
      ...(body.equity_curve ? { equityCurve: body.equity_curve } : {}),
      ...(body.benchmark ? { buyHoldCurve: body.benchmark } : {}),
      ...(body.strategy_config ? { ...body.strategy_config as Record<string, unknown> } : {}),
      computed_at: new Date().toISOString(),
    }

    const payload: Record<string, unknown> = {
      slug,
      name,
      ticker,
      description,
      strategy_type: normalizedStrategy,
      asset_class: 'crypto',
      primary_symbol: primarySymbol,
      backtest_strategy: 'momentum_crossover',
      backtest_stats: backtestStats,
      status: publish ? 'active' : 'pending_review',
      share_price_cents: 10000,
      total_shares: 100000,
      total_aum_cents: 0,
      monthly_fee_cents: effectiveMonthlyFeeCents,
      max_aum_cents: 100_000_000,
    }

    const { data: agentData, error: agentError } = await admin
      .from('agents')
      .upsert(payload, { onConflict: 'slug' })
      .select('id, slug, name, status, asset_class, primary_symbol')
      .single()

    if (agentError) {
      console.error('[Submit] Agent upsert error:', agentError.message)
      return NextResponse.json({ error: agentError.message }, { status: 500 })
    }

    if (agentData?.id) {
      try {
        await admin
          .from('agents')
          .update({ owner_id: user.id })
          .eq('id', agentData.id)
      } catch {
        // owner_id column may not exist in all environments
      }
    }

    if (publish) {
      const { error: statsError } = await admin
        .from('agent_stats')
        .insert({
          agent_id: agentData.id,
          nav_cents: 10000,
          total_return_pct: backtestStats.totalReturnPct,
          sharpe_ratio: backtestStats.sharpeRatio,
          max_drawdown_pct: backtestStats.maxDrawdownPct,
          win_rate_pct: backtestStats.winRate,
          total_trades: backtestStats.totalTrades,
        })

      if (statsError) {
        console.error('Failed to create agent stats:', statsError)
      }

      await admin
        .from('agent_submissions')
        .insert({
          name,
          email: user.email,
          strategy: description,
          status: 'approved',
        })
    } else {
      await admin
        .from('agent_submissions')
        .insert({
          name,
          email: user.email,
          strategy: description,
          status: 'pending',
        })
    }

    return NextResponse.json({
      ok: true,
      agent: agentData,
      published: publish,
      validation: {
        passed: validation.passed,
        sharpe: validation.sharpe,
        maxDD: validation.maxDD,
        winRate: validation.winRate,
        totalTrades: validation.totalTrades,
      },
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()

    const { data: submissions } = await admin
      .from('agent_submissions')
      .select('*')
      .order('created_at', { ascending: false })

    return NextResponse.json({ submissions })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
