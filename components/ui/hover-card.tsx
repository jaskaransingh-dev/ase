'use client'
import { ReactNode, MouseEvent } from 'react'
import Link from 'next/link'

interface HoverCardProps {
  href?: string
  children: ReactNode
  className?: string
  style?: React.CSSProperties
  asLink?: boolean
}

export function HoverCard({ href, children, className = '', style = {}, asLink = false }: HoverCardProps) {
  const baseStyle = {
    transition: 'border-color .2s, transform .2s, box-shadow .2s',
    border: '1px solid var(--border)',
    ...style
  }

  const handleMouseEnter = (e: MouseEvent<HTMLElement>) => {
    const el = e.currentTarget as HTMLElement
    el.style.transform = 'translateY(-4px)'
    el.style.borderColor = 'rgba(232,172,32,.25)'
    if (style.boxShadow) el.style.boxShadow = '0 20px 60px rgba(0,0,0,.4)'
  }

  const handleMouseLeave = (e: MouseEvent<HTMLElement>) => {
    const el = e.currentTarget as HTMLElement
    el.style.transform = ''
    el.style.borderColor = ''
    el.style.boxShadow = ''
  }

  if (asLink && href) {
    return (
      <Link href={href} className={className} style={baseStyle} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
        {children}
      </Link>
    )
  }

  return (
    <div className={className} style={baseStyle} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {children}
    </div>
  )
}
