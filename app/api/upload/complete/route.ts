import { NextResponse } from "next/server";
import { completeDirectUpload } from "@/lib/upload/flow";
import { completeDeps } from "@/lib/upload/server";

export const runtime = "nodejs";
// 回應送出後，waitUntil 裡的背景縮圖（PDFium＋sharp）與 FTP 推檔都還算在這次呼叫的時限內：明訂 60 秒
// （跟舊 /api/upload、產圖端點、FTP 重推／Cron 一致），不依賴平台預設值。⚠️ 縮圖產圖租約（lib/thumbnail/policy.ts
// THUMBNAIL_LEASE_MS=90 秒）必須長於這個值；要調大這裡，租約也要跟著調。
export const maxDuration = 60;

// POST { ticket, sessionId } → 驗票（簽章、效期）→ 冪等（同一個 storage 路徑已建過工單就直接回 ok）
// → 確認 Storage 物件真的在、大小 ≤ 上限且與票券相符 → 建工單(關到案件) → 背景縮圖／FTP → 更新案件狀態。
// 回應與舊 /api/upload 相同：客戶端只拿到「送件成功」+ 檔名，**不**回傳任何工單資訊。
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const result = await completeDirectUpload(body, completeDeps());
  return NextResponse.json(result.body, { status: result.status });
}
