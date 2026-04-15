'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function HeroSection() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    setIsVisible(true)
  }, [])

  return (
    <section style={{
      minHeight: '100vh',
      padding: '8rem 2.5rem 6rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background gradient orbs */}
      <div style={{
        position: 'absolute',
        top: '10%',
        left: '-5%',
        width: 600,
        height: 600,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(91, 140, 255, 0.06) 0%, transparent 70%)',
        filter: 'blur(100px)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute',
        bottom: '10%',
        right: '-5%',
        width: 500,
        height: 500,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(25, 230, 167, 0.04) 0%, transparent 70%)',
        filter: 'blur(100px)',
        pointerEvents: 'none',
      }} />

      <div style={{
        maxWidth: 900,
        width: '100%',
        textAlign: 'center',
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(40px)',
        transition: 'all 0.8s ease',
        zIndex: 1,
      }}>
        {/* Badge */}
        <div style={{
          display: 'inline-block',
          padding: '0.6rem 1.2rem',
          borderRadius: 'var(--radius-pill)',
          background: 'rgba(91, 140, 255, 0.1)',
          border: '1px solid rgba(91, 140, 255, 0.2)',
          marginBottom: '1.5rem',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.65rem',
          fontWeight: 600,
          color: 'var(--blue2)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          ✦ Verified Trading Agents
        </div>

        {/* Headline */}
        <h1 style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
          marginBottom: '1.5rem',
          color: 'var(--white)',
        }}>
          Algorithmic Trading Made Real
        </h1>

        {/* Subheading */}
        <p style={{
          fontSize: 'clamp(1rem, 3vw, 1.25rem)',
          color: 'var(--text)',
          lineHeight: 1.7,
          marginBottom: '2.5rem',
          maxWidth: 600,
          margin: '0 auto 2.5rem',
        }}>
          Invest in verified AI trading agents. Real capital, real trades, complete transparency. Watch algorithms work for you.
        </p>

        {/* CTA Buttons */}
        <div style={{
          display: 'flex',
          gap: '1rem',
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginBottom: '3rem',
        }}>
          <Link href="/agents" className="btn-primary" style={{
            padding: '0.9rem 2rem',
            fontSize: '0.95rem',
            fontWeight: 600,
            borderRadius: 'var(--radius)',
          }}>
            Explore Agents →
          </Link>
          <Link href="/signup" className="btn-secondary" style={{
            padding: '0.9rem 2rem',
            fontSize: '0.95rem',
            fontWeight: 600,
            borderRadius: 'var(--radius)',
          }}>
            Get Started Free
          </Link>
        </div>

        {/* Trust indicators */}
        <div style={{
          display: 'flex',
          gap: '2rem',
          justifyContent: 'center',
          flexWrap: 'wrap',
          padding: '1.5rem 0',
          borderTop: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
          fontSize: '0.85rem',
          color: 'var(--muted)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--mint)', fontSize: '1.2rem' }}>✓</span>
            Live Trading
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--mint)', fontSize: '1.2rem' }}>✓</span>
            100% Transparent
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--mint)', fontSize: '1.2rem' }}>✓</span>
            Real-Time Monitoring
          </div>
        </div>
      </div>
    </section>
  )
}
