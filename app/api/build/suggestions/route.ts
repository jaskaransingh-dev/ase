import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://127.0.0.1:11434/v1",
  apiKey: "ollama",
});

export async function GET() {
  try {
    const completion = await client.chat.completions.create({
      model: "qwen2.5-coder:7b",
      messages: [
        {
          role: "system",
          content: `You are an expert quantitative trader. Generate 4 diverse crypto trading strategy ideas as one-line theses.

RULES:
- Be specific: include assets, indicators, timeframes, risk controls
- Mix different styles: momentum, mean-reversion, regime-based, multi-factor
- Vary risk levels: conservative to aggressive
- Each should be 10-25 words
- Output ONLY a JSON array of 4 strings, no explanation, no markdown`,
        },
        {
          role: "user",
          content: "Generate 4 diverse trading strategy one-liners for crypto.",
        },
      ],
      temperature: 0.9,
    });

    const content = completion.choices[0]?.message?.content?.trim() ?? "";
    
    let suggestions: string[] = [];
    
    try {
      suggestions = JSON.parse(content);
      if (!Array.isArray(suggestions) || suggestions.length !== 4) {
        throw new Error("Invalid format");
      }
    } catch {
      const lines = content.split("\n").filter(l => l.trim().length > 10);
      suggestions = lines.slice(0, 4).map(l => l.replace(/^[-*\d.]+\s*/, "").replace(/^["']|["']$/g, ""));
    }

    return Response.json({ suggestions });
  } catch (err) {
    return Response.json(
      { 
        error: "Failed to generate suggestions",
        fallback: [
          "Buy top 3 crypto by 20-day momentum, risk-parity weighted, daily rebalance",
          "Mean-revert BTC and ETH when RSI dips below 28, 1h cadence",
          "Composite blend: 60% momentum + 40% mean-reversion across 5 large caps",
          "Aggressive growth on SOL, AVAX, DOT — hourly rebalance with kill switch"
        ]
      },
      { status: 500 }
    );
  }
}