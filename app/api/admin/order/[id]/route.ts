import { NextResponse } from "next/server";
import { getWorkOrder, isWorkOrderReadOnly, updateWorkOrder } from "@/lib/workOrders";
import { validateWorkOrderPatch } from "@/lib/workOrderValidation";
import { authorizeAdminRequest } from "@/lib/admin/adminRequest";

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
  return NextResponse.json({ ok: true, order });
}
