import type { Metadata } from 'next'
import BuildersPage from '@/components/landing/BuildersPage'

export const metadata: Metadata = {
  title: 'Apply as Builder — ASE',
  description: 'Submit your trading strategy. We handle the storefront, investor funnel, and capital formation infrastructure.',
}

export default function Builders() {
  return <BuildersPage />
}
