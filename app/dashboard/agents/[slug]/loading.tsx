export default function AgentLoading() {
  return (
    <div style={{
      padding: '2rem',
      maxWidth: 1200,
      margin: '0 auto',
      minHeight: '100vh',
      animation: 'fadeIn .3s ease both',
    }}>
      {/* Back link skeleton */}
      <div className="skeleton" style={{ height: 14, width: 120, marginBottom: '1.5rem' }} />

      {/* Header skeleton */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <div className="skeleton" style={{ width: 48, height: 48, borderRadius: 12 }} />
        <div>
          <div className="skeleton" style={{ height: 24, width: 200, marginBottom: '.5rem' }} />
          <div className="skeleton" style={{ height: 14, width: 120 }} />
        </div>
      </div>

      {/* Tabs skeleton */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="skeleton" style={{ height: 36, width: 100, borderRadius: 8 }} />
        ))}
      </div>

      {/* Metrics row skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginBottom: '2rem' }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="skeleton" style={{ height: 90, borderRadius: 16 }} />
        ))}
      </div>

      {/* Chart skeleton */}
      <div className="skeleton" style={{ height: 300, borderRadius: 16, marginBottom: '2rem' }} />

      {/* Table skeleton */}
      <div className="skeleton" style={{ height: 200, borderRadius: 16 }} />
    </div>
  )
}
