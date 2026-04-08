import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import DashboardShell from '@/components/dashboard/DashboardShell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [walletRes, profileRes] = await Promise.all([
    supabase.from('wallets').select('balance_cents').eq('user_id', user.id).single(),
    supabase.from('profiles').select('display_name').eq('id', user.id).single(),
  ])

  // Auto-provision wallet + profile if they don't exist yet (first login)
  if (!walletRes.data) {
    const admin = createAdminClient()
    await Promise.all([
      admin.from('profiles').upsert({ id: user.id, display_name: user.email!.split('@')[0] }),
      admin.from('wallets').upsert({ user_id: user.id, balance_cents: 10000 }, { onConflict: 'user_id' }),
    ])
    await admin.from('transactions').insert({
      user_id: user.id,
      type: 'deposit',
      amount_cents: 10000,
      reference_id: 'signup_bonus',
      note: 'Welcome bonus — $100 paper credits',
    })
  }

  const balance = walletRes.data?.balance_cents ?? 10000

  return (
    <DashboardShell
      user={{ id: user.id, email: user.email!, name: profileRes.data?.display_name || user.email!.split('@')[0] }}
      initialBalance={balance}
    >
      {children}
    </DashboardShell>
  )
}
