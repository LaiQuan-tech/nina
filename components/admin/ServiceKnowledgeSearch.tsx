import type { ServiceKnowledgeResult } from "@/lib/admin/customerKnowledge";

const TYPE = { conversation: "對話／需求", quote: "報價", order: "稿件／工單" };
const ICON = { conversation: "對", quote: "價", order: "稿" };

function fmt(iso: string): string {
  return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export default function ServiceKnowledgeSearch({ results, query }: { results: ServiceKnowledgeResult[]; query: string }) {
  if (!results.length) return <div className="adm-empty">找不到包含「{query}」的服務紀錄。</div>;
  return <div className="adm-knowledge-results">{results.map((result) => <a href={result.href} key={`${result.type}-${result.id}`}>
    <i aria-hidden="true">{ICON[result.type]}</i>
    <div><header><span>{TYPE[result.type]}</span><time>{fmt(result.at)}</time></header><h2>{result.title}</h2><p>{result.excerpt}</p><footer><b>{result.company || result.customerName}</b><em>{result.status}</em></footer></div>
  </a>)}</div>;
}
