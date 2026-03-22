'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fmtUSD } from '@/lib/utils'

interface Props {
  user: { id: string; email: string; name: string }
  initialBalance: number
  children: React.ReactNode
}

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Portfolio' },
  { href: '/agents', label: 'Agents' },
  { href: '/dashboard/deposit', label: 'Add Credits' },
  { href: '/account', label: 'Account' },
]

export default function DashboardShell({ user, initialBalance, children }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [balance, setBalance] = useState(initialBalance)
  const [mobNav, setMobNav] = useState(false)

  useEffect(() => {
    const channel = supabase
      .channel('wallet-updates')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'wallets',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        setBalance((payload.new as { balance_cents: number }).balance_cents)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, user.id])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  const sidebarContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Logo */}
      <div style={{ padding: '1.25rem 1.25rem 1rem', borderBottom: '1px solid var(--border)' }}>
        <Link href="/" style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-.02em' }}>
          AS<span style={{ color: 'var(--gold)' }}>E</span>
        </Link>
      </div>

      {/* Balance card */}
      <div style={{ margin: '1rem', padding: '1rem', background: 'rgba(232,172,32,.06)', border: '1px solid rgba(232,172,32,.15)', borderRadius: 14 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', letterSpacing: '.1em', color: 'var(--faint)', marginBottom: '.3rem' }}>PAPER CREDITS</div>
        <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.4rem', fontWeight: 800, color: 'var(--gold)' }}>{fmtUSD(balance)}</div>
        <Link href="/dashboard/deposit" style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: 'var(--gold)', marginTop: '.35rem', display: 'block', opacity: .7 }}>+ Add Credits →</Link>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '0 .75rem' }}>
        {NAV_ITEMS.map(item => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link key={item.href} href={item.href}
              style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.65rem .85rem', borderRadius: 12, marginBottom: '.2rem', fontSize: '.9rem', fontWeight: 600, color: active ? 'var(--white)' : 'var(--muted)', background: active ? 'rgba(255,255,255,.06)' : 'transparent', border: active ? '1px solid var(--border2)' : '1px solid transparent', transition: 'all .15s' }}>
              {item.label}
              {item.label === 'Add Credits' && (
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '.58rem', padding: '.15rem .4rem', borderRadius: 6, background: 'rgba(232,172,32,.15)', color: 'var(--gold)', border: '1px solid rgba(232,172,32,.2)' }}>+ ADD</span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User + sign out */}
      <div style={{ padding: '1rem', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.75rem' }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(232,172,32,.12)', border: '1px solid rgba(232,172,32,.2)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '.85rem', color: 'var(--gold)', flexShrink: 0 }}>
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: '.85rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
          </div>
        </div>
        <button onClick={handleSignOut} style={{ width: '100%', padding: '.55rem', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--faint)', fontSize: '.82rem', cursor: 'pointer', transition: 'all .15s', fontFamily: 'inherit' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.borderColor = 'rgba(232,64,64,.25)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--faint)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
          Sign Out
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Desktop sidebar */}
      <aside style={{ width: 240, flexShrink: 0, background: 'var(--bg2)', borderRight: '1px solid var(--border)', position: 'fixed', top: 0, left: 0, bottom: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', zIndex: 100 }} className="desktop-sidebar">
        {sidebarContent}
      </aside>

      {/* Mobile header */}
      <div style={{ display: 'none', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200, background: 'rgba(7,9,15,.95)', borderBottom: '1px solid var(--border)', padding: '.75rem 1rem', alignItems: 'center', justifyContent: 'space-between', backdropFilter: 'blur(12px)' }} className="mobile-header">
        <Link href="/" style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem' }}>AS<span style={{ color: 'var(--gold)' }}>E</span></Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: 'var(--gold)' }}>{fmtUSD(balance)}</span>
          <button onClick={() => setMobNav(!mobNav)} style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 8, padding: '.45rem', display: 'grid', placeItems: 'center', color: 'var(--white)' }}>
            <svg width="18" height="14" viewBox="0 0 18 14" fill="none"><path d="M1 1H17M1 7H17M1 13H17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </div>
      </div>

      {/* Mobile nav drawer */}
      {mobNav && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)' }} onClick={() => setMobNav(false)} />
          <div style={{ position: 'relative', width: 280, background: 'var(--bg2)', height: '100%', overflow: 'auto' }}>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main content */}
      <main style={{ flex: 1, marginLeft: 240, minHeight: '100vh' }} className="main-content">
        {children}
      </main>

      <style>{`
        @media(max-width:768px){
          .desktop-sidebar{display:none!important}
          .mobile-header{display:flex!important}
          .main-content{margin-left:0!important;padding-top:60px}
        }
      `}</style>
    </div>
  )
}
