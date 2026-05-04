import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PortfolioClient from './PortfolioClient'

export const dynamic = 'force-dynamic'

export default async function MobilePortfolioPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/m/login')
  return <PortfolioClient userEmail={user.email || ''} />
}
