import React from 'react'
import Link from 'next/link'

interface LogoProps {
  size?: 'small' | 'medium' | 'large'
  variant?: 'full' | 'icon'
  className?: string
  style?: React.CSSProperties
  showLink?: boolean
}

export const Logo: React.FC<LogoProps> = ({
  size = 'medium',
  variant = 'full',
  className = '',
  style = {},
  showLink = true
}) => {
  const dim = { small: 26, medium: 34, large: 48 }[size]

  const LogoContent = (
    <div
      className={className}
      style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', ...style }}
    >
      {/* Mark: two overlapping bars + diagonal accent — abstract "A" for ASE */}
      <svg
        width={dim}
        height={dim}
        viewBox="0 0 36 36"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="ase-grad" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4F8CFF" />
            <stop offset="55%" stopColor="#6BA3FF" />
            <stop offset="100%" stopColor="#16C784" />
          </linearGradient>
          <linearGradient id="ase-grad2" x1="0" y1="36" x2="36" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#16C784" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#4F8CFF" stopOpacity="0.3" />
          </linearGradient>
        </defs>
        {/* Background tile */}
        <rect width="36" height="36" rx="9" fill="url(#ase-grad2)" />
        {/* Left bar */}
        <rect x="7" y="9" width="5" height="18" rx="2.5" fill="url(#ase-grad)" />
        {/* Right bar */}
        <rect x="24" y="9" width="5" height="18" rx="2.5" fill="url(#ase-grad)" />
        {/* Cross bar — mid, creates "A" crossbar */}
        <rect x="9.5" y="17.5" width="17" height="4" rx="2" fill="url(#ase-grad)" />
        {/* Top diagonal left */}
        <path d="M7 27 L18 9" stroke="url(#ase-grad)" strokeWidth="5" strokeLinecap="round" />
        {/* Top diagonal right */}
        <path d="M29 27 L18 9" stroke="url(#ase-grad)" strokeWidth="5" strokeLinecap="round" />
        {/* Crossbar */}
        <rect x="11" y="19" width="14" height="3.5" rx="1.75" fill="#0B1728" opacity="0.6" />
        <rect x="11" y="19" width="14" height="3.5" rx="1.75" fill="url(#ase-grad)" opacity="0.9" />
      </svg>

      {variant === 'full' && (
        <span style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 800,
          fontSize: `${dim * 0.62}px`,
          letterSpacing: '-0.05em',
          background: 'linear-gradient(135deg, var(--white) 0%, var(--blue2) 60%, var(--mint) 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          lineHeight: 1,
        }}>
          ASE
        </span>
      )}
    </div>
  )

  if (showLink) {
    return (
      <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
        {LogoContent}
      </Link>
    )
  }

  return LogoContent
}
