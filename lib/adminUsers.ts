import { createAdminSupabase } from "@/lib/supabase";
import { hashPassword } from "@/lib/adminPassword";

export type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  active: boolean;
  created_at: string;
  last_login_at: string | null;
};

type AdminUserWithSecret = AdminUser & { password_hash: string; password_salt: string };

/** 依 email 取管理員（含密碼雜湊，僅登入驗證用）。 */
export async function getAdminByEmail(email: string): Promise<AdminUserWithSecret | null> {
  const db = createAdminSupabase();
  if (!db) return null;
  const { data, error } = await db
    .from("admin_users")
    .select("*")
    .eq("email", email.toLowerCase().trim())
    .maybeSingle();
  if (error || !data) return null;
  return data as AdminUserWithSecret;
}

/** 依 id 取管理員（不含密碼）。Phase 3 掃描站／事件記錄用來把 cookie 的 sub 換成顯示用姓名。 */
export async function getAdminById(id: string): Promise<AdminUser | null> {
  const db = createAdminSupabase();
  if (!db || !id) return null;
  const { data, error } = await db
    .from("admin_users")
    .select("id, email, name, active, created_at, last_login_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as AdminUser;
}

export async function touchLastLogin(id: string): Promise<void> {
  const db = createAdminSupabase();
  if (!db) return;
  await db.from("admin_users").update({ last_login_at: new Date().toISOString() }).eq("id", id);
}

/** 列出所有管理員（不含密碼）。 */
export async function listAdmins(): Promise<AdminUser[]> {
  const db = createAdminSupabase();
  if (!db) return [];
  const { data } = await db
    .from("admin_users")
    .select("id, email, name, active, created_at, last_login_at")
    .order("created_at", { ascending: true });
  return (data as AdminUser[]) ?? [];
}

/** 建立管理員帳號。回 {ok} 或 {error}。 */
export async function createAdmin(email: string, password: string, name?: string): Promise<{ ok: boolean; error?: string }> {
  const db = createAdminSupabase();
  if (!db) return { ok: false, error: "db_not_configured" };
  const cleanEmail = email.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return { ok: false, error: "invalid_email" };
  if (!password || password.length < 6) return { ok: false, error: "weak_password" };
  const { salt, hash } = hashPassword(password);
  const { error } = await db.from("admin_users").insert({
    email: cleanEmail,
    name: name?.trim() || null,
    password_hash: hash,
    password_salt: salt,
  });
  if (error) return { ok: false, error: error.code === "23505" ? "email_exists" : error.message };
  return { ok: true };
}

/** 啟用/停用管理員。 */
export async function setAdminActive(id: string, active: boolean): Promise<boolean> {
  const db = createAdminSupabase();
  if (!db) return false;
  const { error } = await db.from("admin_users").update({ active }).eq("id", id);
  return !error;
}
