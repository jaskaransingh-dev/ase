'use client'

export default function LoadingState({ fullHeight = true }: { fullHeight?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
      minHeight: fullHeight ? 'calc(100vh - 8rem)' : 'auto',
      padding: '2rem',
    }}>
      {/* Header skeleton */}
      <div style={{
        height: '2rem',
        background: 'var(--bg3)',
        borderRadius: 'var(--radius)',
        animation: 'shimmer 2s infinite',
        width: '30%',
      }} />

      {/* Content skeleton - multiple cards */}
      {[...Array(3)].map((_, i) => (
        <div key={i} style={{
          padding: '1.5rem',
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          display: 'flex',
          gap: '1rem',
          animation: `shimmer 2s infinite ${i * 0.1}s`,
        }}>
          {/* Avatar skeleton */}
          <div style={{
            width: 60,
            height: 60,
            borderRadius: '50%',
            background: 'var(--bg3)',
            flexShrink: 0,
          }} />

          {/* Text skeleton */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{
              height: '1rem',
              background: 'var(--bg3)',
              borderRadius: 'var(--radius-xs)',
              width: '40%',
            }} />
            <div style={{
              height: '0.75rem',
              background: 'var(--bg3)',
              borderRadius: 'var(--radius-xs)',
              width: '60%',
            }} />
            <div style={{
              height: '0.75rem',
              background: 'var(--bg3)',
              borderRadius: 'var(--radius-xs)',
              width: '45%',
            }} />
          </div>
        </div>
      ))}

      <style jsx global>{`
        @keyframes shimmer {
          0% { opacity: 0.6; }
          50% { opacity: 1; }
          100% { opacity: 0.6; }
        }
      `}</style>
    </div>
  )
}
