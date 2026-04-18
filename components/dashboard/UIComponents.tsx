'use client'

import Link from 'next/link'

interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: '.25rem', color: 'var(--blue)' }}>PORTFOLIO</div>
        <h1 style={{ fontFamily: 'var(--font-body)', fontSize: '1.7rem', fontWeight: 800, letterSpacing: '-.03em', color: 'var(--white)', marginBottom: '0.25rem' }}>
          {title}
        </h1>
        {subtitle && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--muted)', letterSpacing: '0.08em' }}>
            {subtitle}
          </div>
        )}
      </div>
      {actions && <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  )
}

interface StatCardProps {
  label: string
  value: string
  sub?: string
  color?: string
  onClick?: () => void
}

export function StatCard({ label, value, sub, color = 'var(--white)', onClick }: StatCardProps) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '1rem 1.1rem',
        boxShadow: '0 16px 32px rgba(15,23,42,.04)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--faint)', letterSpacing: '0.12em', marginBottom: '0.45rem', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: '1.2rem', color, letterSpacing: '-0.02em' }}>
        {value}
      </div>
      {sub && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--faint)', marginTop: '0.25rem' }}>{sub}</div>}
    </div>
  )
}

interface CardProps {
  title?: string
  children: React.ReactNode
  noPadding?: boolean
}

export function Card({ title, children, noPadding }: CardProps) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: '0 18px 40px rgba(15,23,42,.04)' }}>
      {title && (
        <div style={{ padding: '0.8rem 1.1rem', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 700, color: 'var(--faint)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            {title}
          </div>
        </div>
      )}
      <div style={noPadding ? {} : { padding: '0.75rem' }}>
        {children}
      </div>
    </div>
  )
}

interface EmptyStateProps {
  icon: string
  title: string
  description: string
  action?: { label: string; href: string }
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div style={{ padding: '3rem 2rem', textAlign: 'center' }}>
      <div style={{ fontSize: '2rem', marginBottom: '0.75rem', opacity: 0.35 }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--white)', marginBottom: '0.3rem' }}>{title}</div>
      <div style={{ fontSize: '0.84rem', color: 'var(--muted)', marginBottom: action ? '1rem' : 0, lineHeight: 1.6 }}>{description}</div>
      {action && (
        <Link href={action.href} className="btn-secondary" style={{ fontSize: '0.82rem', padding: '0.55rem 1rem' }}>
          {action.label}
        </Link>
      )}
    </div>
  )
}

interface DataTableProps {
  columns: { key: string; label: string; align?: 'left' | 'right' }[]
  data: Record<string, unknown>[]
  renderRow: (item: Record<string, unknown>, i: number) => React.ReactNode
  emptyIcon?: string
  emptyTitle?: string
  emptyDescription?: string
}

export function DataTable({ columns, data, renderRow, emptyIcon, emptyTitle, emptyDescription }: DataTableProps) {
  if (data.length === 0 && emptyTitle) {
    return (
      <Card>
        <EmptyState icon={emptyIcon || '📊'} title={emptyTitle} description={emptyDescription || ''} />
      </Card>
    )
  }

  return (
    <Card noPadding>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {columns.map(col => (
              <th
                key={col.key}
                style={{
                  padding: '0.7rem 1rem',
                  textAlign: col.align || 'left',
                  color: 'var(--faint)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.55rem',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item, i) => renderRow(item, i))}
        </tbody>
      </table>
    </Card>
  )
}

interface TabsProps {
  tabs: { id: string; label: string; count?: number }[]
  activeTab: string
  onChange: (id: string) => void
}

export function Tabs({ tabs, activeTab, onChange }: TabsProps) {
  return (
    <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          style={{
            padding: '0.7rem 1rem',
            borderRadius: '12px 12px 0 0',
            border: 'none',
            background: activeTab === tab.id ? 'var(--bg2)' : 'transparent',
            color: activeTab === tab.id ? 'var(--white)' : 'var(--muted)',
            fontSize: '0.82rem',
            fontWeight: 700,
            cursor: 'pointer',
            borderBottom: activeTab === tab.id ? '2px solid var(--blue)' : '2px solid transparent',
            marginBottom: '-1px',
          }}
        >
          {tab.label}
          {tab.count !== undefined && <span style={{ opacity: 0.55, marginLeft: 4 }}>({tab.count})</span>}
        </button>
      ))}
    </div>
  )
}

interface BadgeProps {
  children: React.ReactNode
  color?: string
  bgColor?: string
}

export function Badge({ children, color = 'var(--white)', bgColor = 'var(--bg3)' }: BadgeProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.55rem',
        fontWeight: 700,
        color,
        background: bgColor,
        border: `1px solid ${color}22`,
        borderRadius: 999,
        padding: '0.22rem 0.55rem',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </span>
  )
}

interface ButtonProps {
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  onClick?: () => void
  href?: string
  disabled?: boolean
  icon?: React.ReactNode
}

export function Button({ children, variant = 'primary', size = 'md', onClick, href, disabled, icon }: ButtonProps) {
  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    borderRadius: 12,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    textDecoration: 'none',
    border: '1px solid transparent',
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap',
  }

  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { padding: '0.42rem 0.8rem', fontSize: '0.75rem' },
    md: { padding: '0.55rem 1rem', fontSize: '0.82rem' },
    lg: { padding: '0.72rem 1.2rem', fontSize: '0.9rem' },
  }

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: { background: 'var(--blue)', color: '#fff' },
    secondary: { background: 'var(--bg2)', color: 'var(--white)', borderColor: 'var(--border)' },
    outline: { background: 'transparent', borderColor: 'var(--border)', color: 'var(--white)' },
    ghost: { background: 'transparent', color: 'var(--muted)' },
  }

  const style = { ...baseStyle, ...sizeStyles[size], ...variantStyles[variant], ...(disabled ? { opacity: 0.55 } : {}) }

  if (href) {
    return (
      <Link href={href} style={style}>
        {icon}
        {children}
      </Link>
    )
  }

  return (
    <button onClick={onClick} disabled={disabled} style={style}>
      {icon}
      {children}
    </button>
  )
}
