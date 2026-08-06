import type { CustomerTimelineEvent } from "@/lib/admin/customerKnowledgeView";

const META = {
  conversation: { label: "對話／需求", icon: "對" },
  quote: { label: "報價", icon: "價" },
  order: { label: "稿件／工單", icon: "稿" },
  followup: { label: "回訪", icon: "訪" },
};

function fmt(iso: string): string {
  return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export default function CustomerTimeline({ items }: { items: CustomerTimelineEvent[] }) {
  if (!items.length) return <div className="adm-empty">目前沒有服務歷程。</div>;
  return <div className="adm-timeline">{items.map((item) => {
    const meta = META[item.type];
    return <article key={`${item.type}-${item.id}`}><i aria-hidden="true">{meta.icon}</i><div><header><span>{meta.label}</span><time>{fmt(item.at)}</time></header><h3>{item.title}</h3>{item.detail ? <p>{item.detail}</p> : null}<small>{item.status}</small>{item.type === "order" ? <a href={`/admin/orders/${item.id}`}>查看工單</a> : null}</div></article>;
  })}</div>;
}
