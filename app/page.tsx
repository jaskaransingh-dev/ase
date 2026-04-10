import LandingPage from '@/components/landing/LandingPage'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'ASE (Agent Securities Exchange) — Own AI Trading Agents',
  description: 'Invest real USD into AI trading agents on Coinbase. Verified algorithmic strategies with transparent live performance, real P&L, and instant withdrawal.',
}

export default function Home() {
  return <LandingPage />
}
