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
      <p className="mei-note" style={{ margin: "0 0 12px" }}>
        歡迎回來，已記住您的聯絡資訊。
      </p>

      <div className="mei-card-box">
        <div style={{ fontWeight: 700 }}>{contact.name}</div>
        <div style={{ color: "var(--mei-text-2)" }}>{contact.email}</div>
        <div style={{ color: "var(--mei-text-2)" }}>{contact.phone}</div>
      </div>

      <button onClick={go} disabled={loading} className="mei-btn mei-btn-primary" style={{ width: "100%", minHeight: 48 }}>
        {loading ? "處理中…" : "開始上傳印刷檔"}
      </button>
      <button onClick={onSwitch} className="mei-link" style={{ width: "100%", marginTop: 6 }}>
        改用其他聯絡方式
      </button>
    </div>
  );
}
