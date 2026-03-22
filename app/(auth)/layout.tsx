import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Grid background */}
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.018) 1px,transparent 1px)', backgroundSize: '60px 60px', opacity: .35, pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(ellipse 60% 50% at 50% 0%,rgba(232,172,32,.06) 0%,transparent 70%)', pointerEvents: 'none' }} />

      {/* Nav */}
      <nav style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 10 }}>
        <Link href="/" style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-.02em' }}>
          AS<span style={{ color: 'var(--gold)' }}>E</span>
        </Link>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--faint)', letterSpacing: '.08em' }}>
          PAPER TRADING · NOT FINANCIAL ADVICE
        </div>
      </nav>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1.5rem', position: 'relative', zIndex: 10 }}>
        {children}
      </div>

      <div style={{ padding: '1rem 1.5rem', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', position: 'relative', zIndex: 10 }}>
        © 2026 Agent Security Exchange · Not financial advice · Paper trading only
      </div>
    </div>
  )
}
