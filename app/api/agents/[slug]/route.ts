import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

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

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const slug = searchParams.get('slug')

    if (!slug) {
      return NextResponse.json({ error: 'Slug is required' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: agent, error } = await admin
      .from('agents')
      .select(`
        *,
        agent_stats(*)
      `)
      .eq('slug', slug)
      .single()

    if (error || !agent) {
      return NextResponse.json({ error: 'Agent not found or not authorized' }, { status: 404 })
    }

    return NextResponse.json({ agent })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      slug,
      name,
      description,
      strategy_description,
      plain_english,
      best_for,
      main_risk,
      strategy_type,
      primary_symbol,
      backtest_strategy,
      asset_class,
      status,
      publish,
      backtest_stats,
      share_price_cents,
      max_aum_cents,
      monthly_fee_cents,
    } = body

    if (!slug) {
      return NextResponse.json({ error: 'Slug is required' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: existing, error: checkError } = await admin
      .from('agents')
      .select('id, owner_id')
      .eq('slug', slug)
      .single()

    if (checkError || !existing) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    if (existing.owner_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized to edit this agent' }, { status: 403 })
    }

    const updateData: Record<string, unknown> = {}

    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (strategy_description !== undefined) updateData.strategy_description = strategy_description
    if (plain_english !== undefined) updateData.plain_english = plain_english
    if (best_for !== undefined) updateData.best_for = best_for
    if (main_risk !== undefined) updateData.main_risk = main_risk
    if (strategy_type !== undefined) updateData.strategy_type = strategy_type
    if (primary_symbol !== undefined) updateData.primary_symbol = normalizeCryptoSymbol(primary_symbol)
    if (backtest_strategy !== undefined) updateData.backtest_strategy = backtest_strategy
    if (asset_class !== undefined) updateData.asset_class = asset_class
    if (backtest_stats !== undefined) updateData.backtest_stats = backtest_stats
    if (share_price_cents !== undefined) updateData.share_price_cents = share_price_cents
    if (max_aum_cents !== undefined) updateData.max_aum_cents = max_aum_cents
    if (monthly_fee_cents !== undefined) updateData.monthly_fee_cents = monthly_fee_cents

    if (publish !== undefined) {
      updateData.status = publish ? 'active' : 'pending_review'
    } else if (status !== undefined) {
      if (!['active', 'paused', 'pending_review'].includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      updateData.status = status
    }

    const { data: agent, error } = await admin
      .from('agents')
      .update(updateData)
      .eq('slug', slug)
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (backtest_stats && status === 'active') {
      const stats = agent.agent_stats
      const latestStats = Array.isArray(stats)
        ? stats.sort((a: any, b: any) => new Date(b.snapshot_at).getTime() - new Date(a.snapshot_at).getTime())[0]
        : stats

      if (!latestStats) {
        await admin
          .from('agent_stats')
          .insert({
            agent_id: agent.id,
            nav_cents: backtest_stats.totalReturnPct !== undefined ? 10000 : 10000,
            total_return_pct: backtest_stats.totalReturnPct || 0,
            sharpe_ratio: backtest_stats.sharpeRatio || 0,
            max_drawdown_pct: backtest_stats.maxDrawdownPct || 0,
            win_rate_pct: backtest_stats.winRate || 0,
            total_trades: backtest_stats.totalTrades || 0,
          })
      }
    }

    return NextResponse.json({ ok: true, agent })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const slug = searchParams.get('slug')

    if (!slug) {
      return NextResponse.json({ error: 'Slug is required' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: existing, error: checkError } = await admin
      .from('agents')
      .select('id, owner_id, total_aum_cents')
      .eq('slug', slug)
      .single()

    if (checkError || !existing) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    if (existing.owner_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized to delete this agent' }, { status: 403 })
    }

    if (existing.total_aum_cents > 0) {
      return NextResponse.json({
        error: 'Cannot delete agent with active investments. Please pause or transfer subscribers first.'
      }, { status: 400 })
    }

    await admin
      .from('agent_stats')
      .delete()
      .eq('agent_id', existing.id)

    await admin
      .from('agent_trades')
      .delete()
      .eq('agent_id', existing.id)

    const { error: deleteError } = await admin
      .from('agents')
      .delete()
      .eq('slug', slug)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
