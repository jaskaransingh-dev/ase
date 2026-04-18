/**
 * GET  /api/strategies       — list the authed user's strategies
 * POST /api/strategies       — create a new strategy
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

export const dynamic = 'force-dynamic'

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = auth.replace('Bearer ', '')
  const db = supabase()
  const { data: { user }, error: authErr } = await db.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await db
    .from('strategies')
    .select('id, slug, name, description, symbol, interval, status, created_at, updated_at, params')
    .eq('owner_id', user.id)
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ strategies: data })
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = auth.replace('Bearer ', '')
  const db = supabase()
  const { data: { user }, error: authErr } = await db.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    name: string
    description?: string
    code: string
    params?: Record<string, number>
    symbol?: string
    interval?: string
    language?: string
  }

  if (!body.name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!body.code?.trim()) return NextResponse.json({ error: 'code is required' }, { status: 400 })

  const codeHash = createHash('sha256').update(body.code).digest('hex')
  const baseSlug = slugify(body.name)

  // Ensure slug uniqueness
  const { data: existing } = await db
    .from('strategies')
    .select('slug')
    .like('slug', `${baseSlug}%`)
  const slug = existing && existing.length > 0 ? `${baseSlug}-${existing.length}` : baseSlug

  const { data, error } = await db
    .from('strategies')
    .insert({
      owner_id: user.id,
      slug,
      name: body.name.trim(),
      description: body.description ?? null,
      code: body.code,
      code_hash: codeHash,
      params: body.params ?? {},
      symbol: body.symbol ?? 'BTC-USD',
      interval: body.interval ?? '1d',
      language: body.language ?? 'python',
      status: 'draft',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ strategy: data }, { status: 201 })
}
