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

function normalized(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase("zh-TW");
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
