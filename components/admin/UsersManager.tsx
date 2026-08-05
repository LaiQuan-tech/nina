"use client";

import { useState } from "react";
import type { AdminUser } from "@/lib/adminUsers";

// 手動格式化（Asia/Taipei 固定 UTC+8、台灣無日光節約）。
// 不用 Intl：server 與 client 的 ICU 對 zh-TW + hour12:false 會產生不同結果（00:49 vs 24:49），造成 hydration 不一致。
function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const t = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(t.getUTCMonth() + 1)}/${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

export default function UsersManager({ initial }: { initial: AdminUser[] }) {
  const [users, setUsers] = useState<AdminUser[]>(initial);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const d = await fetch("/api/admin/users").then((r) => r.json());
    if (d.ok) setUsers(d.users);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const d = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }).then((r) => r.json());
      if (d.ok) {
        setMsg({ tone: "ok", text: "已新增管理員" });
        setForm({ name: "", email: "", password: "" });
        await refresh();
      } else {
        setMsg({ tone: "err", text: d.message || "新增失敗" });
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggle(u: AdminUser) {
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id, active: !u.active }),
    });
    await refresh();
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <form onSubmit={add} style={{ background: "#fff", borderRadius: 14, padding: 20, boxShadow: "0 4px 18px rgba(20,40,80,.05)" }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>新增管理員</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 12 }}>
          <input placeholder="姓名（選填）" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} style={inp} />
          <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} style={inp} />
          <input placeholder="密碼（至少 6 碼）" type="text" value={form.password} onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))} style={inp} />
        </div>
        {msg && <div style={{ fontSize: 13.5, marginBottom: 10, color: msg.tone === "ok" ? "#15803d" : "#c0392b" }}>{msg.text}</div>}
        <button type="submit" disabled={busy} style={{ border: "none", borderRadius: 10, padding: "10px 20px", background: busy ? "#9db4e8" : "#2563eb", color: "#fff", fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer" }}>
          {busy ? "新增中…" : "新增管理員"}
        </button>
      </form>

      <div className="adm-table">
        <div className="adm-thead" style={{ gridTemplateColumns: UCOLS }}>
          <div>姓名</div>
          <div>Email</div>
          <div>最後登入</div>
          <div>狀態</div>
          <div>操作</div>
        </div>
        {users.map((u) => (
          <div key={u.id} className="adm-row" style={{ gridTemplateColumns: UCOLS }}>
            <div style={{ fontWeight: 600 }}>{u.name || "—"}</div>
            <div style={{ color: "#4b5563", wordBreak: "break-all" }}>
              <span className="adm-cell-label">Email</span>
              {u.email}
            </div>
            <div style={{ color: "#6b7280", fontSize: 12.5 }}>
              <span className="adm-cell-label">最後登入</span>
              {fmt(u.last_login_at)}
            </div>
            <div>
              <span className="adm-cell-label">狀態</span>
              <span style={{ display: "inline-block", fontSize: 12, fontWeight: 600, padding: "3px 9px", borderRadius: 980, background: u.active ? "#dcfce7" : "#f3f4f6", color: u.active ? "#15803d" : "#6b7280" }}>
                {u.active ? "啟用" : "停用"}
              </span>
            </div>
            <div>
              <button onClick={() => toggle(u)} style={{ fontSize: 12.5, background: "transparent", border: "1px solid #d1d5db", borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: "#374151" }}>
                {u.active ? "停用" : "啟用"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const UCOLS = "1.2fr 1.6fr 1fr 0.8fr 0.8fr";

const inp: React.CSSProperties = { border: "1px solid #d1d5db", borderRadius: 9, padding: "10px 12px", fontSize: 14, outline: "none" };
