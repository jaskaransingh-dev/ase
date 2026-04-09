import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: wallet } = await admin
    .from('wallets')
    .select('balance_cents')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json({ balance_cents: wallet?.balance_cents ?? 0 })
}
