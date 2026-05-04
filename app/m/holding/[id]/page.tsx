import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import HoldingClient from './HoldingClient'

export const dynamic = 'force-dynamic'

export default async function MobileHoldingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/m/login')
  return <HoldingClient holdingId={id} />
}
