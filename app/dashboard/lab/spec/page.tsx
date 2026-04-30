'use client'
import { useState } from 'react'

const C = { bg: '#0B1728', surface: '#101A2D', surface2: '#162438', border: 'rgba(79, 140, 255, 0.1)', text: '#F5F8FC', textMuted: '#7F8CA3', textFaint: '#55657A' }
const TYP = { mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }
const RAD = { sm: 4 }
const ACC = { primary: '#4F8CFF' }

export default function SpecPage() {
  const [spec, setSpec] = useState(`{
  "name": "momentum_v1",
  "alpha_type": "momentum",
  "symbols": ["BTC-USD", "ETH-USD"],
  "lookback": 20,
  "threshold": 0.02,
  "risk_aversion": 5,
  "rebalance_freq": "daily"
}`)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.surface }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 1rem', height: 48, borderBottom: '1px solid ' + C.border, background: C.surface, flexShrink: 0 }}>
        <span style={{ fontSize: '0.52rem', letterSpacing: '0.25em', color: ACC.primary, fontFamily: TYP.mono, textTransform: 'uppercase' }}>Spec</span>
        <span style={{ color: C.textFaint }}>·</span>
        <span style={{ fontSize: '0.75rem', color: C.textMuted, fontFamily: TYP.mono }}>spec.json</span>
        <div style={{ flex: 1 }} />
        <button style={{ padding: '0.25rem 0.6rem', background: C.surface2, border: '1px solid ' + C.border, borderRadius: RAD.sm, color: C.textMuted, fontSize: '0.55rem', fontFamily: TYP.mono, cursor: 'pointer' }}>Validate</button>
        <button style={{ padding: '0.25rem 0.6rem', background: ACC.primary + '18', border: '1px solid ' + ACC.primary, borderRadius: RAD.sm, color: ACC.primary, fontSize: '0.55rem', fontFamily: TYP.mono, cursor: 'pointer' }}>Apply</button>
      </div>
      <textarea
        value={spec}
        onChange={(e) => setSpec(e.target.value)}
        style={{ flex: 1, background: C.bg, color: C.text, border: 'none', padding: '1rem', fontFamily: TYP.mono, fontSize: '0.8rem', lineHeight: 1.6, resize: 'none', outline: 'none' }}
        spellCheck={false}
      />
    </div>
  )
}