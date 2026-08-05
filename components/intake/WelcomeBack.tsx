"use client";

import { useState } from "react";
import type { Contact } from "@/components/intake/ContactGate";

// 回訪客戶：已記住聯絡資訊 → 直接一鍵開始，不用再打字。
export default function WelcomeBack({
  contact,
  onContinue,
  onSwitch,
}: {
  contact: Contact;
  onContinue: () => void | Promise<void>;
  onSwitch: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function go() {
    if (loading) return;
    setLoading(true);
    try {
      await onContinue();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="s-field-label">歡迎回來，已記住您的聯絡資訊</div>
      <div style={{ border: "2px solid var(--s-ink)", background: "var(--s-surface)", padding: 14, fontSize: 14, lineHeight: 1.9, marginBottom: 14 }}>
        <div style={{ fontWeight: 800 }}>{contact.name}</div>
        <div style={{ color: "var(--s-muted)" }}>{contact.email}</div>
        <div style={{ color: "var(--s-muted)" }}>{contact.phone}</div>
      </div>
      <button onClick={go} disabled={loading} className="s-btn s-btn-primary" style={{ width: "100%" }}>
        {loading ? "處理中…" : "開始上傳印刷檔"}
      </button>
      <button
        onClick={onSwitch}
        className="s-btn"
        style={{ width: "100%", marginTop: 10, border: "none", minHeight: 36, fontSize: 13.5, color: "var(--s-dim)", textDecoration: "underline" }}
      >
        改用其他聯絡方式
      </button>
    </div>
  );
}
