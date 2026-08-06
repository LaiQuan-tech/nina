import { createAdminSupabase } from "@/lib/supabase";
import {
  buildDailyActivity,
  matchesCustomerFilters,
  mergeCustomerTimeline,
  type CustomerFilters,
  type CustomerTimelineEvent,
} from "./customerKnowledgeView";

type MemberRow = {
  id: string;
  name: string;
  company: string | null;
  phone: string;
  phone_display: string | null;
  email: string | null;
  status: string;
  payment_terms: string;
  paid_order_count: number;
  created_at: string;
  updated_at: string;
};

export type CustomerProfile = {
  member_id: string;
  industry: string | null;
  customer_tier: "standard" | "growth" | "vip";
  tags: string[];
  preferred_contact: string | null;
  preferred_materials: string[];
  preferred_products: string[];
  preferred_processing: string[];
  preferred_delivery: string[];
  common_sizes: string[];
  price_sensitivity: "low" | "medium" | "high";
  ai_summary: string | null;
  service_notes: string | null;
  last_summary_at: string | null;
};

export type KnowledgeCustomer = {
  id: string;
  name: string;
  company: string | null;
  phone: string;
  phoneDisplay: string;
  email: string | null;
  status: string;
  paymentTerms: string;
  paidOrderCount: number;
  createdAt: string;
  profile: CustomerProfile;
  lastInteractionAt: string | null;
  sessionCount: number;
  quoteCount: number;
  orderCount: number;
  openFollowupCount: number;
};

export type CustomerFollowup = {
  id: string;
  memberId: string;
  customerName: string;
  company: string | null;
  title: string;
  reason: string | null;
  priority: "low" | "medium" | "high";
  status: "open" | "completed" | "cancelled";
  assignee: string | null;
  dueAt: string;
  completedAt: string | null;
  createdAt: string;
};

export type KnowledgeCustomerDetail = KnowledgeCustomer & {
  timeline: CustomerTimelineEvent[];
  followups: CustomerFollowup[];
};

export type DemoDashboard = {
  customerCount: number;
  newThisMonth: number;
  activeQuoteCount: number;
  monthOrderCount: number;
  openFollowupCount: number;
  overdueFollowupCount: number;
  industryCounts: Array<{ label: string; value: number }>;
  materialCounts: Array<{ label: string; value: number }>;
  dailyActivity: Array<{ label: string; value: number }>;
  upcomingFollowups: CustomerFollowup[];
  recentCustomers: KnowledgeCustomer[];
};

export type ServiceKnowledgeResult = {
  id: string;
  type: "conversation" | "quote" | "order";
  memberId: string;
  customerName: string;
  company: string | null;
  title: string;
  excerpt: string;
  status: string;
  at: string;
  href: string;
};

const EMPTY_PROFILE: Omit<CustomerProfile, "member_id"> = {
  industry: null,
  customer_tier: "standard",
  tags: [],
  preferred_contact: null,
  preferred_materials: [],
  preferred_products: [],
  preferred_processing: [],
  preferred_delivery: [],
  common_sizes: [],
  price_sensitivity: "medium",
  ai_summary: null,
  service_notes: null,
  last_summary_at: null,
};

type DemoCollections = {
  members: MemberRow[];
  profiles: CustomerProfile[];
  sessions: any[];
  quotes: any[];
  orders: any[];
  followups: any[];
};

async function loadDemoCollections(): Promise<DemoCollections> {
  const db = createAdminSupabase();
  if (!db) return { members: [], profiles: [], sessions: [], quotes: [], orders: [], followups: [] };
  const [members, profiles, sessions, quotes, orders, followups] = await Promise.all([
    db.from("members").select("id,name,company,phone,phone_display,email,status,payment_terms,paid_order_count,created_at,updated_at").eq("is_demo", true).limit(100),
    db.from("customer_profiles").select("member_id,industry,customer_tier,tags,preferred_contact,preferred_materials,preferred_products,preferred_processing,preferred_delivery,common_sizes,price_sensitivity,ai_summary,service_notes,last_summary_at").eq("is_demo", true).limit(100),
    db.from("intake_sessions").select("id,session_id,member_id,messages,status,submitted_count,last_file_name,created_at,updated_at").eq("is_demo", true).limit(200),
    db.from("quotes").select("id,quote_no,member_id,title,amount,status,items,created_at,updated_at").eq("is_demo", true).limit(200),
    db.from("work_orders").select("id,order_no,member_id,design_name,product_name,material_raw,processing_items,file_name,status,created_at,updated_at").eq("is_demo", true).limit(300),
    db.from("customer_followups").select("id,member_id,title,reason,priority,status,assignee,due_at,completed_at,created_at,updated_at").eq("is_demo", true).limit(200),
  ]);
  for (const result of [members, profiles, sessions, quotes, orders, followups]) {
    if (result.error) console.error("[customer-knowledge] query failed", result.error.message);
  }
  return {
    members: (members.data as MemberRow[]) ?? [],
    profiles: (profiles.data as CustomerProfile[]) ?? [],
    sessions: sessions.data ?? [],
    quotes: quotes.data ?? [],
    orders: orders.data ?? [],
    followups: followups.data ?? [],
  };
}

