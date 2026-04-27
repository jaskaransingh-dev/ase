import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SettingsClient from './SettingsClient'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  const [{ data: profile }, { data: transactions }, krakenBalance, krakenKeys] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('id', user.id).single(),
    supabase.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
    fetch(`${base}/api/auth/kraken/balance`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ error: 'not connected' })),
    fetch(`${base}/api/auth/kraken/keys`, { cache: 'no-store' }).then(r => r.json()).catch(() => null),
  ])

  const brokerAccount = !krakenBalance.error ? {
    kraken_account_id: 'connected',
    account_number: 'kraken',
    status: 'CONNECTED',
    trading_enabled: true,
    cash_usd: krakenBalance.cash_usd ?? 0,
    free_usd: krakenBalance.free_usd ?? 0,
  } : null

  const cashCents = Math.round((brokerAccount?.cash_usd ?? 0) * 100)

  return (
    <SettingsClient
      user={{ id: user.id, email: user.email!, name: profile?.display_name || user.email!.split('@')[0] }}
      walletBalanceCents={cashCents}
      brokerAccount={brokerAccount}
      krakenKeys={krakenKeys}
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
