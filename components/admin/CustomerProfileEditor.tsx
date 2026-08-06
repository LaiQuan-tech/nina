"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CustomerProfile } from "@/lib/admin/customerKnowledge";

function join(values: string[]): string { return values.join("、"); }
function split(value: string): string[] { return value.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean); }

export default function CustomerProfileEditor({ memberId, initial }: { memberId: string; initial: CustomerProfile }) {
  const router = useRouter();
  const [form, setForm] = useState({
    industry: initial.industry || "", customerTier: initial.customer_tier, preferredContact: initial.preferred_contact || "",
    priceSensitivity: initial.price_sensitivity, tags: join(initial.tags), preferredMaterials: join(initial.preferred_materials),
    preferredProducts: join(initial.preferred_products), preferredProcessing: join(initial.preferred_processing),
    preferredDelivery: join(initial.preferred_delivery), commonSizes: join(initial.common_sizes), aiSummary: initial.ai_summary || "", serviceNotes: initial.service_notes || "",
  });
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [followup, setFollowup] = useState({ title: "確認下一次製作需求", reason: "", priority: "medium", assignee: "王小美", dueAt: "" });

  function field<K extends keyof typeof form>(key: K, value: (typeof form)[K]) { setForm((current) => ({ ...current, [key]: value })); }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setNotice("");
    const response = await fetch(`/api/admin/customers/${memberId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      industry: form.industry, customerTier: form.customerTier, preferredContact: form.preferredContact, priceSensitivity: form.priceSensitivity,
      tags: split(form.tags), preferredMaterials: split(form.preferredMaterials), preferredProducts: split(form.preferredProducts), preferredProcessing: split(form.preferredProcessing),
      preferredDelivery: split(form.preferredDelivery), commonSizes: split(form.commonSizes), aiSummary: form.aiSummary, serviceNotes: form.serviceNotes,
    }) });
    const result = await response.json().catch(() => ({}));
    setNotice(response.ok && result.ok ? "客戶樣貌已更新" : result.message || "儲存失敗"); setBusy(false); if (response.ok) router.refresh();
  }

  async function addFollowup(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setNotice("");
    const response = await fetch("/api/admin/followups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId, ...followup, dueAt: new Date(followup.dueAt).toISOString() }) });
    const result = await response.json().catch(() => ({})); setNotice(response.ok && result.ok ? "回訪提醒已建立" : result.message || "建立失敗"); setBusy(false); if (response.ok) { setFollowup((current) => ({ ...current, reason: "", dueAt: "" })); router.refresh(); }
  }

  return <div className="adm-editor-stack">
    <form className="adm-profile-editor" onSubmit={save}>
      <div className="adm-panel-head"><h2>客戶樣貌與偏好</h2><span>可編輯 Demo 資料</span></div>
      <div className="adm-editor-grid">
        <label><span>產業</span><input value={form.industry} onChange={(e) => field("industry", e.target.value)} /></label>
        <label><span>客戶等級</span><select value={form.customerTier} onChange={(e) => field("customerTier", e.target.value as typeof form.customerTier)}><option value="standard">一般</option><option value="growth">成長</option><option value="vip">高價值</option></select></label>
        <label><span>聯絡偏好</span><input value={form.preferredContact} onChange={(e) => field("preferredContact", e.target.value)} /></label>
        <label><span>價格敏感度</span><select value={form.priceSensitivity} onChange={(e) => field("priceSensitivity", e.target.value as typeof form.priceSensitivity)}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>
        {(["tags", "preferredMaterials", "preferredProducts", "preferredProcessing", "preferredDelivery", "commonSizes"] as const).map((key) => <label key={key}><span>{{ tags: "客戶標籤", preferredMaterials: "常用材質", preferredProducts: "常購產品", preferredProcessing: "常用加工", preferredDelivery: "交貨偏好", commonSizes: "常用尺寸" }[key]}</span><input value={form[key]} onChange={(e) => field(key, e.target.value)} placeholder="以頓號分隔" /></label>)}
        <label className="full"><span>AI 服務摘要</span><textarea rows={5} value={form.aiSummary} onChange={(e) => field("aiSummary", e.target.value)} /></label>
        <label className="full"><span>服務注意事項</span><textarea rows={3} value={form.serviceNotes} onChange={(e) => field("serviceNotes", e.target.value)} /></label>
      </div>
      <button className="adm-action-button" disabled={busy}>{busy ? "儲存中…" : "儲存客戶知識"}</button>
    </form>
    <form className="adm-profile-editor" onSubmit={addFollowup}>
      <div className="adm-panel-head"><h2>新增回訪提醒</h2><span>保存到追蹤中心</span></div>
      <div className="adm-editor-grid">
        <label><span>主旨</span><input required value={followup.title} onChange={(e) => setFollowup((current) => ({ ...current, title: e.target.value }))} /></label>
        <label><span>日期時間</span><input required type="datetime-local" value={followup.dueAt} onChange={(e) => setFollowup((current) => ({ ...current, dueAt: e.target.value }))} /></label>
        <label><span>優先度</span><select value={followup.priority} onChange={(e) => setFollowup((current) => ({ ...current, priority: e.target.value }))}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>
        <label><span>指派</span><input value={followup.assignee} onChange={(e) => setFollowup((current) => ({ ...current, assignee: e.target.value }))} /></label>
        <label className="full"><span>原因</span><textarea rows={2} value={followup.reason} onChange={(e) => setFollowup((current) => ({ ...current, reason: e.target.value }))} /></label>
      </div>
      <button className="adm-action-button secondary" disabled={busy}>{busy ? "處理中…" : "建立提醒"}</button>
    </form>
    {notice ? <p className="adm-form-notice" role="status">{notice}</p> : null}
  </div>;
}
