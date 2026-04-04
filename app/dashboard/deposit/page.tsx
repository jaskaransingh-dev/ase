import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DepositClient from './DepositClient'

export const dynamic = 'force-dynamic'

export default async function DepositPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <DepositClient userEmail={user.email ?? ''} />
}
