'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { BLOCKS_BY_KIND, type Block, type BlockKind } from '@/lib/quant/blocks'

type AgentSpec = {
  name: string
  thesis: string
  template: string
  alpha_type: string
  alpha_weights?: Record<string, number>
  symbols: string[]
  rebalance_freq: 'daily' | 'weekly' | 'monthly'
  risk_aversion: number
  max_weight: number
  forecast_horizon: number
  signal_scale_bps: number
  walk_forward: boolean
  cadence: '5m' | '15m' | '1h' | '2h' | '4h' | 'daily' | 'weekly'
  start_date: string
  end_date: string
  initial_capital: number
}

const CADENCES: AgentSpec['cadence'][] = ['5m', '15m', '1h', '2h', '4h', 'daily', 'weekly']

type ChatTurn =
  | { id: string; role: 'user'; text: string; blocks?: string[] }
  | { id: string; role: 'agent'; text: string; spec?: AgentSpec; collapsed?: boolean }
  | { id: string; role: 'status'; text: string; stage: string }

type WorkspaceTab = 'spec' | 'pipeline' | 'backtest' | 'ledger' | 'code' | 'codebase'

const C = {
  bg: '#070A12',
  panel: '#0C111B',
  panel2: '#0A0F19',
  border: 'rgba(30,42,61,0.8)',
  borderSoft: 'rgba(30,42,61,0.4)',
  text: '#E6EBF5',
  muted: '#8A95AB',
  faint: '#5A6478',
  blue: '#4F8CFF',
  green: '#22C55E',
  red: '#EF4444',
  amber: '#F59E0B',
  purple: '#A78BFA',
}

const KIND_COLOR: Record<BlockKind, string> = {
  data: '#4F8CFF', indicator: '#22C55E', ml: '#A78BFA', api: '#F59E0B', risk: '#EF4444', execution: '#06B6D4', signal: '#EC4899',
}

const EXAMPLES = [
  'Buy BTC and ETH on momentum, weekly rebalance, conservative risk',
  'Mean-revert top 10 crypto when oversold (RSI < 30), daily rebal',
  'Risk-parity sleeve across BTC/ETH/SOL/BNB/ADA, vol-targeted',
]

