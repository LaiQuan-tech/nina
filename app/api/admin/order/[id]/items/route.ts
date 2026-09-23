import { NextResponse } from "next/server";
import { getWorkOrder, isWorkOrderReadOnly, replaceWorkOrderItems, type WorkOrderItemInput } from "@/lib/workOrders";
import { listProcessingItems } from "@/lib/erp";
import { authorizeAdminRequest } from "@/lib/admin/adminRequest";

export const runtime = "nodejs";

type RawRow = { code?: unknown; name?: unknown; qty?: unknown; unit?: unknown };

/**
 * 把「code + 原始 qty/unit 字串」轉成 replaceWorkOrderItems 要的列。
 * name 預設從 ERP 主檔（erp_processing_items）依 code 反查——多列編輯器本來就是
 * 「只能挑目錄內品項」的設計，不接受自由文字 name（自由文字仍走既有 processing_items
 * 單行欄位）。code 是空字串（「（不使用）」）或查無主檔 → 整列略過，不寫入。
 *
 * 例外：呼叫端（OrderEditForm 的 JS 路徑）對「使用者沒動過的舊資料列」會直接帶 name
 * 上來——這是為了保住 Phase 1 回填留下的 legacy 無代碼列（code 是 null，name 是從舊
 * processing_items 文字切出來的，查不到任何 ERP 主檔）。這種列一律信任前端送來的
 * name、不必也不能比對 ERP，否則「整組原子取代」的第一次儲存就會把這些舊資料無聲刪掉。
 * 無 JS 的原生表單沒有這個欄位，所以這條保護只在 JS 路徑生效（已知限制，見
 * components/order/OrderEditForm.tsx 的註解）。
 *
 * unit：使用者有填就用使用者填的（149 筆裡 14 筆主檔 unit 是 null，必須讓人工補），
 * 沒填才 fallback 用 ERP 主檔的 unit。
 */
async function resolveRows(rawRows: RawRow[]): Promise<WorkOrderItemInput[]> {
  const catalog = await listProcessingItems();
  const byCode = new Map(catalog.map((item) => [item.code, item]));
  const rows: WorkOrderItemInput[] = [];

  for (const r of rawRows) {
    const code = typeof r.code === "string" ? r.code.trim() : "";
    const passThroughName = typeof r.name === "string" ? r.name.trim().slice(0, 200) : "";

    const qtyRaw =
      typeof r.qty === "string" ? r.qty.trim() : typeof r.qty === "number" && Number.isFinite(r.qty) ? String(r.qty) : "";
    const qty = qtyRaw && /^\d+(\.\d+)?$/.test(qtyRaw) ? Number(qtyRaw) : null;
    const unitRaw = typeof r.unit === "string" ? r.unit.trim() : "";

    if (passThroughName) {
      rows.push({ code: code || null, name: passThroughName, qty, unit: unitRaw || null });
      continue;
    }
    if (!code) continue;
    const item = byCode.get(code);
    if (!item) continue;

    rows.push({ code: item.code, name: item.name, qty, unit: unitRaw || item.unit || null });
  }
  return rows;
}

/** 從 FormData 撈出 `${prefix}_code_N` / `${prefix}_qty_N` / `${prefix}_unit_N`，依 N 排序回列陣列。 */
function parseIndexedRows(form: FormData, prefix: "proc" | "acc"): RawRow[] {
  const re = new RegExp(`^${prefix}_(code|qty|unit)_(\\d+)$`);
  const map = new Map<number, RawRow>();
  for (const [key, value] of form.entries()) {
    if (typeof value !== "string") continue;
    const m = re.exec(key);
    if (!m) continue;
    const idx = Number(m[2]);
    const row = map.get(idx) ?? {};
    (row as Record<string, unknown>)[m[1]] = value;
    map.set(idx, row);
  }
  return [...map.keys()].sort((a, b) => a - b).map((i) => map.get(i) as RawRow);
}

function isValidKind(v: unknown): v is "processing" | "accessory" {
  return v === "processing" || v === "accessory";
}

/**
 * POST → 整組取代某工單的加工說明／配件明細（work_order_items）。
 * 依 content-type 分流：
 *   - application/json（JS 已 hydrate，fetch 呼叫）：{ kind, rows:[{code,qty,unit}] }，回 JSON。
 *   - 其餘（無 JS 的原生 <form method="post"> submit）：FormData 帶
 *     kind + proc_code_N/proc_qty_N/proc_unit_N（配件用 acc_ 前綴），成功回 303 導回工單詳情頁。
 * demo 工單一律 403（route 層擋一次，replaceWorkOrderItems 內部也會再擋一次）。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await authorizeAdminRequest(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const order = await getWorkOrder(params.id);
  if (!order) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (isWorkOrderReadOnly(order)) {
    return NextResponse.json({ ok: false, error: "demo_read_only" }, { status: 403 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  if (isJson) {
    const body = (await req.json().catch(() => null)) as { kind?: unknown; rows?: unknown } | null;
    if (!body || !isValidKind(body.kind)) {
      return NextResponse.json({ ok: false, error: "bad_kind" }, { status: 400 });
    }
    const rawRows = Array.isArray(body.rows) ? (body.rows as RawRow[]) : [];
    const rows = await resolveRows(rawRows);
    const items = await replaceWorkOrderItems(order.id, body.kind, rows);
    if (items === null) return NextResponse.json({ ok: false, error: "update_failed" }, { status: 400 });
    return NextResponse.json({ ok: true, items });
  }

  // 無 JS：原生 form POST（multipart 或 urlencoded，Request.formData() 兩種都吃）。
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_form" }, { status: 400 });
  }

  const kind = form.get("kind");
  if (!isValidKind(kind)) {
    return NextResponse.json({ ok: false, error: "bad_kind" }, { status: 400 });
  }

  const rawRows = parseIndexedRows(form, kind === "processing" ? "proc" : "acc");
  const rows = await resolveRows(rawRows);
  const items = await replaceWorkOrderItems(order.id, kind, rows);
  if (items === null) return NextResponse.json({ ok: false, error: "update_failed" }, { status: 400 });

  return NextResponse.redirect(new URL(`/admin/orders/${order.id}`, req.url), { status: 303 });
}
