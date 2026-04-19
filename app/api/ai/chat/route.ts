import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://127.0.0.1:11434/v1",
  apiKey: "ollama",
});

export async function POST(req: Request) {
  const { message } = await req.json();

  const completion = await client.chat.completions.create({
    model: "qwen2.5-coder:7b",
    messages: [
      { role: "system", content: "You are ASE's local quant assistant." },
      { role: "user", content: message },
    ],
  });

  return Response.json({
    reply: completion.choices[0]?.message?.content ?? "",
  });
}