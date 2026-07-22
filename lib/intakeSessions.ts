import { createAdminSupabase } from "@/lib/supabase";

export type IntakeMessage = { role: "user" | "model"; text: string };

export type IntakeSession = {
  id: string;
  session_id: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  messages: IntakeMessage[];
  message_count: number;
  submitted_count: number;
  status: string;
  last_file_name: string | null;
  user_ip: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
};

/** 建立/更新案件並寫入聯絡資訊（聯絡表單送出時呼叫）。全程吞錯，不影響客戶。 */
export async function upsertSessionContact(input: {
  sessionId: string;
  name: string;
  email: string;
  phone: string;
  ip?: string;
  ua?: string;
}): Promise<boolean> {
  const db = createAdminSupabase();
  if (!db || !input.sessionId) return false;
  try {
    const { error } = await db.from("intake_sessions").upsert(
      {
        session_id: input.sessionId,
        contact_name: input.name?.trim() || null,
        contact_email: input.email?.trim() || null,
        contact_phone: input.phone?.trim() || null,
        user_ip: input.ip ?? null,
        user_agent: (input.ua ?? "").slice(0, 300) || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "session_id" }
    );
    return !error;
  } catch {
    return false;
  }
}

/** 每回合對話變動時更新 messages（不覆蓋聯絡資訊）。吞錯。 */
export async function logSessionMessages(sessionId: string, messages: IntakeMessage[]): Promise<void> {
  const db = createAdminSupabase();
  if (!db || !sessionId) return;
  try {
    const trimmed = messages.slice(-100).map((m) => ({ role: m.role, text: String(m.text ?? "").slice(0, 2000) }));
    await db
      .from("intake_sessions")
      .update({ messages: trimmed, message_count: trimmed.length, updated_at: new Date().toISOString() })
      .eq("session_id", sessionId);
  } catch {
    /* 靜默 */
  }
}

/** 收件成功後：submitted_count+1、status=submitted、記最後檔名。吞錯。 */
export async function markSessionSubmitted(sessionId: string, fileName: string): Promise<void> {
  const db = createAdminSupabase();
  if (!db || !sessionId) return;
  try {
    const { data } = await db
      .from("intake_sessions")
      .select("submitted_count")
      .eq("session_id", sessionId)
      .maybeSingle();
    const next = ((data?.submitted_count as number) ?? 0) + 1;
    await db
      .from("intake_sessions")
      .update({ submitted_count: next, status: "submitted", last_file_name: fileName, updated_at: new Date().toISOString() })
      .eq("session_id", sessionId);
  } catch {
    /* 靜默 */
  }
}

// ── 後台讀取（admin client）──
export async function getIntakeSessions(limit = 200): Promise<IntakeSession[]> {
  const db = createAdminSupabase();
  if (!db) return [];
  const { data } = await db.from("intake_sessions").select("*").order("updated_at", { ascending: false }).limit(limit);
  return (data as IntakeSession[]) ?? [];
}

export async function getIntakeSession(id: string): Promise<IntakeSession | null> {
  const db = createAdminSupabase();
  if (!db) return null;
  const { data } = await db.from("intake_sessions").select("*").eq("id", id).maybeSingle();
  return (data as IntakeSession) ?? null;
}

export type IntakeStats = { total: number; submitted: number; today: number; files: number };

/** 後台總覽計數。 */
export async function getIntakeStats(): Promise<IntakeStats> {
  const db = createAdminSupabase();
  if (!db) return { total: 0, submitted: 0, today: 0, files: 0 };
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [total, submitted, today, filesAgg] = await Promise.all([
    db.from("intake_sessions").select("*", { count: "exact", head: true }),
    db.from("intake_sessions").select("*", { count: "exact", head: true }).eq("status", "submitted"),
    db.from("intake_sessions").select("*", { count: "exact", head: true }).gte("created_at", startOfDay.toISOString()),
    db.from("work_orders").select("*", { count: "exact", head: true }),
  ]);
  return {
    total: total.count ?? 0,
    submitted: submitted.count ?? 0,
    today: today.count ?? 0,
    files: filesAgg.count ?? 0,
  };
}
