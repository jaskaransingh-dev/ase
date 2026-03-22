import Link from 'next/link'

export default function AgentsPublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <nav style={{ borderBottom: '1px solid var(--border)', padding: '0 1.5rem', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'rgba(7,9,15,.9)', backdropFilter: 'blur(12px)', zIndex: 100 }}>
        <Link href="/" style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.1rem' }}>AS<span style={{ color: 'var(--gold)' }}>E</span></Link>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <Link href="/login" className="btn-secondary" style={{ fontSize: '.85rem', padding: '.5rem 1rem' }}>Login</Link>
          <Link href="/signup" className="btn-primary" style={{ fontSize: '.85rem', padding: '.5rem 1rem' }}>Sign Up →</Link>
        </div>
      </nav>
      {children}
    </div>
  )
}
