import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import DashboardShell from '@/components/dashboard/DashboardShell'

export default async function BuildersLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const profileRes = await admin.from('profiles').select('display_name').eq('id', user.id).single()

  return (
    <DashboardShell
      user={{ id: user.id, email: user.email!, name: profileRes.data?.display_name || user.email!.split('@')[0] }}
    >
      {children}
    </DashboardShell>
  )
}
