'use client'
import React from 'react'

export default function Card({
  children,
  hoverable = false,
  className = '',
  style = {},
}: {
  children: React.ReactNode
  hoverable?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={className}
      style={{
        padding: '1.5rem',
        borderRadius: 'var(--radius)',
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        transition: 'all 0.2s ease',
        cursor: hoverable ? 'pointer' : 'default',
        ...style,
      }}
      onMouseEnter={hoverable ? (e: React.MouseEvent) => {
        const target = e.currentTarget as HTMLElement
        target.style.borderColor = 'var(--border2)'
        target.style.boxShadow = '0 8px 32px rgba(91, 140, 255, 0.15)'
      } : undefined}
      onMouseLeave={hoverable ? (e: React.MouseEvent) => {
        const target = e.currentTarget as HTMLElement
        target.style.borderColor = 'var(--border)'
        target.style.boxShadow = 'none'
      } : undefined}
    >
      {children}
    </div>
  )
}