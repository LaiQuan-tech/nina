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
    <div style={{ background: "var(--panel)", borderRadius: 18, padding: 26, boxShadow: "0 12px 40px rgba(20,40,80,.10)" }}>
      <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>歡迎回來，{contact.name} 👋</div>
      <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "0 0 16px", lineHeight: 1.6 }}>
        已記住您的聯絡資訊，直接開始上傳即可。
      </p>
      <div style={{ background: "#f6f8fb", borderRadius: 12, padding: "14px 16px", marginBottom: 16, fontSize: 14, lineHeight: 1.9 }}>
        <div>👤 {contact.name}</div>
        <div style={{ color: "#4b5563" }}>✉️ {contact.email}</div>
        <div style={{ color: "#4b5563" }}>📱 {contact.phone}</div>
      </div>
      <button
        onClick={go}
        disabled={loading}
        style={{ width: "100%", border: "none", borderRadius: 12, padding: "13px 16px", background: loading ? "#9db4e8" : "var(--brand)", color: "#fff", fontSize: 15, fontWeight: 600, cursor: loading ? "default" : "pointer" }}
      >
        {loading ? "處理中…" : "開始上傳印刷檔"}
      </button>
      <button
        onClick={onSwitch}
        style={{ width: "100%", marginTop: 10, border: "none", background: "transparent", color: "var(--muted)", fontSize: 13.5, cursor: "pointer", textDecoration: "underline" }}
      >
        改用其他聯絡方式
      </button>
    </div>
  );
}
