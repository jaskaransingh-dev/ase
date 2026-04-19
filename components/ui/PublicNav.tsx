'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function PublicNav({ variant = 'default' }: { variant?: 'default' | 'dark' }) {
  const [scrolled, setScrolled] = useState(false)
  const [authed, setAuthed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const sb = createClient()
    sb.auth.getSession().then(({ data }) => setAuthed(!!data.session))
    const { data: { subscription } } = sb.auth.onAuthStateChange((_, s) => setAuthed(!!s))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => { setMenuOpen(false) }, [pathname])

  const elevated = scrolled || variant === 'dark'

  const LINKS = [
    { label: 'Marketplace', href: '/dashboard/marketplace' },
    { label: 'Build', href: '/dashboard/build' },
    { label: 'Agents', href: '/agents' },
    { label: 'Builders', href: '/builders' },
  ]

  return (
    <>
      <style>{`
        .pub-nav-link {
          color: var(--muted); font-size: 0.84rem; font-weight: 500;
          padding: 0.42rem 0.75rem; border-radius: 8px;
          transition: color 0.14s, background 0.14s;
          white-space: nowrap; text-decoration: none;
          border: 1px solid transparent;
        }
        .pub-nav-link:hover { color: var(--white); background: rgba(255,255,255,0.06); }
        .pub-nav-link.active { color: var(--white); background: var(--blue-dim); border-color: rgba(79,140,255,0.18); }
        .pub-nav-cta {
          display: inline-flex; align-items: center; gap: 0.4rem;
          padding: 0.5rem 1.1rem; border-radius: 9px;
          font-size: 0.84rem; font-weight: 600;
          background: linear-gradient(135deg, var(--blue3), var(--blue));
          color: var(--white); border: none; cursor: pointer;
          transition: opacity 0.14s, transform 0.14s;
          white-space: nowrap; text-decoration: none;
          box-shadow: 0 2px 12px rgba(79,140,255,0.3);
        }
        .pub-nav-cta:hover { opacity: 0.88; transform: translateY(-1px); }
        @media(max-width:760px){
          .pub-nav-desktop{display:none!important}
          .pub-nav-mobile-btn{display:flex!important}
        }
      `}</style>

      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: 66, display: 'flex', alignItems: 'center',
        padding: '0 1.5rem',
        background: elevated ? 'rgba(6,17,31,0.86)' : 'rgba(6,17,31,0.12)',
        borderBottom: elevated ? '1px solid rgba(30,42,61,0.7)' : '1px solid transparent',
        backdropFilter: elevated ? 'blur(24px) saturate(160%)' : 'none',
        transition: 'all 0.25s ease',
      }}>
        {/* Logo */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', textDecoration: 'none', flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/transparent_logo.png" alt="ASE" style={{ height: 30, width: 'auto', objectFit: 'contain' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.8rem', color: 'var(--white)', letterSpacing: '0.08em' }}>ASE</span>
        </Link>

        {/* Desktop nav */}
        <div className="pub-nav-desktop" style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', flex: 1, justifyContent: 'center' }}>
          {LINKS.map(l => (
            <Link key={l.href} href={l.href} className={`pub-nav-link ${pathname === l.href ? 'active' : ''}`}>{l.label}</Link>
          ))}
        </div>

        {/* Right actions */}
        <div className="pub-nav-desktop" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          {authed ? (
            <Link href="/dashboard" className="pub-nav-cta">
              Dashboard →
            </Link>
          ) : (
            <>
              <Link href="/login" className="pub-nav-link">Sign In</Link>
              <Link href="/signup" className="pub-nav-cta">
                Get Started
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <div style={{ marginLeft: 'auto' }}>
          <button
            className="pub-nav-mobile-btn"
            onClick={() => setMenuOpen(v => !v)}
            style={{ display: 'none', background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '0.4rem 0.5rem', color: 'var(--muted)', cursor: 'pointer', alignItems: 'center', justifyContent: 'center' }}
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
            )}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 98, backdropFilter: 'blur(4px)' }} onClick={() => setMenuOpen(false)} />
          <div style={{ position: 'fixed', top: 66, left: 0, right: 0, zIndex: 99, background: 'rgba(6,17,31,0.97)', borderBottom: '1px solid var(--border)', backdropFilter: 'blur(24px)', padding: '0.75rem 1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
            {LINKS.map(l => (
              <Link key={l.href} href={l.href} style={{ display: 'block', padding: '0.75rem 1rem', borderRadius: 9, fontSize: '0.95rem', fontWeight: 500, color: pathname === l.href ? 'var(--white)' : 'var(--muted)', textDecoration: 'none', background: pathname === l.href ? 'var(--blue-dim)' : 'transparent', transition: 'all 0.12s' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--white)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                onMouseLeave={e => { e.currentTarget.style.color = pathname === l.href ? 'var(--white)' : 'var(--muted)'; e.currentTarget.style.background = pathname === l.href ? 'var(--blue-dim)' : 'transparent' }}>
                {l.label}
              </Link>
            ))}
            <div style={{ marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {authed ? (
                <Link href="/dashboard" className="pub-nav-cta" style={{ justifyContent: 'center', padding: '0.75rem 1rem', fontSize: '0.95rem' }}>Dashboard →</Link>
              ) : (
                <>
                  <Link href="/login" style={{ display: 'block', textAlign: 'center', padding: '0.75rem', borderRadius: 9, fontSize: '0.9rem', color: 'var(--muted)', textDecoration: 'none' }}>Sign In</Link>
                  <Link href="/signup" className="pub-nav-cta" style={{ justifyContent: 'center', padding: '0.75rem 1rem', fontSize: '0.95rem' }}>Get Started</Link>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
