/**
 * POST /api/broker/bank-link
 * 
 * Link a bank account using Plaid processor token
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createBrokerAPI } from '@/lib/broker'

export const dynamic = 'force-dynamic'

/**
 * POST - Create ACH relationship (link bank)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { processor_token, bank_account_type = 'CHECKING', nickname } = body

    if (!processor_token) {
      return NextResponse.json({ error: 'processor_token is required' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Get user's broker account
    const { data: brokerAccount } = await admin
      .from('broker_accounts')
      .select('alpaca_account_id, status')
      .eq('user_id', user.id)
      .single()

    if (!brokerAccount) {
      return NextResponse.json({ error: 'No brokerage account. Open an account first.' }, { status: 400 })
    }

    if (brokerAccount.status !== 'ACTIVE') {
      return NextResponse.json({ error: `Account status is ${brokerAccount.status}. Must be ACTIVE to link bank.` }, { status: 400 })
    }

    // Create ACH relationship via Broker API
    const broker = createBrokerAPI()
    
    // Use Plaid processor token (required for this flow)
    const ach = await broker.createACHRelationship(brokerAccount.alpaca_account_id, {
      processor_token: processor_token,
      bank_account_type: (bank_account_type || 'CHECKING') as 'CHECKING' | 'SAVINGS',
      nickname: nickname,
    })

    // Store in database
    await admin.from('bank_links').insert({
      user_id: user.id,
      alpaca_relationship_id: ach.id,
      bank_name: ach.bank_name,
      bank_account_type: ach.bank_account_type,
      account_last4: ach.account_last4,
      status: ach.status,
      is_primary: true,
    })

    console.log('[Broker Bank Link] Created:', ach.id)

    return NextResponse.json({
      relationship_id: ach.id,
      status: ach.status,
      bank_name: ach.bank_name,
      message: 'Bank account linked! You can now initiate deposits and withdrawals.',
    })
  } catch (err: unknown) {
    console.error('[Broker Bank Link] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to link bank' },
      { status: 500 }
    )
  }
}

/**
 * GET - List bank links
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: links } = await admin
      .from('bank_links')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    return NextResponse.json({ bank_links: links || [] })
  } catch (err: unknown) {
    console.error('[Broker Bank Link] GET Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to get bank links' },
      { status: 500 }
    )
  }
}

/**
 * DELETE - Remove bank link
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const relationship_id = searchParams.get('relationship_id')

    if (!relationship_id) {
      return NextResponse.json({ error: 'relationship_id is required' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Get broker account
    const { data: brokerAccount } = await admin
      .from('broker_accounts')
      .select('alpaca_account_id')
      .eq('user_id', user.id)
      .single()

    if (!brokerAccount) {
      return NextResponse.json({ error: 'No brokerage account' }, { status: 400 })
    }

    // Delete from Alpaca
    const broker = createBrokerAPI()
    await broker.deleteACHRelationship(brokerAccount.alpaca_account_id, relationship_id)

    // Delete from database
    await admin
      .from('bank_links')
      .delete()
      .eq('user_id', user.id)
      .eq('alpaca_relationship_id', relationship_id)

    console.log('[Broker Bank Link] Deleted:', relationship_id)

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('[Broker Bank Link] DELETE Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to remove bank link' },
      { status: 500 }
    )
  }
}