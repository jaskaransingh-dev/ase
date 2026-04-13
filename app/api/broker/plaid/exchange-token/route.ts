/**
 * POST /api/broker/plaid/exchange-token
 * 
 * Exchange Plaid public token for processor token and create bank link
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createBrokerAPI } from '@/lib/broker'

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

    const body = await request.json()
    const { public_token, bank_account_type = 'CHECKING' } = body

    if (!public_token) {
      return NextResponse.json({ error: 'public_token is required' }, { status: 400 })
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

    if (account.status !== 'ACTIVE') {
      return NextResponse.json({ error: `Account status is ${account.status}. Must be ACTIVE to link bank.` }, { status: 400 })
    }

    let processorToken: string

    if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
      console.log('[Plaid] Demo mode - using mock processor token')
      processorToken = 'demo-processor-token-' + Date.now()
    } else {
      const tokenResponse = await fetch(`https://${PLAID_ENV}.plaid.com/item/public_token/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: PLAID_CLIENT_ID,
          secret: PLAID_SECRET,
          public_token,
        }),
      })

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text()
        throw new Error(`Plaid token exchange failed: ${error}`)
      }

      const tokenData = await tokenResponse.json()

      const processorResponse = await fetch(`https://${PLAID_ENV}.plaid.com/processor/token/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: PLAID_CLIENT_ID,
          secret: PLAID_SECRET,
          access_token: tokenData.access_token,
          account_id: tokenData.item_id,
          processor: 'alpaca',
        }),
      })

      if (!processorResponse.ok) {
        const error = await processorResponse.text()
        throw new Error(`Plaid processor token failed: ${error}`)
      }

      const processorData = await processorResponse.json()
      processorToken = processorData.processor_token
    }

    const broker = createBrokerAPI()
    const ach = await broker.createACHRelationship(account.alpaca_account_id, {
      processor_token: processorToken,
      bank_account_type: (bank_account_type || 'CHECKING') as 'CHECKING' | 'SAVINGS',
      nickname: 'Plaid Linked Account',
    })

    await admin.from('bank_links').insert({
      user_id: user.id,
      alpaca_relationship_id: ach.id,
      bank_name: ach.bank_name,
      bank_account_type: ach.bank_account_type,
      account_last4: ach.account_last4,
      status: ach.status,
      is_primary: true,
    })

    console.log('[Plaid] Bank link created:', ach.id)

    return NextResponse.json({
      relationship_id: ach.id,
      status: ach.status,
      bank_name: ach.bank_name,
      last4: ach.account_last4,
      message: 'Bank account linked successfully!',
    })
  } catch (err: unknown) {
    console.error('[Plaid Exchange Token] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to link bank account' },
      { status: 500 }
    )
  }
}