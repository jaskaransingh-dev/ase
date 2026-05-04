/**
 * /api/auth/kraken/keys
 *
 * GET    → returns current connection status for the signed-in user.
 * POST   → store a new key/secret pair (test first, then encrypt + save).
 * DELETE → revoke connection.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encryptAES } from '@/lib/crypto/encryption'
import { testKrakenCreds } from '@/lib/kraken-client'
import { getUserFromRequest } from '@/lib/supabase/get-user'

export const dynamic = 'force-dynamic'

// ── GET: connection status ────────────────────────────────────────────
export async function GET() {
  const user = await getUserFromRequest()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('user_kraken_keys')
    .select('key_label, status, verified_at, last_balance_usd, scopes, created_at')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({
    connected: !!row && row.status === 'active',
    key_label: row?.key_label ?? null,
    status:    row?.status ?? null,
    verified_at:      row?.verified_at ?? null,
    last_balance_usd: row?.last_balance_usd ?? null,
    scopes:    row?.scopes ?? [],
    connected_at:     row?.created_at ?? null,
  })
}

// ── POST: save keys ───────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { api_key?: string; api_secret?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }) }

  const apiKey = (body.api_key ?? '').trim()
  const apiSecret = (body.api_secret ?? '').trim()

  if (!apiKey || !apiSecret) {
    return NextResponse.json({ error: 'api_key and api_secret are required' }, { status: 400 })
  }
  // Kraken API keys: 56-char base64. Secret: 88-char base64. Be lenient but sanity check.
  if (apiKey.length < 40 || apiSecret.length < 60) {
    return NextResponse.json({ error: 'keys look malformed — copy them exactly from Kraken' }, { status: 400 })
  }

  // Verify against Kraken before storing.
  const test = await testKrakenCreds({ apiKey, apiSecret })
  if (!test.ok) {
    return NextResponse.json({ error: `Kraken rejected the credentials: ${test.error ?? 'unknown error'}` }, { status: 400 })
  }

  const encryptedKey    = encryptAES(apiKey)
  const encryptedSecret = encryptAES(apiSecret)
  const keyLabel        = `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`

  const admin = createAdminClient()

  // Upsert (one row per user)
  const { error } = await admin
    .from('user_kraken_keys')
    .upsert({
      user_id:          user.id,
      encrypted_key:    encryptedKey,
      encrypted_secret: encryptedSecret,
      key_label:        keyLabel,
      status:           'active',
      verified_at:      new Date().toISOString(),
      last_balance_usd: test.balanceUsd ?? 0,
    }, { onConflict: 'user_id' })

  if (error) {
    console.error('[kraken/keys] save failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    key_label:        keyLabel,
    balance_usd:      test.balanceUsd ?? 0,
  })
}

// ── DELETE: revoke ────────────────────────────────────────────────────
export async function DELETE() {
  const user = await getUserFromRequest()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  await admin
    .from('user_kraken_keys')
    .update({ status: 'revoked' })
    .eq('user_id', user.id)

  return NextResponse.json({ ok: true })
}
