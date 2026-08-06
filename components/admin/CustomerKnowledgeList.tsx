import type { KnowledgeCustomer } from "@/lib/admin/customerKnowledge";

const TIER: Record<string, string> = { vip: "高價值", growth: "成長", standard: "一般" };

function relative(iso: string | null): string {
  if (!iso) return "尚無互動";
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  return days === 0 ? "今天" : `${days} 天前`;
}

export default function CustomerKnowledgeList({ customers }: { customers: KnowledgeCustomer[] }) {
  if (customers.length === 0) return <div className="adm-empty">找不到符合條件的 Demo 客戶，請調整搜尋或篩選條件。</div>;
  return (
    <div className="adm-customer-grid">
      {customers.map((customer) => (
        <a className="adm-customer-card" href={`/admin/customers/${customer.id}`} key={customer.id}>
          <div className="adm-customer-card-top">
            <span className="adm-demo-tag">DEMO</span>
            <em data-tier={customer.profile.customer_tier}>{TIER[customer.profile.customer_tier]}</em>
          </div>
          <h2>{customer.company || customer.name}</h2>
          <p>{customer.name} · {customer.phoneDisplay}</p>
          <div className="adm-tag-row">{customer.profile.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div>
          <dl>
            <div><dt>最近互動</dt><dd>{relative(customer.lastInteractionAt)}</dd></div>
            <div><dt>案件／工單</dt><dd>{customer.sessionCount}／{customer.orderCount}</dd></div>
            <div><dt>報價</dt><dd>{customer.quoteCount}</dd></div>
            <div><dt>待回訪</dt><dd className={customer.openFollowupCount ? "attention" : ""}>{customer.openFollowupCount}</dd></div>
          </dl>
        </a>
      ))}
    </div>
  );
}
