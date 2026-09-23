import { NextResponse } from "next/server";
import { getWorkOrder, isWorkOrderReadOnly } from "@/lib/workOrders";
import { createAdminSupabase } from "@/lib/supabase";
import { authorizeAdminRequest } from "@/lib/admin/adminRequest";
import { pushWorkOrderToFtp } from "@/lib/ftp/push";

// 手動重推可能要等一次完整 FTP 連線＋上傳（見 lib/ftp/push.ts 的 20s 連線逾時），
// 沿用縮圖端點的慣例給足 60s（見 app/api/admin/order/[id]/thumbnail/route.ts）。
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST → 後台「重推 NAS」按鈕：先把 ftp_status 標回 pending、清 tries（即使這次同步呼叫
 * 逾時或連線中斷，下一輪 Cron 還是會撿到這筆繼續重試），接著當場同步呼叫一次
 * pushWorkOrderToFtp——手動觸發要讓人立刻在畫面上看到成敗，不像 Cron 那樣非同步跑完才知道。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await authorizeAdminRequest(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const order = await getWorkOrder(params.id);
  if (!order) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (isWorkOrderReadOnly(order)) {
    return NextResponse.json({ ok: false, error: "demo_read_only" }, { status: 403 });
  }

  const db = createAdminSupabase();
  if (!db) return NextResponse.json({ ok: false, error: "db_not_configured" }, { status: 502 });

  const baseMeta = (order.ftp_meta ?? {}) as Record<string, unknown>;

  const { error: resetErr } = await db
    .from("work_orders")
    .update({ ftp_status: "pending", ftp_meta: { ...baseMeta, tries: 0 } })
    .eq("id", order.id);
  if (resetErr) console.error("[admin/order/ftp-retry] 標回 pending 失敗:", resetErr.message);

  try {
    const result = await pushWorkOrderToFtp(order);
    const { error } = await db
      .from("work_orders")
      .update({
        ftp_status: "ok",
        ftp_path: result.remotePath,
        ftp_meta: { ...baseMeta, tries: 0, pushed_at: new Date().toISOString(), last_error: null },
      })
      .eq("id", order.id);
    if (error) console.error("[admin/order/ftp-retry] 標記成功失敗:", error.message);
    return NextResponse.json({ ok: true, ftp_status: "ok" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[admin/order/ftp-retry] 推送失敗 (${order.id}):`, message);
    const { error } = await db
      .from("work_orders")
      .update({
        ftp_status: "failed",
        ftp_meta: { ...baseMeta, tries: 1, last_error: message, last_try_at: new Date().toISOString() },
      })
      .eq("id", order.id);
    if (error) console.error("[admin/order/ftp-retry] 記錄失敗狀態失敗:", error.message);
    return NextResponse.json({ ok: false, ftp_status: "failed", error: message }, { status: 502 });
  }
}
