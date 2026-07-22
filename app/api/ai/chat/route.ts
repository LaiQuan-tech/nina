import { NextResponse } from "next/server";
import { callGeminiChat, geminiConfigured, type ChatTurn } from "@/lib/gemini";
import { guidanceFromErrors } from "@/lib/filename/parser";
import type { ParseResult } from "@/lib/filename/types";

export const runtime = "nodejs";

const SYSTEM = `你是印刷廠的線上收稿助理，講繁體中文、語氣親切簡潔。
你的任務：客戶上傳的印刷檔「檔名格式不正確」，你要根據系統標記的錯誤，一步步引導客戶把檔名改對，改好後再拖檔進來。

檔名正確格式（依序，用底線 _ 分成三段）：
  流水號_{(付款別)客戶名稱}_(類別)日期案主代碼案名尺寸材質-數量規格.副檔名
正確範例：
  069871_{(月匯)百陽廣告}_(78)20260625WG星雲AI地板90x100cmpvc+霧-1CCPVC720N10M.ai

規則：
- 只針對系統標記錯誤的段落給修改建議，不要質疑正確的段落。
- 若能從現有檔名推斷出「改好後的完整檔名」，直接附上讓客戶複製。
- 回覆控制在 4 行內，不要長篇大論，結尾請客戶改好後再上傳一次。
- 不要編造客戶沒提供的資訊（例如你不知道正確的客戶名稱時，用括號提示他填）。`;

// POST { fileName, result, history? } → { ok, reply }
// 把 parser 的錯誤潤飾成親切引導。未設 GEMINI_API_KEY 或呼叫失敗 → fallback 用內建純文字。
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    fileName?: string;
    result?: ParseResult;
    history?: ChatTurn[];
  };
  const { fileName, result } = body;

  if (!result || result.ok) {
    return NextResponse.json({ ok: true, reply: "檔名格式正確 ✅ 收檔中…" });
  }

  const fallback = guidanceFromErrors(result);
  if (!geminiConfigured()) {
    return NextResponse.json({ ok: true, reply: fallback, source: "fallback" });
  }

  const errorList = result.errors.map((e, i) => `${i + 1}. ${e.message}`).join("\n");
  const userMsg = `客戶上傳的檔名：「${fileName ?? result.raw}」
系統標記的錯誤：
${errorList}
請引導客戶修正。`;

  try {
    const turns: ChatTurn[] = [...(body.history ?? []), { role: "user", text: userMsg }];
    const reply = await callGeminiChat(turns, { system: SYSTEM });
    return NextResponse.json({ ok: true, reply, source: "gemini" });
  } catch {
    return NextResponse.json({ ok: true, reply: fallback, source: "fallback" });
  }
}
