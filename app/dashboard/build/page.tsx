'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { BLOCKS, getBlockById } from '@/lib/quant/blocks'
import type { BlockKind } from '@/lib/quant/blocks'
import { runBuild as runBuildBg, subscribe as subscribeBg, getState as getBgState, abortBuild as abortBuildBg } from '@/lib/build-bg'
import CanvasAssembly from '@/components/dashboard/CanvasAssembly'

const C = {
  bg: '#030608', bg2: '#060d17', bg3: '#0a1525', bg4: '#0e1c30',
  border: '#1a2535', border2: '#243347',
  text: '#94a3b8', faint: '#475569', muted: '#64748b',
  white: '#f1f5f9', blue: '#3b82f6', blue2: '#60a5fa',
  mint: '#16c784', orange: '#f59e0b', red: '#ef4444', purple: '#8b5cf6',
  cyan: '#06b6d4',
}

const KIND_COLORS: Record<string, string> = {
  data: '#3b82f6', indicator: '#a855f7', ml: '#ec4899',
  api: '#06b6d4', risk: '#ef4444', execution: '#f59e0b', signal: '#16c784',
}
const KIND_ICONS: Record<string, string> = {
  data: '◈', indicator: '◉', ml: '◆', api: '◇', risk: '△', execution: '▶', signal: '★',
}

const CATEGORIES: Array<{ id: BlockKind; label: string; sublabel: string; color: string; icon: string }> = [
  { id: 'data',      label: 'Data',       sublabel: 'Market feeds',       color: '#3b82f6', icon: '◈' },
  { id: 'indicator', label: 'Indicators', sublabel: 'Technical signals',  color: '#a855f7', icon: '◉' },
  { id: 'ml',        label: 'ML',         sublabel: 'Models',             color: '#ec4899', icon: '◆' },
  { id: 'api',       label: 'APIs',       sublabel: 'Integrations',       color: '#06b6d4', icon: '◇' },
  { id: 'risk',      label: 'Risk',       sublabel: 'Controls',           color: '#ef4444', icon: '△' },
  { id: 'execution', label: 'Exec',       sublabel: 'Order routing',      color: '#f59e0b', icon: '▶' },
  { id: 'signal',    label: 'Signal',     sublabel: 'Alpha combinators',  color: '#16c784', icon: '★' },
]

const SYNE_BLOCK = BLOCKS.find(b => b.id === 'api.syne')

// ── Built-in connectors that always close the pipeline ─────────────────────
//
// Every strategy ends with two virtual blocks: a "Backtest" sink the agent
// runs against, and the "Kraken" execution venue. They aren't user-pickable
// like real BLOCKS — they're always on the canvas and always connected.
const SINK_NODES: { id: string; label: string; kind: string; color: string }[] = [
  { id: 'connector.backtest', label: 'Backtest', kind: 'execution', color: '#16c784' },
  { id: 'connector.kraken',   label: 'Kraken',   kind: 'execution', color: '#f59e0b' },
]

// Pipeline-order layout helper — lays user/AI-picked blocks left → right in
// the actual order they execute (data → indicator → ml → api → signal →
// risk → execution → backtest/kraken connectors).
const PIPELINE_KIND_ORDER: Record<string, number> = {
  data: 0, indicator: 1, ml: 2, api: 3, signal: 4, risk: 5, execution: 6,
}
const COL_WIDTH = 180
const ROW_HEIGHT = 72
const COL_OFFSET_X = 60
const COL_OFFSET_Y = 110

function layoutPipeline(blockIds: string[]): { id: string; x: number; y: number; label: string; kind: string; color: string }[] {
  const colCounts: Record<number, number> = {}
  const positioned: { id: string; x: number; y: number; label: string; kind: string; color: string }[] = []

  // Real blocks
  for (const id of blockIds) {
    const b = getBlockById(id)
    if (!b) continue
    const col = PIPELINE_KIND_ORDER[b.kind] ?? 4
    const row = (colCounts[col] ?? 0)
    colCounts[col] = row + 1
    positioned.push({
      id, label: b.label, kind: b.kind,
      color: KIND_COLORS[b.kind] || C.blue,
      x: COL_OFFSET_X + col * COL_WIDTH,
      y: COL_OFFSET_Y + row * ROW_HEIGHT,
    })
  }

  // Always-on sinks at the rightmost column
  const sinkCol = Math.max(7, ...positioned.map(n => Math.floor((n.x - COL_OFFSET_X) / COL_WIDTH)) ) + 1
  SINK_NODES.forEach((s, i) => {
    positioned.push({
      ...s,
      x: COL_OFFSET_X + sinkCol * COL_WIDTH,
      y: COL_OFFSET_Y + i * ROW_HEIGHT,
    })
  })

  return positioned
}

const THINKING_STEPS = [
  'Parsing strategy intent',
  'Scanning block dependencies',
  'Mapping signal pipeline',
  'Allocating risk budget',
  'Writing execution layer',
  'Composing scaffold',
  'Connecting ASE runtime',
  'Ready',
]

interface ChatMessage { id: string; role: 'user' | 'assistant'; content: string; pending?: boolean }
interface CanvasNode { id: string; x: number; y: number; label: string; kind: string; color: string }
interface ExtractedFile { name: string; content: string; lang: string }
interface BtResult { grade: string; tear_sheet: Record<string, number> }

// ── Parse FILE: directives — handles //, #, or bare FILE: ────────────────────
function extractFiles(text: string): ExtractedFile[] {
  const files: ExtractedFile[] = []
  const seen = new Set<string>()

  // Pattern 1: ```lang\n(// or #) FILE: filename\ncontent\n```
  const re1 = /```(\w*)[^\n]*\n(?:\/\/|#)\s*FILE:\s*([^\n]+)\n([\s\S]*?)```/g
  // Pattern 2: FILE: filename before a code block  (// FILE: name\n```...)
  const re2 = /(?:\/\/|#)\s*FILE:\s*([^\n]+)\n```(\w*)[^\n]*\n([\s\S]*?)```/g

  let m: RegExpExecArray | null
  re1.lastIndex = 0
  while ((m = re1.exec(text)) !== null) {
    const name = m[2].trim()
    if (!seen.has(name) && m[3].trim()) {
      seen.add(name)
      files.push({ lang: m[1] || 'text', name, content: m[3] })
    }
  }
  re2.lastIndex = 0
  while ((m = re2.exec(text)) !== null) {
    const name = m[1].trim()
    if (!seen.has(name) && m[3].trim()) {
      seen.add(name)
      files.push({ lang: m[2] || 'text', name, content: m[3] })
    }
  }
  return files
}

// ── Draft save/load ───────────────────────────────────────────────────────────
export interface AgentDraft {
  id: string
  name: string
  prompt: string
  files: Record<string, string>
  blocks: string[]
  createdAt: number
}

const DRAFTS_KEY = 'ase_agent_drafts'

function saveDraft(draft: AgentDraft) {
  try {
    const existing: AgentDraft[] = JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? '[]')
    const filtered = existing.filter(d => d.id !== draft.id)
    localStorage.setItem(DRAFTS_KEY, JSON.stringify([draft, ...filtered].slice(0, 20)))
    // Also write to ase-files so code page picks it up immediately
    localStorage.setItem('ase-files', JSON.stringify(draft.files))
    localStorage.setItem('ase_latest_draft_id', draft.id)
  } catch {}
}

