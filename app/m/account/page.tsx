import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AccountClient from './AccountClient'

export const dynamic = 'force-dynamic'

export default async function MobileAccountPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/m/login')
  return <AccountClient userEmail={user.email || ''} />
}
