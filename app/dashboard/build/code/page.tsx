'use client'

import { useState, useRef, useEffect, useCallback, useMemo, use } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import {
  C, UNIVERSES, CONFIG_FIELD_META, DATA_APIS, ML_TOOLS,
  AGENT_ICONS, GRADE_CLR, DEFAULT_FILES,
} from '@/lib/backtest-config'
import { STRATEGIES } from '@/lib/backtest'
import { ALL_BLOCKS, BLOCKS_BY_CATEGORY, CATEGORY_META, type BlockCategory } from '@/lib/llm-blocks'
import { BLOCKS as PIPELINE_BLOCKS } from '@/lib/quant/blocks'

// Compact pipeline strip rendered at the top of the Code page so the user
// always sees the same canvas state as Build. Re-derives the block list
// from the file contents AND any blocks the user has pinned so it stays
// in sync as AI applies edits or the user toggles blocks in the sidebar.
function CodeCanvasStrip({ files, pinned }: { files: Record<string, string>; pinned: string[] }) {
  const corpus = Object.values(files).join('\n')
  // Mine for any block id or label mention so the visual reflects what the
  // generated code actually wires up.
  const mentioned = PIPELINE_BLOCKS.filter(b =>
    pinned.includes(b.id) ||
    corpus.includes(b.id) ||
    new RegExp(`\\b${b.label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i').test(corpus)
  )

  const ORDER: Record<string, number> = { data: 0, indicator: 1, ml: 2, api: 3, signal: 4, risk: 5, execution: 6 }
  const KCLR: Record<string, string> = {
    data: '#3b82f6', indicator: '#a855f7', ml: '#ec4899',
    api: '#06b6d4', risk: '#ef4444', execution: '#f59e0b', signal: '#16c784',
  }
  const sorted = [...mentioned].sort((a, b) => (ORDER[a.kind] ?? 9) - (ORDER[b.kind] ?? 9))
  const sinks = [
    { id: 'connector.backtest', label: 'Backtest', color: '#16c784' },
    { id: 'connector.kraken',   label: 'Kraken',   color: '#f59e0b' },
  ]

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.4rem 0.75rem',
      borderBottom: `1px solid ${C.border}`, background: `${C.bg2}`,
      flexShrink: 0, overflowX: 'auto',
    }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.46rem', color: C.faint, letterSpacing: '0.1em', flexShrink: 0 }}>PIPELINE</span>
      {sorted.length === 0 && (
        <span style={{ fontSize: '0.55rem', color: C.faint, fontFamily: 'var(--font-mono)' }}>
          No blocks detected — AI will populate as it edits files
        </span>
      )}
      {sorted.map((b, i) => (
        <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
          {i > 0 && <span style={{ color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '0.6rem' }}>→</span>}
          <span style={{
            padding: '0.18rem 0.45rem', borderRadius: 4,
            fontFamily: 'var(--font-mono)', fontSize: '0.5rem', fontWeight: 600,
            color: KCLR[b.kind] ?? C.text,
            background: `${KCLR[b.kind] ?? C.text}15`,
            border: `1px solid ${KCLR[b.kind] ?? C.text}30`,
          }}>{b.label}</span>
        </div>
      ))}
      {sorted.length > 0 && sinks.map((s) => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
          <span style={{ color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '0.6rem' }}>→</span>
          <span style={{
            padding: '0.18rem 0.45rem', borderRadius: 4,
            fontFamily: 'var(--font-mono)', fontSize: '0.5rem', fontWeight: 700,
            color: s.color, background: `${s.color}10`, border: `1px dashed ${s.color}55`,
          }}>{s.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface ChatMsg { role: 'user' | 'ai'; text: string; edits?: FileEdit[] }
interface FileEdit { filename: string; content: string; lang: string }

// Universe symbols lookup (flat arrays for runtime)
const UNIVERSE_SYMBOLS: Record<string, string[]> = Object.fromEntries(
  Object.entries(UNIVERSES).map(([k, v]) => [k, v.symbols])
)

function extractConfigFields(jsonStr: string): Record<string, { value: string | number | boolean; type: 'string' | 'number' | 'boolean' | 'array' }> {
  const fields: Record<string, { value: string | number | boolean; type: 'string' | 'number' | 'boolean' | 'array' }> = {}
  try {
    const parsed = JSON.parse(jsonStr)
    for (const [k, v] of Object.entries(parsed)) {
      if (Array.isArray(v)) {
        fields[k] = { value: JSON.stringify(v), type: 'array' }
      } else if (typeof v === 'boolean') {
        fields[k] = { value: v, type: 'boolean' }
      } else if (typeof v === 'number') {
        fields[k] = { value: v, type: 'number' }
      } else if (typeof v === 'string') {
        fields[k] = { value: v, type: 'string' }
      }
    }
  } catch {}
  return fields
}

// CONFIG_FIELD_META, AGENT_ICONS, ML_TOOLS, DATA_APIS, TEMPLATES, 
// UNIVERSES, GRADE_CLR, DEFAULT_FILES are all imported from @/lib/backtest-config
// STRATEGIES is imported from @/lib/backtest for codebase-aware config

const STRATEGY_MAP: Record<string, string> = {
  'momentum_conservative': 'crypto_momentum',
  'mean_reversion_active': 'crypto_mean_reversion',
  'composite_balanced': 'crypto_momentum',
  'ml_aggressive': 'crypto_momentum',
  'risk_parity': 'trend_following',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fP = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
const col = (v: number) => v >= 0 ? C.mint : C.red

function Tag({ text, color = C.blue }: { text: string; color?: string }) {
  return <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', padding: '.1rem .42rem', borderRadius: 4, background: `${color}14`, color, border: `1px solid ${color}28` }}>{text}</span>
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, padding: '.5rem .65rem' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.44rem', color: C.faint, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '.15rem' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.82rem', fontWeight: 700, color: color ?? C.white }}>{value}</div>
    </div>
  )
}

// ── Simple markdown renderer ───────────────────────────────────────────────────
// Build-page-style clean renderer. No per-message Apply buttons (files
// auto-apply when streaming finishes), no collapse, just prose + concise
// pre-blocks. Mirrors `CleanMsg` from app/dashboard/build/page.tsx.
function MdText({ text }: { text: string; onApply?: (edit: FileEdit) => void }) {
  const lines = text.split('\n')
  const out: React.ReactNode[] = []
  let inCode = false
  let codeLines: string[] = []
  let codeLabel = ''
  let key = 0

  for (const raw of lines) {
    if (raw.startsWith('```')) {
      if (inCode) {
        const fileMatch = codeLines[0]?.match(/^(?:\/\/|#)\s*FILE:\s*(.+)$/)
        const delMatch  = codeLines[0]?.match(/^(?:\/\/|#)\s*DELETE:\s*(.+)$/)
        const label = fileMatch ? `FILE · ${fileMatch[1].trim()}` : delMatch ? `DELETE · ${delMatch[1].trim()}` : codeLabel
        const body = (fileMatch || delMatch) ? codeLines.slice(1).join('\n') : codeLines.join('\n')
        const accent = fileMatch ? C.mint : delMatch ? '#E45867' : C.blue2
        out.push(
          <div key={key++} style={{ margin: '.45rem 0', borderRadius: 7, overflow: 'hidden', border: `1px solid ${accent}30` }}>
            <div style={{ padding: '.18rem .55rem', background: `${accent}10`, fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: accent, letterSpacing: '.06em', fontWeight: 700 }}>
              {label || (fileMatch ? '' : 'CODE')}
            </div>
            <pre style={{ margin: 0, padding: '.45rem .65rem', background: 'rgba(0,0,0,.5)', fontFamily: 'var(--font-mono)', fontSize: '.54rem', color: C.blue2, lineHeight: 1.5, overflowX: 'auto', maxHeight: 260, overflowY: 'auto' }}>
              {body.trim()}
            </pre>
          </div>
        )
        inCode = false; codeLines = []; codeLabel = ''
      } else {
        codeLabel = raw.slice(3).trim()
        inCode = true
      }
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
          <span>{applyInline(clean.replace(/^[-•]\s/, ''))}</span>
        </div>
      )
    } else {
      out.push(
        <div key={key++} style={{
          fontWeight: isHeading ? 700 : 400,
          color: isHeading ? C.white : C.text,
          fontSize: isHeading ? '.66rem' : '.62rem',
          marginTop: isHeading ? '.4rem' : 0,
        }}>{applyInline(clean)}</div>
      )
    }
  }
  return <div style={{ lineHeight: 1.65, display: 'flex', flexDirection: 'column', gap: '.06rem' }}>{out}</div>
}

function InlineText({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <>
      {lines.map((line, i) => {
        if (line.startsWith('# ')) return <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', fontWeight: 700, color: C.white, marginTop: '.5rem', marginBottom: '.2rem' }}>{line.slice(2)}</div>
        if (line.startsWith('## ')) return <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '.66rem', fontWeight: 700, color: C.blue2, marginTop: '.4rem', marginBottom: '.15rem' }}>{line.slice(3)}</div>
        if (line.startsWith('- ') || line.startsWith('* ')) return <div key={i} style={{ display: 'flex', gap: '.3rem', color: C.text, fontSize: '.68rem', lineHeight: 1.6 }}><span style={{ color: C.faint, flexShrink: 0 }}>·</span><span>{applyInline(line.slice(2))}</span></div>
        if (line.trim() === '') return <div key={i} style={{ height: '.35rem' }} />
        return <div key={i} style={{ color: C.text, fontSize: '.68rem', lineHeight: 1.65 }}>{applyInline(line)}</div>
      })}
    </>
  )
}

function applyInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  const re = /(\*\*(.+?)\*\*|`(.+?)`|\*(.+?)\*)/g
  let last = 0, m: RegExpExecArray | null, k = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={k++}>{text.slice(last, m.index)}</span>)
    if (m[2]) parts.push(<strong key={k++} style={{ color: C.white }}>{m[2]}</strong>)
    else if (m[3]) parts.push(<code key={k++} style={{ fontFamily: 'var(--font-mono)', fontSize: '.64rem', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 3, padding: '0 .25rem', color: C.blue2 }}>{m[3]}</code>)
    else if (m[4]) parts.push(<em key={k++} style={{ color: C.muted }}>{m[4]}</em>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(<span key={k++}>{text.slice(last)}</span>)
  return parts
}

// ── Code editor ───────────────────────────────────────────────────────────────
function CodeEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const lines = value.split('\n')
  const handleTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    e.preventDefault()
    const ta = taRef.current!
    const s = ta.selectionStart, end = ta.selectionEnd
    const next = value.substring(0, s) + '  ' + value.substring(end)
    onChange(next)
    requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = s + 2 })
  }
  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ userSelect: 'none', pointerEvents: 'none', padding: '.85rem 0', background: C.bg, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 42 }}>
        {lines.map((_, i) => <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '.68rem', lineHeight: '1.55rem', color: C.faint, paddingRight: '.55rem' }}>{i + 1}</div>)}
      </div>
      <textarea ref={taRef} value={value} onChange={e => onChange(e.target.value)} onKeyDown={handleTab} spellCheck={false}
        style={{ flex: 1, resize: 'none', border: 'none', outline: 'none', background: C.bg, color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.68rem', lineHeight: '1.55rem', padding: '.85rem .85rem .85rem .6rem', overflowY: 'auto' }} />
    </div>
  )
}

