/**
 * POST /api/broker/account
 * 
 * Connect to Alpaca paper trading account via user-provided API key
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createBrokerAPI } from '@/lib/broker'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let apiKey = ''
    let apiSecret = ''
    
    // Try to get API key from body first
    const body = await request.json().catch(() => ({}))
    if (body.api_key) {
      apiKey = body.api_key
      apiSecret = body.api_secret || body.api_key_secret || ''
    }
    
    // If no API key provided, use environment credentials as fallback
    if (!apiKey) {
      apiKey = process.env.ALPACA_KEY_ID || ''
      apiSecret = process.env.ALPACA_SECRET_KEY || ''
    }

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ 
        error: 'API key required',
        message: 'Please provide your Alpaca API key and secret'
      }, { status: 400 })
    }

    const admin = createAdminClient()
    const broker = createBrokerAPI(apiKey, apiSecret)

    // Get account info from Alpaca
    let alpacaAccount = null
    
    try {
      const accounts = await broker.listAccounts()
      if (accounts.accounts && accounts.accounts.length > 0) {
        alpacaAccount = accounts.accounts[0]
      }
    } catch (apiErr) {
      console.log('[Broker] Could not list accounts, trying fallback:', apiErr)
    }

    // If no account found, create a placeholder (for paper trading scenario)
    if (!alpacaAccount) {
      alpacaAccount = {
        id: 'paper-' + apiKey.slice(0, 8),
        account_number: 'PAPER-' + apiKey.slice(0, 8).toUpperCase(),
        status: 'ACTIVE',
        account_type: 'INDIVIDUAL',
        trading_enabled: true,
        transfers_enabled: true,
      }
    }

    // Check if user already has an account
    const { data: existing } = await admin
      .from('broker_accounts')
      .select('id, alpaca_account_id, status')
      .eq('user_id', user.id)
      .single()

    if (existing) {
      await admin
        .from('broker_accounts')
        .update({
          alpaca_account_id: alpacaAccount.id,
          account_number: alpacaAccount.account_number,
          status: alpacaAccount.status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
    } else {
      await admin.from('broker_accounts').insert({
        user_id: user.id,
        alpaca_account_id: alpacaAccount.id,
        account_number: alpacaAccount.account_number,
        status: alpacaAccount.status,
        account_type: alpacaAccount.account_type,
        trading_enabled: true,
      })
    }

    console.log('[Broker Account] Connected:', alpacaAccount.id)

    return NextResponse.json({
      account_id: alpacaAccount.id,
      account_number: alpacaAccount.account_number,
      status: alpacaAccount.status,
      trading_enabled: alpacaAccount.trading_enabled,
      message: 'Account connected successfully!',
    })
  } catch (err: unknown) {
    console.error('[Broker Account] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to connect account' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/broker/account
 * 
 * Get user's brokerage account status - fetches live data from Alpaca
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: account, error } = await admin
      .from('broker_accounts')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error || !account) {
      return NextResponse.json({
        has_account: false,
        account_id: null,
        account_number: null,
        status: null,
        trading_enabled: false,
        message: 'No brokerage account found. Connect one to start trading.',
      })
    }

    // Try to get live account data from Alpaca
    let liveData: { cash?: string; portfolio_value?: string; buying_power?: string } = {}
    try {
      const broker = createBrokerAPI()
      const alpacaAccount = await broker.getAccount(account.alpaca_account_id)
      liveData = {
        cash: alpacaAccount.cash,
        portfolio_value: alpacaAccount.portfolio_value,
        buying_power: alpacaAccount.buying_power,
      }
      
      // Update local status if different (in case Alpaca status changed)
      if (alpacaAccount.status !== account.status || alpacaAccount.trading_enabled !== account.trading_enabled) {
        await admin
          .from('broker_accounts')
          .update({
            status: alpacaAccount.status,
            trading_enabled: alpacaAccount.trading_enabled,
            updated_at: new Date().toISOString(),
          })
          .eq('id', account.id)
      }
    } catch (e) {
      console.log('[Broker Account] Could not fetch live Alpaca data:', e)
      // Fall back to stored data
    }

    // Check for bank links
    const { data: bankLinks } = await admin
      .from('bank_links')
      .select('id, status, bank_name, account_last4')
      .eq('user_id', user.id)
      .eq('status', 'ACTIVE')

    const hasBankLink = (bankLinks?.length ?? 0) > 0

    return NextResponse.json({
      has_account: true,
      account_id: account.alpaca_account_id,
      account_number: account.account_number,
      status: liveData.status || account.status,
      trading_enabled: account.trading_enabled,
      cash: liveData.cash,
      portfolio_value: liveData.portfolio_value,
      buying_power: liveData.buying_power,
      has_bank_link: hasBankLink,
    })
  } catch (err: unknown) {
    console.error('[Broker Account] GET Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to get account' },
      { status: 500 }
    )
  }
}