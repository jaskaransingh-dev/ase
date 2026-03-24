'use client'
import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Grid background pattern */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.018) 1px,transparent 1px)',
          backgroundSize: '60px 60px',
          opacity: 0.35,
          pointerEvents: 'none',
          animation: 'fadeInGrid 0.8s ease-out',
        }}
      />

      {/* Radial gold gradient glow */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'radial-gradient(ellipse 60% 50% at 50% 0%,rgba(232,172,32,.06) 0%,transparent 70%)',
          pointerEvents: 'none',
          animation: 'fadeInGlow 1.2s ease-out',
        }}
      />

      {/* Subtle animated background */}
      <style>{`
        @keyframes fadeInGrid {
          from { opacity: 0; }
          to { opacity: 0.35; }
        }
        @keyframes fadeInGlow {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      {/* Nav */}
      <nav
        style={{
          padding: '1.25rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
          zIndex: 10,
        }}
      >
        <Link
          href="/"
          style={{
            fontFamily: 'var(--font-head)',
            fontWeight: 800,
            fontSize: '1.1rem',
            letterSpacing: '-.02em',
            transition: 'transform 0.2s ease',
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget
            el.style.transform = 'scale(1.05)'
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget
            el.style.transform = 'scale(1)'
          }}
        >
          AS<span style={{ color: 'var(--gold)' }}>E</span>
        </Link>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '.65rem',
            color: 'var(--faint)',
            letterSpacing: '.08em',
          }}
        >
          PAPER TRADING · NOT FINANCIAL ADVICE
        </div>
      </nav>

      {/* Content */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem 1.5rem',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {children}
      </div>

      {/* Footer disclaimer */}
      <div
        style={{
          padding: '1rem 1.5rem',
          textAlign: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: '.6rem',
          color: 'var(--faint)',
          position: 'relative',
          zIndex: 10,
        }}
      >
        © 2026 Agent Security Exchange · Not financial advice · Paper trading only
      </div>
    </div>
  )
}