export function loadDrafts(): AgentDraft[] {
  try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? '[]') } catch { return [] }
}

function nameFromPrompt(p: string) {
  return p.trim().slice(0, 32).replace(/[^a-zA-Z0-9 ]/g, '').trim() || 'Untitled Strategy'
}

// ── Clean markdown renderer — no # symbols ────────────────────────────────────
function CleanMsg({ text }: { text: string }) {
  const lines = text.split('\n')
  const out: React.ReactNode[] = []
  let inCode = false, codeLines: string[] = [], codeLang = '', key = 0

  for (const raw of lines) {
    if (raw.startsWith('```')) {
      if (inCode) {
        out.push(
          <pre key={key++} style={{
            background: 'rgba(0,0,0,.5)', border: `1px solid ${C.border}`, borderRadius: 7,
            padding: '.5rem .7rem', fontSize: '.54rem', fontFamily: 'var(--font-mono)',
            color: C.blue2, overflowX: 'auto', margin: '.3rem 0', lineHeight: 1.5,
          }}>{codeLines.join('\n')}</pre>
        )
        inCode = false; codeLines = []
      } else { codeLang = raw.slice(3).trim(); inCode = true }
      continue
    }
    if (inCode) { codeLines.push(raw); continue }

    const isHeading = /^#{1,4}\s+/.test(raw)
    const clean = raw.replace(/^#{1,4}\s+/, '').trim()

    if (!clean) { out.push(<div key={key++} style={{ height: '.25rem' }} />); continue }

    if (raw.match(/^[-•]\s/)) {
      out.push(
        <div key={key++} style={{ display: 'flex', gap: '.35rem', paddingLeft: '.1rem' }}>
          <span style={{ color: C.mint, flexShrink: 0, marginTop: '.05em' }}>·</span>
          <span>{inlineFormat(clean.replace(/^[-•]\s/, ''))}</span>
        </div>
      )
    } else {
      out.push(
        <div key={key++} style={{
          fontWeight: isHeading ? 700 : 400,
          color: isHeading ? C.white : C.text,
          fontSize: isHeading ? '.62rem' : '.6rem',
          marginTop: isHeading ? '.4rem' : 0,
        }}>{inlineFormat(clean)}</div>
      )
    }
  }
  return <div style={{ lineHeight: 1.65, display: 'flex', flexDirection: 'column', gap: '.06rem' }}>{out}</div>
}

function inlineFormat(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**'))
      return <strong key={i} style={{ color: C.white, fontWeight: 600 }}>{p.slice(2, -2)}</strong>
    if (p.startsWith('`') && p.endsWith('`'))
      return <code key={i} style={{ background: 'rgba(59,130,246,.12)', borderRadius: 3, padding: '.05rem .22rem', fontSize: '.54rem', fontFamily: 'var(--font-mono)', color: C.blue2 }}>{p.slice(1, -1)}</code>
    return p
  })
}

// ── Compact backtest result strip ─────────────────────────────────────────────
const GRADE_CLR: Record<string, string> = { 'A+': '#16c784', A: '#16c784', 'B+': '#3b82f6', B: '#3b82f6', 'C+': '#f59e0b', C: '#f59e0b', D: '#ef4444', F: '#ef4444' }