// ── Terminal ──────────────────────────────────────────────────────────────────
function TerminalPanel({ lines, input, onInput, onSubmit, loading }: { lines: string[]; input: string; onInput: (v: string) => void; onSubmit: () => void; loading: boolean }) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [lines])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bg }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '.4rem .85rem', fontFamily: 'var(--font-mono)', fontSize: '.68rem' }}>
        {lines.map((l, i) => <div key={i} style={{ color: l.startsWith('[ERR]') ? C.red : l.startsWith('[OK]') ? C.mint : l.startsWith('>') ? C.blue2 : l.startsWith('[RUN]') ? C.orange : C.muted, lineHeight: '1.55rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{l}</div>)}
        {loading && <div style={{ color: C.orange, lineHeight: '1.55rem' }}>[RUN] running...</div>}
        <div ref={endRef} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', borderTop: `1px solid ${C.border}`, padding: '.28rem .65rem', gap: '.35rem' }}>
        <span style={{ color: C.mint, fontFamily: 'var(--font-mono)', fontSize: '.7rem' }}>›</span>
        <input value={input} onChange={e => onInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && onSubmit()} placeholder="type a command (help)…" style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.68rem' }} />
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function QuantLabPage() {
  const searchParams = useSearchParams()
  const loadAgentSlug = searchParams.get('load_agent')
  const editMode = searchParams.get('edit') === '1'
  const isNew = searchParams.get('new') === '1'

  // Load agent from URL params on mount
  useEffect(() => {
    // If 'new' param, clear localStorage and load fresh template
    if (isNew) {
      try { localStorage.removeItem('ase-files') } catch {}
      setFileContents(DEFAULT_FILES)
      setAgentName('New Strategy')
      setTermLines(['> Fresh template loaded', '> Edit strategy.ts or config.json', '> Cmd+Enter to run backtest', ''])
      return
    }

    if (loadAgentSlug) {
      // Fetch agent by slug and load strategy code
      fetch(`/api/agents/${loadAgentSlug}`)
        .then(res => res.json())
        .then(data => {
          if (data.agent) {
            const agent = data.agent
            setFileContents(prev => ({
              ...prev,
              'strategy.ts': agent.strategy_code || prev['strategy.ts'],
              'config.json': agent.strategy_config ? JSON.stringify(JSON.parse(agent.strategy_config), null, 2) : prev['config.json']
            }))
            setAgentName(agent.name || 'Imported Agent')
            setTermLines(['Loaded agent: ' + agent.name, 'Edit strategy.ts or config.json', 'Cmd+Enter to run backtest', ''])
          }
        })
        .catch(() => {
          setTermLines(['Failed to load agent: ' + loadAgentSlug, 'Create a new strategy instead', ''])
        })
    } else if (editMode) {
      const name = searchParams.get('name') ?? ''
      const code = searchParams.get('code') ?? ''
      const desc = searchParams.get('desc') ?? ''
      const template = searchParams.get('template') ?? ''
      
      if (code) {
        setFileContents(prev => ({
          ...prev,
          'strategy.ts': decodeURIComponent(code),
        }))
      }
      if (template) {
        setFileContents(prev => ({
          ...prev,
          'config.json': JSON.stringify({ template, symbols: ['BTC-USD','ETH-USD','SOL-USD','BNB-USD','XRP-USD'], rebalanceFreq: 'weekly', riskAversion: 1, maxWeight: 0.30, walkForward: true, initialCapital: 1000000, feeBps: 7 }, null, 2)
        }))
      }
      setAgentName(name ? decodeURIComponent(name) : 'New Agent')
      setTermLines(['Editing mode', 'Cmd+Enter to run backtest', ''])
    }
  }, [])

  // Editor state
  // Open files + active file persist via localStorage so the workspace
  // restores on tab switches.
  const [openFiles, setOpenFiles] = useState<string[]>(() => {
    if (typeof window === 'undefined') return ['strategy.ts', 'config.json']
    try {
      const raw = localStorage.getItem('ase_code_open_files')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length) return parsed
      }
    } catch {}
    return ['strategy.ts', 'config.json']
  })
  const [activeFile, setActiveFile] = useState<string>(() => {
    if (typeof window === 'undefined') return 'strategy.ts'
    try { return localStorage.getItem('ase_code_active_file') ?? 'strategy.ts' } catch { return 'strategy.ts' }
  })
  useEffect(() => {
    try { localStorage.setItem('ase_code_open_files', JSON.stringify(openFiles)) } catch {}
  }, [openFiles])
  useEffect(() => {
    try { localStorage.setItem('ase_code_active_file', activeFile) } catch {}
  }, [activeFile])
  const [fileContents, setFileContents] = useState<Record<string, string>>(() => {
    try {
      // Priority 1: files from the latest draft (written by build page on completion)
      const stored = localStorage.getItem('ase-files')
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, string>
        // Only use if it has real content (not just default boilerplate length)
        const hasFiles = Object.keys(parsed).length > 0
        const hasContent = Object.values(parsed).some(v => v && v.length > 50)
        if (hasFiles && hasContent) return { ...DEFAULT_FILES, ...parsed }
      }
    } catch {}
    return DEFAULT_FILES
  })
  const [draftLoaded, setDraftLoaded] = useState(() => {
    try {
      const stored = localStorage.getItem('ase-files')
      if (!stored) return false
      const parsed = JSON.parse(stored) as Record<string, string>
      return Object.values(parsed).some(v => v && v.length > 50)
    } catch { return false }
  })
  const [saved, setSaved] = useState(true)

  // Code panel is always open — backtest never goes full-screen.
  // Mirrors how the Build page hides the codebase by default.
  const [sideOpen, setSideOpen] = useState(true)
  // Codebase tree condense mode: collapsed by default, expands on demand.
  const [treeCondensed, setTreeCondensed] = useState(true)
  // Block panel — same data + behavior as Build page. Hydrated from the
  // same localStorage key Build writes to so the two surfaces share state.
  const [pinnedBlocks, setPinnedBlocks] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem('ase_build_blocks') ?? '[]') } catch { return [] }
  })
  const [blockSearch, setBlockSearch] = useState('')
  const [blocksPanelOpen, setBlocksPanelOpen] = useState(true)
  // Persist pinned blocks back so the Build canvas reflects what the user
  // toggles here (and vice versa).
  useEffect(() => {
    try { localStorage.setItem('ase_build_blocks', JSON.stringify(pinnedBlocks)) } catch {}
  }, [pinnedBlocks])
  const togglePinnedBlock = useCallback((id: string) => {
    setPinnedBlocks(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  }, [])
  // Default to 'chat' so arriving from /dashboard/build feels continuous —
  // same dominant chat surface, just with the codebase available a click away.
  // Right panel hosts ONLY the backtest now. Chat removed (Build page is
  // the chat surface). 'data' / 'docs' tabs gone earlier. We keep the
  // union type for backwards compatibility with existing setters.
  const [rightTab, setRightTab] = useState<'backtest'|'data'|'docs'|'chat'>('backtest')
  // Bottom panel defaults to terminal — the right panel chat is dominant
  // now (mirroring Build page), so we don't duplicate the chat at the bottom.
  const [bottomMode, setBottomMode] = useState<'terminal'|'chat'>('terminal')
  const [bottomChatRef] = useState(() => ({ current: null as HTMLTextAreaElement | null }))

  // Cmd+K to toggle chat + auto-collapse sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setRightTab(t => t === 'chat' ? 'backtest' : 'chat')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // (Auto-collapse on chat removed — user explicitly toggles the codebase
  // via the HIDE CODE / BRING UP CODEBASE button in the top bar.)

  // Auto-condense the codebase tree when work is happening; the explorer
  // still shows one file (the active one) so the user is never lost.
  // We bind this to chatLoading and btLoading below — defined later in the
  // component, so the effect uses the values via the closure.

  // Terminal
  const [termLines, setTermLines]     = useState(['> ASE Quant Lab ready', '> Cmd+Enter run  |  Cmd+S save  |  Cmd+K focus AI', ''])
  const [termInput, setTermInput]     = useState('')

  // Backtest config (synced from config.json)
  const [template, setTemplate]       = useState('composite_balanced')
  const [universe, setUniverse]       = useState('crypto_top10')
  const [startDate, setStartDate]     = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 6); return d.toISOString().slice(0, 10)
  })
  const [endDate]                     = useState(new Date().toISOString().slice(0, 10))
  const [rebalFreq, setRebalFreq]     = useState<'daily'|'weekly'|'monthly'>('weekly')
  const [riskAversion, setRiskAversion] = useState(4)
  const [maxWeight, setMaxWeight]     = useState(0.30)
  const [walkFwd, setWalkFwd]         = useState(false)
  const [initCapital, setInitCapital] = useState(1000000)
  const [feeBps, setFeeBps]           = useState(7)
  const [btLoading, setBtLoading]     = useState(false)
  const [btResult, setBtResult]       = useState<Record<string, unknown> | null>(null)
  const [btError, setBtError]         = useState('')
  const [btStartTime, setBtStartTime] = useState<number|null>(null)
  const [btElapsed, setBtElapsed]     = useState(0)

  // Data panel
  const [dataSearch, setDataSearch]   = useState('')
  const [selAPI, setSelAPI]           = useState<typeof DATA_APIS[0] | null>(null)
  const [dataView, setDataView]       = useState<'apis'|'ml'|'blocks'>('blocks')
  const [blockCat, setBlockCat]       = useState<BlockCategory>('data')

  // AI chat — hydrate from build-page transcript if the user just came from /dashboard/build
  const [chatMsgs, setChatMsgs]       = useState<ChatMsg[]>(() => {
    try {
      const raw = localStorage.getItem('ase_build_chat')
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMsg[]
        if (Array.isArray(parsed) && parsed.length) return parsed
      }
    } catch {}
    return [
      { role: 'ai', text: "I'm your quant AI assistant. I can **design alpha models**, **analyze backtest results**, **suggest optimizations**, and **write code** directly to your files.\n\nTry asking:\n- *Improve my Sharpe ratio*\n- *Add on-chain signals (NUPL, SOPR)*\n- *Explain my backtest results*\n- *Optimize the risk aversion parameter*" },
    ]
  })
  const [chatInput, setChatInput]     = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)
  const chatEndRef   = useRef<HTMLDivElement>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  // Scroll chat to bottom *only when the user is already pinned*. Streaming
  // tokens never yank a user away from a message they're reading.
  useEffect(() => {
    const el = chatScrollRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distance < 80) el.scrollTop = el.scrollHeight
  }, [chatMsgs])

  // Bind tree auto-condense to the active workloads. When idle the user
  // gets the full tree back. We never go to zero rows — the active file is
  // always rendered. The blocks panel also auto-collapses so chat owns
  // the screen while the AI streams.
  useEffect(() => {
    if (chatLoading || btLoading) {
      setTreeCondensed(true)
      setBlocksPanelOpen(false)
    }
  }, [chatLoading, btLoading])

  // Strategy name / publish — hydrate from build handoff if present
  const [agentName, setAgentName]     = useState(() => {
    try {
      const n = localStorage.getItem('ase_build_agent_name')
      if (n && n.trim()) return n
    } catch {}
    return 'Crypto Momentum'
  })
  const [publishing, setPublishing]   = useState(false)
  const [published, setPublished]     = useState(false)
  const [publishStep, setPublishStep] = useState<0|1|2|3>(0) // 0=closed 1=review 2=legal 3=done
  const [publishDesc, setPublishDesc] = useState('')
  const [publishTags, setPublishTags] = useState('crypto, momentum')
  const [publishSharePrice, setPublishSharePrice] = useState('10.00')
  const [legalChecked, setLegalChecked] = useState([false, false, false])

  // AI pending edits (cursor-like apply)
  const [pendingEdits, setPendingEdits] = useState<FileEdit[]>([])
  const [autoApply, setAutoApply] = useState<boolean>(() => {
    try { return localStorage.getItem('ase-auto-apply') !== '0' } catch { return true }
  })
  useEffect(() => {
    try { localStorage.setItem('ase-auto-apply', autoApply ? '1' : '0') } catch {}
  }, [autoApply])

  // Auto-iterate: after AI applies edits, automatically run a backtest and
  // feed the result back to the AI so it can refine. Stops at grade ≥ B+ or
  // after MAX_ITERATIONS rounds. The current iteration count + a guard flag
  // prevent runaway loops if the AI never converges.
  // Default AUTO-ITERATE on — the user wants strategies to converge to a
  // good grade unattended. Anyone who wants the old "review each step" mode
  // can flip the toggle off. Bumped rounds to 5 so the loop has room to
  // hit the trade-count floor before final tuning.
  const [autoIterate, setAutoIterate] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('ase-auto-iter')
      return v == null ? true : v === '1'
    } catch { return true }
  })
  useEffect(() => {
    try { localStorage.setItem('ase-auto-iter', autoIterate ? '1' : '0') } catch {}
  }, [autoIterate])
  const iterCountRef = useRef(0)
  const MAX_ITERATIONS = 5

  // Dynamic config fields (from codebase)
  const [configFields, setConfigFields] = useState<Record<string, { value: string | number | boolean; type: string }>>({})
  const [agentIconIdx, setAgentIconIdx]   = useState(0)

  // Strategy list derived from codebase STRATEGIES
  const strategyList = useMemo(() =>
    Object.entries(STRATEGIES).filter(([id]) => id !== 'custom').map(([id, meta]) => ({
      id, name: meta.name, description: meta.description,
    })),
  [])

  // Update config fields from config.json
  useEffect(() => {
    const cfg = fileContents['config.json']
    if (cfg) {
      setConfigFields(extractConfigFields(cfg))
    }
  }, [fileContents['config.json']])

  // ── Config.json → backtest sync ───────────────────────────────────────────────
  useEffect(() => {
    const raw = fileContents['config.json']
    if (!raw) return
    try {
      const cfg = JSON.parse(raw)
      if (cfg.template) setTemplate(cfg.template)
      if (Array.isArray(cfg.symbols)) {
        const syms = cfg.symbols.join(',')
        const found = Object.entries(UNIVERSE_SYMBOLS).find(([, v]) => v.join(',') === syms)
        setUniverse(found ? found[0] : 'crypto_top5')
      }
      if (cfg.rebalanceFreq) setRebalFreq(cfg.rebalanceFreq)
      if (typeof cfg.riskAversion === 'number') setRiskAversion(cfg.riskAversion)
      if (typeof cfg.maxWeight === 'number') setMaxWeight(cfg.maxWeight)
      if (typeof cfg.walkForward === 'boolean') setWalkFwd(cfg.walkForward)
      if (typeof cfg.initialCapital === 'number') setInitCapital(cfg.initialCapital)
      if (typeof cfg.feeBps === 'number') setFeeBps(cfg.feeBps)
    } catch {}
  }, [fileContents['config.json']]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live API tracking ─────────────────────────────────────────────────────────
  const usedAPIIds = useMemo(() => {
    const all = Object.values(fileContents).join('\n').toLowerCase()
    return new Set(DATA_APIS.filter(a => all.includes(a.id) || all.includes(a.name.toLowerCase())).map(a => a.id))
  }, [fileContents])

  // ── Backtest timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!btLoading || !btStartTime) return
    const id = setInterval(() => setBtElapsed(Math.round((Date.now() - btStartTime) / 1000)), 500)
    return () => clearInterval(id)
  }, [btLoading, btStartTime])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void runBacktest() }
      if ((e.ctrlKey || e.metaKey) && e.key === 's')     { e.preventDefault(); handleSave() }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k')     { e.preventDefault(); setBottomMode('chat'); setTimeout(() => { bottomChatRef.current?.focus() }, 50) }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  })

  // ── File helpers ──────────────────────────────────────────────────────────────
  const handleSave = () => {
    setSaved(true)
    try { localStorage.setItem('ase-files', JSON.stringify(fileContents)) } catch {}
    
    // Save as Studio draft
    const key = 'ase_agent_saves_anonymous'
    try {
      const existing = JSON.parse(localStorage.getItem(key) ?? '{}')
      const id = (agentName || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'untitled'
      existing[id] = {
        id,
        name: agentName || 'Untitled',
        description: '',
        tagline: agentName || 'Untitled',
        ticker: (agentName || 'AGNT').slice(0, 4).toUpperCase(),
        status: 'draft',
        published: false,
        updatedAt: new Date().toISOString(),
        strategyCode: fileContents['strategy.ts'] || '',
        configJson: fileContents['config.json'] || '{}',
        version: 1,
      }
      localStorage.setItem(key, JSON.stringify(existing))
    } catch {}
    
    addTerm(`[OK] ${activeFile} saved — /dashboard/studio`)
  }

  const openFile = (name: string) => {
    if (!openFiles.includes(name)) setOpenFiles(p => [...p, name])
    setActiveFile(name)
  }

  const closeFile = (name: string) => {
    const next = openFiles.filter(f => f !== name)
    setOpenFiles(next)
    if (activeFile === name) setActiveFile(next[next.length - 1] ?? '')
  }

  const updateFile = (name: string, content: string) => {
    setFileContents(p => {
      const updated = { ...p, [name]: content }
      try { localStorage.setItem('ase-files', JSON.stringify(updated)) } catch {}
      return updated
    })
    setSaved(false)
  }

  const addTerm = useCallback((line: string) => setTermLines(p => [...p, line]), [])

  // ── Config.json ← UI controls (bidirectional) ────────────────────────────────
  const updateConfigJson = useCallback((changes: Record<string, unknown>) => {
    setFileContents(prev => {
      try {
        const parsed = JSON.parse(prev['config.json'] ?? '{}')
        const merged = { ...parsed, ...changes }
        return { ...prev, 'config.json': JSON.stringify(merged, null, 2) }
      } catch { return prev }
    })
    setSaved(false)
  }, [])

  // ── Terminal commands ─────────────────────────────────────────────────────────
  const handleTermSubmit = useCallback(() => {
    const cmd = termInput.trim()
    if (!cmd) return
    addTerm(`> ${cmd}`)
    setTermInput('')
    if      (cmd === 'help')    addTerm('Commands: backtest · clear · ls · save · grade · version · apis')
    else if (cmd === 'clear')   setTermLines([])
    else if (cmd === 'ls')      Object.keys(fileContents).forEach(f => addTerm(`  ${f}`))
    else if (cmd === 'save')    handleSave()
    else if (cmd === 'backtest') void runBacktest()
    else if (cmd === 'version') addTerm('ASE Quant Lab v3.0.0 · 9-layer pipeline')
    else if (cmd === 'apis')    DATA_APIS.forEach(a => addTerm(`  ${a.id.padEnd(12)} ${a.name} (${a.auth === 'none' ? 'free' : a.auth})`))
    else if (cmd === 'grade') {
      if (btResult) {
        const ts = btResult.tear_sheet as Record<string, number>
        addTerm(`[OK] Grade: ${btResult.grade}  CAGR: ${(ts.cagr ?? 0).toFixed(1)}%  Sharpe: ${ts.sharpeRatio?.toFixed(2)}  MaxDD: ${ts.maxDrawdownPct?.toFixed(1)}%`)
      } else addTerm('[ERR] No backtest results. Run one first.')
    }
    else addTerm(`[ERR] Unknown: ${cmd}. Type "help".`)
    addTerm('')
  }, [termInput, btResult, fileContents, addTerm])

  // ── Backtest ──────────────────────────────────────────────────────────────────
  async function runBacktest(opts?: { fromIteration?: boolean }): Promise<{ grade?: string; tear_sheet?: Record<string, number> } | null> {
    setBtLoading(true); setBtError(''); setBtResult(null)
    setBtStartTime(Date.now()); setBtElapsed(0)
    addTerm('[RUN] Running backtest...')
    const syms = UNIVERSE_SYMBOLS[universe] ?? UNIVERSE_SYMBOLS.crypto_top5
    try {
      const res = await fetch('/api/quant/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, symbols: syms, start_date: startDate, end_date: endDate, rebalance_freq: rebalFreq, risk_aversion: riskAversion, max_weight: maxWeight, walk_forward: walkFwd, initial_capital: initCapital, fee_bps: feeBps, save: false }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Backtest failed')
      setBtResult(data)
      const ts = data.tear_sheet as Record<string, number>
      addTerm(`[OK] Grade: ${data.grade}  CAGR: ${(ts.cagr ?? 0).toFixed(1)}%  Sharpe: ${ts.sharpeRatio?.toFixed(2)}  MaxDD: ${ts.maxDrawdownPct?.toFixed(1)}%`)
      setRightTab('backtest')
      return data
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error'
      setBtError(msg); addTerm(`[ERR] ${msg}`)
      void opts
      return null
    } finally { setBtLoading(false); setBtStartTime(null) }
  }

  // Run backtest using the EXACT payload the AI emitted in backtest.config.json.
  // This is how the agent gets backtested at the end of the build prompt run —
  // template selection happens internally in the AI's spec, never shown to the user.
  async function runAgentBacktest(payload: Record<string, unknown>) {
    setBtLoading(true); setBtError(''); setBtResult(null)
    setBtStartTime(Date.now()); setBtElapsed(0)
    addTerm('[RUN] Backtesting agent…')
    try {
      const res = await fetch('/api/quant/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, save: false }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Backtest failed')
      setBtResult(data)
      const ts = data.tear_sheet as Record<string, number>
      addTerm(`[OK] Grade: ${data.grade}  CAGR: ${(ts?.cagr ?? 0).toFixed(1)}%  Sharpe: ${ts?.sharpeRatio?.toFixed(2)}  MaxDD: ${ts?.maxDrawdownPct?.toFixed(1)}%`)
      setRightTab('backtest')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error'
      setBtError(msg); addTerm(`[ERR] ${msg}`)
    } finally { setBtLoading(false); setBtStartTime(null) }
  }

  // Auto-backtest on arrival from /dashboard/build: parse the AI's
  // backtest.config.json and run it once, then clear the handoff flag.
  useEffect(() => {
    let triggered = false
    try {
      if (localStorage.getItem('ase_build_autobacktest') !== '1') return
      const raw = fileContents['backtest.config.json']
      if (!raw) return
      const payload = JSON.parse(raw)
      localStorage.removeItem('ase_build_autobacktest')
      triggered = true
      // Show chat panel so the user sees the agent's reasoning while it backtests
      setRightTab('chat')
      void runAgentBacktest(payload)
    } catch {
      if (triggered) return
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileContents['backtest.config.json']])

  // ── Publish ───────────────────────────────────────────────────────────────────
  // Required for publish:
  //   1. strategy.ts must export a `thinking()` reasoning trace (or include
  //      a `// thinking:` block) so each tick can post the agent's rationale.
  //   2. strategy.ts must reference `agent_paper_ledger` / `postLedger` so
  //      every fill writes to the trade ledger.
  // These are *required* — there are no templates anymore, so the user-supplied
  // strategy is the source of truth.
  function publishReadiness(): { ok: boolean; missing: string[] } {
    const missing: string[] = []
    const corpus = Object.values(fileContents).join('\n').toLowerCase()
    if (!/thinking|reasoning|rationale/.test(corpus)) {
      missing.push('Add a `thinking()` reasoning trace — published agents must explain their decisions on every tick.')
    }
    if (!/ledger|postledger|agent_paper_ledger/.test(corpus)) {
      missing.push('Wire trades into the paper ledger — call `postLedger({ symbol, side, qty, price })` (or `agent_paper_ledger`) on every fill.')
    }
    return { ok: missing.length === 0, missing }
  }

  function handlePublish() {
    const readiness = publishReadiness()
    if (!readiness.ok) {
      addTerm('[BLOCK] Publish rejected. Missing requirements:')
      readiness.missing.forEach(m => addTerm(`  · ${m}`))
      addTerm('See /dashboard/build/docs for the publish contract.')
      return
    }
    if (btResult) {
      const ts = (btResult?.tear_sheet ?? {}) as Record<string, number>
      setPublishDesc(`Custom strategy — Grade ${btResult.grade} | Sharpe ${(ts.sharpeRatio??0).toFixed(2)} | CAGR ${(ts.cagr??0).toFixed(1)}% | MaxDD ${(ts.maxDrawdownPct??0).toFixed(1)}%`)
    }
    setPublishStep(1)
  }

  async function submitPublish() {
    setPublishing(true)
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: agentName,
          description: publishDesc,
          strategy_type: 'custom',
          primary_symbol: 'BTC/USD',
          backtest_strategy: 'custom',
          asset_class: 'crypto',
          slug: agentName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          ticker: agentName.slice(0, 4).toUpperCase(),
          strategy_code: fileContents['strategy.ts'],
          config_json: fileContents['config.json'],
          share_price_cents: Math.round(parseFloat(publishSharePrice) * 100),
          tags: publishTags.split(',').map(t => t.trim()).filter(Boolean),
          publish: true,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        addTerm(`[ERR] Publish failed: ${d.error ?? res.statusText}`)
        setPublishStep(0)
      } else {
        setPublished(true)
        setPublishStep(3)
        addTerm(`[OK] "${agentName}" published to exchange — live for copy-trading`)
      }
    } catch (e) {
      addTerm(`[ERR] Publish failed: ${e instanceof Error ? e.message : 'Network error'}`)
      setPublishStep(0)
    } finally { setPublishing(false) }
  }

  // ── AI Chat ───────────────────────────────────────────────────────────────────
  async function sendChat() {
    const msg = chatInput.trim()
    if (!msg || chatLoading) return
    setChatInput('')
    setChatMsgs(p => [...p, { role: 'user', text: msg }, { role: 'ai', text: '' }])
    setChatLoading(true)
    const ts = (btResult?.tear_sheet ?? {}) as Record<string, number>

    const allFilesCtx = Object.entries(fileContents).map(([name, content]) =>
      `### ${name}\n\`\`\`\n${content}\n\`\`\``
    ).join('\n\n')

    const btCtx = btResult
      ? `Grade: ${btResult.grade} | CAGR: ${(ts.cagr??0).toFixed(1)}% | Sharpe: ${(ts.sharpeRatio??0).toFixed(2)} | MaxDD: ${(ts.maxDrawdownPct??0).toFixed(1)}% | Sortino: ${(ts.sortinoRatio??0).toFixed(2)} | WinRate: ${(ts.winRatePct??0).toFixed(1)}%`
      : 'No backtest run yet.'

    try {
      // Send full chat history (not just latest msg) so the AI sees the
      // iteration loop and can build on prior turns. buildMode=true makes the
      // server use the strict file-emit prompt — same one the Build page uses.
      const history = chatMsgs.concat({ role: 'user', text: msg }).map(m => ({
        role: m.role === 'ai' ? 'assistant' : 'user',
        content: m.text,
      })).filter(m => m.content)
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history,
          codebase: allFilesCtx,
          activeFile,
          btContext: btCtx,
          apiIds: Array.from(usedAPIIds).join(', '),
          buildMode: true,
          stream: true,
        }),
      })

      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Request failed')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.content) {
                fullText += parsed.content
                setChatMsgs(p => {
                  const updated = [...p]
                  updated[updated.length - 1] = { ...updated[updated.length - 1], text: fullText }
                  return updated
                })
              }
            } catch {}
          }
        }
      }

      // Extract FILE / DELETE directives — same parser the build page uses,
      // handles both ```lang\n// FILE: name\n…``` AND // FILE: name\n```lang\n…```.
      const extracted: FileEdit[] = []
      const deletions: string[] = []
      const seen = new Set<string>()
      const re1 = /```(\w*)[^\n]*\n(?:\/\/|#)\s*FILE:\s*([^\n]+)\n([\s\S]*?)```/g
      const re2 = /(?:\/\/|#)\s*FILE:\s*([^\n]+)\n```(\w*)[^\n]*\n([\s\S]*?)```/g
      let mm: RegExpExecArray | null
      while ((mm = re1.exec(fullText)) !== null) {
        const name = mm[2].trim()
        if (!seen.has(name) && mm[3].trim()) { seen.add(name); extracted.push({ filename: name, content: mm[3], lang: mm[1] || 'text' }) }
      }
      while ((mm = re2.exec(fullText)) !== null) {
        const name = mm[1].trim()
        if (!seen.has(name) && mm[3].trim()) { seen.add(name); extracted.push({ filename: name, content: mm[3], lang: mm[2] || 'text' }) }
      }
      const bareDelRe = /(?:^|\n)\s*(?:\/\/|#)\s*DELETE:\s*([^\n]+)/g
      let dm: RegExpExecArray | null
      while ((dm = bareDelRe.exec(fullText)) !== null) deletions.push(dm[1].trim())
      if (extracted.length > 0 || deletions.length > 0) {
        if (autoApply) {
          if (extracted.length > 0) {
            extracted.forEach(edit => {
              setFileContents(prev => {
                const updated = { ...prev, [edit.filename]: edit.content }
                try { localStorage.setItem('ase-files', JSON.stringify(updated)) } catch {}
                return updated
              })
              setOpenFiles(p => p.includes(edit.filename) ? p : [...p, edit.filename])
            })
            setActiveFile(extracted[0].filename)
          }
          if (deletions.length > 0) {
            setFileContents(prev => {
              const updated = { ...prev }
              deletions.forEach(f => { delete updated[f] })
              try { localStorage.setItem('ase-files', JSON.stringify(updated)) } catch {}
              return updated
            })
            setOpenFiles(p => p.filter(f => !deletions.includes(f)))
          }
          const parts: string[] = []
          if (extracted.length) parts.push(`${extracted.length} edit${extracted.length !== 1 ? 's' : ''}`)
          if (deletions.length) parts.push(`${deletions.length} deletion${deletions.length !== 1 ? 's' : ''}`)
          addTerm(`[OK] Auto-applied ${parts.join(' + ')}`)
          setSaved(false)

          // Auto-iterate: AI just edited code. Run a fresh backtest and feed
          // the result back to the AI for the next refinement round.
          if (autoIterate && extracted.length > 0 && iterCountRef.current < MAX_ITERATIONS) {
            iterCountRef.current += 1
            const round = iterCountRef.current
            addTerm(`[ITER ${round}/${MAX_ITERATIONS}] Running self-improvement backtest…`)
            // Fire-and-forget: backtest + follow-up turn
            ;(async () => {
              const bt = await runBacktest({ fromIteration: true })
              if (!bt || !bt.tear_sheet) {
                addTerm(`[ITER] Backtest failed — stopping iteration loop`)
                iterCountRef.current = 0
                return
              }
              const ts = bt.tear_sheet
              const grade = bt.grade ?? 'C'
              if (grade === 'A' || grade === 'A+' || grade === 'B+') {
                addTerm(`[ITER] Grade ${grade} reached — stopping iteration loop`)
                iterCountRef.current = 0
                return
              }
              if (round >= MAX_ITERATIONS) {
                addTerm(`[ITER] Max iterations (${MAX_ITERATIONS}) hit — final grade ${grade}`)
                iterCountRef.current = 0
                return
              }
              // Build a self-correction prompt and re-enter sendChat with it.
              // We benchmark turnover hard: a 7-trade backtest is noise, not
              // a strategy. Demand a step-change in trade count whenever it's
              // under the floor, on each iteration, until we get a real sample.
              const trades = ts.totalTrades ?? 0
              const tradeFloor = 100
              const tradeMandate = trades < tradeFloor
                ? ` CRITICAL: only ${trades} trades — meaningless sample. Halve risk_aversion AND double signal_scale_bps AND tighten the entry threshold by 30% AND shorten holding-period. Target ≥${tradeFloor} trades over the period before tuning anything else. Until you hit the floor, ignore Sharpe / CAGR / MaxDD — they are not reliable on this trade count.`
                : ''
              const summary = `Backtest round ${round} just ran. Grade=${grade} CAGR=${(ts.cagr ?? 0).toFixed(2)}% Sharpe=${(ts.sharpeRatio ?? 0).toFixed(2)} MaxDD=${(ts.maxDrawdownPct ?? 0).toFixed(2)}% Trades=${trades} WinRate=${((ts.winRate ?? 0) * 100).toFixed(1)}%. Benchmarks for context: BTC buy-and-hold CAGR ~30% / Sharpe ~0.9; SPY ~10% / 0.6; a B+ strategy must beat its asset-class buy-and-hold on Sharpe AND have ≥${tradeFloor} trades.${tradeMandate} Diagnose the WEAKEST metric and emit FILE blocks to fix it. Don't repeat your previous fix.`
              setChatInput(summary)
              setTimeout(() => { void sendChat() }, 50)
            })()
          }
        } else {
          setPendingEdits(extracted)
        }
      }

      // Final update with edits attached
      setChatMsgs(p => {
        const updated = [...p]
        updated[updated.length - 1] = { role: 'ai', text: fullText, edits: extracted.length > 0 ? extracted : undefined }
        return updated
      })
    } catch (err) {
      setChatMsgs(p => {
        const updated = [...p]
        updated[updated.length - 1] = { role: 'ai', text: `**Error:** ${err instanceof Error ? err.message : 'Connection failed'}. Check that Ollama is running (ollama serve).` }
        return updated
      })
    } finally { setChatLoading(false) }
  }

  const applyEdit = useCallback((edit: FileEdit) => {
    updateFile(edit.filename, edit.content)
    if (!openFiles.includes(edit.filename)) setOpenFiles(p => [...p, edit.filename])
    setActiveFile(edit.filename)
    setPendingEdits(p => p.filter(e => e.filename !== edit.filename))
    addTerm(`[OK] Applied edit to ${edit.filename}`)
  }, [openFiles, addTerm])

  const applyAllEdits = useCallback(() => {
    pendingEdits.forEach(edit => {
      updateFile(edit.filename, edit.content)
      if (!openFiles.includes(edit.filename)) setOpenFiles(p => [...p, edit.filename])
    })
    if (pendingEdits.length > 0) setActiveFile(pendingEdits[0].filename)
    addTerm(`[OK] Applied ${pendingEdits.length} AI edit${pendingEdits.length !== 1 ? 's' : ''}`)
    setPendingEdits([])
  }, [pendingEdits, openFiles, addTerm])

  // ── Derived ───────────────────────────────────────────────────────────────────
  const ts       = (btResult?.tear_sheet ?? {}) as Record<string, number>
  const equity   = (btResult?.equity_curve ?? []) as Array<{ date: string; equity: number }>
  const icSeries = (btResult?.ic_series ?? []) as Array<{ date: string; ic: number }>
  const grade    = (btResult?.grade as string) ?? ''
  const gradeCLR = grade ? (GRADE_CLR[grade] ?? C.muted) : C.faint
  const bmEquity = (btResult?.benchmark_equity ?? []) as Array<{ equity: number }>

  const chartData = useMemo(() => {
    if (!equity.length) return []
    const step = Math.max(1, Math.floor(equity.length / 280))
    return equity.filter((_, i) => i % step === 0).map((p, i) => ({
      date: p.date?.slice(5) ?? '',
      strategy: Math.round(p.equity),
      benchmark: Math.round(bmEquity[Math.min(i * step, bmEquity.length - 1)]?.equity ?? p.equity),
    }))
  }, [equity, bmEquity])

  const filteredAPIs = useMemo(() =>
    DATA_APIS.filter(a => !dataSearch || a.name.toLowerCase().includes(dataSearch.toLowerCase()) || a.cat.includes(dataSearch.toLowerCase()) || a.desc.toLowerCase().includes(dataSearch.toLowerCase())),
  [dataSearch])

  const fileLang = { ts: 'TypeScript', py: 'Python', json: 'JSON', md: 'Markdown' }[activeFile.split('.').pop() ?? ''] ?? 'Text'

  const estimateBtTime = () => {
    const yr = (new Date().getFullYear() - parseInt(startDate.slice(0, 4))) + 1
    const base = walkFwd ? yr * 3 : yr * 1.5
    return Math.round(base) + '–' + Math.round(base * 2) + 's'
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <style>{`
        @keyframes blink { 0%,100%{opacity:.3} 50%{opacity:1} }
        @keyframes fade-up { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes slide-in-right { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bg, overflow: 'hidden' }}>

        {/* ── PIPELINE STRIP — single-row block graph; no overlapping title.
            Replaces the CanvasAssembly which was double-stacking its
            "PIPELINE READY · n nodes" banner over the node row when
            the strip's height was clamped to 90px. */}
        <CodeCanvasStrip files={fileContents} pinned={pinnedBlocks} />

        {/* ── TOP BAR ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.4rem .75rem', borderBottom: `1px solid ${C.border}`, background: C.bg2, flexShrink: 0, height: 42 }}>
          {/* CODE toggle removed — code panel is always open. */}
          <button onClick={() => setAgentIconIdx(i => (i + 1) % AGENT_ICONS.length)} title="Change agent icon" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.blue2, display: 'flex', alignItems: 'center', fontSize: '1.1rem', padding: '0 .15rem' }}>
            {AGENT_ICONS[agentIconIdx]}
          </button>
          <div style={{ width: 1, height: 16, background: C.border }} />
          <input value={agentName} onChange={e => setAgentName(e.target.value)} style={{ background: 'transparent', border: 'none', outline: 'none', fontWeight: 700, fontSize: '.86rem', color: C.white, minWidth: 100, maxWidth: 220 }} />
          {grade && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', fontWeight: 700, padding: '.15rem .5rem', borderRadius: 5, background: `${gradeCLR}18`, color: gradeCLR, border: `1px solid ${gradeCLR}30` }}>{grade}</div>}
          {published && <Tag text="LIVE" color={C.mint} />}
          {draftLoaded && !published && <Tag text="DRAFT" color={C.blue} />}
          {!saved    && <Tag text="UNSAVED" color={C.orange} />}
          <div style={{ flex: 1 }} />
          <button onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: '.28rem', padding: '.28rem .62rem', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontFamily: 'var(--font-mono)', fontSize: '.58rem', cursor: 'pointer', fontWeight: 600 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            SAVE
          </button>
          <button onClick={() => void runBacktest()} disabled={btLoading} style={{ display: 'flex', alignItems: 'center', gap: '.35rem', padding: '.28rem .7rem', borderRadius: 6, border: 'none', background: btLoading ? `${C.blue}55` : C.blue, color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '.58rem', fontWeight: 700, cursor: btLoading ? 'not-allowed' : 'pointer' }}>
            {btLoading
              ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0"/></svg>
              : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>}
            {btLoading ? `${btElapsed}s…` : 'RUN'}
          </button>
          <button onClick={() => void handlePublish()} style={{ display: 'flex', alignItems: 'center', gap: '.28rem', padding: '.28rem .62rem', borderRadius: 6, border: `1px solid ${published ? C.mint + '45' : C.border}`, background: published ? `${C.mint}14` : 'transparent', color: published ? C.mint : C.muted, fontFamily: 'var(--font-mono)', fontSize: '.58rem', cursor: 'pointer', fontWeight: 600 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            {published ? 'LIVE' : 'PUBLISH'}
          </button>
          {/* + New Strategy — clears the editor + chat for a fresh build. */}
          <button onClick={() => {
            if (!confirm('Start a fresh strategy? Unsaved changes will be lost.')) return
            try {
              localStorage.removeItem('ase-files')
              localStorage.removeItem('ase_build_chat')
              localStorage.removeItem('ase_build_blocks')
              localStorage.removeItem('ase_build_prompt_draft')
              localStorage.removeItem('ase_build_agent_name')
              localStorage.removeItem('ase_build_bg_v1')
              localStorage.removeItem('ase_code_open_files')
              localStorage.removeItem('ase_code_active_file')
            } catch {}
            window.location.href = '/dashboard/build'
          }}
            title="Start a fresh strategy"
            style={{ display: 'flex', alignItems: 'center', gap: '.28rem', padding: '.28rem .62rem', borderRadius: 6, border: `1px solid ${C.mint}40`, background: 'transparent', color: C.mint, fontFamily: 'var(--font-mono)', fontSize: '.58rem', cursor: 'pointer', fontWeight: 700 }}>
            + NEW STRATEGY
          </button>
          {/* Terminal / chat mode toggle removed — both panels are gone. */}
        </div>

        {/* ── BODY ── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* LEFT SIDEBAR */}
          {sideOpen && (
            <div style={{
              width: 210, flexShrink: 0, borderRight: `1px solid ${C.border}`,
              background: C.bg2, display: 'flex', flexDirection: 'column', overflow: 'hidden',
              animation: 'slideInLeft .25s ease',
            }}>

              {/* File explorer */}
              <div style={{ padding: '.4rem .65rem .3rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.4rem' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, letterSpacing: '.1em' }}>EXPLORER</span>
                <div style={{ display: 'flex', gap: '.2rem' }}>
                  <button title={treeCondensed ? 'Expand tree' : 'Collapse tree (keep active file)'}
                    onClick={() => setTreeCondensed(v => !v)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.faint, fontSize: '.65rem', lineHeight: 1, padding: 0 }}>
                    {treeCondensed ? '▸' : '▾'}
                  </button>
                  <button onClick={() => { const n = prompt('New file name (e.g. signals.ts):'); if (n) { updateFile(n, ''); openFile(n) } }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.faint, fontSize: '.85rem', lineHeight: 1 }}>+</button>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '.25rem .3rem' }}>
                {(() => {
                  const fileNames = Object.keys(fileContents)
                  // Condensed mode: show only the active file (always at least 1)
                  // and a "+N more" expander.
                  const visible = treeCondensed && fileNames.length > 1
                    ? [activeFile && fileNames.includes(activeFile) ? activeFile : fileNames[0]]
                    : fileNames
                  return (
                    <>
                      {visible.map(name => {
                        const ext = name.split('.').pop() ?? ''
                        const clr = { ts: C.blue, py: C.mint, json: C.orange, md: C.muted }[ext] ?? C.faint
                        const isActive = activeFile === name
                        const hasPending = pendingEdits.some(e => e.filename === name)
                        return (
                          <button key={name} onClick={() => openFile(name)} style={{ display: 'flex', alignItems: 'center', gap: '.4rem', width: '100%', padding: '.25rem .45rem', borderRadius: 5, background: isActive ? `${C.blue}12` : hasPending ? `${C.blue}07` : 'transparent', border: `1px solid ${hasPending ? C.blue + '30' : 'transparent'}`, cursor: 'pointer', textAlign: 'left', marginBottom: '.03rem' }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: clr, fontWeight: 700, flexShrink: 0, width: 16 }}>{ext.toUpperCase().slice(0,2)}</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.63rem', color: isActive ? C.white : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{name}</span>
                            {hasPending && <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.blue, flexShrink: 0, boxShadow: `0 0 4px ${C.blue}` }} />}
                          </button>
                        )
                      })}
                      {treeCondensed && fileNames.length > visible.length && (
                        <button onClick={() => setTreeCondensed(false)}
                          style={{ display: 'flex', alignItems: 'center', gap: '.35rem', width: '100%', padding: '.25rem .45rem', borderRadius: 5, background: 'transparent', border: `1px dashed ${C.border}`, cursor: 'pointer', color: C.faint, fontSize: '.55rem', fontFamily: 'var(--font-mono)', marginTop: '.15rem' }}>
                          + {fileNames.length - visible.length} more
                        </button>
                      )}
                    </>
                  )
                })()}
              </div>

              {/* BLOCKS panel — same data as Build canvas, sync'd via localStorage */}
              <div style={{ borderTop: `1px solid ${C.border}` }}>
                <button onClick={() => setBlocksPanelOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '.4rem .65rem', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, letterSpacing: '.1em' }}>
                    BLOCKS {pinnedBlocks.length > 0 && <span style={{ color: C.mint, marginLeft: 4 }}>· {pinnedBlocks.length} pinned</span>}
                  </span>
                  <span style={{ color: C.faint, fontSize: '.65rem' }}>{blocksPanelOpen ? '▾' : '▸'}</span>
                </button>
                {blocksPanelOpen && (
                  <div style={{ padding: '0 .5rem .35rem' }}>
                    <input value={blockSearch} onChange={e => setBlockSearch(e.target.value)}
                      placeholder="Search blocks..."
                      style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 4, padding: '.22rem .35rem', color: C.white, fontSize: '.55rem', outline: 'none', marginBottom: '.3rem', boxSizing: 'border-box', fontFamily: 'var(--font-mono)' }} />
                    <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '.12rem' }}>
                      {PIPELINE_BLOCKS.filter(b => {
                        if (!blockSearch) return true
                        const q = blockSearch.toLowerCase()
                        return b.label.toLowerCase().includes(q) || b.description.toLowerCase().includes(q) || b.kind.includes(q)
                      }).map(b => {
                        const KCLR: Record<string, string> = {
                          data: '#3b82f6', indicator: '#a855f7', ml: '#ec4899',
                          api: '#06b6d4', risk: '#ef4444', execution: '#f59e0b', signal: '#16c784',
                        }
                        const clr = KCLR[b.kind] ?? C.faint
                        const pinned = pinnedBlocks.includes(b.id)
                        return (
                          <button key={b.id} onClick={() => togglePinnedBlock(b.id)}
                            title={`${b.label} — ${b.description}\n\nUse: ${b.agentHint ?? '(no hint)'}\nKind: ${b.kind}`}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '.3rem',
                              padding: '.22rem .38rem', borderRadius: 4,
                              background: pinned ? `${clr}14` : 'transparent',
                              border: `1px solid ${pinned ? clr + '38' : 'transparent'}`,
                              borderLeft: `2px solid ${pinned ? clr : 'transparent'}`,
                              cursor: 'pointer', textAlign: 'left',
                            }}>
                            <span style={{ fontSize: '.5rem', color: clr, width: 12, flexShrink: 0 }}>●</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.56rem', color: pinned ? C.white : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{b.label}</span>
                            {pinned && <span style={{ fontSize: '.42rem', color: clr }}>✓</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* ASE PAGES, CUSTOM DATA, and DATA CONNECTIONS all removed —
                  navigation lives in the sidebar (Code/Backtest/Manage/Docs
                  are sub-items of Build there) and "data" is the BLOCKS
                  panel above (single source of truth with the canvas). */}
            </div>
          )}

          {/* CODE EDITOR — only rendered when the user has explicitly
              brought up the codebase. Otherwise the chat takes the entire
              central area (mirrors the Build page experience). */}
          {sideOpen && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
            {/* Auto-apply toggle (Cursor-style) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.25rem .85rem', background: C.bg2, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: C.faint, letterSpacing: '.06em', textTransform: 'uppercase' }}>AI MODE</span>
              <button
                onClick={() => setAutoApply(v => !v)}
                title="Toggle Cursor-style auto-apply of AI code edits"
                style={{
                  display: 'flex', alignItems: 'center', gap: '.35rem',
                  padding: '.18rem .55rem',
                  borderRadius: 5,
                  background: autoApply ? `${C.mint}18` : 'transparent',
                  border: `1px solid ${autoApply ? C.mint + '55' : C.border}`,
                  color: autoApply ? C.mint : C.muted,
                  fontFamily: 'var(--font-mono)', fontSize: '.56rem', fontWeight: 700,
                  cursor: 'pointer', letterSpacing: '.06em',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: autoApply ? C.mint : C.faint, boxShadow: autoApply ? `0 0 5px ${C.mint}` : 'none' }} />
                {autoApply ? 'AUTO-APPLY ON' : 'AUTO-APPLY OFF'}
              </button>
              <button
                onClick={() => { setAutoIterate(v => !v); iterCountRef.current = 0 }}
                title="After AI edits, run a backtest and feed results back so the AI keeps refining (max 3 rounds, stops at B+)."
                style={{
                  display: 'flex', alignItems: 'center', gap: '.35rem',
                  padding: '.18rem .55rem', marginLeft: '.4rem',
                  borderRadius: 5,
                  background: autoIterate ? `${C.blue}18` : 'transparent',
                  border: `1px solid ${autoIterate ? C.blue + '55' : C.border}`,
                  color: autoIterate ? C.blue2 : C.muted,
                  fontFamily: 'var(--font-mono)', fontSize: '.56rem', fontWeight: 700,
                  cursor: 'pointer', letterSpacing: '.06em',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: autoIterate ? C.blue : C.faint, boxShadow: autoIterate ? `0 0 5px ${C.blue}` : 'none' }} />
                {autoIterate ? 'AUTO-ITERATE ON' : 'AUTO-ITERATE OFF'}
              </button>
              <span style={{ flex: 1 }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.faint }}>
                {autoIterate ? 'AI runs backtest + refines' : autoApply ? 'AI edits apply instantly' : 'Review before apply'}
              </span>
            </div>
            {/* Apply Changes Banner */}
            {pendingEdits.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '.65rem', padding: '.35rem .85rem', background: `linear-gradient(90deg, ${C.blue}18, ${C.mint}10)`, borderBottom: `1px solid ${C.blue}30`, flexShrink: 0 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.blue, boxShadow: `0 0 6px ${C.blue}`, animation: 'pulse 1.5s infinite', flexShrink: 0 }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: C.blue2, flex: 1 }}>
                  AI suggested changes to <strong style={{ color: C.white }}>{pendingEdits.map(e => e.filename).join(', ')}</strong>
                </span>
                <button onClick={applyAllEdits} style={{ padding: '.22rem .65rem', borderRadius: 6, border: `1px solid ${C.mint}50`, background: `${C.mint}15`, color: C.mint, fontFamily: 'var(--font-mono)', fontSize: '.58rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  [OK] Apply All
                </button>
                <button onClick={() => setPendingEdits([])} style={{ background: 'transparent', border: 'none', color: C.faint, cursor: 'pointer', fontSize: '.75rem', padding: '0 .2rem', lineHeight: 1 }}>✕</button>
              </div>
            )}
            {/* File tabs */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, background: C.bg2, flexShrink: 0, overflowX: 'auto' }}>
              {openFiles.map(name => (
                <div key={name} onClick={() => setActiveFile(name)} style={{ display: 'flex', alignItems: 'center', gap: '.35rem', padding: '.35rem .75rem', cursor: 'pointer', borderRight: `1px solid ${C.border}`, background: activeFile === name ? C.bg : C.bg2, borderBottom: activeFile === name ? `2px solid ${C.blue}` : '2px solid transparent', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.63rem', color: activeFile === name ? C.white : C.faint }}>{name}</span>
                  <button onClick={e => { e.stopPropagation(); closeFile(name) }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.faint, fontSize: '.68rem', padding: '0', lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {activeFile
                ? <CodeEditor value={fileContents[activeFile] ?? ''} onChange={v => updateFile(activeFile, v)} />
                : <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '.7rem' }}>Select a file</div>
              }
            </div>
            {/* Status bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '.85rem', padding: '.18rem .85rem', background: C.bg3, borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.faint }}>{fileLang}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.faint }}>{(fileContents[activeFile] ?? '').split('\n').length} lines</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: saved ? C.faint : C.orange }}>{saved ? 'Saved' : '● Unsaved'}</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.faint }}>⌘↩ run · ⌘S save · ⌘K ai</span>
            </div>
          </div>
          )}

          {/* RIGHT RAIL — Dominant AI chat on top, collapsible backtest config below.
              The bottom-of-page chat panel was deleted; this rail is the only
              AI surface on /code now. Chat hydrates from localStorage so a
              prompt entered on /dashboard/build streams in here mid-flight. */}
          <div style={{
            width: 460, flexShrink: 0, flex: '0 0 auto',
            borderLeft: `1px solid ${C.border}`,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            background: C.bg2,
          }}>

            {/* ── CHAT (DOMINANT) ── */}
            <div style={{ display: 'flex', flexDirection: 'column', flex: rightTab === 'backtest' ? '1 1 55%' : '1 1 100%', minHeight: 0, borderBottom: rightTab === 'backtest' ? `1px solid ${C.border}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.4rem .85rem', borderBottom: `1px solid ${C.border}`, background: `${C.bg2}cc`, flexShrink: 0 }}>
                <span style={{ display: 'inline-flex', gap: 3 }}>
                  {chatLoading ? [0,1,2].map(i => <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: C.mint, animation: `bounce ${0.5 + i * 0.12}s ease-in-out infinite` }} />) : <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.mint, boxShadow: `0 0 6px ${C.mint}` }} />}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', fontWeight: 700, color: C.mint, letterSpacing: '.1em' }}>ASE AI</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, marginLeft: 'auto' }}>{chatMsgs.length} msgs</span>
              </div>

              <div ref={chatScrollRef} style={{
                flex: 1, overflowY: 'auto', padding: '.65rem .85rem',
                display: 'flex', flexDirection: 'column', gap: '.5rem',
                overscrollBehavior: 'contain', minHeight: 0,
              }}>
                {chatMsgs.length === 0 && (
                  <div style={{ margin: 'auto', textAlign: 'center', color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '.6rem', padding: '1.5rem 1rem', lineHeight: 1.6 }}>
                    Describe your strategy or ask the AI to refine the code.<br/>Edits apply directly to the files on the left.
                  </div>
                )}
                {chatMsgs.map((m, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', animation: 'slideInUp .2s ease' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.42rem', color: C.faint, letterSpacing: '.08em', marginBottom: '.18rem' }}>
                      {m.role === 'user' ? 'YOU' : 'ASE AI'}
                    </div>
                    <div style={{
                      maxWidth: m.role === 'user' ? '85%' : '94%',
                      padding: '.55rem .75rem', borderRadius: 10,
                      background: m.role === 'user' ? `${C.mint}10` : `${C.bg3}cc`,
                      border: `1px solid ${m.role === 'user' ? C.mint + '28' : C.border}`,
                      fontFamily: 'var(--font-mono)', fontSize: '.62rem',
                      color: m.role === 'user' ? C.mint : C.text, lineHeight: 1.55,
                      whiteSpace: m.role === 'user' ? 'pre-wrap' : undefined,
                    }}>
                      {m.role === 'ai' ? <MdText text={m.text} /> : m.text}
                      {m.role === 'ai' && m.edits && m.edits.length > 0 && (
                        <div style={{ marginTop: '.4rem', display: 'flex', gap: '.25rem', flexWrap: 'wrap' }}>
                          {m.edits.map((e, ei) => (
                            <span key={ei} style={{ padding: '.1rem .4rem', borderRadius: 4, background: `${C.mint}12`, border: `1px solid ${C.mint}30`, color: C.mint, fontFamily: 'var(--font-mono)', fontSize: '.48rem', fontWeight: 700 }}>
                              ✓ {e.filename}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {chatLoading && chatMsgs[chatMsgs.length - 1]?.text === '' && (
                  <div style={{ display: 'flex', gap: '.25rem', paddingLeft: '.4rem', alignItems: 'center' }}>
                    {[0,1,2].map(j => <span key={j} style={{ width: 4, height: 4, borderRadius: '50%', background: C.mint, animation: `bounce ${0.5 + j * 0.12}s ease-in-out infinite` }} />)}
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div style={{ display: 'flex', gap: '.22rem', overflowX: 'auto', padding: '.25rem .85rem', flexShrink: 0, borderTop: `1px solid ${C.border}` }}>
                {['Improve Sharpe', 'Trade more often', 'Reduce drawdown', 'Explain results', 'Beat BTC HODL'].map(s => (
                  <button key={s} onClick={() => { setChatInput(s); chatInputRef.current?.focus() }}
                    style={{ padding: '.16rem .45rem', borderRadius: 4, background: 'rgba(10,21,37,.5)', border: `1px solid ${C.border}`, color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '.48rem', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>{s}</button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '.4rem', padding: '.45rem .85rem', borderTop: `1px solid ${C.border}`, flexShrink: 0, background: `${C.bg2}cc`, alignItems: 'flex-end' }}>
                <textarea
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendChat() } }}
                  placeholder="Ask AI to refine the strategy or describe a new one…"
                  rows={2}
                  disabled={chatLoading}
                  style={{ flex: 1, background: 'rgba(10,21,37,.5)', border: `1px solid ${C.border}`, borderRadius: 7, padding: '.42rem .65rem', color: C.white, fontSize: '.62rem', outline: 'none', resize: 'none', lineHeight: 1.45, maxHeight: 120, fontFamily: 'var(--font-mono)' }}
                />
                <button onClick={() => void sendChat()} disabled={chatLoading || !chatInput.trim()}
                  style={{ padding: '.42rem .85rem', borderRadius: 8, background: chatLoading || !chatInput.trim() ? C.border : C.mint, color: chatLoading || !chatInput.trim() ? C.faint : '#000', fontSize: '.7rem', fontWeight: 700, border: 'none', cursor: chatLoading ? 'not-allowed' : 'pointer', transition: 'all .15s' }}>→</button>
              </div>
            </div>

            {/* ── BACKTEST CONFIG (collapsible) ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.35rem .85rem', borderBottom: rightTab === 'backtest' ? `1px solid ${C.border}` : 'none', background: `${C.bg2}cc`, flexShrink: 0, cursor: 'pointer' }}
              onClick={() => setRightTab(rightTab === 'backtest' ? 'chat' : 'backtest')}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: btLoading ? C.orange : btResult ? C.mint : C.faint, animation: btLoading ? 'blink .6s infinite' : 'none', flexShrink: 0 }} />
              <span style={{ flex: 1, color: C.white, fontFamily: 'var(--font-mono)', fontSize: '.6rem', fontWeight: 700, letterSpacing: '.06em' }}>
                {btLoading ? `Running… ${btElapsed}s` : btResult ? `BACKTEST — GRADE ${grade}` : 'BACKTEST CONFIG'}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: C.faint }}>{rightTab === 'backtest' ? '▾' : '▸'}</span>
              <a href="/dashboard/build/docs" title="Open docs page" onClick={e => e.stopPropagation()}
                style={{ padding: '.15rem .35rem', borderLeft: `1px solid ${C.border}`, color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '.5rem', textDecoration: 'none' }}>DOCS ↗</a>
              <a href="/dashboard/build/manage" title="Open manage page" onClick={e => e.stopPropagation()}
                style={{ padding: '.45rem .55rem', borderLeft: `1px solid ${C.border}`, color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '.5rem', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>MANAGE ↗</a>
            </div>

            <div style={{ flex: rightTab === 'backtest' ? '1 1 45%' : '0 0 0', overflowY: 'auto', padding: rightTab === 'backtest' ? '.8rem' : 0, minHeight: 0, display: rightTab === 'backtest' ? 'block' : 'none' }}>

              {/* ── BACKTEST TAB ── */}
              {rightTab === 'backtest' && (
                <div>
                  {/* Time estimate */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.6rem', padding: '.35rem .6rem', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 7 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.faint }}>EST. TIME: ~{estimateBtTime()}</span>
                    {btLoading && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.orange }}>{btElapsed}s elapsed</span>}
                  </div>

                  {/* All config fields - from codebase */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.42rem', marginBottom: '.65rem' }}>
                    {Object.keys(configFields).length === 0 && (
                      <>
                        <div style={{ gridColumn: 'span 2', padding: '.42rem .55rem', borderRadius: 7, background: `${C.mint}0a`, border: `1px dashed ${C.mint}40` }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.mint, letterSpacing: '.08em', fontWeight: 700 }}>CUSTOM STRATEGY</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: C.text, marginTop: '.18rem', lineHeight: 1.4 }}>
                            No templates. Backtest reads <code style={{ color: C.mint }}>strategy.ts</code> + your pinned blocks directly.
                          </div>
                        </div>
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.45rem', color: C.faint, letterSpacing: '.08em', marginBottom: '.22rem' }}>START DATE</div>
                          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, padding: '.32rem .45rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.6rem', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.45rem', color: C.faint, letterSpacing: '.08em', marginBottom: '.22rem' }}>INITIAL CAPITAL</div>
                          <input type="number" value={initCapital} onChange={e => setInitCapital(+e.target.value)} style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, padding: '.32rem .45rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.6rem', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.45rem', color: C.faint, letterSpacing: '.08em', marginBottom: '.22rem' }}>FEE (BPS)</div>
                          <input type="number" min={0} max={100} value={feeBps} onChange={e => setFeeBps(+e.target.value)} style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, padding: '.32rem .45rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.6rem', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                      </>
                    )}
                    {Object.keys(configFields).map((key, idx) => {
                      const meta = CONFIG_FIELD_META[key]
                      const field = configFields[key]
                      const label = meta?.label ?? key.toUpperCase()
                      if (key === 'symbols' || key === 'alpha_type') return null
                      if (field.type === 'boolean') {
                        return (
                          <div key={key} style={{ gridColumn: '1 / -1' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '.35rem', cursor: 'pointer' }}>
                              <input type="checkbox" checked={Boolean(field.value)} onChange={e => {
                                const newFields = { ...configFields, [key]: { value: e.target.checked, type: 'boolean' } }
                                updateFile('config.json', JSON.stringify(Object.fromEntries(Object.entries(newFields).map(([k, v]) => [k, v.value])), null, 2))
                              }} style={{ accentColor: C.blue }} />
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: C.muted }}>{label}</span>
                            </label>
                          </div>
                        )
                      }
                      if (meta?.options) {
                        return (
                          <div key={key}>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.45rem', color: C.faint, letterSpacing: '.08em', marginBottom: '.22rem' }}>{label}</div>
                            <select value={String(field.value)} onChange={e => {
                              const newFields = { ...configFields, [key]: { value: e.target.value, type: 'string' } }
                              updateFile('config.json', JSON.stringify(Object.fromEntries(Object.entries(newFields).map(([k, v]) => [k, v.value])), null, 2))
                            }} style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, padding: '.32rem .45rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.6rem', outline: 'none' }}>
                              {Object.entries(meta.options).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                          </div>
                        )
                      }
                      if (meta?.min !== undefined && meta?.max !== undefined) {
                        return (
                          <div key={key} style={{ gridColumn: '1 / -1' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.15rem' }}>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.45rem', color: C.faint, letterSpacing: '.08em' }}>{label}</span>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: C.blue2 }}>{meta.fmt ? meta.fmt(field.value) : String(field.value)}</span>
                            </div>
                            <input type="range" min={meta.min} max={meta.max} step={meta.step ?? 1} value={Number(field.value)} onChange={e => {
                              const newFields = { ...configFields, [key]: { value: Number(e.target.value), type: 'number' } }
                              updateFile('config.json', JSON.stringify(Object.fromEntries(Object.entries(newFields).map(([k, v]) => [k, v.value])), null, 2))
                            }} style={{ width: '100%', accentColor: C.blue }} />
                          </div>
                        )
                      }
                      return (
                        <div key={key}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.45rem', color: C.faint, letterSpacing: '.08em', marginBottom: '.22rem' }}>{label}</div>
                          <input type={field.type === 'number' ? 'number' : 'text'} value={String(field.value)} onChange={e => {
                            const newVal = field.type === 'number' ? Number(e.target.value) : e.target.value
                            const newFields = { ...configFields, [key]: { value: newVal, type: field.type } }
                            updateFile('config.json', JSON.stringify(Object.fromEntries(Object.entries(newFields).map(([k, v]) => [k, v.value])), null, 2))
                          }} style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, padding: '.32rem .45rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.6rem', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                      )
                    })}
                  </div>

                  {/* Sliders */}
                  <div style={{ marginBottom: '.65rem' }}>
                    {[
                      { label: 'RISK AVERSION (λ)', value: riskAversion, min: 1, max: 20, set: (v: number) => { setRiskAversion(v); updateConfigJson({ riskAversion: v }) }, fmt: (v: number) => String(v) },
                      { label: 'MAX WEIGHT / ASSET', value: maxWeight * 100, min: 5, max: 60, set: (v: number) => { setMaxWeight(v / 100); updateConfigJson({ maxWeight: v / 100 }) }, fmt: (v: number) => `${v.toFixed(0)}%` },
                    ].map(s => (
                      <div key={s.label} style={{ marginBottom: '.45rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.15rem' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.45rem', color: C.faint, letterSpacing: '.08em' }}>{s.label}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: C.blue2 }}>{s.fmt(s.value)}</span>
                        </div>
                        <input type="range" min={s.min} max={s.max} value={s.value} onChange={e => s.set(+e.target.value)} style={{ width: '100%', accentColor: C.blue }} />
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '.65rem', marginBottom: '.65rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '.35rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={walkFwd} onChange={e => { setWalkFwd(e.target.checked); updateConfigJson({ walkForward: e.target.checked }) }} style={{ accentColor: C.blue }} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: C.muted }}>Walk-forward</span>
                    </label>
                  </div>

                  <button onClick={() => void runBacktest()} disabled={btLoading} style={{ width: '100%', padding: '.52rem', borderRadius: 8, border: 'none', background: btLoading ? `${C.blue}55` : C.blue, color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '.68rem', fontWeight: 700, cursor: btLoading ? 'not-allowed' : 'pointer', marginBottom: '.75rem' }}>
                    {btLoading ? `▶ Running… ${btElapsed}s` : '▶  Run Backtest  (⌘ Enter)'}
                  </button>

                  {btError && <div style={{ padding: '.55rem .7rem', background: `${C.red}08`, border: `1px solid ${C.red}20`, borderRadius: 7, color: C.red, fontFamily: 'var(--font-mono)', fontSize: '.62rem', marginBottom: '.75rem' }}>{btError}</div>}

                  {btResult && (
                    <>
                      {/* Grade banner */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.65rem', padding: '.6rem .8rem', borderRadius: 9, background: `${gradeCLR}10`, border: `1px solid ${gradeCLR}28`, marginBottom: '.75rem' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.8rem', fontWeight: 900, color: gradeCLR, lineHeight: 1 }}>{grade}</div>
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.54rem', color: gradeCLR, letterSpacing: '.08em', fontWeight: 700 }}>STRATEGY GRADE</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: C.faint }}>Score {String(btResult.score ?? 0)}/100</div>
                        </div>
                        <div style={{ flex: 1 }} />
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.82rem', fontWeight: 800, color: col(ts.cagr ?? 0) }}>{(ts.cagr ?? 0).toFixed(1)}%</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.46rem', color: C.faint }}>CAGR</div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.35rem', marginBottom: '.75rem' }}>
                        {[
                          { l: 'Total Return',  v: fP(ts.totalReturnPct ?? 0),                c: col(ts.totalReturnPct ?? 0) },
                          { l: 'Sharpe Ratio',  v: (ts.sharpeRatio ?? 0).toFixed(2),         c: (ts.sharpeRatio ?? 0) >= 1.5 ? C.mint : C.orange },
                          { l: 'Max Drawdown',  v: `${(ts.maxDrawdownPct ?? 0).toFixed(1)}%`, c: C.red },
                          { l: 'Calmar Ratio',  v: (ts.calmarRatio ?? 0).toFixed(2),         c: col(ts.calmarRatio ?? 0) },
                          { l: 'Sortino',       v: (ts.sortinoRatio ?? 0).toFixed(2),        c: C.text },
                          { l: 'Win Rate',      v: `${(ts.winRatePct ?? 0).toFixed(1)}%`,    c: (ts.winRatePct ?? 0) >= 55 ? C.mint : C.orange },
                          { l: 'Avg IC',        v: (ts.icMean ?? 0).toFixed(3),               c: C.text },
                          { l: 'Rebalances',    v: String(btResult.n_rebalances ?? '—'),     c: C.text },
                        ].map(({ l, v, c }) => <Stat key={l} label={l} value={v} color={c} />)}
                      </div>

                      {chartData.length > 1 && (
                        <div style={{ marginBottom: '.75rem' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.46rem', color: C.faint, letterSpacing: '.08em', marginBottom: '.32rem' }}>EQUITY vs BENCHMARK</div>
                          <ResponsiveContainer width="100%" height={145}>
                            <AreaChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: -22 }}>
                              <defs>
                                <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.blue} stopOpacity={0.25}/><stop offset="95%" stopColor={C.blue} stopOpacity={0}/></linearGradient>
                                <linearGradient id="bmg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.muted} stopOpacity={0.08}/><stop offset="95%" stopColor={C.muted} stopOpacity={0}/></linearGradient>
                              </defs>
                              <XAxis dataKey="date" tick={{ fill: C.faint, fontSize: 8, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                              <YAxis tick={{ fill: C.faint, fontSize: 8, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                              <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 7, fontFamily: 'var(--font-mono)', fontSize: 9 }} formatter={(v: unknown, n: unknown) => [`$${Number(v).toLocaleString()}`, n === 'strategy' ? 'Strategy' : 'Benchmark']} />
                              <Area type="monotone" dataKey="benchmark" stroke={C.muted} strokeWidth={1} fill="url(#bmg)" dot={false} />
                              <Area type="monotone" dataKey="strategy"  stroke={C.blue} strokeWidth={2} fill="url(#sg)"  dot={false} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      {icSeries.length > 1 && (
                        <div style={{ marginBottom: '.75rem' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.46rem', color: C.faint, letterSpacing: '.08em', marginBottom: '.32rem' }}>INFORMATION COEFFICIENT</div>
                          <ResponsiveContainer width="100%" height={85}>
                            <BarChart data={icSeries.filter((_, i) => i % Math.max(1, Math.floor(icSeries.length / 55)) === 0)} margin={{ top: 2, right: 2, bottom: 2, left: -22 }}>
                              <XAxis dataKey="date" tick={false} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fill: C.faint, fontSize: 8, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                              <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 7, fontFamily: 'var(--font-mono)', fontSize: 9 }} formatter={(v: unknown) => [Number(v).toFixed(3), 'IC']} />
                              <Bar dataKey="ic" fill={C.blue} opacity={0.75} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      {btResult.walk_forward && (() => {
                        const wf = btResult.walk_forward as Record<string, unknown>
                        return (
                          <div style={{ padding: '.6rem .75rem', background: `${C.purple}08`, border: `1px solid ${C.purple}22`, borderRadius: 8, marginBottom: '.6rem' }}>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: C.purple, letterSpacing: '.08em', fontWeight: 700, marginBottom: '.38rem' }}>WALK-FORWARD</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.28rem' }}>
                              {[['Windows', String(wf.nWindows ?? '—')], ['OOS Sharpe', (wf.avgTestSharpe as number ?? 0).toFixed(2)], ['Degradation', `${((wf.avgDegradation as number ?? 0) * 100).toFixed(0)}%`]].map(([l, v]) => (
                                <div key={l} style={{ textAlign: 'center' }}>
                                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.68rem', fontWeight: 700, color: C.white }}>{v}</div>
                                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.42rem', color: C.faint }}>{l}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })()}

                      {/* Monte Carlo robustness */}
                      {btResult.monte_carlo && (() => {
                        const mc = btResult.monte_carlo as Record<string, number>
                        return (
                          <div style={{ padding: '.6rem .75rem', background: `${C.mint}06`, border: `1px solid ${C.mint}18`, borderRadius: 8, marginBottom: '.6rem' }}>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: C.mint, letterSpacing: '.08em', fontWeight: 700, marginBottom: '.38rem' }}>MONTE CARLO ({mc.nTrials ?? 0} trials, {mc.windowDays ?? 0}d windows)</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.28rem' }}>
                              {[['Median Return', `${(mc.medianReturn ?? 0).toFixed(1)}%`], ['P10 Return', `${(mc.p10Return ?? 0).toFixed(1)}%`], ['P90 Return', `${(mc.p90Return ?? 0).toFixed(1)}%`], ['Median Sharpe', (mc.medianSharpe ?? 0).toFixed(2)], ['Median Max DD', `${(mc.medianMaxDD ?? 0).toFixed(1)}%`], ['Beat B&H', `${((mc.beatBuyHoldRate ?? 0) * 100).toFixed(0)}%`]].map(([l, v]) => (
                                <div key={l} style={{ textAlign: 'center' }}>
                                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.68rem', fontWeight: 700, color: C.white }}>{v}</div>
                                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.42rem', color: C.faint }}>{l}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })()}

                      {/* Risk metrics: VaR, benchmark comparison */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.35rem', marginBottom: '.6rem' }}>
                        {[
                          { l: 'VaR 95%', v: `${((btResult.var_95 as number ?? 0) * 100).toFixed(2)}%`, c: C.red },
                          { l: 'VaR 99%', v: `${((btResult.var_99 as number ?? 0) * 100).toFixed(2)}%`, c: C.red },
                          { l: 'CVaR 95%', v: `${((btResult.cvar_95 as number ?? 0) * 100).toFixed(2)}%`, c: C.orange },
                          { l: 'Alpha vs Bench', v: `${(ts.alphaAnnualizedPct ?? 0).toFixed(1)}%`, c: col(ts.alphaAnnualizedPct ?? 0) },
                        ].map(({ l, v, c }) => <Stat key={l} label={l} value={v} color={c} />)}
                      </div>

                      {/* Benchmark comparison */}
                      {btResult.benchmark_cagr != null && (
                        <div style={{ padding: '.6rem .75rem', background: `${C.blue}06`, border: `1px solid ${C.blue}18`, borderRadius: 8, marginBottom: '.6rem' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: C.blue2, letterSpacing: '.08em', fontWeight: 700, marginBottom: '.32rem' }}>BENCHMARK COMPARISON</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.28rem' }}>
                            {[
                              ['Benchmark CAGR', `${(btResult.benchmark_cagr as number ?? 0).toFixed(1)}%`],
                              ['Strategy CAGR', `${(ts.cagr ?? 0).toFixed(1)}%`],
                              ['Alpha', `${(ts.alphaAnnualizedPct ?? 0).toFixed(1)}%`],
                              ['Beta', (ts.betaToMarket ?? 0).toFixed(2)],
                              ['Info Ratio', (ts.informationRatio ?? 0).toFixed(2)],
                              ['Tracking Err.', `${((ts.annualizedVolPct ?? 0) * Math.abs(1 - (ts.betaToMarket ?? 1))).toFixed(1)}%`],
                            ].map(([l, v]) => (
                              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '.15rem 0', borderBottom: `1px solid ${C.border}40` }}>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: C.faint }}>{l}</span>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: C.white, fontWeight: 700 }}>{v}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Full report link */}
                      <a href="/dashboard/backtest" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.35rem', padding: '.42rem', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontFamily: 'var(--font-mono)', fontSize: '.58rem', cursor: 'pointer', textDecoration: 'none', marginTop: '.1rem' }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
                        View Full Report
                      </a>
                    </>
                  )}
                </div>
              )}

              {/* DATA TAB removed — block insertion now lives in the
                  BLOCKS panel in the left sidebar (single source of truth
                  with the Build canvas). */}

              {/* DOCS / DATA tabs removed — see /dashboard/build/docs and the
                  BLOCKS panel in the left sidebar. */}

              {/* CHAT TAB removed — chat lives on /dashboard/build only. */}

            </div>
          </div>
        </div>

      </div>

      {/* ── PUBLISH WIZARD MODAL ── */}
      {publishStep > 0 && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(6px)' }}
          onClick={e => { if (e.target === e.currentTarget && publishStep !== 3) setPublishStep(0) }}>
          <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, width: 520, maxWidth: '95vw', padding: '1.4rem 1.6rem', display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative', animation: 'slideInUp .2s ease' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: `${C.mint}18`, border: `1px solid ${C.mint}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '.9rem', color: C.mint }}>◈</span>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '.82rem', color: C.white }}>
                  {publishStep === 3 ? 'Strategy Live on Exchange' : 'Publish to Exchange'}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.faint }}>
                  {publishStep === 1 ? 'Step 1 of 2 — Review & Configure' : publishStep === 2 ? 'Step 2 of 2 — Legal & Compliance' : 'Your agent is live for copy-trading'}
                </div>
              </div>
              {publishStep !== 3 && (
                <button onClick={() => setPublishStep(0)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: C.faint, fontSize: '1.1rem' }}>✕</button>
              )}
            </div>

            {/* Step indicator */}
            {publishStep < 3 && (
              <div style={{ display: 'flex', gap: '.3rem' }}>
                {[1,2].map(s => (
                  <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: publishStep >= s ? C.mint : C.border, transition: 'background .2s' }} />
                ))}
              </div>
            )}

            {/* ── STEP 1: Review ── */}
            {publishStep === 1 && (() => {
              const ts = (btResult?.tear_sheet ?? {}) as Record<string, number>
              const grade = btResult?.grade as string ?? '—'
              const gradeCLR2 = GRADE_CLR[grade] ?? C.faint
              const sharpe = (ts.sharpeRatio ?? 0).toFixed(2)
              const cagr = (ts.cagr ?? 0).toFixed(1)
              const maxdd = (ts.maxDrawdownPct ?? 0).toFixed(1)
              const beatRate = (ts.beatRate ?? 0).toFixed(0)
              const checks = [
                { label: 'Backtest complete', ok: !!btResult, detail: btResult ? `Grade ${grade}` : 'Run backtest first' },
                { label: 'Walk-forward validated', ok: walkFwd, detail: walkFwd ? 'Out-of-sample verified' : 'Enable walkForward in config' },
                { label: 'Sharpe ≥ 1.0', ok: (ts.sharpeRatio ?? 0) >= 1.0, detail: `Sharpe ${sharpe}` },
                { label: 'Max drawdown ≤ 30%', ok: (ts.maxDrawdownPct ?? 0) <= 30, detail: `MaxDD ${maxdd}%` },
                { label: 'Monte Carlo beat-rate ≥ 55%', ok: (ts.beatRate ?? 0) >= 55, detail: `Beat-rate ${beatRate}%` },
              ]
              const allPass = checks.every(c => c.ok)
              return (
                <>
                  {/* Backtest scorecard */}
                  <div style={{ background: C.bg3, borderRadius: 10, padding: '.75rem 1rem', border: `1px solid ${C.border}` }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, letterSpacing: '.1em', marginBottom: '.5rem' }}>BACKTEST SCORECARD</div>
                    <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                      {[['GRADE', grade, gradeCLR2], ['SHARPE', sharpe, parseFloat(sharpe) >= 1 ? C.mint : C.orange], ['CAGR', cagr + '%', C.blue], ['MAX DD', maxdd + '%', parseFloat(maxdd) <= 20 ? C.mint : C.orange]].map(([k, v, c]) => (
                        <div key={k} style={{ flex: 1, minWidth: 80, background: C.bg, borderRadius: 7, padding: '.4rem .6rem', border: `1px solid ${C.border}` }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.44rem', color: C.faint }}>{k}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.88rem', fontWeight: 700, color: c as string }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Verification checklist */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
                    {checks.map(c => (
                      <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.3rem .6rem', borderRadius: 6, background: c.ok ? `${C.mint}08` : `${C.orange}08`, border: `1px solid ${c.ok ? C.mint + '25' : C.orange + '25'}` }}>
                        <span style={{ color: c.ok ? C.mint : C.orange, fontSize: '.75rem' }}>{c.ok ? '✓' : '⚠'}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: C.text, flex: 1 }}>{c.label}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint }}>{c.detail}</span>
                      </div>
                    ))}
                  </div>

                  {/* Agent details */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.55rem' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, marginBottom: '.2rem' }}>AGENT NAME</div>
                      <input value={agentName} onChange={e => setAgentName(e.target.value)}
                        style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, padding: '.35rem .55rem', color: C.white, fontFamily: 'var(--font-mono)', fontSize: '.65rem', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, marginBottom: '.2rem' }}>DESCRIPTION</div>
                      <textarea value={publishDesc} onChange={e => setPublishDesc(e.target.value)} rows={2}
                        style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, padding: '.35rem .55rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.6rem', outline: 'none', resize: 'none', boxSizing: 'border-box', lineHeight: 1.5 }} />
                    </div>
                    <div style={{ display: 'flex', gap: '.5rem' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, marginBottom: '.2rem' }}>TAGS (comma-separated)</div>
                        <input value={publishTags} onChange={e => setPublishTags(e.target.value)}
                          style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, padding: '.35rem .55rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.6rem', outline: 'none', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ width: 110 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, marginBottom: '.2rem' }}>SHARE PRICE (USD)</div>
                        <input type="number" min="1" step="0.01" value={publishSharePrice} onChange={e => setPublishSharePrice(e.target.value)}
                          style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, padding: '.35rem .55rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.6rem', outline: 'none', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
                    <button onClick={() => setPublishStep(0)} style={{ padding: '.4rem .8rem', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '.6rem', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={() => setPublishStep(2)} disabled={!allPass}
                      style={{ padding: '.4rem 1rem', borderRadius: 7, border: 'none', background: allPass ? C.mint : `${C.mint}30`, color: allPass ? '#000' : C.faint, fontFamily: 'var(--font-mono)', fontSize: '.6rem', fontWeight: 700, cursor: allPass ? 'pointer' : 'not-allowed' }}>
                      Continue →
                    </button>
                  </div>
                </>
              )
            })()}

            {/* ── STEP 2: Legal ── */}
            {publishStep === 2 && (
              <>
                <div style={{ background: C.bg3, borderRadius: 10, padding: '.75rem 1rem', border: `1px solid ${C.border}` }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.orange, letterSpacing: '.1em', marginBottom: '.4rem' }}>⚠ IMPORTANT DISCLOSURES</div>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: C.text, lineHeight: 1.6, margin: 0 }}>
                    By publishing to the ASE Exchange you allow other users to copy-trade this strategy. You understand that past backtest performance does not guarantee future results. Crypto markets are highly volatile and all trading involves risk of loss.
                  </p>
                </div>

                {[
                  'I confirm this strategy is my original work and I have the right to publish it on ASE.',
                  'I understand backtest results are simulated and do not guarantee live performance. Copy-traders assume full risk.',
                  'I agree to the ASE Exchange Terms of Service, including content policies and intellectual property rules.',
                ].map((text, i) => (
                  <div key={i} onClick={() => setLegalChecked(p => { const n = [...p]; n[i] = !n[i]; return n })}
                    style={{ display: 'flex', gap: '.65rem', alignItems: 'flex-start', padding: '.45rem .6rem', borderRadius: 7, border: `1px solid ${legalChecked[i] ? C.mint + '35' : C.border}`, background: legalChecked[i] ? `${C.mint}06` : 'transparent', cursor: 'pointer' }}>
                    <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${legalChecked[i] ? C.mint : C.border}`, background: legalChecked[i] ? C.mint : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '.05rem', transition: 'all .15s' }}>
                      {legalChecked[i] && <span style={{ color: '#000', fontSize: '.65rem', fontWeight: 900, lineHeight: 1 }}>✓</span>}
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: C.text, lineHeight: 1.55 }}>{text}</span>
                  </div>
                ))}

                <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
                  <button onClick={() => setPublishStep(1)} style={{ padding: '.4rem .8rem', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '.6rem', cursor: 'pointer' }}>← Back</button>
                  <button onClick={() => void submitPublish()} disabled={!legalChecked.every(Boolean) || publishing}
                    style={{ padding: '.4rem 1.1rem', borderRadius: 7, border: 'none', background: legalChecked.every(Boolean) && !publishing ? C.mint : `${C.mint}30`, color: legalChecked.every(Boolean) && !publishing ? '#000' : C.faint, fontFamily: 'var(--font-mono)', fontSize: '.6rem', fontWeight: 700, cursor: legalChecked.every(Boolean) && !publishing ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '.3rem' }}>
                    {publishing && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0"/></svg>}
                    {publishing ? 'Publishing…' : '◈ Publish to Exchange'}
                  </button>
                </div>
              </>
            )}

            {/* ── STEP 3: Success ── */}
            {publishStep === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', padding: '.5rem 0' }}>
                <div style={{ width: 60, height: 60, borderRadius: 16, background: `${C.mint}18`, border: `1px solid ${C.mint}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'glow 2s ease-in-out infinite' }}>
                  <span style={{ fontSize: '1.8rem' }}>◈</span>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1rem', color: C.mint, marginBottom: '.3rem' }}>Live on Exchange</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: C.faint }}>
                    <strong style={{ color: C.white }}>{agentName}</strong> is now live for copy-trading.
                  </div>
                </div>
                <div style={{ background: C.bg3, borderRadius: 10, padding: '.65rem 1rem', border: `1px solid ${C.border}`, width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.35rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.faint }}>Share price</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', fontWeight: 700, color: C.white }}>${publishSharePrice}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.faint }}>Status</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: C.mint, fontWeight: 700 }}>● ACTIVE</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '.5rem', width: '100%' }}>
                  <Link href="/agents" style={{ flex: 1, padding: '.45rem 0', borderRadius: 7, border: 'none', background: C.mint, color: '#000', fontFamily: 'var(--font-mono)', fontSize: '.62rem', fontWeight: 700, cursor: 'pointer', textAlign: 'center', textDecoration: 'none' }}>
                    View on Exchange →
                  </Link>
                  <button onClick={() => setPublishStep(0)} style={{ flex: 1, padding: '.45rem 0', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '.62rem', cursor: 'pointer' }}>
                    Back to Code
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin   { to { transform: rotate(360deg) } }
        @keyframes bounce { 0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)} }
        @keyframes pulse  { 0%,100%{opacity:1}50%{opacity:.3} }
        @keyframes slideInUp   { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideInLeft { from{opacity:0;transform:translateX(-12px)} to{opacity:1;transform:translateX(0)} }
        @keyframes glow { 0%,100%{box-shadow:0 0 4px rgba(22,199,132,.3)} 50%{box-shadow:0 0 12px rgba(22,199,132,.6)} }
      `}</style>
    </div>
  )
}
