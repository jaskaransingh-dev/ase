'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const SUBNAV = [
  { href: '/dashboard/lab',          label: 'AGENT',    desc: 'Build with AI' },
  { href: '/dashboard/lab/studio',   label: 'STUDIO',   desc: 'Manual editor' },
  { href: '/dashboard/lab/backtest', label: 'BACKTEST', desc: 'Engine & results' },
  { href: '/dashboard/lab/agents',   label: 'MY AGENTS', desc: 'Drafts & published' },
]

const C = { bg: '#070A12', panel: '#0C111B', border: 'rgba(30,42,61,0.8)', text: '#E6EBF5', muted: '#8A95AB', faint: '#5A6478', blue: '#4F8CFF' }

export default function LabLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bg, color: C.text }}>
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, background: C.panel, paddingLeft: '0.5rem' }}>
        {SUBNAV.map(item => {
          const active = pathname === item.href || (item.href !== '/dashboard/lab' && pathname.startsWith(item.href))
          return (
            <Link key={item.href} href={item.href} style={{
              padding: '0.7rem 1.1rem', textDecoration: 'none',
              borderBottom: `2px solid ${active ? C.blue : 'transparent'}`,
              color: active ? C.text : C.muted,
              fontSize: '0.7rem', fontWeight: 600, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
              display: 'flex', flexDirection: 'column', gap: 1,
            }}>
              <span>{item.label}</span>
              <span style={{ fontSize: '0.55rem', color: C.faint, fontWeight: 400, letterSpacing: '0.08em' }}>{item.desc}</span>
            </Link>
          )
        })}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{children}</div>
    </div>
  )
}
