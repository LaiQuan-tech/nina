// Route handler / server component 讀寫會員 cookie 的共用小工具。
// 用 next/headers 的 cookies()，Node runtime 專用（middleware 走 lib/memberAuth 的純 Web Crypto 版）。
import { cookies } from "next/headers";
import { MEMBER_COOKIE, MEMBER_COOKIE_MAX_AGE, createMemberToken, readMemberToken } from "@/lib/memberAuth";
import { getMemberById, type Member } from "@/lib/members";

/** 從 cookie 取出目前登入的會員；沒登入／token 失效／帳號被停用一律回 null。 */
export async function getSessionMember(): Promise<Member | null> {
  const secret = process.env.MEMBER_SESSION_SECRET;
  if (!secret) return null;
  const token = cookies().get(MEMBER_COOKIE)?.value;
  if (!token) return null;
  const session = await readMemberToken(token, secret);
  if (!session) return null;
  const member = await getMemberById(session.sub);
  if (!member || member.status === "disabled") return null;
  return member;
}

/** 種 cookie。remember=false 時不設 maxAge → 關瀏覽器就失效。 */
export async function setMemberCookie(member: Member, remember = true): Promise<boolean> {
  const secret = process.env.MEMBER_SESSION_SECRET;
  if (!secret) {
    console.error("[member] MEMBER_SESSION_SECRET 未設定，無法簽發會員 session");
    return false;
  }
  const token = await createMemberToken(secret, { id: member.id, phone: member.phone, status: member.status });
  cookies().set(MEMBER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(remember ? { maxAge: MEMBER_COOKIE_MAX_AGE } : {}),
  });
  return true;
}

export function clearMemberCookie(): void {
  cookies().set(MEMBER_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
