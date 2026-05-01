'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Logo } from '@/components/ui/Logo'
import AIChatbot from '@/components/AIChatbot'
import { NAV_CONFIG } from '@/lib/nav-config'

export default function DashboardShell({ user, children }: { user: { id: string; email: string; name: string }; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
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

  function isActive(href: string, exact?: boolean) {
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

  const isFullscreenContent = (pathname ?? '') === '/dashboard/backtest' || (pathname ?? '').startsWith('/dashboard/build') || (pathname ?? '').startsWith('/dashboard/lab')

  return (
    <div className="quant-terminal">
      {/* ── Sidebar (glass) ── */}
      <aside
        className="sidebar ase-glass"
        style={{
          width: sidebarOpen ? 240 : 0,
          overflow: 'hidden',
          transition: 'width 0.22s cubic-bezier(.4,0,.2,1)',
          borderRight: '1px solid var(--ase-glass-border)',
          background: 'linear-gradient(180deg, rgba(13,17,23,0.78) 0%, rgba(17,22,31,0.82) 100%)',
          backdropFilter: 'blur(16px) saturate(140%)',
          WebkitBackdropFilter: 'blur(16px) saturate(140%)',
        }}
      >
        {/* Brand */}
        <div className="sidebar-brand" style={{ justifyContent: 'space-between', height: 46, borderBottom: '1px solid rgba(30,42,61,0.8)' }}>
          <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Logo size="small" variant="icon" showLink={false} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, color: 'var(--white)', letterSpacing: '0.08em', opacity: 0.9 }}>ASE</span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            style={{ background: 'transparent', border: '1px solid transparent', borderRadius: 5, color: 'var(--faint)', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center', transition: 'all 0.12s' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg3)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--faint)'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
          {NAV_CONFIG.map(group => (
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
                      {item.badge && (
                        <span style={{
                          marginLeft: 'auto',
                          padding: '2px 5px',
                          fontSize: '0.45rem',
                          fontWeight: 700,
                          letterSpacing: '0.1em',
                          borderRadius: 4,
                          background: item.badgeColor === '#FFB800' ? 'rgba(255,184,0,0.15)' : 'rgba(79,140,255,0.15)',
                          color: item.badgeColor === '#FFB800' ? '#FFB800' : 'var(--blue)',
                          border: `1px solid ${item.badgeColor === '#FFB800' ? 'rgba(255,184,0,0.3)' : 'rgba(79,140,255,0.3)'}`,
                        }}>
                          {item.badge}
                        </span>
                      )}
                      {active && !iconOnly && !item.badge && (
                        <div className="ase-pulse" style={{ marginLeft: 'auto', width: 5, height: 5, borderRadius: '50%', background: 'var(--ase-electric)', flexShrink: 0 }} />
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
{NAV_CONFIG.map(group => (
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
          gap: '0.6rem',
          padding: '0 1rem',
          height: 46,
          background: 'rgba(3,13,25,0.92)',
          backdropFilter: 'blur(24px) saturate(160%)',
          borderBottom: '1px solid rgba(30,42,61,0.8)',
        }}>
          {/* Sidebar toggle */}
          <button
            onClick={() => { setSidebarOpen(v => !v); setMobileOpen(false) }}
            style={{ background: 'transparent', border: '1px solid transparent', borderRadius: 6, color: 'var(--faint)', cursor: 'pointer', padding: '0.3rem', display: 'flex', alignItems: 'center', flexShrink: 0, transition: 'all 0.12s' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg3)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--faint)'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </button>

          {/* Mobile menu */}
          <button
            className="mobile-only"
            onClick={() => setMobileOpen(v => !v)}
            style={{ background: 'transparent', border: 'none', color: 'var(--faint)', cursor: 'pointer', padding: '0.25rem', display: 'none', alignItems: 'center', flexShrink: 0 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>

          {/* Divider */}
          <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />

          {/* Breadcrumbs */}
          <div className="quant-breadcrumbs" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flex: 1, minWidth: 0 }}>
            <Link href="/dashboard" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--faint)', textDecoration: 'none', transition: 'color 0.12s', whiteSpace: 'nowrap', letterSpacing: '0.04em' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--muted)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--faint)'}>
              ASE
            </Link>
            {getBreadcrumbs().map((crumb) => (
              <span key={crumb.href} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <span style={{ color: 'var(--border2)', fontSize: '0.6rem', opacity: 0.6 }}>/</span>
                {crumb.isLast ? (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--white)', fontWeight: 600, letterSpacing: '0.04em' }}>{crumb.label}</span>
                ) : (
                  <Link href={crumb.href} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--faint)', textDecoration: 'none', letterSpacing: '0.04em' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--muted)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--faint)'}>
                    {crumb.label}
                  </Link>
                )}
              </span>
            ))}
          </div>

          {/* Right actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
            {/* Unified system-health tray */}
            <SystemHealthTray marketOpen={marketOpen} accountConnected={accountConnected} />

            {/* Kraken status pill */}
            {accountConnected ? (
              <Link href="/dashboard/connect/kraken" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.6rem', background: 'rgba(94,65,217,0.1)', border: '1px solid rgba(94,65,217,0.25)', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: '0.62rem', textDecoration: 'none' }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--mint)' }} />
                <span style={{ color: '#a78bfa' }}>🐙 Kraken</span>
              </Link>
            ) : (
              <Link href="/dashboard/connect/kraken" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.28rem 0.7rem', background: 'rgba(94,65,217,0.08)', border: '1px solid rgba(94,65,217,0.2)', borderRadius: 6, color: '#a78bfa', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 600, cursor: 'pointer', letterSpacing: '0.04em', textDecoration: 'none' }}>
                🐙 Connect Kraken
              </Link>
            )}

            {/* User avatar */}
            <Link href="/dashboard/settings" style={{ display: 'flex', alignItems: 'center', padding: '0.2rem', borderRadius: 6, border: '1px solid transparent', transition: 'all 0.12s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg3)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg,rgba(79,140,255,.3),rgba(22,199,132,.2))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 700, color: 'var(--white)' }}>
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

      {/* ⌘K command palette */}
      <CommandPalette />

      {/* AI is now embedded in the Build/Code pages — no global overlay needed */}

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

// ─── System Health Tray ──────────────────────────────────────────
function SystemHealthTray({ marketOpen, accountConnected }: { marketOpen: boolean; accountConnected: boolean }) {
  const [open, setOpen] = useState(false)
  const ok = accountConnected
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(v => !v)} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '0.32rem 0.65rem', borderRadius: 6,
        background: 'rgba(13,17,23,0.7)', border: '1px solid var(--ase-glass-border)', cursor: 'pointer',
        fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.06em',
        color: 'var(--text)',
      }}>
        <span className={ok && marketOpen ? 'ase-pulse' : ''} style={{
          width: 6, height: 6, borderRadius: '50%',
          background: ok ? 'var(--ase-emerald)' : 'var(--orange)',
        }} />
        <span style={{ color: ok ? 'var(--ase-emerald)' : 'var(--orange)' }}>SYS</span>
        <span style={{ color: 'var(--faint)' }}>{marketOpen ? 'OPEN' : 'IDLE'}</span>
      </button>
      {open && (
        <div className="ase-glass ase-tab-in" style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: 260,
          padding: '0.7rem 0.85rem', borderRadius: 9, border: '1px solid var(--ase-glass-border)',
          background: 'rgba(13,17,23,0.92)', zIndex: 200,
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontSize: '0.55rem', color: 'var(--faint)', fontFamily: 'var(--font-mono)', letterSpacing: '0.18em', marginBottom: 6 }}>SYSTEM HEALTH</div>
          {[
            { k: 'Market', v: marketOpen ? 'OPEN' : 'CLOSED', good: marketOpen },
            { k: 'Kraken', v: accountConnected ? 'CONNECTED · ~120ms' : 'NOT LINKED', good: accountConnected },
            { k: 'API', v: 'HEALTHY', good: true },
            { k: 'Backtest engine', v: 'ONLINE', good: true },
            { k: 'Agent scheduler', v: 'IDLE · cron disabled', good: false },
          ].map(row => (
            <div key={row.k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
              <span style={{ color: 'var(--text)' }}>{row.k}</span>
              <span style={{ color: row.good ? 'var(--ase-emerald)' : 'var(--orange)' }}>{row.v}</span>
            </div>
          ))}
          <div style={{ marginTop: 6, fontSize: '0.55rem', color: 'var(--faint)', fontFamily: 'var(--font-mono)' }}>
            Press <span style={{ color: 'var(--ase-electric)' }}>⌘K</span> to jump anywhere.
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ⌘K Command Palette ──────────────────────────────────────────
function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)

  const items = [
    { label: 'Quant Lab · Build Agent',  href: '/dashboard/lab',           hint: 'AI builder' },
    { label: 'Studio (manual editor)',   href: '/dashboard/lab/studio',    hint: 'Edit spec' },
    { label: 'Backtest Engine',          href: '/dashboard/lab/backtest',  hint: 'Run scenarios' },
    { label: 'My Agents',                href: '/dashboard/lab/agents',    hint: 'Drafts & published' },
    { label: 'Exchange',                 href: '/dashboard/marketplace',   hint: 'Allocate funds' },
    { label: 'SYNE Terminal · News',     href: '/dashboard/geo',           hint: 'Market intel' },
    { label: 'Kraken Keys',              href: '/dashboard/connect/kraken',hint: 'API keys' },
    { label: 'Settings',                 href: '/dashboard/settings',      hint: 'Account' },
    { label: 'Overview',                 href: '/dashboard',               hint: 'Home' },
  ]
  const filtered = q ? items.filter(i => i.label.toLowerCase().includes(q.toLowerCase()) || i.hint.toLowerCase().includes(q.toLowerCase())) : items

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(v => !v); setQ(''); setIdx(0); return }
      if (!open) return
      if (e.key === 'Escape') { setOpen(false); return }
      if (e.key === 'ArrowDown') { setIdx(i => Math.min(filtered.length - 1, i + 1)); e.preventDefault() }
      if (e.key === 'ArrowUp')   { setIdx(i => Math.max(0, i - 1)); e.preventDefault() }
      if (e.key === 'Enter')     { const target = filtered[idx]; if (target) { router.push(target.href); setOpen(false) } }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, idx, filtered, router])

  if (!open) return null
  return (
    <div onClick={() => setOpen(false)} style={{
      position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      paddingTop: '14vh', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
    }}>
      <div onClick={e => e.stopPropagation()} className="ase-glass ase-tab-in" style={{
        width: 'min(560px, 92vw)', borderRadius: 12, border: '1px solid var(--ase-glass-border)',
        background: 'rgba(17,22,31,0.95)', boxShadow: '0 30px 80px rgba(0,0,0,0.6)', overflow: 'hidden',
      }}>
        <input
          autoFocus value={q}
          onChange={e => { setQ(e.target.value); setIdx(0) }}
          placeholder="Jump to anything…"
          style={{
            width: '100%', padding: '0.95rem 1.1rem', background: 'transparent', border: 'none', outline: 'none',
            color: 'var(--white)', fontSize: '0.95rem', fontFamily: 'var(--font-body)',
            borderBottom: '1px solid var(--ase-glass-border)',
          }}
        />
        <div style={{ maxHeight: '50vh', overflow: 'auto', padding: 6 }}>
          {filtered.map((it, i) => (
            <div
              key={it.href}
              onMouseEnter={() => setIdx(i)}
              onClick={() => { router.push(it.href); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.55rem 0.85rem', borderRadius: 7, cursor: 'pointer',
                background: idx === i ? 'var(--ase-electric-dim)' : 'transparent',
                border: `1px solid ${idx === i ? 'rgba(88,166,255,0.35)' : 'transparent'}`,
              }}
            >
              <div>
                <div style={{ fontSize: '0.85rem', color: 'var(--white)', fontWeight: 500 }}>{it.label}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--faint)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>{it.hint}</div>
              </div>
              <div style={{ fontSize: '0.6rem', color: 'var(--faint)', fontFamily: 'var(--font-mono)' }}>{it.href}</div>
            </div>
          ))}
          {filtered.length === 0 && <div style={{ padding: '0.85rem', color: 'var(--faint)', fontSize: '0.8rem' }}>No matches</div>}
        </div>
        <div style={{ display: 'flex', gap: 12, padding: '0.55rem 1rem', borderTop: '1px solid var(--ase-glass-border)', fontSize: '0.55rem', color: 'var(--faint)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
          <span>↑↓ navigate</span><span>↵ open</span><span>esc close</span>
          <span style={{ marginLeft: 'auto' }}>⌘K toggle</span>
        </div>
      </div>
    </div>
  )
}
