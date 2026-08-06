import { NextResponse } from "next/server";
import { authorizeAdminRequest } from "@/lib/admin/adminRequest";
import { createFollowup } from "@/lib/admin/customerKnowledge";
import { validateFollowupInput } from "@/lib/admin/customerKnowledgeView";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await authorizeAdminRequest(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const validation = validateFollowupInput(await req.json().catch(() => null), "create");
  if (!validation.ok) return NextResponse.json({ ok: false, error: validation.error, message: "回訪資料格式不正確" }, { status: 400 });
  const value = validation.value;
  const followup = await createFollowup({
    memberId: value.member_id!,
    title: value.title!,
    reason: value.reason,
    priority: value.priority!,
    assignee: value.assignee,
    dueAt: value.due_at!,
  });
  if (!followup) return NextResponse.json({ ok: false, error: "not_found", message: "找不到 Demo 客戶" }, { status: 404 });
  return NextResponse.json({ ok: true, followup }, { status: 201 });
}
