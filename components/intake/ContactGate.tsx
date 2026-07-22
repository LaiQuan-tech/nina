"use client";

import { useState } from "react";

export type Contact = { name: string; email: string; phone: string };

// 收稿前的聯絡資訊表單：姓名/Email/手機（三欄必填）。
// 送出 → 產 sessionId + POST /api/session 建案件 → onReady(sessionId, contact)。
export default function ContactGate({ onReady }: { onReady: (sessionId: string, contact: Contact) => void }) {
  const [form, setForm] = useState<Contact>({ name: "", email: "", phone: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof Contact, v: string) => setForm((s) => ({ ...s, [k]: v }));

  function validate(): string | null {
    if (!form.name.trim()) return "請填寫姓名";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "Email 格式不正確";
    if (form.phone.replace(/\D/g, "").length < 8) return "手機號碼不正確";
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setLoading(true);
    setError(null);
    const sessionId =
      globalThis.crypto?.randomUUID?.() ?? `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, ...form }),
      });
      const data = await res.json();
      if (data.ok) {
        onReady(sessionId, form);
      } else {
        setError("送出失敗，請確認資料後再試一次。");
      }
    } catch {
      setError("連線出了點問題，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ background: "var(--panel)", borderRadius: 18, padding: 26, boxShadow: "0 12px 40px rgba(20,40,80,.10)" }}>
      <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>先留個聯絡方式</div>
      <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "0 0 18px", lineHeight: 1.6 }}>
        方便我們後續與您聯繫、追蹤稿件進度。填好後即可開始上傳印刷檔。
      </p>
      {(
        [
          { k: "name", label: "姓名", type: "text", ph: "您的姓名" },
          { k: "email", label: "Email", type: "email", ph: "you@example.com" },
          { k: "phone", label: "手機", type: "tel", ph: "0912345678" },
        ] as const
      ).map((f) => (
        <label key={f.k} style={{ display: "block", marginBottom: 12 }}>
          <span style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 5 }}>{f.label}</span>
          <input
            type={f.type}
            value={form[f.k]}
            onChange={(e) => set(f.k, e.target.value)}
            placeholder={f.ph}
            style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 10, padding: "11px 14px", fontSize: 15, outline: "none", boxSizing: "border-box" }}
          />
        </label>
      ))}
      {error && (
        <div style={{ fontSize: 13.5, color: "var(--err)", background: "#fdecea", padding: "9px 13px", borderRadius: 9, marginBottom: 12 }}>{error}</div>
      )}
      <button
        type="submit"
        disabled={loading}
        style={{ width: "100%", border: "none", borderRadius: 12, padding: "13px 16px", background: loading ? "#9db4e8" : "var(--brand)", color: "#fff", fontSize: 15, fontWeight: 600, cursor: loading ? "default" : "pointer" }}
      >
        {loading ? "處理中…" : "開始上傳印刷檔"}
      </button>
    </form>
  );
}
