const CF_WORKER_URL = process.env.CF_AI_WORKER_URL || "https://ase-ai.jazing14.workers.dev";

// 4 diverse strategy ideas — used for the rotating "TRY" chips on the Build
// page empty state. Pure thesis lines, no implementation. The chip click
// pre-fills the textarea so the build prompt feels alive.
export async function GET() {
  try {
    const response = await fetch(CF_WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: `You are an expert crypto quant. Produce 4 fresh, diverse trading-strategy theses.

Rules:
- Each line: ONE specific, executable thesis with assets, signal, timeframe, exit rule (10–25 words).
- Span styles: momentum, mean-reversion, regime/macro, multi-factor.
- Keep risk levels varied — conservative to aggressive.
- The agent generated from this thesis MUST trade on every tick (always-trade contract). Avoid ideas that imply long flat periods (e.g. "only trade once a month at FOMC"). Prefer rotating, rebalancing, or tight-stop ideas that tick continuously.
- Output ONLY a raw JSON array of 4 strings — no prose, no markdown, no \`\`\` fences.`,
          },
          {
            role: "user",
            content: "Generate 4 diverse trading strategy one-liners for crypto.",
          },
        ],
      }),
    });

    if (!response.ok) {
      return Response.json({ error: "AI request failed" }, { status: 500 });
    }

    const data = await response.json();
    return Response.json({ suggestions: data.content });
  } catch {
    return Response.json({ error: "Failed to generate suggestions" }, { status: 500 });
  }
}
