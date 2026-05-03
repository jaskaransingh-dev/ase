'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BLOCKS, getBlockById } from '@/lib/quant/blocks'
import type { BlockKind } from '@/lib/quant/blocks'
import { blockMeta, statusColor, statusLabel } from '@/lib/quant/block-registry'
import { runBuild as runBuildBg, subscribe as subscribeBg, getState as getBgState, abortBuild as abortBuildBg, clearState as clearBgState } from '@/lib/build-bg'
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

// Sink connectors removed — the floating "Backtest" and "Kraken" pills
// were ghosting the canvas before the user had described any strategy,
// and they aren't actionable. The pipeline now only renders blocks the
// user (or AI) has actually pinned, so an empty canvas stays empty.

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

// ── Cursor/Claude-style chat renderer ─────────────────────────────────────────
// Three behaviors that make the panel feel "alive" instead of dumping markdown:
//   1. <thinking>…</thinking> blocks render as a collapsible "▾ Thoughts"
//      pill (closed by default, opens with one click). The AI puts its
//      raw reasoning here so prose stays clean.
//   2. Code blocks render as collapsible "FILE · strategy.ts" cards with
//      a header showing the filename + a copy button. Closed when very
//      long so the chat doesn't scroll for screens.
//   3. # / ## / ### headings — silently stripped (we ban them in the
//      prompt but render robustly if a model slips through).
function ThinkingBlock({ content, streaming }: { content: string; streaming?: boolean }) {
  const [open, setOpen] = useState(false)
  const lines = content.trim().split('\n').filter(Boolean)
  const hint = lines[0]?.slice(0, 64) ?? 'thinking'
  return (
    <div style={{ margin: '.2rem 0', borderRadius: 7, border: `1px solid ${C.border}`, background: 'rgba(10,21,37,.55)' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: '.4rem',
          width: '100%', padding: '.32rem .55rem',
          background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
          color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '.5rem', letterSpacing: '.06em',
        }}>
        <span style={{ display: 'inline-flex', gap: 2 }}>
          {streaming
            ? [0,1,2].map(i => <span key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: '#8b5cf6', display: 'inline-block', animation: `blink .8s ease-in-out infinite ${i * .18}s` }} />)
            : <span style={{ color: '#8b5cf6' }}>◇</span>}
        </span>
        <span style={{ color: '#a78bfa', fontWeight: 700 }}>{streaming ? 'Thinking…' : 'Thoughts'}</span>
        {!open && !streaming && <span style={{ color: C.faint, opacity: .8, fontWeight: 400, fontSize: '.46rem', marginLeft: '.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{hint}</span>}
        <span style={{ marginLeft: 'auto', color: C.faint }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ padding: '.05rem .65rem .45rem', borderTop: `1px solid ${C.border}` }}>
          {lines.map((ln, i) => (
            <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.text, lineHeight: 1.55, padding: '.08rem 0' }}>{ln}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function FileBlock({ name, lang, content }: { name: string; lang: string; content: string }) {
  const lines = content.trimEnd().split('\n')
  const long = lines.length > 16
  const [open, setOpen] = useState(!long)
  const isFile = !!name
  const accent = name?.endsWith('.ts') || name?.endsWith('.tsx') ? '#3b82f6'
              : name?.endsWith('.json') ? '#f59e0b'
              : name?.endsWith('.py') ? '#16c784'
              : name?.endsWith('.md') ? '#94a3b8'
              : '#60a5fa'
  return (
    <div style={{ margin: '.35rem 0', borderRadius: 7, overflow: 'hidden', border: `1px solid ${accent}30` }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '.18rem .55rem', background: `${accent}10`, fontFamily: 'var(--font-mono)', fontSize: '.5rem', letterSpacing: '.06em' }}>
        <span style={{ color: accent, fontWeight: 700 }}>
          {isFile ? `FILE · ${name}` : (lang || 'CODE').toUpperCase()}
        </span>
        <span style={{ marginLeft: '.4rem', color: C.faint }}>{lines.length} lines</span>
        <button
          onClick={() => navigator.clipboard?.writeText(content)}
          style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: C.faint, cursor: 'pointer', fontSize: '.5rem', fontFamily: 'var(--font-mono)' }}>
          copy
        </button>
        <button
          onClick={() => setOpen(v => !v)}
          style={{ background: 'transparent', border: 'none', color: C.faint, cursor: 'pointer', fontSize: '.55rem', marginLeft: '.4rem' }}>
          {open ? '▾' : '▸'}
        </button>
      </div>
      {open && (
        <pre style={{ margin: 0, padding: '.45rem .65rem', background: 'rgba(0,0,0,.55)', fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.blue2, lineHeight: 1.5, overflowX: 'auto', maxHeight: 280, overflowY: 'auto' }}>
          {content.trimEnd()}
        </pre>
      )}
    </div>
  )
}

function CleanMsg({ text }: { text: string }) {
  // Robust thinking parser. The worker model is unreliable about XML tags
  // — it strips characters (<hink>, <hinking>) and occasionally emits the
  // open tag again as the close (<think>...<think>). The parser:
  //   1. Looks for ANY angle-bracket tag whose name matches th?ink-ish.
  //   2. Treats the FIRST as the open, the NEXT as the close (regardless
  //      of slash). If no close, runs until the first triple-backtick or
  //      the end of text.
  //   3. Strips any stray angle-bracket think-ish tags from the prose
  //      that follows so the user never sees raw "<think>" in the chat.
  const segments: Array<{ type: 'think'; text: string } | { type: 'prose'; text: string }> = []
  const tagRe = /<\/?(?:thinking|think|hinking|hink)\s*>/gi
  const matches: { index: number; len: number }[] = []
  let mt: RegExpExecArray | null
  while ((mt = tagRe.exec(text)) !== null) {
    matches.push({ index: mt.index, len: mt[0].length })
  }

  let cursor = 0
  let lastOpen = -1
  let lastClose = -1
  for (let i = 0; i + 1 < matches.length; i += 2) {
    const open = matches[i]
    const close = matches[i + 1]
    if (open.index > cursor) segments.push({ type: 'prose', text: text.slice(cursor, open.index) })
    segments.push({ type: 'think', text: text.slice(open.index + open.len, close.index) })
    cursor = close.index + close.len
    lastOpen = open.index; lastClose = close.index
  }
  // Odd unmatched tag — fence everything up to the next triple-backtick or
  // the next blank double-newline.
  if (matches.length % 2 === 1) {
    const open = matches[matches.length - 1]
    if (open.index > cursor) segments.push({ type: 'prose', text: text.slice(cursor, open.index) })
    const after = text.slice(open.index + open.len)
    const stop1 = after.indexOf('```')
    const stop2 = after.indexOf('\n\n\n')
    let stop = -1
    if (stop1 >= 0 && stop2 >= 0) stop = Math.min(stop1, stop2)
    else if (stop1 >= 0) stop = stop1
    else if (stop2 >= 0) stop = stop2
    if (stop > 0) {
      segments.push({ type: 'think', text: after.slice(0, stop) })
      cursor = open.index + open.len + stop
      lastOpen = open.index; lastClose = open.index + open.len + stop
    } else {
      // Still streaming — show as live "Thinking…"
      segments.push({ type: 'think', text: after })
      cursor = text.length
      lastOpen = open.index; lastClose = -1
    }
  }
  if (cursor < text.length) segments.push({ type: 'prose', text: text.slice(cursor) })

  // Strip any stray, leftover think-ish tags that snuck into prose
  // segments (e.g. an extra opening tag the model emitted in the middle).
  for (const seg of segments) {
    if (seg.type === 'prose') seg.text = seg.text.replace(tagRe, '')
  }

  return (
    <div style={{ lineHeight: 1.65, display: 'flex', flexDirection: 'column', gap: '.04rem' }}>
      {segments.map((seg, i) => {
        if (seg.type === 'think') {
          const streaming = i === segments.length - 1 && lastOpen > lastClose
          return <ThinkingBlock key={i} content={seg.text} streaming={streaming} />
        }
        return <ProseBlock key={i} text={seg.text} />
      })}
    </div>
  )
}

