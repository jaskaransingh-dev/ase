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

    // Ensure profiles row exists
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: user_id,
      display_name: 'User', // Default, update later via account page
    })

    if (profileError) {
      console.error('Profile creation error:', profileError)
      return NextResponse.json({ error: 'Failed to initialize profile' }, { status: 500 })
    }

    // Create or update wallet with $100 initial credits
    const { error: walletError } = await supabase.from('wallets').upsert({
      user_id,
      balance_cents: 10000,
    }, { onConflict: 'user_id' })

    if (walletError) {
      console.error('Wallet creation error:', walletError)
      return NextResponse.json({ error: 'Failed to create wallet' }, { status: 500 })
    }

    // Record initial transaction if new wallet
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
