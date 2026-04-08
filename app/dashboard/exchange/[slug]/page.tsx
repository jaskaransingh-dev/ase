import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function ExchangeDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  redirect(`/agents/${slug}`)
}
