import { NextResponse } from "next/server";
import { claimSession, createActiveMember, toPublicMember, touchLastLogin } from "@/lib/members";
import { setMemberCookie } from "@/lib/memberSession";

export const runtime = "nodejs";

const MESSAGES: Record<string, string> = {
  invalid_phone: "手機號碼不正確",
  invalid_name: "請填寫姓名",
  weak_password: "密碼至少 6 碼",
  phone_exists: "這支手機已經註冊過，請直接登入",
  db_unavailable: "系統忙碌，請稍後再試",
};

// POST { phone, name, password, email?, company?, sessionId? } → 自助註冊並直接登入
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    phone?: string;
    name?: string;
    password?: string;
    email?: string;
    company?: string;
    sessionId?: string;
  };

  const res = await createActiveMember({
    phone: body.phone ?? "",
    name: body.name ?? "",
    password: body.password ?? "",
    email: body.email,
    company: body.company,
  });

  if (!res.ok) {
    const status = res.error === "phone_exists" ? 409 : res.error === "db_unavailable" ? 503 : 400;
    return NextResponse.json(
      { ok: false, error: res.error, message: MESSAGES[res.error] ?? "註冊失敗" },
      { status }
    );
  }

  if (body.sessionId) await claimSession(body.sessionId, res.member.id);
  await touchLastLogin(res.member.id);
  const cookieOk = await setMemberCookie(res.member, true);
  if (!cookieOk) {
    return NextResponse.json({ ok: false, error: "session_unavailable", message: "系統設定不完整" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, member: toPublicMember(res.member) });
}
