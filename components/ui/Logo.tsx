import React from 'react'

interface LogoProps {
  size?: 'small' | 'medium' | 'large'
  variant?: 'full' | 'icon'
  className?: string
  style?: React.CSSProperties
}

export const Logo: React.FC<LogoProps> = ({ 
  size = 'medium', 
  variant = 'full', 
  className = '',
  style = {}
}) => {
  const sizeConfig = {
    small: { fontSize: '1rem', letterSpacing: '0.1em' },
    medium: { fontSize: '1.5rem', letterSpacing: '0.12em' },
    large: { fontSize: '2rem', letterSpacing: '0.15em' }
  }

  const config = sizeConfig[size]

  if (variant === 'icon') {
    return (
      <div 
        className={className}
        style={{
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          color: 'var(--ivory)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...config,
          ...style
        }}
      >
        <div style={{
          width: size === 'small' ? '24px' : size === 'medium' ? '32px' : '40px',
          height: size === 'small' ? '24px' : size === 'medium' ? '32px' : '40px',
          background: 'linear-gradient(135deg, var(--blue) 0%, var(--purple) 100%)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size === 'small' ? '14px' : size === 'medium' ? '18px' : '24px',
          color: 'white',
          fontWeight: 800,
        }}>
          ASE
        </div>
      </div>
    )
  }

  return (
    <div 
      className={className}
      style={{
        fontFamily: 'var(--font-mono)',
        fontWeight: 700,
        color: 'var(--ivory)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        ...config,
        ...style
      }}
    >
      <div style={{
        width: size === 'small' ? '20px' : size === 'medium' ? '28px' : '36px',
        height: size === 'small' ? '20px' : size === 'medium' ? '28px' : '36px',
        background: 'linear-gradient(135deg, var(--blue) 0%, var(--purple) 100%)',
        borderRadius: '6px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size === 'small' ? '10px' : size === 'medium' ? '14px' : '18px',
        color: 'white',
        fontWeight: 800,
      }}>
        A
      </div>
      <span>ASE</span>
    </div>
  )
}
