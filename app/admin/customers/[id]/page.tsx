import { notFound } from "next/navigation";
import AdminShell from "@/components/admin/AdminShell";
import CustomerProfileEditor from "@/components/admin/CustomerProfileEditor";
import CustomerTimeline from "@/components/admin/CustomerTimeline";
import { getKnowledgeCustomer } from "@/lib/admin/customerKnowledge";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const customer = await getKnowledgeCustomer(params.id);
  if (!customer) notFound();
  return <AdminShell><main className="adm-crm-page">
    <a className="adm-back-link" href="/admin/customers">← 回客戶知識庫</a>
    <header className="adm-customer-hero"><div><div className="adm-demo-tag">DEMO CUSTOMER</div><h1>{customer.company || customer.name}</h1><p>{customer.name} · {customer.phoneDisplay} · {customer.email}</p></div><div className="adm-hero-metrics"><span><b>{customer.orderCount}</b>工單</span><span><b>{customer.quoteCount}</b>報價</span><span><b>{customer.openFollowupCount}</b>待回訪</span></div></header>
    <section className="adm-summary-grid">
      <article className="adm-ai-summary"><span>AI SERVICE SUMMARY</span><h2>客戶服務重點</h2><p>{customer.profile.ai_summary || "尚無摘要"}</p><small>{customer.profile.service_notes}</small></article>
      <article className="adm-preference-card"><h2>偏好記憶</h2><dl><div><dt>聯絡</dt><dd>{customer.profile.preferred_contact || "—"}</dd></div><div><dt>材質</dt><dd>{customer.profile.preferred_materials.join("、") || "—"}</dd></div><div><dt>加工</dt><dd>{customer.profile.preferred_processing.join("、") || "—"}</dd></div><div><dt>交貨</dt><dd>{customer.profile.preferred_delivery.join("、") || "—"}</dd></div><div><dt>尺寸</dt><dd>{customer.profile.common_sizes.join("、") || "—"}</dd></div></dl></article>
    </section>
    <div className="adm-detail-grid"><CustomerProfileEditor memberId={customer.id} initial={customer.profile} /><section className="adm-panel adm-timeline-panel"><div className="adm-panel-head"><h2>完整服務歷程</h2><span>{customer.timeline.length} 筆</span></div><CustomerTimeline items={customer.timeline} /></section></div>
  </main></AdminShell>;
}
