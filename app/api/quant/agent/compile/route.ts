/**
 * POST /api/quant/agent/compile
 *
 * Streaming SSE: NL prompt + selected blocks + codebase context → AgentSpec.
 * Emits typed events: status, partial, agent, error, done.
 *
 * Body: { prompt, prior?, blocks?: string[], stream?: boolean }
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { DATA_SOURCES, INDICATORS, RISK_METRICS } from '@/lib/quant-docs'
import { blocksToHints } from '@/lib/quant/blocks'

const CF_WORKER_URL = "https://ase-ai.jazing14.workers.dev";

/** Extract the first balanced JSON object from a possibly-noisy LLM response.
 * Handles: ```json fences, leading/trailing prose, multiple sibling {} blocks
 * (e.g. python examples after the real payload). Tracks string/escape state so
 * braces inside strings don't confuse the matcher. */
function extractJsonObject(text: string): string | null {
  if (!text) return null
  // Strip code fences first — they're the most common wrapper.
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const haystack = fenceMatch ? fenceMatch[1] : text
  const start = haystack.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < haystack.length; i++) {
    const c = haystack[i]
    if (esc) { esc = false; continue }
    if (c === '\\') { esc = true; continue }
    if (c === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return haystack.substring(start, i + 1)
    }
  }
  return null
}

async function callAI(messages: Array<{role: string; content: string}>, maxTokens = 2048) {
  const response = await fetch(CF_WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, max_tokens: maxTokens }),
  });
  if (!response.ok) throw new Error(`AI error: ${response.status}`);
  const data = await response.json();
  return data.content || "";
}

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const TEMPLATES = ['momentum_conservative','mean_reversion_active','composite_balanced','ml_aggressive','risk_parity'] as const
const ALPHA_TYPES = ['momentum','mean_reversion','volatility','volume','composite','ml'] as const

const AgentSpec = z.object({
  name: z.string().min(2).max(80),
  thesis: z.string().min(20).max(400),
  template: z.enum(TEMPLATES),
  alpha_type: z.enum(ALPHA_TYPES),
  alpha_weights: z.object({
    momentum: z.number().min(0).max(1).optional(),
    mean_reversion: z.number().min(0).max(1).optional(),
    volatility: z.number().min(0).max(1).optional(),
    volume: z.number().min(0).max(1).optional(),
  }).optional(),
  symbols: z.array(z.string()).min(2).max(10),
  rebalance_freq: z.enum(['daily','weekly','monthly']),
  risk_aversion: z.number().min(1).max(20),
  max_weight: z.number().min(0.05).max(1),
  forecast_horizon: z.number().int().min(1).max(60),
  signal_scale_bps: z.number().int().min(20).max(500),
  walk_forward: z.boolean(),
  /** Live trading cadence — how often the published agent re-evaluates and posts trades. */
  cadence: z.enum(['5m', '15m', '1h', '2h', '4h', 'daily', 'weekly']).default('1h'),
  start_date: z.string(),
  end_date: z.string(),
  initial_capital: z.number().min(10_000).max(100_000_000).default(1_000_000),
})
export type AgentSpec = z.infer<typeof AgentSpec>

function fallback(prompt: string, today: string, twoYearsAgo: string): AgentSpec {
  return {
    name: prompt.slice(0, 60).replace(/[^a-zA-Z0-9 ]/g, '') || 'Composite Balanced',
    thesis: `Balanced composite agent for "${prompt.slice(0, 80)}". Blends 50% momentum + 30% mean-reversion + 20% volatility signals across BTC/ETH/SOL/BNB/ADA. Daily rebalance targets 200-400 annual trades with Sharpe > 1.0.`,
    template: 'composite_balanced',
    alpha_type: 'composite',
    alpha_weights: { momentum: 0.50, mean_reversion: 0.30, volatility: 0.20 },
    symbols: ['BTC-USD','ETH-USD','SOL-USD','BNB-USD','ADA-USD'],
    rebalance_freq: 'daily',
    risk_aversion: 6,
    max_weight: 0.25,
    forecast_horizon: 10,
    signal_scale_bps: 200,
    walk_forward: false,
    cadence: '1h',
    start_date: twoYearsAgo,
    end_date: today,
    initial_capital: 100_000,
  }
}

/** Deterministic baseline file tree generated from a spec — used when the LLM
 * doesn't return its own `files` payload. Guarantees the Lab always opens with
 * something the user can read, edit, and ship. */
