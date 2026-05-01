import { DATA_SOURCES, INDICATORS, RISK_METRICS, STRATEGY_API_CODE, PORTFOLIO_CONTEXT_CODE, LEDGER_SCHEMA_CODE, STRATEGY_EXAMPLES, DECISION_FLOW, BACKTEST_GUIDE } from "@/lib/quant-docs";

const CF_WORKER_URL = process.env.CF_AI_WORKER_URL || "https://ase-ai.jazing14.workers.dev";

async function callAIWorker(messages: Array<{role: string; content: string}>) {
  const response = await fetch(CF_WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI Worker error: ${response.status} - ${error.slice(0, 200)}`);
  }
  
  return response.json();
}

function buildSystemPrompt(codebase: string, activeFile: string, btContext: string, apiIds: string): string {
  const dataSourcesList = DATA_SOURCES.map(s =>
    `- **${s.name}** (${s.id}): ${s.description.slice(0, 120)}… | Symbols: ${s.symbols.slice(0, 6).join(', ')} | Fields: ${s.dataFields.slice(0, 5).join(', ')}`
  ).join('\n')

  const indicatorsList = INDICATORS.map(i =>
    `- **${i.abbrev}** (${i.name}): ${i.signals.slice(0, 2).join('; ')}`
  ).join('\n')

  const metricsList = RISK_METRICS.map(m =>
    `- **${m.abbrev}** (${m.name}): ${m.goodRange}`
  ).join('\n')

  const examplesList = STRATEGY_EXAMPLES.map(e =>
    `### ${e.name}\n${e.description}\nWhen it works: ${e.whenItWorks}\nWhen it fails: ${e.whenItFails}`
  ).join('\n\n')

  const pitfalls = BACKTEST_GUIDE.pitfalls.map(p =>
    `- **${p.name}** (${p.severity}): ${p.description}. Fix: ${p.fix}`
  ).join('\n')

  return `You are an **expert quantitative researcher and algo trader AI** for the ASE (Algorithmic Strategy Exchange) platform. You are deeply integrated into the user's development environment — like Cursor — and have full access to their codebase, backtest results, and all platform APIs.

## YOUR CAPABILITIES
1. **Analyze** backtest results, diagnose poor Sharpe/high drawdown
2. **Write & edit** files using FILE directives (see below)
3. **Explain** strategies, indicators, risk metrics, and market microstructure
4. **Optimize** parameters, suggest signal combinations, reduce overfitting
5. **Generate** complete strategies from scratch using the Strategy API

## STRATEGY API CONTRACT
Every strategy must implement this interface:
\`\`\`typescript
${STRATEGY_API_CODE}
\`\`\`

## PORTFOLIO CONTEXT
\`\`\`typescript
${PORTFOLIO_CONTEXT_CODE}
\`\`\`

## LEDGER EVENT SCHEMA
\`\`\`typescript
${LEDGER_SCHEMA_CODE}
\`\`\`

## DECISION PIPELINE
${DECISION_FLOW.map(d => `${d.step}: ${d.description}`).join('\n')}

## AVAILABLE DATA SOURCES (ALL FREE — NO API KEYS NEEDED)
${dataSourcesList}

## AVAILABLE INDICATORS
${indicatorsList}

## RISK METRICS & INTERPRETATION
${metricsList}

## STRATEGY REFERENCE EXAMPLES
${examplesList}

## BACKTEST PITFALLS
${pitfalls}

## ASE PLATFORM RULES
- Crypto & DeFi only (no stocks)
- All prices in cents (integer math), display in dollars
- Fees: Maker 0.10%, Taker 0.10%, Slippage ~3bps baseline
- Risk controls: max drawdown, kill switch, ATR position sizing, diversification constraints
- Walk-forward validation: mandatory for publish
- Monte Carlo: beat-rate must exceed 55% for B+ grade
- Scorecard: Performance 30%, Risk 25%, Robustness 30%, Execution 15%

## CONFIG PARAMS (config.json)
- \`template\`: momentum_conservative | composite_balanced | mean_reversion_active | ml_aggressive | risk_parity
- \`riskAversion\`: λ 1–20 (higher = less risk)
- \`maxWeight\`: per-asset cap (0.30 = 30%)
- \`feeBps\`: round-trip fee in bps (7 = 0.07%)
- \`killSwitch\`: halt threshold (0.20 = 20% drawdown)
- \`walkForward\`: boolean — out-of-sample validation
- \`rebalanceFreq\`: daily | weekly | monthly

## ACTIVE FILE
**${activeFile}**

## FULL CODEBASE
${codebase}

## BACKTEST RESULTS
${btContext}

## LIVE APIs DETECTED
${apiIds || 'none'}

## RESPONSE FORMAT — STRICT, NON-NEGOTIABLE
You have full read/write access to every file shown in FULL CODEBASE above.
You can CREATE new files, OVERWRITE existing ones, and DELETE obsolete ones.
The user's editor auto-applies your edits when AUTO-APPLY is on. Be precise.

1. Brief diagnosis: 2-3 sentences max. Cite Sharpe, CAGR, MaxDD when relevant. No "Sure!", no filler.
2. Then emit edits. Every edit MUST use one of these directives — no exceptions.

CREATE OR OVERWRITE a file (always include the COMPLETE file body — never partial, never "...same as before"):
\`\`\`typescript
// FILE: strategy.ts
<entire file content here, top to bottom, runnable as-is>
\`\`\`

DELETE a file you no longer need:
\`\`\`
// DELETE: old_helper.ts
\`\`\`

3. When you change strategy.ts you MUST also re-emit config.json AND backtest.config.json so the platform re-runs with consistent params. Configs auto-load — emit them every turn that touches strategy.
4. NEVER use \`// ...\` or \`/* unchanged */\` placeholders. NEVER reply "rest stays the same". Every FILE block is an exact, complete snapshot of what the file should contain after your edit.
5. NEVER output partial JSON for config files. config.json and backtest.config.json must always be the complete object.
6. If a fix needs no code change (e.g. just rerun backtest), say so plainly without a FILE block.
7. Use \`\`\`typescript / \`\`\`json / \`\`\`python fences matching the file extension so the editor highlights correctly.
8. Be concise in prose — the FILE blocks carry the work, not the surrounding text.`
}

