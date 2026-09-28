import { NextResponse } from "next/server";
import { getWorkOrder, isWorkOrderReadOnly } from "@/lib/workOrders";
import { signedPrintUrl } from "@/lib/storage";

export const runtime = "nodejs";
// ⚠️ 一定要有：這個 module 只有 GET、又沒讀 cookies()/req，Next 14 會把它當成可快取的路由（revalidate 預設 false），
// supabase-js 的查詢連簽名 URL 的 POST 都會被存進 Data Cache 一年——10 分鐘後同一張單再按下載，拿到的是
// 快取裡早已過期的簽名（Supabase 回 400 InvalidJWT）。`dynamic = "force-dynamic"` 在 14.2 擋不住這件事。
// （lib/supabase.ts 的 createAdminSupabase 也已預設 no-store，這裡是第二道保險。）
export const revalidate = 0;

// GET → 產生限時簽名網址後轉址下載（bucket 維持私有，不對外公開）。
// 本路由位於 /api/admin/* 之下，已由 middleware 保護：未登入回 401。
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const order = await getWorkOrder(params.id);
  if (!order) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (isWorkOrderReadOnly(order)) {
    return NextResponse.json({ ok: false, error: "demo_read_only" }, { status: 403 });
  }
  if (!order.storage_path) {
    return NextResponse.json({ ok: false, error: "no_file" }, { status: 404 });
  }

  // 以原始檔名（含中文）下載，效期 10 分鐘
  const url = await signedPrintUrl(order.storage_path, 600, order.file_name);
  if (!url) {
    return NextResponse.json({ ok: false, error: "sign_failed" }, { status: 502 });
  }
  return NextResponse.redirect(url);
}
