// 前台會員資料層。所有存取走 service_role（全專案零 RLS policy 的既有安全模型）。
// 越權防護原則：凡是查會員自己的資料，memberId 一律是第一個必填參數，
// 且不提供「只吃 id 不吃 memberId」的版本，讓呼叫端不可能漏掉過濾。
import { createAdminSupabase } from "@/lib/supabase";
import { hashPassword, verifyPassword } from "@/lib/adminPassword";

export type MemberStatus = "guest" | "active" | "disabled";

export type Member = {
  id: string;
  phone: string;
  phone_display: string | null;
  name: string;
  company: string | null;
  email: string | null;
  status: MemberStatus;
  credit_status: string;
  payment_terms: string;
  paid_order_count: number;
  last_login_at: string | null;
  created_at: string;
  is_demo: boolean;
};

/** Demo 客戶只存在於管理後台，永遠不得進入前台會員流程。 */
export function isFrontMemberEligible(member: Pick<Member, "is_demo">): boolean {
  return member.is_demo === false;
}

/** 給前端看的會員資料（絕不含密碼雜湊、授信備註等內部欄位）。 */
export type PublicMember = {
  id: string;
  name: string;
  phone: string;
  phoneDisplay: string;
  company: string | null;
  email: string | null;
  status: MemberStatus;
  hasPassword: boolean;
};

/** 手機 normalize：只留數字。0912-345-678 / +886912345678 / 0912 345 678 都會對上同一筆。 */
export function normalizePhone(input: string): string {
  const digits = String(input ?? "").replace(/\D/g, "");
  // 886 開頭的國碼轉回 0 開頭（+886912345678 → 0912345678）
  if (digits.startsWith("886") && digits.length >= 11) return "0" + digits.slice(3);
  return digits;
}

export function isValidPhone(input: string): boolean {
  const d = normalizePhone(input);
  return d.length >= 8 && d.length <= 15;
}

export function toPublicMember(m: Member): PublicMember {
  return {
    id: m.id,
    name: m.name,
    phone: m.phone,
    phoneDisplay: m.phone_display || m.phone,
    company: m.company,
    email: m.email,
    status: m.status,
    hasPassword: m.status === "active",
  };
}

const COLS =
  "id, phone, phone_display, name, company, email, status, credit_status, payment_terms, paid_order_count, last_login_at, created_at, is_demo";

export async function getMemberByPhone(phone: string): Promise<Member | null> {
  const db = createAdminSupabase();
  if (!db) return null;
  const { data } = await db
    .from("members")
    .select(COLS)
    .eq("phone", normalizePhone(phone))
    .eq("is_demo", false)
    .maybeSingle();
  return (data as Member) ?? null;
}

export async function getMemberById(id: string): Promise<Member | null> {
  const db = createAdminSupabase();
  if (!db) return null;
  const { data } = await db.from("members").select(COLS).eq("id", id).eq("is_demo", false).maybeSingle();
  return (data as Member) ?? null;
}

/**
 * 這支手機是否已經有實際往來（送過稿或建過工單）。
 *
 * 這是「無痛入會」安全性的關鍵：只有**完全沒有往來紀錄**的手機才會被自動放行，
 * 所以自動發出去的 cookie 永遠不可能拿到任何既有資料 —— 沒有東西可外洩。
 * 一旦有往來，就必須輸入密碼或走人工驗證。
 */
export async function memberHasActivity(memberId: string): Promise<boolean> {
  const db = createAdminSupabase();
  if (!db) return true; // 查不到就當作「有」，走保守路線
  const { count } = await db
    .from("work_orders")
    .select("id", { count: "exact", head: true })
    .eq("member_id", memberId)
    .eq("is_demo", false);
  if ((count ?? 0) > 0) return true;
  const { count: sessions } = await db
    .from("intake_sessions")
    .select("id", { count: "exact", head: true })
    .eq("member_id", memberId)
    .eq("is_demo", false)
    .gt("submitted_count", 0);
  return (sessions ?? 0) > 0;
}

export async function createGuestMember(input: {
  phone: string;
  name: string;
  email?: string | null;
  company?: string | null;
}): Promise<Member | null> {
  const db = createAdminSupabase();
  if (!db) return null;
  const { data, error } = await db
    .from("members")
    .insert({
      phone: normalizePhone(input.phone),
      phone_display: input.phone,
      name: input.name.trim(),
      email: input.email?.trim() || null,
      company: input.company?.trim() || null,
      status: "guest",
      is_demo: false,
    })
    .select(COLS)
    .single();
  if (error) {
    console.error("[members] createGuestMember failed:", error.message);
    return null;
  }
  return data as Member;
}

/** 更新聯絡欄位（回訪時客戶可能改了姓名或 Email）。不動 status/credit_status。 */
export async function updateMemberContact(
  memberId: string,
  input: { name?: string; email?: string | null; company?: string | null }
): Promise<void> {
  const db = createAdminSupabase();
  if (!db) return;
  const patch: Record<string, unknown> = {};
  if (input.name?.trim()) patch.name = input.name.trim();
  if (input.email !== undefined) patch.email = input.email?.trim() || null;
  if (input.company !== undefined) patch.company = input.company?.trim() || null;
  if (Object.keys(patch).length === 0) return;
  await db.from("members").update(patch).eq("id", memberId).eq("is_demo", false);
}