export default function AgenticQuantLab() {
  const [prompt, setPrompt] = useState('')
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [compiling, setCompiling] = useState(false)
  const [running, setRunning] = useState(false)
  const [activeSpec, setActiveSpec] = useState<AgentSpec | null>(null)
  const [backtest, setBacktest] = useState<any>(null)
  const [pinnedBlocks, setPinnedBlocks] = useState<string[]>([])
  const [draggedBlock, setDraggedBlock] = useState<string | null>(null)
  const [tab, setTab] = useState<WorkspaceTab>('spec')
  const [agentId, setAgentId] = useState<string | null>(null)
  const [savingDraft, setSavingDraft] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [quickMode, setQuickMode] = useState(true)
  const [lastPrompt, setLastPrompt] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)

  // First-prompt state — before first prompt, chat is centered (Nick-style hero)
  const heroMode = turns.length === 0 && !activeSpec

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns])

  const addTurn = useCallback((t: ChatTurn) => setTurns(prev => [...prev, t]), [])
  const updateTurn = useCallback((id: string, patch: Partial<ChatTurn>) => {
    setTurns(prev => prev.map(t => t.id === id ? { ...t, ...patch } as ChatTurn : t))
  }, [])

  async function compile(text: string) {
    if (!text.trim() || compiling) return
    setCompiling(true)
    const userId = `u-${Date.now()}`
    addTurn({ id: userId, role: 'user', text, blocks: [...pinnedBlocks] })
    setPrompt('')

    try {
      const res = await fetch('/api/quant/agent/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
        body: JSON.stringify({ prompt: text, prior: activeSpec ?? undefined, blocks: pinnedBlocks, stream: true }),
      })
      if (!res.ok || !res.body) throw new Error(`compile failed: HTTP ${res.status}`)
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let agent: AgentSpec | null = null
      let rationale = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const events = buf.split('\n\n')
        buf = events.pop() || ''
        for (const ev of events) {
          const lines = ev.split('\n')
          const eventLine = lines.find(l => l.startsWith('event: '))?.slice(7) ?? 'message'
          const dataLine = lines.find(l => l.startsWith('data: '))?.slice(6) ?? '{}'
          let data: any = {}
          try { data = JSON.parse(dataLine) } catch {}
          if (eventLine === 'status') {
            addTurn({ id: `s-${Date.now()}-${Math.random()}`, role: 'status', text: data.message, stage: data.stage })
          } else if (eventLine === 'agent') {
            agent = data.agent
            rationale = data.rationale
          } else if (eventLine === 'error') {
            throw new Error(data.message)
          }
        }
      }
      if (agent) {
        setActiveSpec(agent)
        setLastPrompt(text)
        addTurn({ id: `a-${Date.now()}`, role: 'agent', text: rationale, spec: agent })
        setTab('spec')
        // Auto-save draft (fire-and-forget, ignore auth errors silently)
        saveDraft(agent, text).catch(() => {})
        // Auto-run backtest (Cursor-style: agent acts on its own)
        await runBacktest(agent, true)
      }
    } catch (e: any) {
      addTurn({ id: `err-${Date.now()}`, role: 'status', text: `⚠ ${e.message}`, stage: 'error' })
    } finally {
      setCompiling(false)
    }
  }

  async function saveDraft(spec: AgentSpec, prompt: string) {
    setSavingDraft(true)
    try {
      const res = await fetch('/api/quant/agent/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: spec.name, thesis: spec.thesis, prompt, spec, status: 'draft' }),
      })
      const json = await res.json()
      if (res.ok && json.agent?.id) {
        setAgentId(json.agent.id)
        addTurn({ id: `sv-${Date.now()}`, role: 'status', text: `Saved draft · agent_id=${json.agent.id.slice(0, 8)}`, stage: 'done' })
      }
    } catch {} finally { setSavingDraft(false) }
  }

  async function publishAgent() {
    if (!activeSpec || !agentId || publishing) return
    setPublishing(true)
    addTurn({ id: `pub-${Date.now()}`, role: 'status', text: `Publishing ${activeSpec.name} (paper-trade mode)…`, stage: 'planning' })
    try {
      const res = await fetch(`/api/quant/agent/publish?id=${agentId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ live: false }) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      addTurn({ id: `pub-d-${Date.now()}`, role: 'status', text: `✓ Published · ${json.note}`, stage: 'done' })
      // Trigger first tick immediately
      const tick = await fetch('/api/quant/agent/tick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_id: agentId }) })
      const tj = await tick.json()
      addTurn({ id: `tk-${Date.now()}`, role: 'status', text: `First tick: ${tj.ticked?.[0]?.trades ?? 0} trades posted to ledger`, stage: 'done' })
    } catch (e: any) {
      addTurn({ id: `pub-e-${Date.now()}`, role: 'status', text: `⚠ Publish failed: ${e.message}`, stage: 'error' })
    } finally { setPublishing(false) }
  }

  async function runBacktest(spec: AgentSpec, auto = false) {
    if (running) return
    setRunning(true)
    const t0 = Date.now()
    addTurn({ id: `bt-${Date.now()}`, role: 'status', text: auto ? `Auto-running ${quickMode ? 'QUICK ' : ''}backtest for ${spec.name}…` : `Running ${quickMode ? 'quick ' : ''}backtest…`, stage: 'backtest' })
    setTab('backtest')
    try {
      const res = await fetch('/api/quant/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: spec.template,
          alpha_type: spec.alpha_type,
          alpha_weights: spec.alpha_weights,
          symbols: spec.symbols,
          start_date: spec.start_date,
          end_date: spec.end_date,
          initial_capital: spec.initial_capital,
          rebalance_freq: spec.rebalance_freq,
          risk_aversion: spec.risk_aversion,
          max_weight: spec.max_weight,
          forecast_horizon: spec.forecast_horizon,
          signal_scale_bps: spec.signal_scale_bps,
          walk_forward: spec.walk_forward,
          quick: quickMode,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'backtest failed')
      setBacktest(json)
      const grade = json.grade || '—'
      const sharpe = json.tear_sheet?.sharpe?.toFixed(2) ?? '—'
      const cagr = json.tear_sheet?.cagr ? (json.tear_sheet.cagr * 100).toFixed(1) + '%' : '—'
      const ms = Date.now() - t0
      addTurn({ id: `bt-d-${Date.now()}`, role: 'status', text: `✓ Backtest ${json.mode === 'quick' ? 'QUICK ' : ''}complete in ${ms}ms · ${json.n_trades} trades · Grade ${grade} · Sharpe ${sharpe} · CAGR ${cagr}${json.data_source === 'synthetic' ? ' (synthetic data)' : ''}`, stage: 'done' })
      // Patch saved draft with metrics
      if (agentId) {
        fetch(`/api/quant/agent/save?id=${agentId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'tested',
            last_grade: grade,
            last_score: json.score,
            last_sharpe: json.tear_sheet?.sharpe ?? null,
            last_cagr: json.tear_sheet?.cagr ?? null,
            last_max_dd: json.tear_sheet?.maxDrawdown ?? null,
          }),
        }).catch(() => {})
      }
    } catch (e: any) {
      addTurn({ id: `bt-e-${Date.now()}`, role: 'status', text: `⚠ Backtest failed: ${e.message}`, stage: 'error' })
    } finally {
      setRunning(false)
    }
  }

  function togglePin(blockId: string) {
    setPinnedBlocks(prev => prev.includes(blockId) ? prev.filter(b => b !== blockId) : [...prev, blockId])
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const id = e.dataTransfer.getData('application/x-block-id') || draggedBlock
    if (id && !pinnedBlocks.includes(id)) {
      setPinnedBlocks(prev => [...prev, id])
    }
    setDraggedBlock(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bg, color: C.text, fontFamily: 'var(--font-sans)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.7rem 1.1rem', borderBottom: `1px solid ${C.border}`, background: C.panel2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.55rem', letterSpacing: '0.2em', color: C.faint, fontFamily: 'var(--font-mono)' }}>QUANT LAB</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: 1 }}>Agentic Builder</div>
          </div>
          {activeSpec && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.6rem', background: 'rgba(79,140,255,0.08)', border: `1px solid rgba(79,140,255,0.25)`, borderRadius: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.blue, animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: C.text }}>{activeSpec.name}</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.62rem', color: C.muted, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', cursor: 'pointer' }}>
            <input type="checkbox" checked={quickMode} onChange={e => setQuickMode(e.target.checked)} style={{ accentColor: C.blue }} />
            QUICK 5s
          </label>
          {activeSpec && agentId && (
            <button onClick={publishAgent} disabled={publishing} style={{ padding: '0.4rem 0.8rem', fontSize: '0.62rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', background: publishing ? C.border : C.green, color: 'white', border: 'none', borderRadius: 6, cursor: publishing ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
              {publishing ? 'PUBLISHING…' : 'PUBLISH ↗'}
            </button>
          )}
          <Link href="/dashboard/lab/agents" style={ghostBtn}>MY AGENTS</Link>
        </div>
      </div>

      {/* Main 3-pane */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* LEFT — Block palette */}
        <BlockPalette pinnedBlocks={pinnedBlocks} togglePin={togglePin} setDraggedBlock={setDraggedBlock} />

        {/* CENTER — Chat (collapses left when workspace shows) */}
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          style={{ flex: heroMode ? 1 : '0 0 42%', borderLeft: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', minWidth: 0, transition: 'flex-basis 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }}
        >
          {heroMode ? (
            <HeroChat prompt={prompt} setPrompt={setPrompt} compile={compile} compiling={compiling} pinnedBlocks={pinnedBlocks} togglePin={togglePin} examples={EXAMPLES} />
          ) : (
            <>
              <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {turns.map(t => <Turn key={t.id} turn={t} onCollapse={(id: string, c: boolean) => updateTurn(id, { collapsed: c } as any)} onRun={runBacktest} running={running} />)}
                {compiling && <Thinking />}
              </div>
              <Composer prompt={prompt} setPrompt={setPrompt} compile={compile} compiling={compiling} pinnedBlocks={pinnedBlocks} togglePin={togglePin} compact />
            </>
          )}
        </div>

        {/* RIGHT — Workspace */}
        {!heroMode && (
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <WorkspaceTabs tab={tab} setTab={setTab} hasSpec={!!activeSpec} hasBacktest={!!backtest} />
            <div style={{ flex: 1, overflow: 'auto', padding: '1rem 1.25rem' }}>
              {tab === 'spec' && activeSpec && <SpecView spec={activeSpec} onRun={() => runBacktest(activeSpec)} running={running} onCadenceChange={c => setActiveSpec({ ...activeSpec, cadence: c })} />}
              {tab === 'spec' && !activeSpec && <Empty msg="No agent yet — describe one in chat." />}
              {tab === 'pipeline' && <PipelineView spec={activeSpec} blocks={pinnedBlocks} />}
              {tab === 'backtest' && backtest && <BacktestView result={backtest} spec={activeSpec!} />}
              {tab === 'backtest' && !backtest && <Empty msg={running ? 'Running backtest…' : 'No backtest yet.'} />}
              {tab === 'ledger' && <LedgerView agentId={agentId} backtest={backtest} />}
              {tab === 'code' && activeSpec && <CodeView spec={activeSpec} agentId={agentId} />}
              {tab === 'code' && !activeSpec && <Empty msg="No spec to view." />}
              {tab === 'codebase' && <CodebaseView />}
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
        @keyframes thinking { 0%,80%,100% { transform: scale(0.6); opacity: 0.4 } 40% { transform: scale(1); opacity: 1 } }
      `}</style>
    </div>
  )
}

const ghostBtn: React.CSSProperties = {
  fontSize: '0.65rem', padding: '0.4rem 0.7rem', borderRadius: 6, border: `1px solid ${C.border}`, color: C.muted, textDecoration: 'none', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
}

// ─── HERO (first prompt, centered) ─────────────────────────────
function HeroChat({ prompt, setPrompt, compile, compiling, pinnedBlocks, togglePin, examples }: any) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', gap: '1.5rem' }}>
      <div style={{ textAlign: 'center', maxWidth: 620 }}>
        <div style={{ fontSize: '1.7rem', fontWeight: 700, marginBottom: '0.4rem' }}>Describe a trading agent.</div>
        <div style={{ fontSize: '0.9rem', color: C.muted }}>I&apos;ll compile it, wire the data, run a backtest, and tell you exactly what I did.</div>
      </div>
      <div style={{ width: '100%', maxWidth: 720 }}>
        <Composer prompt={prompt} setPrompt={setPrompt} compile={compile} compiling={compiling} pinnedBlocks={pinnedBlocks} togglePin={togglePin} />
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'center', maxWidth: 720 }}>
        {examples.map((ex: string, i: number) => (
          <button key={i} onClick={() => compile(ex)} disabled={compiling} style={{ fontSize: '0.7rem', padding: '0.5rem 0.8rem', borderRadius: 8, border: `1px solid ${C.border}`, background: C.panel, color: C.muted, cursor: 'pointer' }}>
            {ex}
          </button>
        ))}
      </div>
      <div style={{ fontSize: '0.68rem', color: C.faint, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
        TIP: drag blocks from the left panel into the prompt to constrain the agent
      </div>
    </div>
  )
}

// ─── BLOCK PALETTE ─────────────────────────────────────────────
function BlockPalette({ pinnedBlocks, togglePin, setDraggedBlock }: any) {
  const groups: BlockKind[] = ['data', 'indicator', 'ml', 'api', 'risk', 'execution', 'signal']
  return (
    <div style={{ width: 220, background: C.panel2, overflow: 'auto', padding: '0.7rem 0.5rem' }}>
      <div style={{ fontSize: '0.55rem', letterSpacing: '0.2em', color: C.faint, fontFamily: 'var(--font-mono)', padding: '0 0.4rem 0.5rem' }}>BLOCKS · DRAG OR CLICK</div>
      {groups.map(kind => (
        <div key={kind} style={{ marginBottom: '0.85rem' }}>
          <div style={{ fontSize: '0.55rem', fontFamily: 'var(--font-mono)', color: KIND_COLOR[kind], letterSpacing: '0.18em', padding: '0 0.4rem 0.3rem' }}>{kind.toUpperCase()}</div>
          {(BLOCKS_BY_KIND[kind] || []).map((b: Block) => {
            const pinned = pinnedBlocks.includes(b.id)
            return (
              <div
                key={b.id}
                draggable
                onDragStart={e => { e.dataTransfer.setData('application/x-block-id', b.id); setDraggedBlock(b.id) }}
                onDragEnd={() => setDraggedBlock(null)}
                onClick={() => togglePin(b.id)}
                title={b.description}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '0.4rem 0.5rem', marginBottom: 3, borderRadius: 5, cursor: 'grab',
                  background: pinned ? `${KIND_COLOR[kind]}1F` : 'transparent',
                  border: `1px solid ${pinned ? KIND_COLOR[kind] + '55' : 'transparent'}`,
                  fontSize: '0.7rem',
                  transition: 'all 0.12s',
                }}
                onMouseEnter={e => { if (!pinned) e.currentTarget.style.background = C.borderSoft }}
                onMouseLeave={e => { if (!pinned) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: KIND_COLOR[kind], flexShrink: 0 }} />
                <span style={{ flex: 1, color: pinned ? C.text : C.muted, fontWeight: pinned ? 600 : 400 }}>{b.label}</span>
                {pinned && <span style={{ fontSize: '0.55rem', color: KIND_COLOR[kind], fontFamily: 'var(--font-mono)' }}>✓</span>}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ─── COMPOSER ─────────────────────────────────────────────────
function Composer({ prompt, setPrompt, compile, compiling, pinnedBlocks, togglePin, compact }: any) {
  return (
    <div style={{ padding: compact ? '0.7rem 0.9rem 0.9rem' : '0', borderTop: compact ? `1px solid ${C.border}` : 'none', background: compact ? C.panel : 'transparent' }}>
      {pinnedBlocks.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {pinnedBlocks.map((id: string) => {
            const b = Object.values(BLOCKS_BY_KIND).flat().find(x => x.id === id)
            if (!b) return null
            return (
              <button key={id} onClick={() => togglePin(id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.62rem', padding: '2px 6px', borderRadius: 4, background: `${KIND_COLOR[b.kind]}22`, border: `1px solid ${KIND_COLOR[b.kind]}55`, color: C.text, fontFamily: 'var(--font-mono)', cursor: 'pointer' }}>
                {b.label} ×
              </button>
            )
          })}
        </div>
      )}
      <form onSubmit={e => { e.preventDefault(); compile(prompt) }} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); compile(prompt) } }}
          placeholder="Describe your agent… (e.g. 'BTC momentum, weekly rebal, conservative')"
          rows={compact ? 2 : 3}
          disabled={compiling}
          style={{ flex: 1, resize: 'none', padding: '0.7rem 0.85rem', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: '0.85rem', fontFamily: 'var(--font-sans)', outline: 'none' }}
        />
        <button type="submit" disabled={!prompt.trim() || compiling} style={{ padding: '0.7rem 1.1rem', borderRadius: 8, background: prompt.trim() && !compiling ? C.blue : C.border, color: 'white', border: 'none', fontWeight: 700, fontSize: '0.78rem', cursor: prompt.trim() && !compiling ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
          {compiling ? '…' : 'BUILD →'}
        </button>
      </form>
    </div>
  )
}

// ─── CHAT TURNS ────────────────────────────────────────────────
function Turn({ turn, onCollapse, onRun, running }: any) {
  if (turn.role === 'user') {
    return (
      <div style={{ alignSelf: 'flex-end', maxWidth: '85%', padding: '0.55rem 0.85rem', background: 'rgba(79,140,255,0.12)', border: `1px solid rgba(79,140,255,0.25)`, borderRadius: 10, fontSize: '0.84rem' }}>
        {turn.text}
        {turn.blocks?.length > 0 && (
          <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {turn.blocks.map((id: string) => {
              const b = Object.values(BLOCKS_BY_KIND).flat().find(x => x.id === id)
              return b && <span key={id} style={{ fontSize: '0.58rem', padding: '1px 5px', borderRadius: 3, background: KIND_COLOR[b.kind] + '33', color: C.text, fontFamily: 'var(--font-mono)' }}>{b.label}</span>
            })}
          </div>
        )}
      </div>
    )
  }
  if (turn.role === 'status') {
    const color = turn.stage === 'error' ? C.red : turn.stage === 'done' ? C.green : C.muted
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', color, fontFamily: 'var(--font-mono)', padding: '2px 4px' }}>
        <span style={{ width: 4, height: 4, borderRadius: '50%', background: color }} />
        {turn.text}
      </div>
    )
  }
  // agent turn
  const collapsed = turn.collapsed ?? true
  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '90%', padding: '0.7rem 0.9rem', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontSize: '0.55rem', color: C.faint, letterSpacing: '0.2em', fontFamily: 'var(--font-mono)' }}>AGENT · {turn.spec?.name?.toUpperCase()}</div>
        <button onClick={() => onCollapse(turn.id, !collapsed)} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: '0.65rem', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
          {collapsed ? '▸ expand' : '▾ collapse'}
        </button>
      </div>
      <div style={{ fontSize: '0.8rem', color: C.text, lineHeight: 1.5 }}>{turn.text}</div>
      {!collapsed && turn.spec && (
        <div style={{ marginTop: 8, padding: '0.5rem 0.7rem', background: C.bg, borderRadius: 6, fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: C.muted }}>
          <div>template: <span style={{ color: C.text }}>{turn.spec.template}</span></div>
          <div>alpha: <span style={{ color: C.text }}>{turn.spec.alpha_type}</span> · rebal: <span style={{ color: C.text }}>{turn.spec.rebalance_freq}</span> · risk λ: <span style={{ color: C.text }}>{turn.spec.risk_aversion}</span></div>
          <div>universe: <span style={{ color: C.text }}>{turn.spec.symbols.join(', ')}</span></div>
        </div>
      )}
    </div>
  )
}

function Thinking() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', color: C.muted, fontSize: '0.7rem' }}>
      <span style={{ display: 'inline-flex', gap: 3 }}>
        {[0, 1, 2].map(i => <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: C.blue, animation: `thinking 1.2s infinite ease-in-out`, animationDelay: `${i * 0.16}s` }} />)}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)' }}>thinking…</span>
    </div>
  )
}

// ─── WORKSPACE ────────────────────────────────────────────────
function WorkspaceTabs({ tab, setTab, hasSpec, hasBacktest }: { tab: WorkspaceTab; setTab: (t: WorkspaceTab) => void; hasSpec: boolean; hasBacktest: boolean }) {
  const tabs: Array<{ id: WorkspaceTab; label: string; badge?: string }> = [
    { id: 'spec', label: 'SPEC', badge: hasSpec ? '●' : undefined },
    { id: 'pipeline', label: 'PIPELINE' },
    { id: 'backtest', label: 'BACKTEST', badge: hasBacktest ? '●' : undefined },
    { id: 'ledger', label: 'LEDGER' },
    { id: 'code', label: 'CODE', badge: hasSpec ? '●' : undefined },
    { id: 'codebase', label: 'FILES' },
  ]
  return (
    <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, background: C.panel2, paddingLeft: '0.5rem' }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => setTab(t.id)} style={{
          padding: '0.65rem 1rem', background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === t.id ? C.blue : 'transparent'}`,
          color: tab === t.id ? C.text : C.muted, fontSize: '0.65rem', fontWeight: 600, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
        }}>
          {t.label} {t.badge && <span style={{ color: C.green, fontSize: '0.55rem' }}>{t.badge}</span>}
        </button>
      ))}
    </div>
  )
}

