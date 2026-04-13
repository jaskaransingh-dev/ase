/**
 * POST /api/broker/plaid/link-token
 * 
 * Create a Plaid link token for initializing Plaid Link
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID
const PLAID_SECRET = process.env.PLAID_SECRET
const PLAID_ENV = process.env.PLAID_ENV || 'sandbox'

export async function POST(request: NextRequest) {
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

    if (!account?.alpaca_account_id) {
      return NextResponse.json({ error: 'No brokerage account found' }, { status: 400 })
    }

    if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
      console.log('[Plaid] No credentials configured, using demo mode')
      return NextResponse.json({
        link_token: 'demo-link-token',
        expiration: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        demo: true,
      })
    }

    const userId = user.id.slice(0, 36)
    
    const response = await fetch(`https://${PLAID_ENV}.plaid.com/link/token/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        user: { client_user_id: userId },
        client_name: 'ASE Trading',
        products: ['auth', 'transactions'],
        country_codes: ['US'],
        language: 'en',
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Plaid error: ${response.status} - ${error}`)
    }

    const data = await response.json()

    console.log('[Plaid] Link token created for user:', user.id)

    return NextResponse.json({
      link_token: data.link_token,
      expiration: data.expiration,
    })
  } catch (err: unknown) {
    console.error('[Plaid Link Token] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create link token' },
      { status: 500 }
    )
  }
}