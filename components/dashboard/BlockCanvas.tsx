'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { BLOCKS, getBlockById, type BlockKind } from '@/lib/quant/blocks'

const KIND_COLORS: Record<string, string> = {
  data: '#3b82f6',
  indicator: '#a855f7',
  ml: '#ec4899',
  api: '#06b6d4',
  risk: '#ef4444',
  execution: '#f59e0b',
  signal: '#16c784',
}

const KIND_ICONS: Record<string, string> = {
  data: '📊',
  indicator: '📈',
  ml: '🤖',
  api: '🔗',
  risk: '🛡️',
  execution: '⚡',
  signal: '🎯',
}

interface Node {
  id: string
  x: number
  y: number
  label: string
  kind: BlockKind
  color: string
  nodeId: string
}

interface CanvasNodeProps {
  node: Node
  index: number
  total: number
  onMouseDown: (e: React.MouseEvent, nodeId: string) => void
  onRemove: (nodeId: string) => void
  dragging: string | null
}

function CanvasNode({ node, index, total, onMouseDown, onRemove, dragging }: CanvasNodeProps) {
  const isDragging = dragging === node.nodeId
  return (
    <div
      onMouseDown={(e) => onMouseDown(e, node.nodeId)}
      style={{
        position: 'absolute',
        left: node.x,
        top: node.y,
        background: 'rgba(6,12,20,0.95)',
        borderRadius: 8,
        borderLeft: `3px solid ${node.color}`,
        borderTop: '1px solid rgba(26,37,53,0.8)',
        borderRight: '1px solid rgba(26,37,53,0.8)',
        borderBottom: '1px solid rgba(26,37,53,0.8)',
        padding: '0.5rem 0.75rem',
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        transition: isDragging ? 'none' : 'box-shadow 0.15s',
        opacity: isDragging ? 0.85 : 1,
        zIndex: isDragging ? 10 : 1,
        minWidth: 130,
      }}
    >
      <div style={{ fontSize: '0.58rem', fontWeight: 700, color: node.color, marginBottom: 2 }}>
        {KIND_ICONS[node.kind]} {node.label}
      </div>
      <div style={{ fontSize: '0.42rem', color: '#475569', textTransform: 'capitalize' }}>
        {node.kind}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(node.nodeId) }}
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
          background: 'transparent',
          border: 'none',
          color: '#475569',
          cursor: 'pointer',
          fontSize: '0.5rem',
          padding: '0 2px',
          lineHeight: 1,
          borderRadius: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#475569')}
      >
        ×
      </button>
    </div>
  )
}

function SVGConnector({ from, to }: { from: Node; to: Node }) {
  const x1 = from.x + 133
  const y1 = from.y + 32
  const x2 = to.x
  const y2 = to.y + 32

  const dx = x2 - x1
  const cp1x = x1 + Math.min(dx * 0.4, 60)
  const cp1y = y1
  const cp2x = x2 - Math.min(dx * 0.4, 60)
  const cp2y = y2

  const path = `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`

  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke="rgba(22,199,132,0.25)"
        strokeWidth={1.5}
        strokeDasharray="4,4"
      />
      <polygon
        points={`${x2},${y2} ${x2 - 6},${y2 - 4} ${x2 - 6},${y2 + 4}`}
        fill="rgba(22,199,132,0.4)"
      />
    </g>
  )
}

interface BlockCanvasProps {
  nodes: Node[]
  onNodesChange: (nodes: Node[]) => void
  showConnector?: boolean
}

export default function BlockCanvas({ nodes, onNodesChange, showConnector = true }: BlockCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState<string | null>(null)
  const [nodeDragStart, setNodeDragStart] = useState({ x: 0, y: 0 })
  const [dropTarget, setDropTarget] = useState(false)
  const [zoom, setZoom] = useState(1)

  const handleContainerMouseDown = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement
    if (t === containerRef.current || t.classList.contains('canvas-bg')) {
      setIsPanning(true)
      setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
    }
  }

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning) {
        setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
        return
      }
      if (dragging) {
        const rect = containerRef.current?.getBoundingClientRect()
        if (rect) {
          const x = (e.clientX - rect.left - offset.x) / zoom - nodeDragStart.x
          const y = (e.clientY - rect.top - offset.y) / zoom - nodeDragStart.y
          onNodesChange(nodes.map((n) => (n.nodeId === dragging ? { ...n, x, y } : n)))
        }
      }
    },
    [isPanning, dragging, dragStart, offset, nodeDragStart, zoom, nodes, onNodesChange]
  )

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
    setDragging(null)
  }, [])

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      setZoom((z) => Math.max(0.5, Math.min(2, z - e.deltaY * 0.001)))
    }
  }

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation()
    const node = nodes.find((n) => n.nodeId === nodeId)
    if (!node) return
    setDragging(nodeId)
    setNodeDragStart({ x: e.clientX - node.x * zoom - offset.x, y: e.clientY - node.y * zoom - offset.y })
  }

  const handleRemove = (nodeId: string) => {
    onNodesChange(nodes.filter((n) => n.nodeId !== nodeId))
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDropTarget(false)
    const blockId = e.dataTransfer.getData('blockId')
    const block = getBlockById(blockId)
    if (!block) return
    const nodeId = crypto.randomUUID()
    const rect = containerRef.current?.getBoundingClientRect()
    const x = rect ? (e.clientX - rect.left - offset.x) / zoom : 100 + nodes.length * 20
    const y = rect ? (e.clientY - rect.top - offset.y) / zoom : 100
    const color = KIND_COLORS[block.kind] || '#3b82f6'
    const newNode: Node = { nodeId, id: block.id, x, y, label: block.label, kind: block.kind, color }
    onNodesChange([...nodes, newNode])
  }

  return (
    <div
      ref={containerRef}
      onMouseDown={handleContainerMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onDragOver={(e) => {
        e.preventDefault()
        setDropTarget(true)
      }}
      onDragLeave={() => setDropTarget(false)}
      onDrop={handleDrop}
      className="canvas-bg"
      style={{
        position: 'absolute',
        inset: 0,
        background:
          'radial-gradient(ellipse 120% 80% at 20% 20%, rgba(59,130,246,0.06) 0%, transparent 50%), radial-gradient(ellipse 80% 60% at 80% 80%, rgba(22,199,132,0.04) 0%, transparent 50%), #030608',
        transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
        transformOrigin: '0 0',
        borderRadius: 12,
        border: dropTarget ? '2px dashed rgba(22,199,132,0.6)' : '2px solid #1a2535',
        overflow: 'hidden',
        cursor: isPanning ? 'grabbing' : dragging ? 'grabbing' : 'grab',
      }}
    >
      {nodes.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🧩</div>
          <div style={{ fontSize: '0.62rem', color: '#475569' }}>
            Drag blocks here to compose strategy
          </div>
        </div>
      )}

      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          overflow: 'visible',
        }}
      >
        {showConnector &&
          nodes.map((node, i) =>
            i < nodes.length - 1 ? <SVGConnector key={node.nodeId} from={node} to={nodes[i + 1]} /> : null
          )}
      </svg>

      {nodes.map((node, i) => (
        <CanvasNode
          key={node.nodeId}
          node={node}
          index={i}
          total={nodes.length}
          onMouseDown={handleNodeMouseDown}
          onRemove={handleRemove}
          dragging={dragging}
        />
      ))}
    </div>
  )
}

export { KIND_COLORS, KIND_ICONS }
export type { Node }