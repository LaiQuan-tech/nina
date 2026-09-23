import { NextResponse } from "next/server";
import { getWorkOrder, isWorkOrderReadOnly, updateWorkOrder } from "@/lib/workOrders";
import { validateWorkOrderPatch } from "@/lib/workOrderValidation";
import { authorizeAdminRequest } from "@/lib/admin/adminRequest";
import { getAdminById } from "@/lib/adminUsers";
import { recordManualStationOverride } from "@/lib/workOrderScans";
import type { StationKey } from "@/lib/workOrder/barcode";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const order = await getWorkOrder(params.id);
  if (!order) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, order });
}

// PATCH { ...editableFields } → 更新工單手動欄位（客戶電話 / 聯絡人 / 接稿人 等）
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await authorizeAdminRequest(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const existing = await getWorkOrder(params.id);
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (isWorkOrderReadOnly(existing)) {
    return NextResponse.json({ ok: false, error: "demo_read_only" }, { status: 403 });
  }

  const patch = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const validation = validateWorkOrderPatch(patch);
  if (!validation.ok) {
    return NextResponse.json({ ok: false, error: "validation_failed", errors: validation.errors }, { status: 400 });
  }

  const order = await updateWorkOrder(params.id, validation.values);
  if (!order) return NextResponse.json({ ok: false, error: "update_failed" }, { status: 400 });

  // 手動改「目前站別」時補一筆 work_order_events（note='後台手動指定'），讓事件保持唯一
  // 真相來源——下次掃描重算 deriveOrderProgress 才不會把這次手動指定的結果吃掉。
  // 只在「真的改變」且新值是合法站別字串時補（表單每次儲存都會整包送出全部 20 個欄位，
  // 沒有這個「真的改變」判斷會變成每次存檔都誤記一筆站別異動；station 被改回空值/清空
  // 則不補——work_order_events.station 是 not null + check 限制，本來就塞不進「清空」事件，
  // 讓 work_orders.station 直接變 null 即可，見 lib/workOrderScans.ts 的函式註解）。
  const nextStation = validation.values.station;
  if (typeof nextStation === "string" && nextStation !== existing.station) {
    const admin = await getAdminById(auth.adminId);
    await recordManualStationOverride({
      workOrderId: params.id,
      station: nextStation as StationKey,
      adminId: auth.adminId,
      adminName: admin?.name || admin?.email || null,
    }).catch((err) => console.error("[admin/order PATCH] recordManualStationOverride threw:", err));
  }

  return NextResponse.json({ ok: true, order });
}
