import { NextResponse } from "next/server";
import { authorizeAdminRequest } from "@/lib/admin/adminRequest";
import { getWorkOrder, isWorkOrderReadOnly } from "@/lib/workOrders";
import { canClaimThumbnail, isThumbnailInProgress } from "@/lib/thumbnail/policy";
import { thumbnailGenerateResponse } from "@/lib/thumbnail/response";

// PDFium 渲染＋sharp 轉檔可能要跑幾秒，給足時間（沿用手動補圖端點的慣例）。
// ⚠️ 產圖租約（policy.ts THUMBNAIL_LEASE_MS=90 秒）必須長於這個值；要調大這裡，租約也要跟著調。
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST → 替還沒有縮圖的工單補產一次（工單詳情頁的 ThumbnailAutoGenerate 元件掛載後呼叫，產生中會輪詢）。
 * 以前這件事在工單詳情頁的渲染路徑上同步做（首開 3~4 秒），現在頁面先回、縮圖在這裡背景補。
 *
 * 規則與收檔時的背景產圖同一份（lib/thumbnail/policy.ts、job.ts）：開工前先搶租約，搶不到（別人正在產）
 * 就回 inProgress，不會自己再產一份；已有縮圖／終態／開工滿上限都不會再跑。產圖模組只在真的要產時才 dynamic import。
 * 回應只反映已寫進 DB 的狀態：{ ok, status, hasThumbnail, inProgress, retryable, reason? }
 *   inProgress=true → 別人正在產，前端稍後再問；retryable=false → 不會再自動重試（已成功、不支援、太大或開工次數用完）。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await authorizeAdminRequest(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const order = await getWorkOrder(params.id);
  if (!order) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (isWorkOrderReadOnly(order)) {
    return NextResponse.json({ ok: false, error: "demo_read_only" }, { status: 403 });
  }

  let body = thumbnailGenerateResponse({ row: order, inProgress: isThumbnailInProgress(order), confirmed: true });
  if (canClaimThumbnail(order)) {
    const { ensureThumbnail } = await import("@/lib/thumbnail/generate");
    body = thumbnailGenerateResponse(await ensureThumbnail(order));
  }

  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
