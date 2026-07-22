"use client";

import { useState } from "react";
import type { WorkOrder } from "@/lib/workOrders";

// 檔名帶不出的欄位 → 手動補、PATCH 回存。
const FIELDS: { key: keyof WorkOrder; label: string; type?: string }[] = [
  { key: "customer_no", label: "客戶編號" },
  { key: "customer_phone", label: "客戶電話" },
  { key: "contact_person", label: "聯絡人" },
  { key: "delivery_date", label: "交貨日", type: "date" },
  { key: "delivery_method", label: "交貨方式" },
  { key: "processing_items", label: "加工項目" },
  { key: "receiver", label: "接稿人" },
];

export default function OrderEditForm({ order, className }: { order: WorkOrder; className?: string }) {
  const [form, setForm] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of FIELDS) init[f.key as string] = (order[f.key] as string | null) ?? "";
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/order/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={className}
      style={{ maxWidth: 820, margin: "22px auto 0", background: "#fff", borderRadius: 14, padding: "18px 20px", boxShadow: "0 6px 24px rgba(20,40,80,.06)" }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>補充欄位（檔名帶不出的資訊）</div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14 }}>
        以下欄位無法從檔名判斷，可在此手動填寫後儲存，會即時反映到上方工單。
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
        {FIELDS.map((f) => (
          <label key={f.key as string} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{f.label}</span>
            <input
              type={f.type ?? "text"}
              value={form[f.key as string]}
              onChange={(e) => setForm((s) => ({ ...s, [f.key as string]: e.target.value }))}
              style={{ border: "1px solid var(--line)", borderRadius: 9, padding: "9px 11px", fontSize: 14, outline: "none" }}
            />
          </label>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
        <button
          onClick={save}
          disabled={saving}
          style={{ border: "none", borderRadius: 10, padding: "9px 20px", background: saving ? "#9db4e8" : "var(--brand)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: saving ? "default" : "pointer" }}
        >
          {saving ? "儲存中…" : "儲存補充欄位"}
        </button>
        {saved && <span style={{ fontSize: 13, color: "var(--ok)", fontWeight: 600 }}>已儲存 ✓</span>}
      </div>
    </div>
  );
}
