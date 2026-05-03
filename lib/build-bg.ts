/**
 * Background build runner — singleton tied to `window` so the AI stream
 * keeps going when the user navigates away from /dashboard/build.
 *
 * Components subscribe via `subscribe()` and read state via `getState()`.
 * Calls to `runBuild()` mutate state in place and notify all subscribers.
 *
 * State is also mirrored to localStorage so a hard refresh can pick up
 * the partial output (chat transcript, extracted files, blocks).
 */

export interface BuildChat { id: string; role: 'user' | 'assistant'; content: string; pending?: boolean }
export interface BuildFile { name: string; content: string; lang: string }
export type BuildPhase = 'idle' | 'building' | 'done' | 'error'

export interface BuildBgState {
  phase: BuildPhase
  prompt: string
  blocks: string[]            // block ids selected/AI-picked
  chat: BuildChat[]
  files: BuildFile[]
  draftId: string | null
  error: string | null
  startedAt: number | null
  finishedAt: number | null
}

const STORAGE_KEY = 'ase_build_bg_v1'

function defaultState(): BuildBgState {
  return {
    phase: 'idle', prompt: '', blocks: [], chat: [], files: [],
    draftId: null, error: null, startedAt: null, finishedAt: null,
  }
}

function loadFromStorage(): BuildBgState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as BuildBgState
    // If something was building when the tab closed, mark it as 'idle' on
    // hydration — we can't resume the fetch itself, only the UI state.
    if (parsed.phase === 'building') parsed.phase = 'idle'
    // Don't restore stale chat history from completed/errored builds —
    // the Build tab should always open with a clean prompt canvas.
    if (parsed.phase === 'done' || parsed.phase === 'error' || parsed.phase === 'idle') {
      try { localStorage.removeItem(STORAGE_KEY) } catch {}
      return null
    }
    return parsed
  } catch { return null }
}

function persist(state: BuildBgState) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch {}
}

type Listener = (s: BuildBgState) => void

interface Runner {
  state: BuildBgState
  listeners: Set<Listener>
  abort: AbortController | null
  notify(): void
  setState(p: Partial<BuildBgState>): void
}

function getRunner(): Runner {
  if (typeof window === 'undefined') {
    return {
      state: defaultState(), listeners: new Set(), abort: null,
      notify() {}, setState() {},
    }
  }
  const w = window as unknown as { __aseBuildRunner?: Runner }
  if (w.__aseBuildRunner) return w.__aseBuildRunner

  const r: Runner = {
    state: loadFromStorage() ?? defaultState(),
    listeners: new Set(),
    abort: null,
    notify() { for (const cb of this.listeners) cb(this.state) },
    setState(p) {
      this.state = { ...this.state, ...p }
      persist(this.state)
      this.notify()
    },
  }
  w.__aseBuildRunner = r
  return r
}

export function getState(): BuildBgState {
  return getRunner().state
}

export function subscribe(cb: Listener): () => void {
  const r = getRunner()
  r.listeners.add(cb)
  // Fire immediately so the new subscriber sees current state
  cb(r.state)
  return () => { r.listeners.delete(cb) }
}

export function clearState() {
  const r = getRunner()
  r.setState(defaultState())
}

// Parse markdown ```lang\n// FILE: name\ncontent``` blocks out of the
// streamed response so the UI can show extracted files even mid-stream.
export function extractFiles(text: string): BuildFile[] {
  const files: BuildFile[] = []
  const seen = new Set<string>()
  const re1 = /```(\w*)[^\n]*\n(?:\/\/|#)\s*FILE:\s*([^\n]+)\n([\s\S]*?)```/g
  let m: RegExpExecArray | null
  while ((m = re1.exec(text)) !== null) {
    const name = m[2].trim()
    if (!seen.has(name) && m[3].trim()) {
      seen.add(name)
      files.push({ lang: m[1] || 'text', name, content: m[3] })
    }
  }
  return files
}

export interface RunOptions {
  prompt: string
  blocks: string[]
  agentHints?: Array<{ id: string; label: string; agentHint?: string }>
}

