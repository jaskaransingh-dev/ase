/**
 * POST /api/quant/agent/compile
 *
 * Streaming SSE: NL prompt + selected blocks + codebase context → AgentSpec.
 * Emits typed events: status, partial, agent, error, done.
 *
 * Body: { prompt, prior?, blocks?: string[], stream?: boolean }
 */

import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { z } from 'zod'
import { DATA_SOURCES, INDICATORS, RISK_METRICS } from '@/lib/quant-docs'
import { blocksToHints } from '@/lib/quant/blocks'

const client = new OpenAI({
  baseURL: 'http://127.0.0.1:11434/v1',
  apiKey: 'ollama',
})

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
  const dataLines = DATA_SOURCES.slice(0, 12).map(s => `- ${s.name} (${s.id}): ${s.description.slice(0, 100)} | symbols: ${s.symbols.slice(0,5).join(', ')}`).join('\n')
  const indLines = INDICATORS.slice(0, 14).map(i => `- ${i.abbrev} (${i.name}): ${i.signals.slice(0,2).join('; ')}`).join('\n')
  const metLines = RISK_METRICS.slice(0, 10).map(m => `- ${m.abbrev} (${m.name}): good range ${m.goodRange}`).join('\n')

  return `You are a senior quant strategist at ASE, an institutional-grade crypto algo platform. Your job: convert a user's natural-language strategy idea into a complete, valid AgentSpec JSON that will produce a real backtest with 200-500 trades over the 2-year window.

CRITICAL: Output ONLY a single JSON object. No markdown fences, no prose, no explanation. The JSON must be on one line or formatted plainly.

JSON Schema (ALL fields required):
{
  "name": string (short, memorable, e.g. "BTC/ETH Momentum Blend"),
  "thesis": string (2-4 sentences: what edge, why it works, expected cadence),
  "template": "momentum_conservative" | "mean_reversion_active" | "composite_balanced" | "ml_aggressive" | "risk_parity",
  "alpha_type": "momentum" | "mean_reversion" | "volatility" | "volume" | "composite" | "ml",
  "alpha_weights": { "momentum": 0.X, "mean_reversion": 0.X, "volatility": 0.X, "volume": 0.X },
  "symbols": ["BTC-USD","ETH-USD","SOL-USD","BNB-USD","ADA-USD"],
  "rebalance_freq": "daily",
  "risk_aversion": 6,
  "max_weight": 0.25,
  "forecast_horizon": 10,
  "signal_scale_bps": 200,
  "walk_forward": false,
  "cadence": "1h",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "initial_capital": 100000
}

═══════════════════════════════════════════════════════
  !! TRADE GENERATION RULES — READ CAREFULLY !!
═══════════════════════════════════════════════════════
The backtester runs daily bars over 2 years (~504 bars).
To produce 200-500 fills the optimizer must take non-trivial positions.
These parameter combinations GUARANTEE trades:

  ALWAYS use rebalance_freq = "daily" unless user explicitly asks for weekly/monthly.
  ALWAYS set signal_scale_bps >= 150 (this scales return forecasts fed to the optimizer).
  ALWAYS set risk_aversion <= 10 for crypto (crypto vol is ~80% annualized; higher λ zeros all positions).
  ALWAYS set max_weight >= 0.15 (anything lower makes positions too tiny to trigger trades).
  NEVER set risk_aversion > 12 — the optimizer will flatten everything to 0%.
  NEVER set signal_scale_bps < 80 — forecasts will be too small for the optimizer to act.
  initial_capital MUST be 100000 (six-figure minimum for the optimizer to produce sensible lot sizes).

PARAMETER GRID — pick the row matching the user's intent:
  User says "aggressive / active":  risk_aversion=4,  max_weight=0.35, signal_scale_bps=300, rebalance_freq="daily"
  User says "balanced / default":   risk_aversion=6,  max_weight=0.25, signal_scale_bps=200, rebalance_freq="daily"
  User says "conservative / safe":  risk_aversion=9,  max_weight=0.20, signal_scale_bps=150, rebalance_freq="daily"
  User says "weekly / slow":        risk_aversion=8,  max_weight=0.25, signal_scale_bps=150, rebalance_freq="weekly"
  User says "risk-parity":          risk_aversion=4,  max_weight=0.40, signal_scale_bps=150, rebalance_freq="weekly", template="risk_parity"
═══════════════════════════════════════════════════════

Template selection guide:
- composite_balanced  → multi-signal, default for anything not clearly one alpha type
- momentum_conservative → trend-following, weekly, low-turnover
- mean_reversion_active → contrarian / RSI oversold bounce, daily
- ml_aggressive         → ML pattern-based, daily, higher turnover
- risk_parity           → vol-targeted equal-risk allocation

Cadence (live paper-trade frequency after publish, NOT backtest resolution):
- 5m / 15m → scalping, mean-reversion ideas
- 1h / 2h  → intraday momentum, vol breakouts (DEFAULT)
- 4h / daily → swing, trend-following
- weekly    → low-turnover momentum / risk-parity

alpha_weights rules (ONLY when alpha_type = "composite"):
- weights must sum to ≤ 1.0
- always include at least 2 non-zero keys from: momentum, mean_reversion, volatility, volume
- example: { "momentum": 0.50, "mean_reversion": 0.30, "volatility": 0.20 }

${CODEBASE_MAP}
${TEAR_SHEET_FIELDS}

Available data sources (informational):
${dataLines}

Available indicators (informational):
${indLines}

Risk metrics reference:
${metLines}

GROUNDING RULES:
1. Symbols must end in -USD. Supported: BTC, ETH, SOL, BNB, ADA, XRP, AVAX, DOGE, DOT, LINK, UNI, ATOM, LTC, MATIC.
2. Always include BTC-USD and ETH-USD as the two largest liquid assets.
3. 3-7 symbols is optimal for diversification; more than 8 dilutes signal.
4. thesis must reference the alpha_type and explain the market mechanism (e.g. "momentum persists in crypto over 20-day windows due to trend-following behavior of retail traders").
5. Do NOT invent new data sources, indicators, or fields not listed above.
6. walk_forward should be false unless user explicitly asks for walk-forward validation (it significantly slows the backtest).

MULTI-FILE AGENT OUTPUT (REQUIRED):
You MUST also emit a "files" array containing the agent's source tree. The Lab opens these files
in an editor as soon as the user lands. ALWAYS include exactly these four files:

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
    `Output ONLY valid JSON. No markdown. No comments. No explanation.`,
  ].filter(Boolean).join('\n\n')

  let content = '{}'
  try {
    const completion = await client.chat.completions.create({
      model: 'qwen2.5-coder:7b',
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: userMsg },
      ],
      temperature: 0.3,
      max_tokens: 1400,
    })
    content = completion.choices[0]?.message?.content ?? '{}'
  } catch (err) {
    // Ollama unreachable / network error / model crash → fall back to deterministic baseline.
    console.warn('[compile] LLM call failed, using baseline:', err)
    const spec = fallback(prompt, today, twoYearsAgo)
    return { agent: spec, files: baselineFiles(spec) }
  }
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  const jsonStr = start >= 0 && end > start ? content.substring(start, end + 1) : content
  try {
    const raw = JSON.parse(jsonStr) as Record<string, unknown>
    // Post-parse coercion: clamp parameters to the guaranteed-trade range
    // These guardrails ensure the optimizer will always produce non-zero weights
    if (typeof raw.risk_aversion === 'number' && raw.risk_aversion > 10) raw.risk_aversion = 10
    if (typeof raw.risk_aversion === 'number' && raw.risk_aversion < 2) raw.risk_aversion = 2
    if (typeof raw.signal_scale_bps === 'number' && raw.signal_scale_bps < 150) raw.signal_scale_bps = 150
    if (typeof raw.max_weight === 'number' && raw.max_weight < 0.15) raw.max_weight = 0.15
    if (typeof raw.initial_capital === 'number' && raw.initial_capital < 50_000) raw.initial_capital = 100_000
    if (!raw.initial_capital) raw.initial_capital = 100_000
    if (!raw.start_date) raw.start_date = twoYearsAgo
    if (!raw.end_date) raw.end_date = today
    // Merge with fallback for any missing fields, then validate
    const merged = { ...fallback(prompt, today, twoYearsAgo), ...raw }
    const parsed = AgentSpec.safeParse(merged)
    const spec = parsed.success ? parsed.data : AgentSpec.parse(merged)

    let llmFiles: { path: string; content: string }[] = []
    if (Array.isArray(raw.files)) {
      llmFiles = raw.files.filter((f): f is { path: string; content: string } => {
        return typeof f === 'object' && f !== null && 'path' in f && 'content' in f
          && typeof (f as any).path === 'string' && typeof (f as any).content === 'string'
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
