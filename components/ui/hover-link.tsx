'use client'
import Link from 'next/link'
import { ReactNode } from 'react'

interface HoverLinkProps {
  href: string
  children: ReactNode
  className?: string
  style?: React.CSSProperties
  onClick?: () => void
}

export function HoverLink({ href, children, className = '', style = {}, onClick }: HoverLinkProps) {
  return (
    <Link
      href={href}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        textDecoration: 'none',
        transition: 'color .15s, transform .2s',
        ...style
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.color = 'var(--white)'
        el.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.color = 'var(--muted)'
        el.style.transform = ''
      }}
    >
      {children}
    </Link>
  )
}
