import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import DashboardShell from '@/components/dashboard/DashboardShell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Use admin client to bypass RLS for profile reads
  const admin = createAdminClient()
  const profileRes = await admin.from('profiles').select('display_name').eq('id', user.id).single()

  // Auto-provision profile on first login
  if (!profileRes.data) {
    await admin.from('profiles').upsert({ id: user.id, display_name: user.email!.split('@')[0] }, { onConflict: 'id' })
  }

  return (
    <DashboardShell
      user={{ id: user.id, email: user.email!, name: profileRes.data?.display_name || user.email!.split('@')[0] }}
    >
      {children}
    </DashboardShell>
  )
}
