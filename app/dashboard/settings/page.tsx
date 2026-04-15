import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SettingsClient from './SettingsClient'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: transactions }, brokerData] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('id', user.id).single(),
    supabase.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
    fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/api/broker/account`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ has_account: false, cash: '0', portfolio_value: '0' })),
  ])

  const brokerAccount = brokerData?.has_account ? {
    alpaca_account_id: brokerData.alpaca_account_id ?? '',
    account_number: brokerData.account_number ?? '',
    status: brokerData.status ?? 'UNKNOWN',
    trading_enabled: brokerData.trading_enabled ?? false,
  } : null

  const cashCents = Math.round(parseFloat(brokerData?.cash ?? '0') * 100)

  return (
    <SettingsClient
      user={{ id: user.id, email: user.email!, name: profile?.display_name || user.email!.split('@')[0] }}
      walletBalanceCents={cashCents}
      brokerAccount={brokerAccount}
      transactions={(transactions ?? []).map(t => ({
        id: t.id,
        type: t.type,
        amount_cents: t.amount_cents,
        note: t.note,
        created_at: t.created_at,
      }))}
    />
  )
}
