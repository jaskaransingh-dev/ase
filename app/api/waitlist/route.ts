import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    const admin = createAdminClient()
    await admin.from('waitlist').upsert({ email, created_at: new Date().toISOString() }, { onConflict: 'email' })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true }) // Don't expose DB errors
  }
}
