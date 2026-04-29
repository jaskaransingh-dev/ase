/**
 * POST /api/quant/agent/save
 * Saves an AgentSpec as a draft to ai_agents. Returns the row id.
 *
 * PATCH /api/quant/agent/save?id=...
 * Updates an existing agent (spec / status / last-run metrics).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    name?: string
    thesis?: string
    prompt?: string
    spec?: Record<string, unknown>
    status?: 'draft' | 'tested' | 'published'
  }

  if (!body.spec || !body.name || !body.prompt) {
    return NextResponse.json({ error: 'spec, name, prompt required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('ai_agents')
    .insert({
      owner_id: user.id,
      name: body.name,
      thesis: body.thesis ?? '',
      prompt: body.prompt,
      spec: body.spec,
      status: body.status ?? 'draft',
    })
    .select('id, status, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ agent: data })
}

export async function PATCH(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    spec?: Record<string, unknown>
    status?: 'draft' | 'tested' | 'published' | 'archived'
    last_run_id?: string | null
    last_grade?: string
    last_score?: number
    last_sharpe?: number
    last_cagr?: number
    last_max_dd?: number
  }

  const { data, error } = await supabase
    .from('ai_agents')
    .update(body)
    .eq('id', id)
    .eq('owner_id', user.id)
    .select('id, status, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ agent: data })
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const status = url.searchParams.get('status')

  // Single-agent fetch by ID
  if (id) {
    const { data, error } = await supabase
      .from('ai_agents')
      .select('id, name, thesis, prompt, spec, status, last_grade, last_sharpe, last_cagr, last_max_dd, created_at, updated_at')
      .eq('id', id)
      .eq('owner_id', user.id)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 404 })
    return NextResponse.json({ agent: data })
  }

  // List all owned agents
  let q = supabase.from('ai_agents').select('id, name, thesis, spec, status, last_grade, last_sharpe, last_cagr, created_at, updated_at').eq('owner_id', user.id).order('updated_at', { ascending: false })
  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ agents: data ?? [] })
}
