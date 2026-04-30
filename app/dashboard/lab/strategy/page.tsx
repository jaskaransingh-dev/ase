'use client'
import { useState } from 'react'

const C = { bg: '#0B1728', surface: '#101A2D', surface2: '#162438', border: 'rgba(79, 140, 255, 0.1)', text: '#F5F8FC', textMuted: '#7F8CA3', textFaint: '#55657A' }
const TYP = { mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', header: 'var(--font-display)' }
const RAD = { sm: 4 }
const ACC = { primary: '#4F8CFF', primaryDark: '#2563EB' }

export default function StrategyPage() {
  const [code, setCode] = useState(`// Strategy code editor
// Write your trading strategy here

import { Signal, Position } from '@/lib/strategy'

export function calculateSignal(data: MarketData): Signal {
  // Your logic here
  return { direction: 'long', strength: 0.8 }
}
`)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.surface }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 1rem', height: 48, borderBottom: '1px solid ' + C.border, background: C.surface, flexShrink: 0 }}>
        <span style={{ fontSize: '0.52rem', letterSpacing: '0.25em', color: ACC.primary, fontFamily: TYP.mono, textTransform: 'uppercase' }}>Strategy</span>
        <span style={{ color: C.textFaint }}>·</span>
        <span style={{ fontSize: '0.75rem', color: C.textMuted, fontFamily: TYP.mono }}>strategy.ts</span>
        <div style={{ flex: 1 }} />
        <button style={{ padding: '0.25rem 0.6rem', background: C.surface2, border: '1px solid ' + C.border, borderRadius: RAD.sm, color: C.textMuted, fontSize: '0.55rem', fontFamily: TYP.mono, cursor: 'pointer' }}>Save</button>
      </div>
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        style={{ flex: 1, background: C.bg, color: C.text, border: 'none', padding: '1rem', fontFamily: TYP.mono, fontSize: '0.8rem', lineHeight: 1.6, resize: 'none', outline: 'none' }}
        spellCheck={false}
      />
    </div>
  )
}