"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EDITABLE_FIELDS, type EditableField, type WorkOrder, type WorkOrderItem, type ShippingDefaults } from "@/lib/workOrders";
import type { ProcessingItemOption } from "@/lib/erp";
import { STATION_LABELS, type StationKey } from "@/lib/workOrder/barcode";
import { INK_WHITELIST } from "@/lib/erp/productName";

// ── 常數 ──────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "open", label: "已收件" },
  { value: "in_progress", label: "製作中" },
  { value: "done", label: "已完成" },
];

const STATION_OPTIONS = Object.entries(STATION_LABELS) as [StationKey, string][];

const FIELD_LABELS: Record<EditableField, string> = {
  customer_no: "客戶編號",
  customer_phone: "客戶電話",
  contact_person: "聯絡人",
  delivery_date: "交貨日",
  delivery_method: "交貨方式",
  draft_count: "稿件數",
  single_qty: "單一稿數量",
  processing_items: "加工項目（文字備註）",
  receiver: "接單人員",
  status: "狀態",
  machine_model: "機台型號",
  lamination: "護貝膜",
  ink_type: "油墨類別",
  print_method: "列印方式",
  plate_material: "版材",
  remark: "備註",
  ship_name: "貨物寄送－姓名",
  ship_phone: "貨物寄送－電話",
  ship_address: "貨物寄送－地址",
  station: "目前站別",
};

// 製程欄位（machine_model 四表皆無資料來源，不硬編任何建議值，交自學習+人工填）。
const PROCESS_HINTS: Partial<Record<EditableField, string[]>> = {
  lamination: ["亮", "霧", "細霧"],
  ink_type: [...INK_WHITELIST],
};

// erp_enrich.guesses 的 key 跟欄位名不完全一樣（ink→ink_type、printMethod→print_method…）。
const GUESS_KEY: Partial<Record<EditableField, string>> = {
  lamination: "lamination",
  ink_type: "ink",
  print_method: "printMethod",
  plate_material: "plateMaterial",
};

// 加工／配件挑選器頂端「常用」optgroup（12 個高頻代碼）。
const COMMON_ITEM_CODES = [
  "ZA0024",
  "ZA0010",
  "ZA0011",
  "ZA00111",
  "ZC0018",
  "ZC0019",
  "ZB0010",
  "ZA0001",
  "ZA0023",
  "ZA0004",
  "ZA0013",
  "ZE0001",
];

function toInputValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function readErpGuess(order: WorkOrder, field: EditableField): string | null {
  const key = GUESS_KEY[field];
  if (!key) return null;
  const enrich = order.erp_enrich as { guesses?: Record<string, { value?: unknown } | null> } | undefined;
  const guess = enrich?.guesses?.[key];
  return guess && typeof guess.value === "string" && guess.value ? guess.value : null;
}

// ── 主編輯表單（20 個可編輯欄位） ─────────────────────────────────────

