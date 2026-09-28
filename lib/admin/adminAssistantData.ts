import {
  buildFallbackAssistantReply,
  classifyAdminAssistantIntent,
  classifyFollowupTimeScope,
  type AdminAssistantIntent,
  type AdminAssistantSnapshot,
} from "./adminAssistant";
import {
  buildDemoDashboard,
  buildFollowupList,
  buildServiceKnowledge,
  filterKnowledgeCustomers,
  loadDemoCollections,
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
  // 每題只載一次 Demo 資料、四個視角共用（以前四支函式各撈一整包＝每題 24 個查詢；這裡跑在 route handler，
  // 不在 RSC 渲染裡，不能指望 React cache 去重）。不撈對話 jsonb：小幫手只用報價／工單的摘錄，
  // 對話紀錄在下面就被濾掉了，而且查詢字串是空的、不需要全文比對。
  const data = await loadDemoCollections(false);
  const dashboard = buildDemoDashboard(data);
  const customers = filterKnowledgeCustomers(data, customerFilters);
  const allFollowups = buildFollowupList(data);
  const records = buildServiceKnowledge(data, "", recordType);

  let followups = allFollowups.filter((item) => item.status === "open");
  const followupScope = classifyFollowupTimeScope(query);
  if (followupScope === "overdue") followups = bucketFollowups(followups).overdue;
  else if (followupScope === "today") followups = bucketFollowups(followups).today;

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
