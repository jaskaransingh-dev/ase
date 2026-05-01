import OpenAI from "openai";
import { DATA_SOURCES, INDICATORS, RISK_METRICS, STRATEGY_API_CODE, PORTFOLIO_CONTEXT_CODE, LEDGER_SCHEMA_CODE, STRATEGY_EXAMPLES, DECISION_FLOW, BACKTEST_GUIDE } from "@/lib/quant-docs";

const client = new OpenAI({
  baseURL: "http://127.0.0.1:11434/v1",
  apiKey: "ollama",
});

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

## RESPONSE FORMAT — CRITICAL RULES
1. **Always** use markdown: **bold**, *italic*, \`code\`, ## headers, bullet lists
2. Explain **why** before showing code — diagnose the problem first
3. When suggesting file changes, use the FILE directive so users can one-click apply:

\`\`\`typescript
// FILE: strategy.ts
[complete file content — ALWAYS include the FULL file, never partial]
\`\`\`

4. For config changes:
\`\`\`json
// FILE: config.json
{ ... }
\`\`\`

5. **NEVER output partial files** — always include complete file contents
6. Cite specific metrics (Sharpe, CAGR, MaxDD) when analyzing backtest results
7. If Sharpe < 1.0, diagnose root cause before suggesting fixes
8. Be concise — no filler text, no "Sure!" or "Great question!" prefixes
9. When multiple files need changes, output ALL of them with FILE directives`
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

## RESPONSE FORMAT
- Be direct, confident, alive — no filler
- Show your thinking before code (brief but genuine)
- Use FILE: directives for ALL code so user can open directly in Code editor
- Include complete files — never partial
- End with: "→ Agent ready. Loading codebase…"

Use markdown: **bold**, \`code\`, ## headers`

    const userMsg = messages[messages.length - 1]?.content ?? ''
    const enhancedUserMsg = userMsg + `\n\nBuild this strategy completely. Show your thinking, then output all files with FILE: directives.`

    const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: enhancedUserMsg },
    ]

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const completion = await client.chat.completions.create({
            model: "qwen2.5-coder:7b",
            messages: chatMessages,
            temperature: 0.4,
            max_tokens: 3000,
            stream: true,
          })
          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content
            if (content) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`))
            }
          }
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
          controller.close()
        } catch (err) {
          const fallback = `**Initializing local AI...**\n\nStart Ollama: \`ollama serve\` then \`ollama pull qwen2.5-coder:7b\`\n\nError: ${String(err).slice(0, 120)}`
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: fallback })}\n\n`))
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
          controller.close()
        }
      },
    })
    return new Response(readable, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    })
  }

  const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...messages.filter((m: { role: string }) => m.role !== 'system').map((m: { role: string; content: string }) => ({
      role: m.role === 'user' ? 'user' as const : 'assistant' as const,
      content: m.content ?? '',
    })),
  ];

  if (stream) {
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const completion = await client.chat.completions.create({
            model: "qwen2.5-coder:7b",
            messages: chatMessages,
            stream: true,
          });
          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        } catch (err) {
          // Ollama unreachable or any other LLM failure — emit a graceful message
          // instead of dropping the connection silently.
          const fallback = `**The local AI engine is not reachable.**\n\nStart Ollama with \`ollama serve\` and pull the model with \`ollama pull qwen2.5-coder:7b\`, then retry.\n\n_Original error: ${String(err).slice(0, 200)}_`;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: fallback })}\n\n`));
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  try {
    const completion = await client.chat.completions.create({
      model: "qwen2.5-coder:7b",
      messages: chatMessages,
    });
    return Response.json({
      content: completion.choices[0]?.message?.content ?? "",
    });
  } catch (err) {
    return Response.json({
      content: `The local AI engine is not reachable. Start Ollama (\`ollama serve\` + \`ollama pull qwen2.5-coder:7b\`) and retry.\n\nOriginal error: ${String(err).slice(0, 200)}`,
      offline: true,
    });
  }
}