function Empty({ msg }: { msg: string }) {
  return <div style={{ padding: '3rem 1rem', textAlign: 'center', color: C.faint, fontSize: '0.85rem', fontStyle: 'italic' }}>{msg}</div>
}

function SpecView({ spec, onRun, running, onCadenceChange }: { spec: AgentSpec; onRun: () => void; running: boolean; onCadenceChange: (c: AgentSpec['cadence']) => void }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem', gap: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.55rem', color: C.faint, letterSpacing: '0.2em', fontFamily: 'var(--font-mono)' }}>AGENT</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: 2 }}>{spec.name}</div>
          <div style={{ fontSize: '0.85rem', color: C.muted, marginTop: 6, lineHeight: 1.5, maxWidth: 540 }}>{spec.thesis}</div>
        </div>
        <button onClick={onRun} disabled={running} style={{ padding: '0.6rem 1rem', borderRadius: 7, background: running ? C.border : C.green, color: 'white', border: 'none', fontWeight: 700, fontSize: '0.72rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', cursor: running ? 'not-allowed' : 'pointer' }}>
          {running ? 'RUNNING…' : 'RE-RUN ▶'}
        </button>
      </div>
      <div style={{ marginBottom: '0.85rem', padding: '0.7rem 0.9rem', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8 }}>
        <div style={{ fontSize: '0.55rem', color: C.faint, letterSpacing: '0.2em', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>LIVE TRADING CADENCE</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {CADENCES.map(c => (
            <button key={c} onClick={() => onCadenceChange(c)} style={{
              padding: '5px 10px', borderRadius: 5, fontSize: '0.7rem', fontFamily: 'var(--font-mono)', fontWeight: 600,
              background: spec.cadence === c ? C.blue : 'transparent', color: spec.cadence === c ? 'white' : C.muted,
              border: `1px solid ${spec.cadence === c ? C.blue : C.border}`, cursor: 'pointer',
            }}>{c}</button>
          ))}
        </div>
        <div style={{ marginTop: 5, fontSize: '0.65rem', color: C.faint, fontFamily: 'var(--font-mono)' }}>
          When published, the agent runs every <span style={{ color: C.text }}>{spec.cadence}</span> and writes trades to the public ledger.
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.6rem 1.2rem', padding: '0.85rem 1rem', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8 }}>
        <KV k="Template" v={spec.template} />
        <KV k="Alpha Type" v={spec.alpha_type} />
        <KV k="Rebalance" v={spec.rebalance_freq} />
        <KV k="Risk λ" v={String(spec.risk_aversion)} />
        <KV k="Max Weight" v={`${(spec.max_weight * 100).toFixed(0)}%`} />
        <KV k="Forecast" v={`${spec.forecast_horizon}d`} />
        <KV k="Signal" v={`${spec.signal_scale_bps}bps`} />
        <KV k="Walk-fwd" v={spec.walk_forward ? 'yes' : 'no'} />
        <KV k="Capital" v={`$${spec.initial_capital.toLocaleString()}`} />
        <KV k="Window" v={`${spec.start_date} → ${spec.end_date}`} wide />
      </div>
      <div style={{ marginTop: '1rem' }}>
        <div style={{ fontSize: '0.55rem', color: C.faint, letterSpacing: '0.2em', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>UNIVERSE</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {spec.symbols.map(s => <span key={s} style={{ padding: '4px 9px', borderRadius: 5, background: C.panel, border: `1px solid ${C.border}`, fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>{s}</span>)}
        </div>
      </div>
      {spec.alpha_weights && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ fontSize: '0.55rem', color: C.faint, letterSpacing: '0.2em', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>ALPHA BLEND</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {Object.entries(spec.alpha_weights).map(([k, v]) => v && (
              <div key={k} style={{ flex: '1 1 100px', minWidth: 100 }}>
                <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: C.muted, marginBottom: 2 }}>{k} <span style={{ color: C.text }}>{(v * 100).toFixed(0)}%</span></div>
                <div style={{ height: 4, background: C.bg, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${v * 100}%`, height: '100%', background: C.blue }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function KV({ k, v, wide }: { k: string; v: string; wide?: boolean }) {
  return (
    <div style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <div style={{ fontSize: '0.55rem', color: C.faint, letterSpacing: '0.15em', fontFamily: 'var(--font-mono)' }}>{k}</div>
      <div style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)', marginTop: 1 }}>{v}</div>
    </div>
  )
}

function PipelineView({ spec, blocks }: { spec: AgentSpec | null; blocks: string[] }) {
  const stages = [
    { name: 'Data', desc: spec ? spec.symbols.join(', ') : 'select symbols' },
    { name: 'Features', desc: 'returns, volatility, volume z-score, momentum scores' },
    { name: 'Alpha', desc: spec ? `${spec.alpha_type} (horizon ${spec.forecast_horizon}d)` : '—' },
    { name: 'Risk Model', desc: 'covariance, factor exposures' },
    { name: 'Optimizer', desc: spec ? `λ=${spec.risk_aversion}, max_w=${(spec.max_weight*100).toFixed(0)}%` : '—' },
    { name: 'Risk Manager', desc: 'kill switch, position limits' },
    { name: 'Execution', desc: 'slippage, commission, market impact' },
    { name: 'Metrics', desc: 'Sharpe, Sortino, MaxDD, IC, walk-forward' },
  ]
  return (
    <div>
      <div style={{ fontSize: '0.85rem', color: C.muted, marginBottom: '1rem' }}>9-layer pipeline. The agent flows through each stage.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {stages.map((s, i) => (
          <div key={s.name} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '0.6rem 0.85rem', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 7 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: C.bg, color: C.blue, fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i+1}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600 }}>{s.name}</div>
              <div style={{ fontSize: '0.7rem', color: C.muted, fontFamily: 'var(--font-mono)' }}>{s.desc}</div>
            </div>
            <div style={{ color: spec ? C.green : C.faint, fontSize: '0.7rem' }}>{spec ? '✓' : '○'}</div>
          </div>
        ))}
      </div>
      {blocks.length > 0 && (
        <div style={{ marginTop: '1rem', padding: '0.7rem 0.85rem', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 7 }}>
          <div style={{ fontSize: '0.55rem', color: C.faint, fontFamily: 'var(--font-mono)', letterSpacing: '0.2em', marginBottom: 5 }}>PINNED BLOCKS · INFLUENCING SPEC</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {blocks.map(id => {
              const b = Object.values(BLOCKS_BY_KIND).flat().find(x => x.id === id)
              return b && <span key={id} style={{ fontSize: '0.62rem', padding: '2px 7px', borderRadius: 4, background: KIND_COLOR[b.kind] + '22', border: `1px solid ${KIND_COLOR[b.kind]}55`, color: C.text, fontFamily: 'var(--font-mono)' }}>{b.label}</span>
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function BacktestView({ result, spec }: { result: any; spec: AgentSpec }) {
  const ts = result.tear_sheet || {}
  const grade = result.grade || '—'
  const score = result.score ?? 0
  const cagr = ts.cagr ? (ts.cagr * 100).toFixed(2) : '—'
  const sharpe = ts.sharpe?.toFixed(2) ?? '—'
  const maxDD = ts.maxDrawdown ? (ts.maxDrawdown * 100).toFixed(2) : '—'
  const sortino = ts.sortino?.toFixed(2) ?? '—'
  const winRate = ts.winRate ? (ts.winRate * 100).toFixed(1) : '—'
  const benchCagr = result.benchmark_cagr?.toFixed(2) ?? '—'
  const equity = result.equity_curve || []
  const sparkline = equity.length > 1 ? buildSparkline(equity.map((e: any) => e.equity)) : null
  const gradeColor = grade.startsWith('A') ? C.green : grade.startsWith('B') ? C.blue : grade.startsWith('C') ? C.amber : C.red

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.9rem' }}>
        <div>
          <div style={{ fontSize: '0.55rem', color: C.faint, letterSpacing: '0.2em', fontFamily: 'var(--font-mono)' }}>BACKTEST RESULTS</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: 2 }}>{spec.name}</div>
          <div style={{ fontSize: '0.7rem', color: C.muted, marginTop: 2, fontFamily: 'var(--font-mono)' }}>{result.n_rebalances} rebalances · {result.n_trades} trades · {result.runtime_ms}ms</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.55rem', color: C.faint, fontFamily: 'var(--font-mono)', letterSpacing: '0.15em' }}>GRADE</div>
            <div style={{ fontSize: '1.7rem', fontWeight: 800, color: gradeColor, fontFamily: 'var(--font-mono)' }}>{grade}</div>
          </div>
          <div style={{ textAlign: 'right', borderLeft: `1px solid ${C.border}`, paddingLeft: 14 }}>
            <div style={{ fontSize: '0.55rem', color: C.faint, fontFamily: 'var(--font-mono)', letterSpacing: '0.15em' }}>SCORE</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{score}/100</div>
          </div>
        </div>
      </div>
      {sparkline && (
        <div style={{ marginBottom: '0.9rem', padding: '0.7rem', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 7 }}>
          <div style={{ fontSize: '0.55rem', color: C.faint, fontFamily: 'var(--font-mono)', letterSpacing: '0.15em', marginBottom: 5 }}>EQUITY CURVE</div>
          <svg viewBox="0 0 400 80" preserveAspectRatio="none" style={{ width: '100%', height: 80, display: 'block' }}>
            <path d={sparkline} fill="none" stroke={C.blue} strokeWidth="1.5" />
          </svg>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginBottom: '0.9rem' }}>
        <Stat k="CAGR" v={`${cagr}%`} good={parseFloat(cagr) > parseFloat(benchCagr)} />
        <Stat k="Sharpe" v={sharpe} good={parseFloat(sharpe) > 1} />
        <Stat k="Sortino" v={sortino} good={parseFloat(sortino) > 1.5} />
        <Stat k="Max DD" v={`${maxDD}%`} good={parseFloat(maxDD) > -20} />
        <Stat k="Win Rate" v={`${winRate}%`} good={parseFloat(winRate) > 50} />
        <Stat k="Bench" v={`${benchCagr}%`} />
      </div>
      {result.monte_carlo && (
        <div style={{ padding: '0.7rem 0.85rem', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 7, fontSize: '0.72rem', color: C.muted, marginBottom: '0.9rem' }}>
          <div style={{ fontSize: '0.55rem', color: C.faint, fontFamily: 'var(--font-mono)', letterSpacing: '0.15em', marginBottom: 4 }}>MONTE CARLO ({result.monte_carlo.nTrials} trials, {result.monte_carlo.windowDays}d windows)</div>
          <div style={{ fontFamily: 'var(--font-mono)' }}>
            median ret <span style={{ color: C.text }}>{result.monte_carlo.medianReturn?.toFixed(2)}%</span> ·
            p10 <span style={{ color: C.text }}>{result.monte_carlo.p10Return?.toFixed(2)}%</span> ·
            p90 <span style={{ color: C.text }}>{result.monte_carlo.p90Return?.toFixed(2)}%</span> ·
            beat-rate <span style={{ color: C.text }}>{(result.monte_carlo.beatBuyHoldRate * 100).toFixed(0)}%</span>
          </div>
        </div>
      )}

      {/* Trade ledger from backtest */}
      {result.trade_ledger && result.trade_ledger.length > 0 && (
        <div style={{ marginTop: '0.7rem' }}>
          <div style={{ fontSize: '0.55rem', color: C.faint, fontFamily: 'var(--font-mono)', letterSpacing: '0.15em', marginBottom: 5 }}>BACKTEST TRADES ({result.trade_ledger.length})</div>
          <div style={{ maxHeight: 280, overflow: 'auto', border: `1px solid ${C.border}`, borderRadius: 6 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem', fontFamily: 'var(--font-mono)' }}>
              <thead style={{ position: 'sticky', top: 0, background: C.panel }}>
                <tr style={{ color: C.faint, textAlign: 'left' }}>
                  <th style={tdh}>Date</th><th style={tdh}>Symbol</th><th style={tdh}>Side</th>
                  <th style={tdhR}>Shares</th><th style={tdhR}>Price</th><th style={tdhR}>Notional</th><th style={tdhR}>Fee bps</th>
                </tr>
              </thead>
              <tbody>
                {result.trade_ledger.slice(0, 200).map((t: any, i: number) => (
                  <tr key={i} style={{ color: C.text, borderTop: `1px solid ${C.borderSoft}` }}>
                    <td style={td}>{t.date}</td>
                    <td style={td}>{t.symbol}</td>
                    <td style={{ ...td, color: t.side === 'BUY' ? C.green : C.red }}>{t.side}</td>
                    <td style={tdR}>{t.shares?.toFixed(4)}</td>
                    <td style={tdR}>${t.price?.toFixed(2)}</td>
                    <td style={tdR}>${t.notional?.toFixed(0)}</td>
                    <td style={tdR}>{t.slippage_bps?.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

const td: React.CSSProperties = { padding: '4px 8px' }
const tdR: React.CSSProperties = { padding: '4px 8px', textAlign: 'right' }
const tdh: React.CSSProperties = { padding: '6px 8px', fontWeight: 700, letterSpacing: '0.1em', fontSize: '0.55rem' }
const tdhR: React.CSSProperties = { padding: '6px 8px', fontWeight: 700, letterSpacing: '0.1em', fontSize: '0.55rem', textAlign: 'right' }

function LedgerView({ agentId, backtest }: { agentId: string | null; backtest: any }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  async function load() {
    if (!agentId) return
    setLoading(true)
    try {
      const r = await fetch(`/api/quant/agent/ledger?agent_id=${agentId}`)
      const j = await r.json()
      setRows(j.trades ?? [])
    } finally { setLoading(false) }
  }

  useEffect(() => { load() /* eslint-disable-next-line */ }, [agentId])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.7rem' }}>
        <div>
          <div style={{ fontSize: '0.55rem', color: C.faint, letterSpacing: '0.2em', fontFamily: 'var(--font-mono)' }}>PUBLIC TRADE LEDGER</div>
          <div style={{ fontSize: '0.85rem', color: C.muted, marginTop: 2 }}>Live trades from this agent (paper or real). Users can copy.</div>
        </div>
        <button onClick={load} disabled={loading || !agentId} style={{ padding: '0.4rem 0.8rem', fontSize: '0.62rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', background: C.blue, color: 'white', border: 'none', borderRadius: 6, cursor: loading || !agentId ? 'not-allowed' : 'pointer' }}>
          {loading ? '…' : 'REFRESH'}
        </button>
      </div>

      {!agentId && <Empty msg="Save the agent first (auto-saves after compile)." />}
      {agentId && !loading && rows.length === 0 && <Empty msg="No live trades yet. Publish the agent to start posting on its cadence." />}

      {rows.length > 0 && (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
            <thead style={{ background: C.panel }}>
              <tr style={{ color: C.faint, textAlign: 'left' }}>
                <th style={tdh}>Time</th><th style={tdh}>Mode</th><th style={tdh}>Symbol</th><th style={tdh}>Side</th>
                <th style={tdhR}>Qty</th><th style={tdhR}>Price</th><th style={tdhR}>Notional</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id ?? i} style={{ color: C.text, borderTop: `1px solid ${C.borderSoft}` }}>
                  <td style={td}>{new Date(r.executed_at).toLocaleString()}</td>
                  <td style={{ ...td, color: r.mode === 'live' ? C.amber : C.muted }}>{r.mode}</td>
                  <td style={td}>{r.symbol}</td>
                  <td style={{ ...td, color: r.side === 'BUY' ? C.green : C.red }}>{r.side}</td>
                  <td style={tdR}>{Number(r.qty).toFixed(4)}</td>
                  <td style={tdR}>${Number(r.price).toFixed(2)}</td>
                  <td style={tdR}>${Number(r.notional).toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {backtest?.trade_ledger?.length > 0 && (
        <div style={{ marginTop: '0.7rem', fontSize: '0.7rem', color: C.faint, fontFamily: 'var(--font-mono)' }}>
          Backtest produced {backtest.trade_ledger.length} simulated trades — see Backtest tab.
        </div>
      )}
    </div>
  )
}

function CodeView({ spec, agentId }: { spec: AgentSpec; agentId: string | null }) {
  const json = JSON.stringify(spec, null, 2)
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.7rem' }}>
        <div>
          <div style={{ fontSize: '0.55rem', color: C.faint, letterSpacing: '0.2em', fontFamily: 'var(--font-mono)' }}>AGENT SPEC · JSON</div>
          <div style={{ fontSize: '0.78rem', color: C.muted, marginTop: 2 }}>What the AI generated. Edit and re-run if needed.</div>
        </div>
        {agentId && <a href={`/dashboard/lab/studio?agent=${agentId}`} style={{ padding: '0.4rem 0.8rem', fontSize: '0.62rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', background: C.purple, color: 'white', borderRadius: 6, textDecoration: 'none' }}>OPEN IN STUDIO →</a>}
      </div>
      <pre style={{ padding: '1rem', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 7, fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: C.text, whiteSpace: 'pre-wrap', overflow: 'auto', maxHeight: '60vh' }}>
        {json}
      </pre>
    </div>
  )
}

function Stat({ k, v, good }: { k: string; v: string; good?: boolean }) {
  return (
    <div style={{ padding: '0.55rem 0.7rem', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6 }}>
      <div style={{ color: C.faint, fontSize: '0.55rem', letterSpacing: '0.15em', fontFamily: 'var(--font-mono)' }}>{k}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.95rem', color: good === true ? C.green : good === false ? C.red : C.text, marginTop: 2 }}>{v}</div>
    </div>
  )
}

function CodebaseView() {
  const files = [
    { path: 'app/dashboard/build/page.tsx', desc: 'This page (agentic Quant Lab)' },
    { path: 'app/api/quant/agent/compile/route.ts', desc: 'NL → AgentSpec compiler (streaming SSE, blocks-aware)' },
    { path: 'app/api/quant/run/route.ts', desc: '9-layer backtest pipeline' },
    { path: 'lib/quant/blocks.ts', desc: 'Drag-drop block catalog (data, indicators, ML, APIs)' },
    { path: 'lib/quant/strategy.ts', desc: 'Strategy templates & builder' },
    { path: 'lib/quant/backtester.ts', desc: 'Core backtester (buy-hold + walk-forward)' },
    { path: 'lib/quant/metrics.ts', desc: 'Tear-sheet metrics & grading' },
    { path: 'lib/quant-docs.ts', desc: 'Data sources, indicators, risk metrics docs' },
    { path: 'supabase/migrations/20260428_ai_agents.sql', desc: 'ai_agents table (RLS, owner-scoped)' },
  ]
  return (
    <div>
      <div style={{ fontSize: '0.85rem', color: C.muted, marginBottom: '0.9rem' }}>The agent has read access to these files. Source-of-truth for compile + run.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {files.map(f => (
          <div key={f.path} style={{ padding: '0.55rem 0.75rem', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6 }}>
            <div style={{ fontSize: '0.74rem', fontFamily: 'var(--font-mono)', color: C.blue }}>{f.path}</div>
            <div style={{ fontSize: '0.7rem', color: C.muted, marginTop: 2 }}>{f.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function buildSparkline(values: number[]): string {
  if (values.length < 2) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const w = 400, h = 80
  return values.map((v, i) => {
    const x = (i / (values.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}