function latest(values: Array<string | null | undefined>): string | null {
  return values.filter(Boolean).sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0] ?? null;
}

function toFollowup(row: any, member?: MemberRow): CustomerFollowup {
  return {
    id: row.id,
    memberId: row.member_id,
    customerName: member?.name ?? "未知客戶",
    company: member?.company ?? null,
    title: row.title,
    reason: row.reason ?? null,
    priority: row.priority,
    status: row.status,
    assignee: row.assignee ?? null,
    dueAt: row.due_at,
    completedAt: row.completed_at ?? null,
    createdAt: row.created_at,
  };
}

function buildCustomers(data: DemoCollections): KnowledgeCustomer[] {
  const profileByMember = new Map(data.profiles.map((profile) => [profile.member_id, profile]));
  return data.members.map((member) => {
    const sessions = data.sessions.filter((row) => row.member_id === member.id);
    const quotes = data.quotes.filter((row) => row.member_id === member.id);
    const orders = data.orders.filter((row) => row.member_id === member.id);
    const followups = data.followups.filter((row) => row.member_id === member.id);
    return {
      id: member.id,
      name: member.name,
      company: member.company,
      phone: member.phone,
      phoneDisplay: member.phone_display || member.phone,
      email: member.email,
      status: member.status,
      paymentTerms: member.payment_terms,
      paidOrderCount: member.paid_order_count,
      createdAt: member.created_at,
      profile: profileByMember.get(member.id) ?? { member_id: member.id, ...EMPTY_PROFILE },
      lastInteractionAt: latest([
        member.updated_at,
        ...sessions.map((row) => row.updated_at),
        ...quotes.map((row) => row.updated_at),
        ...orders.map((row) => row.updated_at),
        ...followups.map((row) => row.updated_at),
      ]),
      sessionCount: sessions.length,
      quoteCount: quotes.length,
      orderCount: orders.length,
      openFollowupCount: followups.filter((row) => row.status === "open").length,
    };
  });
}

export async function listKnowledgeCustomers(filters: CustomerFilters = {}): Promise<KnowledgeCustomer[]> {
  const customers = buildCustomers(await loadDemoCollections());
  return customers
    .filter((customer) => matchesCustomerFilters({
      name: customer.name,
      company: customer.company,
      phone: customer.phone,
      industry: customer.profile.industry,
      customerTier: customer.profile.customer_tier,
      status: customer.status,
      tags: customer.profile.tags,
    }, filters))
    .sort((a, b) => new Date(b.lastInteractionAt ?? 0).getTime() - new Date(a.lastInteractionAt ?? 0).getTime());
}

export async function getKnowledgeCustomer(id: string): Promise<KnowledgeCustomerDetail | null> {
  const data = await loadDemoCollections();
  const customer = buildCustomers(data).find((item) => item.id === id);
  if (!customer) return null;
  const member = data.members.find((item) => item.id === id);
  const followups = data.followups.filter((row) => row.member_id === id).map((row) => toFollowup(row, member));
  const timeline = mergeCustomerTimeline({
    sessions: data.sessions.filter((row) => row.member_id === id).map((row) => ({
      id: row.id, at: row.updated_at, title: "客戶對話與需求", detail: (row.messages ?? []).map((message: any) => message.text).join("　"), status: row.status,
    })),
    quotes: data.quotes.filter((row) => row.member_id === id).map((row) => ({
      id: row.id, at: row.updated_at, title: `${row.quote_no}｜${row.title}`, detail: `報價 NT$ ${Number(row.amount).toLocaleString("zh-TW")}`, status: row.status,
    })),
    orders: data.orders.filter((row) => row.member_id === id).map((row) => ({
      id: row.id, at: row.updated_at, title: `${row.order_no}｜${row.design_name || row.product_name || row.file_name}`, detail: [row.material_raw, row.processing_items].filter(Boolean).join(" · "), status: row.status,
    })),
    followups: followups.map((row) => ({ id: row.id, at: row.dueAt, title: row.title, detail: row.reason ?? "", status: row.status })),
  });
  return { ...customer, timeline, followups };
}

function countBy(values: string[]): Array<{ label: string; value: number }> {
  const counts = new Map<string, number>();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export async function getDemoDashboard(now = new Date()): Promise<DemoDashboard> {
  const data = await loadDemoCollections();
  const customers = buildCustomers(data);
  const membersById = new Map(data.members.map((row) => [row.id, row]));
  const followups = data.followups.map((row) => toFollowup(row, membersById.get(row.member_id)));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  // 圖表呈現事件發生日；updated_at 會因 Demo upsert trigger 全部變成灌資料當下，不能代表互動分布。
  const activityDates = [...data.sessions.map((row) => row.created_at), ...data.quotes.map((row) => row.created_at), ...data.orders.map((row) => row.created_at)];
  const dailyActivity = buildDailyActivity(activityDates, now);
  return {
    customerCount: customers.length,
    newThisMonth: customers.filter((row) => new Date(row.createdAt).getTime() >= monthStart).length,
    activeQuoteCount: data.quotes.filter((row) => ["draft", "sent"].includes(row.status)).length,
    monthOrderCount: data.orders.filter((row) => new Date(row.created_at).getTime() >= monthStart).length,
    openFollowupCount: followups.filter((row) => row.status === "open").length,
    overdueFollowupCount: followups.filter((row) => row.status === "open" && new Date(row.dueAt).getTime() < todayStart).length,
    industryCounts: countBy(customers.map((row) => row.profile.industry ?? "其他")),
    materialCounts: countBy(customers.flatMap((row) => row.profile.preferred_materials)).slice(0, 6),
    dailyActivity,
    upcomingFollowups: followups.filter((row) => row.status === "open").sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()).slice(0, 5),
    recentCustomers: customers.slice(0, 5),
  };
}

