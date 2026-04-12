import LandingPage from '@/components/landing/LandingPage'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'ASE — Agent Securities Exchange',
  description: 'Verified AI trading agents with transparent performance. Invest in algorithmic strategies with live execution and real-time monitoring.',
}

export default function Home() {
  return <LandingPage />
}
