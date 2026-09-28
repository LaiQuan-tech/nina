import ServiceKnowledgeSearch from "@/components/admin/ServiceKnowledgeSearch";
import { searchServiceKnowledge } from "@/lib/admin/customerKnowledge";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function KnowledgePage({ searchParams }: { searchParams?: { q?: string; type?: string } }) {
  const query = searchParams?.q?.trim() || "";
  const type = ["conversation", "quote", "order"].includes(searchParams?.type || "") ? searchParams!.type! : "all";
  const results = await searchServiceKnowledge(query, type);
  return <main className="adm-crm-page">
    <header className="adm-crm-title"><div><div className="adm-demo-tag">SERVICE KNOWLEDGE</div><h1>服務知識庫</h1><p>跨客戶搜尋對話、需求、報價、稿件與工單。</p></div><span className="adm-result-count">{results.length} 筆結果</span></header>
    {/* key 隨網址參數變：只改 search params 的 client 換頁（分頁、上一頁／下一頁、AI 小幫手連結）不會重掛頁面元件，select 的 defaultValue 變了 React 也不會重設，靠 key 讓表單跟著網址重建 */}
    <form key={JSON.stringify(searchParams ?? {})} className="adm-knowledge-search" action="/admin/knowledge">
      <label><span>關鍵字</span><input name="q" defaultValue={query} placeholder="例如：帆布、急件、活動背板" /></label>
      <label><span>資料類型</span><select name="type" defaultValue={type}><option value="all">全部</option><option value="conversation">對話／需求</option><option value="quote">報價</option><option value="order">稿件／工單</option></select></label>
      <button>搜尋知識庫</button>
    </form>
    {!query ? <p className="adm-search-hint">目前顯示最近 100 筆 Demo 服務紀錄；輸入關鍵字可快速縮小範圍。</p> : null}
    <ServiceKnowledgeSearch results={results} query={query} />
  </main>;
}
