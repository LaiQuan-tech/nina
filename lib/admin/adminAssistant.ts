import type { ChatTurn } from "@/lib/gemini";

export type AdminAssistantIntent = "overview" | "customers" | "followups" | "quotes" | "orders" | "materials" | "general";

export type AdminAssistantSnapshot = {
  generatedAt: string;
  dashboard: {
    customerCount: number;
    newThisMonth: number;
    activeQuoteCount: number;
    monthOrderCount: number;
    openFollowupCount: number;
    overdueFollowupCount: number;
  };
  customers: Array<{
    id: string;
    name: string;
    company: string | null;
    tier: string;
    industry: string | null;
    tags: string[];
    orderCount: number;
    openFollowupCount: number;
  }>;
  followups: Array<{
    id: string;
    customerName: string;
    company: string | null;
    title: string;
    priority: string;
    dueAt: string;
  }>;
  records: Array<{
    id: string;
    type: "quote" | "order";
    customerName: string;
    company: string | null;
    title: string;
    excerpt: string;
    status: string;
    at: string;
  }>;
  materials: Array<{ label: string; value: number }>;
};

export type AdminAssistantInput = { query: string; history: ChatTurn[] };
export type AdminAssistantValidation = { ok: true; value: AdminAssistantInput } | { ok: false; error: string };
export type FollowupTimeScope = "overdue" | "today" | "all";

export function validateAdminAssistantInput(input: unknown): AdminAssistantValidation {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "invalid_body" };
  const body = input as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["query", "history"].includes(key))) return { ok: false, error: "unknown_field" };
  if (typeof body.query !== "string") return { ok: false, error: "invalid_query" };
  const query = body.query.trim();
  if (!query || query.length > 600) return { ok: false, error: "invalid_query" };
  if (body.history !== undefined && !Array.isArray(body.history)) return { ok: false, error: "invalid_history" };
  const rawHistory = (body.history ?? []) as unknown[];
  if (rawHistory.length > 8) return { ok: false, error: "invalid_history" };
  const history: ChatTurn[] = [];
  for (const turn of rawHistory) {
    if (!turn || typeof turn !== "object" || Array.isArray(turn)) return { ok: false, error: "invalid_history" };
    const row = turn as Record<string, unknown>;
    if (Object.keys(row).some((key) => !["role", "text"].includes(key))) return { ok: false, error: "invalid_history" };
    if ((row.role !== "user" && row.role !== "model") || typeof row.text !== "string") return { ok: false, error: "invalid_history" };
    const text = row.text.trim();
    if (!text || text.length > 1000) return { ok: false, error: "invalid_history" };
    history.push({ role: row.role, text });
  }
  return { ok: true, value: { query, history } };
}

export function classifyAdminAssistantIntent(query: string): AdminAssistantIntent {
  const text = query.toLocaleLowerCase("zh-TW");
  if (/回訪|追蹤|待辦|逾期|提醒/.test(text)) return "followups";
  if (/vip|客戶|會員|產業/.test(text)) return "customers";
  if (/報價|估價|quote/.test(text)) return "quotes";
  if (/工單|訂單|案件|製作/.test(text)) return "orders";
  if (/材質|材料|產品|品項/.test(text)) return "materials";
  if (/營運|概況|總覽|數據|摘要|報表/.test(text)) return "overview";
  return "general";
}

export function classifyFollowupTimeScope(query: string): FollowupTimeScope {
  if (/逾期/.test(query)) return "overdue";
  if (/今天|今日/.test(query)) return "today";
  return "all";
}

export function normalizeAssistantReply(reply: string): string {
  return reply
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*/g, "")
    .trim();
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric" }).format(new Date(value));
}

function numbered(lines: string[]): string {
  return lines.map((line, index) => `${index + 1}. ${line}`).join("\n");
}

export function buildFallbackAssistantReply(intent: AdminAssistantIntent, snapshot: AdminAssistantSnapshot): string {
  const d = snapshot.dashboard;
  if (intent === "overview" || intent === "general") {
    return [
      "Demo 營運快報",
      `目前共有 ${d.customerCount} 位 Demo 客戶，本月新增 ${d.newThisMonth} 位。`,
      `進行中報價 ${d.activeQuoteCount} 份，本月工單 ${d.monthOrderCount} 筆。`,
      `待回訪 ${d.openFollowupCount} 件，其中逾期 ${d.overdueFollowupCount} 件。`,
      d.overdueFollowupCount > 0 ? "建議先處理高優先與逾期回訪，再追蹤已送出的報價。" : "目前沒有逾期回訪，可優先追蹤已送出的報價。",
    ].join("\n");
  }
  if (intent === "customers") {
    const rows = snapshot.customers.slice(0, 6).map((row) => `${row.company || row.name}｜${row.tier.toUpperCase()}｜${row.industry || "未分類"}｜${row.orderCount} 筆工單`);
    return `客戶重點清單（前 ${rows.length} 筆）\n${rows.length ? numbered(rows) : "目前沒有符合的 Demo 客戶。"}`;
  }
  if (intent === "followups") {
    const rows = snapshot.followups.slice(0, 8).map((row) => `${shortDate(row.dueAt)} ${row.company || row.customerName}｜${row.title}｜${row.priority}`);
    return `待追蹤與回訪（前 ${rows.length} 件）\n${rows.length ? numbered(rows) : "目前沒有待處理回訪。"}`;
  }
  if (intent === "materials") {
    const rows = snapshot.materials.slice(0, 6).map((row) => `${row.label}：${row.value} 位客戶偏好`);
    return `熱門材質排行\n${rows.length ? numbered(rows) : "目前沒有足夠的材質資料。"}`;
  }
  const type = intent === "quotes" ? "報價" : "工單";
  const rows = snapshot.records.slice(0, 8).map((row) => `${shortDate(row.at)} ${row.company || row.customerName}｜${row.title}｜${row.excerpt}｜${row.status}`);
  return `${type}紀錄（前 ${rows.length} 筆）\n${rows.length ? numbered(rows) : `目前沒有符合的 Demo ${type}。`}`;
}
