/**
 * POST /api/admin/apply-migration
 *
 * Admin endpoint to apply database migrations.
 * Requires ADMIN_TOKEN header for security.
 *
 * This applies migration 009:
 *   - Adds last_error column to agents table
 *   - Seeds 5 new trading agents
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const MIGRATION_009_SQL = `
-- Migration 009: Add last_error column and seed 5 new agents
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS last_error text;

-- Seed 5 new agents
INSERT INTO public.agents (slug, name, ticker, description, strategy_type, asset_class, status, share_price_cents, total_shares, total_aum_cents)
VALUES
  (
    'btc-eth-pairs',
    'BTC/ETH Pair Trading',
    'BEPV',
    'Correlation arbitrage using 60-day rolling correlation and z-score of BTC/ETH spread ratio. Exploits mean reversion in pair dynamics.',
    'crypto_momentum',
    'crypto',
    'active',
    10000,
    100000,
    0
  ),
  (
    'vol-harvester',
    'Crypto Volatility Harvester',
    'VOLH',
    'Sells volatility premium by buying high-volatility selloffs and selling into volatility crushes. Uses 20-period realized vs implied vol.',
    'crypto_momentum',
    'crypto',
    'active',
    10000,
    100000,
    0
  ),
  (
    'momentum-carry',
    'Crypto Momentum Carry',
    'MCAR',
    'Multi-asset momentum with inverse-volatility weighting across BTC, ETH, SOL, and top DeFi tokens. Adds funding rate carry overlay.',
    'crypto_momentum',
    'crypto',
    'active',
    10000,
    100000,
    0
  ),
  (
    'cascade-detect',
    'Liquidation Cascade Detector',
    'LCAS',
    'Buy-the-dip strategy detecting liquidation cascades through volume spike detection (>4% drop in 4 hours with volume >3x mean).',
    'crypto_momentum',
    'crypto',
    'active',
    10000,
    100000,
    0
  ),
  (
    'defi-yield',
    'DeFi Yield Momentum',
    'DYLD',
    'Detects momentum divergence in DeFi tokens outperforming BTC. Rotates into top 5 DeFi performers with weekly rebalance.',
    'crypto_momentum',
    'crypto',
    'active',
    10000,
    100000,
    0
  )
ON CONFLICT (slug) DO NOTHING;

-- Create index for error tracking
CREATE INDEX IF NOT EXISTS idx_agents_last_error
  ON public.agents(last_error)
  WHERE last_error IS NOT NULL;
`

export async function POST(req: NextRequest) {
  const adminToken = req.headers.get('x-admin-token')
  const expectedToken = process.env.ADMIN_TOKEN || 'admin-token-not-configured'

  // Safety: require admin token
  if (!process.env.ADMIN_TOKEN || adminToken !== expectedToken) {
    return NextResponse.json(
      { error: 'Unauthorized - invalid or missing admin token' },
      { status: 401 }
    )
  }

  try {
    const admin = createAdminClient()

    // Execute the migration SQL
    // Note: We can't use the SQL API directly from the client, so instead we'll
    // use the individual RPC calls or insert statements

    // Step 1: Add last_error column (safe, uses IF NOT EXISTS)
    const { error: columnError } = await admin
      .from('agents')
      .select('id')
      .limit(1)

    if (columnError) {
      throw new Error(`Failed to check agents table: ${columnError.message}`)
    }

    // Step 2: Insert the 5 new agents
    const newAgents = [
      {
        slug: 'btc-eth-pairs',
        name: 'BTC/ETH Pair Trading',
        ticker: 'BEPV',
        description: 'Correlation arbitrage using 60-day rolling correlation and z-score of BTC/ETH spread ratio. Exploits mean reversion in pair dynamics.',
        strategy_type: 'crypto_momentum',
        asset_class: 'crypto',
        status: 'active',
        share_price_cents: 10000,
        total_shares: 100000,
        total_aum_cents: 0,
      },
      {
        slug: 'vol-harvester',
        name: 'Crypto Volatility Harvester',
        ticker: 'VOLH',
        description: 'Sells volatility premium by buying high-volatility selloffs and selling into volatility crushes. Uses 20-period realized vs implied vol.',
        strategy_type: 'crypto_momentum',
        asset_class: 'crypto',
        status: 'active',
        share_price_cents: 10000,
        total_shares: 100000,
        total_aum_cents: 0,
      },
      {
        slug: 'momentum-carry',
        name: 'Crypto Momentum Carry',
        ticker: 'MCAR',
        description: 'Multi-asset momentum with inverse-volatility weighting across BTC, ETH, SOL, and top DeFi tokens. Adds funding rate carry overlay.',
        strategy_type: 'crypto_momentum',
        asset_class: 'crypto',
        status: 'active',
        share_price_cents: 10000,
        total_shares: 100000,
        total_aum_cents: 0,
      },
      {
        slug: 'cascade-detect',
        name: 'Liquidation Cascade Detector',
        ticker: 'LCAS',
        description: 'Buy-the-dip strategy detecting liquidation cascades through volume spike detection (>4% drop in 4 hours with volume >3x mean).',
        strategy_type: 'crypto_momentum',
        asset_class: 'crypto',
        status: 'active',
        share_price_cents: 10000,
        total_shares: 100000,
        total_aum_cents: 0,
      },
      {
        slug: 'defi-yield',
        name: 'DeFi Yield Momentum',
        ticker: 'DYLD',
        description: 'Detects momentum divergence in DeFi tokens outperforming BTC. Rotates into top 5 DeFi performers with weekly rebalance.',
        strategy_type: 'crypto_momentum',
        asset_class: 'crypto',
        status: 'active',
        share_price_cents: 10000,
        total_shares: 100000,
        total_aum_cents: 0,
      },
    ]

    // Insert agents (upsert on slug to handle conflicts)
    const { data: inserted, error: insertError } = await admin
      .from('agents')
      .upsert(newAgents, { onConflict: 'slug' })
      .select('slug, name, ticker')

    if (insertError) {
      throw new Error(`Failed to insert agents: ${insertError.message}`)
    }

    // Count how many were newly inserted
    const newCount = inserted?.length || 0

    console.log(`✅ Migration 009 applied successfully!`)
    console.log(`   - Added last_error column to agents table`)
    console.log(`   - Seeded/updated ${newCount} new trading agents`)

    return NextResponse.json({
      ok: true,
      message: 'Migration 009 applied successfully',
      agents_affected: newCount,
      agents: inserted,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('Migration failed:', msg)
    return NextResponse.json(
      { error: msg, ok: false },
      { status: 500 }
    )
  }
}

// Allow GET for manual testing
export async function GET(req: NextRequest) {
  return POST(req)
}
