/**
 * POST /api/broker/create-account
 * 
 * Create a new trading account for the user via Alpaca Broker API
 * This creates a fully-managed brokerage account with KYC handled by Alpaca
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createBrokerAPI } from '@/lib/broker'

export const dynamic = 'force-dynamic'

interface AccountCreationRequest {
  first_name: string
  last_name: string
  email: string
  phone?: string
  date_of_birth: string // YYYY-MM-DD
  ssn: string // Full 9-digit SSN
  street_address: string
  city: string
  state: string
  postal_code: string
  country?: string
}

export async function POST(request: NextRequest) {
  function generateIPAddress(): string {
    return `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
  }
  
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: AccountCreationRequest = await request.json()
    
    const { 
      first_name, 
      last_name, 
      email, 
      phone, 
      date_of_birth, 
      ssn,
      street_address,
      city,
      state,
      postal_code,
      country = 'USA'
    } = body

    const ssnClean = (ssn || '').replace(/-/g, '')
    if (!first_name || !last_name || !email || !date_of_birth || !street_address || !city || !state || !postal_code) {
      return NextResponse.json({ error: 'All required fields must be provided' }, { status: 400 })
    }

    if (!ssnClean || ssnClean.length !== 9 || !/^\d{9}$/.test(ssnClean)) {
      return NextResponse.json({ error: 'SSN must be exactly 9 digits' }, { status: 400 })
    }

    if (/^(\d)\1{8}$/.test(ssnClean) || /^123456789$/.test(ssnClean) || /^987654321$/.test(ssnClean)) {
      return NextResponse.json({ error: 'Invalid SSN' }, { status: 400 })
    }

    const dob = new Date(date_of_birth)
    const today = new Date()
    const age = today.getFullYear() - dob.getFullYear() - (today < new Date(today.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0)
    if (age < 18) {
      return NextResponse.json({ error: 'Must be at least 18 years old' }, { status: 400 })
    }
    if (age > 120) {
      return NextResponse.json({ error: 'Invalid date of birth' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: existingAccount } = await admin
      .from('broker_accounts')
      .select('id, alpaca_account_id, status')
      .eq('user_id', user.id)
      .single()

    if (existingAccount?.alpaca_account_id) {
      return NextResponse.json({ 
        error: 'You already have a brokerage account',
        account_id: existingAccount.alpaca_account_id,
        status: existingAccount.status 
      }, { status: 400 })
    }

    const broker = createBrokerAPI()

    const accountRequest = {
      account_type: 'trading',
      contact: {
        email_address: email,
        phone_number: phone || '',
        street_address: [street_address],
        city: city,
        state: state,
        postal_code: postal_code,
      },
      identity: {
        given_name: first_name,
        family_name: last_name,
        date_of_birth: date_of_birth,
        ...(ssn && ssn.length >= 9 ? { 
          tax_id: ssn.replace(/-/g, ''), 
          tax_id_type: 'USA_SSN' as const 
        } : {}),
        country_of_citizenship: country || 'USA',
        country_of_birth: country || 'USA',
        country_of_tax_residence: country || 'USA',
        funding_source: ['employment_income'],
      },
      disclosures: {
        is_control_person: false,
        is_affiliated_exchange_or_finra: false,
        is_politically_exposed: false,
        immediate_family_exposed: false,
      },
      agreements: [
        {
          agreement: 'customer_agreement',
          signed_at: new Date().toISOString(),
          ip_address: generateIPAddress(),
        },
      ],
    }

    console.log('[Broker Create Account] Creating account for:', email)
    console.log('[Broker Create Account] Request:', JSON.stringify(accountRequest, null, 2))

    let alpacaAccount: { id: string; account_number: string; status: string; account_type: string; trading_enabled: boolean }

    try {
      alpacaAccount = await broker.createAccount(accountRequest as Parameters<typeof broker.createAccount>[0])
    } catch (apiErr: unknown) {
      const errMsg = apiErr instanceof Error ? apiErr.message : String(apiErr)
      console.error('[Broker Create Account] API Error:', errMsg)
      throw new Error(`Failed to create account: ${errMsg}`)
    }

    await admin.from('broker_accounts').insert({
      user_id: user.id,
      alpaca_account_id: alpacaAccount.id,
      account_number: alpacaAccount.account_number,
      status: alpacaAccount.status,
      account_type: alpacaAccount.account_type,
      trading_enabled: alpacaAccount.trading_enabled,
    })

    console.log('[Broker Create Account] Created:', alpacaAccount.id, 'Status:', alpacaAccount.status)

    return NextResponse.json({
      account_id: alpacaAccount.id,
      account_number: alpacaAccount.account_number,
      status: alpacaAccount.status,
      message: 'Account created successfully! KYC verification is in progress.',
    })
  } catch (err: unknown) {
    console.error('[Broker Create Account] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create account' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: account } = await admin
      .from('broker_accounts')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!account) {
      return NextResponse.json({ has_account: false })
    }

    return NextResponse.json({
      has_account: true,
      account_id: account.alpaca_account_id,
      account_number: account.account_number,
      status: account.status,
      account_type: account.account_type,
      trading_enabled: account.trading_enabled,
    })
  } catch (err: unknown) {
    console.error('[Broker Create Account] GET Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to get account' },
      { status: 500 }
    )
  }
}