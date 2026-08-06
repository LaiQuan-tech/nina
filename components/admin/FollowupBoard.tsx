"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CustomerFollowup, KnowledgeCustomer } from "@/lib/admin/customerKnowledge";
import { bucketFollowups } from "@/lib/admin/customerKnowledgeView";

const BUCKETS = [
  { key: "overdue", label: "已逾期", note: "優先處理" },
  { key: "today", label: "今天", note: "今日待辦" },
  { key: "next7", label: "接下來七天", note: "近期安排" },
  { key: "later", label: "稍後", note: "後續追蹤" },
] as const;

function datetimeLocal(date = new Date(Date.now() + 24 * 60 * 60 * 1000)): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function fmt(iso: string): string {
  return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export default function FollowupBoard({ initial, customers }: { initial: CustomerFollowup[]; customers: KnowledgeCustomer[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<"open" | "completed">("open");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ memberId: customers[0]?.id || "", title: "確認下一次製作需求", reason: "", priority: "medium", assignee: "王小美", dueAt: datetimeLocal() });
  const visible = items.filter((item) => item.status === filter);
  const grouped = useMemo(() => bucketFollowups(visible.map((item) => ({ ...item, dueAt: item.dueAt }))), [visible]);

  async function patch(item: CustomerFollowup, body: Record<string, unknown>) {
    setBusy(item.id); setNotice("");
    const response = await fetch(`/api/admin/followups/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.followup) setItems((current) => current.map((row) => row.id === item.id ? result.followup : row));
    else setNotice(result.message || "更新失敗");
    setBusy("");
  }

  async function add(e: React.FormEvent) {
    e.preventDefault(); setBusy("new"); setNotice("");
    const response = await fetch("/api/admin/followups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, dueAt: new Date(form.dueAt).toISOString() }) });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.followup) { setItems((current) => [...current, result.followup]); setNotice("回訪提醒已建立"); router.refresh(); }
    else setNotice(result.message || "建立失敗");
    setBusy("");
  }

  function postpone(item: CustomerFollowup, days: number) {
    const next = new Date(Math.max(Date.now(), new Date(item.dueAt).getTime()) + days * 86_400_000);
    void patch(item, { dueAt: next.toISOString() });
  }

  return <div className="adm-followup-layout">
    <section className="adm-followup-main">
      <div className="adm-segmented" role="group" aria-label="回訪狀態"><button data-active={filter === "open"} onClick={() => setFilter("open")}>未完成</button><button data-active={filter === "completed"} onClick={() => setFilter("completed")}>已完成</button></div>
      {filter === "completed" ? <div className="adm-followup-column single"><h2>已完成 <span>{visible.length}</span></h2>{visible.map((item) => <FollowupCard key={item.id} item={item} busy={busy === item.id} onComplete={() => void patch(item, { status: "open" })} onPostpone={() => {}} completed />)}</div> : <div className="adm-followup-board">{BUCKETS.map((bucket) => <div className="adm-followup-column" key={bucket.key}><h2>{bucket.label} <span>{grouped[bucket.key].length}</span></h2><p>{bucket.note}</p>{grouped[bucket.key].map((item) => <FollowupCard key={item.id} item={item as CustomerFollowup} busy={busy === item.id} onComplete={() => void patch(item as CustomerFollowup, { status: "completed" })} onPostpone={(days) => postpone(item as CustomerFollowup, days)} />)}</div>)}</div>}
    </section>
    <form className="adm-followup-form" onSubmit={add}><div className="adm-panel-head"><h2>新增回訪</h2><span>Demo 資料</span></div>
      <label><span>客戶</span><select required value={form.memberId} onChange={(e) => setForm((current) => ({ ...current, memberId: e.target.value }))}>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.company || customer.name}</option>)}</select></label>
      <label><span>主旨</span><input required value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} /></label>
      <label><span>原因</span><textarea rows={3} value={form.reason} onChange={(e) => setForm((current) => ({ ...current, reason: e.target.value }))} /></label>
      <div className="row"><label><span>優先度</span><select value={form.priority} onChange={(e) => setForm((current) => ({ ...current, priority: e.target.value }))}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label><label><span>指派</span><input value={form.assignee} onChange={(e) => setForm((current) => ({ ...current, assignee: e.target.value }))} /></label></div>
      <label><span>日期時間</span><input required type="datetime-local" value={form.dueAt} onChange={(e) => setForm((current) => ({ ...current, dueAt: e.target.value }))} /></label>
      <button disabled={busy === "new"}>{busy === "new" ? "建立中…" : "建立提醒"}</button>{notice ? <p role="status">{notice}</p> : null}
    </form>
  </div>;
}

function FollowupCard({ item, busy, completed, onComplete, onPostpone }: { item: CustomerFollowup; busy: boolean; completed?: boolean; onComplete: () => void; onPostpone: (days: number) => void }) {
  return <article className="adm-followup-card" data-priority={item.priority}><header><span>{item.company || item.customerName}</span><em>{item.priority === "high" ? "高" : item.priority === "medium" ? "中" : "低"}</em></header><h3>{item.title}</h3><p>{item.reason}</p><footer><time>{fmt(item.dueAt)}</time><small>{item.assignee || "未指派"}</small></footer><div className="actions">{completed ? <button disabled={busy} onClick={onComplete}>重新開啟</button> : <><button disabled={busy} onClick={onComplete}>完成</button><button disabled={busy} onClick={() => onPostpone(1)}>明天</button><button disabled={busy} onClick={() => onPostpone(7)}>下週</button></>}</div></article>;
}
