import AdminHeader from "@/components/admin/AdminHeader";
import { getIntakeStats } from "@/lib/intakeSessions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, padding: "20px 22px", boxShadow: "0 4px 18px rgba(20,40,80,.05)" }}>
      <div style={{ fontSize: 13, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, marginTop: 6 }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: "#9aa3b0", marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

export default async function AdminOverview() {
  const stats = await getIntakeStats();
  return (
    <>
      <AdminHeader />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 18px" }}>總覽</h1>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
          <StatCard label="收稿案件（總）" value={stats.total} />
          <StatCard label="收件成功案件" value={stats.submitted} hint="至少收到 1 個檔" />
          <StatCard label="今日新案件" value={stats.today} />
          <StatCard label="累積工單數" value={stats.files} hint="每個成功檔一張" />
        </div>
        <div style={{ marginTop: 24 }}>
          <a href="/admin/cases" style={{ fontSize: 14, fontWeight: 600 }}>
            前往收稿案件 →
          </a>
        </div>
      </main>
    </>
  );
}
