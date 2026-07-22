import { NextResponse } from "next/server";
import { upsertSessionContact } from "@/lib/intakeSessions";

export const runtime = "nodejs";

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "0.0.0.0";
}

// POST { sessionId, name, email, phone } → 建案件 + 存聯絡資訊
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    sessionId?: string;
    name?: string;
    email?: string;
    phone?: string;
  };
  const { sessionId, name, email, phone } = body;

  if (!sessionId || !name?.trim() || !email?.trim() || !phone?.trim()) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }
  if (phone.replace(/\D/g, "").length < 8) {
    return NextResponse.json({ ok: false, error: "invalid_phone" }, { status: 400 });
  }

  const ok = await upsertSessionContact({
    sessionId,
    name,
    email,
    phone,
    ip: clientIp(req),
    ua: req.headers.get("user-agent") ?? "",
  });
  return NextResponse.json({ ok });
}
