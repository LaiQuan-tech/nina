"use client";

import { useState } from "react";
import { saveLastPhone } from "@/components/intake/contactStorage";

export type Contact = { name: string; email: string; phone: string; company?: string };

/**
 * 收稿前的聯絡資訊表單，同時也是「無痛入會」的入口 ——
 * 送出時 /api/member/quick-start 會一併建案件、建/認會員、發登入 cookie，
 * 客戶不會感覺到自己註冊了。
 *
 * 只有一種情況會多一步：這支手機已經設過密碼（回 password_required），
 * 此時就地展開密碼欄，驗過才放行。這是為了不讓「知道手機號碼」等於「變成那個人」。
 */
export default function ContactGate({
  onReady,
  initial,
  initialPhone,
}: {
  onReady: (sessionId: string, contact: Contact, status: string) => void;
  initial?: Contact | null;
  initialPhone?: string;
}) {
  const [form, setForm] = useState<Contact>(
    initial ?? { name: "", email: "", phone: initialPhone ?? "", company: "" }
  );
  const [remember, setRemember] = useState(true);
  const [needPassword, setNeedPassword] = useState(false);
  const [password, setPassword] = useState("");
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
      const res = await fetch("/api/member/quick-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          ...form,
          remember,
          ...(needPassword ? { password } : {}),
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        message?: string;
        member?: { status: string };
      };

      if (data.ok) {
        if (remember) saveLastPhone(form.phone);
        onReady(sessionId, form, data.member?.status ?? "guest");
        return;
      }
      if (data.error === "password_required") {
        setNeedPassword(true);
        setError(data.message ?? "這支手機已經註冊過，請輸入密碼登入");
        return;
      }
      setError(data.message ?? "送出失敗，請確認資料後再試一次。");
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
            value={form[f.k] ?? ""}
            onChange={(e) => set(f.k, e.target.value)}
            placeholder={f.ph}
            required
          />
        </label>
      ))}

      {needPassword && (
        <label className="mei-field" htmlFor="ct-pw">
          <span className="mei-flabel">密碼</span>
          <input
            id="ct-pw"
            className="mei-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="這支手機已註冊，請輸入密碼"
            required
            autoFocus
          />
        </label>
      )}

      <label className="mei-check">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        <span>下次自動登入（免再填聯絡資訊）</span>
      </label>

      {error && (
        <p className="mei-alert" role="alert" style={{ margin: "10px 0 12px" }}>
          {error}
        </p>
      )}

      <button type="submit" disabled={loading} className="mei-btn mei-btn-primary" style={{ width: "100%", minHeight: 48 }}>
        {loading ? "處理中…" : needPassword ? "登入並開始上傳" : "開始上傳印刷檔"}
      </button>

      <p className="mei-note" style={{ marginTop: 14, fontSize: 13 }}>
        已經是會員？
        <a href="/login?next=/upload" style={{ color: "var(--mei-accent)", fontWeight: 700 }}>
          登入
        </a>
      </p>
    </form>
  );
}
