/**
 * GET /api/broker/balance
 * 
 * Get user's broker account balance
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createBrokerAPI } from '@/lib/broker'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: account } = await admin
      .from('broker_accounts')
      .select('alpaca_account_id, status')
      .eq('user_id', user.id)
      .single()

    if (!account || !account.alpaca_account_id) {
      return NextResponse.json({ cash: '0', portfolio_value: '0' })
    }

    const broker = createBrokerAPI()
    const balances = await broker.getBalances(account.alpaca_account_id)

    return NextResponse.json({
      cash: balances.cash,
      portfolio_value: balances.portfolio_value,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    
    // Account not found in Alpaca - return zeros gracefully
    if (msg.includes('404') || msg.includes('Not Found')) {
      console.log('[Broker Balance] Account not found in Alpaca, returning zeros')
      return NextResponse.json({ cash: '0', portfolio_value: '0', status: 'not_found' })
    }
    
    console.error('[Broker Balance] Error:', msg)
    return NextResponse.json({ cash: '0', portfolio_value: '0' })
  }
}