// Renders one chunk of prose: paragraphs + bullets + collapsible code/file
// blocks. Headings (# / ##) are stripped silently — the prompt forbids them
// but we render robustly anyway.
function ProseBlock({ text }: { text: string }) {
  const lines = text.split('\n')
  const out: React.ReactNode[] = []
  let inCode = false, codeLines: string[] = [], codeLang = '', key = 0

  for (const raw of lines) {
    if (raw.startsWith('```')) {
      if (inCode) {
        const fileMatch = codeLines[0]?.match(/^(?:\/\/|#)\s*FILE:\s*(.+)$/)
        const delMatch  = codeLines[0]?.match(/^(?:\/\/|#)\s*DELETE:\s*(.+)$/)
        const name = fileMatch ? fileMatch[1].trim() : delMatch ? `(deleted) ${delMatch[1].trim()}` : ''
        const body = (fileMatch || delMatch) ? codeLines.slice(1).join('\n') : codeLines.join('\n')
        out.push(<FileBlock key={key++} name={name} lang={codeLang} content={body} />)
        inCode = false; codeLines = []; codeLang = ''
      } else { codeLang = raw.slice(3).trim(); inCode = true }
      continue
    }
    if (inCode) { codeLines.push(raw); continue }

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
        <div key={key++} style={{ color: C.text, fontSize: '.6rem' }}>{inlineFormat(clean)}</div>
      )
    }
  }
  return <>{out}</>
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

// ── Suggestion chips with refresh — pulls from a pool the AI can refresh
// to keep things alive feeling. Each "refresh" rotates to a new triplet.
const SUGGESTION_POOL = [
  'BTC/ETH momentum + EMA cross with 8% trailing stop',
  'Mean-reversion on SOL RSI under 30, exit at 55',
  'Fear & Greed composite — buy at extreme fear, sell at greed',
  'Funding-rate arb on perps when funding flips negative',
  'On-chain whale wallet tracker for ETH accumulation',
  'BTC dominance regime filter + altcoin rotation',
  'Breakout strategy on Donchian 20-day with ATR sizing',
  'Volatility-targeted BTC with 15% annualized vol cap',
  'MACD + Bollinger Band crossover on ETH 4h',
  'Z-score mean reversion on BTC/ETH ratio',
  'Multi-timeframe trend: weekly macro + daily entry',
  'News + sentiment composite on top-10 coins',
  'Kelly-sized momentum portfolio rebalanced weekly',
  'Risk-parity allocator across BTC/ETH/SOL/AVAX',
  'Supertrend signal with 2x ATR stops on SOL',
  'Ichimoku cloud breakout on weekly BTC',
  'Pairs trade BTC vs ETH using cointegration',
  'CPI-print volatility buyer with 2-day exit',
  'DXY-inverse rotation: long BTC when dollar weakens',
  'Open-interest spike fader with mean-reversion confirm',
]

function SuggestionChips({ onPick }: { onPick: (s: string) => void }) {
  const [seed, setSeed] = useState(() => Math.floor(Date.now() / 60000))
  const triplet = useMemo(() => {
    const out: string[] = []
    const taken = new Set<number>()
    let s = seed
    while (out.length < 3) {
      s = (s * 9301 + 49297) % 233280
      const idx = s % SUGGESTION_POOL.length
      if (taken.has(idx)) continue
      taken.add(idx); out.push(SUGGESTION_POOL[idx])
    }
    return out
  }, [seed])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem', marginTop: '.5rem', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '.42rem', color: '#475569', fontFamily: 'var(--font-mono)', letterSpacing: '.08em', marginRight: '.15rem' }}>TRY</span>
      {triplet.map(s => (
        <button key={s} onClick={() => onPick(s)}
          style={{ padding: '.22rem .5rem', borderRadius: 4, background: 'rgba(10,21,37,.5)', border: `1px solid #1a2535`, color: '#94a3b8', fontSize: '.48rem', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>{s}</button>
      ))}
      <button
        onClick={() => setSeed(Date.now())}
        title="Refresh suggestions"
        style={{ padding: '.22rem .42rem', borderRadius: 4, background: 'transparent', border: `1px solid #243347`, color: '#16c784', fontSize: '.5rem', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
      >↻</button>
    </div>
  )
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

// ── Right rail (Backtest + Files) ─────────────────────────────────────────────
// Sits to the right of the chat. Tabs: Backtest | Files. Backtest tab
// shows the scorecard (or loading/error state) plus a "View full report"
// link that opens /dashboard/build/backtest in a new tab. Files tab is
// the relocated FILES CREATED list.
function BuildRightRail({ btResult, btLoading, btError, extractedFiles, expandedFile, setExpandedFile, onOpenFullReport, onRunBacktest }: {
  btResult: BtResult | null
  btLoading: boolean
  btError: string
  extractedFiles: ExtractedFile[]
  expandedFile: string | null
  setExpandedFile: (n: string | null) => void
  onOpenFullReport: () => void
  onRunBacktest: () => void
}) {
  const [tab, setTab] = useState<'backtest' | 'files'>('backtest')
  // Auto-flip to files once they exist if we're still on the empty backtest tab
  useEffect(() => {
    if (tab === 'backtest' && !btResult && !btLoading && extractedFiles.length > 0) {
      setTab('files')
    }
  }, [extractedFiles.length, btResult, btLoading, tab])

  const ts = (btResult?.tear_sheet ?? {}) as Record<string, number>
  const grade = btResult?.grade ?? '—'
  const gc = GRADE_CLR[grade] ?? C.faint

  return (
    <aside style={{
      width: 260, flexShrink: 0,
      borderLeft: `1px solid ${C.border}`,
      background: `${C.bg2}90`, backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        {(['backtest', 'files'] as const).map(t => {
          const active = tab === t
          return (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '.5rem .6rem', background: active ? `${C.bg3}` : 'transparent', border: 'none',
              color: active ? C.white : C.faint, fontSize: '.55rem', fontWeight: 700,
              fontFamily: 'var(--font-mono)', letterSpacing: '.08em', cursor: 'pointer',
              borderBottom: active ? `2px solid ${C.mint}` : '2px solid transparent',
              transition: 'all .15s',
            }}>
              {t.toUpperCase()}{t === 'files' && extractedFiles.length ? ` ${extractedFiles.length}` : ''}
            </button>
          )
        })}
      </div>

      {tab === 'backtest' && (
        <div style={{ flex: 1, overflow: 'auto', padding: '.65rem .7rem', display: 'flex', flexDirection: 'column', gap: '.55rem' }}>
          {btLoading && (
            <div style={{ padding: '1rem', textAlign: 'center', color: C.faint, fontSize: '.55rem', fontFamily: 'var(--font-mono)' }}>
              <div style={{ width: 14, height: 14, border: `2px solid ${C.border}`, borderTopColor: C.blue, borderRadius: '50%', margin: '0 auto .4rem', animation: 'spin 1s linear infinite' }} />
              Running backtest…
            </div>
          )}
          {btError && (
            <div style={{ padding: '.5rem .65rem', borderRadius: 7, background: `${C.red}10`, border: `1px solid ${C.red}40`, fontSize: '.5rem', color: C.red, fontFamily: 'var(--font-mono)', lineHeight: 1.5 }}>
              {btError.slice(0, 200)}
            </div>
          )}
          {!btLoading && !btError && !btResult && (
            <div style={{ padding: '1rem .5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '.7rem', color: C.text, fontWeight: 600, marginBottom: '.45rem' }}>No backtest yet</div>
              <div style={{ fontSize: '.5rem', color: C.faint, lineHeight: 1.55, marginBottom: '.6rem' }}>
                Once the AI finishes building, the scorecard appears here.
              </div>
              {extractedFiles.length > 0 && (
                <button onClick={onRunBacktest}
                  style={{ padding: '.35rem .8rem', borderRadius: 6, background: C.blue, color: '#fff', border: 'none', fontSize: '.56rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
                  ▶ Run now
                </button>
              )}
            </div>
          )}
          {btResult && !btLoading && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '.4rem' }}>
                {[
                  { k: 'GRADE', v: grade, c: gc },
                  { k: 'SHARPE', v: (ts.sharpeRatio ?? 0).toFixed(2), c: (ts.sharpeRatio ?? 0) >= 1 ? C.mint : C.orange },
                  { k: 'CAGR', v: `${(ts.cagr ?? 0).toFixed(1)}%`, c: (ts.cagr ?? 0) >= 0 ? C.mint : C.red },
                  { k: 'MAX DD', v: `${(ts.maxDrawdownPct ?? 0).toFixed(1)}%`, c: (ts.maxDrawdownPct ?? 0) <= 20 ? C.mint : C.orange },
                  { k: 'WIN%', v: `${(ts.winRatePct ?? 0).toFixed(0)}%`, c: C.text },
                  { k: 'SORTINO', v: (ts.sortinoRatio ?? 0).toFixed(2), c: (ts.sortinoRatio ?? 0) >= 1 ? C.mint : C.orange },
                ].map(m => (
                  <div key={m.k} style={{ padding: '.35rem .45rem', borderRadius: 6, background: C.bg3, border: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: '.4rem', color: C.faint, letterSpacing: '.08em', fontFamily: 'var(--font-mono)' }}>{m.k}</div>
                    <div style={{ fontSize: '.78rem', fontWeight: 700, color: m.c, fontFamily: 'var(--font-mono)' }}>{m.v}</div>
                  </div>
                ))}
              </div>
              <button onClick={onRunBacktest}
                style={{ padding: '.32rem .55rem', borderRadius: 6, background: 'transparent', border: `1px solid ${C.border}`, color: C.text, fontSize: '.55rem', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
                ↻ Re-run backtest
              </button>
              <a href="/dashboard/build/backtest" target="_blank" rel="noopener noreferrer"
                style={{ padding: '.4rem .55rem', borderRadius: 6, background: `${C.mint}14`, border: `1px solid ${C.mint}40`, color: C.mint, fontSize: '.55rem', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontWeight: 700, textAlign: 'center', textDecoration: 'none' }}>
                View full report ↗
              </a>
            </>
          )}
        </div>
      )}

      {tab === 'files' && (
        <div style={{ flex: 1, overflow: 'auto', padding: '.65rem .7rem' }}>
          {extractedFiles.length === 0 ? (
            <div style={{ padding: '1rem .5rem', textAlign: 'center', fontSize: '.55rem', color: C.faint, lineHeight: 1.55, fontFamily: 'var(--font-mono)' }}>
              Files appear here as the AI emits them.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.32rem' }}>
              {extractedFiles.map(f => {
                const ext = f.name.split('.').pop() ?? ''
                const lc = { ts: C.blue, py: C.mint, json: C.orange, md: C.muted }[ext] ?? C.faint
                const isExp = expandedFile === f.name
                return (
                  <div key={f.name}>
                    <button onClick={() => setExpandedFile(isExp ? null : f.name)}
                      style={{ display: 'flex', alignItems: 'center', gap: '.35rem', width: '100%', padding: '.32rem .5rem', borderRadius: 6, background: isExp ? `${lc}14` : 'transparent', border: `1px solid ${isExp ? lc + '50' : C.border}`, color: isExp ? lc : C.text, fontFamily: 'var(--font-mono)', fontSize: '.55rem', cursor: 'pointer', textAlign: 'left' }}>
                      <span>{isExp ? '▾' : '▸'}</span>
                      <span>{f.name}</span>
                      <span style={{ marginLeft: 'auto', fontSize: '.42rem', color: C.faint }}>{f.content.split('\n').length}L</span>
                    </button>
                    {isExp && (
                      <pre style={{ marginTop: '.3rem', background: 'rgba(0,0,0,.5)', border: `1px solid ${C.border}`, borderRadius: 6, padding: '.4rem .5rem', fontSize: '.46rem', fontFamily: 'var(--font-mono)', color: C.blue2, overflowX: 'auto', maxHeight: 200, overflowY: 'auto', lineHeight: 1.5 }}>
                        {f.content.slice(0, 1500)}{f.content.length > 1500 ? '\n…' : ''}
                      </pre>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </aside>
  )
}

// ── Block row with rich hover-describe popover ────────────────────────────────
// Mouse enter ⇒ a 280-px wide card flies out to the right of the row showing:
// label · status pill (LIVE / STUB / STATIC) · long doc · loader signature ·
// agent hint · gotchas. Closes on mouseleave with a brief delay so the
// popover can be hovered too (for copy/paste). This was missing entirely —
// the old UI relied on the native `title=` tooltip.
function BlockRow({ block, catColor, catIcon, pinned, onPin, onDragStart }: {
  block: import('@/lib/quant/blocks').Block
  catColor: string
  catIcon: string
  pinned: boolean
  onPin: () => void
  onDragStart: (e: React.DragEvent) => void
}) {
  const [hover, setHover] = useState(false)
  const closeTimer = useRef<number | null>(null)
  const meta = blockMeta(block.id)
  const sc = statusColor(meta.status)
  const sl = statusLabel(meta.status)
  return (
    <div style={{ position: 'relative' }}
      onMouseEnter={() => { if (closeTimer.current) window.clearTimeout(closeTimer.current); setHover(true) }}
      onMouseLeave={() => { closeTimer.current = window.setTimeout(() => setHover(false), 80) }}>
      <div className="block-row"
        draggable onDragStart={onDragStart}
        onClick={onPin}
        style={{
          padding: '.38rem .5rem', borderRadius: 6, marginBottom: '.18rem',
          background: pinned ? `${catColor}10` : 'rgba(10,21,37,.4)',
          border: `1px solid ${pinned ? catColor + '45' : '#1a2535'}`,
          borderLeft: `2px solid ${pinned ? catColor : '#1a2535'}`,
        }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.3rem' }}>
            <span style={{ fontSize: '.5rem', color: catColor }}>{catIcon}</span>
            <span style={{ fontSize: '.54rem', fontWeight: 600, color: pinned ? '#f1f5f9' : '#94a3b8' }}>{block.label}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.25rem' }}>
            <span style={{
              fontSize: '.36rem', fontWeight: 700, color: sc, letterSpacing: '.08em',
              padding: '.05rem .25rem', borderRadius: 3, background: `${sc}15`, border: `1px solid ${sc}30`,
            }}>{sl}</span>
            {pinned && <span style={{ fontSize: '.4rem', color: catColor }}>✓</span>}
          </div>
        </div>
        <div style={{ fontSize: '.43rem', color: '#475569', marginTop: '.08rem', lineHeight: 1.3 }}>{block.description}</div>
      </div>
      {hover && (
        <div style={{
          position: 'absolute', left: 'calc(100% + 8px)', top: 0, zIndex: 200,
          width: 280, background: '#0a1525f0', border: `1px solid ${catColor}45`,
          borderLeft: `3px solid ${catColor}`, borderRadius: 9,
          padding: '.6rem .7rem', backdropFilter: 'blur(10px)',
          boxShadow: `0 0 24px rgba(0,0,0,.6), 0 0 12px ${catColor}30`,
          fontFamily: 'var(--font-mono)',
          animation: 'fade-up .15s ease',
          pointerEvents: 'auto',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem', marginBottom: '.3rem' }}>
            <span style={{ fontSize: '.6rem', color: catColor }}>{catIcon}</span>
            <span style={{ fontSize: '.62rem', fontWeight: 700, color: '#f1f5f9' }}>{block.label}</span>
            <span style={{
              marginLeft: 'auto', fontSize: '.4rem', fontWeight: 700, color: sc, letterSpacing: '.1em',
              padding: '.06rem .3rem', borderRadius: 3, background: `${sc}15`, border: `1px solid ${sc}40`,
            }}>{sl}</span>
          </div>
          <div style={{ fontSize: '.5rem', color: '#cbd5e1', lineHeight: 1.55, marginBottom: '.4rem' }}>{meta.doc}</div>
          {meta.loader && (
            <div style={{ marginBottom: '.35rem' }}>
              <div style={{ fontSize: '.4rem', color: '#475569', letterSpacing: '.08em', marginBottom: '.1rem' }}>LOADER</div>
              <pre style={{ margin: 0, padding: '.25rem .4rem', background: 'rgba(0,0,0,.5)', border: '1px solid #1a2535', borderRadius: 4, fontSize: '.46rem', color: '#60a5fa', overflowX: 'auto' }}>{meta.loader}</pre>
            </div>
          )}
          {meta.usage && (
            <div style={{ marginBottom: '.35rem' }}>
              <div style={{ fontSize: '.4rem', color: '#475569', letterSpacing: '.08em', marginBottom: '.1rem' }}>USAGE</div>
              <pre style={{ margin: 0, padding: '.25rem .4rem', background: 'rgba(0,0,0,.5)', border: '1px solid #1a2535', borderRadius: 4, fontSize: '.46rem', color: '#a78bfa', overflowX: 'auto' }}>{meta.usage}</pre>
            </div>
          )}
          {block.agentHint && (
            <div style={{ marginBottom: meta.notes ? '.35rem' : 0 }}>
              <div style={{ fontSize: '.4rem', color: '#475569', letterSpacing: '.08em', marginBottom: '.1rem' }}>AGENT HINT</div>
              <div style={{ fontSize: '.46rem', color: '#94a3b8', lineHeight: 1.4, fontStyle: 'italic' }}>{block.agentHint}</div>
            </div>
          )}
          {meta.notes && (
            <div>
              <div style={{ fontSize: '.4rem', color: '#475569', letterSpacing: '.08em', marginBottom: '.1rem' }}>NOTES</div>
              <div style={{ fontSize: '.46rem', color: '#fbbf24', lineHeight: 1.4 }}>{meta.notes}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Saved indicator ───────────────────────────────────────────────────────────
// Tiny pill that pulses each time autosave persists. Updates the elapsed
// time every 5 s so users can see *when* their last save happened. Renders
// in the floating top-right header so it sits next to the New Agent button.
function SavedPill({ ts }: { ts: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(id)
  }, [])
  const ago = Math.max(0, Math.floor((now - ts) / 1000))
  const label = ago < 3 ? 'Saved' : ago < 60 ? `Saved ${ago}s ago` : `Saved ${Math.floor(ago / 60)}m ago`
  const fresh = ago < 3
  return (
    <div key={ts} style={{
      display: 'flex', alignItems: 'center', gap: '.32rem',
      padding: '.28rem .55rem', borderRadius: 7,
      background: fresh ? 'rgba(22,199,132,0.16)' : 'rgba(10,21,37,0.6)',
      border: `1px solid ${fresh ? '#16c78455' : '#1a2535'}`,
      color: fresh ? '#16c784' : '#94a3b8',
      fontFamily: 'var(--font-mono)', fontSize: '.5rem', fontWeight: 600,
      letterSpacing: '.04em',
      backdropFilter: 'blur(10px)',
      transition: 'all .25s ease',
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%', background: '#16c784',
        boxShadow: fresh ? '0 0 8px #16c784' : 'none',
        animation: fresh ? 'blink .9s ease-in-out 2' : 'none',
      }} />
      {label}
    </div>
  )
}

// ── Canvas background: subtle box/grid pattern + vignette only.
// The actual blocks render as interactive draggable nodes in the foreground
// nodes layer below — this is just the texture beneath them.
function CanvasBackground() {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
      {/* Subtle box grid — gives the canvas texture without animation noise */}
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.5 }}>
        <defs>
          <pattern id="canvas-grid" width="64" height="64" patternUnits="userSpaceOnUse">
            <path d="M 64 0 L 0 0 0 64" fill="none" stroke="rgba(148,163,184,0.05)" strokeWidth="1" />
          </pattern>
          <pattern id="canvas-grid-coarse" width="320" height="320" patternUnits="userSpaceOnUse">
            <path d="M 320 0 L 0 0 0 320" fill="none" stroke="rgba(148,163,184,0.10)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#canvas-grid)" />
        <rect width="100%" height="100%" fill="url(#canvas-grid-coarse)" />
      </svg>

      {/* Faint vignette so the centered prompt stands out */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 70% 55% at 50% 45%, transparent 0%, rgba(3,6,8,0.55) 100%)',
      }} />
    </div>
  )
}


export default function BuildPage() {
  const router = useRouter()

  // Build state
  // Prompt text persists across tab switches via localStorage so users
  // never lose mid-typed prompts when they jump to /code or /backtest.
  const [prompt, setPrompt] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    try { return localStorage.getItem('ase_build_prompt_draft') ?? '' } catch { return '' }
  })
  useEffect(() => {
    try { localStorage.setItem('ase_build_prompt_draft', prompt) } catch {}
  }, [prompt])
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
  // BLOCKS panel auto-collapses to icon-only by default so the canvas +
  // prompt are dominant. The user expands it manually with the chevron.
  const [panelCollapsed, setPanelCollapsed] = useState(true)

  // Post-build
  const [extractedFiles, setExtractedFiles] = useState<ExtractedFile[]>([])
  const [expandedFile, setExpandedFile] = useState<string | null>(null)
  const [btResult, setBtResult] = useState<BtResult | null>(null)
  const [btLoading, setBtLoading] = useState(false)
  const [btError, setBtError] = useState('')
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null)

  // ── Agent name + publish state ────────────────────────────────────────────
  // Build is now end-to-end: AI → backtest → publish → cron picks it up via
  // the ai_agents row created by /api/quant/agent/save + /publish. The Code
  // page is kept as a redundant editor for power users.
  const [agentName, setAgentName] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    try { return localStorage.getItem('ase_build_agent_name') ?? '' } catch { return '' }
  })
  useEffect(() => { try { localStorage.setItem('ase_build_agent_name', agentName) } catch {} }, [agentName])

  const [aiAgentId, setAiAgentId] = useState<string | null>(null)
  const [published, setPublished] = useState(false)
  const [publishStep, setPublishStep] = useState<0|1|2|3>(0) // 0=closed 1=review 2=legal 3=success
  const [publishDesc, setPublishDesc] = useState('')
  const [publishTags, setPublishTags] = useState('crypto, custom')
  const [publishSharePrice, setPublishSharePrice] = useState('10.00')
  const [publishing, setPublishing] = useState(false)
  const [legalChecked, setLegalChecked] = useState<boolean[]>([false, false, false])
  // Saved-indicator — flashes when autoSaveDraft persists progress so the
  // user *sees* their work is safe even though everything is local.
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  // Fullscreen mode hides the dashboard chrome (navbar, padding) so the
  // canvas takes the entire viewport. Used for the demo / focus mode.
  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    if (typeof document === 'undefined') return
    const el = document.documentElement
    if (fullscreen) el.classList.add('build-fullscreen')
    else el.classList.remove('build-fullscreen')
    return () => el.classList.remove('build-fullscreen')
  }, [fullscreen])

  // Agents drawer removed — drafts management now lives on /dashboard/build/manage.
  // Drafts badge mounts client-side only (localStorage isn't available on server).
  const [mountedDraftsBadge, setMountedDraftsBadge] = useState(false)
  useEffect(() => { setMountedDraftsBadge(true) }, [])

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

  // Auto-collapse the thinking strip 1.4s after it completes — keeps the
  // workspace clean post-build but the user can still re-open with the
  // chevron. Tied to thinkDone, not phase, so it survives transitions.
  useEffect(() => {
    if (!thinkDone) return
    const t = setTimeout(() => setThinkOpen(false), 1400)
    return () => clearTimeout(t)
  }, [thinkDone])

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
  //
  // IMPORTANT: only hydrate if a build is actively running ('building').
  // Old completed chats ('done') are intentionally NOT shown — the user
  // wants a fresh build canvas every time they open the tab. Stale state
  // from past sessions is cleared so the prompt area starts empty.
  useEffect(() => {
    const initial = getBgState()
    if (initial.phase === 'building') {
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
    } else if (initial.phase === 'done' || initial.phase === 'error') {
      // Wipe stale finished/aborted state from a previous tab visit so the
      // canvas, chat panel, and extracted-files strip all start clean.
      clearBgState()
    }
    const unsub = subscribeBg(s => {
      setPhase(s.phase === 'error' ? 'idle' : (s.phase as 'idle' | 'building' | 'done'))
      setChat(s.chat as ChatMessage[])
      setExtractedFiles(s.files)
      if (s.draftId) setCurrentDraftId(s.draftId)

      // Mine the streaming response for block references so blocks the
      // AI mentions get auto-pinned and laid out on the canvas in real time.
      // Match aggressively: id, exact label, plus a hand-picked alias list of
      // common synonyms (e.g. "RSI" → ind.rsi, "Binance" → data.binance) so
      // the canvas grows visibly as the AI writes.
      const corpus = ((s.chat as ChatMessage[]).map(m => m.content).join('\n') +
                     '\n' + s.files.map(f => f.content).join('\n')).toLowerCase()
      const ALIASES: Record<string, string[]> = {
        'data.binance': ['binance', 'spot ohlcv'],
        'data.coingecko': ['coingecko'],
        'data.yahoo': ['yahoo finance', 'yfinance'],
        'data.onchain': ['nupl', 'sopr', 'glassnode', 'on-chain'],
        'data.funding': ['funding rate', 'perp funding'],
        'data.uniswap': ['uniswap', 'uni v3'],
        'data.options': ['deribit', 'options chain', 'iv surface', 'put/call ratio'],
        'data.perps': ['open interest', 'perps oi'],
        'data.whale': ['whale wallet', 'whale movement'],
        'data.macro_dxy': ['dxy', 'dollar index'],
        'data.rates': ['10y yield', '2y yield', 'treasury'],
        'data.cpi': ['cpi print', 'inflation'],
        'data.fomc': ['fomc', 'fed meeting'],
        'data.equity': ['spy', 'qqq', 's&p 500'],
        'ind.rsi': ['rsi', 'relative strength'],
        'ind.macd': ['macd', 'moving average convergence'],
        'ind.bb': ['bollinger', 'bb bands'],
        'ind.atr': ['atr', 'average true range'],
        'ind.ema_cross': ['ema cross', 'ema(12)', 'ema(26)'],
        'ind.zscore': ['z-score', 'zscore'],
        'ind.adx': ['adx'],
        'ind.stoch': ['stochastic'],
        'ind.vwap': ['vwap'],
        'ind.obv': ['obv', 'on-balance volume'],
        'ind.donchian': ['donchian'],
        'ind.supertrend': ['supertrend'],
        'ind.ichimoku': ['ichimoku', 'cloud'],
        'ml.gbm': ['gradient boost', 'xgboost', 'lightgbm'],
        'ml.lstm': ['lstm', 'recurrent network'],
        'ml.regime': ['hmm', 'hidden markov', 'regime'],
        'ml.transformer': ['transformer', 'attention model'],
        'ml.kalman': ['kalman'],
        'sent.twitter': ['twitter sentiment', 'crypto twitter'],
        'sent.gtrends': ['google trends'],
        'api.fear_greed': ['fear and greed', 'fear & greed', 'fng'],
        'api.kraken': ['kraken'],
        'api.news': ['crypto news', 'cryptopanic'],
        'api.syne': ['syne terminal', 'syne'],
        'risk.killswitch': ['kill switch', 'killswitch', 'circuit'],
        'risk.parity': ['risk parity'],
        'risk.var': ['var cap', 'value at risk'],
        'risk.cvar': ['cvar', 'expected shortfall'],
        'risk.vol_target': ['vol target', 'volatility target'],
        'risk.kelly': ['kelly criterion', 'kelly sizing'],
        'risk.trailing': ['trailing stop'],
        'risk.circuit': ['circuit breaker'],
        'exec.twap': ['twap'],
        'exec.vwap': ['vwap execution'],
        'exec.iceberg': ['iceberg'],
        'exec.coinbase': ['coinbase pro'],
        'exec.binance': ['binance spot', 'binance exec'],
        'exec.dydx': ['dydx'],
        'exec.gmx': ['gmx'],
        'exec.hyperliquid': ['hyperliquid'],
        'sig.composite': ['composite blend', 'composite alpha'],
        'sig.consensus': ['consensus voting', 'multi-model consensus'],
        'sig.majority': ['majority vote'],
        'sig.weighted': ['weighted ensemble'],
        'sig.bayesian': ['bayesian average', 'bayesian blend'],
        'sig.regime_gate': ['regime gate', 'regime filter'],
      }
      const matched: string[] = []
      for (const b of BLOCKS) {
        const ll = b.label.toLowerCase()
        if (corpus.includes(b.id.toLowerCase()) || corpus.includes(ll)) {
          matched.push(b.id); continue
        }
        const aliases = ALIASES[b.id]
        if (aliases && aliases.some(a => corpus.includes(a))) matched.push(b.id)
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
    // If a previous build is still running, abort it first — the new prompt
    // takes priority. The singleton runner already handles the cleanup.
    abortBuildBg()
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

  // ── Backtest + Publish (the bits that used to live only in /code) ─────────
  // Derive a publishable spec from the AI's generated config.json so the
  // cron tick endpoint (which reads spec.symbols + spec.cadence + spec.alpha_type)
  // has what it needs once the agent goes live. Falls back to sensible defaults.
  const deriveSpec = useCallback((): { symbols: string[]; cadence: string; alpha_type: string; risk_aversion: number; max_weight: number; initial_capital: number } => {
    const out = {
      symbols: ['BTC-USD'], cadence: '1h', alpha_type: 'composite',
      risk_aversion: 1.0, max_weight: 0.4, initial_capital: 10000,
    }
    const cfg = extractedFiles.find(f => f.name === 'config.json' || f.name === 'backtest.config.json')
    if (cfg) {
      try {
        const j = JSON.parse(cfg.content)
        if (Array.isArray(j.symbols) && j.symbols.length) out.symbols = j.symbols
        if (typeof j.cadence === 'string') out.cadence = j.cadence
        if (typeof j.alpha_type === 'string') out.alpha_type = j.alpha_type
        if (typeof j.template === 'string') {
          if (/momentum/i.test(j.template)) out.alpha_type = 'momentum'
          else if (/mean.?reversion/i.test(j.template)) out.alpha_type = 'mean_reversion'
          else if (/vol/i.test(j.template)) out.alpha_type = 'volatility'
        }
        if (typeof j.risk_aversion === 'number') out.risk_aversion = j.risk_aversion
        if (typeof j.max_weight === 'number') out.max_weight = j.max_weight
        if (typeof j.initial_capital === 'number') out.initial_capital = j.initial_capital
      } catch {}
    }
    return out
  }, [extractedFiles])

  const runBacktest = useCallback(async () => {
    if (btLoading) return
    setBtLoading(true); setBtError(''); setBtResult(null)
    try {
      const cfgFile = extractedFiles.find(f => f.name === 'backtest.config.json')
      let payload: Record<string, unknown>
      if (cfgFile) {
        try { payload = JSON.parse(cfgFile.content) } catch { payload = {} }
      } else {
        const s = deriveSpec()
        payload = {
          template: 'crypto_momentum',
          symbols: s.symbols.map(x => x.includes('/') ? x.replace('/', '-') : x),
          start_date: '2023-01-01',
          end_date: '2024-12-31',
          rebalance_freq: 'weekly',
          risk_aversion: s.risk_aversion,
          max_weight: s.max_weight,
          initial_capital: s.initial_capital,
          fee_bps: 10,
        }
      }
      const res = await fetch('/api/quant/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, save: false }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Backtest failed')
      setBtResult({ grade: data.grade, tear_sheet: data.tear_sheet })
    } catch (e) {
      setBtError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBtLoading(false)
    }
  }, [btLoading, extractedFiles, deriveSpec])

  // Auto-run a backtest the first time the AI finishes a build
  useEffect(() => {
    if (phase !== 'done' || !extractedFiles.length || btResult || btLoading) return
    void runBacktest()
    // Intentionally narrow deps — only fires on phase transition + first
    // file emission. Re-running is manual via the header button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, extractedFiles.length])

  // Auto-save the in-progress agent every time files / blocks / chat change.
  // Debounced so we don't thrash localStorage during streaming. The "+ New
  // Agent" button also calls saveDraft() explicitly so nothing is ever lost.
  const autoSaveDraft = useCallback((): AgentDraft | null => {
    if (typeof window === 'undefined') return null
    if (!extractedFiles.length && !pinnedIds.length && !chat.length && !prompt.trim()) return null
    const filesObj: Record<string, string> = {}
    for (const f of extractedFiles) filesObj[f.name] = f.content
    const sourcePrompt = (() => {
      try { return localStorage.getItem('ase_build_prompt') ?? prompt } catch { return prompt }
    })()
    const draft: AgentDraft = {
      id: currentDraftId ?? crypto.randomUUID(),
      name: agentName || nameFromPrompt(sourcePrompt),
      prompt: sourcePrompt,
      files: filesObj,
      blocks: pinnedIds,
      createdAt: Date.now(),
    }
    saveDraft(draft)
    if (!currentDraftId) setCurrentDraftId(draft.id)
    setLastSavedAt(Date.now())
    return draft
  }, [extractedFiles, pinnedIds, chat.length, prompt, currentDraftId, agentName])

  useEffect(() => {
    const t = setTimeout(() => { autoSaveDraft() }, 700)
    return () => clearTimeout(t)
  }, [autoSaveDraft, extractedFiles, pinnedIds, chat.length])

  function publishReadiness(): { ok: boolean; missing: string[] } {
    const missing: string[] = []
    const corpus = extractedFiles.map(f => f.content).join('\n').toLowerCase()
    if (!extractedFiles.length) missing.push('Build a strategy first — describe it and let the AI generate strategy.ts.')
    else {
      if (!/thinking|reasoning|rationale/.test(corpus)) missing.push('strategy.ts must include a thinking()/reasoning trace so each tick can post the agent\'s rationale.')
      if (!/ledger|postledger|agent_paper_ledger/.test(corpus)) missing.push('strategy.ts must call postLedger()/agent_paper_ledger so trades land in the ledger.')
    }
    return { ok: missing.length === 0, missing }
  }

  const handlePublish = useCallback(() => {
    const r = publishReadiness()
    if (!r.ok) {
      alert('Cannot publish yet:\n\n' + r.missing.join('\n'))
      return
    }
    if (btResult) {
      const ts = btResult.tear_sheet ?? {}
      setPublishDesc(`Custom strategy — Grade ${btResult.grade} | Sharpe ${(ts.sharpeRatio??0).toFixed(2)} | CAGR ${(ts.cagr??0).toFixed(1)}% | MaxDD ${(ts.maxDrawdownPct??0).toFixed(1)}%`)
    } else if (!publishDesc) {
      setPublishDesc('Custom strategy generated by ASE Build')
    }
    if (!agentName) {
      try { setAgentName(nameFromPrompt(localStorage.getItem('ase_build_prompt') ?? prompt)) } catch {}
    }
    setPublishStep(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [btResult, publishDesc, agentName, prompt, extractedFiles])

  const submitPublish = useCallback(async () => {
    setPublishing(true)
    try {
      const spec = deriveSpec()
      const strategyCode = extractedFiles.find(f => f.name === 'strategy.ts')?.content ?? ''
      const configJson = extractedFiles.find(f => f.name === 'config.json')?.content ?? ''
      const fullSpec: Record<string, unknown> = {
        ...spec,
        strategy_code: strategyCode,
        config_json: configJson,
        blocks: pinnedIds,
      }
      const sourcePrompt = (() => {
        try { return localStorage.getItem('ase_build_prompt') ?? prompt } catch { return prompt }
      })()

      // 1) Save (or update) the ai_agents row
      let id = aiAgentId
      if (!id) {
        const saveRes = await fetch('/api/quant/agent/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: agentName || nameFromPrompt(sourcePrompt),
            thesis: publishDesc,
            prompt: sourcePrompt,
            spec: fullSpec,
            status: 'tested',
          }),
        })
        const saveData = await saveRes.json()
        if (!saveRes.ok) throw new Error(saveData.error ?? 'Save failed')
        id = saveData.agent.id as string
        setAiAgentId(id)
      } else {
        await fetch(`/api/quant/agent/save?id=${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spec: fullSpec, status: 'tested' }),
        })
      }

      // 2) Patch backtest stats so the exchange listing carries them
      if (btResult && id) {
        const ts = btResult.tear_sheet ?? {}
        await fetch(`/api/quant/agent/save?id=${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            last_grade: btResult.grade,
            last_sharpe: ts.sharpeRatio ?? 0,
            last_cagr: ts.cagr ?? 0,
            last_max_dd: ts.maxDrawdownPct ?? 0,
          }),
        })
      }

      // 3) Publish to the exchange + kick first cron tick
      const pubRes = await fetch(`/api/quant/agent/publish?id=${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const pubData = await pubRes.json()
      if (!pubRes.ok) throw new Error(pubData.error ?? 'Publish failed')

      autoSaveDraft()
      setPublished(true)
      setPublishStep(3)
    } catch (e) {
      alert('Publish failed: ' + (e instanceof Error ? e.message : 'Network error'))
      setPublishStep(0)
    } finally {
      setPublishing(false)
    }
  }, [aiAgentId, agentName, publishDesc, prompt, deriveSpec, extractedFiles, pinnedIds, btResult, autoSaveDraft])

  // "+ New Agent" — always saves current progress before clearing.
  const startNewAgent = useCallback(() => {
    autoSaveDraft()
    abortBuildBg()
    clearBgState()
    setPhase('idle'); setChat([]); setExtractedFiles([]); setBtResult(null); setBtError('')
    setPinnedIds([])
    setNodes(layoutPipeline([]))
    setPrompt('')
    setAgentName('')
    setAiAgentId(null); setPublished(false); setPublishStep(0)
    setLegalChecked([false, false, false])
    setCurrentDraftId(null)
    try {
      localStorage.removeItem('ase_build_prompt_draft')
      localStorage.removeItem('ase_build_prompt')
      localStorage.removeItem('ase_build_blocks')
      localStorage.removeItem('ase_build_agent_name')
      localStorage.removeItem('ase_latest_draft_id')
      localStorage.removeItem('ase-files')
    } catch {}
  }, [autoSaveDraft])

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
  // "Landed" = the user has done anything. Until then we render a single
  // centered prompt with no chrome — the minimalistic first-touch surface
  // the user asked for. The first build promotes the page to the full
  // workspace.
  const landed = phase !== 'idle' || chat.length > 0 || extractedFiles.length > 0 || pinnedIds.length > 0 || prompt.trim().length > 8

  return (
    <div
      style={{ width: '100%', height: 'calc(100vh - 56px)', overflow: 'hidden', background: C.bg, position: 'relative', display: 'flex', userSelect: nodeDrag ? 'none' : 'auto' }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      // Drop targets are also wired here so users can drag a block anywhere
      // on the page (idle prompt area included), not only on the canvas-bg.
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes glow-mint { 0%,100% { box-shadow: 0 0 18px rgba(22,199,132,.25) } 50% { box-shadow: 0 0 32px rgba(22,199,132,.55) } }
        @keyframes slideInUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        :global(html.build-fullscreen) [data-dashboard-shell-nav] { display: none !important; }
        :global(html.build-fullscreen) [data-dashboard-shell-padding] { padding: 0 !important; max-width: none !important; }
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
          // Background reacts to blocks being added — see CanvasReactiveBg below
          background: C.bg,
          zIndex: 0,
        }}
      >
        {/* Subtle background grid + vignette. Interactive blocks render
            as foreground nodes on top of this texture. */}
        <CanvasBackground />
        {/* Decorative grid + blinking radial backgrounds removed — canvas
            is clean. Pipeline nodes/edges below are the only visual. */}

        {/* Canvas nodes layer — outer wrapper centers the nodes group
            horizontally so the pipeline always sits in the middle of the
            canvas regardless of how many blocks are pinned. Inner div
            keeps the pan/zoom transform behavior intact. */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          pointerEvents: 'none', // child nodes set their own pointer-events
        }}>
          {(() => {
            // Compute the *actual* bounding box of pinned nodes so the wrapper
            // is symmetric and the flex parent truly centers it. Without this,
            // adding a single block on the left would shift everything off-center.
            const xs = nodes.map(n => n.x)
            const ys = nodes.map(n => n.y)
            const minX = xs.length ? Math.min(...xs) : 0
            const maxX = xs.length ? Math.max(...xs) : 0
            const minY = ys.length ? Math.min(...ys) : 0
            const maxY = ys.length ? Math.max(...ys) : 0
            const width  = Math.max(360, (maxX - minX) + 200)
            const height = Math.max(220, (maxY - minY) + 80)
            // Shift child node positions so the leftmost block sits at x=0,
            // making the bounding box symmetric around the flex centroid.
            const shiftX = -minX
            const shiftY = -minY
            return (
          <div style={{
            position: 'relative',
            width, height,
            transform: `translate(${canvasOffset.x}px,${canvasOffset.y}px) scale(${zoom})`,
            transformOrigin: 'center',
            pointerEvents: 'auto',
          }}>
          <div style={{ position: 'absolute', inset: 0, transform: `translate(${shiftX}px, ${shiftY}px)` }}>
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
            )
          })()}
        </div>
      </div>

      {/* ══ LEFT PANEL: BLOCKS — only mounts after the user has prompted at
            least once. The minimal landing surface is dominated by a single
            centered prompt; revealing the block library would be visual
            noise before the user has even named what they want to build. */}
      {landed && (
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
                        <BlockRow
                          key={block.id}
                          block={block}
                          catColor={cat.color}
                          catIcon={cat.icon}
                          pinned={pinned}
                          onPin={() => togglePin(block.id)}
                          onDragStart={(e) => handleDragStart(e, block.id)}
                        />
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
      )}

      {/* ══ MAIN AREA ════════════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 10, overflow: 'hidden' }}>




        {/* ── MINIMAL LANDING ──
             First-touch surface. No header, no canvas, no clutter — a single
             centered prompt with the brand mark. As soon as the user types
             & submits, `landed` flips and the full workspace mounts. The
             `landed` heuristic also catches returning users who already have
             a draft in progress, so they skip straight to the workspace.
        */}
        {!landed && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '1rem 2rem', position: 'relative', overflow: 'hidden',
          }}>
            {/* Faint center-vignette — single subtle effect, not a fake
                particle field. */}
            <div aria-hidden style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: `radial-gradient(ellipse 60% 45% at 50% 45%, rgba(22,199,132,0.05) 0%, transparent 70%)`,
            }} />

            <div style={{ textAlign: 'center', marginBottom: '1.1rem', position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '.6rem' }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 11,
                  background: `linear-gradient(135deg, ${C.mint}28, ${C.blue}22)`,
                  border: `1px solid ${C.mint}45`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 0 26px ${C.mint}30`,
                }}>
                  <span style={{ fontSize: '1.15rem', color: C.mint }}>◈</span>
                </div>
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: C.white, letterSpacing: '-.022em', lineHeight: 1.1, marginBottom: '.4rem' }}>
                What should your agent trade?
              </div>
              <div style={{ fontSize: '.62rem', color: C.faint, fontFamily: 'var(--font-mono)' }}>
                Describe a strategy in plain English — the AI builds, backtests, and ships it.
              </div>
            </div>

            <div style={{ width: '100%', maxWidth: 560, position: 'relative' }}>
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => { if ((e.key === 'Enter' && (e.metaKey || e.ctrlKey)) || (e.key === 'Enter' && !e.shiftKey && prompt.trim())) { e.preventDefault(); handleBuild() } }}
                placeholder="e.g. Buy BTC when it dips below its 30d average, sell when greed peaks. Stop out at 8%."
                rows={3}
                style={{
                  width: '100%',
                  background: `${C.bg2}f0`, border: `1px solid ${C.border2}`,
                  borderRadius: 12, padding: '.85rem 1rem',
                  color: C.white, fontFamily: 'var(--font-mono)', fontSize: '.7rem', lineHeight: 1.55,
                  outline: 'none', resize: 'none', minHeight: 96,
                  boxShadow: '0 12px 40px rgba(0,0,0,.5)',
                  boxSizing: 'border-box',
                }}
                autoFocus
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '.6rem' }}>
                <div style={{ fontSize: '.46rem', color: C.faint, fontFamily: 'var(--font-mono)', letterSpacing: '.06em' }}>↵ build</div>
                <button onClick={handleBuild} disabled={!prompt.trim()}
                  style={{
                    padding: '.5rem 1.2rem', borderRadius: 9, fontWeight: 800, fontSize: '.66rem',
                    background: prompt.trim() ? C.mint : C.border, color: prompt.trim() ? '#000' : C.faint,
                    border: 'none', cursor: prompt.trim() ? 'pointer' : 'not-allowed',
                    boxShadow: prompt.trim() ? `0 0 18px ${C.mint}50` : 'none',
                    fontFamily: 'var(--font-mono)',
                  }}>Build →</button>
              </div>

              <div style={{ marginTop: '.85rem' }}>
                <SuggestionChips onPick={(s) => { setPrompt(s); setTimeout(() => textareaRef.current?.focus(), 50) }} />
              </div>
            </div>

            {/* Tiny manage link bottom-center — discoverable, not loud */}
            <div style={{ position: 'absolute', bottom: 14, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: '.85rem', fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint }}>
              <a href="/dashboard/build/manage" style={{ color: C.faint, textDecoration: 'none' }}>◈ manage agents</a>
              <span style={{ color: C.border2 }}>·</span>
              <a href="/dashboard/build/docs" style={{ color: C.faint, textDecoration: 'none' }}>⊙ docs</a>
              <span style={{ color: C.border2 }}>·</span>
              <a href="/dashboard/marketplace" style={{ color: C.faint, textDecoration: 'none' }}>✦ exchange</a>
            </div>
          </div>
        )}

        {/* Header chrome — once landed, the action buttons live INSIDE the
             workspace header (not floating). Saved-pill, New Agent, Manage,
             Docs, fullscreen toggle. The previous floating cluster is gone. */}

        {/* AGENTS DRAWER removed — Drafts list now lives on the Manage
            page (/dashboard/build/manage), so we have a single agents
            management surface instead of a duplicate drawer. */}

        {/* ── IDLE: centered prompt. The wrapper is pointer-events:none
             so drags pass through to the canvas; only the prompt card +
             headline have pointer-events:auto. As soon as a block is
             picked, the prompt slides DOWN to give the canvas more room
             (justifyContent: flex-end + bottom padding). ── */}
        {/* ── WORKSPACE — only mounts after the user has prompted at least
             once (or has an in-progress draft). Single unified surface:
             pipeline strip → header → files → backtest → chat → composer. */}
        {landed && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            overflow: 'hidden', animation: 'fade-up .35s ease',
            background: `${C.bg}`,
          }}>

            {/* Pipeline strip — top of the workspace, auto-height */}
            <div style={{ flexShrink: 0, borderBottom: `1px solid ${C.border}` }}>
              <CanvasAssembly blocks={nodes.map(n => n.id)} phase={phase} />
            </div>

            {/* Header — every above-canvas chrome lives INLINE here, not
                 floating over the canvas. Status badge → action cluster on
                 the right (Backtest, Publish, Code, New Agent, Manage,
                 Docs, Fullscreen, Saved). */}
            <div style={{ padding: '.5rem .85rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: '.5rem', flexShrink: 0, background: `${C.bg2}cc`, backdropFilter: 'blur(8px)' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: isBuilding ? C.orange : C.mint, animation: isBuilding ? 'blink .6s infinite' : 'none' }} />
              <span style={{ fontSize: '.55rem', fontWeight: 700, color: C.white, fontFamily: 'var(--font-mono)' }}>
                {isBuilding ? 'Building strategy...' : 'Agent ready'}
              </span>
              {lastSavedAt && <SavedPill ts={lastSavedAt} />}
              <div style={{ flex: 1 }} />

              {/* Run Backtest — primary action once the AI is done. Spinning
                   icon replaces text while running so the button never feels
                   dead. */}
              {isDone && (
                <button onClick={() => void runBacktest()} disabled={btLoading}
                  title="Run a fresh backtest on the generated strategy"
                  style={{ display: 'flex', alignItems: 'center', gap: '.32rem', padding: '.3rem .7rem', borderRadius: 7, background: btLoading ? `${C.blue}55` : C.blue, color: '#fff', fontWeight: 700, fontSize: '.56rem', border: 'none', cursor: btLoading ? 'not-allowed' : 'pointer', transition: 'all .15s', fontFamily: 'var(--font-mono)' }}>
                  {btLoading
                    ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0"/></svg>
                    : <span style={{ fontSize: '.7rem', lineHeight: 1 }}>▶</span>}
                  {btLoading ? 'Running…' : 'Backtest'}
                </button>
              )}

              {/* Publish — folds the entire code-page wizard inline so
                   users never need to leave Build. */}
              {isDone && (
                <button onClick={handlePublish}
                  title="Publish to the ASE Exchange (cron picks it up immediately)"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '.32rem', padding: '.3rem .75rem', borderRadius: 7,
                    background: published ? `${C.mint}18` : C.mint,
                    color: published ? C.mint : '#000',
                    fontWeight: 800, fontSize: '.56rem', border: published ? `1px solid ${C.mint}55` : 'none',
                    cursor: 'pointer', fontFamily: 'var(--font-mono)',
                    boxShadow: !published ? `0 0 14px ${C.mint}55` : 'none',
                    transition: 'all .15s',
                  }}>
                  <span style={{ fontSize: '.7rem', lineHeight: 1 }}>◈</span>
                  {published ? 'LIVE' : 'Publish'}
                </button>
              )}

              {/* Code page is kept as a power-user editor — Build is now
                   end-to-end so the link is de-emphasized. */}
              {isDone && (
                <button onClick={() => router.push('/dashboard/build/code')}
                  title="Open the same files in the code editor"
                  style={{ padding: '.3rem .65rem', borderRadius: 7, background: 'transparent', border: `1px solid ${C.border}`, color: C.faint, fontWeight: 600, fontSize: '.54rem', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
                  ⌘ Code
                </button>
              )}

              <button onClick={startNewAgent}
                title="Save current progress and start a fresh agent"
                style={{ display: 'flex', alignItems: 'center', gap: '.3rem', padding: '.3rem .65rem', borderRadius: 7, background: 'transparent', border: `1px solid ${C.mint}40`, color: C.mint, fontFamily: 'var(--font-mono)', fontSize: '.55rem', fontWeight: 700, cursor: 'pointer' }}>
                + New Agent
              </button>

              {/* Manage / Docs / Fullscreen — folded in from the previous
                   floating cluster so nothing hovers above the canvas. */}
              <button onClick={() => router.push('/dashboard/build/manage')}
                title="Manage drafts and published agents"
                style={{ display: 'flex', alignItems: 'center', gap: '.3rem', padding: '.3rem .55rem', borderRadius: 7, background: 'transparent', border: `1px solid ${C.border}`, color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '.55rem', cursor: 'pointer' }}>
                <span style={{ color: C.mint }}>◈</span> Manage
                {mountedDraftsBadge && loadDrafts().length > 0 && <span suppressHydrationWarning style={{ background: C.mint, color: '#000', borderRadius: 3, padding: '0 .3rem', fontSize: '.42rem', fontWeight: 700 }}>{loadDrafts().length}</span>}
              </button>
              <a href="/dashboard/build/docs" title="Docs"
                style={{ display: 'flex', alignItems: 'center', gap: '.3rem', padding: '.3rem .55rem', borderRadius: 7, background: 'transparent', border: `1px solid ${C.border}`, color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '.55rem', cursor: 'pointer', textDecoration: 'none' }}>
                <span style={{ color: C.blue2 }}>⊙</span> Docs
              </a>
              <button onClick={() => setFullscreen(v => !v)}
                title={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                style={{ padding: '.3rem .5rem', borderRadius: 7, background: 'transparent', border: `1px solid ${C.border}`, color: C.faint, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                {fullscreen ? '↙' : '⤢'}
              </button>
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

            {/* Chat + Right Rail. Files explorer + backtest scorecard moved
                 into the rail (right side) so they stop stacking above the
                 conversation — the chat is the focus, not the artifacts. */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

            {/* AI Chat (dominant) — always rendered; empty state when idle */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
              <div ref={chatScrollRef} style={{ flex: 1, overflowY: 'auto', padding: '.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '.65rem' }}>
                {chat.length === 0 && phase === 'idle' && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '2rem 1rem', gap: '.6rem', textAlign: 'center', animation: 'fade-up .35s ease' }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: 10,
                      background: `linear-gradient(135deg, ${C.mint}22, ${C.blue}22)`,
                      border: `1px solid ${C.mint}45`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      animation: 'glow-mint 2.4s ease-in-out infinite',
                    }}>
                      <span style={{ fontSize: '1.05rem', color: C.mint }}>◈</span>
                    </div>
                    <div style={{ fontSize: '.85rem', fontWeight: 800, color: C.white, letterSpacing: '-.01em', lineHeight: 1.2 }}>What should your agent trade?</div>
                    <div style={{ fontSize: '.55rem', color: C.faint, maxWidth: 380, lineHeight: 1.5 }}>
                      Describe a strategy in plain English. The AI builds <strong style={{ color: C.text, fontWeight: 600 }}>strategy.ts</strong>, <strong style={{ color: C.text, fontWeight: 600 }}>config.json</strong>, and a runnable backtest in one shot. You stay the brain — pin blocks, refine, publish.
                    </div>
                    <SuggestionChips onPick={(s) => { setPrompt(s); setTimeout(() => textareaRef.current?.focus(), 50) }} />
                  </div>
                )}
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

              {/* Quick action chips — feel-alive: lets the user nudge
                  the AI without typing. Each chip is a pre-filled prompt
                  that streams a contextual follow-up. */}
              {isDone && !chatStreaming && (
                <div style={{ padding: '.45rem .85rem 0', display: 'flex', gap: '.3rem', flexWrap: 'wrap', flexShrink: 0 }}>
                  {[
                    { label: '↻ Run backtest', q: 'Run a fresh backtest on this strategy and tell me what changed in the metrics.' },
                    { label: '+ Tighten risk', q: 'Tighten the risk controls — lower the max drawdown threshold and add a volatility-targeted sizing layer. Output the updated files.' },
                    { label: '⚡ Boost edge', q: 'Suggest one concrete signal addition that would raise the Sharpe without inflating drawdown, and write the updated strategy.ts.' },
                    { label: '? Explain trades', q: 'Walk me through the last 5 trades — why each one fired, what it reflects about the regime.' },
                  ].map(c => (
                    <button key={c.label}
                      onClick={() => { setChatInput(c.q); setTimeout(sendChat, 30) }}
                      style={{ padding: '.22rem .55rem', borderRadius: 5, background: 'rgba(22,199,132,.06)', border: `1px solid ${C.mint}30`, color: C.mint, fontFamily: 'var(--font-mono)', fontSize: '.5rem', cursor: 'pointer', fontWeight: 600 }}>
                      {c.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Composer — when idle, this triggers handleBuild; otherwise
                   it sends a refinement message. One input, two modes; the
                   user never sees a context switch. */}
              <div style={{ padding: '.55rem .85rem', borderTop: `1px solid ${C.border}`, display: 'flex', gap: '.45rem', flexShrink: 0, alignItems: 'flex-end', background: `${C.bg2}cc`, backdropFilter: 'blur(8px)' }}>
                {phase === 'idle' ? (
                  <>
                    <textarea
                      ref={textareaRef}
                      value={prompt}
                      onChange={e => setPrompt(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleBuild() } else if (e.key === 'Enter' && !e.shiftKey && prompt.trim()) { e.preventDefault(); handleBuild() } }}
                      placeholder="e.g. Buy BTC when it dips below its 30d average, sell when greed peaks. Stop out at 8%."
                      rows={1}
                      style={{ flex: 1, background: 'rgba(10,21,37,.5)', border: `1px solid ${C.border2}`, borderRadius: 8, padding: '.5rem .65rem', color: C.white, fontSize: '.6rem', outline: 'none', fontFamily: 'var(--font-mono)', resize: 'none', minHeight: 36, maxHeight: 140, lineHeight: 1.5 }}
                    />
                    <button onClick={handleBuild} disabled={!prompt.trim() && pinnedIds.length === 0}
                      style={{ padding: '.5rem 1rem', borderRadius: 8, background: (!prompt.trim() && pinnedIds.length === 0) ? C.border : C.mint, color: (!prompt.trim() && pinnedIds.length === 0) ? C.faint : '#000', fontSize: '.6rem', fontWeight: 800, border: 'none', cursor: (!prompt.trim() && pinnedIds.length === 0) ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', boxShadow: (prompt.trim() || pinnedIds.length > 0) ? `0 0 14px ${C.mint}55` : 'none', transition: 'all .15s' }}>
                      Build ↵
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                      placeholder={chatStreaming ? 'AI is working…' : isDone ? 'Refine the strategy, ask about results, request a signal change…' : 'Ask anything…'}
                      disabled={chatStreaming}
                      style={{ flex: 1, background: 'rgba(10,21,37,.5)', border: `1px solid ${C.border2}`, borderRadius: 8, padding: '.5rem .65rem', color: C.white, fontSize: '.6rem', outline: 'none', fontFamily: 'var(--font-mono)' }}
                    />
                    <button className="chat-send" onClick={sendChat}
                      disabled={chatStreaming || !chatInput.trim()}
                      style={{ padding: '.5rem .9rem', borderRadius: 8, background: chatStreaming || !chatInput.trim() ? C.border : C.mint, color: chatStreaming || !chatInput.trim() ? C.faint : '#000', fontSize: '.6rem', fontWeight: 700, border: 'none', cursor: chatStreaming ? 'not-allowed' : 'pointer', transition: 'all .15s' }}>→</button>
                  </>
                )}
              </div>
            </div>

            {/* ── Right rail: Backtest scorecard + Files explorer ──
                  Replaces the old stacked Files/Backtest strips above the
                  chat. Cleaner UX: artifacts live where the user can scan
                  them without scrolling past the conversation. */}
            <BuildRightRail
              btResult={btResult}
              btLoading={btLoading}
              btError={btError}
              extractedFiles={extractedFiles}
              expandedFile={expandedFile}
              setExpandedFile={setExpandedFile}
              onOpenFullReport={() => router.push('/dashboard/build/backtest')}
              onRunBacktest={runBacktest}
            />

            </div>
          </div>
        )}
      </div>

      {/* Zoom controls (− / + / ⊙) removed — canvas auto-fits content. */}

      {/* ══ PUBLISH WIZARD MODAL ════════════════════════════════════════════════
          Folded in from /dashboard/build/code so users can publish straight
          from Build. 3 steps: review backtest → legal disclosures → success.
          Submit calls /api/quant/agent/save then /api/quant/agent/publish so
          cron picks the agent up on the next tick. */}
      {publishStep > 0 && (
        <div
          onClick={e => { if (e.target === e.currentTarget && publishStep !== 3) setPublishStep(0) }}
          style={{ position: 'absolute', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.78)', backdropFilter: 'blur(8px)' }}>
          <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, width: 540, maxWidth: '95vw', padding: '1.4rem 1.6rem', display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative', animation: 'slideInUp .22s ease' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: `${C.mint}18`, border: `1px solid ${C.mint}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'glow-mint 2.4s ease-in-out infinite' }}>
                <span style={{ fontSize: '.95rem', color: C.mint }}>◈</span>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '.82rem', color: C.white }}>
                  {publishStep === 3 ? 'Live on Exchange' : 'Publish to Exchange'}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.faint }}>
                  {publishStep === 1 ? 'Step 1 of 2 — Review & Configure' : publishStep === 2 ? 'Step 2 of 2 — Legal & Compliance' : 'Cron will pick it up on the next tick'}
                </div>
              </div>
              {publishStep !== 3 && (
                <button onClick={() => setPublishStep(0)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: C.faint, fontSize: '1rem' }}>✕</button>
              )}
            </div>

            {publishStep < 3 && (
              <div style={{ display: 'flex', gap: '.3rem' }}>
                {[1,2].map(s => (
                  <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: publishStep >= s ? C.mint : C.border, transition: 'background .2s' }} />
                ))}
              </div>
            )}

            {/* STEP 1 — Review */}
            {publishStep === 1 && (() => {
              const ts = (btResult?.tear_sheet ?? {}) as Record<string, number>
              const grade = btResult?.grade ?? '—'
              const gc = GRADE_CLR[grade] ?? C.faint
              const sharpe = (ts.sharpeRatio ?? 0).toFixed(2)
              const cagr = (ts.cagr ?? 0).toFixed(1)
              const maxdd = (ts.maxDrawdownPct ?? 0).toFixed(1)
              const checks = [
                { label: 'Backtest run', ok: !!btResult, detail: btResult ? `Grade ${grade}` : 'Run backtest first' },
                { label: 'Sharpe ≥ 1.0', ok: (ts.sharpeRatio ?? 0) >= 1.0, detail: `Sharpe ${sharpe}` },
                { label: 'Max drawdown ≤ 30%', ok: (ts.maxDrawdownPct ?? 0) <= 30, detail: `MaxDD ${maxdd}%` },
                { label: 'Reasoning trace present', ok: /thinking|reasoning|rationale/i.test(extractedFiles.map(f => f.content).join('\n')), detail: 'thinking()/reasoning()' },
                { label: 'Ledger writes wired', ok: /ledger|postledger|agent_paper_ledger/i.test(extractedFiles.map(f => f.content).join('\n')), detail: 'postLedger()' },
              ]
              const allPass = checks.every(c => c.ok)
              return (
                <>
                  <div style={{ background: C.bg3, borderRadius: 10, padding: '.7rem 1rem', border: `1px solid ${C.border}` }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, letterSpacing: '.1em', marginBottom: '.5rem' }}>BACKTEST SCORECARD</div>
                    <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                      {[['GRADE', grade, gc], ['SHARPE', sharpe, parseFloat(sharpe) >= 1 ? C.mint : C.orange], ['CAGR', cagr + '%', C.blue], ['MAX DD', maxdd + '%', parseFloat(maxdd) <= 20 ? C.mint : C.orange]].map(([k, v, c]) => (
                        <div key={k as string} style={{ flex: 1, minWidth: 80, background: C.bg, borderRadius: 7, padding: '.4rem .6rem', border: `1px solid ${C.border}` }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.44rem', color: C.faint }}>{k as string}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', fontWeight: 700, color: c as string }}>{v as string}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.32rem' }}>
                    {checks.map(c => (
                      <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.3rem .6rem', borderRadius: 6, background: c.ok ? `${C.mint}08` : `${C.orange}08`, border: `1px solid ${c.ok ? C.mint + '25' : C.orange + '25'}` }}>
                        <span style={{ color: c.ok ? C.mint : C.orange, fontSize: '.75rem' }}>{c.ok ? '✓' : '⚠'}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: C.text, flex: 1 }}>{c.label}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint }}>{c.detail}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.55rem' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, marginBottom: '.2rem' }}>AGENT NAME</div>
                      <input value={agentName} onChange={e => setAgentName(e.target.value)}
                        placeholder="e.g. Momentum BTC v1"
                        style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, padding: '.35rem .55rem', color: C.white, fontFamily: 'var(--font-mono)', fontSize: '.65rem', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, marginBottom: '.2rem' }}>DESCRIPTION</div>
                      <textarea value={publishDesc} onChange={e => setPublishDesc(e.target.value)} rows={2}
                        style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, padding: '.35rem .55rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.6rem', outline: 'none', resize: 'none', boxSizing: 'border-box', lineHeight: 1.5 }} />
                    </div>
                    <div style={{ display: 'flex', gap: '.5rem' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, marginBottom: '.2rem' }}>TAGS</div>
                        <input value={publishTags} onChange={e => setPublishTags(e.target.value)}
                          style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, padding: '.35rem .55rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.6rem', outline: 'none', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ width: 120 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, marginBottom: '.2rem' }}>SHARE PRICE (USD)</div>
                        <input type="number" min="1" step="0.01" value={publishSharePrice} onChange={e => setPublishSharePrice(e.target.value)}
                          style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, padding: '.35rem .55rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.6rem', outline: 'none', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
                    <button onClick={() => setPublishStep(0)} style={{ padding: '.4rem .8rem', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '.6rem', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={() => setPublishStep(2)} disabled={!allPass || !agentName.trim()}
                      style={{ padding: '.4rem 1rem', borderRadius: 7, border: 'none', background: (allPass && agentName.trim()) ? C.mint : `${C.mint}30`, color: (allPass && agentName.trim()) ? '#000' : C.faint, fontFamily: 'var(--font-mono)', fontSize: '.6rem', fontWeight: 700, cursor: (allPass && agentName.trim()) ? 'pointer' : 'not-allowed' }}>
                      Continue →
                    </button>
                  </div>
                </>
              )
            })()}

            {/* STEP 2 — Legal */}
            {publishStep === 2 && (
              <>
                <div style={{ background: C.bg3, borderRadius: 10, padding: '.75rem 1rem', border: `1px solid ${C.border}` }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.orange, letterSpacing: '.1em', marginBottom: '.4rem' }}>⚠ IMPORTANT DISCLOSURES</div>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: C.text, lineHeight: 1.6, margin: 0 }}>
                    By publishing to the ASE Exchange you allow other users to copy-trade this strategy. Past backtest performance does not guarantee future results. Crypto markets are highly volatile and all trading involves risk of loss.
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

            {/* STEP 3 — Success */}
            {publishStep === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', padding: '.5rem 0' }}>
                <div style={{ width: 60, height: 60, borderRadius: 16, background: `${C.mint}18`, border: `1px solid ${C.mint}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'glow-mint 2s ease-in-out infinite' }}>
                  <span style={{ fontSize: '1.8rem' }}>◈</span>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1rem', color: C.mint, marginBottom: '.3rem' }}>Live on Exchange</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: C.faint }}>
                    <strong style={{ color: C.white }}>{agentName}</strong> is now live for copy-trading. Cron will tick on the next cadence.
                  </div>
                </div>
                <div style={{ background: C.bg3, borderRadius: 10, padding: '.65rem 1rem', border: `1px solid ${C.border}`, width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.35rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.faint }}>Cadence</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', fontWeight: 700, color: C.white }}>{deriveSpec().cadence}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.35rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.faint }}>Share price</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', fontWeight: 700, color: C.white }}>${publishSharePrice}</span>
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
                    Back to Build
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