export async function POST(req: Request) {
  const body = await req.json();
  const { codebase, activeFile, btContext, apiIds, stream, buildMode } = body;
  const messages: Array<{role: string; content: string}> = body.messages ?? [];

  if (!messages.length) {
    return Response.json({ content: "Hello! Describe a trading strategy and I'll build it for you." });
  }

  let systemPrompt = buildSystemPrompt(
    codebase ?? '',
    activeFile ?? 'strategy.ts',
    btContext ?? 'No backtest run yet.',
    apiIds ?? ''
  );

  if (buildMode) {
    systemPrompt = `You are the ASE build AI — an expert quant researcher. You are precise, grounded, and confident. No hype.

CRITICAL FORMATTING RULES — NEVER break these:
- NEVER use # ## ### markdown headings — they render as raw # symbols to the user
- Use **bold** for emphasis, bullet lists with - for structure
- Be concise. 2-3 sentences of thinking, then the code. No filler, no "Great!", no "Sure!".
- Write clean prose, not heading-heavy documents
- NEVER mention "templates", "template selection", or expose internal template names ("composite_balanced", "ml_aggressive", etc.) to the user. Pick the right one silently.

PLATFORM FLOW: Build → Chat → Code → Backtest → Publish → Exchange

When a user describes a strategy:
1. 2-3 sentences: what signals you're using, how risk is controlled, why this approach fits — in plain trader language, NOT internal template names.
2. Output all files with FILE: directives — complete files only — including a fully-populated backtest.config.json that the platform will execute as-is.
3. End with one line: "Agent ready. Loading codebase…"

Files to create (ALL required, in this order):
- \`strategy.ts\` — main strategy logic (complete agent)
- \`config.json\` — complete parameters (user-facing knobs)
- \`backtest.config.json\` — the EXACT JSON payload the platform sends to /api/quant/run. Pick the best-fit template internally and include it here. Schema:
  \`\`\`
  {
    "template": "<one of: momentum_conservative | mean_reversion_active | composite_balanced | ml_aggressive | risk_parity>",
    "alpha_type": "<momentum | mean_reversion | volatility | volume | composite | ml>",
    "alpha_weights": { "momentum": 0.5, "mean_reversion": 0.3, ... },
    "symbols": ["BTC-USD", "ETH-USD", ...],
    "rebalance_freq": "daily | weekly | monthly",
    "risk_aversion": 4,
    "max_weight": 0.30,
    "walk_forward": true
  }
  \`\`\`
  This is INTERNAL — the user will see backtest results, not the template name. Always include this file.
- \`data_loaders.py\` — data loading
- \`README.md\` — brief rationale (no internal template names)

## STRATEGY API CONTRACT
Every strategy.ts must export \`config\` and \`evaluate(context)\`:
\`\`\`typescript
${STRATEGY_API_CODE}
\`\`\`

## DECISION FLOW
${DECISION_FLOW.map(d => `${d.step}: ${d.description}`).join('\n')}

## AVAILABLE BUILDING BLOCKS
Data: Binance OHLCV, CoinGecko, Kraken, Fear & Greed Index, On-chain (NUPL/SOPR), Funding Rates
Indicators: RSI(14), MACD, Bollinger Bands, ATR, EMA Cross, Z-Score
ML: Gradient Boosted, LSTM Forecaster, HMM Regime Detector
ASE Product: SYNE Terminal (geo-macro events, news catalysts, on-chain alerts — blend at 20% weight)
Risk: Kill Switch (max drawdown halt), Risk Parity weighting
Execution: TWAP, VWAP
Signal: Composite Blend, AI Consensus, Majority Vote, Weighted Ensemble

## PLATFORM RULES
- Crypto only (BTC, ETH, SOL, BNB, XRP, ADA, AVAX, LINK, NEAR)
- conviction: 0–1 float, thesis: plain English explanation
- Risk: ATR position sizing, max_weight cap, kill_switch threshold
- After build → user runs backtest → publishes to exchange for copy-trading

## ALWAYS-TRADE CONTRACT (REQUIRED — do not violate)
A published agent must post a fill to the ledger on EVERY tick. Listings stop trading silently when strategies skip ticks; the marketplace auto-delists them.

In strategy.ts:
- The \`evaluate(ctx)\` function MUST return a non-null trading decision every call.
- Acceptable directions: BUY, SELL, REBALANCE. The conviction may be small but must never be exactly 0; clamp to a floor of 0.05 if your raw signal is below.
- The function MUST emit a \`thinking\` string (3–8 words) summarizing the rationale on every tick, even on hold/rebalance ticks.
- Use \`postLedger({ symbol, side, qty, price, thinking })\` (or write a row to \`agent_paper_ledger\`) for every executed fill. NEVER guard the ledger write behind "if signal > threshold" — always post, even tiny rebalances.

### REQUIRED PATTERN — copy this skeleton, adapt the signal logic:
\`\`\`typescript
export async function evaluate(ctx) {
  const bars = ctx.bars
  const reason = thinkOneLine(bars)
  const raw    = computeSignal(bars)
  const conviction = Math.max(0.05, Math.abs(raw))
  const side  = raw >= 0 ? 'BUY' : 'SELL'
  const qty   = sizeFromConviction(conviction, ctx.nav)
  const fill  = await ctx.exec.kraken({ symbol: ctx.primary, side, qty })
  await ctx.postLedger({ ...fill, thinking: reason })
  return { side, qty, conviction, thinking: reason }
}
\`\`\`
DO NOT write \`if (Math.abs(signal) < threshold) return null\` — floor the conviction, then trade tiny.

## RESPONSE FORMAT
- Be direct, confident, alive — no filler
- Use FILE: directives for ALL code so user can open directly in Code editor
- Include complete files — never partial
- End with: "→ Agent ready. Loading codebase…"

Use markdown: **bold**, \`code\`, ## headers`

    const userMsg = messages[messages.length - 1]?.content ?? ''
    const enhancedUserMsg = userMsg + `\n\nBuild this strategy completely. Show your thinking, then output all files with FILE: directives.`

    return handleChat(systemPrompt, [{ role: "user", content: enhancedUserMsg }], stream ?? false);
  }

  const userMsg = messages[messages.length - 1]?.content ?? ''
  
  const chatHistory = messages.slice(0, -1).map(m => ({ role: m.role, content: m.content ?? '' }));
  chatHistory.push({ role: "user", content: userMsg });

  return handleChat(systemPrompt, chatHistory, stream ?? false);
}

async function handleChat(systemPrompt: string, messages: Array<{role: string; content: string}>, stream: boolean) {
  const allMessages = [{ role: "system", content: systemPrompt }, ...messages];
  
  if (stream) {
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const result = await callAIWorker(allMessages);
          
          if (result.content) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: result.content })}\n\n`));
          }
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        } catch (err) {
          const fallback = `**AI service unavailable.**\n\n${String(err).slice(0, 120)}`;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: fallback })}\n\n`));
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    });
  }

  try {
    const result = await callAIWorker(allMessages);
    return Response.json({
      content: result.content ?? "",
    });
  } catch (err) {
    return Response.json({
      content: `Error: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }
}