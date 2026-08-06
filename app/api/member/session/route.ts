import { NextResponse } from "next/server";
import { getSessionMember } from "@/lib/memberSession";
import { toPublicMember } from "@/lib/members";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 目前登入狀態。**刻意不放進 middleware matcher** —— 未登入時回 200 + member:null，
 * 而不是 401。這樣前端把「沒登入」當成正常狀態處理，不必去解讀錯誤碼。
 */
export async function GET() {
  const member = await getSessionMember();
  return NextResponse.json({ ok: true, member: member ? toPublicMember(member) : null });
}
