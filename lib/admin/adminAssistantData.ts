import {
  buildFallbackAssistantReply,
  classifyAdminAssistantIntent,
  type AdminAssistantIntent,
  type AdminAssistantSnapshot,
} from "./adminAssistant";
import {
  getDemoDashboard,
  listFollowups,
  listKnowledgeCustomers,
  searchServiceKnowledge,
} from "./customerKnowledge";
import { bucketFollowups } from "./customerKnowledgeView";

export type AdminAssistantLink = { label: string; href: string };

export type AdminAssistantReport = {
  intent: AdminAssistantIntent;
  snapshot: AdminAssistantSnapshot;
  fallback: string;
  links: AdminAssistantLink[];
};

export async function buildAdminAssistantReport(query: string): Promise<AdminAssistantReport> {
  const intent = classifyAdminAssistantIntent(query);
  const customerFilters = intent === "customers" && /vip/i.test(query) ? { customerTier: "vip" } : {};
  const recordType = intent === "quotes" ? "quote" : intent === "orders" ? "order" : "all";
  const [dashboard, customers, allFollowups, records] = await Promise.all([
    getDemoDashboard(),
    listKnowledgeCustomers(customerFilters),
    listFollowups(),
    searchServiceKnowledge("", recordType),
  ]);

  let followups = allFollowups.filter((item) => item.status === "open");
  if (/逾期/.test(query)) followups = bucketFollowups(followups).overdue;
  if (/今天|今日/.test(query)) followups = bucketFollowups(followups).today;

  const snapshot: AdminAssistantSnapshot = {
    generatedAt: new Date().toISOString(),
    dashboard: {
      customerCount: dashboard.customerCount,
      newThisMonth: dashboard.newThisMonth,
      activeQuoteCount: dashboard.activeQuoteCount,
      monthOrderCount: dashboard.monthOrderCount,
      openFollowupCount: dashboard.openFollowupCount,
      overdueFollowupCount: dashboard.overdueFollowupCount,
    },
    customers: customers.slice(0, 10).map((item) => ({
      id: item.id,
      name: item.name,
      company: item.company,
      tier: item.profile.customer_tier,
      industry: item.profile.industry,
      tags: item.profile.tags,
      orderCount: item.orderCount,
      openFollowupCount: item.openFollowupCount,
    })),
    followups: followups.slice(0, 12).map((item) => ({
      id: item.id,
      customerName: item.customerName,
      company: item.company,
      title: item.title,
      priority: item.priority,
      dueAt: item.dueAt,
    })),
    records: records
      .filter((item): item is typeof item & { type: "quote" | "order" } => item.type === "quote" || item.type === "order")
      .slice(0, 12)
      .map((item) => ({
        id: item.id,
        type: item.type,
        customerName: item.customerName,
        company: item.company,
        title: item.title,
        excerpt: item.excerpt,
        status: item.status,
        at: item.at,
      })),
    materials: dashboard.materialCounts,
  };

  const links: AdminAssistantLink[] = [];
  if (intent === "customers") {
    for (const item of customers.slice(0, 3)) links.push({ label: item.company || item.name, href: `/admin/customers/${item.id}` });
    links.push({ label: "查看客戶知識庫", href: "/admin/customers" });
  } else if (intent === "followups") {
    links.push({ label: "開啟追蹤與回訪", href: "/admin/followups" });
  } else if (intent === "quotes" || intent === "orders") {
    links.push({ label: "搜尋完整服務紀錄", href: `/admin/knowledge?type=${intent === "quotes" ? "quote" : "order"}` });
  } else if (intent === "overview" || intent === "general") {
    links.push({ label: "查看營運總覽", href: "/admin" });
    links.push({ label: "處理逾期回訪", href: "/admin/followups" });
  } else {
    links.push({ label: "查看服務知識庫", href: "/admin/knowledge" });
  }

  return { intent, snapshot, fallback: buildFallbackAssistantReply(intent, snapshot), links };
}
