import { notFound } from "next/navigation";
import AdminHeader from "@/components/admin/AdminHeader";
import TranscriptView from "@/components/admin/TranscriptView";
import { getIntakeSession } from "@/lib/intakeSessions";
import { getWorkOrdersBySession } from "@/lib/workOrders";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{value || "—"}</div>
    </div>
  );
}

export default async function CaseDetailPage({ params }: { params: { id: string } }) {
  const c = await getIntakeSession(params.id);
  if (!c) notFound();
  const orders = await getWorkOrdersBySession(c.session_id);

  return (
    <>
      <AdminHeader />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px 60px" }}>
        <a href="/admin/cases" style={{ fontSize: 14, fontWeight: 600 }}>
          ← 回案件列表
        </a>

        {/* 聯絡資訊 */}
        <section style={{ background: "#fff", borderRadius: 14, padding: 22, marginTop: 14, boxShadow: "0 4px 18px rgba(20,40,80,.05)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{c.contact_name || "（未填姓名）"}</h1>
            <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 9px", borderRadius: 980, background: c.status === "submitted" ? "#dcfce7" : "#fef3c7", color: c.status === "submitted" ? "#15803d" : "#b45309" }}>
              {c.status === "submitted" ? "已收件" : "洽談中"}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
            <Field label="Email" value={c.contact_email} />
            <Field label="手機" value={c.contact_phone} />
            <Field label="成功收件" value={`${c.submitted_count} 件`} />
            <Field label="建立時間" value={fmt(c.created_at)} />
            <Field label="最後活動" value={fmt(c.updated_at)} />
          </div>
        </section>

        {/* 收件工單 */}
        <section style={{ background: "#fff", borderRadius: 14, padding: 22, marginTop: 16, boxShadow: "0 4px 18px rgba(20,40,80,.05)" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>收件工單（{orders.length}）</h2>
          {orders.length === 0 ? (
            <div style={{ color: "#9aa3b0", fontSize: 14 }}>此案件尚未成功收件。</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {orders.map((o) => (
                <a
                  key={o.id}
                  href={`/admin/orders/${o.id}`}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", border: "1px solid #eef0f3", borderRadius: 10, textDecoration: "none", color: "#1c1c1e" }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {o.order_no} · {o.product_name || o.material_raw || ""}
                      {!o.product_matched && <span style={{ color: "#b45309", marginLeft: 8, fontSize: 12 }}>⚠ 非標準商品</span>}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2, wordBreak: "break-all" }}>{o.file_name}</div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#2563eb", flexShrink: 0 }}>檢視 / 列印 →</span>
                </a>
              ))}
            </div>
          )}
        </section>

        {/* 對話紀錄 */}
        <section style={{ background: "#f8f9fb", borderRadius: 14, padding: 22, marginTop: 16, border: "1px solid #eef0f3" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 14px" }}>對話紀錄</h2>
          <TranscriptView messages={c.messages} />
        </section>
      </main>
    </>
  );
}
