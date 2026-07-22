import { NextResponse } from "next/server";
import { getWorkOrder, updateWorkOrder } from "@/lib/workOrders";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const order = await getWorkOrder(params.id);
  if (!order) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, order });
}

// PATCH { ...editableFields } → 更新工單手動欄位（客戶電話 / 聯絡人 / 接稿人 等）
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const patch = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const order = await updateWorkOrder(params.id, patch);
  if (!order) return NextResponse.json({ ok: false, error: "update_failed" }, { status: 400 });
  return NextResponse.json({ ok: true, order });
}
