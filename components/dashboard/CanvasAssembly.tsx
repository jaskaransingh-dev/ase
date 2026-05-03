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
import { useEffect, useMemo, useState } from 'react'
import { BLOCKS as PIPELINE_BLOCKS } from '@/lib/quant/blocks'

const KIND_COLORS: Record<string, string> = {
  data: '#3b82f6', indicator: '#a855f7', ml: '#ec4899',
  api: '#06b6d4', risk: '#ef4444', execution: '#f59e0b', signal: '#16c784',
}
const KIND_ORDER: Record<string, number> = {
  data: 0, indicator: 1, ml: 2, api: 3, signal: 4, risk: 5, execution: 6,
}
const COL_LABELS: Record<number, string> = {
  0: 'DATA', 1: 'INDICATORS', 2: 'ML', 3: 'APIS', 4: 'SIGNAL', 5: 'RISK', 6: 'EXEC',
}
const SINKS = [
  { id: 'connector.backtest', label: 'Backtest', color: '#16c784' },
  { id: 'connector.kraken',   label: 'Kraken',   color: '#f59e0b' },
]

interface Props {
  blocks: string[]
  phase: 'idle' | 'building' | 'done' | 'error'
  height?: number
  /** Click handler for a block card — used by the code page to open the
      corresponding strategy file when the user clicks a block. */
  onBlockClick?: (id: string) => void
}

