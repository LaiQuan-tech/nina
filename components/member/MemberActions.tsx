"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** 登出。 */
export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="mei-btn mei-btn-ghost"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/member/login", { method: "DELETE" }).catch(() => {});
        router.replace("/");
        router.refresh();
      }}
    >
      {busy ? "登出中…" : "登出"}
    </button>
  );
}

/**
 * guest 升級：設定密碼。
 * 沒設密碼的話換一台裝置就進不來（我們不能只憑手機號碼放行），所以這張卡片要明顯。
 */
export function SetPasswordCard() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const d = (await fetch("/api/member/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      }).then((r) => r.json())) as { ok: boolean; message?: string };
      if (d.ok) {
        setMsg({ tone: "ok", text: "密碼已設定，之後換手機也能登入。" });
        setPw("");
        router.refresh();
      } else {
        setMsg({ tone: "err", text: d.message || "設定失敗" });
      }
    } catch {
      setMsg({ tone: "err", text: "連線出了點問題，請稍後再試。" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mei-notice">
      <p className="t">設定密碼，換手機也能查紀錄</p>
      <p className="d">
        您目前是用這台裝置的登入狀態在查看。設一組密碼之後，換手機或換電腦都能登入。
      </p>
      <div className="row">
        <label htmlFor="sp-pw" className="mei-flabel" style={{ position: "absolute", left: -9999 }}>
          新密碼
        </label>
        <input
          id="sp-pw"
          className="mei-input"
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="至少 6 碼"
          autoComplete="new-password"
          required
        />
        <button type="submit" disabled={busy} className="mei-btn mei-btn-primary">
          {busy ? "設定中…" : "設定密碼"}
        </button>
      </div>
      {msg && (
        <p className="d" style={{ color: msg.tone === "ok" ? "var(--mei-ink)" : "var(--mei-accent)", fontWeight: 600 }}>
          {msg.text}
        </p>
      )}
    </form>
  );
}
