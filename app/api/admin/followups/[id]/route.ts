import { NextResponse } from "next/server";
import { authorizeAdminRequest } from "@/lib/admin/adminRequest";
import { updateFollowup } from "@/lib/admin/customerKnowledge";
import { followupCompletionPatch, validateFollowupInput } from "@/lib/admin/customerKnowledgeView";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await authorizeAdminRequest(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const validation = validateFollowupInput(await req.json().catch(() => null), "update");
  if (!validation.ok) return NextResponse.json({ ok: false, error: validation.error, message: "回訪資料格式不正確" }, { status: 400 });
  const patch: Record<string, unknown> = {
    ...validation.value,
    ...followupCompletionPatch(validation.value.status ?? undefined),
  };
  const followup = await updateFollowup(params.id, patch);
  if (!followup) return NextResponse.json({ ok: false, error: "not_found", message: "找不到 Demo 回訪" }, { status: 404 });
  return NextResponse.json({ ok: true, followup });
}
