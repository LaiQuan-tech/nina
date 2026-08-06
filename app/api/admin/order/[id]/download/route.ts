import { NextResponse } from "next/server";
import { getWorkOrder, isWorkOrderReadOnly } from "@/lib/workOrders";
import { signedPrintUrl } from "@/lib/storage";

export const runtime = "nodejs";

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
