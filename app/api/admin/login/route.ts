import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, createSessionToken } from "@/lib/adminAuth";
import { verifyPassword } from "@/lib/adminPassword";
import { getAdminByEmail, touchLastLogin } from "@/lib/adminUsers";

export const runtime = "nodejs";

const TTL_SECONDS = 60 * 60 * 24 * 7;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// POST { email, password } → 驗證後發 httpOnly 簽章 cookie
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "admin_not_configured" }, { status: 503 });

  const email = String(body.email ?? "").toLowerCase().trim();
  const password = String(body.password ?? "");
  const admin = email ? await getAdminByEmail(email) : null;

  // 帳號不存在 / 停用 / 密碼錯 → 一律回同樣訊息 + 延遲（避免帳號枚舉、減緩暴力）
  const ok = admin && admin.active && verifyPassword(password, admin.password_salt, admin.password_hash);
  if (!ok || !admin) {
    await sleep(300);
    return NextResponse.json({ ok: false, error: "invalid_credentials", message: "帳號或密碼錯誤，請再試一次。" }, { status: 401 });
  }

  const token = await createSessionToken(secret, { id: admin.id, email: admin.email });
  cookies().set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TTL_SECONDS,
  });
  void touchLastLogin(admin.id);
  return NextResponse.json({ ok: true });
}

// DELETE → 登出
export async function DELETE() {
  cookies().delete(ADMIN_COOKIE);
  return NextResponse.json({ ok: true });
}
