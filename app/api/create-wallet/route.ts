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

    // Create wallet (starts at $0 — user connects Coinbase to fund it)
    const { data: existingWallet } = await supabase
      .from('wallets')
      .select('id, balance_cents')
      .eq('user_id', user_id)
      .single()

    if (!existingWallet) {
      const { error: walletError } = await supabase.from('wallets').insert({
        user_id,
        balance_cents: 0,
      })

      if (walletError) {
        console.error('Wallet creation error:', walletError)
        return NextResponse.json({ error: 'Failed to create wallet' }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true, balance: existingWallet?.balance_cents ?? 0 })
  } catch (error) {
    console.error('Create wallet error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