export default function CanvasAssembly({ blocks, phase, height, onBlockClick }: Props) {
  const layout = useMemo(() => {
    // Group by pipeline column
    const cols: Map<number, { id: string; label: string; color: string; kind: string }[]> = new Map()
    for (const id of blocks) {
      const b = PIPELINE_BLOCKS.find(x => x.id === id)
      if (!b) continue
      const col = KIND_ORDER[b.kind] ?? 4
      const arr = cols.get(col) ?? []
      arr.push({ id: b.id, label: b.label, color: KIND_COLORS[b.kind] ?? '#94a3b8', kind: b.kind })
      cols.set(col, arr)
    }
    // Sinks always at the rightmost column
    const sinkCol = (Math.max(7, ...Array.from(cols.keys()))) + 1
    cols.set(sinkCol, SINKS.map(s => ({ id: s.id, label: s.label, color: s.color, kind: 'sink' })))

    const sortedKeys = Array.from(cols.keys()).sort((a, b) => a - b)
    const COL_W = 150, COL_GAP = 36, ROW_H = 44, ROW_GAP = 14
    const positioned: { id: string; label: string; color: string; kind: string; x: number; y: number; col: number; colKey: number }[] = []
    sortedKeys.forEach((k, ci) => {
      const arr = cols.get(k) ?? []
      arr.forEach((b, ri) => {
        positioned.push({
          ...b,
          col: ci,
          colKey: k,
          x: 24 + ci * (COL_W + COL_GAP),
          y: 36 + ri * (ROW_H + ROW_GAP),
        })
      })
    })
    // Compute edges column → column
    const edges: { fromX: number; fromY: number; toX: number; toY: number; color: string; fromId: string; toId: string }[] = []
    for (let ci = 0; ci < sortedKeys.length - 1; ci++) {
      const a = positioned.filter(p => p.col === ci)
      const b = positioned.filter(p => p.col === ci + 1)
      for (const x of a) for (const y of b) {
        edges.push({
          fromX: x.x + 134, fromY: x.y + 20,
          toX: y.x + 4, toY: y.y + 20,
          color: x.color,
          fromId: x.id, toId: y.id,
        })
      }
    }
    const totalW = 24 + sortedKeys.length * (COL_W + COL_GAP) + 24
    // Height grows to contain the tallest column (plus column-label header)
    const maxRows = Math.max(1, ...Array.from(cols.values()).map(c => c.length))
    const contentH = 36 + maxRows * (ROW_H + ROW_GAP) + 24
    return { positioned, edges, totalW, contentH, sortedKeys, cols }
  }, [blocks])

  // Allow idle phase so the always-on pipeline header on the build page works
  const intensity = phase === 'building' ? 1 : 0.7

  // Explicit height prop overrides — otherwise grow to fit content
  const wrapH = height ?? (layout.contentH + 48)

  // ── Live activity simulator ──────────────────────────────────────────────
  // The "alive" feel comes from a faux throughput counter (events/sec)
  // that ticks while building, plus a marching block highlight that walks
  // through the pipeline column by column to suggest data flowing through.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (phase === 'idle') return
    const id = setInterval(() => setTick(t => t + 1), phase === 'building' ? 380 : 1100)
    return () => clearInterval(id)
  }, [phase])

  // The "active" block index — walks through each column, picking one
  // block per column, advancing every tick. While building this gives
  // the illusion of compute marching down the pipeline.
  const activeIdSet = useMemo(() => {
    const positioned = layout.positioned
    if (!positioned.length) return new Set<string>()
    const byCol = new Map<number, typeof positioned>()
    for (const p of positioned) {
      const arr = byCol.get(p.col) ?? []
      arr.push(p); byCol.set(p.col, arr)
    }
    const cols = Array.from(byCol.keys()).sort((a, b) => a - b)
    const colIdx = tick % cols.length
    const arr = byCol.get(cols[colIdx]) ?? []
    const within = arr.length ? arr[tick % arr.length].id : null
    return new Set<string>(within ? [within] : [])
  }, [tick, layout])

  // Faux "events/sec" — wobbles around a base depending on node count
  const eps = useMemo(() => {
    const base = Math.max(8, layout.positioned.length * 7)
    const wobble = Math.sin(tick / 1.7) * (base * 0.18) + Math.cos(tick / 0.9) * (base * 0.05)
    return Math.max(1, Math.round(base + wobble))
  }, [tick, layout.positioned.length])

  return (
    <div style={{
      position: 'relative', width: '100%',
      height: wrapH,
      // No overflow:hidden — box grows instead of scrolling
      background: 'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(22,199,132,0.07) 0%, transparent 65%), linear-gradient(180deg, rgba(11,23,40,0.6), rgba(6,17,31,0.9))',
      borderBottom: '1px solid rgba(30,42,61,0.6)',
    }}>
      <style>{`
        @keyframes ca-card    { from { opacity: 0; transform: translateY(-6px) scale(.94) } to { opacity: 1; transform: translateY(0) scale(1) } }
        @keyframes ca-line    { from { stroke-dashoffset: 80; opacity: 0 } to { stroke-dashoffset: 0; opacity: 1 } }
        @keyframes ca-particle { from { offset-distance: 0% } to { offset-distance: 100% } }
        @keyframes ca-pulse   { 0%,100% { opacity: .35 } 50% { opacity: .85 } }
        @keyframes ca-active  { 0%,100% { transform: scale(1); box-shadow: 0 0 16px var(--c)55, 0 0 0 0 var(--c)00 }
                                 50%      { transform: scale(1.04); box-shadow: 0 0 26px var(--c)bb, 0 0 0 4px var(--c)22 } }
        @keyframes ca-dot     { 0%,100% { opacity: .35; transform: scale(1) } 50% { opacity: 1; transform: scale(1.4) } }
        @keyframes ca-bar     { 0% { transform: scaleX(.2) } 50% { transform: scaleX(1) } 100% { transform: scaleX(.2) } }
      `}</style>

      {/* Title row — centered, with a live loading animation while building */}
      {phase !== 'idle' && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '.7rem', padding: '0.45rem 0.85rem', position: 'relative', zIndex: 2,
        }}>
          {phase === 'building' && (
            <span style={{ display: 'inline-flex', gap: 3 }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{
                  width: 4, height: 4, borderRadius: '50%', background: '#16c784',
                  animation: `ca-pulse 1s ease-in-out infinite ${i * 0.18}s`,
                }} />
              ))}
            </span>
          )}
          {phase !== 'building' && (
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16c784', boxShadow: '0 0 8px #16c784', animation: 'ca-dot 1.6s ease-in-out infinite' }} />
          )}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: '#16c784', letterSpacing: '0.12em', fontWeight: 700 }}>
            {phase === 'building' ? 'ASSEMBLING PIPELINE' : 'PIPELINE LIVE'}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: '#94a3b8' }}>
            · {layout.positioned.length} nodes · {layout.edges.length} edges
          </span>
          {/* Live throughput meter — subtle but distinctly "alive" */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '0.1rem 0.45rem', borderRadius: 4,
            background: 'rgba(22,199,132,0.07)',
            border: '1px solid rgba(22,199,132,0.25)',
          }}>
            <span style={{
              width: 18, height: 3, borderRadius: 2, background: '#16c784',
              transformOrigin: 'left center',
              animation: 'ca-bar 1.8s ease-in-out infinite',
            }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.46rem', color: '#16c784', fontWeight: 700, letterSpacing: '0.08em' }}>
              {eps} EVT/s
            </span>
          </span>
        </div>
      )}

      {/* Canvas — centered, expands horizontally to fit all blocks */}
      <div style={{
        position: 'absolute',
        inset: phase !== 'idle' ? '32px 0 0 0' : '0 0 0 0',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        // no overflow clipping — parent box already sized to content
      }}>
        <div style={{ position: 'relative', width: layout.totalW, height: layout.contentH }}>
          {/* Column header labels — drift in once each column has at least
              one block, so the user reads "DATA → INDICATORS → SIGNAL → ..."
              the way real pipelines are organized. */}
          {layout.sortedKeys.map((k, ci) => {
            const arr = layout.cols.get(k) ?? []
            const isSink = arr.some(b => b.kind === 'sink')
            const label = isSink ? 'SINK' : (COL_LABELS[k] ?? `STAGE ${ci + 1}`)
            const c = arr[0]?.color ?? '#94a3b8'
            const x = 24 + ci * (150 + 36)
            return (
              <div key={`hdr-${k}`} style={{
                position: 'absolute', left: x, top: 0, width: 150,
                fontFamily: 'var(--font-mono)', fontSize: '0.42rem', fontWeight: 700,
                color: c, opacity: 0.65, letterSpacing: '0.14em', textAlign: 'center',
                animation: `ca-card .4s ease ${ci * 0.06}s both`,
              }}>{label}</div>
            )
          })}

          {/* Edges */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <defs>
              {layout.edges.map((e, i) => (
                <linearGradient key={`grad-${i}`} id={`ca-grad-${i}`} x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor={e.color} stopOpacity="0.65" />
                  <stop offset="100%" stopColor={e.color} stopOpacity="0.18" />
                </linearGradient>
              ))}
            </defs>
            {layout.edges.map((e, i) => {
              const cx = (e.fromX + e.toX) / 2
              const path = `M${e.fromX},${e.fromY} C${cx},${e.fromY} ${cx},${e.toY} ${e.toX},${e.toY}`
              const isHot = activeIdSet.has(e.fromId) || activeIdSet.has(e.toId)
              return (
                <g key={i}>
                  <path d={path} fill="none" stroke={`url(#ca-grad-${i})`}
                    strokeOpacity={(isHot ? 0.95 : 0.6) * intensity}
                    strokeWidth={isHot ? 2 : 1.4} strokeDasharray="6 5"
                    style={{ animation: `ca-line .8s ease ${i * .08}s both, ca-pulse 3s ease-in-out infinite ${i * .15}s` }} />
                  {/* Two staggered particles per edge for a richer flow.
                      The second is offset so the line never feels empty. */}
                  <circle r="2" fill={e.color}
                    style={{
                      offsetPath: `path('${path}')`,
                      animation: `ca-particle ${3.2 + (i % 4)}s linear ${i * 0.3}s infinite`,
                      opacity: phase === 'building' ? 1 : 0.55,
                      filter: `drop-shadow(0 0 3px ${e.color})`,
                    } as React.CSSProperties}
                  />
                  <circle r="1.4" fill={e.color}
                    style={{
                      offsetPath: `path('${path}')`,
                      animation: `ca-particle ${3.2 + (i % 4)}s linear ${i * 0.3 + 1.2}s infinite`,
                      opacity: phase === 'building' ? 0.85 : 0.4,
                    } as React.CSSProperties}
                  />
                </g>
              )
            })}
          </svg>

          {/* Block cards — clickable when an onBlockClick handler is wired
              (used by the code page to open the matching file). */}
          {layout.positioned.map((p, i) => {
            const isActive = activeIdSet.has(p.id) && phase !== 'idle'
            return (
              <div key={p.id}
                onClick={onBlockClick ? () => onBlockClick(p.id) : undefined}
                style={{
                  position: 'absolute', left: p.x, top: p.y,
                  width: 130, padding: '0.4rem 0.55rem',
                  background: 'rgba(10,21,37,0.92)',
                  border: `1px solid ${p.color}55`,
                  borderLeft: `2px solid ${p.color}`,
                  borderRadius: 7,
                  animation: isActive
                    ? `ca-card .35s ease ${i * .07}s both, ca-active 1.4s ease-in-out infinite`
                    : `ca-card .35s ease ${i * .07}s both`,
                  ['--c' as string]: p.color,
                  boxShadow: `0 0 16px ${p.color}25`,
                  cursor: onBlockClick ? 'pointer' : 'default',
                  transition: 'transform .12s ease, box-shadow .12s ease',
                  backdropFilter: 'blur(2px)',
                } as React.CSSProperties}
                onMouseEnter={onBlockClick ? (e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)'
                  e.currentTarget.style.boxShadow = `0 0 22px ${p.color}55`
                } : undefined}
                onMouseLeave={onBlockClick ? (e) => {
                  e.currentTarget.style.transform = ''
                  e.currentTarget.style.boxShadow = `0 0 16px ${p.color}25`
                } : undefined}
                >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%', background: p.color,
                    boxShadow: `0 0 6px ${p.color}`,
                    animation: isActive ? 'ca-dot 0.9s ease-in-out infinite' : 'none',
                  }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</span>
                  {phase === 'done' && (
                    <span style={{ marginLeft: 'auto', fontSize: '0.5rem', color: p.color, fontWeight: 700, lineHeight: 1 }}>✓</span>
                  )}
                  {phase === 'building' && isActive && (
                    <span style={{
                      marginLeft: 'auto', width: 5, height: 5, borderRadius: '50%',
                      background: p.color, animation: 'ca-dot .7s ease-in-out infinite',
                    }} />
                  )}
                </div>
                {/* Subtle "running" sparkbar under each card — animates only
                    while building, otherwise rests as a faint baseline. */}
                <div style={{
                  marginTop: 4, height: 2, borderRadius: 1, background: `${p.color}25`, overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', width: '60%', background: p.color,
                    transformOrigin: 'left',
                    animation: phase === 'building' ? `ca-bar ${1.6 + (i % 3) * 0.4}s ease-in-out infinite` : 'none',
                    opacity: phase === 'building' ? 1 : 0.35,
                  }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
