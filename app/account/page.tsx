import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AccountClient from './AccountClient'

export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: transactions }] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('id', user.id).single(),
    supabase.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
  ])

  return (
    <AccountClient
      user={{ id: user.id, email: user.email!, name: profile?.display_name || '' }}
      transactions={transactions ?? []}
    />
  )
}
