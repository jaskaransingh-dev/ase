'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function PublicNav({ variant = 'default' }: { variant?: 'default' | 'dark' }) {
  const [scrolled, setScrolled] = useState(false)
  const [authed, setAuthed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [time, setTime] = useState('')
  const pathname = usePathname()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }))
    }
    tick()
    const id = setInterval(tick, 10000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const sb = createClient()
    sb.auth.getSession().then(({ data }) => setAuthed(!!data.session))
    const { data: { subscription } } = sb.auth.onAuthStateChange((_, s) => setAuthed(!!s))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => { setMenuOpen(false) }, [pathname])

  const elevated = scrolled || variant === 'dark'

  return (
    <>
      <style>{`
        .pnav-link {
          display: inline-flex; align-items: center; gap: 0.3rem;
          color: var(--faint);
          font-family: var(--font-mono);
          font-size: 0.68rem;
          font-weight: 500;
          letter-spacing: 0.04em;
          padding: 0.38rem 0.7rem;
          border-radius: 6px;
          border: 1px solid transparent;
          transition: color 0.12s, background 0.12s, border-color 0.12s;
          white-space: nowrap;
          text-decoration: none;
        }
        .pnav-link:hover {
          color: var(--white);
          background: rgba(255,255,255,0.05);
          border-color: rgba(30,42,61,0.7);
        }
        .pnav-link.active {
          color: var(--white);
          background: rgba(79,140,255,0.1);
          border-color: rgba(79,140,255,0.2);
        }
        .pnav-cta {
          display: inline-flex; align-items: center; gap: 0.4rem;
          padding: 0.42rem 1rem;
          border-radius: 7px;
          font-family: var(--font-mono);
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          background: linear-gradient(135deg, var(--blue3), var(--blue));
          color: var(--white);
          border: none;
          cursor: pointer;
          transition: opacity 0.14s, transform 0.14s;
          white-space: nowrap;
          text-decoration: none;
          box-shadow: 0 2px 10px rgba(79,140,255,0.28);
        }
        .pnav-cta:hover { opacity: 0.88; transform: translateY(-1px); }
        .pnav-signin {
          display: inline-flex; align-items: center;
          padding: 0.42rem 0.85rem;
          border-radius: 7px;
          font-family: var(--font-mono);
          font-size: 0.68rem;
          font-weight: 600;
          color: var(--muted);
          border: 1px solid var(--border);
          background: transparent;
          text-decoration: none;
          transition: all 0.12s;
          white-space: nowrap;
        }
        .pnav-signin:hover { color: var(--white); border-color: var(--border2); background: var(--bg3); }
        @media(max-width:760px){
          .pnav-desktop { display: none !important; }
          .pnav-mobile-btn { display: flex !important; }
        }
      `}</style>

      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: 52,
        display: 'flex', alignItems: 'center',
        padding: '0 1.25rem',
        background: elevated ? 'rgba(6,17,31,0.92)' : 'rgba(6,17,31,0.05)',
        borderBottom: `1px solid ${elevated ? 'rgba(30,42,61,0.8)' : 'transparent'}`,
        backdropFilter: elevated ? 'blur(24px) saturate(160%)' : 'none',
        transition: 'all 0.22s ease',
      }}>
        {/* Left: Logo + market status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 7, textDecoration: 'none' }}>
            <img src="/transparent_logo.png" alt="ASE" style={{ height: 26, width: 'auto', objectFit: 'contain' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, color: 'var(--white)', letterSpacing: '0.08em', opacity: 0.9 }}>ASE</span>
          </Link>
          {/* separator */}
          <div style={{ width: 1, height: 14, background: 'var(--border2)' }} className="pnav-desktop" />
          {/* market + time */}
          <div className="pnav-desktop" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--faint)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--faint)', letterSpacing: '0.06em' }}>CLOSED</span>
            {time && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--faint)', opacity: 0.6 }}>{time}</span>}
          </div>
        </div>

        {/* Center spacer */}
        <div style={{ flex: 1 }} />

        {/* Right: Auth actions */}
        <div className="pnav-desktop" style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {authed ? (
            <Link href="/dashboard" className="pnav-cta">
              Dashboard
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
          ) : (
            <>
              <Link href="/#waitlist" className="pnav-link">Join Waitlist</Link>
              <Link href="/login" className="pnav-signin">Sign In</Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <div style={{ marginLeft: 'auto' }}>
          <button
            className="pnav-mobile-btn"
            onClick={() => setMenuOpen(v => !v)}
            style={{ display: 'none', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 7, padding: '0.35rem 0.45rem', color: 'var(--muted)', cursor: 'pointer', alignItems: 'center', justifyContent: 'center' }}
            aria-label="Toggle menu"
          >
            {menuOpen
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
            }
          </button>
        </div>
      </nav>

      {/* Mobile dropdown */}
      {menuOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 98, backdropFilter: 'blur(6px)' }} onClick={() => setMenuOpen(false)} />
          <div style={{ position: 'fixed', top: 52, left: 0, right: 0, zIndex: 99, background: 'rgba(6,17,31,0.98)', borderBottom: '1px solid var(--border)', backdropFilter: 'blur(24px)', padding: '0.6rem 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {authed
                ? <Link href="/dashboard" className="pnav-cta" style={{ justifyContent: 'center', padding: '0.65rem 1rem' }}>Dashboard →</Link>
                : <>
                    <Link href="/#waitlist" className="pnav-cta" style={{ justifyContent: 'center', padding: '0.65rem 1rem' }}>Join Waitlist →</Link>
                    <Link href="/login" style={{ display: 'block', textAlign: 'center', padding: '0.6rem', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--muted)', textDecoration: 'none' }}>Sign In</Link>
                  </>
              }
            </div>
          </div>
        </>
      )}
    </>
  )
}
