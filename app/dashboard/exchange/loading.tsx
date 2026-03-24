export default function ExchangeLoading() {
  return (
    <div style={{
      padding: '2rem',
      maxWidth: 1200,
      margin: '0 auto',
      animation: 'fadeIn .3s ease both',
    }}>
      <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <div className="skeleton" style={{ height: 14, width: 120, margin: '0 auto .5rem' }} />
        <div className="skeleton" style={{ height: 28, width: 240, margin: '0 auto' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '1rem' }}>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="skeleton" style={{ height: 200, borderRadius: 16 }} />
        ))}
      </div>
    </div>
  )
}
