const CF_WORKER_URL = "https://ase-ai.jazing14.workers.dev";

export async function GET() {
  try {
    const response = await fetch(CF_WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
      }),
    });

    if (!response.ok) {
      return Response.json({ error: "AI request failed" }, { status: 500 });
    }

    const data = await response.json();
    return Response.json({ suggestions: data.content });
  } catch (error) {
    return Response.json({ error: "Failed to generate suggestions" }, { status: 500 });
  }
}