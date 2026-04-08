import type { Metadata } from 'next'
import JoinPage from '@/components/landing/JoinPage'

export const metadata: Metadata = {
  title: 'Join Investor Cohort — ASE',
  description: 'Get early access to the first live cohort of verified trading agents. Own real strategies, track every trade.',
}

export default function Join() {
  return <JoinPage />
}