function baselineFiles(spec: AgentSpec): { path: string; content: string }[] {
  const symbolsArr = JSON.stringify(spec.symbols)
  const weightsLit = spec.alpha_weights ? JSON.stringify(spec.alpha_weights, null, 2) : '{}'
  const score = spec.alpha_type === 'momentum'
    ? `return 0.15 * (row.ret5 ?? 0) + 0.35 * (row.ret20 ?? 0)`
    : spec.alpha_type === 'mean_reversion'
    ? `return -0.7 * (row.zscore ?? 0) - 0.3 * (row.rsi != null ? (50 - row.rsi) / 50 : 0)`
    : spec.alpha_type === 'volatility'
    ? `return (row.vol20 ?? 0) > 0.04 ? -(row.ret5 ?? 0) : (row.ret5 ?? 0)`
    : `return 0.4 * (row.ret20 ?? 0) - 0.3 * (row.zscore ?? 0) - 0.3 * (row.rsi != null ? (50 - row.rsi) / 50 : 0)`

  return [
    {
      path: 'spec.json',
      content: JSON.stringify(spec, null, 2),
    },
    {
      path: 'signals.ts',
      content: `// ${spec.name} — signal layer (alpha_type=${spec.alpha_type})
// Universe: ${spec.symbols.join(', ')}
// Scoring runs once per bar per symbol; output feeds the optimizer.
export type FeatureRow = {
  ret5?: number; ret20?: number; zscore?: number; rsi?: number; vol20?: number
}

export const UNIVERSE = ${symbolsArr}
export const ALPHA_WEIGHTS = ${weightsLit}

export function score(row: FeatureRow): number {
  ${score}
}
`,
    },
    {
      path: 'risk.ts',
      content: `// ${spec.name} — risk and sizing layer
// risk_aversion = ${spec.risk_aversion} (lambda; higher = smaller positions)
// max_weight    = ${spec.max_weight} (per-name cap)
export const RISK_AVERSION = ${spec.risk_aversion}
export const MAX_WEIGHT    = ${spec.max_weight}

/** ATR-style position sizing. Returns the fraction of capital to allocate. */
export function size(rawSignal: number, vol20: number): number {
  const target = rawSignal / Math.max(0.01, vol20 * RISK_AVERSION)
  return Math.max(-MAX_WEIGHT, Math.min(MAX_WEIGHT, target))
}

/** Hard kill switch — flatten everything if drawdown exceeds threshold. */
export function killSwitch(currentDrawdownPct: number): boolean {
  return currentDrawdownPct >= 20
}
`,
    },
    {
      path: 'exec.ts',
      content: `// ${spec.name} — execution layer
// Cadence: ${spec.cadence} · Rebalance: ${spec.rebalance_freq}
import { UNIVERSE } from './signals'

export type Order = { symbol: string; side: 'BUY' | 'SELL'; weight: number; price: number }
export type LedgerEntry = Order & { mode: 'paper' | 'live'; executedAt: string; notional: number }

export function execute(orders: Order[], capital: number, mode: 'paper' | 'live' = 'paper'): LedgerEntry[] {
  const now = new Date().toISOString()
  return orders
    .filter(o => UNIVERSE.includes(o.symbol))
    .map(o => ({
      ...o,
      mode,
      executedAt: now,
      notional: capital * o.weight,
    }))
}
`,
    },
    {
      path: 'README.md',
      content: `# ${spec.name}

${spec.thesis}

## Universe
${spec.symbols.map(s => `- ${s}`).join('\n')}

## How it works
This agent uses a **${spec.alpha_type}** alpha layered on top of the \`${spec.template}\` template.
It rebalances ${spec.rebalance_freq} and reposts trades every \`${spec.cadence}\` once published.

- \`signals.ts\` produces a per-symbol score each bar.
- \`risk.ts\` converts the score into a position size, capped at ${(spec.max_weight * 100).toFixed(0)}% per name.
- \`exec.ts\` writes the resulting orders to the paper-trade ledger.

## When it works
Crypto trends with persistent regime structure.

## When it fails
Sudden regime shifts (e.g. macro shocks). The kill switch in \`risk.ts\` halts trading on a ${'>'} 20% drawdown.
`,
    },
  ]
}