export default function OrderEditForm({
  order,
  processingItems,
  accessoryItems,
  erpOptions,
  shippingDefaults,
  thumbnailUrl,
  diagramUrl,
  className,
}: {
  order: WorkOrder;
  processingItems: WorkOrderItem[];
  accessoryItems: WorkOrderItem[];
  erpOptions: ProcessingItemOption[];
  shippingDefaults: ShippingDefaults | null;
  thumbnailUrl: string | null;
  diagramUrl: string | null;
  className?: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Record<EditableField, string>>(() => {
    const init = {} as Record<EditableField, string>;
    for (const key of EDITABLE_FIELDS) init[key] = toInputValue(order[key as keyof WorkOrder]);
    return init;
  });
  const [errors, setErrors] = useState<Partial<Record<EditableField, string>>>({});
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function setField(key: EditableField, value: string) {
    setForm((s) => ({ ...s, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }

  function applyShippingDefaults() {
    if (!shippingDefaults) return;
    setForm((s) => ({
      ...s,
      ship_name: shippingDefaults.name ?? s.ship_name,
      ship_phone: shippingDefaults.phone ?? s.ship_phone,
      ship_address: shippingDefaults.lastAddress ?? s.ship_address,
    }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setSaveError("");
    try {
      const res = await fetch(`/api/admin/order/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setErrors({});
        setSaved(true);
        router.refresh();
        setTimeout(() => setSaved(false), 2500);
      } else if (data?.errors) {
        setErrors(data.errors);
        setSaveError("有欄位未通過檢查，請修正紅字部分");
      } else {
        setSaveError(data?.error === "demo_read_only" ? "Demo 工單不可編輯" : "儲存失敗，請重試");
      }
    } catch {
      setSaveError("儲存失敗，請檢查網路連線");
    } finally {
      setSaving(false);
    }
  }

  const size = order.size_w && order.size_h ? `${order.size_w}×${order.size_h}${order.size_unit ?? "cm"}` : "—";

  function renderField(key: EditableField, opts?: { type?: string; textarea?: boolean; full?: boolean }) {
    const label = FIELD_LABELS[key];
    const invalid = Boolean(errors[key]);
    const hint = PROCESS_HINTS[key];
    const guess = readErpGuess(order, key);
    const showGuess = guess && guess !== form[key];

    if (key === "status") {
      return (
        <label key={key}>
          <span>{label}</span>
          <select value={form[key]} onChange={(e) => setField(key, e.target.value)} data-invalid={invalid ? "true" : undefined}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {invalid && <span className="adm-field-error">{errors[key]}</span>}
        </label>
      );
    }

    if (key === "station") {
      return (
        <label key={key}>
          <span>{label}</span>
          <select value={form[key]} onChange={(e) => setField(key, e.target.value)} data-invalid={invalid ? "true" : undefined}>
            <option value="">（尚未進站）</option>
            {STATION_OPTIONS.map(([value, l]) => (
              <option key={value} value={value}>
                {l}
              </option>
            ))}
          </select>
          {invalid && <span className="adm-field-error">{errors[key]}</span>}
        </label>
      );
    }

    if (opts?.textarea) {
      return (
        <label key={key} className={opts.full ? "full" : undefined}>
          <span>{label}</span>
          <textarea
            rows={key === "remark" ? 4 : 3}
            value={form[key]}
            onChange={(e) => setField(key, e.target.value)}
            data-invalid={invalid ? "true" : undefined}
          />
          {invalid && <span className="adm-field-error">{errors[key]}</span>}
        </label>
      );
    }

    return (
      <label key={key} className={[opts?.full ? "full" : "", hint ? "adm-suggest" : ""].filter(Boolean).join(" ") || undefined}>
        <span>{label}</span>
        <input
          type={opts?.type ?? "text"}
          list={hint ? `dl-${key}` : undefined}
          value={form[key]}
          min={opts?.type === "number" ? 0 : undefined}
          max={opts?.type === "number" ? 999999 : undefined}
          onChange={(e) => setField(key, e.target.value)}
          data-invalid={invalid ? "true" : undefined}
        />
        {hint && (
          <datalist id={`dl-${key}`}>
            {hint.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        )}
        {showGuess && (
          <div className="adm-suggest-hint">
            ERP 建議：{guess}
            <button type="button" onClick={() => setField(key, guess as string)}>
              採用
            </button>
          </div>
        )}
        {invalid && <span className="adm-field-error">{errors[key]}</span>}
      </label>
    );
  }

  return (
    <div className={className}>
      <div className="adm-editor-stack" style={{ maxWidth: 820, margin: "22px auto 0" }}>
        {/* 唯讀摘要：檔名帶出的資訊，改版前既有 A4 版面已完整呈現，這裡只留最常需要對照的幾項 */}
        <div className="adm-preference-card">
          <h2>工單資訊（唯讀）</h2>
          <dl>
            <div>
              <dt>工單編號</dt>
              <dd>{order.order_no ?? "—"}</dd>
            </div>
            <div>
              <dt>流水號</dt>
              <dd>{order.serial ?? "—"}</dd>
            </div>
            <div>
              <dt>原始檔名</dt>
              <dd style={{ wordBreak: "break-all" }}>{order.file_name}</dd>
            </div>
            <div>
              <dt>商品</dt>
              <dd>
                {order.product_name || "—"}
                {order.product_matched ? "" : "（非標準商品）"}
              </dd>
            </div>
            <div>
              <dt>尺寸</dt>
              <dd>{size}</dd>
            </div>
            <div>
              <dt>材質</dt>
              <dd>{order.material_raw || "—"}</dd>
            </div>
          </dl>
        </div>

        {/* 主編輯表單 */}
        <form className="adm-profile-editor" onSubmit={save}>
          <div className="adm-panel-head">
            <h2>工單編輯</h2>
            <span>共 {EDITABLE_FIELDS.length} 個可編輯欄位</span>
          </div>
          <div className="adm-editor-grid">
            {renderField("customer_no")}
            {renderField("customer_phone")}
            {renderField("contact_person")}
            {renderField("delivery_date", { type: "date" })}
            {renderField("delivery_method")}
            {renderField("draft_count", { type: "number" })}
            {renderField("single_qty", { type: "number" })}
            {renderField("receiver")}
            {renderField("status")}
            {renderField("station")}
            {renderField("processing_items", { full: true })}
            {renderField("machine_model")}
            {renderField("lamination")}
            {renderField("ink_type")}
            {renderField("print_method")}
            {renderField("plate_material")}
            {renderField("remark", { textarea: true, full: true })}
            {renderField("ship_name")}
            {renderField("ship_phone")}
            {renderField("ship_address", { full: true })}
          </div>
          {shippingDefaults && (
            <button type="button" className="adm-action-button secondary" style={{ marginTop: 10 }} onClick={applyShippingDefaults}>
              帶入會員預設（貨物寄送）
            </button>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
            <button className="adm-action-button" disabled={saving}>
              {saving ? "儲存中…" : "儲存工單"}
            </button>
            {saved && <span style={{ fontSize: 13, color: "var(--ok, #15803d)", fontWeight: 600 }}>已儲存 ✓</span>}
            {saveError && <span style={{ fontSize: 12.5, color: "#b91c1c", fontWeight: 600 }}>{saveError}</span>}
          </div>
        </form>

        <ItemsEditor
          orderId={order.id}
          kind="processing"
          title="加工說明"
          initialItems={processingItems}
          erpOptions={erpOptions}
        />
        <ItemsEditor
          orderId={order.id}
          kind="accessory"
          title="配件"
          initialItems={accessoryItems}
          erpOptions={erpOptions}
        />

        <ImageUploadCard orderId={order.id} kind="thumbnail" label="縮圖" currentUrl={thumbnailUrl} />
        <ImageUploadCard orderId={order.id} kind="diagram" label="加工示意小圖" currentUrl={diagramUrl} />
      </div>
    </div>
  );
}

// ── 加工說明／配件多列編輯器 ───────────────────────────────────────────

type ItemRow = { code: string; qty: string; unit: string; originalCode: string; originalName: string };

function rowsFromItems(items: WorkOrderItem[], minRows: number): ItemRow[] {
  const base: ItemRow[] = items.map((it) => ({
    code: it.code ?? "",
    qty: it.qty != null ? String(it.qty) : "",
    unit: it.unit ?? "",
    originalCode: it.code ?? "",
    originalName: it.name,
  }));
  const target = Math.max(minRows, base.length + 2); // 永遠多渲染 2 空白列
  while (base.length < target) base.push({ code: "", qty: "", unit: "", originalCode: "", originalName: "" });
  return base;
}

function ItemsEditor({
  orderId,
  kind,
  title,
  initialItems,
  erpOptions,
}: {
  orderId: string;
  kind: "processing" | "accessory";
  title: string;
  initialItems: WorkOrderItem[];
  erpOptions: ProcessingItemOption[];
}) {
  const router = useRouter();
  const prefix = kind === "processing" ? "proc" : "acc";
  const [rows, setRows] = useState<ItemRow[]>(() => rowsFromItems(initialItems, 5));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const byCode = useMemo(() => new Map(erpOptions.map((o) => [o.code, o])), [erpOptions]);
  const grouped = useMemo(() => {
    const groups = new Map<string, ProcessingItemOption[]>();
    for (const opt of erpOptions) {
      const list = groups.get(opt.group) ?? [];
      list.push(opt);
      groups.set(opt.group, list);
    }
    return groups;
  }, [erpOptions]);
  const common = useMemo(
    () => COMMON_ITEM_CODES.map((c) => byCode.get(c)).filter((v): v is ProcessingItemOption => Boolean(v)),
    [byCode]
  );

  function setRow(idx: number, patch: Partial<ItemRow>) {
    setRows((current) => current.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function onSelectCode(idx: number, code: string) {
    const item = byCode.get(code);
    setRow(idx, { code, unit: item?.unit ?? rows[idx].unit });
  }

  function addRow() {
    setRows((current) => [...current, { code: "", qty: "", unit: "", originalCode: "", originalName: "" }]);
  }

  function removeRow(idx: number) {
    setRows((current) => current.filter((_, i) => i !== idx));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNotice("");
    try {
      // 未變動的舊資料列（含 legacy 無代碼列，name 直接沿用原值）即使 code 是空字串也要保留；
      // 真正「使用者主動清空」的列（code 從有變無）才視為刪除，不送出。
      const payloadRows: Array<{ code: string | null; name?: string; qty: string; unit: string }> = [];
      for (const r of rows) {
        const touched = r.code !== r.originalCode;
        if (!touched) {
          if (r.originalName) payloadRows.push({ code: r.originalCode || null, name: r.originalName, qty: r.qty, unit: r.unit });
          continue;
        }
        if (r.code) payloadRows.push({ code: r.code, qty: r.qty, unit: r.unit });
      }

      const res = await fetch(`/api/admin/order/${orderId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, rows: payloadRows }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setNotice(`${title}已儲存`);
        router.refresh();
      } else {
        setNotice(data?.error === "demo_read_only" ? "Demo 工單不可編輯" : "儲存失敗，請重試");
      }
    } catch {
      setNotice("儲存失敗，請檢查網路連線");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="adm-profile-editor" method="post" action={`/api/admin/order/${orderId}/items`} onSubmit={save}>
      <input type="hidden" name="kind" value={kind} />
      <div className="adm-panel-head">
        <h2>{title}</h2>
        <span>共 {rows.filter((r) => r.code || r.originalName).length} 項</span>
      </div>
      <div className="adm-items-editor">
        {rows.map((row, idx) => {
          const unmatchedLegacy = row.code && !byCode.has(row.code);
          // 舊資料（Phase 1 回填）留下的無代碼列：code 是 null 但 name 有值，畫面上選單會顯示
          // 跟真正空白列一樣的「（不使用）」，若不特別標出來，接單人員很容易誤當成多餘空列
          // 按 ✕ 刪除——這樣會真的把舊資料清掉（即使 code 仍是空也一樣，因為使用者沒有機會
          // 意識到「這列其實有內容」）。這裡只是顯示用提示，不影響送出邏輯。
          const legacyNoCode = !row.code && row.originalName;
          return (
            <div key={idx}>
              {legacyNoCode && <div className="adm-legacy-hint">原資料（無對應主檔代碼）：{row.originalName}</div>}
              <div className="adm-items-row">
                <select name={`${prefix}_code_${idx}`} value={row.code} onChange={(e) => onSelectCode(idx, e.target.value)}>
                  <option value="">（不使用）</option>
                  {unmatchedLegacy && (
                    <option value={row.code}>
                      {row.code}（原資料，不在目前主檔）
                    </option>
                  )}
                  {common.length > 0 && (
                    <optgroup label="常用">
                      {common.map((opt) => (
                        <option key={`common-${opt.code}`} value={opt.code}>
                          {opt.code} {opt.name}
                          {opt.unit ? `（${opt.unit}）` : ""}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {[...grouped.entries()].map(([group, opts]) => (
                    <optgroup key={group} label={group}>
                      {opts.map((opt) => (
                        <option key={opt.code} value={opt.code}>
                          {opt.code} {opt.name}
                          {opt.unit ? `（${opt.unit}）` : ""}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <input
                  name={`${prefix}_qty_${idx}`}
                  value={row.qty}
                  onChange={(e) => setRow(idx, { qty: e.target.value })}
                  placeholder="數量"
                  inputMode="decimal"
                />
                <input
                  name={`${prefix}_unit_${idx}`}
                  value={row.unit}
                  onChange={(e) => setRow(idx, { unit: e.target.value })}
                  placeholder="單位"
                />
                <button type="button" onClick={() => removeRow(idx)} aria-label="移除此列">
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <button type="button" className="adm-items-add" onClick={addRow}>
        ＋ 新增一列
      </button>
      <div className="adm-items-save" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button className="adm-action-button secondary" disabled={saving}>
          {saving ? "儲存中…" : `儲存${title}`}
        </button>
        {notice && <span style={{ fontSize: 12.5, color: "#0369a1", fontWeight: 600 }}>{notice}</span>}
      </div>
    </form>
  );
}

// ── 縮圖／加工示意小圖：人工補圖（自動管線失敗或 .ai 打不開時的退路） ───────

function ImageUploadCard({
  orderId,
  kind,
  label,
  currentUrl,
}: {
  orderId: string;
  kind: "thumbnail" | "diagram";
  label: string;
  currentUrl: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setNotice("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      const res = await fetch(`/api/admin/order/${orderId}/thumbnail`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setNotice("已上傳");
        router.refresh();
      } else {
        setNotice("上傳失敗，請重試");
      }
    } catch {
      setNotice("上傳失敗，請檢查網路連線");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div className="adm-profile-editor">
      <div className="adm-panel-head">
        <h2>{label}</h2>
        <span>{currentUrl ? "已上傳" : "尚未上傳"}</span>
      </div>
      {currentUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={currentUrl} alt={label} style={{ maxWidth: 240, borderRadius: 10, display: "block", marginBottom: 12 }} />
      )}
      <label className="adm-site-file" style={busy ? { opacity: 0.6, cursor: "wait" } : undefined}>
        {busy ? "上傳中…" : `選擇圖片上傳${label}`}
        <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={onChange} disabled={busy} />
      </label>
      {notice && <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12.5, color: "#0369a1" }}>{notice}</p>}
    </div>
  );
}
