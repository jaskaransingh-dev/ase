/**
 * GET /api/auth/kraken/balance
 *
 * Returns the live Kraken balance for the signed-in user.
 * Used by the connect page and dashboard to verify keys are working.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { krakenClientForUser } from '@/lib/kraken-client'

export const dynamic = 'force-dynamic'

export async function GET() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const client = await krakenClientForUser(user.id)
  if (!client) return NextResponse.json({ error: 'no Kraken account connected' }, { status: 404 })

  try {
    const b = await client.getBalance()
    return NextResponse.json({
      ok: true,
      cash_usd: b.cashUsd,
      free_usd: b.freeUsd,
      positions: b.positions,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}