function BtStrip({ result, loading, error }: { result: BtResult | null; loading: boolean; error: string }) {
  if (loading) return (
    <div style={{ padding: '.5rem .85rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: '.5rem', flexShrink: 0 }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.orange, animation: 'blink .7s infinite' }} />
      <span style={{ fontSize: '.53rem', color: C.faint, fontFamily: 'var(--font-mono)' }}>Running quick backtest...</span>
    </div>
  )
  if (error) return (
    <div style={{ padding: '.4rem .85rem', borderBottom: `1px solid ${C.border}`, fontSize: '.52rem', color: C.red, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
      Backtest error: {error.slice(0, 80)}
    </div>
  )
  if (!result) return null
  const ts = result.tear_sheet ?? {}
  const grade = result.grade ?? '—'
  const gc = GRADE_CLR[grade] ?? C.faint
  const metrics = [
    { k: 'GRADE', v: grade, c: gc },
    { k: 'SHARPE', v: (ts.sharpeRatio ?? 0).toFixed(2), c: (ts.sharpeRatio ?? 0) >= 1 ? C.mint : C.orange },
    { k: 'CAGR', v: (ts.cagr ?? 0).toFixed(1) + '%', c: (ts.cagr ?? 0) >= 0 ? C.mint : C.red },
    { k: 'MAX DD', v: (ts.maxDrawdownPct ?? 0).toFixed(1) + '%', c: (ts.maxDrawdownPct ?? 0) <= 20 ? C.mint : C.orange },
    { k: 'WIN%', v: (ts.winRatePct ?? 0).toFixed(0) + '%', c: C.text },
  ]
  return (
    <div style={{ padding: '.5rem .85rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: '.6rem', flexShrink: 0, flexWrap: 'wrap', background: 'rgba(22,199,132,.03)' }}>
      <span style={{ fontSize: '.46rem', color: C.faint, fontFamily: 'var(--font-mono)', letterSpacing: '.08em' }}>BACKTEST</span>
      {metrics.map(m => (
        <div key={m.k} style={{ display: 'flex', gap: '.22rem', alignItems: 'baseline' }}>
          <span style={{ fontSize: '.44rem', color: C.faint, fontFamily: 'var(--font-mono)' }}>{m.k}</span>
          <span style={{ fontSize: '.65rem', fontWeight: 700, color: m.c, fontFamily: 'var(--font-mono)' }}>{m.v}</span>
        </div>
      ))}
    </div>
  )
}

// AnimatedBlockBg removed — the foreground CanvasAssembly above the chat
// already shows the pipeline coming together; the always-on background
// version was redundant + visually noisy.

export default function BuildPage() {
  const router = useRouter()

  // Build state
  const [prompt, setPrompt] = useState('')
  const [phase, setPhase] = useState<'idle' | 'building' | 'done'>('idle')
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatStreaming, setChatStreaming] = useState(false)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Thinking animation
  const [thinkStep, setThinkStep] = useState(0)
  const [thinkDone, setThinkDone] = useState(false)
  const [thinkOpen, setThinkOpen] = useState(true)

  // Canvas
  const canvasRef = useRef<HTMLDivElement>(null)
  const [pinnedIds, setPinnedIds] = useState<string[]>([])
  // Start with the always-on Backtest + Kraken sinks so the canvas is
  // never empty — even before the user picks any block.
  const [nodes, setNodes] = useState<CanvasNode[]>(() => layoutPipeline([]))
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 })
  const [canvasDrag, setCanvasDrag] = useState<{ startX: number; startY: number } | null>(null)
  const [nodeDrag, setNodeDrag] = useState<{ id: string; startMx: number; startMy: number; startNx: number; startNy: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [dropHighlight, setDropHighlight] = useState(false)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  // Block panel
  const [activeCat, setActiveCat] = useState<BlockKind | 'all'>('all')
  const [blockSearch, setBlockSearch] = useState('')
  const [panelCollapsed, setPanelCollapsed] = useState(false)

  // Post-build
  const [extractedFiles, setExtractedFiles] = useState<ExtractedFile[]>([])
  const [expandedFile, setExpandedFile] = useState<string | null>(null)
  const [btResult, setBtResult] = useState<BtResult | null>(null)
  const [btLoading, setBtLoading] = useState(false)
  const [btError, setBtError] = useState('')
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null)

  // Agents drawer
  const [agentsOpen, setAgentsOpen] = useState(false)
  const [drafts, setDrafts] = useState<AgentDraft[]>([])
  useEffect(() => {
    if (agentsOpen) setDrafts(loadDrafts())
  }, [agentsOpen])

  // Scroll the chat panel to the bottom only when the user is already
  // pinned to the bottom — so streaming tokens don't yank a user who
  // scrolled up to read an earlier message.
  useEffect(() => {
    const el = chatScrollRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distance < 80) el.scrollTop = el.scrollHeight
  }, [chat])

  // Thinking animation
  useEffect(() => {
    if (phase !== 'building') return
    setThinkStep(0); setThinkDone(false); setThinkOpen(true)
    let i = 0
    const id = setInterval(() => {
      i++; setThinkStep(i)
      if (i >= THINKING_STEPS.length - 1) { clearInterval(id); setThinkDone(true) }
    }, 600)
    return () => clearInterval(id)
  }, [phase])

  // When AI finishes, just queue the auto-backtest flag for the code page.
  // We *don't* push the route automatically anymore — the canvas state
  // persists across navigation, and the user might want to keep iterating
  // here. They jump to /code via the explicit button in the header.
  useEffect(() => {
    if (phase !== 'done') return
    try { localStorage.setItem('ase_build_autobacktest', '1') } catch {}
  }, [phase])

  const displayBlocks = BLOCKS.filter(b => {
    if (activeCat !== 'all' && b.kind !== activeCat) return false
    if (blockSearch) {
      const q = blockSearch.toLowerCase()
      return b.label.toLowerCase().includes(q) || b.description.toLowerCase().includes(q)
    }
    return true
  })

  // Re-flow the canvas every time the user pins/unpins a block so the
  // pipeline always reads left → right in execution order with the
  // built-in Backtest + Kraken connectors anchoring the right edge.
  const reflowCanvas = useCallback((ids: string[]) => {
    setNodes(layoutPipeline(ids))
  }, [])

  const togglePin = useCallback((id: string) => {
    const block = getBlockById(id)
    if (!block) return
    setPinnedIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      reflowCanvas(next)
      return next
    })
  }, [reflowCanvas])

  // Re-layout when the AI finishes a build and we know the final block list.
  useEffect(() => {
    if (phase === 'done' || phase === 'building') {
      reflowCanvas(pinnedIds)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // Hydrate from the global background runner — this lets the AI keep
  // streaming after the user clicks away to another page and comes back.
  useEffect(() => {
    const initial = getBgState()
    if (initial.phase === 'building' || initial.phase === 'done') {
      setPhase(initial.phase)
      setChat(initial.chat as ChatMessage[])
      setExtractedFiles(initial.files)
      setCurrentDraftId(initial.draftId)
      // Restore picked blocks visually without re-broadcasting drag events
      if (initial.blocks.length && !pinnedIds.length) {
        initial.blocks.forEach(id => {
          const block = getBlockById(id)
          if (block) {
            setPinnedIds(p => p.includes(id) ? p : [...p, id])
            setNodes(p => p.find(n => n.id === id) ? p : [...p, {
              id, label: block.label, kind: block.kind,
              color: KIND_COLORS[block.kind] || C.blue,
              x: 240 + p.length * 170, y: 140 + (p.length % 4) * 80,
            }])
          }
        })
      }
    }
    const unsub = subscribeBg(s => {
      setPhase(s.phase === 'error' ? 'idle' : (s.phase as 'idle' | 'building' | 'done'))
      setChat(s.chat as ChatMessage[])
      setExtractedFiles(s.files)
      if (s.draftId) setCurrentDraftId(s.draftId)

      // Mine the streaming response for block references so blocks the
      // AI mentions get auto-pinned and laid out on the canvas in real time.
      const corpus = (s.chat as ChatMessage[]).map(m => m.content).join('\n') +
                     '\n' + s.files.map(f => f.content).join('\n')
      const matched: string[] = []
      for (const b of BLOCKS) {
        const idHit = corpus.includes(b.id)
        const labelHit = new RegExp(`\\b${b.label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i').test(corpus)
        if (idHit || labelHit) matched.push(b.id)
      }
      if (matched.length) {
        setPinnedIds(prev => {
          const merged = Array.from(new Set([...prev, ...matched]))
          if (merged.length !== prev.length) reflowCanvas(merged)
          return merged
        })
      }
    })
    return unsub
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const runBuild = useCallback(async (text: string) => {
    setPhase('building')
    const hints = pinnedIds.map(id => {
      const b = getBlockById(id)
      return { id, label: b?.label ?? id, agentHint: b?.agentHint }
    })

    try {
      localStorage.setItem('ase_build_prompt', text)
      localStorage.setItem('ase_build_blocks', JSON.stringify(pinnedIds))
    } catch {}
    // Hand the actual streaming work to the singleton runner.  This lets
    // the AI keep generating across page navigations.
    void runBuildBg({ prompt: text, blocks: pinnedIds, agentHints: hints })
      .then(() => setPanelCollapsed(true))
  }, [pinnedIds])

  const handleBuild = useCallback(() => {
    const text = prompt.trim() || (pinnedIds.length ? 'Build a strategy using: ' + pinnedIds.map(id => getBlockById(id)?.label).join(', ') : '')
    if (!text) return
    setPrompt('')
    runBuild(text)
  }, [prompt, pinnedIds, runBuild])

  const sendChat = useCallback(async () => {
    const text = chatInput.trim()
    if (!text || chatStreaming) return
    setChatInput(''); setChatStreaming(true)
    const uid = () => crypto.randomUUID()
    const uMsg: ChatMessage = { id: uid(), role: 'user', content: text }
    const aMsg: ChatMessage = { id: uid(), role: 'assistant', content: '', pending: true }
    setChat(p => [...p, uMsg, aMsg])
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...chat, uMsg].map(m => ({ role: m.role, content: m.content })), stream: true }),
      })
      if (!res.ok || !res.body) throw new Error('fail')
      const reader = res.body.getReader(); const decoder = new TextDecoder()
      let buf = '', acc = ''
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        const lines = (buf + decoder.decode(value, { stream: true })).split('\n'); buf = lines.pop() || ''
        for (const ln of lines) {
          if (!ln.startsWith('data: ')) continue
          const raw = ln.slice(6).trim(); if (!raw || raw === '[DONE]') continue
          try { const p = JSON.parse(raw); if (p.content) { acc += p.content; setChat(prev => prev.map(m => m.id === aMsg.id ? { ...m, content: acc } : m)) } } catch {}
        }
      }
      setChat(prev => prev.map(m => m.id === aMsg.id ? { ...m, pending: false } : m))
    } catch { setChat(prev => prev.map(m => m.id === aMsg.id ? { ...m, content: 'Error', pending: false } : m)) }
    setChatStreaming(false)
  }, [chatInput, chatStreaming, chat])

  // ── Canvas mouse handlers ─────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const t = e.target as HTMLElement
    if (t.closest('[data-node]')) return // node handles its own drag
    if (t.classList.contains('canvas-bg') || t.closest('.canvas-bg')) {
      setCanvasDrag({ startX: e.clientX - canvasOffset.x, startY: e.clientY - canvasOffset.y })
    }
  }, [canvasOffset])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (nodeDrag) {
      const dx = e.clientX - nodeDrag.startMx
      const dy = e.clientY - nodeDrag.startMy
      setNodes(prev => prev.map(n => n.id === nodeDrag.id ? { ...n, x: nodeDrag.startNx + dx / zoom, y: nodeDrag.startNy + dy / zoom } : n))
    } else if (canvasDrag) {
      setCanvasOffset({ x: e.clientX - canvasDrag.startX, y: e.clientY - canvasDrag.startY })
    }
  }, [nodeDrag, canvasDrag, zoom])

  const handleMouseUp = useCallback(() => {
    setCanvasDrag(null); setNodeDrag(null)
  }, [])

  const startNodeDrag = useCallback((e: React.MouseEvent, node: CanvasNode) => {
    e.stopPropagation()
    setNodeDrag({ id: node.id, startMx: e.clientX, startMy: e.clientY, startNx: node.x, startNy: node.y })
  }, [])

  // Block drag-drop onto canvas
  const handleDragStart = (e: React.DragEvent, id: string) => e.dataTransfer.setData('blockId', id)
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDropHighlight(true) }
  const handleDragLeave = () => setDropHighlight(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDropHighlight(false)
    const id = e.dataTransfer.getData('blockId')
    const block = getBlockById(id)
    if (block && !pinnedIds.includes(id)) {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (rect) {
        const x = (e.clientX - rect.left - canvasOffset.x) / zoom
        const y = (e.clientY - rect.top - canvasOffset.y) / zoom
        setPinnedIds(p => [...p, id])
        setNodes(p => [...p, { id, label: block.label, kind: block.kind, color: KIND_COLORS[block.kind] || C.blue, x, y }])
      }
    }
  }

  const isDone = phase === 'done'
  const isBuilding = phase === 'building'

  return (
    <div
      style={{ width: '100%', height: 'calc(100vh - 56px)', overflow: 'hidden', background: C.bg, position: 'relative', display: 'flex', userSelect: nodeDrag ? 'none' : 'auto' }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <style>{`
        @keyframes glow-pulse { 0%,100%{box-shadow:0 0 12px rgba(22,199,132,.18)} 50%{box-shadow:0 0 28px rgba(22,199,132,.45)} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes fade-up { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes node-in { from{opacity:0;transform:scale(.6)} to{opacity:1;transform:scale(1)} }
        @keyframes blink { 0%,100%{opacity:.3} 50%{opacity:1} }
        @keyframes line-in { from{stroke-dashoffset:200} to{stroke-dashoffset:0} }
        .block-row { transition:background .12s,border-color .12s; cursor:grab; }
        .block-row:hover { background:rgba(59,130,246,.06)!important; }
        .block-row:active { cursor:grabbing; }
        .cat-pill { transition:all .12s; cursor:pointer; }
        .node-card { animation:node-in .25s ease; }
        .node-card:hover { filter:brightness(1.15); }
        .chat-send:hover:not(:disabled) { background:rgba(22,199,132,.85)!important; }
        .open-btn:hover { background:rgba(22,199,132,.85)!important; transform:translateY(-1px); }
        @keyframes slide-from-right { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
      `}</style>

      {/* Background pipeline animation removed — the foreground CanvasAssembly
          above the chat already shows the pipeline assembling, so the ghost
          background was redundant + visually noisy. */}

      {/* ══ CANVAS BACKGROUND ════════════════════════════════════════════════════ */}
      <div
        ref={canvasRef}
        className="canvas-bg"
        onMouseDown={handleMouseDown}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          position: 'absolute', inset: 0, cursor: canvasDrag ? 'grabbing' : nodeDrag ? 'grabbing' : 'default',
          border: dropHighlight ? `1.5px dashed ${C.mint}40` : '1.5px solid transparent',
          background: `
            radial-gradient(ellipse 110% 90% at 12% 8%, rgba(59,130,246,.05) 0%, transparent 55%),
            radial-gradient(ellipse 75% 75% at 88% 88%, rgba(22,199,132,.04) 0%, transparent 50%),
            radial-gradient(ellipse 55% 45% at 50% 50%, rgba(139,92,246,.03) 0%, transparent 45%)
          `,
          zIndex: 0,
        }}
      >
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: isDone ? .04 : .08, pointerEvents: 'none' }}>
          <defs><pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0L0 0 0 40" fill="none" stroke={C.blue} strokeWidth=".5"/></pattern></defs>
          <rect width="100%" height="100%" fill="url(#g)"/>
        </svg>
        <div style={{ position: 'absolute', width: 350, height: 350, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,.05) 0%, transparent 70%)', top: '5%', left: '10%', animation: 'blink 5s ease-in-out infinite', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(22,199,132,.04) 0%, transparent 70%)', bottom: '18%', right: '12%', animation: 'blink 6s ease-in-out infinite 1.5s', pointerEvents: 'none' }} />

        {/* Canvas nodes layer */}
        <div style={{ position: 'absolute', inset: 0, transform: `translate(${canvasOffset.x}px,${canvasOffset.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
          {/* Connection lines — every block in column N feeds every block
              in column N+1, plus the rightmost real column feeds both
              built-in sinks (Backtest, Kraken). Mirrors how data actually
              flows through the strategy. */}
          {nodes.length > 1 && (() => {
            // Group by column (x position) so we can wire column → column
            const cols = new Map<number, typeof nodes>()
            for (const n of nodes) {
              const col = Math.round((n.x - COL_OFFSET_X) / COL_WIDTH)
              const arr = cols.get(col) ?? []
              arr.push(n); cols.set(col, arr)
            }
            const colKeys = Array.from(cols.keys()).sort((a, b) => a - b)
            const edges: { from: typeof nodes[number]; to: typeof nodes[number] }[] = []
            for (let ci = 0; ci < colKeys.length - 1; ci++) {
              const a = cols.get(colKeys[ci]) ?? []
              const b = cols.get(colKeys[ci + 1]) ?? []
              for (const x of a) for (const y of b) edges.push({ from: x, to: y })
            }
            return (
              <svg style={{ position: 'absolute', inset: 0, width: 9999, height: 9999, overflow: 'visible', pointerEvents: 'none' }}>
                {edges.map((e, i) => {
                  const x1 = e.from.x + 138, y1 = e.from.y + 18
                  const x2 = e.to.x,         y2 = e.to.y + 18
                  const cx = (x1 + x2) / 2
                  return (
                    <g key={`${e.from.id}-${e.to.id}-${i}`}>
                      <path d={`M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`}
                        fill="none" stroke={`${e.from.color}55`} strokeWidth="1.4"
                        strokeDasharray="6,5"
                        style={{ animation: 'line-in .7s ease forwards', strokeDashoffset: 200 }} />
                    </g>
                  )
                })}
              </svg>
            )
          })()}

          {/* Nodes */}
          {nodes.map(node => {
            const block = getBlockById(node.id)
            const isHov = hoveredNode === node.id
            return (
              <div
                key={node.id}
                data-node={node.id}
                className="node-card"
                onMouseDown={e => startNodeDrag(e, node)}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                style={{
                  position: 'absolute', left: node.x, top: node.y,
                  background: `${C.bg3}f0`, border: `1px solid ${node.color}45`,
                  borderLeft: `3px solid ${node.color}`,
                  borderRadius: 9, padding: '.45rem .7rem',
                  minWidth: 130, cursor: nodeDrag?.id === node.id ? 'grabbing' : 'grab',
                  boxShadow: `0 0 ${isHov ? 20 : 10}px ${node.color}${isHov ? '30' : '15'}`,
                  transition: 'box-shadow .15s',
                  backdropFilter: 'blur(4px)',
                  zIndex: nodeDrag?.id === node.id ? 50 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
                  <span style={{ color: node.color, fontSize: '.65rem' }}>{KIND_ICONS[node.kind]}</span>
                  <span style={{ fontSize: '.6rem', fontWeight: 600, color: C.white }}>{node.label}</span>
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={() => togglePin(node.id)}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.faint, cursor: 'pointer', fontSize: '.7rem', lineHeight: 1, padding: 0 }}>×</button>
                </div>
                {isHov && block && (
                  <div style={{ marginTop: '.25rem', fontSize: '.48rem', color: C.text, lineHeight: 1.4, maxWidth: 200 }}>
                    {block.description}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ══ LEFT PANEL: BLOCKS ═══════════════════════════════════════════════════ */}
      <div style={{
        position: 'relative', zIndex: 10,
        width: panelCollapsed ? 42 : 260,
        height: '100%', flexShrink: 0,
        background: `${C.bg2}e8`, borderRight: `1px solid ${C.border}`,
        backdropFilter: 'blur(14px)', display: 'flex', flexDirection: 'column',
        transition: 'width .25s ease', overflow: 'hidden',
      }}>
        {/* Collapse toggle */}
        <button
          onClick={() => setPanelCollapsed(v => !v)}
          style={{ padding: '.55rem', background: 'transparent', border: 'none', cursor: 'pointer', color: C.faint, display: 'flex', justifyContent: 'center', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          {panelCollapsed ? '›' : '‹'}
        </button>

        {!panelCollapsed && (
          <>
            <div style={{ padding: '.6rem .75rem .4rem', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
              <div style={{ fontSize: '.5rem', fontWeight: 700, color: C.mint, letterSpacing: '.1em', marginBottom: '.4rem' }}>BLOCKS</div>
              <input value={blockSearch} onChange={e => setBlockSearch(e.target.value)}
                placeholder="Search..." style={{ width: '100%', background: 'rgba(10,21,37,.6)', border: `1px solid ${C.border2}`, borderRadius: 5, padding: '.28rem .45rem', color: C.white, fontSize: '.56rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* Category tabs */}
            <div style={{ display: 'flex', gap: '.2rem', padding: '.4rem .6rem', flexWrap: 'wrap', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
              {(['all', ...CATEGORIES.map(c => c.id)] as const).map(id => {
                const cat = id === 'all' ? null : CATEGORIES.find(c => c.id === id)!
                const active = activeCat === id
                return (
                  <button key={id} className="cat-pill"
                    onClick={() => setActiveCat(id)}
                    style={{
                      padding: '.18rem .38rem', borderRadius: 4, fontSize: '.46rem', fontWeight: 600,
                      background: active ? `${cat?.color ?? C.mint}18` : 'transparent',
                      border: `1px solid ${active ? (cat?.color ?? C.mint) : C.border}`,
                      color: active ? (cat?.color ?? C.mint) : C.faint,
                    }}>
                    {id === 'all' ? 'ALL' : cat?.icon}
                  </button>
                )
              })}
            </div>

            {/* SYNE banner */}
            {(activeCat === 'all' || activeCat === 'api') && SYNE_BLOCK && (
              <div
                draggable onDragStart={e => handleDragStart(e, SYNE_BLOCK.id)}
                onClick={() => togglePin(SYNE_BLOCK.id)}
                style={{
                  margin: '.45rem .6rem', borderRadius: 8, padding: '.55rem .7rem', cursor: 'grab', flexShrink: 0,
                  background: `linear-gradient(135deg, rgba(22,199,132,.1) 0%, rgba(59,130,246,.07) 100%)`,
                  border: `1px solid ${C.mint}35`, animation: 'glow-pulse 2.5s ease-in-out infinite',
                  opacity: pinnedIds.includes(SYNE_BLOCK.id) ? .65 : 1,
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem', marginBottom: '.18rem' }}>
                  <span style={{ fontSize: '.52rem', fontWeight: 800, color: C.mint }}>SYNE</span>
                  <span style={{ fontSize: '.38rem', padding: '.08rem .3rem', borderRadius: 3, background: `${C.mint}18`, color: C.mint, fontWeight: 700 }}>ASE PRODUCT</span>
                </div>
                <div style={{ fontSize: '.5rem', fontWeight: 600, color: C.white, marginBottom: '.1rem' }}>SYNE Terminal</div>
                <div style={{ fontSize: '.44rem', color: C.text, lineHeight: 1.35 }}>Live market intel — geo-macro, on-chain alerts, news catalysts.</div>
                {pinnedIds.includes(SYNE_BLOCK.id) && <div style={{ marginTop: '.25rem', fontSize: '.42rem', color: C.mint }}>✓ Active</div>}
              </div>
            )}

            {/* Block list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '.3rem .5rem', display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
              {CATEGORIES.filter(c => activeCat === 'all' || activeCat === c.id).map(cat => {
                const catBlocks = displayBlocks.filter(b => b.kind === cat.id && b.id !== 'api.syne')
                if (!catBlocks.length) return null
                return (
                  <div key={cat.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.3rem', padding: '.2rem .2rem', marginTop: '.2rem' }}>
                      <span style={{ fontSize: '.48rem', color: cat.color }}>{cat.icon}</span>
                      <span style={{ fontSize: '.46rem', fontWeight: 700, color: cat.color, letterSpacing: '.06em', textTransform: 'uppercase' }}>{cat.label}</span>
                    </div>
                    {catBlocks.map(block => {
                      const pinned = pinnedIds.includes(block.id)
                      return (
                        <div key={block.id} className="block-row"
                          draggable onDragStart={e => handleDragStart(e, block.id)}
                          onClick={() => togglePin(block.id)}
                          style={{
                            padding: '.38rem .5rem', borderRadius: 6, marginBottom: '.18rem',
                            background: pinned ? `${cat.color}10` : 'rgba(10,21,37,.4)',
                            border: `1px solid ${pinned ? cat.color + '45' : C.border}`,
                            borderLeft: `2px solid ${pinned ? cat.color : C.border}`,
                          }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '.3rem' }}>
                              <span style={{ fontSize: '.5rem', color: cat.color }}>{cat.icon}</span>
                              <span style={{ fontSize: '.54rem', fontWeight: 600, color: pinned ? C.white : C.text }}>{block.label}</span>
                            </div>
                            {pinned && <span style={{ fontSize: '.4rem', color: cat.color }}>✓</span>}
                          </div>
                          <div style={{ fontSize: '.43rem', color: C.faint, marginTop: '.08rem', lineHeight: 1.3 }}>{block.description}</div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>

            {pinnedIds.length > 0 && (
              <div style={{ padding: '.4rem .65rem', borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <span style={{ fontSize: '.48rem', color: C.mint }}>{pinnedIds.length} active</span>
                <button onClick={() => { setPinnedIds([]); setNodes([]) }}
                  style={{ fontSize: '.42rem', color: C.faint, background: 'none', border: 'none', cursor: 'pointer' }}>clear</button>
              </div>
            )}
          </>
        )}

        {/* Icon-only view when collapsed */}
        {panelCollapsed && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '.3rem', display: 'flex', flexDirection: 'column', gap: '.2rem', alignItems: 'center' }}>
            {SYNE_BLOCK && (
              <div title="SYNE Terminal" onClick={() => togglePin(SYNE_BLOCK.id)} style={{ width: 28, height: 28, borderRadius: 6, background: pinnedIds.includes(SYNE_BLOCK.id) ? `${C.mint}20` : 'transparent', border: `1px solid ${C.mint}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '.6rem' }}>◈</div>
            )}
            {CATEGORIES.map(cat => (
              <div key={cat.id} title={cat.label} style={{ width: 28, height: 28, borderRadius: 6, background: activeCat === cat.id ? `${cat.color}15` : 'transparent', border: `1px solid ${activeCat === cat.id ? cat.color : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: cat.color, fontSize: '.6rem' }}
                onClick={() => { setActiveCat(cat.id); setPanelCollapsed(false) }}>{cat.icon}</div>
            ))}
          </div>
        )}
      </div>

      {/* ══ MAIN AREA ════════════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 10, overflow: 'hidden' }}>

        {/* Top utility bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '.4rem', padding: '.4rem .75rem', borderBottom: `1px solid ${C.border}`, flexShrink: 0, background: `${C.bg2}cc`, backdropFilter: 'blur(8px)' }}>
          <button onClick={() => router.push('/dashboard/build/manage')}
            style={{ display: 'flex', alignItems: 'center', gap: '.3rem', padding: '.24rem .55rem', borderRadius: 6, background: 'transparent', border: `1px solid ${C.border}`, color: C.faint, fontSize: '.52rem', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
            <span style={{ fontSize: '.6rem' }}>◈</span> Manage
            {loadDrafts().length > 0 && <span style={{ background: C.mint, color: '#000', borderRadius: 3, padding: '0 .3rem', fontSize: '.42rem', fontWeight: 700 }}>{loadDrafts().length}</span>}
          </button>
          <button onClick={() => { setDrafts(loadDrafts()); setAgentsOpen(true) }}
            style={{ display: 'flex', alignItems: 'center', gap: '.3rem', padding: '.24rem .55rem', borderRadius: 6, background: 'transparent', border: `1px solid ${C.border}`, color: C.faint, fontSize: '.52rem', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
            <span style={{ fontSize: '.6rem' }}>★</span> Drafts
          </button>
          <a href="/dashboard/build/docs"
            style={{ display: 'flex', alignItems: 'center', gap: '.28rem', padding: '.24rem .55rem', borderRadius: 6, background: 'transparent', border: `1px solid ${C.border}`, color: C.faint, fontSize: '.52rem', cursor: 'pointer', fontFamily: 'var(--font-mono)', textDecoration: 'none' }}>
            <span>⊙</span> Docs
          </a>
        </div>

        {/* ── AGENTS DRAWER ── */}
        {agentsOpen && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex' }}
            onClick={e => { if (e.target === e.currentTarget) setAgentsOpen(false) }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)' }} onClick={() => setAgentsOpen(false)} />
            <div style={{
              position: 'absolute', right: 0, top: 0, bottom: 0, width: 340,
              background: `${C.bg2}f8`, borderLeft: `1px solid ${C.border}`,
              backdropFilter: 'blur(16px)', display: 'flex', flexDirection: 'column',
              animation: 'slide-from-right .2s ease',
              zIndex: 1,
            }}>
              <div style={{ padding: '.75rem 1rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '.58rem', fontWeight: 700, color: C.white, fontFamily: 'var(--font-mono)' }}>Agent Drafts</div>
                  <div style={{ fontSize: '.46rem', color: C.faint, marginTop: '.1rem' }}>{drafts.length} saved</div>
                </div>
                <button onClick={() => setAgentsOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.faint, fontSize: '.9rem' }}>✕</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '.5rem .75rem', display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                {drafts.length === 0 && (
                  <div style={{ padding: '2rem 0', textAlign: 'center', fontSize: '.58rem', color: C.faint }}>
                    No drafts yet. Build your first strategy above.
                  </div>
                )}
                {drafts.map(d => {
                  const isCurrent = d.id === currentDraftId
                  const fileCount = Object.keys(d.files).length
                  const age = Date.now() - d.createdAt
                  const ageStr = age < 60000 ? 'just now' : age < 3600000 ? Math.round(age/60000) + 'm ago' : Math.round(age/3600000) + 'h ago'
                  return (
                    <div key={d.id} style={{
                      padding: '.65rem .75rem', borderRadius: 9,
                      background: isCurrent ? `${C.mint}0a` : C.bg3,
                      border: `1px solid ${isCurrent ? C.mint + '40' : C.border}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '.4rem', marginBottom: '.35rem' }}>
                        <div style={{ fontSize: '.58rem', fontWeight: 600, color: C.white, flex: 1, lineHeight: 1.3 }}>{d.name}</div>
                        {isCurrent && <span style={{ fontSize: '.42rem', color: C.mint, background: `${C.mint}15`, border: `1px solid ${C.mint}30`, borderRadius: 3, padding: '.05rem .3rem', flexShrink: 0 }}>current</span>}
                      </div>
                      <div style={{ fontSize: '.48rem', color: C.faint, marginBottom: '.45rem', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{d.prompt}</div>
                      <div style={{ display: 'flex', gap: '.3rem', marginBottom: '.45rem', flexWrap: 'wrap' }}>
                        {Object.keys(d.files).map(f => {
                          const ext = f.split('.').pop() ?? ''
                          const lc = { ts: C.blue, py: C.mint, json: C.orange }[ext] ?? C.faint
                          return <span key={f} style={{ fontSize: '.42rem', color: lc, fontFamily: 'var(--font-mono)', background: `${lc}12`, padding: '.05rem .3rem', borderRadius: 3 }}>{f}</span>
                        })}
                        {fileCount === 0 && <span style={{ fontSize: '.44rem', color: C.faint }}>no files extracted</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '.44rem', color: C.faint, fontFamily: 'var(--font-mono)' }}>{ageStr}</span>
                        <div style={{ display: 'flex', gap: '.3rem' }}>
                          <button
                            onClick={() => {
                              saveDraft(d) // re-saves to ase-files
                              setCurrentDraftId(d.id)
                              setAgentsOpen(false)
                              router.push('/dashboard/build/code')
                            }}
                            style={{ padding: '.22rem .5rem', borderRadius: 5, background: C.mint, color: '#000', border: 'none', fontSize: '.48rem', fontWeight: 700, cursor: 'pointer' }}>
                            Open →
                          </button>
                          <button
                            onClick={() => {
                              if (!confirm('Delete this draft?')) return
                              try {
                                const updated = drafts.filter(x => x.id !== d.id)
                                localStorage.setItem(DRAFTS_KEY, JSON.stringify(updated))
                                setDrafts(updated)
                              } catch {}
                            }}
                            style={{ padding: '.22rem .4rem', borderRadius: 5, background: 'transparent', border: `1px solid ${C.border}`, color: C.faint, fontSize: '.46rem', cursor: 'pointer' }}>
                            ×
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{ padding: '.6rem .75rem', borderTop: `1px solid ${C.border}` }}>
                <button onClick={() => router.push('/dashboard/build/code?new=1')}
                  style={{ width: '100%', padding: '.4rem 0', borderRadius: 7, background: 'transparent', border: `1px solid ${C.border}`, color: C.faint, fontSize: '.54rem', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
                  + New blank strategy
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── IDLE: centered prompt ── */}
        {phase === 'idle' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', animation: 'fade-up .4s ease' }}>
            <div style={{ animation: 'float 4s ease-in-out infinite', marginBottom: '1.75rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.65rem', fontWeight: 800, color: C.white, letterSpacing: '-.02em', lineHeight: 1.15, marginBottom: '.4rem' }}>Build an Agent</div>
              <div style={{ fontSize: '.72rem', color: C.faint }}>Describe your strategy or drag blocks from the left</div>
            </div>

            <div style={{ width: '100%', maxWidth: 540, background: `${C.bg2}ee`, borderRadius: 14, border: `1px solid ${C.border2}`, padding: '1.1rem', boxShadow: '0 20px 60px rgba(0,0,0,.5)', backdropFilter: 'blur(12px)' }}>
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleBuild() } }}
                placeholder="e.g. BTC momentum when RSI < 30 and EMA(12) crosses EMA(26), 8% kill switch, weekly rebalance"
                style={{
                  width: '100%', background: 'rgba(10,21,37,.5)', border: `1px solid rgba(22,199,132,.12)`,
                  borderRadius: 8, padding: '.7rem .8rem', color: C.white,
                  fontFamily: 'var(--font-mono)', fontSize: '.66rem', lineHeight: 1.55,
                  outline: 'none', resize: 'none', minHeight: 80, boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: '.35rem', marginTop: '.5rem', flexWrap: 'wrap' }}>
                {['BTC/ETH momentum + EMA cross', 'Mean-reversion on SOL RSI', 'Fear & Greed composite signal'].map(s => (
                  <button key={s} onClick={() => setPrompt(s)}
                    style={{ padding: '.18rem .45rem', borderRadius: 4, background: 'rgba(10,21,37,.5)', border: `1px solid ${C.border}`, color: C.faint, fontSize: '.46rem', cursor: 'pointer' }}>{s}</button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '.65rem' }}>
                <span style={{ fontSize: '.44rem', color: C.faint, fontFamily: 'var(--font-mono)' }}>⌘↵ build</span>
                <button onClick={handleBuild} disabled={!prompt.trim() && pinnedIds.length === 0}
                  style={{
                    padding: '.45rem 1.25rem', borderRadius: 8, fontWeight: 700, fontSize: '.62rem',
                    background: !prompt.trim() && pinnedIds.length === 0 ? C.border : C.mint,
                    color: '#000', border: 'none', cursor: 'pointer', transition: 'all .15s',
                  }}>Build →</button>
              </div>
            </div>

            {pinnedIds.length > 0 && (
              <div style={{ marginTop: '1.25rem', display: 'flex', gap: '.35rem', flexWrap: 'wrap', justifyContent: 'center', animation: 'fade-up .3s ease' }}>
                {pinnedIds.map(id => { const b = getBlockById(id); if (!b) return null; return (
                  <span key={id} style={{ padding: '.18rem .45rem', borderRadius: 4, fontSize: '.48rem', background: `${KIND_COLORS[b.kind]}12`, border: `1px solid ${KIND_COLORS[b.kind]}35`, color: KIND_COLORS[b.kind] }}>{KIND_ICONS[b.kind]} {b.label}</span>
                )})}
              </div>
            )}
          </div>
        )}

        {/* ── BUILDING / DONE: workspace ── */}
        {phase !== 'idle' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'fade-up .35s ease' }}>

            {/* Pipeline assembly graphic — sits ABOVE the building header
                so the user sees the canvas come together before any text */}
            <CanvasAssembly blocks={pinnedIds} phase={phase as 'idle' | 'building' | 'done' | 'error'} height={220} />

            {/* Header */}
            <div style={{ padding: '.5rem .85rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: '.5rem', flexShrink: 0, background: `${C.bg2}cc`, backdropFilter: 'blur(8px)' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: isBuilding ? C.orange : C.mint, animation: isBuilding ? 'blink .6s infinite' : 'none' }} />
              <span style={{ fontSize: '.55rem', fontWeight: 700, color: C.white, fontFamily: 'var(--font-mono)' }}>
                {isBuilding ? 'Building strategy...' : 'Agent ready'}
              </span>
              <div style={{ flex: 1 }} />
              {isDone && (
                <button className="open-btn" onClick={() => router.push('/dashboard/build/code')}
                  style={{ padding: '.3rem .75rem', borderRadius: 7, background: C.mint, color: '#000', fontWeight: 700, fontSize: '.56rem', border: 'none', cursor: 'pointer', transition: 'all .15s' }}>
                  Open in Code →
                </button>
              )}
              <button onClick={() => { setPhase('idle'); setChat([]); setExtractedFiles([]); setBtResult(null) }}
                style={{ fontSize: '.5rem', color: C.faint, background: 'none', border: `1px solid ${C.border}`, borderRadius: 5, padding: '.22rem .45rem', cursor: 'pointer' }}>← New</button>
            </div>

            {/* Thinking strip */}
            {(isBuilding || (isDone && thinkStep > 0)) && (
              <div style={{ flexShrink: 0, borderBottom: `1px solid ${C.border}`, background: 'rgba(22,199,132,.025)' }}>
                <button onClick={() => setThinkOpen(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: '.45rem', background: 'none', border: 'none', cursor: 'pointer', width: '100%', padding: '.45rem .85rem' }}>
                  <div style={{ display: 'flex', gap: '.18rem' }}>
                    {[0,1,2].map(i => (
                      <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: thinkDone ? C.mint : C.orange, animation: !thinkDone ? `blink .8s ease-in-out infinite ${i * .22}s` : 'none' }} />
                    ))}
                  </div>
                  <span style={{ fontSize: '.52rem', fontWeight: 600, color: thinkDone ? C.mint : C.orange, fontFamily: 'var(--font-mono)' }}>
                    {thinkDone ? 'Initialization complete' : THINKING_STEPS[Math.min(thinkStep, THINKING_STEPS.length - 1)]}
                  </span>
                  <span style={{ fontSize: '.44rem', color: C.faint, marginLeft: 'auto' }}>{thinkOpen ? '▾' : '▸'}</span>
                </button>
                {thinkOpen && (
                  <div style={{ padding: '.05rem .85rem .5rem', display: 'flex', flexDirection: 'column', gap: '.18rem' }}>
                    {THINKING_STEPS.slice(0, thinkStep + 1).map((s, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '.35rem', opacity: i < thinkStep ? .45 : 1, animation: 'fade-up .25s ease' }}>
                        <span style={{ fontSize: '.42rem', color: i < thinkStep ? C.mint : C.orange, fontFamily: 'var(--font-mono)' }}>{i < thinkStep ? '✓' : '›'}</span>
                        <span style={{ fontSize: '.5rem', color: i < thinkStep ? C.faint : C.text, fontFamily: 'var(--font-mono)' }}>{s}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Files strip (collapsed, post-build) */}
            {isDone && extractedFiles.length > 0 && (
              <div style={{ flexShrink: 0, borderBottom: `1px solid ${C.border}`, padding: '.4rem .85rem', background: `${C.bg3}88` }}>
                <div style={{ fontSize: '.46rem', color: C.faint, fontFamily: 'var(--font-mono)', letterSpacing: '.08em', marginBottom: '.3rem' }}>FILES CREATED</div>
                <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                  {extractedFiles.map(f => {
                    const ext = f.name.split('.').pop() ?? ''
                    const lc = { ts: C.blue, py: C.mint, json: C.orange, md: C.muted }[ext] ?? C.faint
                    const isExp = expandedFile === f.name
                    return (
                      <button key={f.name} onClick={() => setExpandedFile(isExp ? null : f.name)}
                        style={{ padding: '.2rem .45rem', borderRadius: 5, background: isExp ? `${lc}14` : 'rgba(10,21,37,.5)', border: `1px solid ${isExp ? lc + '50' : C.border}`, color: isExp ? lc : C.text, fontFamily: 'var(--font-mono)', fontSize: '.48rem', cursor: 'pointer' }}>
                        {f.name}
                      </button>
                    )
                  })}
                  <button onClick={() => router.push('/dashboard/build/code')}
                    style={{ padding: '.2rem .5rem', borderRadius: 5, background: `${C.mint}12`, border: `1px solid ${C.mint}35`, color: C.mint, fontFamily: 'var(--font-mono)', fontSize: '.48rem', cursor: 'pointer', fontWeight: 700 }}>
                    Open Editor →
                  </button>
                </div>
                {expandedFile && (() => {
                  const f = extractedFiles.find(x => x.name === expandedFile)!
                  return (
                    <pre style={{ marginTop: '.4rem', background: 'rgba(0,0,0,.5)', border: `1px solid ${C.border}`, borderRadius: 7, padding: '.5rem .7rem', fontSize: '.5rem', fontFamily: 'var(--font-mono)', color: C.blue2, overflowX: 'auto', maxHeight: 160, overflowY: 'auto', lineHeight: 1.5 }}>
                      {f.content.slice(0, 1500)}{f.content.length > 1500 ? '\n...' : ''}
                    </pre>
                  )
                })()}
              </div>
            )}

            {/* Backtest strip */}
            <BtStrip result={btResult} loading={btLoading} error={btError} />

            {/* AI Chat (dominant) */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div ref={chatScrollRef} style={{ flex: 1, overflowY: 'auto', padding: '.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '.65rem' }}>
                {chat.map(msg => (
                  <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', animation: 'fade-up .2s ease' }}>
                    <div style={{ fontSize: '.42rem', color: C.faint, marginBottom: '.2rem', letterSpacing: '.08em', fontFamily: 'var(--font-mono)' }}>
                      {msg.role === 'user' ? 'YOU' : 'ASE AI'}
                    </div>
                    <div style={{
                      maxWidth: msg.role === 'user' ? '70%' : '90%',
                      padding: '.55rem .75rem', borderRadius: 10,
                      background: msg.role === 'user' ? `rgba(22,199,132,.08)` : `${C.bg3}cc`,
                      border: `1px solid ${msg.role === 'user' ? C.mint + '25' : C.border}`,
                    }}>
                      {msg.role === 'assistant'
                        ? <CleanMsg text={msg.content} />
                        : <span style={{ fontSize: '.6rem', color: C.mint, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                      }
                      {msg.pending && (
                        <span style={{ display: 'inline-flex', gap: '.12rem', marginLeft: '.25rem', verticalAlign: 'middle' }}>
                          {[0,1,2].map(i => <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: C.mint, display: 'inline-block', animation: `blink .6s ease-in-out infinite ${i * .18}s` }} />)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Input */}
              <div style={{ padding: '.6rem .85rem', borderTop: `1px solid ${C.border}`, display: 'flex', gap: '.45rem', flexShrink: 0, background: `${C.bg2}cc`, backdropFilter: 'blur(8px)' }}>
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                  placeholder={isDone ? 'Ask AI to refine the strategy, explain results, or add signals...' : 'Ask anything...'}
                  disabled={chatStreaming}
                  style={{ flex: 1, background: 'rgba(10,21,37,.5)', border: `1px solid ${C.border2}`, borderRadius: 8, padding: '.42rem .65rem', color: C.white, fontSize: '.6rem', outline: 'none', fontFamily: 'var(--font-mono)' }}
                />
                <button className="chat-send" onClick={sendChat}
                  disabled={chatStreaming || !chatInput.trim()}
                  style={{ padding: '.42rem .85rem', borderRadius: 8, background: chatStreaming || !chatInput.trim() ? C.border : C.mint, color: chatStreaming || !chatInput.trim() ? C.faint : '#000', fontSize: '.6rem', fontWeight: 700, border: 'none', cursor: chatStreaming ? 'not-allowed' : 'pointer', transition: 'all .15s' }}>→</button>
                {isDone && (
                  <button className="open-btn" onClick={() => router.push('/dashboard/build/code')}
                    style={{ padding: '.42rem .75rem', borderRadius: 8, background: C.mint, color: '#000', fontWeight: 700, fontSize: '.56rem', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .15s' }}>Code →</button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Zoom controls */}
      <div style={{ position: 'absolute', right: 14, bottom: 14, zIndex: 20, display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
        {[['−', () => setZoom(z => Math.max(.4, z - .15))], ['+', () => setZoom(z => Math.min(2, z + .15))], ['⊙', () => { setZoom(1); setCanvasOffset({ x: 0, y: 0 }) }]].map(([l, fn]) => (
          <button key={l as string} onClick={fn as () => void}
            style={{ width: 26, height: 26, borderRadius: 5, background: `${C.bg2}cc`, border: `1px solid ${C.border}`, color: C.text, cursor: 'pointer', fontSize: '.58rem', backdropFilter: 'blur(8px)' }}>{l as string}</button>
        ))}
      </div>
    </div>
  )
}
