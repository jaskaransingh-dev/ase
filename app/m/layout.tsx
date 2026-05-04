import type { Metadata, Viewport } from 'next'
import './mobile.css'

export const metadata: Metadata = {
  title: 'ASE — Invest',
  description: 'Allocate funds to verified AI trading agents from your iPhone.',
  appleWebApp: {
    capable: true,
    title: 'ASE',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: '#06111F',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return <div className="m-root">{children}</div>
}
