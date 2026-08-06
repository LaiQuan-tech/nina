import { NextResponse } from "next/server";
import { getSessionMember } from "@/lib/memberSession";
import { setMemberCookie } from "@/lib/memberSession";
import { getMemberById, setMemberPassword, toPublicMember } from "@/lib/members";

export const runtime = "nodejs";

/**
 * guest 升級成 active。憑既有 cookie 就好，不需再驗身分 ——
 * 能拿著這個 cookie 的本來就是同一個人在同一台裝置上操作。
 * 設完密碼之後，客戶換手機也能登入查訂單。
 */
export async function POST(req: Request) {
  const me = await getSessionMember();
  if (!me) {
    return NextResponse.json({ ok: false, error: "unauthorized", message: "請先登入" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { password?: string };
  const password = body.password ?? "";
  if (password.length < 6) {
    return NextResponse.json({ ok: false, error: "weak_password", message: "密碼至少 6 碼" }, { status: 400 });
  }

  const ok = await setMemberPassword(me.id, password);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "update_failed", message: "設定失敗，請稍後再試" }, { status: 502 });
  }

  // status 從 guest 變成 active，cookie 內的 status 要跟著更新
  const fresh = await getMemberById(me.id);
  if (fresh) await setMemberCookie(fresh, true);
  return NextResponse.json({ ok: true, member: fresh ? toPublicMember(fresh) : null });
}
