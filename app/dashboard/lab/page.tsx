'use client'

import { useEffect, useMemo, useRef, useState, Suspense, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import {
  C, TEMPLATES, UNIVERSES, CONFIG_FIELD_META, DATA_APIS, GRADE_CLR, AGENT_ICONS,
} from '@/lib/backtest-config'
import { BLOCK_CATEGORIES, getBlockById } from '@/lib/quant/blocks'
import { ALL_BLOCKS as BLOCKS, CATEGORY_META } from '@/lib/llm-blocks'
import { STRATEGIES } from '@/lib/backtest'

type LabFile = { path: string; content: string; dirty?: boolean }
type ChatRole = 'user' | 'assistant' | 'system'
type ChatMessage = { id: string; role: ChatRole; content: string; pending?: boolean }
type AgentSpec = Record<string, unknown> & { name?: string; thesis?: string; symbols?: string[]; cadence?: string }

const STORAGE_KEY = 'ase_lab_state_v3'

interface LabState {
  files: LabFile[]
  activePath: string
  spec: AgentSpec | null
  agentId: string | null
  prompt: string | null
  blocks: string[]
}

interface FileEdit { filename: string; content: string; lang: string }

function emptyState(): LabState {
  return {
    files: [
      {
        path: 'README.md',
        content: '# Welcome to the ASE Lab\n\nNo agent loaded yet. Head to **Build** to describe a strategy and we\'ll generate the file tree for you, or start typing in the chat to ask the AI to scaffold one.',
      },
    ],
    activePath: 'README.md',
    spec: null,
    agentId: null,
    prompt: null,
    blocks: [],
  }
}

const STRATEGY_MAP: Record<string, string> = {
  'momentum_conservative': 'crypto_momentum',
  'mean_reversion_active': 'crypto_mean_reversion',
  'composite_balanced': 'crypto_momentum',
  'ml_aggressive': 'crypto_momentum',
  'risk_parity': 'trend_following',
}

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

function parseFileDirectives(text: string): { path: string; content: string }[] {
  const out: { path: string; content: string }[] = []
  const re = /```(?:[a-z]+)?\s*\n(?:\/\/|#)\s*FILE:\s*([^\n]+)\n([\s\S]*?)```/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const path = m[1].trim().replace(/^[./]+/, '')
    const content = m[2].replace(/\n$/, '')
    if (path) out.push({ path, content })
  }
  return out
}

function languageFromPath(path: string): string {
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'TypeScript'
  if (path.endsWith('.js') || path.endsWith('.jsx')) return 'JavaScript'
  if (path.endsWith('.json')) return 'JSON'
  if (path.endsWith('.md')) return 'Markdown'
  if (path.endsWith('.py')) return 'Python'
  return 'Plain'
}

function fileIcon(path: string): string {
  if (path.endsWith('.json')) return '{ }'
  if (path.endsWith('.md')) return '¶'
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'TS'
  if (path.endsWith('.py')) return 'py'
  return '·'
}

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

function LabInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [state, setState] = useState<LabState>(emptyState)
  const [hydrated, setHydrated] = useState(false)
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatStreaming, setChatStreaming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [pinnedBlocks, setPinnedBlocks] = useState<string[]>([])
  const [blockSearch, setBlockSearch] = useState('')
  const [blockPalette, setBlockPalette] = useState<'data' | 'signal' | 'compositor' | 'risk' | 'execution'>('signal')
  const [focusChat, setFocusChat] = useState(false)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)

  const [autoApply, setAutoApply] = useState<boolean>(() => {
    try { return localStorage.getItem('ase-auto-apply') !== '0' } catch { return true }
  })
  const [pendingEdits, setPendingEdits] = useState<FileEdit[]>([])
  const [agentIconIdx, setAgentIconIdx] = useState(0)

  const [rightTab, setRightTab] = useState<'backtest'|'data'|'chat'>('backtest')
  const [configFields, setConfigFields] = useState<Record<string, { value: string | number | boolean; type: string }>>({})

  const [template, setTemplate] = useState('composite_balanced')
  const [universe, setUniverse] = useState('crypto_top10')
  const [startDate, setStartDate] = useState('2024-01-01')
  const [endDate] = useState(new Date().toISOString().slice(0, 10))
  const [rebalFreq, setRebalFreq] = useState<'daily'|'weekly'|'monthly'>('weekly')
  const [riskAversion, setRiskAversion] = useState(4)
  const [maxWeight, setMaxWeight] = useState(0.30)
  const [walkFwd, setWalkFwd] = useState(true)
  const [initCapital, setInitCapital] = useState(1000000)
  const [feeBps, setFeeBps] = useState(7)
  const [btLoading, setBtLoading] = useState(false)
  const [btResult, setBtResult] = useState<Record<string, unknown> | null>(null)
  const [btError, setBtError] = useState('')
  const [btStartTime, setBtStartTime] = useState<number | null>(null)
  const [btElapsed, setBtElapsed] = useState(0)

  const [dataSearch, setDataSearch] = useState('')
  const [dataView, setDataView] = useState<'blocks'|'apis'|'ml'>('blocks')
  const [blockCat, setBlockCat] = useState<'data' | 'signal' | 'compositor' | 'risk' | 'execution'>('data')

  useEffect(() => {
    const pending = localStorage.getItem('ase_pending_agent')
    if (pending) {
      try {
        const parsed = JSON.parse(pending) as { 
          agent?: AgentSpec; 
          files?: LabFile[]; 
          prompt?: string; 
          blocks?: string[];
          initialChat?: string;
          agentId?: string | null;
        }
        
        if (parsed.initialChat && parsed.files) {
          const files: LabFile[] = parsed.files.map(f => ({ path: f.path, content: f.content }))
          
          const next: LabState = {
            files,
            activePath: files.find(f => f.path === 'signals.ts')?.path ?? files[0]?.path ?? 'spec.json',
            spec: {},
            agentId: parsed.agentId ?? null,
            prompt: parsed.prompt ?? null,
            blocks: parsed.blocks ?? [],
          }
          setState(next)
          setPinnedBlocks(parsed.blocks ?? [])
          
          setChat([
            {
              id: crypto.randomUUID(),
              role: 'user',
              content: parsed.prompt ?? 'Build agent',
            },
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: parsed.initialChat,
            },
          ])
          setFocusChat(true)
          
          localStorage.removeItem('ase_pending_agent')
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
          setHydrated(true)
          return
        }
        
        if (parsed.initialChat && !parsed.files) {
          const templateFiles: LabFile[] = [
            { path: 'README.md', content: `# ${parsed.prompt?.slice(0, 50) || 'New Agent'}\n\nBuilding...`, dirty: true },
            { path: 'spec.json', content: JSON.stringify({ name: parsed.prompt?.slice(0, 40), thesis: parsed.prompt, blocks: parsed.blocks ?? [] }, null, 2), dirty: true },
            { path: 'signals.ts', content: '// Your signals here', dirty: true },
            { path: 'risk.ts', content: '// Your risk logic here', dirty: true },
            { path: 'exec.ts', content: '// Your execution logic here', dirty: true },
          ]
          
          const next: LabState = {
            files: templateFiles,
            activePath: 'signals.ts',
            spec: {},
            agentId: null,
            prompt: parsed.prompt ?? null,
            blocks: parsed.blocks ?? [],
          }
          setState(next)
          setPinnedBlocks(parsed.blocks ?? [])
          setFocusChat(true)
          
          setChat([
            {
              id: crypto.randomUUID(),
              role: 'user',
              content: parsed.prompt ?? 'Build agent',
            },
          ])
          
          localStorage.removeItem('ase_pending_agent')
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
          setHydrated(true)
          
          setTimeout(() => {
            const chatId = crypto.randomUUID()
            setChat(prev => [...prev, { id: chatId, role: 'assistant', content: '', pending: true }])
            
            fetch('/api/ai/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messages: [
                  { role: 'user', content: `Build a trading agent from this prompt: "${parsed.prompt}"` + ((parsed.blocks?.length ?? 0) > 0 ? `\n\nSelected blocks to incorporate:\n${parsed.blocks?.map(id => getBlockById(id)?.label ?? id).join(', ')}` : '') }
                ],
                apiIds: (parsed.blocks ?? []).join(','),
                buildMode: true
              }),
            })
            .then(r => r.json())
            .then(data => {
              if (data.content) {
                setChat(prev => prev.map(m => m.id === chatId ? { ...m, content: data.content, pending: false } : m))
                
                const fileDirectives: { path: string; content: string }[] = []
                const fileRe = /```(?:[a-z]+)?\s*\n(?:\/\/|#)\s*FILE:\s*([^\n]+)\n([\s\S]*?)```/g
                let match
                while ((match = fileRe.exec(data.content)) !== null) {
                  const path = match[1].trim().replace(/^[./]+/, '')
                  const content = match[2].replace(/\n$/, '')
                  if (path) fileDirectives.push({ path, content })
                }
                
                setState(prev => {
                  const map = new Map(prev.files.map(f => [f.path, f]))
                  for (const f of fileDirectives) {
                    map.set(f.path, { path: f.path, content: f.content, dirty: true })
                  }
                  return { ...prev, files: Array.from(map.values()) }
                })
              }
            })
            .catch(console.error)
          }, 100)
          
          return
        }
        
        if (parsed.agent) {
          const files: LabFile[] = (parsed.files ?? []).map(f => ({ path: f.path, content: f.content }))
          if (!files.some(f => f.path === 'spec.json')) {
            files.unshift({ path: 'spec.json', content: JSON.stringify(parsed.agent, null, 2) })
          }
          const next: LabState = {
            files,
            activePath: files.find(f => f.path === 'README.md')?.path ?? files[0].path ?? 'spec.json',
            spec: parsed.agent,
            agentId: null,
            prompt: parsed.prompt ?? null,
            blocks: parsed.blocks ?? [],
          }
          setState(next)
          setPinnedBlocks(parsed.blocks ?? [])
          if (parsed.prompt) {
            setChat([
              { id: crypto.randomUUID(), role: 'system', content: `Loaded agent from your prompt.` },
              { id: crypto.randomUUID(), role: 'user', content: parsed.prompt },
            ])
          }
          localStorage.removeItem('ase_pending_agent')
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
          setHydrated(true)
          return
        }
      } catch (e) {
        console.warn('[lab] failed to parse pending agent', e)
      }
    }
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try { setState(JSON.parse(saved)) } catch {}
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state, hydrated])

  useEffect(() => {
    if (!hydrated) return
    try { localStorage.setItem('ase-auto-apply', autoApply ? '1' : '0') } catch {}
  }, [autoApply, hydrated])

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [chat])

  useEffect(() => {
    if (focusChat && chatInputRef.current) {
      chatInputRef.current.focus()
      setFocusChat(false)
    }
  }, [focusChat, chat])

  useEffect(() => {
    if (!btLoading || !btStartTime) return
    const id = setInterval(() => setBtElapsed(Math.round((Date.now() - btStartTime) / 1000)), 500)
    return () => clearInterval(id)
  }, [btLoading, btStartTime])

  useEffect(() => {
    if (rightTab === 'chat') {
      setFocusChat(true)
    }
  }, [rightTab])

  const activeFile = state.files.find(f => f.path === state.activePath) ?? state.files[0]
  const dirtyCount = state.files.filter(f => f.dirty).length

  const usedAPIIds = useMemo(() => {
    const all = state.files.map(f => f.content).join('\n').toLowerCase()
    return new Set(DATA_APIS.filter(a => all.includes(a.id) || all.includes(a.name.toLowerCase())).map(a => a.id))
  }, [state.files])

  const ts = (btResult?.tear_sheet ?? {}) as Record<string, number>
  const equity = (btResult?.equity_curve ?? []) as Array<{ date: string; equity: number }>
  const icSeries = (btResult?.ic_series ?? []) as Array<{ date: string; ic: number }>
  const grade = (btResult?.grade as string) ?? ''
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

  const estimateBtTime = () => {
    const yr = (new Date().getFullYear() - parseInt(startDate.slice(0, 4))) + 1
    const base = walkFwd ? yr * 3 : yr * 1.5
    return Math.round(base) + '–' + Math.round(base * 2) + 's'
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2400)
  }

  function applyFiles(mutations: { path: string; content: string }[]) {
    setState(prev => {
      const map = new Map(prev.files.map(f => [f.path, f]))
      for (const m of mutations) {
        map.set(m.path, { path: m.path, content: m.content, dirty: true })
      }
      return { ...prev, files: Array.from(map.values()), activePath: mutations[mutations.length - 1].path }
    })
  }

  function updateActiveContent(content: string) {
    setState(prev => ({
      ...prev,
      files: prev.files.map(f => f.path === prev.activePath ? { ...f, content, dirty: true } : f),
    }))
  }

  function selectFile(path: string) {
    setState(prev => ({ ...prev, activePath: path }))
  }

  function newFile() {
    const base = 'untitled.ts'
    let i = 1, name = base
    while (state.files.some(f => f.path === name)) { name = `untitled-${i++}.ts` }
    setState(prev => ({
      ...prev,
      files: [...prev.files, { path: name, content: '', dirty: true }],
      activePath: name,
    }))
    setRenamingPath(name)
    setRenameValue(name)
  }

  function deleteFile(path: string) {
    if (state.files.length <= 1) { showToast('Keep at least one file'); return }
    setState(prev => {
      const files = prev.files.filter(f => f.path !== path)
      return { ...prev, files, activePath: files[0].path }
    })
  }

  function commitRename(oldPath: string, newPath: string) {
    setRenamingPath(null)
    if (!newPath || newPath === oldPath) return
    if (state.files.some(f => f.path === newPath)) { showToast('A file with that name already exists'); return }
    setState(prev => ({
      ...prev,
      files: prev.files.map(f => f.path === oldPath ? { ...f, path: newPath, dirty: true } : f),
      activePath: prev.activePath === oldPath ? newPath : prev.activePath,
    }))
  }

  const updateConfigJson = (changes: Record<string, unknown>) => {
    setState(prev => {
      const specFile = prev.files.find(f => f.path === 'spec.json')
      if (!specFile) return prev
      try {
        const parsed = JSON.parse(specFile.content)
        const merged = { ...parsed, ...changes }
        const updated = prev.files.map(f => f.path === 'spec.json' ? { ...f, content: JSON.stringify(merged, null, 2), dirty: true } : f)
        return { ...prev, files: updated }
      } catch { return prev }
    })
  }

  async function runBacktest() {
    setBtLoading(true); setBtError(''); setBtResult(null)
    setBtStartTime(Date.now()); setBtElapsed(0)
    
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
      showToast(`Backtest complete — Grade: ${data.grade}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error'
      setBtError(msg)
      showToast(msg)
    } finally { setBtLoading(false); setBtStartTime(null) }
  }

  async function handleSave() {
    if (!state.spec) { showToast('Compile an agent first to save'); return }
    setSaving(true)
    try {
      const specWithFiles = { ...state.spec, files: state.files.map(f => ({ path: f.path, content: f.content })) }
      let agentId = state.agentId
      if (!agentId) {
        const res = await fetch('/api/quant/agent/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: state.spec?.name ?? 'Untitled Agent',
            thesis: state.spec?.thesis ?? '',
            prompt: state.prompt ?? '',
            spec: specWithFiles,
            status: 'draft',
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'save failed')
        agentId = data.agent?.id
        setState(prev => ({ ...prev, agentId }))
      } else {
        const res = await fetch(`/api/quant/agent/save?id=${agentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spec: specWithFiles }),
        })
        if (!res.ok) throw new Error('save failed')
      }
      setState(prev => ({ ...prev, files: prev.files.map(f => ({ ...f, dirty: false })) }))
      showToast('Saved')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handlePublish() {
    if (!btResult) { showToast('Run a backtest first'); return }
    setPublishing(true)
    try {
      const name = state.spec?.name ?? 'Untitled Agent'
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: `${template.replace(/_/g, ' ')} agent — published from Lab. Grade ${grade}.`,
          strategy_type: STRATEGY_MAP[template] ?? 'crypto_momentum',
          primary_symbol: 'BTC/USD',
          backtest_strategy: template,
          asset_class: 'crypto',
          slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          ticker: name.slice(0, 4).toUpperCase(),
          strategy_code: state.files.find(f => f.path === 'signals.ts')?.content ?? '',
          config_json: state.files.find(f => f.path === 'spec.json')?.content ?? '{}',
          publish: true,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Publish failed')
      }
      showToast(`"${name}" published to exchange`)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Publish failed')
    } finally {
      setPublishing(false)
    }
  }

  async function sendChat() {
    const text = chatInput.trim()
    if (!text || chatStreaming) return
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text }
    const assistantMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '', pending: true }
    setChat(prev => [...prev, userMsg, assistantMsg])
    setChatInput('')
    setChatStreaming(true)

    try {
      const codebase = state.files.map(f => `// ${f.path}\n${f.content}`).join('\n\n')
      const btCtx = btResult
        ? `Grade: ${btResult.grade} | CAGR: ${(ts.cagr??0).toFixed(1)}% | Sharpe: ${(ts.sharpeRatio??0).toFixed(2)} | MaxDD: ${(ts.maxDrawdownPct??0).toFixed(1)}%`
        : 'No backtest run yet.'

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stream: true,
          codebase,
          activeFile: state.activePath,
          btContext: btCtx,
          apiIds: Array.from(usedAPIIds).join(', '),
          messages: [...chat, userMsg].map(m => ({ role: m.role === 'system' ? 'assistant' : m.role, content: m.content })),
        }),
      })
      if (!res.ok || !res.body) throw new Error(`chat failed: ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let acc = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6).trim()
          if (payload === '[DONE]') continue
          try {
            const obj = JSON.parse(payload)
            if (obj.content) {
              acc += obj.content
              setChat(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content: acc } : m))
            }
          } catch {}
        }
      }

      const extracted: FileEdit[] = []
      const codeBlockRe = /```(\w+)?\n([\s\S]*?)```/g
      let m: RegExpExecArray | null
      const re = new RegExp(codeBlockRe.source, 'g')
      while ((m = re.exec(acc)) !== null) {
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
            setState(prev => {
              const map = new Map(prev.files.map(f => [f.path, f]))
              map.set(edit.filename, { path: edit.filename, content: edit.content, dirty: true })
              return { ...prev, files: Array.from(map.values()), activePath: edit.filename }
            })
          })
          showToast(`[OK] Auto-applied ${extracted.length} AI edit${extracted.length !== 1 ? 's' : ''}`)
        } else {
          setPendingEdits(extracted)
        }
      }

      setChat(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, pending: false } : m))
    } catch (e) {
      const err = e instanceof Error ? e.message : 'chat failed'
      setChat(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content: `_${err}_`, pending: false } : m))
    } finally {
      setChatStreaming(false)
    }
  }

  const applyEdit = useCallback((edit: FileEdit) => {
    setState(prev => {
      const map = new Map(prev.files.map(f => [f.path, f]))
      map.set(edit.filename, { path: edit.filename, content: edit.content, dirty: true })
      return { ...prev, files: Array.from(map.values()), activePath: edit.filename }
    })
    setPendingEdits(p => p.filter(e => e.filename !== edit.filename))
    showToast(`[OK] Applied edit to ${edit.filename}`)
  }, [])

  const applyAllEdits = useCallback(() => {
    pendingEdits.forEach(edit => {
      setState(prev => {
        const map = new Map(prev.files.map(f => [f.path, f]))
        map.set(edit.filename, { path: edit.filename, content: edit.content, dirty: true })
        return { ...prev, files: Array.from(map.values()) }
      })
    })
    if (pendingEdits.length > 0) selectFile(pendingEdits[0].filename)
    showToast(`[OK] Applied ${pendingEdits.length} AI edit${pendingEdits.length !== 1 ? 's' : ''}`)
    setPendingEdits([])
  }, [pendingEdits])

  const filteredCategory = BLOCK_CATEGORIES.find(c => c.id === blockPalette)!
  const visibleBlocks = filteredCategory.blockIds
    .map(id => BLOCKS.find(b => b.id === id))
    .filter(Boolean)
    .filter(b => !blockSearch || b!.name.toLowerCase().includes(blockSearch.toLowerCase()))

  return (
    <div className="lab-root">
      <style>{`
        .lab-root { display: flex; flex-direction: column; height: calc(100vh - 56px); background: var(--bg); color: var(--text); overflow: hidden; }
        .lab-bar {
          height: 42px; display: flex; align-items: center; justify-content: space-between;
          padding: 0 1rem; border-bottom: 1px solid var(--border);
          background: rgba(6,17,31,.72); backdrop-filter: blur(10px);
          flex-shrink: 0;
        }
        .lab-bar-left { display: flex; align-items: center; gap: .8rem; }
        .lab-bar-title { font-family: var(--font-serif); font-size: 1rem; font-weight: 700; color: var(--white); letter-spacing: -.01em; }
        .lab-bar-meta { font-family: var(--font-mono); font-size: .58rem; color: var(--faint); letter-spacing: .04em; text-transform: uppercase; }
        .lab-bar-right { display: flex; align-items: center; gap: .35rem; }
        .lab-bar-btn {
          padding: .35rem .8rem; border-radius: 8px; font-family: var(--font-mono); font-size: .62rem;
          letter-spacing: .04em; color: var(--muted); background: var(--bg3); border: 1px solid var(--border);
          cursor: pointer; transition: all .14s; font-weight: 600;
        }
        .lab-bar-btn:hover { color: var(--white); border-color: rgba(79,140,255,.3); }
        .lab-bar-btn.is-primary {
          background: linear-gradient(135deg, var(--blue), var(--blue2)); color: #fff; border-color: transparent;
        }
        .lab-bar-btn.is-run {
          background: linear-gradient(135deg, var(--mint), var(--mint2)); color: #04130b; border-color: transparent;
        }
        .lab-bar-btn:disabled { opacity: .4; cursor: not-allowed; }
        .lab-grid {
          display: grid; grid-template-columns: 140px 1fr 380px; flex: 1; min-height: 0;
        }
        .lab-pane { display: flex; flex-direction: column; min-height: 0; min-width: 0; border-right: 1px solid var(--border); }
        .lab-pane-head {
          padding: .5rem .65rem; font-family: var(--font-mono); font-size: .54rem;
          color: var(--faint); letter-spacing: .1em; text-transform: uppercase;
          border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between;
          flex-shrink: 0;
        }
        .lab-pane-body { flex: 1; overflow: auto; min-height: 0; }
        .lab-tree-row {
          display: flex; align-items: center; gap: .4rem;
          padding: .3rem .6rem; cursor: pointer; font-size: .78rem;
          color: var(--text); border-left: 2px solid transparent;
          transition: background .12s;
        }
        .lab-tree-row:hover { background: var(--blue-dim); }
        .lab-tree-row.is-active {
          background: rgba(79,140,255,.10); border-left-color: var(--blue);
          color: var(--white);
        }
        .lab-tree-icon {
          width: 20px; font-family: var(--font-mono); font-size: .54rem; color: var(--faint);
          letter-spacing: -.02em; flex-shrink: 0;
        }
        .lab-tree-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .lab-tree-dot { width: 5px; height: 5px; border-radius: 999px; background: var(--orange); flex-shrink: 0; }
        .lab-tree-trash {
          background: transparent; border: 0; color: var(--faint); font-size: .85rem; cursor: pointer;
          padding: 0 .2rem; line-height: 1; opacity: 0;
        }
        .lab-tree-row:hover .lab-tree-trash { opacity: 1; }
        .lab-tree-trash:hover { color: var(--red); }
        .lab-tree-newbtn {
          width: 100%; padding: .3rem .4rem; border-radius: 6px;
          background: rgba(79,140,255,.08); border: 1px dashed rgba(79,140,255,.32);
          color: var(--blue2); font-family: var(--font-mono); font-size: .56rem;
          letter-spacing: .04em; cursor: pointer; margin: .4rem;
        }
        .lab-tree-newbtn:hover { background: var(--blue-dim); border-style: solid; }
        .lab-editor-tabs {
          display: flex; align-items: center; padding: 0 .4rem;
          height: 28px; flex-shrink: 0; overflow-x: auto;
          border-bottom: 1px solid var(--border); background: var(--bg2);
        }
        .lab-editor-tab {
          display: inline-flex; align-items: center; gap: .3rem;
          padding: .2rem .5rem; border-radius: 5px 5px 0 0;
          font-family: var(--font-mono); font-size: .58rem; color: var(--faint);
          cursor: pointer; transition: all .12s; flex-shrink: 0;
          border-bottom: 2px solid transparent; margin-right: .2rem;
        }
        .lab-editor-tab.is-active {
          color: var(--white); background: var(--bg);
          border-bottom-color: var(--blue);
        }
        .lab-editor-area { flex: 1; display: flex; min-height: 0; background: var(--bg); }
        .lab-editor {
          flex: 1; padding: .8rem 1rem; background: var(--bg);
          color: var(--ivory); font-family: var(--font-mono); font-size: .78rem;
          line-height: 1.55; border: 0; outline: none; resize: none; tab-size: 2;
          overflow: auto;
        }
        .lab-editor-status {
          height: 20px; display: flex; align-items: center; justify-content: space-between;
          padding: 0 .6rem; font-family: var(--font-mono); font-size: .5rem;
          color: var(--faint); letter-spacing: .05em; border-top: 1px solid var(--border);
          background: var(--bg2); flex-shrink: 0;
        }

        .lab-chat-list { flex: 1; overflow-y: auto; padding: .7rem .75rem; min-height: 0; }
        .lab-chat-msg { margin-bottom: .8rem; animation: fadeIn .2s ease-out; }
        .lab-chat-msg[data-role="user"] .lab-chat-bubble {
          background: rgba(79,140,255,.10); border-color: rgba(79,140,255,.28);
        }
        .lab-chat-msg[data-role="system"] .lab-chat-bubble {
          background: rgba(245,158,11,.06); border-color: rgba(245,158,11,.22); color: var(--orange2);
        }
        .lab-chat-role {
          font-family: var(--font-mono); font-size: .48rem; color: var(--faint);
          letter-spacing: .1em; text-transform: uppercase; margin-bottom: .2rem;
        }
        .lab-chat-bubble {
          background: var(--bg2); border: 1px solid var(--border); border-radius: 8px;
          padding: .5rem .65rem; font-size: .76rem; color: var(--text);
          line-height: 1.45; white-space: pre-wrap;
        }
        .lab-chat-pending::after {
          content: '▌'; color: var(--blue2); animation: blink 1.1s infinite;
        }
        @keyframes blink { 0%,100% { opacity: 1 } 50% { opacity: 0 } }

        .lab-chat-input-wrap {
          padding: .45rem .6rem .6rem; border-top: 1px solid var(--border);
          background: var(--bg2); flex-shrink: 0;
        }
        .lab-chat-input {
          width: 100%; background: var(--bg3); border: 1px solid var(--border);
          border-radius: 8px; padding: .45rem .6rem; color: var(--white);
          font-size: .78rem; font-family: var(--font-body); outline: none; resize: none;
          line-height: 1.4;
        }
        .lab-chat-input:focus { border-color: rgba(79,140,255,.42); }
        .lab-chat-foot {
          display: flex; align-items: center; justify-content: space-between;
          margin-top: .3rem; font-family: var(--font-mono); font-size: .5rem;
          color: var(--faint); letter-spacing: .04em;
        }
        .lab-chat-send {
          padding: .2rem .5rem; border-radius: 5px;
          background: var(--blue); color: #fff; border: 0; cursor: pointer;
          font-family: var(--font-mono); font-size: .54rem; font-weight: 700;
          letter-spacing: .04em;
        }
        .lab-chat-send:disabled { opacity: .35; cursor: not-allowed; }

        .lab-toast {
          position: fixed; bottom: 1.4rem; left: 50%; transform: translateX(-50%);
          padding: .5rem .9rem; border-radius: 100px;
          background: rgba(11,23,40,.95); border: 1px solid rgba(79,140,255,.42);
          color: var(--white); font-size: .72rem; font-family: var(--font-mono);
          box-shadow: 0 10px 28px rgba(0,0,0,.4);
          z-index: 1000; animation: fadeIn .16s ease-out;
        }

        .lab-right-tabs {
          display: flex; border-bottom: 1px solid var(--border); flex-shrink: 0;
        }
        .lab-right-tab {
          flex: 1; padding: .38rem .1rem; border: none;
          borderBottom: 2px solid transparent; background: transparent;
          color: var(--faint); font-family: var(--font-mono); font-size: .52rem;
          fontWeight: 700; letterSpacing: .06em; cursor: pointer;
          textTransform: uppercase; display: flex; alignItems: center; justifyContent: center; gap: .15rem;
        }
        .lab-right-tab[data-active="true"] { borderBottomColor: var(--blue); color: var(--blue2); }
        .lab-right-panel { flex: 1; overflow-y: auto; padding: .8rem; }

        .lab-section-title {
          font-family: var(--font-mono); font-size: .45rem;
          color: var(--faint); letter-spacing: .08em; margin-bottom: .22rem;
        }
        .lab-section-select {
          width: 100%; background: var(--bg3); border: 1px solid var(--border);
          border-radius: 6px; padding: .32rem .45rem; color: var(--text);
          font-family: var(--font-mono); font-size: .6rem; outline: none; margin-bottom: .65rem;
        }
        .lab-slider-row { margin-bottom: .45rem; }
        .lab-slider-label {
          display: flex; justify-content: space-between; margin-bottom: .15rem;
        }
        .lab-slider-track {
          width: 100%; accent-color: var(--blue);
        }
        .lab-checkbox {
          display: flex; align-items: center; gap: .35rem; cursor: pointer;
          margin-bottom: .65rem;
        }

        .lab-btn-run {
          width: 100%; padding: .52rem; border-radius: 8px; border: none;
          background: var(--blue); color: #fff; font-family: var(--font-mono);
          font-size: .68rem; font-weight: 700; cursor: pointer; margin-bottom: .75rem;
        }
        .lab-btn-run:disabled { opacity: .4; cursor: not-allowed; }

        .lab-grade-banner {
          display: flex; align-items: center; gap: .65rem; padding: .6rem .8rem;
          border-radius: 9px; margin-bottom: .75rem;
        }

        .lab-metrics-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: .35rem; margin-bottom: .75rem;
        }

        .lab-backtest-chart { margin-bottom: .75rem; }
        .lab-chart-title {
          font-family: var(--font-mono); font-size: .46rem;
          color: var(--faint); letter-spacing: .08em; margin-bottom: .32rem;
        }

        .lab-error-box {
          padding: .55rem .7rem; border-radius: 7px; color: var(--red);
          font-family: var(--font-mono); font-size: .62rem; margin-bottom: .75rem;
        }

        .lab-ai-mode-bar {
          display: flex; align-items: center; gap: .5rem; padding: .25rem .85rem;
          background: var(--bg2); border-bottom: 1px solid var(--border); flex-shrink: 0;
        }
        .lab-ai-mode-toggle {
          display: flex; align-items: center; gap: .35rem;
          padding: .18rem .55rem; border-radius: 5px;
          font-family: var(--font-mono); font-size: .56rem; font-weight: 700;
          cursor: pointer; letter-spacing: .06em;
        }
        .lab-ai-mode-toggle[data-on="true"] {
          background: rgba(22,199,132,.18); border: 1px solid rgba(22,199,132,.55);
          color: var(--mint);
        }
        .lab-ai-mode-toggle[data-on="false"] {
          background: transparent; border: 1px solid var(--border);
          color: var(--muted);
        }
        .lab-ai-mode-dot {
          width: 6px; height: 6px; border-radius: 50%;
        }

        .lab-pending-banner {
          display: flex; align-items: center; gap: .65rem; padding: .35rem .85rem;
          background: linear-gradient(90deg, rgba(79,140,255,.18), rgba(22,199,132,.10));
          border-bottom: 1px solid rgba(79,140,255,.30); flex-shrink: 0;
        }
        .lab-pending-apply {
          padding: .22rem .65rem; border-radius: 6px; border: 1px solid rgba(22,199,132,.50);
          background: rgba(22,199,132,.15); color: var(--mint);
          font-family: var(--font-mono); font-size: .58rem; font-weight: 700;
          cursor: pointer;
        }
        .lab-pending-dismiss {
          background: transparent; border: none; color: var(--faint);
          cursor: pointer; font-size: .75rem; padding: 0 .2rem; line-height: 1;
        }
      `}</style>

      <div className="lab-bar">
        <div className="lab-bar-left">
          <button onClick={() => setAgentIconIdx(i => (i + 1) % AGENT_ICONS.length)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.blue2, fontSize: '1.1rem' }}>
            {AGENT_ICONS[agentIconIdx]}
          </button>
          <div className="lab-bar-title">{state.spec?.name ?? 'Lab'}</div>
          {grade && <Tag text={grade} color={gradeCLR} />}
          <div className="lab-bar-meta">
            {state.spec ? `${(state.spec.symbols ?? []).length} symbols · ${state.spec.cadence ?? '1h'}` : 'No agent loaded'}
            {dirtyCount > 0 && ` · ${dirtyCount} unsaved`}
          </div>
        </div>
        <div className="lab-bar-right">
          <Link className="lab-bar-btn" href="/dashboard/build">+ New</Link>
          <button className="lab-bar-btn is-run" onClick={() => void runBacktest()} disabled={btLoading}>
            {btLoading ? `Running… ${btElapsed}s` : '▶ Run'}
          </button>
          <button className="lab-bar-btn is-primary" onClick={handleSave} disabled={saving || !state.spec}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="lab-bar-btn" onClick={handlePublish} disabled={publishing || !btResult}>
            {publishing ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>

      <div className="lab-grid">
        {/* File tree */}
        <div className="lab-pane">
          <div className="lab-pane-head">
            <span>Files</span>
            <span>{state.files.length}</span>
          </div>
          <div className="lab-pane-body">
            <button className="lab-tree-newbtn" onClick={newFile}>+ file</button>
            {state.files.map(f => {
              const isActive = f.path === state.activePath
              const isRenaming = renamingPath === f.path
              return (
                <div
                  key={f.path}
                  className={`lab-tree-row ${isActive ? 'is-active' : ''}`}
                  onClick={() => !isRenaming && selectFile(f.path)}
                >
                  <span className="lab-tree-icon">{fileIcon(f.path)}</span>
                  <span className="lab-tree-name">{f.path}</span>
                  {f.dirty && <span className="lab-tree-dot" />}
                  {!isRenaming && (
                    <button className="lab-tree-trash" onClick={(e) => { e.stopPropagation(); deleteFile(f.path) }}>×</button>
                  )}
                </div>
              )
            })}
          </div>
          <div className="lab-pane-head">
            <span>Data</span>
          </div>
          <div className="lab-pane-body">
            {usedAPIIds.size === 0 ? (
              <div style={{ fontSize: '.56rem', color: 'var(--faint)', padding: '.4rem' }}>No APIs detected</div>
            ) : (
              Array.from(usedAPIIds).map(id => (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '.3rem', padding: '.15rem .4rem' }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--mint)', flexShrink: 0 }} />
                  <span style={{ fontSize: '.58rem', color: 'var(--mint)' }}>{DATA_APIS.find(a => a.id === id)?.name}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Editor + Chat */}
        <div className="lab-pane lab-editor-pane">
          <div className="lab-editor-tabs">
            {state.files.filter(f => f.path === state.activePath).map(f => (
              <span key={f.path} className="lab-editor-tab is-active">
                {fileIcon(f.path)} {f.path}
              </span>
            ))}
          </div>
          <div className="lab-editor-area">
            {activeFile && (
              <textarea
                ref={editorRef}
                className="lab-editor"
                value={activeFile.content}
                onChange={e => updateActiveContent(e.target.value)}
                onKeyDown={e => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); handleSave() }
                }}
                spellCheck={false}
              />
            )}
          </div>
          <div className="lab-editor-status">
            <span>{activeFile ? `${languageFromPath(activeFile.path)} · ${activeFile.content.length} chars` : ''}</span>
            <span>⌘S</span>
          </div>
        </div>

        {/* Right panel */}
        <div className="lab-pane" style={{ width: 380 }}>
          <div className="lab-right-tabs">
            {(['backtest','data','chat'] as const).map(t => (
              <button
                key={t}
                className="lab-right-tab"
                data-active={rightTab === t}
                onClick={() => setRightTab(t)}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="lab-right-panel">
            {rightTab === 'backtest' && (
              <div>
                <div className="lab-section-title" style={{ marginBottom: '.6rem', padding: '.35rem .6rem', background: 'var(--bg3)', borderRadius: 7 }}>
                  EST. TIME: ~{estimateBtTime()}
                  {btLoading && <span style={{ color: C.orange, marginLeft: '.5rem' }}>{btElapsed}s elapsed</span>}
                </div>

                <div style={{ marginBottom: '.65rem' }}>
                  <div className="lab-section-title">TEMPLATE</div>
                  <select className="lab-section-select" value={template} onChange={e => setTemplate(e.target.value)}>
                    {TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>

                <div style={{ marginBottom: '.65rem' }}>
                  <div className="lab-section-title">START DATE</div>
                  <input type="date" className="lab-section-select" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>

                <div className="lab-slider-row">
                  <div className="lab-slider-label">
                    <span className="lab-section-title" style={{ marginBottom: 0 }}>RISK AVERSION (λ)</span>
                    <span style={{ color: C.blue2, fontSize: '.55rem' }}>{riskAversion}</span>
                  </div>
                  <input type="range" className="lab-slider-track" min={1} max={20} value={riskAversion} onChange={e => { setRiskAversion(+e.target.value); updateConfigJson({ riskAversion: +e.target.value }) }} />
                </div>

                <div className="lab-slider-row">
                  <div className="lab-slider-label">
                    <span className="lab-section-title" style={{ marginBottom: 0 }}>MAX WEIGHT / ASSET</span>
                    <span style={{ color: C.blue2, fontSize: '.55rem' }}>{(maxWeight * 100).toFixed(0)}%</span>
                  </div>
                  <input type="range" className="lab-slider-track" min={5} max={60} value={maxWeight * 100} onChange={e => { setMaxWeight(+e.target.value / 100); updateConfigJson({ maxWeight: +e.target.value / 100 }) }} />
                </div>

                <label className="lab-checkbox">
                  <input type="checkbox" checked={walkFwd} onChange={e => { setWalkFwd(e.target.checked); updateConfigJson({ walkForward: e.target.checked }) }} style={{ accentColor: C.blue }} />
                  <span style={{ fontSize: '.6rem', color: 'var(--muted)' }}>Walk-forward analysis</span>
                </label>

                <button className="lab-btn-run" onClick={() => void runBacktest()} disabled={btLoading}>
                  {btLoading ? `▶ Running… ${btElapsed}s` : '▶  Run Backtest  (⌘ Enter)'}
                </button>

                {btError && (
                  <div className="lab-error-box" style={{ background: `${C.red}08`, border: `1px solid ${C.red}20` }}>{btError}</div>
                )}

                {btResult && (
                  <div>
                    <div className="lab-grade-banner" style={{ background: `${gradeCLR}10`, border: `1px solid ${gradeCLR}28` }}>
                      <div style={{ fontSize: '1.8rem', fontWeight: 900, color: gradeCLR }}>{grade}</div>
                      <div>
                        <div style={{ fontSize: '.54rem', color: gradeCLR, fontWeight: 700 }}>STRATEGY GRADE</div>
                        <div style={{ fontSize: '.48rem', color: 'var(--faint)' }}>Score {String(btResult.score ?? 0)}/100</div>
                      </div>
                      <div style={{ flex: 1 }} />
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '.82rem', fontWeight: 800, color: col(ts.cagr ?? 0) }}>{(ts.cagr ?? 0).toFixed(1)}%</div>
                        <div style={{ fontSize: '.46rem', color: 'var(--faint)' }}>CAGR</div>
                      </div>
                    </div>

                    <div className="lab-metrics-grid">
                      {[
                        { l: 'Total Return', v: fP(ts.totalReturnPct ?? 0), c: col(ts.totalReturnPct ?? 0) },
                        { l: 'Sharpe Ratio', v: (ts.sharpeRatio ?? 0).toFixed(2), c: (ts.sharpeRatio ?? 0) >= 1.5 ? C.mint : C.orange },
                        { l: 'Max Drawdown', v: `${(ts.maxDrawdownPct ?? 0).toFixed(1)}%`, c: C.red },
                        { l: 'Win Rate', v: `${(ts.winRatePct ?? 0).toFixed(1)}%`, c: (ts.winRatePct ?? 0) >= 55 ? C.mint : C.orange },
                      ].map(({ l, v, c }) => <Stat key={l} label={l} value={v} color={c} />)}
                    </div>

                    {chartData.length > 1 && (
                      <div className="lab-backtest-chart">
                        <div className="lab-chart-title">EQUITY vs BENCHMARK</div>
                        <ResponsiveContainer width="100%" height={145}>
                          <AreaChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: -22 }}>
                            <defs>
                              <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.blue} stopOpacity={0.25}/><stop offset="95%" stopColor={C.blue} stopOpacity={0}/></linearGradient>
                              <linearGradient id="bmg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.muted} stopOpacity={0.08}/><stop offset="95%" stopColor={C.muted} stopOpacity={0}/></linearGradient>
                            </defs>
                            <XAxis dataKey="date" tick={{ fill: C.faint, fontSize: 8, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: C.faint, fontSize: 8, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                            <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 7, fontFamily: 'var(--font-mono)', fontSize: 9 }} formatter={(v: unknown, n: unknown) => [`$${Number(v).toLocaleString()}`, n === 'strategy' ? 'Strategy' : 'Benchmark']} />
                            <Area type="monotone" dataKey="benchmark" stroke={C.muted} strokeWidth={1} fill="url(#bmg)" dot={false} />
                            <Area type="monotone" dataKey="strategy"  stroke={C.blue} strokeWidth={2} fill="url(#sg)"  dot={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    <Link href="/dashboard/backtest" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.35rem', padding: '.42rem', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontFamily: 'var(--font-mono)', fontSize: '.58rem', cursor: 'pointer', textDecoration: 'none' }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
                      View Full Report
                    </Link>
                  </div>
                )}
              </div>
            )}

            {rightTab === 'data' && (
              <div>
                <div style={{ display: 'flex', gap: '.3rem', marginBottom: '.6rem' }}>
                  {(['blocks','apis'] as const).map(v => (
                    <button
                      key={v}
                      onClick={() => setDataView(v as 'blocks'|'apis')}
                      style={{ flex: 1, padding: '.28rem', borderRadius: 6, border: `1px solid ${dataView === v ? C.blue + '40' : C.border}`, background: dataView === v ? `${C.blue}10` : 'transparent', color: dataView === v ? C.blue2 : C.faint, fontFamily: 'var(--font-mono)', fontSize: '.54rem', fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase' }}
                    >
                      {v === 'blocks' ? 'Blocks' : 'APIs'}
                    </button>
                  ))}
                </div>

                {dataView === 'blocks' && (
                  <div>
                    <input
                      type="text"
                      placeholder="Search blocks..."
                      value={blockSearch}
                      onChange={e => setBlockSearch(e.target.value)}
                      className="lab-section-select"
                    />
                    <div style={{ display: 'flex', gap: '.25rem', flexWrap: 'wrap', marginBottom: '.55rem' }}>
                      {BLOCK_CATEGORIES.map(cat => {
                        const active = blockPalette === cat.id
                        const catColor = C[cat.accentVar.replace('--', '') as keyof typeof C] ?? C.blue
                        return (
                          <button
                            key={cat.id}
                            onClick={() => setBlockPalette(cat.id)}
                            style={{ padding: '.18rem .45rem', borderRadius: 20, border: `1px solid ${active ? catColor + '60' : C.border}`, background: active ? `${catColor}18` : 'transparent', color: active ? catColor : C.faint, fontFamily: 'var(--font-mono)', fontSize: '.5rem', fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase' }}
                          >
                            {cat.label}
                          </button>
                        )
                      })}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '.32rem' }}>
                      {visibleBlocks.map(block => {
                        if (!block) return null
                        return (
                          <div
                            key={block.id}
                            onClick={() => {
                              setState(prev => {
                                const map = new Map(prev.files.map(f => [f.path, f.content]))
                                const existing = map.get(block.filename) ?? ''
                                const separator = `\n// ── ${block.name} ` + '─'.repeat(Math.max(0, 48 - block.name.length)) + '\n'
                                map.set(block.filename, existing + separator + block.code.trimStart())
                                return { ...prev, files: Array.from(map.entries()).map(([path, content]) => ({ path, content, dirty: true })), activePath: block.filename }
                              })
                              showToast(`Inserted "${block.name}"`)
                            }}
                            style={{ padding: '.5rem .65rem', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer' }}
                          >
                            <div style={{ fontWeight: 600, color: C.white, marginBottom: '.1rem' }}>{block.name}</div>
                            <div style={{ fontSize: '.5rem', color: C.faint }}>{block.desc}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {dataView === 'apis' && (
                  <div>
                    <input
                      type="text"
                      placeholder="Search APIs..."
                      value={dataSearch}
                      onChange={e => setDataSearch(e.target.value)}
                      className="lab-section-select"
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '.32rem' }}>
                      {filteredAPIs.map(api => (
                        <div key={api.id} style={{ padding: '.5rem .65rem', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.15rem' }}>
                            <span style={{ fontWeight: 600, color: C.white }}>{api.name}</span>
                            <span style={{ fontSize: '.48rem', color: api.auth === 'none' ? C.mint : C.orange }}>{api.auth === 'none' ? 'free' : api.auth}</span>
                          </div>
                          <div style={{ fontSize: '.5rem', color: C.faint }}>{api.desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {rightTab === 'chat' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* AI MODE bar */}
                <div className="lab-ai-mode-bar">
                  <span style={{ fontSize: '.55rem', color: C.faint, letterSpacing: '.06em', textTransform: 'uppercase' }}>AI MODE</span>
                  <button
                    className="lab-ai-mode-toggle"
                    data-on={autoApply}
                    onClick={() => setAutoApply(v => !v)}
                  >
                    <span className="lab-ai-mode-dot" style={{ background: autoApply ? C.mint : C.faint, boxShadow: autoApply ? `0 0 5px ${C.mint}` : 'none' }} />
                    {autoApply ? 'AUTO-APPLY ON' : 'AUTO-APPLY OFF'}
                  </button>
                </div>

                {/* Pending edits banner */}
                {pendingEdits.length > 0 && (
                  <div className="lab-pending-banner">
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.blue, boxShadow: `0 0 6px ${C.blue}`, flexShrink: 0 }} />
                    <span style={{ fontSize: '.58rem', color: C.blue2, flex: 1 }}>
                      AI suggested changes to <strong>{pendingEdits.map(e => e.filename).join(', ')}</strong>
                    </span>
                    <button className="lab-pending-apply" onClick={applyAllEdits}>[OK] Apply All</button>
                    <button className="lab-pending-dismiss" onClick={() => setPendingEdits([])}>×</button>
                  </div>
                )}

                <div className="lab-chat-list" ref={chatScrollRef} style={{ flex: 1, overflowY: 'auto' }}>
                  {chat.length === 0 && (
                    <div style={{ color: C.faint, fontSize: '.72rem', lineHeight: 1.5, padding: '.3rem 0' }}>
                      Ask the AI to add blocks, create files, optimize backtest, or explain code.
                    </div>
                  )}
                  {chat.map(m => (
                    <div key={m.id} className="lab-chat-msg" data-role={m.role}>
                      <div className="lab-chat-role">{m.role === 'user' ? 'You' : m.role === 'system' ? 'Lab' : 'AI'}</div>
                      <div className={`lab-chat-bubble ${m.pending ? 'lab-chat-pending' : ''}`}>{m.content || (m.pending ? '' : '_no content_')}</div>
                    </div>
                  ))}
                </div>
                <div className="lab-chat-input-wrap">
                  <textarea
                    ref={chatInputRef}
                    className="lab-chat-input"
                    rows={2}
                    placeholder="Ask AI to add blocks, write code…"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendChat() } }}
                    disabled={chatStreaming}
                  />
                  <div className="lab-chat-foot">
                    <span>⌘+Enter</span>
                    <button className="lab-chat-send" onClick={sendChat} disabled={chatStreaming || !chatInput.trim()}>
                      {chatStreaming ? '...' : 'Send'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {toast && <div className="lab-toast">{toast}</div>}
    </div>
  )
}

export default function LabPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', color: 'var(--muted)' }}>Loading lab…</div>}>
      <LabInner />
    </Suspense>
  )
}