const CODEBASE_MAP = `
ASE codebase grounding (the agent runs against THESE files and APIs — do not invent others):
- app/api/quant/run/route.ts        — 9-layer backtest pipeline (this is what runs your spec)
- app/api/quant/agent/compile       — this route (NL → spec)
- app/api/quant/agent/save          — drafts (POST/PATCH/GET)
- app/api/quant/agent/publish       — flips status to published (no gating, paper-trade)
- app/api/quant/agent/tick          — cadence-driven scheduler that posts trades to ledger
- app/api/quant/agent/ledger        — public read of agent_paper_ledger
- app/api/backtest/route.ts         — data fetchers: Binance → CoinGecko → CryptoCompare → Kraken → Yahoo → SYNTHETIC
- lib/quant/strategy.ts             — STRATEGY_TEMPLATES (5 presets), buildStrategyPackage, describeStrategy
- lib/quant/backtester.ts           — quantBacktester.run (returns equityCurve, fills, tearSheet, allocationHistory, signalHistory)
- lib/quant/metrics.ts              — strategyGrade returns {grade, score, breakdown}
- lib/quant/blocks.ts               — drag-drop block catalog (data, indicator, ml, api, risk, execution, signal)
- lib/quant-docs.ts                 — DATA_SOURCES, INDICATORS, RISK_METRICS, STRATEGY_EXAMPLES
- lib/quant/types.ts                — TearSheet, BacktestConfig, AllocationRow, Fill schemas
- supabase/migrations/20260428_ai_agents.sql — drafts table
- supabase/migrations/20260429_agent_ledger.sql — paper-trade ledger
`

const TEAR_SHEET_FIELDS = `
TearSheet fields the backtester emits (use these names if you reference metrics in the thesis):
- cagr, totalReturnPct, annualizedReturnPct, alphaAnnualizedPct (all in %)
- sharpeRatio, sortinoRatio, calmarRatio, informationRatio, recoveryFactor (ratios)
- maxDrawdownPct, avgDrawdownPct, maxDrawdownDurationDays
- annualizedVolPct, downsideVolPct, betaToMarket
- totalTrades, winRate (0..1), profitFactor, avgWinPct, avgLossPct, avgTurnover, avgHoldingDays
- meanIC, icIR, icHitRate (signal quality)
- regimeBreakdown[], walkForward.windows[]
`

function buildSystemPrompt(): string {
  // Lean prompt: small models (Llama-3.1-8B on CF Workers AI) get slow + chatty
  // when the system prompt grows past ~1.5KB. Trim aggressively. We keep only:
  //   1. The output contract (raw JSON, schema)
  //   2. The "guaranteed-trade" parameter grid (the single most-load-bearing rule)
  //   3. The required files array shape
  // Indicator/data-source/metric reference lists were dropped — they were never
  // grounding the model, just slowing it down.
  return `You are a quant strategist for the ASE crypto algo platform. Convert the user's idea into ONE valid AgentSpec JSON that yields 200-500 fills over a 2-year daily backtest.

OUTPUT CONTRACT — read carefully:
- Reply with ONE raw JSON object. NO markdown fences. NO prose before or after. NO code examples in other languages.
- First character of your reply MUST be "{". Last MUST be "}".
- Every scalar field below MUST be a number (not a nested object): risk_aversion, signal_scale_bps, max_weight, forecast_horizon, initial_capital.

Schema (every field required):
{
  "name": string,
  "thesis": string (2-4 sentences explaining the edge),
  "template": "momentum_conservative"|"mean_reversion_active"|"composite_balanced"|"ml_aggressive"|"risk_parity",
  "alpha_type": "momentum"|"mean_reversion"|"volatility"|"volume"|"composite"|"ml",
  "alpha_weights": { "momentum": 0..1, "mean_reversion": 0..1, "volatility": 0..1, "volume": 0..1 },
  "symbols": [string, ...] (3-7 USD-quoted: BTC-USD ETH-USD SOL-USD BNB-USD ADA-USD XRP-USD AVAX-USD DOGE-USD DOT-USD LINK-USD; ALWAYS include BTC-USD and ETH-USD),
  "rebalance_freq": "daily"|"weekly"|"monthly",
  "risk_aversion": number (2..10),
  "max_weight": number (0.15..0.5),
  "forecast_horizon": number (5..20),
  "signal_scale_bps": number (>=150),
  "walk_forward": boolean,
  "cadence": "5m"|"15m"|"1h"|"2h"|"4h"|"daily"|"weekly",
  "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD",
  "initial_capital": 100000
}

PARAMETER GRID — pick the row matching the user's intent (these guarantee non-zero positions AND high trade flow):
  aggressive/active:   risk_aversion=3,  max_weight=0.40, signal_scale_bps=400, rebalance_freq=daily, cadence=15m
  balanced/default:    risk_aversion=5,  max_weight=0.30, signal_scale_bps=250, rebalance_freq=daily, cadence=1h
  conservative/safe:   risk_aversion=8,  max_weight=0.20, signal_scale_bps=180, rebalance_freq=daily, cadence=2h
  weekly/slow:         risk_aversion=7,  max_weight=0.25, signal_scale_bps=180, rebalance_freq=weekly, cadence=4h
  risk-parity:         risk_aversion=4,  max_weight=0.40, signal_scale_bps=200, rebalance_freq=daily, cadence=1h, template=risk_parity

TRADE FLOW REQUIREMENT (non-negotiable):
- The agent MUST trade often. Default to rebalance_freq=daily over 2 years (~504 bars × 3-5 symbols → 1500-2500 fills target).
- Live cadence (post-publish) MUST be 15m, 1h, or 2h — NEVER pick "weekly" or "daily" cadence unless the user EXPLICITLY says "swing" or "long-term".
- Always pick 3-5 symbols. Single-symbol agents are forbidden (kills diversification + trade count).
- thesis MUST mention: "continuously scans" or "evaluates every {cadence}" — the agent is always-on, never idle.

Template guide: composite_balanced (default multi-signal); momentum_conservative (trend); mean_reversion_active (RSI bounce); ml_aggressive (pattern-based); risk_parity (vol-targeted).

alpha_weights: only meaningful when alpha_type="composite"; sum ≤ 1.0; ≥2 non-zero keys. Otherwise omit alpha_weights.

Source files (signals.ts / risk.ts / exec.ts / README.md / spec.json) are generated by the platform from your spec — DO NOT include a "files" field in your reply.

Pseudo-shape (illustrative — produce real values):
{
  "name": "...",
  "thesis": "...",
  ...all spec fields...,
  "files": [
    { "path": "spec.json",   "content": "<the entire spec as pretty JSON>" },
    { "path": "signals.ts",  "content": "<TypeScript: export function score(row): number based on alpha_type>" },
    { "path": "risk.ts",     "content": "<TypeScript: export function size(weight, vol, riskAversion): number using max_weight + ATR sizing>" },
    { "path": "exec.ts",     "content": "<TypeScript: export function execute(orders, mode): ledger entries — TWAP if user mentioned twap, else MARKET>" },
    { "path": "README.md",   "content": "<2-3 paragraph plain-English explanation of the strategy, when it works, when it fails>" }
  ]
}

File content RULES:
- Each file's content must be a complete, runnable file — no placeholders, no "TODO".
- signals.ts and risk.ts must reference actual indicators from the spec (RSI, MACD, Z-score, etc.).
- exec.ts must respect the spec's cadence and max_weight.
- README.md must reference the actual symbols and alpha_type from the spec.
- Keep file paths flat (no nested directories). Use forward slashes only.
- Escape newlines in JSON strings as \\n. Escape quotes as \\". Do NOT use template literals.

The Lab will save these files into the agent's spec.files array so they persist and can be edited.`
}

