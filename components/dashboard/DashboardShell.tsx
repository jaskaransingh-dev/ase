'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Logo } from '@/components/ui/Logo'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { href: '/agents', label: 'Exchange', icon: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9' },
  { href: '/dashboard/backtest', label: 'Lab', icon: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { href: '/builders/submit', label: 'Submit Agent', icon: 'M12 4v16m8-8H4' },
  { href: '/dashboard/settings', label: 'Settings', icon: 'M10.325 18.693l3.768-1.458.767 1.458 3.83.788-1.458 1.458-3.768.831 1.458 3.768-1.458.767-1.458-.831-3.768-.831zM12 12a4 4 0 110-8 4 4 0 010 8z' },
]


export default function DashboardShell({ user, children }: { user: { id: string; email: string; name: string }; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [accountConnected, setAccountConnected] = useState(false)
  const [accountStatus, setAccountStatus] = useState<string | null>(null)
  const [accountNumber, setAccountNumber] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    fetch('/api/broker/create-account')
      .then(r => r.json())
      .then(d => {
        setAccountConnected(d.has_account)
        setAccountStatus(d.status || null)
        setAccountNumber(d.account_number || null)
      })
      .catch(() => null)
    
    const interval = setInterval(() => {
      fetch('/api/broker/create-account')
        .then(r => r.json())
        .then(d => {
          setAccountConnected(d.has_account)
          setAccountStatus(d.status || null)
          setAccountNumber(d.account_number || null)
        })
        .catch(() => null)
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const getBreadcrumbs = () => {
    const paths = pathname.split('/').filter(Boolean)
    return paths.map((p, i) => ({
      label: p.charAt(0).toUpperCase() + p.slice(1).replace(/-/g, ' '),
      href: '/' + paths.slice(0, i + 1).join('/'),
      isLast: i === paths.length - 1
    }))
  }

  return (
    <div className="quant-terminal">
      {/* Mobile toggle */}
      <button 
        className="mobile-menu-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        style={{
          position: 'fixed',
          top: '1rem',
          left: '1rem',
          zIndex: 200,
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '0.5rem',
          display: 'none',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--white)" strokeWidth="2">
          <path d="M4 6h16M4 12h16M4 18h16"/>
        </svg>
      </button>

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <Link href="/" onClick={() => setSidebarOpen(false)} style={{ textDecoration: 'none' }}>
            <Logo size="medium" variant="full" showLink={false} />
          </Link>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.icon} />
                </svg>
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Link href="/account" className="sidebar-user" onClick={() => setSidebarOpen(false)}>
              <div className="sidebar-user-avatar">
                {(user.name || user.email || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{user.name || 'User'}</div>
                <div className="sidebar-user-email">
                  {accountConnected && accountNumber 
                    ? `••••${accountNumber?.slice(-4)}` 
                    : user.email}
                </div>
              </div>
              {accountConnected && (
                <div style={{
                  fontSize: '0.65rem',
                  padding: '0.15rem 0.4rem',
                  borderRadius: 4,
                  background: accountStatus === 'ACTIVE' ? 'rgba(0,255,150,0.15)' : 'rgba(255,200,0,0.15)',
                  color: accountStatus === 'ACTIVE' ? 'var(--mint)' : 'var(--yellow)',
                }}>
                  {accountStatus || 'N/A'}
                </div>
              )}
            </Link>
            <button 
              onClick={handleSignOut}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.5rem 0.75rem',
                borderRadius: '10px',
                color: 'var(--muted)',
                fontSize: '0.8rem',
                fontWeight: 500,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
                transition: 'all 0.16s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'var(--red)'
                e.currentTarget.style.background = 'var(--red-dim)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'var(--muted)'
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
              </svg>
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="quant-main">
        <header className="quant-header">
          <div className="quant-breadcrumbs">
            <Link href="/dashboard">Home</Link>
            {getBreadcrumbs().map((crumb) => (
              <span key={crumb.href} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: 'var(--faint)' }}>/</span>
                {crumb.isLast ? (
                  <span className="current">{crumb.label}</span>
                ) : (
                  <Link href={crumb.href}>{crumb.label}</Link>
                )}
              </span>
            ))}
          </div>
        </header>

        <div className="quant-content">
          {children}
        </div>
      </main>

      <style>{`
        @media (max-width: 768px) {
          .mobile-menu-toggle { display: flex !important; }
          .sidebar { transform: translateX(-100%); }
          .sidebar.open { transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}