export async function createActiveMember(input: {
  phone: string;
  name: string;
  password: string;
  email?: string | null;
  company?: string | null;
}): Promise<{ ok: true; member: Member } | { ok: false; error: string }> {
  const db = createAdminSupabase();
  if (!db) return { ok: false, error: "db_unavailable" };
  if (!isValidPhone(input.phone)) return { ok: false, error: "invalid_phone" };
  if (!input.name.trim()) return { ok: false, error: "invalid_name" };
  if (!input.password || input.password.length < 6) return { ok: false, error: "weak_password" };

  const existing = await getMemberByPhone(input.phone);
  if (existing && existing.status === "active") return { ok: false, error: "phone_exists" };

  const { salt, hash } = hashPassword(input.password);

  // 已經有 guest 帳號 → 就地升級，保留既有的往來紀錄
  if (existing) {
    const { data, error } = await db
      .from("members")
      .update({
        name: input.name.trim(),
        email: input.email?.trim() || existing.email,
        company: input.company?.trim() || existing.company,
        password_hash: hash,
        password_salt: salt,
        status: "active",
      })
      .eq("id", existing.id)
      .eq("is_demo", false)
      .select(COLS)
      .single();
    if (error) return { ok: false, error: "update_failed" };
    return { ok: true, member: data as Member };
  }

  const { data, error } = await db
    .from("members")
    .insert({
      phone: normalizePhone(input.phone),
      phone_display: input.phone,
      name: input.name.trim(),
      email: input.email?.trim() || null,
      company: input.company?.trim() || null,
      password_hash: hash,
      password_salt: salt,
      status: "active",
      is_demo: false,
    })
    .select(COLS)
    .single();
  if (error) {
    console.error("[members] createActiveMember failed:", error.message);
    return { ok: false, error: "insert_failed" };
  }
  return { ok: true, member: data as Member };
}

/** guest 升級成 active（憑既有 cookie，不需再驗身分——本來就已經是這個人在操作）。 */
export async function setMemberPassword(memberId: string, password: string): Promise<boolean> {
  const db = createAdminSupabase();
  if (!db || !password || password.length < 6) return false;
  const { salt, hash } = hashPassword(password);
  const { error } = await db
    .from("members")
    .update({ password_hash: hash, password_salt: salt, status: "active" })
    .eq("id", memberId)
    .eq("is_demo", false);
  return !error;
}

/** 手機 + 密碼登入。密碼錯與帳號不存在回同一種結果，避免用來探測有哪些手機註冊過。 */
export async function verifyMemberLogin(phone: string, password: string): Promise<Member | null> {
  const db = createAdminSupabase();
  if (!db) return null;
  const { data } = await db
    .from("members")
    .select(`${COLS}, password_hash, password_salt`)
    .eq("phone", normalizePhone(phone))
    .eq("is_demo", false)
    .maybeSingle();
  if (!data) return null;
  const row = data as Member & { password_hash: string | null; password_salt: string | null };
  if (row.status === "disabled") return null;
  if (!row.password_hash || !row.password_salt) return null;
  if (!verifyPassword(password, row.password_salt, row.password_hash)) return null;
  return row;
}

export async function touchLastLogin(memberId: string): Promise<void> {
  const db = createAdminSupabase();
  if (!db) return;
  await db.from("members").update({ last_login_at: new Date().toISOString() }).eq("id", memberId).eq("is_demo", false);
}

/** 把訪客時期建立的 intake_session 掛到會員名下（「認領」），對話不斷線。 */
export async function claimSession(sessionId: string, memberId: string): Promise<void> {
  const db = createAdminSupabase();
  if (!db || !sessionId) return;
  await db.from("intake_sessions").update({ member_id: memberId }).eq("session_id", sessionId).eq("is_demo", false);
}

/**
 * 會員自己的發稿紀錄。
 *
 * ⚠️ 只投影客戶看得到的欄位 —— 工單是內部文件（階段二定案）。
 * storage_path / receiver / processing_items / customer_no / parsed 等一律不出去。
 */
export type MemberUpload = {
  id: string;
  fileName: string;
  designName: string | null;
  sizeW: number | null;
  sizeH: number | null;
  qty: number | null;
  status: string;
  createdAt: string;
};

const PROGRESS: Record<string, string> = {
  open: "已收件",
  in_progress: "製作中",
  done: "已完成",
};

export function progressLabel(status: string): string {
  return PROGRESS[status] ?? "已收件";
}

export async function getMemberUploads(memberId: string, limit = 100): Promise<MemberUpload[]> {
  const db = createAdminSupabase();
  if (!db || !memberId) return [];
  const { data, error } = await db
    .from("work_orders")
    .select("id, file_name, design_name, size_w, size_h, total_qty, status, created_at")
    .eq("member_id", memberId) // ★ 永遠以 cookie 內的 memberId 過濾，不信任前端
    .eq("is_demo", false)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id as string,
    fileName: r.file_name as string,
    designName: (r.design_name as string) ?? null,
    sizeW: (r.size_w as number) ?? null,
    sizeH: (r.size_h as number) ?? null,
    qty: (r.total_qty as number) ?? null,
    status: (r.status as string) ?? "open",
    createdAt: r.created_at as string,
  }));
}
