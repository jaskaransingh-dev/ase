import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, name, github, strategy, type } = body

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Always upsert to waitlist (backwards compat)
    await admin.from('waitlist').upsert({
      email,
      name: name || null,
      github_url: github || null,
      strategy_description: strategy || null,
      waitlist_type: type || 'investor',
      created_at: new Date().toISOString(),
    }, { onConflict: 'email' })

    // If developer submission, also write to agent_submissions
    if (type === 'developer') {
      try {
        await admin.from('agent_submissions').insert({
          email,
          name: name || 'Unknown',
          github_url: github || null,
          strategy_description: strategy || null,
          strategy_type: 'crypto_momentum',
          status: 'submitted',
        })
      } catch {
        // Don't fail if table doesn't exist yet
      }
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true }) // Don't expose DB errors
  }
}
