'use client'

import Link from 'next/link'
import { useWallet } from '@/components/WalletProvider'
import { Logo } from '@/components/ui/Logo'

export default function AgentsPublicLayout({ children }: { children: React.ReactNode }) {
  const { wallet, shortAddress, openModal, disconnect } = useWallet()

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <nav style={{ borderBottom: '1px solid var(--border)', padding: '0 1.5rem', height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'rgba(255,255,255,.86)', backdropFilter: 'blur(18px) saturate(160%)', zIndex: 100 }}>
        <Logo size="medium" variant="full" />
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          {wallet.connected ? (
            <button
              onClick={disconnect}
              title={`Connected: ${wallet.address}`}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', fontWeight: 700, padding: '.45rem .9rem', borderRadius: 999, border: '1px solid rgba(22,199,132,.22)', background: 'rgba(22,199,132,.08)', color: 'var(--mint)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '.4rem' }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--mint)', display: 'inline-block', boxShadow: '0 0 5px rgba(22,199,132,.5)' }} />
              {shortAddress}
            </button>
          ) : (
            <button
              onClick={openModal}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', fontWeight: 700, padding: '.45rem .9rem', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--white)', cursor: 'pointer' }}
            >
              Connect Wallet
            </button>
          )}
          <Link href="/login" className="btn-secondary" style={{ fontSize: '.82rem', padding: '.45rem .9rem' }}>Login</Link>
          <Link href="/signup" className="btn-primary" style={{ fontSize: '.82rem', padding: '.45rem .9rem' }}>Sign Up →</Link>
        </div>
      </nav>
      {children}
    </div>
  )
}
