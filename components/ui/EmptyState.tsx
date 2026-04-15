'use client'

export default function EmptyState({
  icon,
  title,
  description,
  action,
  children,
}: {
  icon?: string
  title: string
  description?: string
  action?: { label: string; href: string }
  children?: React.ReactNode
}) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '3rem 2rem',
      textAlign: 'center',
      minHeight: '300px',
    }}>
      {icon && (
        <div style={{
          fontSize: '3rem',
          marginBottom: '1rem',
          opacity: 0.5,
        }}>
          {icon}
        </div>
      )}

      <h3 style={{
        fontFamily: 'var(--font-body)',
        fontSize: '1.25rem',
        fontWeight: 600,
        color: 'var(--white)',
        marginBottom: '0.5rem',
      }}>
        {title}
      </h3>

      {description && (
        <p style={{
          color: 'var(--text)',
          marginBottom: '1.5rem',
          maxWidth: 400,
          fontSize: '0.95rem',
          lineHeight: 1.6,
        }}>
          {description}
        </p>
      )}

      {action && (
        <a href={action.href} className="btn-primary" style={{
          padding: '0.7rem 1.5rem',
          fontSize: '0.9rem',
          borderRadius: 'var(--radius)',
          display: 'inline-block',
          marginBottom: '1rem',
        }}>
          {action.label}
        </a>
      )}

      {children}
    </div>
  )
}
