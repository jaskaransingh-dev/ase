'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Logo } from './Logo'
import { createClient } from '@/lib/supabase/client'

export default function PublicNav({ variant = 'default' }: { variant?: 'default' | 'dark' }) {
  const [scrolled, setScrolled] = useState(false)
  const [authed, setAuthed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const sb = createClient()
    sb.auth.getSession().then(({ data }) => setAuthed(!!data.session))
    const { data: { subscription } } = sb.auth.onAuthStateChange((_, s) => setAuthed(!!s))
    return () => subscription.unsubscribe()
  }, [])

  const elevated = scrolled || variant === 'dark'

  return (
    <>
      <style>{`
        .pub-nav-links { display: flex; gap: 0.25rem; align-items: center; }
        .pub-nav-link {
          color: var(--muted);
          font-size: 0.84rem;
          font-weight: 500;
          padding: 0.45rem 0.75rem;
          border-radius: 8px;
          transition: color 0.15s, background 0.15s;
          white-space: nowrap;
        }
        .pub-nav-link:hover { color: var(--white); background: rgba(255,255,255,0.06); }
        .pub-nav-cta {
          display: flex; align-items: center; gap: 0.5rem;
          padding: 0.55rem 1.15rem;
          border-radius: 10px;
          font-size: 0.84rem;
          font-weight: 600;
          background: linear-gradient(135deg, var(--blue3), var(--blue));
          color: var(--white);
          border: none;
          cursor: pointer;
          transition: opacity 0.15s, transform 0.15s;
          white-space: nowrap;
        }
        .pub-nav-cta:hover { opacity: 0.88; transform: translateY(-1px); }
        .pub-nav-mobile-btn {
          display: none;
          background: none;
          border: 1px solid var(--border2);
          border-radius: 8px;
          padding: 0.4rem 0.5rem;
          color: var(--muted);
          cursor: pointer;
          align-items: center;
          justify-content: center;
        }
        @media (max-width: 720px) {
          .pub-nav-links { display: none; }
          .pub-nav-mobile-btn { display: flex; }
          .pub-nav-mobile-menu {
            position: fixed;
            top: 72px;
            left: 0; right: 0;
            background: rgba(6,17,31,0.97);
            border-bottom: 1px solid var(--border);
            backdrop-filter: blur(20px);
            padding: 1rem 1.5rem 1.5rem;
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
            z-index: 99;
          }
          .pub-nav-mobile-menu .pub-nav-link {
            display: block;
            padding: 0.75rem 1rem;
            font-size: 0.95rem;
          }
          .pub-nav-mobile-menu .pub-nav-cta {
            margin-top: 0.5rem;
            justify-content: center;
            padding: 0.75rem 1rem;
            font-size: 0.95rem;
          }
        }
      `}</style>
      <nav
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          height: 68,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 1.75rem',
          background: elevated ? 'rgba(6,17,31,0.82)' : 'rgba(6,17,31,0.20)',
          borderBottom: elevated ? '1px solid rgba(79,140,255,0.14)' : '1px solid transparent',
          backdropFilter: elevated ? 'blur(24px) saturate(160%)' : 'none',
          transition: 'all 0.25s ease',
        }}
      >
        <Logo size="small" showLink />

        <div className="pub-nav-links">
          <Link href="/agents" className="pub-nav-link">Marketplace</Link>
          <Link href="/builders" className="pub-nav-link">Build</Link>
          <Link href="/agents" className="pub-nav-link">Invest</Link>
          {authed ? (
            <Link href="/dashboard" className="pub-nav-cta" style={{ textDecoration: 'none' }}>
              Dashboard →
            </Link>
          ) : (
            <>
              <Link href="/login" className="pub-nav-link">Sign In</Link>
              <Link href="/signup" className="pub-nav-cta" style={{ textDecoration: 'none' }}>
                Get Started
              </Link>
            </>
          )}
        </div>

        <button
          className="pub-nav-mobile-btn"
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Toggle menu"
        >
          {menuOpen ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          )}
        </button>
      </nav>

      {menuOpen && (
        <div className="pub-nav-mobile-menu" onClick={() => setMenuOpen(false)}>
          <Link href="/agents" className="pub-nav-link">Marketplace</Link>
          <Link href="/builders" className="pub-nav-link">Build</Link>
          <Link href="/agents" className="pub-nav-link">Invest</Link>
          {authed ? (
            <Link href="/dashboard" className="pub-nav-cta" style={{ textDecoration: 'none' }}>
              Dashboard →
            </Link>
          ) : (
            <>
              <Link href="/login" className="pub-nav-link">Sign In</Link>
              <Link href="/signup" className="pub-nav-cta" style={{ textDecoration: 'none' }}>
                Get Started
              </Link>
            </>
          )}
        </div>
      )}
    </>
  )
}