interface AgentWithFiles {
  agent: AgentSpec
  files?: { path: string; content: string }[]
}

async function compileSpec(prompt: string, prior: Partial<AgentSpec> | undefined, blocks: string[] | undefined, today: string, twoYearsAgo: string): Promise<AgentWithFiles> {
  const blockHints = blocksToHints(blocks ?? [])
  const userMsg = [
    `Today is ${today}. Backtest window: ${twoYearsAgo} → ${today} (start_date / end_date).`,
    blockHints ? `Selected strategy blocks (incorporate their signals): ${blockHints}` : null,
    prior ? `EXISTING agent to refine (keep all fields unless user asks to change them):\n${JSON.stringify(prior, null, 2)}` : null,
    `User request: "${prompt}"`,
    `Remember: risk_aversion MUST be ≤ 10, signal_scale_bps MUST be ≥ 150, rebalance_freq SHOULD be "daily", initial_capital = 100000.`,
    `Output a single raw JSON object. Do NOT wrap it in \`\`\`json fences. Do NOT add commentary, examples in other languages, or trailing prose. The first character of your reply MUST be "{" and the last character MUST be "}". Every scalar field (risk_aversion, signal_scale_bps, max_weight, forecast_horizon, initial_capital) MUST be a number, NOT a nested object.`,
  ].filter(Boolean).join('\n\n')

  let content = '{}'
  try {
    content = await callAI([
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: userMsg },
    ])
  } catch (err) {
    console.warn('[compile] LLM call failed, using baseline:', err)
    const spec = fallback(prompt, today, twoYearsAgo)
    return { agent: spec, files: baselineFiles(spec) }
  }
  const jsonStr = extractJsonObject(content) ?? content
  try {
    const raw = JSON.parse(jsonStr) as Record<string, unknown>
    // Defensive: some models return nested objects/strings for scalar fields.
    if (typeof raw.risk_aversion !== 'number') raw.risk_aversion = 5
    if (typeof raw.signal_scale_bps !== 'number') raw.signal_scale_bps = 250
    if (typeof raw.max_weight !== 'number') raw.max_weight = 0.30
    if (typeof raw.forecast_horizon !== 'number') raw.forecast_horizon = 10
    // Post-parse coercion: clamp toward the always-trading range
    if (typeof raw.risk_aversion === 'number' && raw.risk_aversion > 9) raw.risk_aversion = 9
    if (typeof raw.risk_aversion === 'number' && raw.risk_aversion < 3) raw.risk_aversion = 3
    if (typeof raw.signal_scale_bps === 'number' && raw.signal_scale_bps < 180) raw.signal_scale_bps = 180
    if (typeof raw.max_weight === 'number' && raw.max_weight < 0.20) raw.max_weight = 0.20
    if (typeof raw.initial_capital === 'number' && raw.initial_capital < 50_000) raw.initial_capital = 100_000
    if (!raw.initial_capital) raw.initial_capital = 100_000
    if (!raw.start_date) raw.start_date = twoYearsAgo
    if (!raw.end_date) raw.end_date = today
    // Force fast live cadence — agents must always be scanning.
    const slowCadence = new Set(['daily', 'weekly'])
    if (typeof raw.cadence !== 'string' || slowCadence.has(raw.cadence as string)) raw.cadence = '1h'
    // Force daily rebalance unless the user explicitly chose weekly/monthly via the prompt.
    const wantsSlow = /\b(weekly|monthly|swing|long.?term)\b/i.test(prompt)
    if (!wantsSlow) raw.rebalance_freq = 'daily'
    // Enforce 3-5 symbol minimum (BTC + ETH + at least one alt).
    if (Array.isArray(raw.symbols) && raw.symbols.length < 3) {
      const fillers = ['BTC-USD','ETH-USD','SOL-USD','BNB-USD','ADA-USD']
      const cur = new Set(raw.symbols.filter((s): s is string => typeof s === 'string'))
      for (const f of fillers) {
        if (cur.size >= 3) break
        cur.add(f)
      }
      raw.symbols = Array.from(cur)
    }
    // Merge with fallback for any missing fields, then validate
    const merged = { ...fallback(prompt, today, twoYearsAgo), ...raw }
    const parsed = AgentSpec.safeParse(merged)
    const spec = parsed.success ? parsed.data : AgentSpec.parse(merged)

    let llmFiles: { path: string; content: string }[] = []
    if (Array.isArray(raw.files)) {
      llmFiles = raw.files.filter((f): f is { path: string; content: string } => {
        if (typeof f !== 'object' || f === null) return false
        const obj = f as Record<string, unknown>
        return typeof obj.path === 'string' && typeof obj.content === 'string'
      })
    }

    // Merge: LLM-provided files win on path collision, baseline fills the rest.
    const baseline = baselineFiles(spec)
    const seen = new Set(llmFiles.map(f => f.path))
    const files = [...llmFiles, ...baseline.filter(f => !seen.has(f.path))]
    return { agent: spec, files }
  } catch {
    const spec = fallback(prompt, today, twoYearsAgo)
    return { agent: spec, files: baselineFiles(spec) }
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as {
    prompt?: string
    prior?: Partial<AgentSpec>
    blocks?: string[]
    stream?: boolean
  }
  if (!body.prompt || body.prompt.length < 4) {
    return NextResponse.json({ error: 'prompt required (min 4 chars)' }, { status: 400 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const twoYearsAgo = new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10)

  // Non-streaming path
  if (!body.stream) {
    try {
      const result = await compileSpec(body.prompt, body.prior, body.blocks, today, twoYearsAgo)
      return NextResponse.json({ agent: result.agent, rationale: result.agent.thesis, files: result.files })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'compile failed'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  // SSE streaming path
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      try {
        send('status', { stage: 'analyzing', message: 'Reading your prompt and selected blocks…' })
        await new Promise(r => setTimeout(r, 50))
        send('status', { stage: 'planning', message: 'Mapping intent to a strategy template…' })
        const agent = await compileSpec(body.prompt!, body.prior, body.blocks, today, twoYearsAgo)
        send('status', { stage: 'validating', message: `Validated ${agent.agent.symbols.length} symbols, alpha=${agent.agent.alpha_type}, template=${agent.agent.template}` })
        send('agent', { agent: agent.agent, rationale: agent.agent.thesis, files: agent.files })
        send('done', { ok: true })
      } catch (err) {
        send('error', { message: err instanceof Error ? err.message : 'compile failed' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  })
}
