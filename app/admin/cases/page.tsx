import AdminHeader from "@/components/admin/AdminHeader";
import { getIntakeSessions } from "@/lib/intakeSessions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmt(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export default async function CasesPage() {
  const cases = await getIntakeSessions(200);
  return (
    <>
      <AdminHeader />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 6px" }}>收稿案件</h1>
        <p style={{ fontSize: 13.5, color: "#6b7280", margin: "0 0 18px" }}>共 {cases.length} 筆，依最後活動時間排序。</p>

        {cases.length === 0 ? (
          <div style={{ background: "#fff", borderRadius: 14, padding: 40, textAlign: "center", color: "#9aa3b0" }}>目前還沒有案件。</div>
        ) : (
          <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 18px rgba(20,40,80,.05)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.6fr 1fr 0.8fr 0.9fr", gap: 0, fontSize: 12.5, color: "#6b7280", fontWeight: 600, padding: "12px 18px", borderBottom: "1px solid #eef0f3" }}>
              <div>聯絡人</div>
              <div>Email / 手機</div>
              <div>狀態</div>
              <div>收件</div>
              <div>最後活動</div>
            </div>
            {cases.map((c) => {
              const submitted = c.status === "submitted";
              return (
                <a
                  key={c.id}
                  href={`/admin/cases/${c.id}`}
                  style={{ display: "grid", gridTemplateColumns: "1.4fr 1.6fr 1fr 0.8fr 0.9fr", gap: 0, fontSize: 13.5, color: "#1c1c1e", padding: "14px 18px", borderBottom: "1px solid #f2f4f7", textDecoration: "none", alignItems: "center" }}
                >
                  <div style={{ fontWeight: 600 }}>{c.contact_name || "（未填）"}</div>
                  <div style={{ color: "#4b5563", fontSize: 12.5 }}>
                    {c.contact_email || "—"}
                    <br />
                    {c.contact_phone || "—"}
                  </div>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 9px", borderRadius: 980, background: submitted ? "#dcfce7" : "#fef3c7", color: submitted ? "#15803d" : "#b45309" }}>
                      {submitted ? "已收件" : "洽談中"}
                    </span>
                  </div>
                  <div>{c.submitted_count} 件</div>
                  <div style={{ color: "#6b7280", fontSize: 12.5 }}>{fmt(c.updated_at)}</div>
                </a>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
