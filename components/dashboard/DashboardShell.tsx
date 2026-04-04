'use client'

import { useEffect, useState } from 'react'
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
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/exchange', label: 'Exchange' },
  { href: '/dashboard/deposit', label: 'Funding' },
]

const QUICK_ITEMS = [
  { href: '/dashboard/deposit', label: 'Deposit' },
  { href: '/dashboard/exchange', label: 'Trade' },
]

function triggerHaptic(ms = 8) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(ms)
  }
}

export default function DashboardShell({ user, initialBalance, children }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const [balance, setBalance] = useState(initialBalance)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)

  useEffect(() => {
    const channel = supabase
      .channel('wallet-updates-v2')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'wallets',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setBalance((payload.new as { balance_cents: number }).balance_cents)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, user.id])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <div className="dashboard-shell-v2">
      <header className="dashboard-shell-topbar">
        <div className="dashboard-shell-brand-row">
          <Link href="/" className="dashboard-shell-brand" onClick={() => triggerHaptic()}>
            AS<span>E</span>
          </Link>

          <nav className="dashboard-shell-nav desktop-only">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`dashboard-shell-nav-link ${isActive ? 'is-active' : ''}`}
                  onClick={() => triggerHaptic()}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="dashboard-shell-right">
          <div className="dashboard-market-pill desktop-only">US Market: Open</div>

          <button className="dashboard-command-pill desktop-only" onClick={() => triggerHaptic(6)}>
            Search
            <span>⌘K</span>
          </button>

          <div className="dashboard-quick-links desktop-only">
            {QUICK_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} className="dashboard-quick-link" onClick={() => triggerHaptic(8)}>
                {item.label}
              </Link>
            ))}
          </div>

          <div className="dashboard-balance-pill">
            <span className="dashboard-live-dot" />
            {fmtUSD(balance)}
          </div>

          <button
            className="dashboard-mobile-toggle mobile-only"
            onClick={() => {
              triggerHaptic(10)
              setMobileOpen((prev) => !prev)
            }}
            aria-label="Toggle mobile navigation"
          >
            <span />
            <span />
            <span />
          </button>

          <div className="dashboard-user-menu-wrap">
            <button
              className="dashboard-user-avatar"
              onClick={() => {
                triggerHaptic(8)
                setShowDropdown((prev) => !prev)
              }}
              aria-label="Open account menu"
            >
              {user.name.charAt(0).toUpperCase()}
            </button>

            {showDropdown && (
              <div className="dashboard-user-dropdown">
                <div className="dashboard-user-dropdown-head">
                  <strong>{user.name}</strong>
                  <span>{user.email}</span>
                </div>
                <Link href="/account" onClick={() => setShowDropdown(false)}>
                  Account Settings
                </Link>
                <Link href="/dashboard/deposit" onClick={() => setShowDropdown(false)}>
                  Add Funds
                </Link>
                <Link href="/dashboard/exchange" onClick={() => setShowDropdown(false)}>
                  Open Exchange
                </Link>
                <a href="https://robinhood.com/us/en/support/articles/get-started-with-robinhood-legend/?hcs=true" target="_blank" rel="noreferrer">
                  Trading UX Reference
                </a>
                <button
                  onClick={() => {
                    setShowDropdown(false)
                    void handleSignOut()
                  }}
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {mobileOpen && (
        <div className="dashboard-mobile-drawer mobile-only">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`dashboard-mobile-link ${isActive ? 'is-active' : ''}`}
                onClick={() => {
                  triggerHaptic(8)
                  setMobileOpen(false)
                }}
              >
                {item.label}
              </Link>
            )
          })}

          <Link
            href="/account"
            className="dashboard-mobile-link"
            onClick={() => {
              triggerHaptic(8)
              setMobileOpen(false)
            }}
          >
            Account Settings
          </Link>
        </div>
      )}

      <main className="dashboard-shell-main">{children}</main>
    </div>
  )
}
