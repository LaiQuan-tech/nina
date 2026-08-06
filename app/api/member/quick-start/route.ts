import { NextResponse } from "next/server";
import { upsertSessionContact } from "@/lib/intakeSessions";
import {
  claimSession,
  createGuestMember,
  getMemberByPhone,
  isValidPhone,
  memberHasActivity,
  toPublicMember,
  touchLastLogin,
  updateMemberContact,
  type Member,
} from "@/lib/members";
import { verifyMemberLogin } from "@/lib/members";
import { setMemberCookie } from "@/lib/memberSession";

export const runtime = "nodejs";

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "0.0.0.0";
}

/**
 * 「無痛入會」：客戶在 /upload 填完聯絡資訊送出，這支同時做三件事——
 * 建案件、建/認會員、發 cookie。客戶完全不會感覺到自己註冊了。
 *
 * ⚠️ 安全核心：不能「知道手機號碼就變成那個人」。依手機分四種情況：
 *   1. 手機不在 DB              → 建 guest、發 cookie（此時無任何資料可外洩）
 *   2. 已存在、guest、無往來紀錄 → 視為同一人，更新聯絡欄位後放行
 *   3. 已存在、已設密碼          → 要求輸入密碼，密碼對才發 cookie
 *   4. 已存在、有往來但沒密碼    → 不放行，轉人工驗證
 * 因為只有「完全沒有往來紀錄」的手機才會被自動放行，自動發出的 cookie
 * 永遠拿不到任何既有資料。
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    sessionId?: string;
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
    password?: string;
    remember?: boolean;
  };
  const { sessionId, name, email, phone, company, password } = body;
  const remember = body.remember !== false;

  if (!sessionId || !name?.trim() || !email?.trim() || !phone?.trim()) {
    return NextResponse.json({ ok: false, error: "missing_fields", message: "請填寫完整資料" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return NextResponse.json({ ok: false, error: "invalid_email", message: "Email 格式不正確" }, { status: 400 });
  }
  if (!isValidPhone(phone)) {
    return NextResponse.json({ ok: false, error: "invalid_phone", message: "手機號碼不正確" }, { status: 400 });
  }

  const existing = await getMemberByPhone(phone);
  let member: Member | null = null;

  if (!existing) {
    // ── 情況 1：全新手機，完全無痛 ──
    member = await createGuestMember({ phone, name, email, company });
    if (!member) {
      return NextResponse.json({ ok: false, error: "create_failed", message: "系統忙碌，請稍後再試" }, { status: 502 });
    }
  } else if (existing.status === "disabled") {
    return NextResponse.json(
      { ok: false, error: "disabled", message: "此帳號已停用，請聯絡專員" },
      { status: 403 }
    );
  } else if (existing.status === "active") {
    // ── 情況 3：已設密碼，必須驗證 ──
    if (!password) {
      return NextResponse.json(
        { ok: false, error: "password_required", message: "這支手機已經註冊過，請輸入密碼登入" },
        { status: 409 }
      );
    }
    member = await verifyMemberLogin(phone, password);
    if (!member) {
      await new Promise((r) => setTimeout(r, 300)); // 密碼錯稍微拖一下
      return NextResponse.json({ ok: false, error: "bad_password", message: "密碼不正確" }, { status: 401 });
    }
  } else {
    // ── guest：要看有沒有往來紀錄 ──
    if (await memberHasActivity(existing.id)) {
      // ── 情況 4：有往來但沒密碼 → 不能只憑手機號碼放行 ──
      return NextResponse.json(
        {
          ok: false,
          error: "verify_required",
          message: "這支手機已經有發稿紀錄。為了保護您的資料，請聯絡專員協助驗證身分。",
        },
        { status: 409 }
      );
    }
    // ── 情況 2：同一人回訪，更新聯絡欄位後放行 ──
    await updateMemberContact(existing.id, { name, email, company });
    member = { ...existing, name: name.trim(), email: email.trim(), company: company?.trim() ?? existing.company };
  }

  // 建案件（沿用既有的 intake_sessions）
  const sessionReady = await upsertSessionContact({
    sessionId,
    name,
    email,
    phone,
    ip: clientIp(req),
    ua: req.headers.get("user-agent") ?? "",
  });
  if (!sessionReady) {
    return NextResponse.json(
      { ok: false, error: "session_unavailable", message: "目前無法建立送件紀錄，請重新整理後再試" },
      { status: 409 },
    );
  }
  await claimSession(sessionId, member.id);
  await touchLastLogin(member.id);

  const cookieOk = await setMemberCookie(member, remember);
  return NextResponse.json({ ok: true, member: toPublicMember(member), signedIn: cookieOk });
}
