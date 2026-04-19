import React from 'react'
import Link from 'next/link'
import Image from 'next/image'

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
  const sizes = { small: 52, medium: 68, large: 92 }
  const dim = sizes[size]
  const logoPath = '/transparent_logo.png'

  const LogoContent = (
    <div
      className={className}
      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', ...style }}
    >
      <Image
        src={logoPath}
        alt="ASE"
        width={dim}
        height={dim}
        style={{ objectFit: 'contain' }}
        unoptimized
      />

      {variant === 'full' && (
        <span style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 800,
          fontSize: `${dim * 0.58}px`,
          letterSpacing: '-0.04em',
          color: 'var(--white)',
          lineHeight: 1,
          display: 'none',
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