'use client'

import Link from 'next/link'

const C = {
  bg: '#0B1728', surface: '#101A2D', surface2: '#162438', surface3: '#1E2A3D',
  border: 'rgba(79, 140, 255, 0.1)', borderActive: 'rgba(79, 140, 255, 0.3)',
  text: '#F5F8FC', text2: '#D9E3F1', muted: '#7F8CA3', faint: '#55657A',
  orange: '#F59E0B', violet: '#8B5CF6', purple: '#A78BFA', blue: '#4F8CFF',
  green: '#16C784', red: '#E45867', amber: '#F59E0B', cyan: '#6DD3FF',
}

const docsSections = [
  {
    title: 'Getting Started',
    items: [
      { label: 'Quick Start Guide', desc: 'Build your first agent in 5 minutes' },
      { label: 'Understanding the Lab', desc: 'How the AI agent builder works' },
      { label: 'Strategy Templates', desc: 'Pre-built strategies to customize' },
    ],
  },
  {
    title: 'Building Blocks',
    items: [
      { label: 'Data Sources', desc: 'Binance, CoinGecko, on-chain data' },
      { label: 'Indicators', desc: 'RSI, MACD, Bollinger Bands, EMA' },
      { label: 'ML Models', desc: 'Gradient Boosted, LSTM, HMM Regime' },
      { label: 'Risk Management', desc: 'Kill Switch, Risk Parity, TWAP/VWAP' },
    ],
  },
  {
    title: 'Alpha Strategies',
    items: [
      { label: 'Momentum', desc: 'Trend-following with EMA crosses' },
      { label: 'Mean Reversion', desc: 'RSI, Z-Score, Bollinger bounce' },
      { label: 'Composite', desc: 'Multi-signal blend strategies' },
    ],
  },
  {
    title: 'Backtesting',
    items: [
      { label: 'Quick Mode', desc: 'Fast 3-month simulation' },
      { label: 'Full Mode', desc: 'Comprehensive 2-year backtest' },
      { label: 'Walk-Forward', desc: 'Rolling train/test validation' },
    ],
  },
  {
    title: 'Publishing & Trading',
    items: [
      { label: 'Publishing to Exchange', desc: 'List your agent on the marketplace' },
      { label: 'Paper Trading', desc: 'Simulated trading with real market data' },
      { label: 'Subscription Tiers', desc: 'Free, Pro, and institutional plans' },
    ],
  },
]

export default function DocsPage() {
  return (
    <div style={{ padding: '1.5rem', height: '100%', overflow: 'auto', background: C.bg, color: C.text, fontFamily: 'var(--font-sans)' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <Link href="/dashboard/lab" style={{ fontSize: '0.55rem', color: C.blue, textDecoration: 'none', marginBottom: 8, display: 'inline-block' }}>← Back to Build</Link>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 8 }}>Quant Lab Documentation</div>
          <div style={{ fontSize: '0.85rem', color: C.muted }}>Learn how to build, backtest, and deploy trading agents</div>
        </div>

        {docsSections.map((section, i) => (
          <div key={i} style={{ marginBottom: '1.5rem', padding: '1rem', background: C.surface, borderRadius: 10, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: C.blue, letterSpacing: '0.1em', marginBottom: '0.75rem', textTransform: 'uppercase' }}>{section.title}</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {section.items.map((item, j) => (
                <button key={j} style={{ textAlign: 'left', padding: '0.6rem 0.75rem', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: C.text, marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: '0.62rem', color: C.muted }}>{item.desc}</div>
                </button>
              ))}
            </div>
          </div>
        ))}

        <div style={{ marginTop: '2rem', padding: '1rem', background: `${C.violet}10`, borderRadius: 10, border: `1px solid ${C.violet}30` }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: C.violet, marginBottom: 6 }}>Need More Help?</div>
          <div style={{ fontSize: '0.65rem', color: C.muted, lineHeight: 1.5 }}>
            Join our Discord community or email support@ase.io for assistance.
          </div>
        </div>
      </div>
    </div>
  )
}