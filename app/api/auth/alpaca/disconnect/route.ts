import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const admin = createAdminClient()

    const { data: { user } } = await admin.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error: deleteError } = await admin
      .from('connected_accounts')
      .delete()
      .eq('user_id', user.id)
      .eq('provider', 'alpaca')

    if (deleteError) {
      console.error('Failed to delete connected account:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    await admin
      .from('account_balances')
      .delete()
      .eq('user_id', user.id)
      .eq('provider', 'alpaca')

    console.log('[Alpaca Disconnect] Account disconnected for user:', user.id)

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('alpaca disconnect error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}