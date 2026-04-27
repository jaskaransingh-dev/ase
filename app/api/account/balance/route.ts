/**
 * GET /api/account/balance
 *
 * Returns user's Kraken trading account balance
 * IMPORTANT: Subtracts already-invested amounts from holdings to show TRUE available balance
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { krakenClientForUser } from '@/lib/kraken-client'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's invested amounts from holdings (money already in agents)
    const { data: holdings } = await admin
      .from('holdings')
      .select('invested_cents')
      .eq('user_id', user.id)
      .eq('status', 'active')
    
    const investedCents = (holdings ?? []).reduce((sum, h) => sum + (Number(h.invested_cents) || 0), 0)

    const client = await krakenClientForUser(user.id)
    if (!client) {
      return NextResponse.json({
        equity_cents: 0,
        cash_cents: 0,
        invested_cents: investedCents,
        available_cents: 0,
        buying_power_cents: 0,
        status: 'not_connected',
        provider: 'kraken',
        account_id: null,
        message: 'Connect your Kraken account to see your balance',
      })
    }

    const balance = await client.getBalance()
    const krakenCashCents = Math.round(balance.freeUsd * 100)
    const availableCents = Math.max(0, krakenCashCents - investedCents)

    return NextResponse.json({
      equity_cents: Math.round(balance.cashUsd * 100) + investedCents,
      cash_cents: krakenCashCents,
      invested_cents: investedCents,
      available_cents: availableCents,
      buying_power_cents: availableCents,
      cash: (krakenCashCents / 100).toFixed(2),
      portfolio_value: ((krakenCashCents + investedCents) / 100).toFixed(2),
      status: 'connected',
      provider: 'kraken',
      account_id: 'kraken',
    })
  } catch (err: unknown) {
    console.error('account balance error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}