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
  const sizes = {
    small: { height: 28 },
    medium: { height: 40 },
    large: { height: 56 }
  }

  const config = sizes[size]

  const LogoContent = (
    <div 
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        ...style
      }}
    >
      <Image
        src="/transparent_logo.png"
        alt="ASE"
        height={config.height}
        width={config.height * 2}
        style={{ 
          height: config.height, 
          width: 'auto',
          display: 'block',
        }}
        priority
      />
      {variant === 'full' && (
        <span style={{
          fontFamily: 'var(--font-head)',
          fontWeight: 900,
          fontSize: `${config.height * 0.55}px`,
          letterSpacing: '-0.02em',
          marginLeft: '0.5rem',
          background: 'linear-gradient(135deg, var(--ivory) 0%, var(--gold) 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          ASE<span style={{ color: 'var(--gold)', WebkitTextFillColor: 'var(--gold)' }}>.</span>
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
