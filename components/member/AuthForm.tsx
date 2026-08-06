"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CONTACT } from "@/lib/site/content";

type Mode = "login" | "register";

// 登入與自助註冊共用一張表單（欄位差在註冊多姓名/公司/Email）。
export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/member";

  const [form, setForm] = useState({ phone: "", password: "", name: "", company: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((s) => ({ ...s, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const url = mode === "login" ? "/api/member/login" : "/api/member/register";
      const payload =
        mode === "login"
          ? { phone: form.phone, password: form.password }
          : {
              phone: form.phone,
              password: form.password,
              name: form.name,
              company: form.company,
              email: form.email,
            };
      const d = (await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((r) => r.json())) as { ok: boolean; message?: string };

      if (d.ok) {
        router.replace(next);
        router.refresh();
      } else {
        setError(d.message || (mode === "login" ? "登入失敗" : "註冊失敗"));
      }
    } catch {
      setError("連線出了點問題，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: 420 }}>
      {mode === "register" && (
        <>
          <label className="mei-field" htmlFor="rg-name">
            <span className="mei-flabel">姓名</span>
            <input
              id="rg-name"
              className="mei-input"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              autoComplete="name"
              required
            />
          </label>
          <label className="mei-field" htmlFor="rg-company">
            <span className="mei-flabel">公司寶號（選填）</span>
            <input
              id="rg-company"
              className="mei-input"
              value={form.company}
              onChange={(e) => set("company", e.target.value)}
              autoComplete="organization"
            />
          </label>
        </>
      )}

      <label className="mei-field" htmlFor="au-phone">
        <span className="mei-flabel">手機（帳號）</span>
        <input
          id="au-phone"
          className="mei-input"
          type="tel"
          inputMode="numeric"
          value={form.phone}
          onChange={(e) => set("phone", e.target.value)}
          placeholder="0912345678"
          autoComplete="tel"
          required
        />
      </label>

      {mode === "register" && (
        <label className="mei-field" htmlFor="rg-email">
          <span className="mei-flabel">EMAIL（選填）</span>
          <input
            id="rg-email"
            className="mei-input"
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            autoComplete="email"
          />
        </label>
      )}

      <label className="mei-field" htmlFor="au-pw">
        <span className="mei-flabel">密碼{mode === "register" ? "（至少 6 碼）" : ""}</span>
        <input
          id="au-pw"
          className="mei-input"
          type="password"
          value={form.password}
          onChange={(e) => set("password", e.target.value)}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
        />
      </label>

      {error && (
        <p className="mei-alert" role="alert">
          {error}
        </p>
      )}

      <button type="submit" disabled={busy} className="mei-btn mei-btn-primary" style={{ width: "100%", minHeight: 48 }}>
        {busy ? "處理中…" : mode === "login" ? "登入" : "建立帳號"}
      </button>

      <p className="mei-note" style={{ marginTop: 18 }}>
        {mode === "login" ? (
          <>
            還不是會員？
            <a href="/register" style={{ color: "var(--mei-accent)", fontWeight: 700 }}>
              自助註冊
            </a>
            <br />
            忘記密碼？請聯絡專員{" "}
            <a href={CONTACT.phoneHref} style={{ color: "var(--mei-accent)" }}>
              {CONTACT.phone}
            </a>{" "}
            或加{" "}
            <a href={CONTACT.line} target="_blank" rel="noopener noreferrer" style={{ color: "var(--mei-accent)" }}>
              LINE
            </a>
            ，我們協助重設。
          </>
        ) : (
          <>
            已經有帳號了？
            <a href="/login" style={{ color: "var(--mei-accent)", fontWeight: 700 }}>
              登入
            </a>
            <br />
            也可以直接到
            <a href="/upload" style={{ color: "var(--mei-accent)" }}>
              上傳稿件
            </a>
            填聯絡資訊，系統會自動幫您建立帳號。
          </>
        )}
      </p>
    </form>
  );
}
