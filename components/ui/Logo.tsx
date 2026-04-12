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
  const sizeConfig = {
    small: { fontSize: '1rem' },
    medium: { fontSize: '1.5rem' },
    large: { fontSize: '2rem' }
  }

  const config = sizeConfig[size]

  const LogoContent = (
    <div 
      className={className}
      style={{
        fontFamily: 'var(--font-serif)',
        fontWeight: 700,
        color: 'var(--white)',
        display: 'flex',
        alignItems: 'center',
        letterSpacing: '-0.04em',
        ...config,
        ...style
      }}
    >
      ase
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
