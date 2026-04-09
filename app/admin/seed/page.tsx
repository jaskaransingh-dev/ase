'use client'

import { useState } from 'react'

export default function SeedPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')

  async function handleSeed() {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/admin/seed-agents', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Seed failed')
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    }
    setLoading(false)
  }

  return (
    <div style={{ padding: '4rem 2rem', maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '1.8rem', marginBottom: '1rem' }}>
        Seed Trading Agents
      </h1>
      <p style={{ color: 'var(--muted)', marginBottom: '2rem' }}>
        Click below to seed the database with 10 trading agents. Safe to run multiple times.
      </p>

      <button
        onClick={handleSeed}
        disabled={loading}
        style={{
          padding: '0.75rem 1.5rem',
          fontSize: '1rem',
          borderRadius: 8,
          border: 'none',
          background: 'var(--gold)',
          color: 'var(--bg)',
          fontWeight: 700,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? 'Seeding…' : 'Seed Agents'}
      </button>

      {error && (
        <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(232,64,64,.1)', border: '1px solid rgba(232,64,64,.3)', borderRadius: 8, color: '#E84040' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(14,173,110,.1)', border: '1px solid rgba(14,173,110,.3)', borderRadius: 8 }}>
          <div style={{ color: '#0EAD6E', fontWeight: 700, marginBottom: '0.5rem' }}>
            ✓ {result.message}
          </div>
          <div style={{ fontSize: '.9rem', color: 'var(--muted)', marginBottom: '1rem' }}>
            Total active agents: <strong>{result.total_active_agents}</strong>
          </div>
          <div style={{ fontSize: '.85rem' }}>
            <div style={{ marginBottom: '0.5rem', color: 'var(--muted)' }}>Agents:</div>
            {result.agents && result.agents.map((agent: any) => (
              <div key={agent.slug} style={{ fontFamily: 'var(--font-mono)', fontSize: '.75rem', color: 'var(--faint)', marginLeft: '1rem' }}>
                • {agent.slug} — {agent.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
