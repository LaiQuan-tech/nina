import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_COOKIE, verifySessionToken } from "@/lib/adminAuth";
import { MEMBER_COOKIE, verifyMemberToken } from "@/lib/memberAuth";

/**
 * 兩道獨立閘門：
 *   後台 /admin/*、/api/admin/*   → nina_admin  + ADMIN_SESSION_SECRET
 *   會員 /member/*、/api/member/* → mei_member  + MEMBER_SESSION_SECRET
 * 兩邊 secret 不同、token payload 的 aud 也不同，互相不能冒用。
 * 兩者皆 fail-closed：未過 → 頁面導向各自的登入頁、API 回 401。
 */

// 會員區裡不需要登入就能打的端點（自己會處理未登入的情況）
const PUBLIC_MEMBER_APIS = new Set([
  "/api/member/session", // 永遠回 200 + member:null，給前端判斷登入狀態
  "/api/member/quick-start", // 無痛入會，這支本身就是「還沒登入」時用的
  "/api/member/login",
  "/api/member/register",
]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // ── 會員分支 ──
  if (pathname === "/member" || pathname.startsWith("/member/") || pathname.startsWith("/api/member/")) {
    if (PUBLIC_MEMBER_APIS.has(pathname)) return NextResponse.next();

    const token = req.cookies.get(MEMBER_COOKIE)?.value;
    const secret = process.env.MEMBER_SESSION_SECRET;
    const ok = token && secret ? await verifyMemberToken(token, secret) : false;
    if (ok) return NextResponse.next();

    if (isApi) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // ── 後台分支（原有邏輯，一字未動）──
  // 放行登入頁與登入 API，避免導向迴圈
  if (pathname === "/admin/login" || pathname === "/api/admin/login") {
    return NextResponse.next();
  }

  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const secret = process.env.ADMIN_SESSION_SECRET;
  const ok = token && secret ? await verifySessionToken(token, secret) : false;

  if (!ok) {
    if (isApi) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    "/api/admin/:path*",
    "/member",
    "/member/:path*",
    "/api/member/:path*",
  ],
};
