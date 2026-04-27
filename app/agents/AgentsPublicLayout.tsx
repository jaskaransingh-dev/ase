'use client'

import Link from 'next/link'
import { Logo } from '@/components/ui/Logo'

export default function AgentsPublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <nav style={{ borderBottom: '1px solid var(--border)', padding: '0 1.5rem', height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'rgba(255,255,255,.86)', backdropFilter: 'blur(18px) saturate(160%)', zIndex: 100 }}>
        <Logo size="medium" variant="full" />
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          <Link href="/dashboard/connect/kraken" style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', fontWeight: 700, padding: '.45rem .9rem', borderRadius: 999, border: '1px solid rgba(94,65,217,.25)', background: 'rgba(94,65,217,.08)', color: '#a78bfa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '.4rem', textDecoration: 'none' }}>
            🐙 Connect Kraken
          </Link>
          <Link href="/login" className="btn-secondary" style={{ fontSize: '.82rem', padding: '.45rem .9rem' }}>Login</Link>
          <Link href="/signup" className="btn-primary" style={{ fontSize: '.82rem', padding: '.45rem .9rem' }}>Sign Up →</Link>
        </div>
      </nav>
      {children}
    </div>
  )
}
