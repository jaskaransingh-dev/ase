'use client'
import { useState } from 'react'

const C = { bg: '#0B1728', surface: '#101A2D', surface2: '#162438', border: 'rgba(79, 140, 255, 0.1)', text: '#F5F8FC', textMuted: '#7F8CA3', textFaint: '#55657A' }
const TYP = { mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }
const RAD = { sm: 4, md: 8 }
const ACC = { primary: '#4F8CFF' }

const PIPELINE_STAGES = [
  { id: 'ingest', label: 'Ingest', status: 'complete' },
  { id: 'compute', label: 'Compute', status: 'complete' },
  { id: 'signal', label: 'Signal', status: 'running' },
  { id: 'optimize', label: 'Optimize', status: 'pending' },
  { id: 'execute', label: 'Execute', status: 'pending' },
]

export default function PipelinePage() {
  const [logs, setLogs] = useState([
    { time: '14:32:01', msg: 'Pipeline initialized' },
    { time: '14:32:02', msg: 'Fetching OHLCV data for 5 symbols' },
    { time: '14:32:05', msg: 'Computing 12 indicators' },
    { time: '14:32:08', msg: 'Generating signals: 3 long, 1 short' },
    { time: '14:32:10', msg: 'Running optimization...' },
  ])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.surface, padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.5rem' }}>
        <span style={{ fontSize: '0.52rem', letterSpacing: '0.25em', color: ACC.primary, fontFamily: TYP.mono, textTransform: 'uppercase' }}>Pipeline</span>
        <div style={{ flex: 1 }} />
        <button style={{ padding: '0.25rem 0.6rem', background: ACC.primary + '18', border: '1px solid ' + ACC.primary, borderRadius: RAD.sm, color: ACC.primary, fontSize: '0.55rem', fontFamily: TYP.mono, cursor: 'pointer' }}>Run</button>
        <button style={{ padding: '0.25rem 0.6rem', background: C.surface2, border: '1px solid ' + C.border, borderRadius: RAD.sm, color: C.textMuted, fontSize: '0.55rem', fontFamily: TYP.mono, cursor: 'pointer' }}>Clear</button>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {PIPELINE_STAGES.map((stage, i) => (
          <div key={stage.id} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '0.75rem', background: C.surface2, borderRadius: RAD.sm, border: '1px solid ' + (stage.status === 'running' ? ACC.primary : stage.status === 'complete' ? '#10B981' : C.border) }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: stage.status === 'complete' ? '#10B981' : stage.status === 'running' ? ACC.primary : C.textFaint }} />
            <span style={{ fontSize: '0.65rem', fontFamily: TYP.mono, color: C.textMuted }}>{stage.label}</span>
            {i < PIPELINE_STAGES.length - 1 && <span style={{ color: C.textFaint, marginLeft: 'auto' }}>→</span>}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, background: C.bg, borderRadius: RAD.md, border: '1px solid ' + C.border, padding: '1rem', overflow: 'auto' }}>
        {logs.map((log, i) => (
          <div key={i} style={{ fontFamily: TYP.mono, fontSize: '0.75rem', color: C.textMuted, marginBottom: 4 }}>
            <span style={{ color: ACC.primary }}>{log.time}</span>
            <span style={{ color: C.textFaint }}> </span>
            {log.msg}
          </div>
        ))}
      </div>
    </div>
  )
}