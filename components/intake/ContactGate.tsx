"use client";

import { useState } from "react";
import { saveContact, clearContact } from "@/components/intake/contactStorage";

export type Contact = { name: string; email: string; phone: string };

// 收稿前的聯絡資訊表單：姓名/Email/手機（三欄必填）。
// 送出 → 產 sessionId + POST /api/session 建案件 → onReady(sessionId, contact)。
// 勾「記住」→ 存 localStorage，下次直接跳「歡迎回來」免再填。
export default function ContactGate({
  onReady,
  initial,
}: {
  onReady: (sessionId: string, contact: Contact) => void;
  initial?: Contact | null;
}) {
  const [form, setForm] = useState<Contact>(initial ?? { name: "", email: "", phone: "" });
  const [remember, setRemember] = useState(true);
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
        if (remember) saveContact(form);
        else clearContact();
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
    <form onSubmit={submit}>
      <p className="mei-note" style={{ margin: "0 0 14px" }}>
        先留個聯絡方式，方便後續聯繫與追蹤稿件。
      </p>

      {(
        [
          { k: "name", label: "姓名", type: "text", ph: "您的姓名", ac: "name" },
          { k: "email", label: "EMAIL", type: "email", ph: "you@example.com", ac: "email" },
          { k: "phone", label: "手機", type: "tel", ph: "0912345678", ac: "tel" },
        ] as const
      ).map((f) => (
        <label key={f.k} className="mei-field" htmlFor={`ct-${f.k}`}>
          <span className="mei-flabel">{f.label}</span>
          <input
            id={`ct-${f.k}`}
            className="mei-input"
            type={f.type}
            autoComplete={f.ac}
            value={form[f.k]}
            onChange={(e) => set(f.k, e.target.value)}
            placeholder={f.ph}
            required
          />
        </label>
      ))}

      <label className="mei-check">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        <span>記住我的聯絡資訊（下次免再填）</span>
      </label>

      {error && (
        <p className="mei-alert" role="alert" style={{ margin: "10px 0 12px" }}>
          {error}
        </p>
      )}

      <button type="submit" disabled={loading} className="mei-btn mei-btn-primary" style={{ width: "100%", minHeight: 48 }}>
        {loading ? "處理中…" : "開始上傳印刷檔"}
      </button>
    </form>
  );
}
