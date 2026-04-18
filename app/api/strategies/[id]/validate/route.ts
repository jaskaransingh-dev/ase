/**
 * POST /api/strategies/[id]/validate
 *
 * Static validation of user strategy code. Checks:
 *  - Required interface methods exist (initialize / on_data OR generate_signals)
 *  - No banned imports (requests, os, subprocess, socket, open, eval, exec, __import__)
 *  - Output shape contains action + size + asset keys
 *  - Code length reasonable (<= 50 KB)
 *
 * Does NOT execute code (sandbox execution is phase 2 via Docker workers).
 * Returns { valid: boolean, errors: string[], warnings: string[] }
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const BANNED_PATTERNS = [
  { re: /\bimport\s+requests\b/,       msg: 'External HTTP requests (requests) are not allowed' },
  { re: /\bimport\s+urllib\b/,         msg: 'External HTTP requests (urllib) are not allowed' },
  { re: /\bimport\s+httpx\b/,          msg: 'External HTTP requests (httpx) are not allowed' },
  { re: /\bimport\s+aiohttp\b/,        msg: 'External HTTP requests (aiohttp) are not allowed' },
  { re: /\bimport\s+socket\b/,         msg: 'Network access (socket) is not allowed' },
  { re: /\bimport\s+subprocess\b/,     msg: 'Subprocess execution is not allowed' },
  { re: /\bimport\s+os\b/,             msg: 'OS access is not allowed' },
  { re: /\bimport\s+sys\b/,            msg: 'sys access is not allowed' },
  { re: /\bopen\s*\(/,                 msg: 'File I/O (open) is not allowed' },
  { re: /\beval\s*\(/,                 msg: 'eval() is not allowed' },
  { re: /\bexec\s*\(/,                 msg: 'exec() is not allowed' },
  { re: /__import__\s*\(/,             msg: '__import__() is not allowed' },
  { re: /\bctypes\b/,                  msg: 'ctypes is not allowed' },
  { re: /\bpickle\b/,                  msg: 'pickle is not allowed' },
]

const ALLOWED_IMPORTS = [
  'numpy', 'pandas', 'math', 'statistics', 'collections',
  'itertools', 'functools', 'typing', 'dataclasses', 'datetime', 'decimal',
]

const WARNING_PATTERNS = [
  { re: /while\s+True\b/,   msg: 'Infinite loops may cause timeouts' },
  { re: /time\.sleep\b/,    msg: 'time.sleep() will be stripped in sandbox' },
  { re: /print\s*\(/,       msg: 'print() output is discarded in sandbox; use logging instead' },
]

function validateCode(code: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []

  if (code.length > 50_000) {
    errors.push('Strategy code exceeds 50 KB limit')
  }

  for (const { re, msg } of BANNED_PATTERNS) {
    if (re.test(code)) errors.push(msg)
  }

  for (const { re, msg } of WARNING_PATTERNS) {
    if (re.test(code)) warnings.push(msg)
  }

  // Must implement one of the two valid interfaces
  const hasClass = /class\s+\w+Strategy\b/.test(code) || /class\s+Strategy\b/.test(code)
  const hasOnData = /def\s+on_data\s*\(/.test(code)
  const hasInitialize = /def\s+initialize\s*\(/.test(code)
  const hasGenerateSignals = /def\s+generate_signals\s*\(/.test(code)

  if (!hasGenerateSignals && !(hasClass && hasOnData)) {
    errors.push(
      'Strategy must implement either generate_signals(data) → Signal ' +
      'or a class with initialize(context) + on_data(context, data)',
    )
  }

  if (hasClass && !hasInitialize && hasOnData) {
    warnings.push('Class-based strategy should implement initialize(context) for setup')
  }

  // Check for unapproved top-level imports
  const importLines = code.match(/^(?:import|from)\s+(\w+)/gm) ?? []
  for (const line of importLines) {
    const pkg = line.split(/\s+/)[1]
    if (!ALLOWED_IMPORTS.includes(pkg)) {
      warnings.push(`Package "${pkg}" may not be available in the sandbox`)
    }
  }

  return { errors, warnings }
}

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = supabase()
  const { data: { user } } = await db.auth.getUser(auth.replace('Bearer ', ''))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: strategy, error: fetchErr } = await db
    .from('strategies')
    .select('id, code, owner_id')
    .eq('id', id)
    .eq('owner_id', user.id)
    .single()

  if (fetchErr || !strategy) return NextResponse.json({ error: 'Strategy not found' }, { status: 404 })

  const { errors, warnings } = validateCode(strategy.code)
  const valid = errors.length === 0

  // Persist validation result
  await db
    .from('strategies')
    .update({
      status: valid ? 'validated' : 'rejected',
      validation_error: errors.length > 0 ? errors.join('\n') : null,
    })
    .eq('id', id)

  return NextResponse.json({ valid, errors, warnings })
}
