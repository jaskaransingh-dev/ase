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
  const { messages, codebase, activeFile, btContext, apiIds, stream } = await req.json();

  const systemPrompt = buildSystemPrompt(
    codebase ?? '',
    activeFile ?? 'strategy.ts',
    btContext ?? 'No backtest run yet.',
    apiIds ?? ''
  );

  const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...messages.filter((m: { role: string }) => m.role !== 'system'),
  ];

  if (stream) {
    const completion = await client.chat.completions.create({
      model: "qwen2.5-coder:7b",
      messages: chatMessages,
      stream: true,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        } catch (err) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`));
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

  const completion = await client.chat.completions.create({
    model: "qwen2.5-coder:7b",
    messages: chatMessages,
  });

  return Response.json({
    content: completion.choices[0]?.message?.content ?? "",
  });
}