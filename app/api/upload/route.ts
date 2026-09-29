import { NextResponse } from "next/server";
import { parseFilename } from "@/lib/filename/parser";
import { uploadPrintFile } from "@/lib/storage";
import { MAX_UPLOAD_BYTES } from "@/lib/upload/limits";
import { finalizeUpload } from "@/lib/upload/server";

export const runtime = "nodejs";
// 回應送出後，waitUntil 裡的背景縮圖（PDFium＋sharp）與 FTP 推檔都還算在這次呼叫的時限內：明訂 60 秒
// （跟產圖端點、FTP 重推／Cron 一致），不依賴平台預設值。⚠️ 縮圖產圖租約（lib/thumbnail/policy.ts
// THUMBNAIL_LEASE_MS=90 秒）必須長於這個值；要調大這裡，租約也要跟著調。
export const maxDuration = 60;

// ⚠️ 舊版收檔路由：檔案整包 POST 進函式。Vercel 函式請求主體上限 4.5MB（平台層擋、函式根本不會執行），
// 所以這條路實際只收得了 < 4.5MB 的檔。現行前端已改走直傳（/api/upload/ticket → PUT Supabase →
// /api/upload/complete，上限 10MB）；這支保留給部署當下還開著舊頁面的客人，存檔後的邏輯與 complete 共用。
//
// POST multipart(file, sessionId) → 伺服器端「再驗一次」parser（唯一真相，永不信任前端）
// → 存 Storage → 建工單(關到案件) → 更新案件狀態 → 回客戶「送件成功」（不回工單資訊）
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_form" }, { status: 400 });
  }
  const file = form.get("file");
  const sessionId = (form.get("sessionId") as string | null)?.trim() || null;
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "no_file" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
  }

  // ★ 伺服器端重驗檔名 —— 收檔的唯一守門
  const parsed = parseFilename(file.name);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: "bad_filename", result: parsed }, { status: 422 });
  }

  const bytes = await file.arrayBuffer();
  const path = await uploadPrintFile(file.name, bytes, file.type);
  if (!path) {
    return NextResponse.json({ ok: false, error: "storage_failed" }, { status: 502 });
  }

  // 存檔後：查 ERP 商品 → cookie 會員 → 建工單 → 背景縮圖／FTP（waitUntil）→ 案件成功件數 +1（與直傳共用）
  const done = await finalizeUpload({ parsed, fileName: file.name, storagePath: path, sessionId });
  if (!done.ok) {
    return NextResponse.json({ ok: false, error: done.error }, { status: 502 });
  }

  // 客戶端只需知道「送件成功」+ 檔名，**不**回傳任何工單資訊
  return NextResponse.json({ ok: true, fileName: file.name });
}
