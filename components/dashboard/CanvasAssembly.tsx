'use client'

/**
 * Animated "canvas coming together" panel. Renders above the chat after the
 * user submits a build prompt. Blocks fade-in left → right in pipeline
 * order, edges draw between them, and particles flow along the edges.
 *
 * Re-used on the Build page and the Build/Code page. Driven by:
 *   - `blocks`: the user-pinned + AI-mentioned block ids
 *   - `phase` : 'idle' | 'building' | 'done' (controls intensity)
 */
import { useMemo } from 'react'
import { BLOCKS as PIPELINE_BLOCKS } from '@/lib/quant/blocks'

const KIND_COLORS: Record<string, string> = {
  data: '#3b82f6', indicator: '#a855f7', ml: '#ec4899',
  api: '#06b6d4', risk: '#ef4444', execution: '#f59e0b', signal: '#16c784',
}
const KIND_ORDER: Record<string, number> = {
  data: 0, indicator: 1, ml: 2, api: 3, signal: 4, risk: 5, execution: 6,
}
const SINKS = [
  { id: 'connector.backtest', label: 'Backtest', color: '#16c784' },
  { id: 'connector.kraken',   label: 'Kraken',   color: '#f59e0b' },
]

interface Props {
  blocks: string[]
  phase: 'idle' | 'building' | 'done' | 'error'
  height?: number
}

export default function CanvasAssembly({ blocks, phase, height = 220 }: Props) {
  const layout = useMemo(() => {
    // Group by pipeline column
    const cols: Map<number, { id: string; label: string; color: string }[]> = new Map()
    for (const id of blocks) {
      const b = PIPELINE_BLOCKS.find(x => x.id === id)
      if (!b) continue
      const col = KIND_ORDER[b.kind] ?? 4
      const arr = cols.get(col) ?? []
      arr.push({ id: b.id, label: b.label, color: KIND_COLORS[b.kind] ?? '#94a3b8' })
      cols.set(col, arr)
    }
    // Sinks always at the rightmost column
    const sinkCol = (Math.max(7, ...Array.from(cols.keys()))) + 1
    cols.set(sinkCol, SINKS.map(s => ({ id: s.id, label: s.label, color: s.color })))

    const sortedKeys = Array.from(cols.keys()).sort((a, b) => a - b)
    const COL_W = 150, COL_GAP = 30, ROW_H = 40, ROW_GAP = 14
    const positioned: { id: string; label: string; color: string; x: number; y: number; col: number }[] = []
    sortedKeys.forEach((k, ci) => {
      const arr = cols.get(k) ?? []
      arr.forEach((b, ri) => {
        positioned.push({
          ...b,
          col: ci,
          x: 24 + ci * (COL_W + COL_GAP),
          y: 24 + ri * (ROW_H + ROW_GAP),
        })
      })
    })
    // Compute edges column → column
    const edges: { fromX: number; fromY: number; toX: number; toY: number; color: string }[] = []
    for (let ci = 0; ci < sortedKeys.length - 1; ci++) {
      const a = positioned.filter(p => p.col === ci)
      const b = positioned.filter(p => p.col === ci + 1)
      for (const x of a) for (const y of b) {
        edges.push({
          fromX: x.x + 130, fromY: x.y + 18,
          toX: y.x + 4, toY: y.y + 18,
          color: x.color,
        })
      }
    }
    const totalW = 24 + sortedKeys.length * (COL_W + COL_GAP)
    return { positioned, edges, totalW, COL_W, ROW_H }
  }, [blocks])

  if (phase === 'idle') return null

  const intensity = phase === 'building' ? 1 : 0.7

  return (
    <div style={{
      position: 'relative', width: '100%', height, overflow: 'hidden',
      background: 'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(22,199,132,0.05) 0%, transparent 65%), linear-gradient(180deg, rgba(11,23,40,0.6), rgba(6,17,31,0.9))',
      borderBottom: '1px solid rgba(30,42,61,0.6)',
    }}>
      <style>{`
        @keyframes ca-card    { from { opacity: 0; transform: translateY(-6px) scale(.96) } to { opacity: 1; transform: translateY(0) scale(1) } }
        @keyframes ca-line    { from { stroke-dashoffset: 80; opacity: 0 } to { stroke-dashoffset: 0; opacity: 1 } }
        @keyframes ca-particle { from { offset-distance: 0% } to { offset-distance: 100% } }
        @keyframes ca-pulse   { 0%,100% { opacity: .35 } 50% { opacity: .85 } }
      `}</style>

      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.45rem 0.85rem', position: 'relative', zIndex: 2 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: '#16c784', letterSpacing: '0.1em', fontWeight: 700 }}>
          {phase === 'building' ? 'ASSEMBLING PIPELINE' : 'PIPELINE READY'}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: '#94a3b8' }}>
          {layout.positioned.length} nodes · {layout.edges.length} connections
        </span>
      </div>

      {/* Centered scrollable canvas */}
      <div style={{ position: 'absolute', inset: '32px 0 0 0', display: 'flex', justifyContent: 'center', overflowX: 'auto' }}>
        <div style={{ position: 'relative', width: layout.totalW, height: height - 32 }}>
          {/* Edges */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            {layout.edges.map((e, i) => {
              const cx = (e.fromX + e.toX) / 2
              const path = `M${e.fromX},${e.fromY} C${cx},${e.fromY} ${cx},${e.toY} ${e.toX},${e.toY}`
              return (
                <g key={i}>
                  <path d={path} fill="none" stroke={e.color} strokeOpacity={0.55 * intensity}
                    strokeWidth="1.4" strokeDasharray="6 5"
                    style={{ animation: `ca-line .8s ease ${i * .08}s both, ca-pulse 3s ease-in-out infinite ${i * .15}s` }} />
                  {/* Particle */}
                  <circle r="2" fill={e.color}
                    style={{
                      offsetPath: `path('${path}')`,
                      animation: `ca-particle ${3.5 + (i % 4)}s linear ${i * 0.3}s infinite`,
                      opacity: phase === 'building' ? 1 : 0.4,
                    } as React.CSSProperties}
                  />
                </g>
              )
            })}
          </svg>

          {/* Block cards */}
          {layout.positioned.map((p, i) => (
            <div key={p.id}
              style={{
                position: 'absolute', left: p.x, top: p.y,
                width: 130, padding: '0.4rem 0.55rem',
                background: 'rgba(10,21,37,0.92)',
                border: `1px solid ${p.color}55`,
                borderLeft: `2px solid ${p.color}`,
                borderRadius: 7,
                animation: `ca-card .35s ease ${i * .07}s both`,
                boxShadow: `0 0 16px ${p.color}25`,
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.color, boxShadow: `0 0 6px ${p.color}` }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
