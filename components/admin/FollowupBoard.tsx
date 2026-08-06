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

type FollowupStatus = CustomerFollowup["status"];
type FollowupForm = {
  title: string;
  reason: string;
  priority: CustomerFollowup["priority"];
  assignee: string;
  dueAt: string;
  status: FollowupStatus;
};

function datetimeLocal(date = new Date(Date.now() + 24 * 60 * 60 * 1000)): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function fmt(iso: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function editFormFor(item: CustomerFollowup): FollowupForm {
  return {
    title: item.title,
    reason: item.reason ?? "",
    priority: item.priority,
    assignee: item.assignee ?? "",
    dueAt: datetimeLocal(new Date(item.dueAt)),
    status: item.status,
  };
}

export default function FollowupBoard({ initial, customers }: { initial: CustomerFollowup[]; customers: KnowledgeCustomer[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<FollowupStatus>("open");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState<FollowupForm | null>(null);
  const [form, setForm] = useState({
    memberId: customers[0]?.id || "",
    title: "確認下一次製作需求",
    reason: "",
    priority: "medium",
    assignee: "王小美",
    dueAt: datetimeLocal(),
  });
  const visible = items.filter((item) => item.status === filter);
  const grouped = useMemo(() => bucketFollowups(visible), [visible]);

  async function patch(item: CustomerFollowup, body: Record<string, unknown>, successMessage = "回訪提醒已更新") {
    setBusy(item.id);
    setNotice("");
    try {
      const response = await fetch(`/api/admin/followups/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.followup) {
        setNotice(result.message || "更新失敗，請稍後再試");
        return false;
      }
      setItems((current) => current.map((row) => row.id === item.id ? result.followup : row));
      setNotice(successMessage);
      return true;
    } catch {
      setNotice("無法連線，請檢查網路後再試");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy("new");
    setNotice("");
    try {
      const response = await fetch("/api/admin/followups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, dueAt: new Date(form.dueAt).toISOString() }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.followup) {
        setItems((current) => [...current, result.followup]);
        setNotice("回訪提醒已建立");
        router.refresh();
      } else {
        setNotice(result.message || "建立失敗");
      }
    } catch {
      setNotice("無法連線，請檢查網路後再試");
    } finally {
      setBusy("");
    }
  }

  function postpone(item: CustomerFollowup, days: number) {
    const next = new Date(Math.max(Date.now(), new Date(item.dueAt).getTime()) + days * 86_400_000);
    void patch(item, { dueAt: next.toISOString() }, days === 1 ? "已延後到明天" : "已延後一週");
  }

  function startEditing(item: CustomerFollowup) {
    setEditingId(item.id);
    setEditForm(editFormFor(item));
    setNotice("");
  }

  function stopEditing() {
    setEditingId("");
    setEditForm(null);
  }

  async function saveEdit(e: React.FormEvent, item: CustomerFollowup) {
    e.preventDefault();
    if (!editForm) return;
    const saved = await patch(item, {
      title: editForm.title,
      reason: editForm.reason,
      priority: editForm.priority,
      assignee: editForm.assignee,
      dueAt: new Date(editForm.dueAt).toISOString(),
      status: editForm.status,
    });
    if (saved) stopEditing();
  }

  const renderCard = (item: CustomerFollowup, mode: "open" | "archived") => (
    <FollowupCard
      key={item.id}
      item={item}
      busy={busy === item.id}
      editing={editingId === item.id}
      editForm={editingId === item.id ? editForm : null}
      mode={mode}
      onComplete={() => void patch(item, { status: mode === "open" ? "completed" : "open" }, mode === "open" ? "回訪已完成" : "回訪已重新開啟")}
      onPostpone={(days) => postpone(item, days)}
      onEdit={() => startEditing(item)}
      onCancelEdit={stopEditing}
      onEditFormChange={(patchValue) => setEditForm((current) => current ? { ...current, ...patchValue } : current)}
      onSaveEdit={(e) => void saveEdit(e, item)}
    />
  );

  return (
    <div className="adm-followup-layout">
      <section className="adm-followup-main">
        <div className="adm-segmented" role="group" aria-label="回訪狀態">
          <button type="button" data-active={filter === "open"} onClick={() => setFilter("open")}>未完成</button>
          <button type="button" data-active={filter === "completed"} onClick={() => setFilter("completed")}>已完成</button>
          <button type="button" data-active={filter === "cancelled"} onClick={() => setFilter("cancelled")}>已取消</button>
        </div>
        {notice ? <p className="adm-followup-notice" role="status">{notice}</p> : null}
        {filter === "open" ? (
          <div className="adm-followup-board">
            {BUCKETS.map((bucket) => (
              <div className="adm-followup-column" key={bucket.key}>
                <h2>{bucket.label} <span>{grouped[bucket.key].length}</span></h2>
                <p>{bucket.note}</p>
                {grouped[bucket.key].map((item) => renderCard(item as CustomerFollowup, "open"))}
              </div>
            ))}
          </div>
        ) : (
          <div className="adm-followup-column single">
            <h2>{filter === "completed" ? "已完成" : "已取消"} <span>{visible.length}</span></h2>
            {visible.length ? visible.map((item) => renderCard(item, "archived")) : <p className="adm-followup-empty">目前沒有資料</p>}
          </div>
        )}
      </section>

      <form className="adm-followup-form" onSubmit={add}>
        <div className="adm-panel-head"><h2>新增回訪</h2><span>Demo 資料</span></div>
        <label><span>客戶</span><select required value={form.memberId} onChange={(e) => setForm((current) => ({ ...current, memberId: e.target.value }))}>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.company || customer.name}</option>)}</select></label>
        <label><span>主旨</span><input required maxLength={160} value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} /></label>
        <label><span>原因</span><textarea rows={3} maxLength={1000} value={form.reason} onChange={(e) => setForm((current) => ({ ...current, reason: e.target.value }))} /></label>
        <div className="row">
          <label><span>優先度</span><select value={form.priority} onChange={(e) => setForm((current) => ({ ...current, priority: e.target.value }))}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>
          <label><span>指派</span><input maxLength={80} value={form.assignee} onChange={(e) => setForm((current) => ({ ...current, assignee: e.target.value }))} /></label>
        </div>
        <label><span>日期時間</span><input required type="datetime-local" value={form.dueAt} onChange={(e) => setForm((current) => ({ ...current, dueAt: e.target.value }))} /></label>
        <button disabled={busy === "new"}>{busy === "new" ? "建立中…" : "建立提醒"}</button>
      </form>
    </div>
  );
}

function FollowupCard({
  item,
  busy,
  editing,
  editForm,
  mode,
  onComplete,
  onPostpone,
  onEdit,
  onCancelEdit,
  onEditFormChange,
  onSaveEdit,
}: {
  item: CustomerFollowup;
  busy: boolean;
  editing: boolean;
  editForm: FollowupForm | null;
  mode: "open" | "archived";
  onComplete: () => void;
  onPostpone: (days: number) => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onEditFormChange: (patch: Partial<FollowupForm>) => void;
  onSaveEdit: (e: React.FormEvent) => void;
}) {
  return (
    <article className="adm-followup-card" data-priority={item.priority}>
      <header><span>{item.company || item.customerName}</span><em>{item.priority === "high" ? "高" : item.priority === "medium" ? "中" : "低"}</em></header>
      {editing && editForm ? (
        <form className="adm-followup-edit" onSubmit={onSaveEdit}>
          <label><span>主旨</span><input required autoFocus maxLength={160} value={editForm.title} onChange={(e) => onEditFormChange({ title: e.target.value })} /></label>
          <label><span>原因</span><textarea rows={3} maxLength={1000} value={editForm.reason} onChange={(e) => onEditFormChange({ reason: e.target.value })} /></label>
          <div className="row">
            <label><span>優先度</span><select value={editForm.priority} onChange={(e) => onEditFormChange({ priority: e.target.value as FollowupForm["priority"] })}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>
            <label><span>狀態</span><select value={editForm.status} onChange={(e) => onEditFormChange({ status: e.target.value as FollowupStatus })}><option value="open">未完成</option><option value="completed">已完成</option><option value="cancelled">已取消</option></select></label>
          </div>
          <label><span>指派</span><input maxLength={80} value={editForm.assignee} onChange={(e) => onEditFormChange({ assignee: e.target.value })} /></label>
          <label><span>日期時間</span><input required type="datetime-local" value={editForm.dueAt} onChange={(e) => onEditFormChange({ dueAt: e.target.value })} /></label>
          <div className="edit-actions"><button type="submit" disabled={busy}>{busy ? "儲存中…" : "儲存"}</button><button type="button" disabled={busy} onClick={onCancelEdit}>取消</button></div>
        </form>
      ) : (
        <>
          <h3>{item.title}</h3>
          <p>{item.reason || "未填寫回訪原因"}</p>
          <footer><time>{fmt(item.dueAt)}</time><small>{item.assignee || "未指派"}</small></footer>
          <div className="actions">
            <button type="button" disabled={busy} onClick={onComplete}>{mode === "open" ? "完成" : "重新開啟"}</button>
            {mode === "open" ? <><button type="button" disabled={busy} onClick={() => onPostpone(1)}>明天</button><button type="button" disabled={busy} onClick={() => onPostpone(7)}>下週</button></> : null}
            <button type="button" disabled={busy} onClick={onEdit}>編輯</button>
          </div>
        </>
      )}
    </article>
  );
}
