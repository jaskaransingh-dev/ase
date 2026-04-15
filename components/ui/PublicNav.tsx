'use client'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { Logo } from './Logo'

const navStyles = `
  .nav-links {
    display: flex;
    gap: 1.5rem;
    align-items: center;
  }
  @media (max-width: 640px) {
    .nav-links {
      display: none;
    }
  }
`

export default function PublicNav({ variant = 'default' }: { variant?: 'default' | 'dark' }) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: navStyles }} />
      <nav style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      height: 64,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 2rem',
      background: scrolled || variant === 'dark'
        ? 'rgba(7, 17, 31, 0.95)'
        : 'transparent',
      borderBottom: scrolled || variant === 'dark'
        ? '1px solid var(--border)'
        : 'none',
      backdropFilter: (scrolled || variant === 'dark') ? 'blur(16px)' : 'none',
      transition: 'all 0.3s ease',
    }}>
      {/* Logo */}
      <Logo size="medium" showLink />

      {/* Links */}
      <div className="nav-links">
        <Link href="/agents" style={{
          fontSize: '0.85rem',
          fontWeight: 500,
          color: 'var(--text)',
          transition: 'color 0.2s',
        }} onMouseEnter={e => e.currentTarget.style.color = 'var(--white)'}
           onMouseLeave={e => e.currentTarget.style.color = 'var(--text)'}>
          Marketplace
        </Link>
        <Link href="/builders" style={{
          fontSize: '0.85rem',
          fontWeight: 500,
          color: 'var(--text)',
          transition: 'color 0.2s',
        }} onMouseEnter={e => e.currentTarget.style.color = 'var(--white)'}
           onMouseLeave={e => e.currentTarget.style.color = 'var(--text)'}>
          Build
        </Link>
        <Link href="/investors" style={{
          fontSize: '0.85rem',
          fontWeight: 500,
          color: 'var(--text)',
          transition: 'color 0.2s',
        }} onMouseEnter={e => e.currentTarget.style.color = 'var(--white)'}
           onMouseLeave={e => e.currentTarget.style.color = 'var(--text)'}>
          Invest
        </Link>
        <Link href="/login" style={{
          fontSize: '0.85rem',
          color: 'var(--text)',
          fontWeight: 500,
          transition: 'color 0.2s',
        }} onMouseEnter={e => e.currentTarget.style.color = 'var(--white)'}
           onMouseLeave={e => e.currentTarget.style.color = 'var(--text)'}>
          Sign In
        </Link>
        <Link href="/signup" className="btn-primary" style={{
          fontSize: '0.85rem',
          padding: '0.6rem 1.25rem',
          borderRadius: 12,
          transition: 'all 0.2s',
        }}>
          Get Started
        </Link>
      </div>
    </nav>
    </>
  )
}
