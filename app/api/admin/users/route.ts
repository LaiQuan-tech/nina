import { NextResponse } from "next/server";
import { listAdmins, createAdmin, setAdminActive } from "@/lib/adminUsers";

export const runtime = "nodejs";

// 受 middleware 保護（僅已登入管理員可存取）
export async function GET() {
  return NextResponse.json({ ok: true, users: await listAdmins() });
}

// POST { email, password, name } → 新增管理員
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string; name?: string };
  const res = await createAdmin(String(body.email ?? ""), String(body.password ?? ""), body.name);
  if (!res.ok) {
    const msg =
      res.error === "email_exists"
        ? "此 Email 已存在"
        : res.error === "invalid_email"
          ? "Email 格式不正確"
          : res.error === "weak_password"
            ? "密碼至少 6 碼"
            : "新增失敗";
    return NextResponse.json({ ok: false, error: res.error, message: msg }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

// PATCH { id, active } → 啟用/停用
export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { id?: string; active?: boolean };
  if (!body.id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  const ok = await setAdminActive(body.id, Boolean(body.active));
  return NextResponse.json({ ok });
}