export async function runBuild(opts: RunOptions): Promise<void> {
  const r = getRunner()

  // Cancel any in-flight build first.
  if (r.abort) { try { r.abort.abort() } catch {} }
  const ac = new AbortController()
  r.abort = ac

  const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2))
  const uMsg: BuildChat = { id: uid(), role: 'user', content: opts.prompt }
  const aMsg: BuildChat = { id: uid(), role: 'assistant', content: '', pending: true }

  r.setState({
    phase: 'building',
    prompt: opts.prompt,
    blocks: opts.blocks,
    chat: [uMsg, aMsg],
    files: [],
    error: null,
    startedAt: Date.now(),
    finishedAt: null,
  })

  const blockCtx = opts.blocks.length
    ? '\n\nBlocks selected:\n' + opts.blocks.map(id => {
        const h = opts.agentHints?.find(x => x.id === id)
        return `- ${h?.label ?? id}: ${h?.agentHint ?? ''}`
      }).join('\n')
    : ''

  try {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: opts.prompt + blockCtx }],
        apiIds: opts.blocks.join(','),
        buildMode: true, stream: true,
      }),
      signal: ac.signal,
    })
    if (!res.ok || !res.body) throw new Error('AI unavailable')

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = '', acc = ''
    let lastFlush = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const lines = (buffer + decoder.decode(value, { stream: true })).split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6).trim()
        if (!raw || raw === '[DONE]') continue
        try {
          const p = JSON.parse(raw)
          if (p.content) acc += p.content
        } catch {}
      }
      // Flush throttled to avoid storming localStorage on every token
      const now = Date.now()
      if (now - lastFlush > 80) {
        const updated = r.state.chat.map(m => m.id === aMsg.id ? { ...m, content: acc } : m)
        r.setState({ chat: updated, files: extractFiles(acc) })
        lastFlush = now
      }
    }

    const finalChat = r.state.chat.map(m => m.id === aMsg.id ? { ...m, content: acc, pending: false } : m)
    const files = extractFiles(acc)

    // If no FILE: directives, fall back to ordered code blocks. The build
    // prompt requires strategy.ts / config.json / backtest.config.json /
    // data_loaders.py / README.md in that order; if the AI emits raw code
    // blocks instead of FILE: directives we recover the first occurrence
    // of each so publish doesn't lose work.
    if (!files.length) {
      const ts = Array.from(acc.matchAll(/```(?:typescript|ts)\n([\s\S]*?)```/g)).map(m => m[1])
      if (ts.length) files.push({ lang: 'typescript', name: 'strategy.ts', content: ts[0] })
      const js = Array.from(acc.matchAll(/```(?:json)\n([\s\S]*?)```/g)).map(m => m[1])
      if (js.length) files.push({ lang: 'json', name: 'config.json', content: js[0] })
      // Second JSON block is conventionally backtest.config.json — needed
      // by the publish flow + cron tick to actually run the strategy.
      if (js.length > 1) files.push({ lang: 'json', name: 'backtest.config.json', content: js[1] })
      const py = Array.from(acc.matchAll(/```(?:python|py)\n([\s\S]*?)```/g)).map(m => m[1])
      if (py.length) files.push({ lang: 'python', name: 'data_loaders.py', content: py[0] })
      const md = Array.from(acc.matchAll(/```(?:markdown|md)\n([\s\S]*?)```/g)).map(m => m[1])
      if (md.length) files.push({ lang: 'markdown', name: 'README.md', content: md[0] })
    }

    const draftId = uid()
    const fs: Record<string, string> = {}
    files.forEach(f => { fs[f.name] = f.content })

    // Mirror to ase-files / draft store so /dashboard/build/code picks up
    try {
      localStorage.setItem('ase-files', JSON.stringify(fs))
      localStorage.setItem('ase_latest_draft_id', draftId)
      localStorage.setItem('ase_build_chat', JSON.stringify([
        { role: 'user', text: opts.prompt },
        { role: 'ai',   text: acc },
      ]))
      localStorage.setItem('ase_build_agent_name', opts.prompt.trim().slice(0, 32) || 'Untitled')

      const draftRow = {
        id: draftId,
        name: opts.prompt.trim().slice(0, 32) || 'Untitled Strategy',
        prompt: opts.prompt,
        files: fs,
        blocks: opts.blocks,
        createdAt: Date.now(),
      }
      const existing = JSON.parse(localStorage.getItem('ase_agent_drafts') ?? '[]')
      localStorage.setItem('ase_agent_drafts', JSON.stringify([draftRow, ...existing].slice(0, 20)))
    } catch {}

    r.setState({
      phase: 'done',
      chat: finalChat,
      files,
      draftId,
      finishedAt: Date.now(),
    })
  } catch (err: unknown) {
    if ((err as Error).name === 'AbortError') return
    const message = (err as Error).message ?? 'Build failed'
    r.setState({
      phase: 'error',
      error: message,
      finishedAt: Date.now(),
      chat: r.state.chat.map(m => m.pending ? { ...m, content: `Build failed: ${message}`, pending: false } : m),
    })
  } finally {
    if (r.abort === ac) r.abort = null
  }
}

export function abortBuild() {
  const r = getRunner()
  if (r.abort) { try { r.abort.abort() } catch {} }
  r.setState({ phase: 'idle' })
}
