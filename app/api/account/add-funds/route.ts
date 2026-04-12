/**
 * GET /api/account/add-funds
 *
 * Returns instructions for adding funds to Alpaca account.
 * Users must add funds via Alpaca's dashboard, then sync to see updated balance.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json({
      instructions: [
        {
          step: 1,
          title: 'Go to Alpaca Dashboard',
          description: 'Open Alpaca dashboard and navigate to Account > Funding.',
          url: 'https://dashboard.alpaca.markets/accounts',
        },
        {
          step: 2,
          title: 'Add Bank Account',
          description: 'Link your bank account for ACH transfers or initiate a wire transfer.',
          note: 'ACH transfers take 2-5 business days. Wire transfers are same-day.',
        },
        {
          step: 3,
          title: 'Return to ASE',
          description: 'Your Alpaca balance will automatically sync. Click "Sync Account" to see updated balance.',
        },
      ],
      next_steps: {
        sync_url: '/api/account/sync',
        action: 'Call /api/account/sync after adding funds',
      },
    })
  } catch (err: unknown) {
    console.error('add-funds error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}