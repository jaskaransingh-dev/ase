'use client'

import Link from 'next/link'
import { useWallet } from '@/components/WalletProvider'
import { Logo } from '@/components/ui/Logo'

export default function AgentsPublicLayout({ children }: { children: React.ReactNode }) {
  const { wallet, shortAddress, openModal, disconnect } = useWallet()

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <nav style={{ borderBottom: '1px solid var(--border)', padding: '0 1.5rem', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'rgba(8,6,18,.9)', backdropFilter: 'blur(20px) saturate(180%)', zIndex: 100 }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <Logo size="medium" variant="full" />
        </Link>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          {wallet.connected ? (
            <button
              onClick={disconnect}
              title={`Connected: ${wallet.address}`}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', fontWeight: 700, padding: '.4rem .9rem', borderRadius: 9, border: '1px solid rgba(110,231,183,.28)', background: 'rgba(110,231,183,.1)', color: '#6EE7B7', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '.4rem' }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6EE7B7', display: 'inline-block', boxShadow: '0 0 5px #6EE7B780' }} />
              {shortAddress}
            </button>
          ) : (
            <button
              onClick={openModal}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', fontWeight: 700, padding: '.4rem .9rem', borderRadius: 9, border: '1px solid rgba(155,140,255,.28)', background: 'rgba(155,140,255,.08)', color: 'var(--gold)', cursor: 'pointer' }}
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
