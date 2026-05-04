/**
 * GET /api/account/balance
 *
 * Returns user's Kraken trading account balance
 * IMPORTANT: Subtracts already-invested amounts from holdings to show TRUE available balance
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { krakenClientForUser } from '@/lib/kraken-client'
import { getUserFromRequest } from '@/lib/supabase/get-user'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const admin = createAdminClient()
    const user = await getUserFromRequest()

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
    let krakenCashCents = 0
    let lastKnownBalance = 0
    
    // Get cached balance for fallback
    const { data: keyRow } = await admin
      .from('user_kraken_keys')
      .select('last_balance_usd')
      .eq('user_id', user.id)
      .maybeSingle()
    lastKnownBalance = Math.round((keyRow?.last_balance_usd ?? 0) * 100)
    
    if (!client) {
      const available = Math.max(0, lastKnownBalance - investedCents)
      return NextResponse.json({
        equity_cents: lastKnownBalance + investedCents,
        cash_cents: lastKnownBalance,
        invested_cents: investedCents,
        available_cents: available,
        buying_power_cents: available,
        // If we have a cached balance, the wallet is usable (paper/demo) — only
        // mark not_connected when there is genuinely nothing to spend.
        status: lastKnownBalance > 0 ? 'connected' : 'not_connected',
        balance_source: lastKnownBalance > 0 ? 'cached' : 'none',
        provider: 'kraken',
        account_id: null,
        message: lastKnownBalance > 0
          ? 'Using cached Kraken balance. Reconnect for live updates.'
          : 'Connect your Kraken account to see your balance',
      })
    }

    let liveSuccess = false
    try {
      const balance = await client.getBalance()
      // Use freeUsd (USD cash only) as spendable balance — this is what the buy screen needs
      const liveFreeUsd = Math.round(balance.freeUsd * 100)
      const liveCashUsd = Math.round(balance.cashUsd * 100)
      // Prefer freeUsd for buying power; fall back to cashUsd if free is 0 but cash > 0
      krakenCashCents = liveFreeUsd > 0 ? liveFreeUsd : liveCashUsd
      liveSuccess = krakenCashCents > 0
      if (krakenCashCents === 0 && lastKnownBalance > 0) {
        krakenCashCents = lastKnownBalance
      } else if (krakenCashCents > 0) {
        // Cache the free USD balance so next load is accurate
        await admin.from('user_kraken_keys').update({
          last_balance_usd: balance.freeUsd > 0 ? balance.freeUsd : balance.cashUsd,
          updated_at: new Date().toISOString(),
        }).eq('user_id', user.id)
      }
    } catch (e) {
      console.warn('[balance] live fetch failed, using cached:', e)
      krakenCashCents = lastKnownBalance
    }

    const availableCents = Math.max(0, krakenCashCents - investedCents)

    return NextResponse.json({
      equity_cents: krakenCashCents + investedCents,
      cash_cents: krakenCashCents,
      invested_cents: investedCents,
      available_cents: availableCents,
      buying_power_cents: availableCents,
      cash: (krakenCashCents / 100).toFixed(2),
      portfolio_value: ((krakenCashCents + investedCents) / 100).toFixed(2),
      status: krakenCashCents > 0 ? 'connected' : 'not_connected',
      balance_source: liveSuccess ? 'live' : krakenCashCents > 0 ? 'cached' : 'none',
      provider: 'kraken',
      account_id: 'kraken',
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('account balance error:', msg)
    return NextResponse.json(
      { error: msg, equity_cents: 0, cash_cents: 0, available_cents: 0, status: 'error' },
      { status: 500 }
    )
  }
}