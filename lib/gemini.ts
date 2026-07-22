const MODEL = "gemini-3.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export type GeminiOpts = {
  system?: string;
  maxTokens?: number;
  temperature?: number;
};

export type ChatTurn = { role: "user" | "model"; text: string };

export class GeminiError extends Error {}

/**
 * 多輪對話（關閉 thinking 以免吃掉輸出預算）。回傳純文字。
 * 只保留最後 12 turns。無 GEMINI_API_KEY 時 throw，呼叫端 fallback 用純文字訊息。
 */
export async function callGeminiChat(turns: ChatTurn[], opts: GeminiOpts = {}): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("gemini_not_configured");

  const body: Record<string, unknown> = {
    contents: turns.slice(-12).map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    generationConfig: {
      temperature: opts.temperature ?? 0.5,
      maxOutputTokens: opts.maxTokens ?? 500,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };

  const res = await fetch(`${ENDPOINT}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new GeminiError(`http_${res.status}`);
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
  if (!text) throw new GeminiError("empty");
  return text;
}

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}
