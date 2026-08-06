export type CustomerTier = "standard" | "growth" | "vip";
export type PriceSensitivity = "low" | "medium" | "high";
export type FollowupBucket = "overdue" | "today" | "next7" | "later";

export type CustomerFilterSource = {
  name: string;
  company: string | null;
  phone: string;
  industry: string | null;
  customerTier: string;
  status: string;
  tags: string[];
};

export type CustomerFilters = {
  query?: string;
  customerTier?: string;
  industry?: string;
  status?: string;
};

export type TimelineSourceItem = { id: string; at: string; title: string; detail?: string; status?: string };
export type CustomerTimelineEvent = TimelineSourceItem & {
  type: "conversation" | "quote" | "order" | "followup";
};

export type FollowupBucketItem = { id: string; dueAt: string; status: string; [key: string]: unknown };
export type HistoricalEventSource = {
  created_at: string | null | undefined;
  updated_at?: string | null | undefined;
};

function normalized(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase("zh-TW");
}

/**
 * Demo 資料重灌會觸發 updated_at 更新，因此歷史事件一律以不可變的 created_at 呈現。
 */
export function historicalEventAt(event: HistoricalEventSource): string {
  return event.created_at ?? "";
}

export function latestHistoricalEventAt(events: HistoricalEventSource[]): string | null {
  return events
    .map(historicalEventAt)
    .filter((value) => value && !Number.isNaN(new Date(value).getTime()))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
}

export function sortCustomersByLastInteraction<T extends { lastInteractionAt: string | null }>(customers: T[]): T[] {
  return [...customers].sort(
    (a, b) => new Date(b.lastInteractionAt ?? 0).getTime() - new Date(a.lastInteractionAt ?? 0).getTime(),
  );
}

export function matchesCustomerFilters(customer: CustomerFilterSource, filters: CustomerFilters): boolean {
  const query = normalized(filters.query);
  if (query) {
    const haystack = [customer.company, customer.name, customer.phone, ...customer.tags]
      .map(normalized)
      .join(" ");
    if (!haystack.includes(query)) return false;
  }
  if (filters.customerTier && filters.customerTier !== "all" && customer.customerTier !== filters.customerTier) {
    return false;
  }
  if (filters.industry && filters.industry !== "all" && customer.industry !== filters.industry) return false;
  if (filters.status && filters.status !== "all" && customer.status !== filters.status) return false;
  return true;
}

export function mergeCustomerTimeline(input: {
  sessions: TimelineSourceItem[];
  quotes: TimelineSourceItem[];
  orders: TimelineSourceItem[];
  followups: TimelineSourceItem[];
}): CustomerTimelineEvent[] {
  return [
    ...input.sessions.map((item) => ({ ...item, type: "conversation" as const })),
    ...input.quotes.map((item) => ({ ...item, type: "quote" as const })),
    ...input.orders.map((item) => ({ ...item, type: "order" as const })),
    ...input.followups.map((item) => ({ ...item, type: "followup" as const })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

function taipeiDayStart(value: Date): number {
  const shifted = new Date(value.getTime() + 8 * 60 * 60 * 1000);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - 8 * 60 * 60 * 1000;
}

function taipeiDateParts(value: Date): { year: number; month: number; day: number } {
  const shifted = new Date(value.getTime() + 8 * 60 * 60 * 1000);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

/** 取得 Asia/Taipei 的本月一日與今日零時，回傳可直接比較的 UTC epoch。 */
export function taipeiCalendarBoundaries(value: Date): { monthStart: number; todayStart: number } {
  const { year, month } = taipeiDateParts(value);
  return {
    monthStart: Date.UTC(year, month - 1, 1) - 8 * 60 * 60 * 1000,
    todayStart: taipeiDayStart(value),
  };
}

function taipeiDateKey(value: Date): string {
  const { year, month, day } = taipeiDateParts(value);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 以台北日曆日彙整互動，避免 Vercel UTC 與本機時區造成日期錯位。 */
export function buildDailyActivity(activityDates: string[], now = new Date(), days = 14): Array<{ label: string; value: number }> {
  const dayMs = 24 * 60 * 60 * 1000;
  const today = taipeiDayStart(now);
  const counts = new Map<string, number>();
  for (const value of activityDates) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) continue;
    const key = taipeiDateKey(parsed);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today - (days - 1 - index) * dayMs);
    const key = taipeiDateKey(date);
    const { month, day } = taipeiDateParts(date);
    return { label: `${month}/${day}`, value: counts.get(key) ?? 0 };
  });
}

export function bucketFollowups<T extends FollowupBucketItem>(items: T[], now = new Date()): Record<FollowupBucket, T[]> {
  const result: Record<FollowupBucket, T[]> = { overdue: [], today: [], next7: [], later: [] };
  const today = taipeiDayStart(now);
  const tomorrow = today + 24 * 60 * 60 * 1000;
  const afterSevenDays = tomorrow + 7 * 24 * 60 * 60 * 1000;
  for (const item of items) {
    if (item.status !== "open") continue;
    const due = new Date(item.dueAt).getTime();
    const bucket: FollowupBucket = due < today ? "overdue" : due < tomorrow ? "today" : due < afterSevenDays ? "next7" : "later";
    result[bucket].push(item);
  }
  for (const bucket of Object.keys(result) as FollowupBucket[]) {
    result[bucket].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  }
  return result;
}

const PROFILE_FIELDS = {
  industry: { db: "industry", kind: "short" },
  customerTier: { db: "customer_tier", kind: "tier" },
  tags: { db: "tags", kind: "list" },
  preferredContact: { db: "preferred_contact", kind: "short" },
  preferredMaterials: { db: "preferred_materials", kind: "list" },
  preferredProducts: { db: "preferred_products", kind: "list" },
  preferredProcessing: { db: "preferred_processing", kind: "list" },
  preferredDelivery: { db: "preferred_delivery", kind: "list" },
  commonSizes: { db: "common_sizes", kind: "list" },
  priceSensitivity: { db: "price_sensitivity", kind: "sensitivity" },
  aiSummary: { db: "ai_summary", kind: "long" },
  serviceNotes: { db: "service_notes", kind: "long" },
} as const;

type ProfileDbPatch = Record<string, string | string[] | null>;
export type ProfilePatchValidation = { ok: true; value: ProfileDbPatch } | { ok: false; error: string };

export function validateCustomerProfilePatch(input: unknown): ProfilePatchValidation {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "invalid_body" };
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0) return { ok: false, error: "empty_patch" };
  const value: ProfileDbPatch = {};
  for (const [key, raw] of entries) {
    const field = PROFILE_FIELDS[key as keyof typeof PROFILE_FIELDS];
    if (!field) return { ok: false, error: "unknown_field" };
    if (field.kind === "list") {
      if (!Array.isArray(raw) || raw.length > 12 || raw.some((item) => typeof item !== "string" || item.trim().length > 80)) {
        return { ok: false, error: "invalid_list" };
      }
      value[field.db] = [...new Set(raw.map((item) => item.trim()).filter(Boolean))];
      continue;
    }
    if (raw !== null && typeof raw !== "string") return { ok: false, error: "invalid_text" };
    const text = typeof raw === "string" ? raw.trim() : null;
    if (field.kind === "tier" && !["standard", "growth", "vip"].includes(text ?? "")) {
      return { ok: false, error: "invalid_tier" };
    }
    if (field.kind === "sensitivity" && !["low", "medium", "high"].includes(text ?? "")) {
      return { ok: false, error: "invalid_sensitivity" };
    }
    const max = field.kind === "long" ? 2000 : 120;
    if ((text?.length ?? 0) > max) return { ok: false, error: "too_long" };
    value[field.db] = text || null;
  }
  return { ok: true, value };
}

