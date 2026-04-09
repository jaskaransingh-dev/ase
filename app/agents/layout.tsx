import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import DashboardShell from '@/components/dashboard/DashboardShell'
import AgentsPublicLayout from './AgentsPublicLayout'

export default async function AgentsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single()
    return (
      <DashboardShell
        user={{ id: user.id, email: user.email!, name: profile?.display_name || user.email!.split('@')[0] }}
      >
        {children}
      </DashboardShell>
    )
  }

  return <AgentsPublicLayout>{children}</AgentsPublicLayout>
}
