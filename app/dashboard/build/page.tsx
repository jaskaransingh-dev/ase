'use client'

import { useState, useRef, useEffect, useCallback, useMemo, use } from 'react'
import { useSearchParams } from 'next/navigation'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import {
  C, TEMPLATES, UNIVERSES, CONFIG_FIELD_META, DATA_APIS, ML_TOOLS,
  AGENT_ICONS, GRADE_CLR, DEFAULT_FILES,
} from '@/lib/backtest-config'
import { STRATEGIES } from '@/lib/backtest'
import { ALL_BLOCKS, BLOCKS_BY_CATEGORY, CATEGORY_META, type BlockCategory } from '@/lib/llm-blocks'

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
function MdText({ text, onApply }: { text: string; onApply?: (edit: FileEdit) => void }) {
  const parts: React.ReactNode[] = []
  let remaining = text
  let key = 0

  // Extract code blocks first
  const codeBlockRe = /```(\w+)?\n([\s\S]*?)```/g
  let lastIndex = 0
  let m: RegExpExecArray | null

  while ((m = codeBlockRe.exec(text)) !== null) {
    // Text before block
    if (m.index > lastIndex) {
      parts.push(<InlineText key={key++} text={text.slice(lastIndex, m.index)} />)
    }
    const lang = m[1] || 'text'
    const code = m[2]
    // Detect FILE directive
    const fileMatch = code.match(/^\/\/ FILE: ([^\n]+)\n/)
    const filename = fileMatch ? fileMatch[1].trim() : null
    const displayCode = fileMatch ? code.slice(fileMatch[0].length) : code

    parts.push(
      <div key={key++} style={{ margin: '.5rem 0', borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.border2}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.25rem .6rem', background: C.bg3, borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.faint }}>{filename || lang}</span>
          {filename && onApply && (
            <button
              onClick={() => onApply({ filename, content: displayCode, lang })}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', fontWeight: 700, padding: '.15rem .45rem', borderRadius: 5, background: `${C.mint}20`, border: `1px solid ${C.mint}40`, color: C.mint, cursor: 'pointer' }}
            >
              [OK] Apply
            </button>
          )}
        </div>
        <pre style={{ margin: 0, padding: '.6rem .75rem', background: C.bg, fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: C.text, lineHeight: 1.55, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {displayCode.trimEnd()}
        </pre>
      </div>
    )
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < text.length) {
    parts.push(<InlineText key={key++} text={text.slice(lastIndex)} />)
  }

  return <div>{parts}</div>
  void remaining
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
          'config.json': JSON.stringify({ template, symbols: ['BTC-USD','ETH-USD','SOL-USD','BNB-USD','ADA-USD'], rebalanceFreq: 'daily', riskAversion: 8, maxWeight: 0.25, walkForward: true, initialCapital: 1000000, feeBps: 7 }, null, 2)
        }))
      }
      setAgentName(name ? decodeURIComponent(name) : 'New Agent')
      setTermLines(['Editing mode', 'Cmd+Enter to run backtest', ''])
    }
  }, [])

  // Editor state
  const [openFiles, setOpenFiles]       = useState(['strategy.ts', 'config.json'])
  const [activeFile, setActiveFile]     = useState('strategy.ts')
  const [fileContents, setFileContents] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem('ase-files')
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, string>
        if (parsed['strategy.ts'] || parsed['config.json']) return { ...DEFAULT_FILES, ...parsed }
      }
    } catch {}
    return DEFAULT_FILES
  })
  const [saved, setSaved]               = useState(true)

  // Layout
  const [sideOpen, setSideOpen]   = useState(true)
  const [rightTab, setRightTab]   = useState<'backtest'|'data'|'docs'>('data')
  const [bottomMode, setBottomMode] = useState<'terminal'|'chat'>('terminal')

  // Terminal
  const [termLines, setTermLines]     = useState(['> ASE Quant Lab ready', '> Cmd+Enter run  |  Cmd+S save  |  Cmd+K focus AI', ''])
  const [termInput, setTermInput]     = useState('')

  // Backtest config (synced from config.json)
  const [template, setTemplate]       = useState('composite_balanced')
  const [universe, setUniverse]       = useState('crypto_top5')
  const [startDate, setStartDate]     = useState('2021-01-01')
  const [endDate]                     = useState(new Date().toISOString().slice(0, 10))
  const [rebalFreq, setRebalFreq]     = useState<'daily'|'weekly'|'monthly'>('daily')
  const [riskAversion, setRiskAversion] = useState(7)
  const [maxWeight, setMaxWeight]     = useState(0.30)
  const [walkFwd, setWalkFwd]         = useState(true)
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

  // AI chat
  const [chatMsgs, setChatMsgs]       = useState<ChatMsg[]>([
    { role: 'ai', text: "I'm your quant AI assistant. I can **design alpha models**, **analyze backtest results**, **suggest optimizations**, and **write code** directly to your files.\n\nTry asking:\n- *Improve my Sharpe ratio*\n- *Add on-chain signals (NUPL, SOPR)*\n- *Explain my backtest results*\n- *Optimize the risk aversion parameter*" },
  ])
  const [chatInput, setChatInput]     = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)
  const chatEndRef   = useRef<HTMLDivElement>(null)
  useEffect(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), [chatMsgs])

  // Strategy name / publish
  const [agentName, setAgentName]     = useState('Crypto Momentum')
  const [publishing, setPublishing]   = useState(false)
  const [published, setPublished]     = useState(false)

  // AI pending edits (cursor-like apply)
  const [pendingEdits, setPendingEdits] = useState<FileEdit[]>([])
  const [autoApply, setAutoApply] = useState<boolean>(() => {
    try { return localStorage.getItem('ase-auto-apply') !== '0' } catch { return true }
  })
  useEffect(() => {
    try { localStorage.setItem('ase-auto-apply', autoApply ? '1' : '0') } catch {}
  }, [autoApply])

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
      if ((e.ctrlKey || e.metaKey) && e.key === 'k')     { e.preventDefault(); setBottomMode('chat'); setTimeout(() => chatInputRef.current?.focus(), 50) }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  })

  // ── File helpers ──────────────────────────────────────────────────────────────
  const handleSave = () => {
    setSaved(true)
    try { localStorage.setItem('ase-files', JSON.stringify(fileContents)) } catch {}
    addTerm(`[OK] ${activeFile} saved`)
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
        addTerm(`[OK] Grade: ${btResult.grade}  CAGR: ${((ts.cagr ?? 0) * 100).toFixed(1)}%  Sharpe: ${ts.sharpeRatio?.toFixed(2)}  MaxDD: ${ts.maxDrawdownPct?.toFixed(1)}%`)
      } else addTerm('[ERR] No backtest results. Run one first.')
    }
    else addTerm(`[ERR] Unknown: ${cmd}. Type "help".`)
    addTerm('')
  }, [termInput, btResult, fileContents, addTerm])

  // ── Backtest ──────────────────────────────────────────────────────────────────
  async function runBacktest() {
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
      addTerm(`[OK] Grade: ${data.grade}  CAGR: ${((ts.cagr ?? 0) * 100).toFixed(1)}%  Sharpe: ${ts.sharpeRatio?.toFixed(2)}  MaxDD: ${ts.maxDrawdownPct?.toFixed(1)}%`)
      setRightTab('backtest')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error'
      setBtError(msg); addTerm(`[ERR] ${msg}`)
    } finally { setBtLoading(false); setBtStartTime(null) }
  }

  // ── Publish ───────────────────────────────────────────────────────────────────
  async function handlePublish() {
    if (!btResult) { addTerm('[ERR] Run a backtest first before publishing.'); return }
    setPublishing(true)
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: agentName,
          description: `${template.replace(/_/g, ' ')} agent — published from Quant Lab. Grade ${btResult.grade}.`,
          strategy_type: STRATEGY_MAP[template] ?? 'crypto_momentum',
          primary_symbol: 'BTC/USD',
          backtest_strategy: template,
          asset_class: 'crypto',
          slug: agentName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          ticker: agentName.slice(0, 4).toUpperCase(),
          strategy_code: fileContents['strategy.ts'],
          config_json: fileContents['config.json'],
          publish: true,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        addTerm(`[ERR] Publish failed: ${d.error ?? res.statusText}`)
      } else {
        setPublished(true)
        addTerm(`[OK] "${agentName}" ${published ? 'republished' : 'published'} to exchange`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Network error'
      addTerm(`[ERR] Publish failed: ${msg}`)
    } finally { setPublishing(false) }
  }

  // ── AI Chat ───────────────────────────────────────────────────────────────────
  async function sendChat() {
    const msg = chatInput.trim()
    if (!msg || chatLoading) return
    setChatInput('')
    setChatMsgs(p => [...p, { role: 'user', text: msg }])
    setChatLoading(true)
    const ts = (btResult?.tear_sheet ?? {}) as Record<string, number>

    // Build full codebase context
    const allFilesCtx = Object.entries(fileContents).map(([name, content]) =>
      `### ${name}\n\`\`\`\n${content}\n\`\`\``
    ).join('\n\n')

    const btCtx = btResult
      ? `**Grade:** ${btResult.grade} | **CAGR:** ${((ts.cagr??0)*100).toFixed(1)}% | **Sharpe:** ${(ts.sharpeRatio??0).toFixed(2)} | **MaxDD:** ${(ts.maxDrawdownPct??0).toFixed(1)}% | **Sortino:** ${(ts.sortinoRatio??0).toFixed(2)} | **Calmar:** ${(ts.calmarRatio??0).toFixed(2)} | **WinRate:** ${(ts.winRatePct??0).toFixed(1)}%`
      : 'No backtest run yet.'

    const context = `You are an **expert quantitative researcher and algo trader** for the ASE platform — crypto & DeFi only, no stocks.

## Your Role
You help users build institutional-quality crypto trading strategies. You understand:
- **Cross-sectional momentum** (rank by trailing return, z-score signals)
- **Mean reversion** (Ornstein-Uhlenbeck, Bollinger, RSI-based)
- **On-chain alpha** (NUPL, SOPR, MVRV, NVT, exchange flows, miner data)
- **DeFi signals** (TVL, funding rates, liquidation cascades, AMM flow)
- **Portfolio optimization** (mean-variance, risk parity, Black-Litterman)
- **Risk management** (Kelly criterion, drawdown limits, kill switches)
- **Transaction cost modeling** (slippage bps, market impact, participation rate)

## ASE Engine Architecture
The platform runs a **9-layer quant pipeline**:
\`Data Ingestion → Feature Engineering → Alpha → Forecast → Risk Model → Portfolio Optimizer → Risk Manager → Execution Simulation → Metrics\`

Key parameters in **config.json**:
- \`template\`: strategy template (momentum_conservative | composite_balanced | mean_reversion_active | ml_aggressive | risk_parity)
- \`riskAversion\`: lambda λ (1–20); higher = less risk, smaller positions
- \`maxWeight\`: per-asset cap (e.g. 0.30 = 30% max)
- \`feeBps\`: round-trip fee in basis points (7 bps = 0.07%)
- \`killSwitch\`: halt if drawdown exceeds this fraction (e.g. 0.20 = 20%)
- \`walkForward\`: run out-of-sample validation windows
- \`rebalanceFreq\`: daily | weekly | monthly

## Active File
**${activeFile}**

## Full Codebase
${allFilesCtx}

## Backtest Results
${btCtx}

## Live APIs Detected in Code
${Array.from(usedAPIIds).join(', ') || 'none'}

## Available Free APIs
Crypto: Binance, CoinGecko, CoinCap, Kraken, Bybit, OKX
DeFi: DeFiLlama, Uniswap, Aave, Curve, The Graph, dYdX
On-chain: Glassnode (free tier), CoinMetrics (community), Santiment
Derivatives: CoinGlass, Laevitas, Tardis (delayed)
Sentiment: Fear & Greed Index, LunarCrush, Alternative.me
Macro: FRED (rates, DXY, CPI), World Bank

## Response Format Rules
- Use **markdown** throughout: \`**bold**\` for key terms, \`*italic*\` for emphasis, code blocks for all code
- Structure responses with \`## headers\` for sections
- Use bullet lists for options/ideas
- **Never skip markdown** — formatted output only
- When writing code, always include the FILE directive so users can apply with one click:

\`\`\`typescript
// FILE: strategy.ts
[complete file content]
\`\`\`

- For config changes use:
\`\`\`json
// FILE: config.json
{ ... }
\`\`\`

- Always explain **why** before showing code
- Cite specific metrics from backtest when analyzing (Sharpe, CAGR, MaxDD)
- If Sharpe < 1.0, diagnose root cause before suggesting fixes`

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [
          { role: 'system', content: context },
          { role: 'user', content: msg },
        ]}),
      })
      const d = await res.json()
      const aiText = d.content ?? d.message ?? d.text ?? "I'm ready to help optimize your strategy. What would you like to improve?"

      // Extract pending edits from AI response
      const codeBlockRe = /```(\w+)?\n([\s\S]*?)```/g
      const extracted: FileEdit[] = []
      let m: RegExpExecArray | null
      const re = new RegExp(codeBlockRe.source, 'g')
      while ((m = re.exec(aiText)) !== null) {
        const lang = m[1] || 'text'
        const code = m[2]
        const fileMatch = code.match(/^\/\/ FILE: ([^\n]+)\n/)
        if (fileMatch) {
          extracted.push({ filename: fileMatch[1].trim(), content: code.slice(fileMatch[0].length), lang })
        }
      }
      if (extracted.length > 0) {
        if (autoApply) {
          extracted.forEach(edit => {
            setFileContents(prev => {
              const updated = { ...prev, [edit.filename]: edit.content }
              try { localStorage.setItem('ase-files', JSON.stringify(updated)) } catch {}
              return updated
            })
            setOpenFiles(p => p.includes(edit.filename) ? p : [...p, edit.filename])
          })
          setActiveFile(extracted[0].filename)
          addTerm(`[OK] Auto-applied ${extracted.length} AI edit${extracted.length !== 1 ? 's' : ''}`)
          setSaved(false)
        } else {
          setPendingEdits(extracted)
        }
      }

      setChatMsgs(p => [...p, { role: 'ai', text: aiText, edits: extracted }])
    } catch {
      setChatMsgs(p => [...p, { role: 'ai', text: "**Connection error.** I'm ready to help with alpha research, signal design, and strategy optimization.\n\nTry:\n- *Improve my Sharpe ratio*\n- *Add on-chain alpha signals*\n- *Reduce max drawdown*" }])
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
    <>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bg, overflow: 'hidden' }}>

        {/* ── TOP BAR ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.4rem .75rem', borderBottom: `1px solid ${C.border}`, background: C.bg2, flexShrink: 0, height: 42 }}>
          <button onClick={() => setSideOpen(v => !v)} style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, padding: '.25rem .38rem', cursor: 'pointer', color: C.faint, display: 'flex', alignItems: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          </button>
          <button onClick={() => setAgentIconIdx(i => (i + 1) % AGENT_ICONS.length)} title="Change agent icon" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.blue2, display: 'flex', alignItems: 'center', fontSize: '1.1rem', padding: '0 .15rem' }}>
            {AGENT_ICONS[agentIconIdx]}
          </button>
          <div style={{ width: 1, height: 16, background: C.border }} />
          <input value={agentName} onChange={e => setAgentName(e.target.value)} style={{ background: 'transparent', border: 'none', outline: 'none', fontWeight: 700, fontSize: '.86rem', color: C.white, minWidth: 100, maxWidth: 220 }} />
          {grade && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', fontWeight: 700, padding: '.15rem .5rem', borderRadius: 5, background: `${gradeCLR}18`, color: gradeCLR, border: `1px solid ${gradeCLR}30` }}>{grade}</div>}
          {published && <Tag text="LIVE" color={C.mint} />}
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
          <div style={{ display: 'flex', borderRadius: 6, background: C.bg3, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
            {(['terminal','chat'] as const).map(mode => (
              <button key={mode} onClick={() => setBottomMode(mode)} style={{ padding: '.25rem .5rem', border: 'none', background: bottomMode === mode ? C.bg4 : 'transparent', color: bottomMode === mode ? (mode === 'chat' ? C.blue2 : C.mint) : C.faint, fontFamily: 'var(--font-mono)', fontSize: '.54rem', fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                {mode === 'chat' ? '⌘K AI' : '›_'}
              </button>
            ))}
          </div>
        </div>

        {/* ── BODY ── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* LEFT SIDEBAR */}
          {sideOpen && (
            <div style={{ width: 210, flexShrink: 0, borderRight: `1px solid ${C.border}`, background: C.bg2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

              {/* File explorer */}
              <div style={{ padding: '.4rem .65rem .3rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, letterSpacing: '.1em' }}>EXPLORER</span>
                <button onClick={() => { const n = prompt('New file name (e.g. signals.ts):'); if (n) { updateFile(n, ''); openFile(n) } }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.faint, fontSize: '.85rem', lineHeight: 1 }}>+</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '.25rem .3rem' }}>
                {Object.keys(fileContents).map(name => {
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
              </div>

              {/* Upload custom data */}
              <div style={{ padding: '.45rem .65rem', borderTop: `1px solid ${C.border}` }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, letterSpacing: '.1em', marginBottom: '.3rem' }}>CUSTOM DATA</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '.35rem', padding: '.28rem .45rem', borderRadius: 6, border: `1px dashed ${C.border2}`, cursor: 'pointer', fontSize: '.58rem', color: C.muted, fontFamily: 'var(--font-mono)' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                  Upload CSV / JSON
                  <input type="file" accept=".csv,.json,.py,.ts" style={{ display: 'none' }} onChange={e => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    const reader = new FileReader()
                    reader.onload = ev => { updateFile(f.name, ev.target?.result as string ?? ''); openFile(f.name) }
                    reader.readAsText(f)
                  }} />
                </label>
              </div>

              {/* Data connections live status */}
              <div style={{ padding: '.45rem .65rem', borderTop: `1px solid ${C.border}` }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, letterSpacing: '.1em', marginBottom: '.28rem' }}>DATA CONNECTIONS</div>
                {DATA_APIS.filter(a => usedAPIIds.has(a.id)).map(api => (
                  <div key={api.id} style={{ display: 'flex', alignItems: 'center', gap: '.3rem', padding: '.15rem 0' }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.mint, animation: 'pulse 2s infinite', flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: C.mint }}>{api.name}</span>
                  </div>
                ))}
                {usedAPIIds.size === 0 && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.56rem', color: C.faint }}>No APIs detected in code</div>}
                <button onClick={() => { setRightTab('data'); }} style={{ marginTop: '.3rem', padding: '.18rem .45rem', border: `1px solid ${C.border}`, borderRadius: 5, background: 'transparent', color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '.54rem', cursor: 'pointer', width: '100%' }}>+ Add data source</button>
              </div>
            </div>
          )}

          {/* CODE EDITOR */}
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
              <span style={{ flex: 1 }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.faint }}>
                {autoApply ? 'AI edits apply instantly' : 'Review before apply'}
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

          {/* RIGHT PANEL */}
          <div style={{ width: 370, flexShrink: 0, borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg2 }}>
            <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
              {(['backtest','data','docs'] as const).map(t => (
                <button key={t} onClick={() => setRightTab(t)} style={{ flex: 1, padding: '.38rem .1rem', border: 'none', borderBottom: `2px solid ${rightTab === t ? C.blue : 'transparent'}`, background: 'transparent', color: rightTab === t ? C.blue2 : C.faint, fontFamily: 'var(--font-mono)', fontSize: '.54rem', fontWeight: 700, letterSpacing: '.06em', cursor: 'pointer', textTransform: 'uppercase' }}>
                  {t === 'data' ? (rightTab === 'data' && dataView === 'blocks' ? '⊞ blocks' : 'blocks') : t}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '.8rem' }}>

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
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.45rem', color: C.faint, letterSpacing: '.08em', marginBottom: '.22rem' }}>TEMPLATE</div>
                          <select value={String(configFields.template?.value ?? '')} onChange={e => {
                            const newFields = { ...configFields, template: { value: e.target.value, type: 'string' } }
                            updateFile('config.json', JSON.stringify(Object.fromEntries(Object.entries(newFields).map(([k, v]) => [k, v.value])), null, 2))
                          }} style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, padding: '.32rem .45rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.6rem', outline: 'none' }}>
                            {TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
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
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.82rem', fontWeight: 800, color: col(ts.cagr ?? 0) }}>{((ts.cagr ?? 0) * 100).toFixed(1)}%</div>
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
                              ['Strategy CAGR', `${((ts.cagr ?? 0) * 100).toFixed(1)}%`],
                              ['Alpha', `${(ts.alphaAnnualizedPct ?? 0).toFixed(1)}%`],
                              ['Beta', (ts.betaToMarket ?? 0).toFixed(2)],
                              ['Info Ratio', (ts.informationRatio ?? 0).toFixed(2)],
                              ['Tracking Err.', `${(((ts.annualizedVolPct ?? 0) * Math.abs(1 - (ts.betaToMarket ?? 1))) ?? 0).toFixed(1)}%`],
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

              {/* ── DATA TAB ── */}
              {rightTab === 'data' && (
                <div>
                  <div style={{ display: 'flex', gap: '.3rem', marginBottom: '.6rem' }}>
                    {(['blocks','apis','ml'] as const).map(v => (
                      <button key={v} onClick={() => setDataView(v)} style={{ flex: 1, padding: '.28rem', borderRadius: 6, border: `1px solid ${dataView === v ? C.blue + '40' : C.border}`, background: dataView === v ? `${C.blue}10` : 'transparent', color: dataView === v ? C.blue2 : C.faint, fontFamily: 'var(--font-mono)', fontSize: '.54rem', fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                        {v === 'blocks' ? '⊞ Blocks' : v === 'apis' ? 'Data APIs' : 'ML'}
                      </button>
                    ))}
                  </div>

                  {/* ── BLOCKS VIEW ── */}
                  {dataView === 'blocks' && (
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.faint, marginBottom: '.45rem', lineHeight: 1.6 }}>
                        Click or drag any block to insert it into your project.
                      </div>

                      {/* Category pills */}
                      <div style={{ display: 'flex', gap: '.25rem', flexWrap: 'wrap', marginBottom: '.55rem' }}>
                        {(Object.keys(CATEGORY_META) as BlockCategory[]).filter(cat => (BLOCKS_BY_CATEGORY[cat] ?? []).length > 0).map(cat => {
                          const meta = CATEGORY_META[cat]
                          const active = blockCat === cat
                          return (
                            <button key={cat} onClick={() => setBlockCat(cat)} style={{ display: 'flex', alignItems: 'center', gap: '.22rem', padding: '.18rem .45rem', borderRadius: 20, border: `1px solid ${active ? meta.color + '60' : C.border}`, background: active ? `${meta.color}18` : 'transparent', color: active ? meta.color : C.faint, fontFamily: 'var(--font-mono)', fontSize: '.5rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '.04em', textTransform: 'uppercase' }}>
                              <span>{meta.icon}</span>
                              {meta.label}
                            </button>
                          )
                        })}
                      </div>

                      {/* Blocks list */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '.32rem' }}>
                        {(BLOCKS_BY_CATEGORY[blockCat] ?? []).map(block => {
                          const catMeta = CATEGORY_META[block.category]
                          const isInProject = Object.values(fileContents).join('\n').includes(block.id)
                          return (
                            <div
                              key={block.id}
                              draggable
                              onDragEnd={() => {
                                const existing = fileContents[block.filename] ?? ''
                                const separator = `\n// ── ${block.name} ` + '─'.repeat(Math.max(0, 48 - block.name.length)) + '\n'
                                updateFile(block.filename, existing + separator + block.code.trimStart())
                                if (!openFiles.includes(block.filename)) setOpenFiles(p => [...p, block.filename])
                                setActiveFile(block.filename)
                                addTerm(`[OK] Inserted "${block.name}" into ${block.filename}`)
                              }}
                              onClick={() => {
                                const existing = fileContents[block.filename] ?? ''
                                const separator = `\n// ── ${block.name} ` + '─'.repeat(Math.max(0, 48 - block.name.length)) + '\n'
                                updateFile(block.filename, existing + separator + block.code.trimStart())
                                if (!openFiles.includes(block.filename)) setOpenFiles(p => [...p, block.filename])
                                setActiveFile(block.filename)
                                addTerm(`[OK] Inserted "${block.name}" into ${block.filename}`)
                              }}
                              style={{ display: 'flex', alignItems: 'center', gap: '.55rem', padding: '.5rem .65rem', background: isInProject ? `${catMeta.color}0D` : C.bg3, border: `1px solid ${isInProject ? catMeta.color + '35' : C.border}`, borderRadius: 8, cursor: 'grab', transition: 'all .12s' }}
                            >
                              <span style={{ fontSize: '1.05rem', flexShrink: 0 }}>{block.icon}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem', marginBottom: '.08rem' }}>
                                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.63rem', fontWeight: 700, color: isInProject ? catMeta.color : C.white, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{block.name}</span>
                                  {isInProject && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.44rem', color: catMeta.color, letterSpacing: '.06em', flexShrink: 0 }}>[OK] ADDED</span>}
                                </div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.54rem', color: C.muted, lineHeight: 1.45 }}>{block.desc}</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.46rem', color: C.faint, marginTop: '.1rem' }}>→ {block.filename}</div>
                              </div>
                              <div style={{ color: C.faint, fontSize: '.7rem', flexShrink: 0 }}>⋮⋮</div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Quick search across all blocks */}
                      <div style={{ marginTop: '.65rem', paddingTop: '.55rem', borderTop: `1px solid ${C.border}` }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: C.faint, marginBottom: '.35rem', letterSpacing: '.06em' }}>ALL {ALL_BLOCKS.length} BLOCKS</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.22rem' }}>
                          {ALL_BLOCKS.map(b => (
                            <button key={b.id} onClick={() => { setBlockCat(b.category) }}
                              style={{ padding: '.12rem .35rem', borderRadius: 4, border: `1px solid ${CATEGORY_META[b.category].color}28`, background: `${CATEGORY_META[b.category].color}0A`, color: CATEGORY_META[b.category].color, fontFamily: 'var(--font-mono)', fontSize: '.48rem', cursor: 'pointer', letterSpacing: '.02em' }}>
                              {b.icon} {b.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {dataView === 'apis' && (
                    <>
                      <input placeholder="Search data sources…" value={dataSearch} onChange={e => setDataSearch(e.target.value)} style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 7, padding: '.4rem .6rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.63rem', outline: 'none', marginBottom: '.6rem', boxSizing: 'border-box' }} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
                        {filteredAPIs.map(api => {
                          const isUsed = usedAPIIds.has(api.id)
                          return (
                            <div key={api.id} onClick={() => setSelAPI(selAPI?.id === api.id ? null : api)} style={{ background: selAPI?.id === api.id ? `${C.blue}10` : isUsed ? `${C.mint}07` : C.bg3, border: `1px solid ${selAPI?.id === api.id ? C.blue + '35' : isUsed ? C.mint + '30' : C.border}`, borderRadius: 9, padding: '.55rem .68rem', cursor: 'pointer', transition: 'all .12s' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.15rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
                                  {isUsed && <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.mint, animation: 'pulse 2s infinite', flexShrink: 0 }} />}
                                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', fontWeight: 700, color: isUsed ? C.mint : C.white }}>{api.name}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '.25rem' }}>
                                  <Tag text={api.cat} color={C.blue} />
                                  <Tag text={api.auth === 'none' ? 'FREE' : api.auth === 'optional' ? 'OPT' : 'KEY'} color={api.auth === 'none' ? C.mint : api.auth === 'optional' ? C.orange : C.muted} />
                                </div>
                              </div>
                              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: C.muted }}>{api.desc}</div>
                              {selAPI?.id === api.id && (
                                <div style={{ marginTop: '.5rem', paddingTop: '.5rem', borderTop: `1px solid ${C.border}` }}>
                                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, marginBottom: '.28rem' }}>Rate limit: {api.limit}</div>
                                  <div style={{ display: 'flex', gap: '.32rem' }}>
                                    <button onClick={e => { e.stopPropagation(); const loader = `data_loaders.py`; updateFile(loader, (fileContents[loader] ?? '') + `\n# ── ${api.name} ──────────────────────────────────────────────\n# Added from Data panel\n`); openFile(loader); addTerm(`[OK] ${api.name} added to data_loaders.py`) }}
                                      style={{ flex: 1, padding: '.28rem', borderRadius: 5, background: C.blue, color: '#fff', border: 'none', fontFamily: 'var(--font-mono)', fontSize: '.54rem', fontWeight: 700, cursor: 'pointer' }}>Add to project</button>
                                    <button onClick={e => { e.stopPropagation(); setChatInput(`How do I use ${api.name} data for crypto alpha generation?`); setBottomMode('chat'); setTimeout(() => chatInputRef.current?.focus(), 50) }}
                                      style={{ flex: 1, padding: '.28rem', borderRadius: 5, background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, fontFamily: 'var(--font-mono)', fontSize: '.54rem', cursor: 'pointer' }}>Ask AI</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}

                  {dataView === 'ml' && (
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.faint, marginBottom: '.5rem', lineHeight: 1.65 }}>
                        Drag tools to the explorer or click to add a starter file to your project.
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
                        {ML_TOOLS.map(tool => (
                          <div key={tool.id}
                            draggable
                            onDragEnd={() => { updateFile(`${tool.id}_signals.py`, `"""${tool.name} signal generator\n${tool.desc}\n"""\n# TODO: implement\n`); openFile(`${tool.id}_signals.py`); addTerm(`[OK] Created ${tool.id}_signals.py`) }}
                            onClick={() => { const fname = `${tool.id}_signals.py`; updateFile(fname, `"""${tool.name} signal generator\n${tool.desc}\n"""\n\n# pip install ${tool.id}\n# import ${tool.id === 'sklearn' ? 'sklearn' : tool.id}\n\ndef generate_ml_signals(features):\n    \"\"\"TODO: implement ${tool.name} signal logic\"\"\"\n    pass\n`); openFile(fname); addTerm(`[OK] Added ${fname}`) }}
                            style={{ display: 'flex', alignItems: 'center', gap: '.55rem', padding: '.5rem .65rem', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'grab' }}>
                            <span style={{ fontSize: '1.1rem' }}>{tool.icon}</span>
                            <div>
                              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.63rem', fontWeight: 700, color: C.white, marginBottom: '.1rem' }}>{tool.name}</div>
                              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.54rem', color: C.muted }}>{tool.desc}</div>
                            </div>
                            <div style={{ marginLeft: 'auto', color: C.faint, fontSize: '.7rem' }}>⋮⋮</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── DOCS TAB ── */}
              {rightTab === 'docs' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.55rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.faint, letterSpacing: '.06em' }}>ENGINE DOCUMENTATION</span>
                    <button onClick={() => { openFile('DOCS.md') }} style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.blue2, background: 'transparent', border: 'none', cursor: 'pointer' }}>Open in editor</button>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: C.text, lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
                    <MdText text={fileContents['DOCS.md'] ?? DEFAULT_FILES['DOCS.md']} />
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

        {/* ── BOTTOM: TERMINAL or AI CHAT ── */}
        <div style={{ height: 210, flexShrink: 0, borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column' }}>
          {/* Bottom header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', padding: '.25rem .65rem', borderBottom: `1px solid ${C.border}`, background: C.bg2, flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: '.22rem' }}>
              {[C.red, C.orange, C.mint].map(c => <div key={c} style={{ width: 7, height: 7, borderRadius: '50%', background: c, opacity: 0.75 }} />)}
            </div>
            {(['terminal','chat'] as const).map(mode => (
              <button key={mode} onClick={() => setBottomMode(mode)} style={{ padding: '.18rem .45rem', borderRadius: 5, border: `1px solid ${bottomMode === mode ? C.blue + '40' : 'transparent'}`, background: bottomMode === mode ? `${C.blue}10` : 'transparent', color: bottomMode === mode ? C.blue2 : C.faint, fontFamily: 'var(--font-mono)', fontSize: '.54rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '.04em' }}>
                {mode === 'terminal' ? 'TERMINAL' : 'AI CHAT'}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            {bottomMode === 'terminal' && <button onClick={() => setTermLines([])} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '.52rem' }}>clear</button>}
            {bottomMode === 'chat' && <button onClick={() => setChatMsgs(chatMsgs.slice(0, 1))} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '.52rem' }}>clear</button>}
          </div>

          {/* Terminal */}
          {bottomMode === 'terminal' && (
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <TerminalPanel lines={termLines} input={termInput} onInput={setTermInput} onSubmit={handleTermSubmit} loading={btLoading} />
            </div>
          )}

          {/* AI Chat */}
          {bottomMode === 'chat' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>
              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '.5rem .75rem', display: 'flex', flexDirection: 'column', gap: '.45rem' }}>
                {chatMsgs.map((m, i) => (
                  <div key={i} style={{ display: 'flex', gap: '.4rem', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    {m.role === 'ai' && (
                      <div style={{ width: 20, height: 20, borderRadius: 6, background: `${C.blue}20`, border: `1px solid ${C.blue}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '.05rem' }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.blue2} strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
                      </div>
                    )}
                    <div style={{ maxWidth: '88%', padding: '.4rem .6rem', borderRadius: m.role === 'user' ? '9px 9px 2px 9px' : '9px 9px 9px 2px', background: m.role === 'user' ? `${C.blue}20` : C.bg3, border: `1px solid ${m.role === 'user' ? C.blue + '28' : C.border}`, fontFamily: 'var(--font-mono)', fontSize: '.63rem', color: C.text, lineHeight: 1.6, maxHeight: 160, overflowY: 'auto' }}>
                      {m.role === 'ai' ? <MdText text={m.text} onApply={applyEdit} /> : <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span>}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div style={{ display: 'flex', gap: '.28rem', paddingLeft: '.4rem' }}>
                    {[0,1,2].map(j => <div key={j} style={{ width: 4, height: 4, borderRadius: '50%', background: C.blue, opacity: 0.6, animation: `bounce ${0.6 + j * 0.15}s ease-in-out infinite` }} />)}
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              {/* Quick prompts */}
              <div style={{ display: 'flex', gap: '.28rem', overflowX: 'auto', padding: '0 .65rem .28rem', flexShrink: 0 }}>
                {['Improve Sharpe', 'Add NUPL signal', 'Reduce drawdown', 'Explain results', 'Optimize λ'].map(s => (
                  <button key={s} onClick={() => { setChatInput(s); chatInputRef.current?.focus() }} style={{ padding: '.15rem .42rem', borderRadius: 20, border: `1px solid ${C.border}`, background: 'transparent', color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '.52rem', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>{s}</button>
                ))}
              </div>
              {/* Input */}
              <div style={{ display: 'flex', gap: '.32rem', borderTop: `1px solid ${C.border}`, padding: '.35rem .65rem', alignItems: 'flex-end', flexShrink: 0 }}>
                <textarea ref={chatInputRef} value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendChat() } }} placeholder="Ask AI about your strategy… (Enter to send, Shift+Enter for newline)" rows={1} style={{ flex: 1, background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 7, padding: '.38rem .58rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.63rem', outline: 'none', resize: 'none', lineHeight: 1.5, maxHeight: 80, overflowY: 'auto' }} />
                <button onClick={() => void sendChat()} disabled={!chatInput.trim() || chatLoading} style={{ padding: '.38rem .5rem', borderRadius: 7, background: chatInput.trim() ? C.blue : `${C.blue}40`, border: 'none', color: '#fff', cursor: chatInput.trim() ? 'pointer' : 'default', alignSelf: 'flex-end', flexShrink: 0 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin   { to { transform: rotate(360deg) } }
        @keyframes bounce { 0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)} }
        @keyframes pulse  { 0%,100%{opacity:1}50%{opacity:.3} }
      `}</style>
    </>
  )
}
