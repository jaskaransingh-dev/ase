import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Add $100 test credits
    const amountCents = 10000
    
    // Check if wallet exists
    const { data: wallet } = await supabase
      .from('wallets')
      .select('id, balance_cents')
      .eq('user_id', user.id)
      .single()

    if (!wallet) {
      await supabase.from('wallets').insert({ 
        user_id: user.id, 
        balance_cents: amountCents 
      })
    } else {
      await supabase
        .from('wallets')
        .update({ 
          balance_cents: wallet.balance_cents + amountCents 
        })
        .eq('user_id', user.id)
    }

    // Record transaction
    await supabase.from('transactions').insert({
      user_id: user.id,
      type: 'deposit',
      amount_cents: amountCents,
      reference_id: 'test_add',
      note: 'Test balance addition',
    })

    return NextResponse.json({ 
      success: true,
      message: 'Added $100 test credits',
      amount: amountCents 
    })
  } catch (error) {
    console.error('Test balance error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to add credits' 
    }, { status: 500 })
  }
}
