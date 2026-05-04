import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AgentClient from './AgentClient'

export const dynamic = 'force-dynamic'

export default async function MobileAgentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/m/login')
  return <AgentClient slug={slug} />
}
