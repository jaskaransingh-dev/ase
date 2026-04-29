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
    thesis: `Fallback composite-balanced agent for "${prompt.slice(0, 80)}". Diversified momentum + mean-reversion blend.`,
    template: 'composite_balanced',
    alpha_type: 'composite',
    alpha_weights: { momentum: 0.45, mean_reversion: 0.30, volatility: 0.15, volume: 0.10 },
    symbols: ['BTC-USD','ETH-USD','SOL-USD','BNB-USD','ADA-USD'],
    rebalance_freq: 'daily',
    risk_aversion: 8,
    max_weight: 0.25,
    forecast_horizon: 10,
    signal_scale_bps: 100,
    walk_forward: false,
    cadence: '1h',
    start_date: twoYearsAgo,
    end_date: today,
    initial_capital: 100_000,
  }
}

function buildSystemPrompt(): string {
  const dataLines = DATA_SOURCES.slice(0, 8).map(s => `- ${s.name} (${s.id}): ${s.description.slice(0, 90)}`).join('\n')
  const indLines = INDICATORS.slice(0, 10).map(i => `- ${i.abbrev}: ${i.signals[0] || ''}`).join('\n')
  const metLines = RISK_METRICS.slice(0, 8).map(m => `- ${m.abbrev} (${m.name}): good ${m.goodRange}`).join('\n')

  return `You are a senior quant strategist for the ASE crypto algo platform. Convert a user's natural-language strategy idea into a complete, runnable agent spec.

CRITICAL: Output ONLY a single JSON object. No markdown fences, no prose, no explanation.

JSON Schema:
{
  "name": string,
  "thesis": string (1-3 sentences explaining the edge),
  "template": "momentum_conservative" | "mean_reversion_active" | "composite_balanced" | "ml_aggressive" | "risk_parity",
  "alpha_type": "momentum" | "mean_reversion" | "volatility" | "volume" | "composite" | "ml",
  "alpha_weights": { "momentum": 0.X, "mean_reversion": 0.X, "volatility": 0.X, "volume": 0.X }  // only if composite
  "symbols": ["BTC-USD","ETH-USD",...] (2-10 Yahoo crypto tickers),
  "rebalance_freq": "daily" | "weekly" | "monthly",
  "risk_aversion": 1-20 (aggressive=2-4, balanced=6-10, conservative=12-18),
  "max_weight": 0.05-1.0,
  "forecast_horizon": 1-60,
  "signal_scale_bps": 20-500,
  "walk_forward": boolean,
  "cadence": "5m" | "15m" | "1h" | "2h" | "4h" | "daily" | "weekly",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "initial_capital": 10000-100000000
}

Cadence guidelines (how often the live agent will run):
- 5m / 15m: short-term mean-reversion, scalping ideas
- 1h / 2h: intraday momentum, vol breakouts (default for most)
- 4h / daily: swing trades, trend-following
- weekly: long-horizon, low-turnover momentum/risk-parity

Template selection:
- momentum_conservative: trend-following, weekly, low turnover
- mean_reversion_active: contrarian / oversold, daily
- composite_balanced: multi-signal blend (default fallback)
- ml_aggressive: ML/pattern style
- risk_parity: vol-targeted, equal-risk

Available data (informational, do NOT include in output):
${dataLines}

Available indicators:
${indLines}

Risk metrics targeted:
${metLines}

Always emit at least 3 crypto symbols unless user explicitly limits. Use Yahoo tickers ending in -USD.`
}

async function compileSpec(prompt: string, prior: Partial<AgentSpec> | undefined, blocks: string[] | undefined, today: string, twoYearsAgo: string): Promise<AgentSpec> {
  const blockHints = blocksToHints(blocks ?? [])
  const userMsg = [
    `Today is ${today}. Default backtest window: ${twoYearsAgo} → ${today}.`,
    blockHints || null,
    prior ? `Refine this current agent (don't reset unless the user clearly asks):\n${JSON.stringify(prior)}` : null,
    `User request:\n${prompt}\n\nRespond with ONLY the JSON object. No markdown.`,
  ].filter(Boolean).join('\n\n')

  const completion = await client.chat.completions.create({
    model: 'qwen2.5-coder:7b',
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: userMsg },
    ],
    temperature: 0.4,
    max_tokens: 1200,
  })
  const content = completion.choices[0]?.message?.content ?? '{}'
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  const jsonStr = start >= 0 && end > start ? content.substring(start, end + 1) : content
  try {
    const raw = JSON.parse(jsonStr)
    const parsed = AgentSpec.safeParse(raw)
    if (parsed.success) return parsed.data
    // Coerce missing fields
    return AgentSpec.parse({ ...fallback(prompt, today, twoYearsAgo), ...raw })
  } catch {
    return fallback(prompt, today, twoYearsAgo)
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
      const agent = await compileSpec(body.prompt, body.prior, body.blocks, today, twoYearsAgo)
      return NextResponse.json({ agent, rationale: agent.thesis })
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
        send('status', { stage: 'validating', message: `Validated ${agent.symbols.length} symbols, alpha=${agent.alpha_type}, template=${agent.template}` })
        send('agent', { agent, rationale: agent.thesis })
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
