'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Logo } from '@/components/ui/Logo'
import { useWallet } from '@/components/WalletProvider'

const NAV = [
  {
    section: 'MAIN',
    items: [
      { href: '/dashboard', label: 'Overview', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', exact: true },
    ],
  },
  {
    section: 'TRADING',
    items: [
      { href: '/dashboard/marketplace', label: 'Exchange', icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z', exact: false },
      { href: '/dashboard/agents', label: 'Agents', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0z', exact: false, iconOnly: true },
    ],
  },
  {
    section: 'BUILD',
    items: [
      { href: '/dashboard/build', label: 'Quant Lab', icon: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', exact: false },
      { href: '/dashboard/backtest', label: 'Backtest', icon: 'M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z', exact: false },
      { href: '/dashboard/build/docs', label: 'Docs', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', exact: false },
    ],
  },
  {
    section: 'ACCOUNT',
    items: [
      { href: '/dashboard/settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c-.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-.543-.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z', exact: false },
    ],
  },
]

export default function DashboardShell({ user, children }: { user: { id: string; email: string; name: string }; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { wallet, shortAddress, connect, disconnect } = useWallet()
  const [accountConnected, setAccountConnected] = useState(false)
  const [accountStatus, setAccountStatus] = useState<string | null>(null)
  const [accountNumber, setAccountNumber] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [currentTime, setCurrentTime] = useState('')
  const [marketOpen, setMarketOpen] = useState(false)

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setCurrentTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }))
      const day = now.getDay()
      const hour = now.getHours()
      const min = now.getMinutes()
      const totalMins = hour * 60 + min
      setMarketOpen(day >= 1 && day <= 5 && totalMins >= 570 && totalMins < 960)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const fetchAccount = () =>
      fetch('/api/broker/account')
        .then(r => r.json())
        .then(d => {
          setAccountConnected(!!d.has_account)
          setAccountStatus(d.status || null)
          setAccountNumber(d.account_number || null)
        })
        .catch(() => null)

    void fetchAccount()
    const interval = setInterval(fetchAccount, 60000)
    return () => clearInterval(interval)
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href
    return pathname === href || pathname.startsWith(href + '/')
  }

  const getBreadcrumbs = () => {
    const paths = pathname.split('/').filter(Boolean)
    return paths.map((p, i) => ({
      label: p.charAt(0).toUpperCase() + p.slice(1).replace(/-/g, ' '),
      href: '/' + paths.slice(0, i + 1).join('/'),
      isLast: i === paths.length - 1,
    }))
  }

  const initials = (user.name || user.email || 'U').slice(0, 2).toUpperCase()

  const isFullscreenContent = (pathname ?? '') === '/dashboard/backtest' || (pathname ?? '').startsWith('/dashboard/build')

  return (
    <div className="quant-terminal">
      {/* ── Sidebar ── */}
      <aside
        className="sidebar"
        style={{
          width: sidebarOpen ? 240 : 0,
          overflow: 'hidden',
          transition: 'width 0.2s cubic-bezier(.4,0,.2,1)',
        }}
      >
        {/* Brand */}
        <div className="sidebar-brand" style={{ justifyContent: 'space-between' }}>
          <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Logo size="medium" variant="icon" showLink={false} />
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            style={{ background: 'transparent', border: 'none', color: 'var(--faint)', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Market status strip */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.5rem 1rem',
          borderBottom: '1px solid var(--border)',
          background: 'rgba(0,0,0,0.15)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: marketOpen ? 'var(--mint)' : 'var(--faint)',
              boxShadow: marketOpen ? '0 0 6px var(--mint)' : 'none',
              animation: marketOpen ? 'pulse 2s infinite' : 'none',
            }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: marketOpen ? 'var(--mint)' : 'var(--faint)', letterSpacing: '0.06em' }}>
              {marketOpen ? 'MARKET OPEN' : 'MARKET CLOSED'}
            </span>
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--faint)' }}>{currentTime}</span>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav" style={{ overflowY: 'auto', padding: '0.75rem 0.65rem' }}>
          {NAV.map(group => (
            <div key={group.section} style={{ marginBottom: '0.5rem' }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.5rem',
                fontWeight: 700,
                color: 'var(--faint)',
                letterSpacing: '0.14em',
                padding: '0.5rem 0.65rem 0.25rem',
                opacity: 0.7,
              }}>
                {group.section}
              </div>
              {group.items.map(item => {
                  const active = isActive(item.href, item.exact)
                  const iconOnly = (item as any).iconOnly
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      title={iconOnly ? item.label : undefined}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: iconOnly ? 0 : '0.65rem',
                        justifyContent: iconOnly ? 'center' : undefined,
                        padding: iconOnly ? '0.6rem' : '0.6rem 0.75rem',
                        borderRadius: 8,
                        color: active ? 'var(--white)' : 'var(--muted)',
                        fontSize: '0.82rem',
                        fontWeight: active ? 600 : 400,
                        textDecoration: 'none',
                        background: active ? 'rgba(79,140,255,0.12)' : 'transparent',
                        border: active ? '1px solid rgba(79,140,255,0.18)' : '1px solid transparent',
                        transition: 'all 0.14s',
                        marginBottom: '0.1rem',
                      }}
                      onMouseEnter={e => {
                        if (!active) {
                          e.currentTarget.style.color = 'var(--white)'
                          e.currentTarget.style.background = 'var(--blue-dim)'
                        }
                      }}
                      onMouseLeave={e => {
                        if (!active) {
                          e.currentTarget.style.color = 'var(--muted)'
                          e.currentTarget.style.background = 'transparent'
                        }
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: active ? 1 : 0.7 }}>
                        <path d={item.icon} />
                      </svg>
                      {!iconOnly && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
                      {active && !iconOnly && (
                        <div style={{ marginLeft: 'auto', width: 4, height: 4, borderRadius: '50%', background: 'var(--blue)', flexShrink: 0 }} />
                      )}
                    </Link>
                  )
                })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          {/* Broker account status */}
          {accountConnected && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 0.6rem',
              borderRadius: 8,
              background: 'rgba(22,199,132,0.06)',
              border: '1px solid rgba(22,199,132,0.15)',
              marginBottom: '0.5rem',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: accountStatus === 'ACTIVE' ? 'var(--mint)' : 'var(--orange)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--faint)', letterSpacing: '0.06em' }}>ALPACA</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 700, color: accountStatus === 'ACTIVE' ? 'var(--mint)' : 'var(--orange)' }}>
                  {accountNumber ? `••••${accountNumber.slice(-4)}` : accountStatus}
                </div>
              </div>
            </div>
          )}

          {/* User row */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setUserMenuOpen(v => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
                width: '100%',
                padding: '0.5rem 0.5rem',
                borderRadius: 8,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.14s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{
                width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg,rgba(79,140,255,.3),rgba(22,199,132,.2))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, color: 'var(--white)',
              }}>
                {initials}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user.name || 'User'}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user.email}
                </div>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2" style={{ flexShrink: 0 }}>
                <path d="M8 9l4-4 4 4m0 6l-4 4-4-4"/>
              </svg>
            </button>

            {userMenuOpen && (
              <div style={{
                position: 'absolute',
                bottom: 'calc(100% + 8px)',
                left: 0,
                right: 0,
                background: 'var(--bg2)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                overflow: 'hidden',
                boxShadow: '0 -8px 24px rgba(0,0,0,0.3)',
                zIndex: 200,
              }}>
                <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--faint)', letterSpacing: '0.08em' }}>SIGNED IN AS</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--white)', marginTop: '0.15rem' }}>{user.email}</div>
                </div>
                <Link href="/dashboard/settings" onClick={() => setUserMenuOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem', color: 'var(--muted)', fontSize: '0.82rem', transition: 'all 0.12s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--white)'; e.currentTarget.style.background = 'var(--blue-dim)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'transparent' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                  Settings
                </Link>
                <button onClick={handleSignOut} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.6rem 1rem', color: 'var(--red)', fontSize: '0.82rem', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(228,88,103,0.08)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── Mobile overlay ── */}
      {mobileOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 98, backdropFilter: 'blur(4px)' }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Mobile drawer ── */}
      {mobileOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, bottom: 0, width: 260,
          background: 'rgba(6,17,31,0.97)', borderRight: '1px solid var(--border)',
          zIndex: 99, backdropFilter: 'blur(20px)', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Logo size="small" showLink={false} />
            <button onClick={() => setMobileOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <nav style={{ flex: 1, padding: '0.75rem', overflowY: 'auto' }}>
            {NAV.map(group => (
              <div key={group.section} style={{ marginBottom: '0.5rem' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--faint)', letterSpacing: '0.14em', padding: '0.4rem 0.6rem 0.2rem' }}>{group.section}</div>
                {group.items.map(item => {
                  const active = isActive(item.href, item.exact)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        padding: '0.65rem 0.75rem',
                        borderRadius: 8,
                        color: active ? 'var(--white)' : 'var(--muted)',
                        fontSize: '0.85rem',
                        fontWeight: active ? 600 : 400,
                        textDecoration: 'none',
                        background: active ? 'rgba(79,140,255,0.12)' : 'transparent',
                        marginBottom: '0.1rem',
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={item.icon} /></svg>
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            ))}
          </nav>
          <div style={{ padding: '1rem', borderTop: '1px solid var(--border)' }}>
            <button onClick={handleSignOut} style={{ width: '100%', padding: '0.6rem', borderRadius: 8, background: 'rgba(228,88,103,0.08)', border: '1px solid rgba(228,88,103,0.2)', color: 'var(--red)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* ── Main ── */}
      <main
        className="quant-main"
        style={{
          marginLeft: sidebarOpen ? 240 : 0,
          flex: 1,
          minWidth: 0,
          transition: 'margin-left 0.2s cubic-bezier(.4,0,.2,1)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
        }}
      >
        {/* Header */}
        <header className="quant-header" style={{
          position: 'sticky',
          top: 0,
          zIndex: 90,
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0 1.25rem',
          height: 52,
          background: 'rgba(6,17,31,0.88)',
          backdropFilter: 'blur(18px)',
          borderBottom: '1px solid var(--border)',
        }}>
          {/* Sidebar toggle */}
          <button
            onClick={() => { setSidebarOpen(v => !v); setMobileOpen(false) }}
            style={{ background: 'transparent', border: 'none', color: 'var(--faint)', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center', flexShrink: 0 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </button>

          {/* Mobile menu */}
          <button
            className="mobile-only"
            onClick={() => setMobileOpen(v => !v)}
            style={{ background: 'transparent', border: 'none', color: 'var(--faint)', cursor: 'pointer', padding: '0.25rem', display: 'none', alignItems: 'center', flexShrink: 0 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>

          {/* Breadcrumbs */}
          <div className="quant-breadcrumbs" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flex: 1, minWidth: 0 }}>
            <Link href="/dashboard" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--faint)', textDecoration: 'none', transition: 'color 0.14s', whiteSpace: 'nowrap' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--muted)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--faint)'}>
              ASE
            </Link>
            {getBreadcrumbs().map((crumb) => (
              <span key={crumb.href} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ color: 'var(--border2)', fontSize: '0.65rem' }}>/</span>
                {crumb.isLast ? (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text)', fontWeight: 600 }}>{crumb.label}</span>
                ) : (
                  <Link href={crumb.href} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--faint)', textDecoration: 'none' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--muted)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--faint)'}>
                    {crumb.label}
                  </Link>
                )}
              </span>
            ))}
          </div>

          {/* Right actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            {/* Market status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.6rem', borderRadius: 6, background: 'var(--bg3)', border: '1px solid var(--border)' }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: marketOpen ? 'var(--mint)' : 'var(--faint)', animation: marketOpen ? 'pulse 2s infinite' : 'none' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: marketOpen ? 'var(--mint)' : 'var(--faint)', letterSpacing: '0.04em' }}>
                {marketOpen ? 'OPEN' : 'CLOSED'}
              </span>
            </div>

            {/* Wallet */}
            {wallet.connected ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.65rem', background: 'rgba(22,199,132,0.07)', border: '1px solid rgba(22,199,132,0.2)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: '0.68rem' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--mint)' }} />
                <span style={{ color: 'var(--white)' }}>{shortAddress}</span>
                <button onClick={disconnect} style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', padding: 0, fontSize: '0.65rem', lineHeight: 1 }}>✕</button>
              </div>
            ) : (
              <button onClick={() => connect()} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.7rem', background: 'rgba(79,140,255,0.1)', border: '1px solid rgba(79,140,255,0.22)', borderRadius: 8, color: 'var(--blue2)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                Connect
              </button>
            )}

            {/* Quick settings link */}
            <Link href="/dashboard/settings" style={{ display: 'flex', alignItems: 'center', padding: '0.3rem', borderRadius: 6, color: 'var(--faint)', border: '1px solid transparent', transition: 'all 0.14s' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg3)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--faint)'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent' }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,rgba(79,140,255,.25),rgba(22,199,132,.18))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 700, color: 'var(--white)' }}>
                {initials}
              </div>
            </Link>
          </div>
        </header>

        {/* Page content */}
        <div className="quant-content" style={{ flex: 1, padding: isFullscreenContent ? 0 : undefined, overflow: isFullscreenContent ? 'hidden' : undefined, display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>

        {/* Status bar */}
        <div style={{
          height: 28,
          display: 'flex',
          alignItems: 'center',
          padding: '0 1.25rem',
          borderTop: '1px solid var(--border)',
          background: 'rgba(6,17,31,0.6)',
          gap: '1.5rem',
        }}>
          {[
            { label: 'ENV', value: 'PRODUCTION' },
            { label: 'API', value: 'CONNECTED', positive: true },
            ...(accountConnected ? [{ label: 'ALPACA', value: accountStatus ?? 'ACTIVE', positive: accountStatus === 'ACTIVE' }] : []),
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--faint)', letterSpacing: '0.08em' }}>{s.label}:</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: s.positive ? 'var(--mint)' : 'var(--muted)', fontWeight: 600 }}>{s.value}</span>
            </div>
          ))}
          <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--faint)' }}>
            ASE Platform · Not financial advice
          </div>
        </div>
      </main>

      <style>{`
        @media (max-width: 768px) {
          .quant-main { margin-left: 0 !important; }
          .sidebar { display: none !important; }
          .mobile-only { display: flex !important; }
        }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
      `}</style>
    </div>
  )
}
