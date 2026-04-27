/**
 * GET /api/broker/balance
 * 
 * Get user's Kraken account balance
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { krakenClientForUser } from '@/lib/kraken-client'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const client = await krakenClientForUser(user.id)
    if (!client) {
      return NextResponse.json({ cash: '0', portfolio_value: '0', status: 'not_connected' })
    }

    const balance = await client.getBalance()

    return NextResponse.json({
      cash: balance.cashUsd.toString(),
      portfolio_value: balance.cashUsd.toString(),
      free: balance.freeUsd.toString(),
      status: 'connected',
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Broker Balance] Error:', msg)
    return NextResponse.json({ cash: '0', portfolio_value: '0' })
  }
}