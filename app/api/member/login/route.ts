import { NextResponse } from "next/server";
import { toPublicMember, touchLastLogin, verifyMemberLogin, claimSession } from "@/lib/members";
import { clearMemberCookie, setMemberCookie } from "@/lib/memberSession";

export const runtime = "nodejs";

// POST { phone, password, remember?, sessionId? } → 登入
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    phone?: string;
    password?: string;
    remember?: boolean;
    sessionId?: string;
  };
  if (!body.phone?.trim() || !body.password) {
    return NextResponse.json({ ok: false, error: "missing_fields", message: "請輸入手機與密碼" }, { status: 400 });
  }

  const member = await verifyMemberLogin(body.phone, body.password);
  if (!member) {
    // 帳號不存在與密碼錯誤回同一種結果，避免被用來探測哪些手機註冊過
    await new Promise((r) => setTimeout(r, 300));
    return NextResponse.json(
      { ok: false, error: "bad_credentials", message: "手機或密碼不正確" },
      { status: 401 }
    );
  }

  if (body.sessionId) await claimSession(body.sessionId, member.id);
  await touchLastLogin(member.id);
  const cookieOk = await setMemberCookie(member, body.remember !== false);
  if (!cookieOk) {
    return NextResponse.json({ ok: false, error: "session_unavailable", message: "系統設定不完整" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, member: toPublicMember(member) });
}

// DELETE → 登出
export async function DELETE() {
  clearMemberCookie();
  return NextResponse.json({ ok: true });
}
