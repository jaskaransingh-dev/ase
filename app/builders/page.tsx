'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Logo } from '@/components/ui/Logo'

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.disconnect() }
    }, { threshold })
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return { ref: ref as React.RefObject<HTMLDivElement>, visible }
}

function BuildersPage() {
  const sectionRef = useInView()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--white)', fontFamily: 'var(--font-body)' }}>
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 2rem',
        background: 'rgba(7,17,31,.95)', borderBottom: '1px solid var(--border)',
        backdropFilter: 'blur(16px)',
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <Logo size="medium" />
        </Link>
        <div style={{ display: 'flex', gap: '1.25rem' }}>
          <Link href="/agents" style={{ fontSize: '.85rem', fontWeight: 500, color: 'var(--text)' }}>Marketplace</Link>
          <Link href="/investors" style={{ fontSize: '.85rem', fontWeight: 500, color: 'var(--text)' }}>Investors</Link>
          <Link href="/login" style={{ fontSize: '.85rem', color: 'var(--text)', fontWeight: 500 }}>Sign In</Link>
          <Link href="/signup" className="btn-primary" style={{ fontSize: '.85rem', padding: '0.6rem 1.25rem', borderRadius: 12 }}>Get Started</Link>
        </div>
      </nav>

      <section ref={sectionRef.ref} style={{
        minHeight: '100vh', padding: '8rem 2.5rem 4rem', display: 'flex', flexDirection: 'column', justifyContent: 'center',
        background: 'var(--bg)',
        opacity: sectionRef.visible ? 1 : 0,
        transform: sectionRef.visible ? 'translateY(0)' : 'translateY(40px)',
        transition: 'opacity 0.8s ease, transform 0.8s ease',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', width: '100%' }}>
          <div style={{ marginBottom: '3rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', letterSpacing: '.14em', color: 'var(--purple)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '.5rem' }}>
              For Builders
            </div>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: '1rem', color: 'var(--ivory)' }}>
              Backtest. Validate. List.
            </h1>
            <p style={{ fontSize: '1.1rem', color: 'var(--muted)', lineHeight: 1.6, maxWidth: 500, marginBottom: '2rem' }}>
              Backtest in Python. Validate performance. Submit for review. List on ASE. Complete pipeline from strategy to marketplace.
            </p>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <Link href="/dashboard/backtest" className="btn-primary" style={{ fontSize: '.9rem', padding: '.7rem 1.5rem' }}>Enter the Lab</Link>
              <Link href="/builders/submit" className="btn-secondary" style={{ fontSize: '.9rem', padding: '.7rem 1.5rem' }}>Submit Strategy</Link>
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            {[
              { title: 'Python Backtesting', desc: 'Historical data access + strategy testing' },
              { title: 'Benchmark Comparison', desc: 'vs BTC, ETH, SPY, custom baskets' },
              { title: 'Automated Review', desc: 'Quantitative integrity checks' },
              { title: 'Submission Pipeline', desc: 'End-to-end listing workflow' },
              { title: 'Profile Generation', desc: 'Auto-generated strategy profiles' },
              { title: 'API Access', desc: 'Programmatic execution controls' },
            ].map((cap, i) => (
              <div key={i} style={{
                padding: '1.5rem', borderRadius: 12,
                background: 'var(--bg2)', border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '.35rem', color: 'var(--white)' }}>{cap.title}</div>
                <div style={{ fontSize: '.85rem', color: 'var(--muted)' }}>{cap.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer style={{ padding: '2rem', borderTop: '1px solid var(--border)', background: 'var(--bg2)', textAlign: 'center' }}>
        <p style={{ fontSize: '.75rem', color: 'var(--faint)' }}>&copy; 2026 ase</p>
      </footer>
    </div>
  )
}

export default BuildersPage