export async function listFollowups(): Promise<CustomerFollowup[]> {
  const data = await loadDemoCollections();
  const members = new Map(data.members.map((row) => [row.id, row]));
  return data.followups.map((row) => toFollowup(row, members.get(row.member_id))).sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
}

export async function searchServiceKnowledge(query = "", type = "all"): Promise<ServiceKnowledgeResult[]> {
  const data = await loadDemoCollections();
  const members = new Map(data.members.map((row) => [row.id, row]));
  const results: ServiceKnowledgeResult[] = [];
  if (type === "all" || type === "conversation") {
    for (const row of data.sessions) {
      const member = members.get(row.member_id);
      const excerpt = (row.messages ?? []).map((message: any) => message.text).join("　");
      results.push({ id: row.id, type: "conversation", memberId: row.member_id, customerName: member?.name ?? "未知客戶", company: member?.company ?? null, title: "對話與需求紀錄", excerpt, status: row.status, at: row.updated_at, href: `/admin/customers/${row.member_id}` });
    }
  }
  if (type === "all" || type === "quote") {
    for (const row of data.quotes) {
      const member = members.get(row.member_id);
      results.push({ id: row.id, type: "quote", memberId: row.member_id, customerName: member?.name ?? "未知客戶", company: member?.company ?? null, title: `${row.quote_no}｜${row.title}`, excerpt: `NT$ ${Number(row.amount).toLocaleString("zh-TW")}`, status: row.status, at: row.updated_at, href: `/admin/customers/${row.member_id}` });
    }
  }
  if (type === "all" || type === "order") {
    for (const row of data.orders) {
      const member = members.get(row.member_id);
      results.push({ id: row.id, type: "order", memberId: row.member_id, customerName: member?.name ?? "未知客戶", company: member?.company ?? null, title: `${row.order_no}｜${row.design_name || row.file_name}`, excerpt: [row.product_name, row.material_raw, row.processing_items].filter(Boolean).join(" · "), status: row.status, at: row.updated_at, href: `/admin/orders/${row.id}` });
    }
  }
  const needle = query.trim().toLocaleLowerCase("zh-TW");
  return results
    .filter((row) => !needle || [row.customerName, row.company, row.title, row.excerpt, row.status].some((value) => String(value ?? "").toLocaleLowerCase("zh-TW").includes(needle)))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 100);
}

export async function updateCustomerProfile(memberId: string, patch: Record<string, unknown>): Promise<CustomerProfile | null> {
  const db = createAdminSupabase();
  if (!db) return null;
  const { data: member } = await db.from("members").select("id").eq("id", memberId).eq("is_demo", true).maybeSingle();
  if (!member) return null;
  const { data, error } = await db.from("customer_profiles").update(patch).eq("member_id", memberId).eq("is_demo", true).select("member_id,industry,customer_tier,tags,preferred_contact,preferred_materials,preferred_products,preferred_processing,preferred_delivery,common_sizes,price_sensitivity,ai_summary,service_notes,last_summary_at").single();
  if (error) return null;
  return data as CustomerProfile;
}

export async function createFollowup(input: { memberId: string; title: string; reason?: string | null; priority: string; assignee?: string | null; dueAt: string }): Promise<CustomerFollowup | null> {
  const db = createAdminSupabase();
  if (!db) return null;
  const { data: member } = await db.from("members").select("id,name,company").eq("id", input.memberId).eq("is_demo", true).maybeSingle();
  if (!member) return null;
  const { data, error } = await db.from("customer_followups").insert({ member_id: input.memberId, title: input.title, reason: input.reason ?? null, priority: input.priority, assignee: input.assignee ?? null, due_at: input.dueAt, status: "open", is_demo: true }).select("*").single();
  if (error) return null;
  return toFollowup(data, member as MemberRow);
}

export async function updateFollowup(id: string, patch: Record<string, unknown>): Promise<CustomerFollowup | null> {
  const db = createAdminSupabase();
  if (!db) return null;
  const { data, error } = await db.from("customer_followups").update(patch).eq("id", id).eq("is_demo", true).select("*").single();
  if (error || !data) return null;
  const { data: member } = await db.from("members").select("id,name,company").eq("id", data.member_id).eq("is_demo", true).maybeSingle();
  return toFollowup(data, member as MemberRow | undefined);
}
