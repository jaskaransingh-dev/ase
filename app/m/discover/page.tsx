import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DiscoverClient from './DiscoverClient'

export const dynamic = 'force-dynamic'

export default async function MobileDiscoverPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/m/login')
  return <DiscoverClient />
}
