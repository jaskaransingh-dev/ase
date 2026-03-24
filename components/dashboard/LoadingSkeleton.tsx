export function StatsGridSkeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem' }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{ 
          height: 80, 
          background: 'var(--bg2)', 
          border: '1px solid var(--border)', 
          borderRadius: 16,
          animation: 'pulse 1.5s ease-in-out infinite'
        }} />
      ))}
    </div>
  )
}

export function HoldingsSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} style={{ 
          height: 100, 
          background: 'var(--bg2)', 
          border: '1px solid var(--border)', 
          borderRadius: 16,
          padding: '1.25rem 1.5rem',
          animation: 'pulse 1.5s ease-in-out infinite'
        }} />
      ))}
    </div>
  )
}

export function TransactionsSkeleton() {
  return (
    <div style={{ 
      background: 'var(--bg2)', 
      border: '1px solid var(--border)', 
      borderRadius: 16,
      height: 300
    }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{
          height: 60,
          borderBottom: '1px solid var(--border)',
          animation: 'pulse 1.5s ease-in-out infinite'
        }} />
      ))}
    </div>
  )
}

export function NavSkeleton() {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      height: 64,
      background: 'rgba(7,9,15,.95)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.75rem 1.5rem'
    }}>
      <div style={{ width: 50, height: 30, background: 'var(--bg2)', borderRadius: 4, animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ display: 'flex', gap: '1rem' }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ width: 80, height: 20, background: 'var(--bg2)', borderRadius: 4, animation: 'pulse 1.5s ease-in-out infinite' }} />
        ))}
      </div>
      <div style={{ width: 100, height: 30, background: 'var(--bg2)', borderRadius: 20, animation: 'pulse 1.5s ease-in-out infinite' }} />
    </div>
  )
}

// Add pulse animation to globals.css later if needed

