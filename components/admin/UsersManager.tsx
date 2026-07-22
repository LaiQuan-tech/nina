"use client";

import { useState } from "react";
import type { AdminUser } from "@/lib/adminUsers";

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
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

      <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 18px rgba(20,40,80,.05)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.6fr 1fr 0.8fr 0.8fr", fontSize: 12.5, color: "#6b7280", fontWeight: 600, padding: "12px 18px", borderBottom: "1px solid #eef0f3" }}>
          <div>姓名</div>
          <div>Email</div>
          <div>最後登入</div>
          <div>狀態</div>
          <div>操作</div>
        </div>
        {users.map((u) => (
          <div key={u.id} style={{ display: "grid", gridTemplateColumns: "1.2fr 1.6fr 1fr 0.8fr 0.8fr", fontSize: 13.5, padding: "13px 18px", borderBottom: "1px solid #f2f4f7", alignItems: "center" }}>
            <div style={{ fontWeight: 600 }}>{u.name || "—"}</div>
            <div style={{ color: "#4b5563", wordBreak: "break-all" }}>{u.email}</div>
            <div style={{ color: "#6b7280", fontSize: 12.5 }}>{fmt(u.last_login_at)}</div>
            <div>
              <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 9px", borderRadius: 980, background: u.active ? "#dcfce7" : "#f3f4f6", color: u.active ? "#15803d" : "#6b7280" }}>
                {u.active ? "啟用" : "停用"}
              </span>
            </div>
            <div>
              <button onClick={() => toggle(u)} style={{ fontSize: 12.5, background: "transparent", border: "1px solid #d1d5db", borderRadius: 8, padding: "5px 10px", cursor: "pointer", color: "#374151" }}>
                {u.active ? "停用" : "啟用"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { border: "1px solid #d1d5db", borderRadius: 9, padding: "10px 12px", fontSize: 14, outline: "none" };
