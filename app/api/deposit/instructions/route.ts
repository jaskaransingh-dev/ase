/**
 * POST /api/deposit/instructions
 * 
 * Returns instructions for funding the Alpaca account
 * Includes wire transfer details and ACH instructions
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptAES } from '@/lib/crypto/encryption'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()

    // Get connected account
    const { data: connection } = await admin
      .from('connected_accounts')
      .select('id, account_id, account_number, status, provider')
      .eq('user_id', user.id)
      .eq('provider', 'alpaca')
      .single()

    if (!connection || connection.status !== 'active') {
      return NextResponse.json({
        error: 'No Alpaca account connected',
        needs_connection: true,
        message: 'Connect your Alpaca account first to see funding instructions'
      }, { status: 400 })
    }

    // Return funding instructions
    // Note: These are example wire instructions - in production you'd get real ones from Alpaca API
    const instructions = {
      method: 'alpaca_trading_account',
      account_id: connection.account_id,
      account_number: connection.account_number,
      options: [
        {
          type: 'ach',
          name: 'ACH Transfer (Recommended)',
          description: 'Link your bank account for automatic transfers',
          time: '2-5 business days',
          limits: 'Up to $50,000 per day',
          steps: [
            'Go to alpaca.markets/dashboard > Funding',
            'Click "Link Bank Account"',
            'Search and select your bank',
            'Log in to your bank to verify',
            'Transfers process in 2-5 business days'
          ]
        },
        {
          type: 'wire',
          name: 'Wire Transfer',
          description: 'Same-day transfers for larger amounts',
          time: 'Same business day',
          limits: 'No daily limit',
          steps: [
            'Go to alpaca.markets/dashboard > Funding',
            'Click "Wire Transfer"',
            'Get wire instructions (routing number, account)',
            'Initiate transfer from your bank app/website',
            'Funds available same day'
          ],
          wire_instructions: {
            bank_name: 'First Republic Bank',
            routing_number: '321081669',
            account_type: 'Checking',
            ffc: `Your Account: ${connection.account_number}`,
            additional: 'Reference: ASE-[Your Name]'
          }
        }
      ],
      note: 'Funds can also be transferred from another Alpaca account using the Journals API'
    }

    return NextResponse.json({
      account_id: connection.account_id,
      account_number: connection.account_number,
      funding_options: instructions.options,
      quick_start: {
        title: 'Quickest Way',
        steps: [
          '1. Go to https://app.alpaca.markets/dashboard/funding',
          '2. Click "Link Bank Account" (ACH)',
          '3. Search and select your bank',
          '4. Log in and verify',
          '5. Transfer - ready in 2-5 days'
        ]
      }
    })
  } catch (err: unknown) {
    console.error('deposit instructions error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}