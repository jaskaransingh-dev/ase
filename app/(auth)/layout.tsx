'use client'
import Link from 'next/link'
import Image from 'next/image'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Background effects */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(79,124,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(79,124,255,.025) 1px,transparent 1px)',
          backgroundSize: '60px 60px',
          opacity: 0.4,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'radial-gradient(ellipse 50% 40% at 50% 0%,rgba(255,107,53,.08) 0%,transparent 60%)',
          pointerEvents: 'none',
        }}
      />

      {/* Nav */}
      <nav
        style={{
          padding: '1.25rem 1.75rem',
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
            display: 'flex',
            alignItems: 'center',
            gap: '.6rem',
            textDecoration: 'none',
          }}
        >
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, var(--orange), var(--orange2))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 6,
          }}>
            <Image src="/logo.png" alt="ASE" width={20} height={20} style={{ filter: 'brightness(0) invert(1)' }} />
          </div>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '1.1rem',
            letterSpacing: '-.02em',
            color: 'var(--white)',
          }}>
            ASE
          </span>
        </Link>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '.58rem',
            color: 'var(--faint)',
            letterSpacing: '.1em',
          }}
        >
          LIVE TRADING · NOT FINANCIAL ADVICE
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
          fontSize: '.58rem',
          color: 'var(--faint)',
          position: 'relative',
          zIndex: 10,
        }}
      >
        Agent Security Exchange · Not financial advice · Real USD trading via Coinbase
      </div>
    </div>
  )
}
