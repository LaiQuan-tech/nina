import { NextResponse } from "next/server";
import { parseFilename } from "@/lib/filename/parser";
import { uploadPrintFile } from "@/lib/storage";
import { createWorkOrder } from "@/lib/workOrders";
import { resolveProductForOrder } from "@/lib/productLookup";
import { markSessionSubmitted } from "@/lib/intakeSessions";
import { getSessionMember } from "@/lib/memberSession";
import { kickThumbnail } from "@/lib/thumbnail/kick";
import { pushAndRecordByOrderId } from "@/lib/ftp/push";
import { waitUntil } from "@vercel/functions";

export const runtime = "nodejs";
// 回應送出後，waitUntil 裡的背景縮圖（PDFium＋sharp）與 FTP 推檔都還算在這次呼叫的時限內：明訂 60 秒
// （跟產圖端點、FTP 重推／Cron 一致），不依賴平台預設值。⚠️ 縮圖產圖租約（lib/thumbnail/policy.ts
// THUMBNAIL_LEASE_MS=90 秒）必須長於這個值；要調大這裡，租約也要跟著調。
export const maxDuration = 60;

const MAX_BYTES = 50 * 1024 * 1024; // 50MB

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
  if (file.size > MAX_BYTES) {
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

  // 用檔名末段商品碼查 ERP 商品主檔，一次帶出護貝膜/油墨類別/列印方式/版材（soft：查不到仍收檔）
  const product = await resolveProductForOrder(parsed.segments.spec, parsed.segments.productName);

  // 會員身分一律從 cookie 取，不接受前端傳進來的 memberId
  const member = await getSessionMember();

  let orderId: string;
  try {
    const created = await createWorkOrder(parsed.segments, file.name, path, product, sessionId, member?.id ?? null);
    orderId = created.id;
  } catch (err) {
    console.error("[upload] createWorkOrder failed:", err);
    return NextResponse.json({ ok: false, error: "db_failed" }, { status: 502 });
  }

  // 縮圖與 FTP 是兩個獨立的背景工作：各自一個 waitUntil、同時起跑，誰都不等誰，任一方失敗都只記 log，
  // 不影響另一方、也不影響下面給客人的回應。

  // 縮圖產製不擋收檔：用 waitUntil 在回應後於背景可靠執行（以前是 `void kickThumbnail()`，
  // 回應一送出就被 Vercel 砍掉，縮圖幾乎都沒產出，全堆到後台第一次開工單時同步產）。
  // kickThumbnail 永不 reject；開工前會先搶產圖租約，同事同時開工單頁也只會有一邊真的產。
  // 沒產成的，工單詳情頁會掛 client 元件補產。
  waitUntil(kickThumbnail(orderId));

  // FTP 推檔不擋收檔：用 waitUntil 在回應後於背景可靠執行（Vercel 不會像一般 fire-and-forget
  // 那樣把它砍掉），客人立刻看到「送件成功」、檔案背景推上 NAS。pushAndRecordByOrderId 設計上永不
  // throw（這裡再包一層 catch 保險），任何失敗都只落 ftp_status 供每日 Cron 與後台「重推」補。
  // Hobby 方案 Cron 只能每日，所以即時推主要靠這裡；Cron 是補漏網。
  waitUntil(
    pushAndRecordByOrderId(orderId).catch((err) => {
      console.error("[upload] background ftp push failed:", err);
    })
  );

  // 更新案件狀態（成功件數 +1）
  if (sessionId) await markSessionSubmitted(sessionId, file.name);

  // 客戶端只需知道「送件成功」+ 檔名，**不**回傳任何工單資訊
  return NextResponse.json({ ok: true, fileName: file.name });
}
