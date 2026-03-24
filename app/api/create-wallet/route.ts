import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { user_id } = await req.json()
    
    if (!user_id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    const supabase = createAdminClient()
    
    // Create wallet with $100 initial credits
    const { error } = await supabase.from('wallets').insert({
      user_id,
      balance_cents: 10000, // $100 in cents
    })

    if (error) {
      console.error('Wallet creation error:', error)
      return NextResponse.json({ error: 'Failed to create wallet' }, { status: 500 })
    }

    // Record initial transaction
    await supabase.from('transactions').insert({
      user_id,
      type: 'deposit',
      amount_cents: 10000,
      reference_id: 'signup_bonus',
      note: 'Welcome bonus - $100 paper credits',
    })

    return NextResponse.json({ success: true, balance: 10000 })
  } catch (error) {
    console.error('Create wallet error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
