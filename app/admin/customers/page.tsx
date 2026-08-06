import AdminShell from "@/components/admin/AdminShell";
import CustomerKnowledgeList from "@/components/admin/CustomerKnowledgeList";
import { listKnowledgeCustomers } from "@/lib/admin/customerKnowledge";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const INDUSTRIES = ["餐飲零售", "活動行銷", "婚禮企劃", "建設營造", "品牌零售", "展覽市集", "醫療空間", "文化展演"];

export default async function CustomersPage({ searchParams }: { searchParams?: { q?: string; tier?: string; industry?: string; status?: string } }) {
  const customers = await listKnowledgeCustomers({
    query: searchParams?.q,
    customerTier: searchParams?.tier,
    industry: searchParams?.industry,
    status: searchParams?.status,
  });
  return (
    <AdminShell>
      <main className="adm-crm-page">
        <header className="adm-crm-title"><div><div className="adm-demo-tag">CUSTOMER MEMORY</div><h1>客戶知識庫</h1><p>搜尋客戶身份、偏好、服務摘要與歷史脈絡。</p></div><span className="adm-result-count">{customers.length} 位客戶</span></header>
        <form className="adm-filter-bar" action="/admin/customers">
          <label><span>搜尋</span><input name="q" defaultValue={searchParams?.q} placeholder="公司、聯絡人、手機或標籤" /></label>
          <label><span>客戶等級</span><select name="tier" defaultValue={searchParams?.tier || "all"}><option value="all">全部</option><option value="vip">高價值</option><option value="growth">成長</option><option value="standard">一般</option></select></label>
          <label><span>產業</span><select name="industry" defaultValue={searchParams?.industry || "all"}><option value="all">全部</option>{INDUSTRIES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>狀態</span><select name="status" defaultValue={searchParams?.status || "all"}><option value="all">全部</option><option value="active">啟用</option><option value="guest">訪客</option></select></label>
          <button type="submit">套用篩選</button>
          <a href="/admin/customers">清除</a>
        </form>
        <CustomerKnowledgeList customers={customers} />
      </main>
    </AdminShell>
  );
}
