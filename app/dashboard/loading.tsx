export default function DashboardLoading() {
  return (
    <div style={{
      padding: '2rem',
      maxWidth: 1200,
      margin: '0 auto',
      minHeight: '100vh',
      animation: 'fadeIn .3s ease both',
    }}>
      {/* Header skeleton */}
      <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <div className="skeleton" style={{ height: 14, width: 140, margin: '0 auto .5rem' }} />
        <div className="skeleton" style={{ height: 28, width: 280, margin: '0 auto' }} />
      </div>

      {/* Stats strip skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginBottom: '2rem' }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="skeleton-stat skeleton" style={{ padding: '1.25rem 1.5rem' }}>
            <div style={{ opacity: 0 }}>.</div>
          </div>
        ))}
      </div>

      {/* Main content skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem' }}>
        <div>
          <div className="skeleton" style={{ height: 20, width: 150, marginBottom: '1rem' }} />
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton-card skeleton" style={{ marginBottom: '.75rem' }} />
          ))}
        </div>
        <div>
          <div className="skeleton" style={{ height: 20, width: 130, marginBottom: '1rem' }} />
          <div className="skeleton" style={{ height: 300, borderRadius: 16 }} />
        </div>
      </div>

      <style>{`
        @media(max-width:900px){
          div[style*="grid-template-columns: repeat(4"]{grid-template-columns:repeat(2,1fr)!important}
          div[style*="grid-template-columns: 1fr 380px"]{grid-template-columns:1fr!important}
        }
      `}</style>
    </div>
  )
}
