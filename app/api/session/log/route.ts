import { NextResponse } from "next/server";
import { logSessionMessages, type IntakeMessage } from "@/lib/intakeSessions";

export const runtime = "nodejs";

// POST { sessionId, messages } → 更新案件對話紀錄（客戶端每回合呼叫）
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { sessionId?: string; messages?: IntakeMessage[] };
  const { sessionId, messages } = body;
  if (!sessionId || !Array.isArray(messages)) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  await logSessionMessages(sessionId, messages);
  return NextResponse.json({ ok: true });
}
