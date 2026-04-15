/**
 * POST /api/account/sync-positions
 *
 * Sync actual Alpaca positions and update holdings to reflect real broker state.
 * Ensures dashboard and holdings table stay in sync with actual Alpaca account.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createBrokerAPI } from '@/lib/broker'
import { syncAlpacaBalance } from '@/lib/user-trading'
import { syncAlpacaPositionsToHoldings } from '@/lib/exchange'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()

    // Get user's broker account
    const { data: brokerAccount } = await admin
      .from('broker_accounts')
      .select('alpaca_account_id')
      .eq('user_id', user.id)
      .single()

    if (!brokerAccount?.alpaca_account_id) {
      return NextResponse.json({
        message: 'No broker account connected',
        synced: 0,
      })
    }

    // Sync Alpaca balance and positions
    let balance = { cash: 0, equity: 0, positions: [] as any[] }
    try {
      balance = await syncAlpacaBalance(admin, user.id, brokerAccount.alpaca_account_id)
    } catch (err) {
      console.error('[sync-positions] Failed to sync balance:', err)
      // Continue with position sync
    }

    // Get all user's active holdings and sync positions for each agent
    const { data: holdings } = await admin
      .from('holdings')
      .select('id, agent_id, user_id')
      .eq('user_id', user.id)
      .eq('status', 'active')

    let syncedCount = 0
    let syncErrors = 0
    for (const holding of holdings || []) {
      try {
        if (balance.positions.length > 0) {
          await syncAlpacaPositionsToHoldings(admin, {
            userId: user.id,
            agentId: holding.agent_id,
            alpacaPositions: balance.positions,
          })
          syncedCount++
        }
      } catch (err) {
        syncErrors++
        console.warn(`[sync-positions] Failed to sync positions for holding ${holding.id}:`, err instanceof Error ? err.message : err)
        // Continue with next holding
      }
    }

    console.log(`[sync-positions] Synced positions for user ${user.id}: ${syncedCount} succeeded, ${syncErrors} failed`)

    return NextResponse.json({
      success: true,
      synced: syncedCount,
      failed: syncErrors,
      balance: {
        cash_cents: balance.cash,
        equity_cents: balance.equity,
      },
      positions_count: balance.positions.length,
      message: syncErrors > 0 ? `Synced ${syncedCount} holdings, ${syncErrors} failed (migration may be pending)` : `Synced ${syncedCount} holdings successfully`,
    })
  } catch (err: unknown) {
    console.error('sync-positions error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/account/sync-positions
 * Alias for POST for convenience
 */
export async function GET() {
  return POST()
}
