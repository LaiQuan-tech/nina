// Gemini 影像生成（原生 REST，零 SDK）。
// 呼叫形狀已實測可用：x-goog-api-key header + responseModalities:["IMAGE"]
// + generationConfig.imageConfig.aspectRatio（實測 3:4→896×1200、4:3→1200×896），
// 回傳在 candidates[0].content.parts[].inlineData.data（base64 JPEG）。
// 這個檔案刻意零相依（不 import supabase / next），scripts/ 也能直接用。

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const DEFAULT_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image";

export class ImageGenError extends Error {}

export type GeneratedImage = { bytes: Buffer; mimeType: string; model: string; attempts: number };

type Part = { inlineData?: { data?: string; mimeType?: string } };
type GeminiImageResponse = {
  promptFeedback?: { blockReason?: string };
  candidates?: Array<{ content?: { parts?: Part[] }; finishReason?: string }>;
};

async function once(prompt: string, aspect: string | undefined, model: string, apiKey: string) {
  const generationConfig: Record<string, unknown> = { responseModalities: ["IMAGE"] };
  if (aspect) generationConfig.imageConfig = { aspectRatio: aspect };

  const res = await fetch(`${BASE}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ImageGenError(`http_${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as GeminiImageResponse;
  if (data.promptFeedback?.blockReason) {
    // 安全阻擋是內容問題，重試沒有意義
    throw new ImageGenError(`blocked_${data.promptFeedback.blockReason}`);
  }

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p) => p.inlineData?.data);
  if (!img?.inlineData?.data) {
    // 這是可重試的：實測影像模型偶爾會回 finishReason 而不給圖
    throw new ImageGenError(`no_image_${data.candidates?.[0]?.finishReason ?? "unknown"}`);
  }
  return { bytes: Buffer.from(img.inlineData.data, "base64"), mimeType: img.inlineData.mimeType || "image/jpeg" };
}

/**
 * 生成一張圖。可重試（no_image 這種空回應偶爾會發生），
 * 安全阻擋與 4xx 不重試。maxAttempts 預設 4；後台單張重生應壓到 2 以免超過 serverless 上限。
 */
export async function generateImage(opts: {
  prompt: string;
  aspect?: string;
  model?: string;
  maxAttempts?: number;
  onAttempt?: (n: number, err?: string) => void;
}): Promise<GeneratedImage> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ImageGenError("gemini_not_configured");

  const model = opts.model || DEFAULT_IMAGE_MODEL;
  const max = opts.maxAttempts ?? 4;
  let last = "";

  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      opts.onAttempt?.(attempt);
      const r = await once(opts.prompt, opts.aspect, model, apiKey);
      return { ...r, model, attempts: attempt };
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
      const fatal = last.startsWith("blocked_") || /^http_4\d\d/.test(last);
      opts.onAttempt?.(attempt, last);
      if (fatal || attempt === max) break;
      await new Promise((r) => setTimeout(r, Math.min(2000 * attempt, 12000)));
    }
  }
  throw new ImageGenError(last || "generate_failed");
}

export function imageGenConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}
