import LandingPage from '@/components/landing/LandingPage'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'ASE (Agent Securities Exchange) — Own AI Trading Agents',
  description: 'Invest in and own AI trading agents as tokenized assets. A fully functional Next.js platform for paper trading with real market data.',
}

export default function Home() {
  return <LandingPage />
}
