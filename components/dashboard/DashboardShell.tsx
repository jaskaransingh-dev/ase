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
  { href: '/dashboard/exchange', label: 'Exchange' },
  { href: '/dashboard/deposit', label: 'Add Funds' },
]

export default function DashboardShell({ user, initialBalance, children }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [balance, setBalance] = useState(initialBalance)
  const [mobNav, setMobNav] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Top Navigation Bar */}
      <nav style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: 'rgba(7,9,15,.95)',
        borderBottom: '1px solid var(--border)',
        backdropFilter: 'blur(12px)',
        padding: '0.75rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 64
      }}>
        {/* Left: Logo */}
        <Link href="/" style={{
          fontFamily: 'var(--font-head)',
          fontWeight: 800,
          fontSize: '1.1rem',
          letterSpacing: '-.02em',
          display: 'flex',
          alignItems: 'center'
        }}>
          AS<span style={{ color: 'var(--gold)' }}>E</span>
        </Link>

        {/* Center: Nav Links (desktop only) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          flex: 1,
          marginLeft: '3rem'
        }} className="desktop-nav">
          {NAV_ITEMS.map(item => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  padding: '0.6rem 1rem',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  color: isActive ? 'var(--white)' : 'var(--muted)',
                  textDecoration: 'none',
                  borderBottom: isActive ? '2px solid var(--gold)' : '2px solid transparent',
                  transition: 'all 0.15s',
                  cursor: 'pointer'
                }}
                className="nav-link"
                data-active={isActive.toString()}
              >
                {item.label}
              </Link>
            )
          })}
        </div>

        {/* Right: Balance Pill + Avatar + Menu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginLeft: 'auto' }}>
          {/* Balance Pill */}
          <div style={{
            padding: '0.5rem 1rem',
            background: 'rgba(232,172,32,.08)',
            border: '1px solid rgba(232,172,32,.2)',
            borderRadius: 20,
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8rem',
            fontWeight: 700,
            color: 'var(--gold)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem'
          }}>
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)' }} />
            {fmtUSD(balance)}
          </div>

          {/* Mobile Hamburger (mobile only) */}
          <button
            onClick={() => setMobNav(!mobNav)}
            style={{
              display: 'none',
              background: 'var(--surface)',
              border: '1px solid var(--border2)',
              borderRadius: 8,
              padding: '0.45rem',
              color: 'var(--white)',
              cursor: 'pointer'
            }}
            className="mobile-hamburger"
          >
            <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
              <path d="M1 1H17M1 7H17M1 13H17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>

          {/* Avatar + Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'rgba(232,172,32,.12)',
                border: '1px solid rgba(232,172,32,.2)',
                display: 'grid',
                placeItems: 'center',
                fontFamily: 'var(--font-head)',
                fontWeight: 800,
                fontSize: '0.85rem',
                color: 'var(--gold)',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              className="avatar-button"
            >
              {user.name.charAt(0).toUpperCase()}
            </button>

            {/* Dropdown Menu */}
            {showDropdown && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '0.5rem',
                background: 'var(--bg2)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                overflow: 'hidden',
                minWidth: 160,
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                zIndex: 200
              }}>
                <Link
                  href="/account"
                  style={{
                    display: 'block',
                    padding: '0.75rem 1rem',
                    fontSize: '0.85rem',
                    color: 'var(--white)',
                    textDecoration: 'none',
                    borderBottom: '1px solid var(--border)',
                    transition: 'all 0.15s',
                    cursor: 'pointer'
                  }}
                  className="dropdown-link"
                >
                  Account Settings
                </Link>
                <button
                  onClick={() => {
                    setShowDropdown(false)
                    handleSignOut()
                  }}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    fontSize: '0.85rem',
                    color: 'var(--red)',
                    background: 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    fontFamily: 'inherit'
                  }}
                  className="signout-button"
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile Navigation Drawer */}
      {mobNav && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 150, display: 'flex', top: 64 }}>
          <div
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)' }}
            onClick={() => setMobNav(false)}
          />
          <div style={{
            position: 'relative',
            width: '100%',
            background: 'var(--bg2)',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem'
          }}>
            {NAV_ITEMS.map(item => {
              const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobNav(false)}
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: 10,
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    color: isActive ? 'var(--white)' : 'var(--muted)',
                    textDecoration: 'none',
                    background: isActive ? 'rgba(255,255,255,.06)' : 'transparent',
                    border: isActive ? '1px solid var(--border2)' : '1px solid transparent',
                    transition: 'all 0.15s'
                  }}
                >
                  {item.label}
                </Link>
              )
            })}
            <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.5rem', paddingTop: '0.5rem' }}>
              <Link
                href="/account"
                onClick={() => setMobNav(false)}
                style={{
                  display: 'block',
                  padding: '0.75rem 1rem',
                  borderRadius: 10,
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  color: 'var(--muted)',
                  textDecoration: 'none',
                  transition: 'all 0.15s'
                }}
              >
                Account Settings
              </Link>
              <button
                onClick={() => {
                  setMobNav(false)
                  handleSignOut()
                }}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  borderRadius: 10,
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  color: 'var(--red)',
                  background: 'transparent',
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  fontFamily: 'inherit'
                }}
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main style={{ flex: 1, marginTop: 64, background: 'var(--bg)' }}>
        {children}
      </main>

      <style>{`
        .nav-link {
          position: relative;
        }
        .nav-link[data-active="false"]:hover {
          color: var(--white) !important;
        }
        .avatar-button:hover {
          background: rgba(232,172,32,.18) !important;
        }
        .dropdown-link:hover {
          background: rgba(255,255,255,.05) !important;
        }
        .signout-button:hover {
          background: rgba(232,64,64,.08) !important;
        }
        @media(max-width:768px){
          .desktop-nav { display: none !important; }
          .mobile-hamburger { display: grid !important; }
        }
      `}</style>
    </div>
  )
}
