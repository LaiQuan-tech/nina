import FollowupBoard from "@/components/admin/FollowupBoard";
import { listFollowups, listKnowledgeCustomers } from "@/lib/admin/customerKnowledge";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FollowupsPage() {
  // 兩者共用同一份 Demo 資料：loadDemoCollections 用 React cache 包起來，這次請求只查一次（以前各撈一整包）。
  const [followups, customers] = await Promise.all([listFollowups(), listKnowledgeCustomers()]);
  // 「新增回訪」的客戶下拉只要 id／公司／姓名；不把整包客戶（含偏好 profile、統計）序列化給前端。
  const customerOptions = customers.map(({ id, company, name }) => ({ id, company, name }));
  return <main className="adm-crm-page wide"><header className="adm-crm-title"><div><div className="adm-demo-tag">SMART FOLLOW-UP</div><h1>追蹤與回訪</h1><p>把逾期、今天與近期回訪集中成可執行的工作清單。</p></div><span className="adm-result-count">{followups.filter((item) => item.status === "open").length} 筆待辦</span></header><FollowupBoard initial={followups} customers={customerOptions} /></main>;
}
