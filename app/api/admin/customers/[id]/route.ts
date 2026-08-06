import { NextResponse } from "next/server";
import { authorizeAdminRequest } from "@/lib/admin/adminRequest";
import { updateCustomerProfile } from "@/lib/admin/customerKnowledge";
import { validateCustomerProfilePatch } from "@/lib/admin/customerKnowledgeView";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await authorizeAdminRequest(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => null);
  const validation = validateCustomerProfilePatch(body);
  if (!validation.ok) return NextResponse.json({ ok: false, error: validation.error, message: "客戶樣貌資料格式不正確" }, { status: 400 });
  const profile = await updateCustomerProfile(params.id, validation.value);
  if (!profile) return NextResponse.json({ ok: false, error: "not_found", message: "找不到 Demo 客戶" }, { status: 404 });
  return NextResponse.json({ ok: true, profile });
}
