import AdminShell from "@/components/admin/AdminShell";
import FollowupBoard from "@/components/admin/FollowupBoard";
import { listFollowups, listKnowledgeCustomers } from "@/lib/admin/customerKnowledge";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FollowupsPage() {
  const [followups, customers] = await Promise.all([listFollowups(), listKnowledgeCustomers()]);
  return <AdminShell><main className="adm-crm-page wide"><header className="adm-crm-title"><div><div className="adm-demo-tag">SMART FOLLOW-UP</div><h1>追蹤與回訪</h1><p>把逾期、今天與近期回訪集中成可執行的工作清單。</p></div><span className="adm-result-count">{followups.filter((item) => item.status === "open").length} 筆待辦</span></header><FollowupBoard initial={followups} customers={customers} /></main></AdminShell>;
}