export type FollowupValidation = { ok: true; value: Record<string, string | null> } | { ok: false; error: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FOLLOWUP_FIELDS = new Set(["memberId", "title", "reason", "priority", "status", "assignee", "dueAt"]);

export function validateFollowupInput(input: unknown, mode: "create" | "update"): FollowupValidation {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "invalid_body" };
  const body = input as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.length === 0 || keys.some((key) => !FOLLOWUP_FIELDS.has(key))) return { ok: false, error: "unknown_field" };
  if (mode === "create") {
    if (typeof body.memberId !== "string" || !UUID_PATTERN.test(body.memberId)) return { ok: false, error: "invalid_member" };
    if (typeof body.title !== "string" || !body.title.trim()) return { ok: false, error: "invalid_title" };
    if (typeof body.dueAt !== "string") return { ok: false, error: "invalid_due_at" };
  } else if ("memberId" in body) {
    return { ok: false, error: "immutable_member" };
  }

  const value: Record<string, string | null> = {};
  if (typeof body.memberId === "string") value.member_id = body.memberId;
  for (const [inputKey, dbKey, max] of [
    ["title", "title", 160],
    ["reason", "reason", 1000],
    ["assignee", "assignee", 80],
  ] as const) {
    if (!(inputKey in body)) continue;
    const raw = body[inputKey];
    if (raw !== null && typeof raw !== "string") return { ok: false, error: `invalid_${inputKey}` };
    const text = typeof raw === "string" ? raw.trim() : null;
    if ((text?.length ?? 0) > max || (inputKey === "title" && !text)) return { ok: false, error: `invalid_${inputKey}` };
    value[dbKey] = text || null;
  }
  if ("priority" in body) {
    if (typeof body.priority !== "string" || !["low", "medium", "high"].includes(body.priority)) return { ok: false, error: "invalid_priority" };
    value.priority = body.priority;
  } else if (mode === "create") {
    value.priority = "medium";
  }
  if ("status" in body) {
    if (typeof body.status !== "string" || !["open", "completed", "cancelled"].includes(body.status)) return { ok: false, error: "invalid_status" };
    value.status = body.status;
  }
  if ("dueAt" in body) {
    if (typeof body.dueAt !== "string" || !body.dueAt.includes("T")) return { ok: false, error: "invalid_due_at" };
    const parsed = new Date(body.dueAt);
    if (Number.isNaN(parsed.getTime())) return { ok: false, error: "invalid_due_at" };
    value.due_at = parsed.toISOString();
  }
  return { ok: true, value };
}
