import { createAdminSupabase } from "@/lib/supabase";
import type { Segments } from "@/lib/filename/types";
import type { StationKey } from "@/lib/workOrder/barcode";
import { validateWorkOrderPatch } from "./workOrderValidation";

// 工單資料列（對應 work_orders 表；手動欄位可為 null）。
export type WorkOrder = {
  id: string;
  order_no: string | null;
  serial: string | null;
  payment_type: string | null;
  customer_name: string | null;
  category_no: string | null;
  file_date: string | null;
  owner_code: string | null;
  design_name: string | null;
  size_w: number | null;
  size_h: number | null;
  size_unit: string | null;
  material_raw: string | null;
  product_name: string | null;
  total_qty: number | null;
  material_spec: string | null;
  product_code: string | null;
  product_matched: boolean;
  file_ext: string | null;
  file_name: string;
  storage_path: string;
  session_id: string | null;
  member_id: string | null;
  is_demo: boolean;
  parsed: Segments | Record<string, unknown>;
  customer_no: string | null;
  customer_phone: string | null;
  contact_person: string | null;
  received_at: string | null;
  delivery_date: string | null;
  delivery_method: string | null;
  draft_count: number | null;
  single_qty: number | null;
  processing_items: string | null;
  receiver: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  // ↓ 工單改版 v2 新欄位（supabase/work_order_v2_schema.sql），全部 nullable。
  machine_model: string | null;
  lamination: string | null;
  ink_type: string | null;
  print_method: string | null;
  plate_material: string | null;
  remark: string | null;
  ship_name: string | null;
  ship_phone: string | null;
  ship_address: string | null;
  thumbnail_path: string | null;
  diagram_path: string | null;
  station: string | null;
  thumbnail_status: string | null;
  thumbnail_meta: Record<string, unknown>;
  erp_enrich: Record<string, unknown>;
};

// 使用者可手動編輯的欄位白名單（PATCH 只允許改這些）。
//
// 註：Phase 2 任務規格文字寫「擴成 21 個」，但逐一列舉的欄位（既有 10 個 + 新增
// machine_model/lamination/ink_type/print_method/plate_material/remark/ship_name/
// ship_phone/ship_address/station 共 10 個）合計是 20 個，且明文排除 operator
// （「接單人員」沿用既有 receiver，不新增欄位）。這裡照實際列舉的 20 個實作，
// 不自行硬湊出一個未列舉的第 21 個欄位。thumbnail_path/diagram_path/thumbnail_status/
// thumbnail_meta/erp_enrich 一律不進白名單（只由縮圖端點／ERP 補值流程寫入）。
export const EDITABLE_FIELDS = [
  // 既有 10 個
  "customer_no",
  "customer_phone",
  "contact_person",
  "delivery_date",
  "delivery_method",
  "draft_count",
  "single_qty",
  "processing_items",
  "receiver",
  "status",
  // 新增 10 個（v2 欄位）
  "machine_model",
  "lamination",
  "ink_type",
  "print_method",
  "plate_material",
  "remark",
  "ship_name",
  "ship_phone",
  "ship_address",
  "station",
] as const;

export type EditableField = (typeof EDITABLE_FIELDS)[number];

export function isWorkOrderReadOnly(order: Pick<WorkOrder, "is_demo">): boolean {
  return order.is_demo;
}

/** 正式案件的工單讀取一律排除展示資料。 */
export function productionWorkOrderFilter() {
  return { column: "is_demo", value: false } as const;
}

// 商品命中 ERP 主檔的結果（由 lib/productLookup 提供）。
export type ProductResolution = {
  productName: string; // 最終商品名稱（命中→主檔名稱；未命中→材質對照 fallback）
  productCode: string | null; // 命中的商品編號
  matched: boolean;
  // ↓ Phase 1 新增，皆為 optional：不影響既有呼叫端（lookupProduct 那條路徑不會填這些）。
  lamination?: string | null; // 護貝膜：亮/霧/細霧（查不到就不填，交人工選）
  inkType?: string | null; // 油墨類別：只會是白名單內的值，其餘一律留空
  printMethod?: string | null; // 列印方式
  plateMaterial?: string | null; // 版材
  erpEnrich?: Record<string, unknown>; // 完整 ERP 補值結果＋信心度，給 Phase 2 下拉建議用
};

// work_order_items 一列（加工說明／配件明細）。
export type WorkOrderItem = {
  id: string;
  work_order_id: string;
  kind: "processing" | "accessory";
  sort: number;
  code: string | null;
  name: string;
  qty: number | null;
  unit: string | null;
  created_at: string;
};

// replaceWorkOrderItems() 的輸入列——對應 replace_work_order_items RPC 的 p_rows 一筆。
export type WorkOrderItemInput = {
  code?: string | null;
  name: string;
  qty?: number | string | null;
  unit?: string | null;
};

// work_order_events 一筆掃描事件（見 lib/workOrderStations.ts 的 deriveOrderProgress）。
export type WorkOrderEvent = {
  id: string;
  work_order_id: string;
  station: StationKey;
  admin_id: string | null;
  admin_name: string | null;
  scanned_at: string;
  note: string | null;
};

/** 由 parser 拆出的 segments 建立一張工單。order_no 由 DB trigger 產生。 */
export async function createWorkOrder(
  s: Segments,
  fileName: string,
  storagePath: string,
  product: ProductResolution,
  sessionId?: string | null,
  memberId?: string | null
): Promise<{ id: string; order_no: string }> {
  const db = createAdminSupabase();
  if (!db) throw new Error("db_not_configured");

  // 會員資料帶「貨物寄送」預設值（後台仍可手改）；查不到／未帶 memberId 就留空給人工填。
  let shipName: string | null = null;
  let shipPhone: string | null = null;
  let shipAddress: string | null = null;
  if (memberId) {
    const { data: member } = await db
      .from("members")
      .select("name, phone, phone_display, address")
      .eq("id", memberId)
      .maybeSingle();
    if (member) {
      shipName = member.name ?? null;
      shipPhone = member.phone_display ?? member.phone ?? null;
      shipAddress = member.address ?? null;
    }
  }

  const { data, error } = await db
    .from("work_orders")
    .insert({
      file_name: fileName,
      storage_path: storagePath,
      session_id: sessionId ?? null,
      member_id: memberId ?? null,
      parsed: s,
      serial: s.serial,
      payment_type: s.payment,
      customer_name: s.customer,
      category_no: s.category,
      file_date: s.date,
      owner_code: s.owner,
      design_name: s.design,
      size_w: s.sizeW,
      size_h: s.sizeH,
      size_unit: s.sizeUnit,
      material_raw: s.material,
      product_name: product.productName,
      product_code: product.productCode,
      product_matched: product.matched,
      total_qty: s.totalQty,
      // single_qty 不再等於 total_qty（既有瑕疵）：查無稿件切割規則前留白，
      // 顯示端 fallback 用 single_qty ?? Math.round(total_qty/(draft_count||1))。
      material_spec: s.spec,
      file_ext: s.ext,
      lamination: product.lamination ?? null,
      ink_type: product.inkType ?? null,
      print_method: product.printMethod ?? null,
      plate_material: product.plateMaterial ?? null,
      erp_enrich: product.erpEnrich ?? {},
      thumbnail_status: "pending",
      ship_name: shipName,
      ship_phone: shipPhone,
      ship_address: shipAddress,
    })
    .select("id, order_no")
    .single();
  if (error) throw error;
  return data as { id: string; order_no: string };
}

/** 取某工單的加工說明／配件明細，依 sort 升冪；kind 不給就兩種都回。 */
export async function getWorkOrderItems(
  orderId: string,
  kind?: "processing" | "accessory"
): Promise<WorkOrderItem[]> {
  const db = createAdminSupabase();
  if (!db || !orderId) return [];
  let query = db.from("work_order_items").select("*").eq("work_order_id", orderId);
  if (kind) query = query.eq("kind", kind);
  const { data } = await query.order("sort", { ascending: true });
  return (data as WorkOrderItem[]) ?? [];
}

/**
 * 整組取代加工／配件明細（編輯表單用，走 replace_work_order_items RPC 原子取代）。
 * demo 雙重防護：這裡先擋一次（即使呼叫端忘了在 API 層擋，DB 也不會被寫）。
 * 回 null 代表「沒寫入」（db 未設定／查無工單／demo／RPC 出錯），呼叫端一律視為失敗。
 */
export async function replaceWorkOrderItems(
  workOrderId: string,
  kind: "processing" | "accessory",
  rows: WorkOrderItemInput[]
): Promise<WorkOrderItem[] | null> {
  const db = createAdminSupabase();
  if (!db || !workOrderId) return null;
  const existing = await getWorkOrder(workOrderId);
  if (!existing || isWorkOrderReadOnly(existing)) return null;

  const payload = rows.map((r) => ({
    code: r.code || null,
    name: r.name ?? "",
    qty: r.qty === "" || r.qty === undefined ? null : r.qty,
    unit: r.unit || null,
  }));

  const { error } = await db.rpc("replace_work_order_items", {
    p_order: workOrderId,
    p_kind: kind,
    p_rows: payload,
  });
  if (error) {
    console.error("[workOrders] replaceWorkOrderItems failed:", error.message);
    return null;
  }
  return getWorkOrderItems(workOrderId, kind);
}

/** 某工單的條碼掃描事件，新到舊；limit 預設 50（Phase 3 掃描站會用得更頻繁）。 */
export async function getWorkOrderEvents(workOrderId: string, limit = 50): Promise<WorkOrderEvent[]> {
  const db = createAdminSupabase();
  if (!db || !workOrderId) return [];
  const { data } = await db
    .from("work_order_events")
    .select("*")
    .eq("work_order_id", workOrderId)
    .order("scanned_at", { ascending: false })
    .limit(limit);
  return (data as WorkOrderEvent[]) ?? [];
}

export async function getWorkOrder(id: string): Promise<WorkOrder | null> {
  const db = createAdminSupabase();
  if (!db) return null;
  const { data, error } = await db.from("work_orders").select("*").eq("id", id).single();
  if (error) return null;
  return data as WorkOrder;
}

/** 取某案件（session）底下的所有工單，新到舊。 */
export async function getWorkOrdersBySession(sessionId: string): Promise<WorkOrder[]> {
  const db = createAdminSupabase();
  if (!db || !sessionId) return [];
  const production = productionWorkOrderFilter();
  const { data } = await db
    .from("work_orders")
    .select("*")
    .eq("session_id", sessionId)
    .eq(production.column, production.value)
    .order("created_at", { ascending: false });
  return (data as WorkOrder[]) ?? [];
}

/** 更新工單（只接受白名單欄位＋通過驗證；空字串轉 null）。 */
export async function updateWorkOrder(
  id: string,
  patch: Partial<Record<EditableField, unknown>>
): Promise<WorkOrder | null> {
  const db = createAdminSupabase();
  if (!db) return null;
  const existing = await getWorkOrder(id);
  if (!existing || isWorkOrderReadOnly(existing)) return null;

  const validation = validateWorkOrderPatch(patch);
  if (!validation.ok) return null;
  const clean = validation.values;

  if (Object.keys(clean).length === 0) return existing;
  const { data, error } = await db
    .from("work_orders")
    .update(clean)
    .eq("id", id)
    .eq("is_demo", false)
    .select("*")
    .single();
  if (error) return null;
  return data as WorkOrder;
}

// ── 工單列表：搜尋／排序／分頁（app/admin/orders） ───────────────────────

const PAGE_SIZE = 50;

// 列表只 select 顯示會用到的欄位——不要 "*"、不要 parsed（jsonb 對列表沒用又肥大）。
const LIST_COLUMNS =
  "id, order_no, serial, payment_type, customer_name, customer_no, customer_phone, " +
  "product_name, material_raw, design_name, size_w, size_h, size_unit, " +
  "station, status, received_at, delivery_date, receiver";

export type WorkOrderListRow = {
  id: string;
  order_no: string | null;
  serial: string | null;
  payment_type: string | null;
  customer_name: string | null;
  customer_no: string | null;
  customer_phone: string | null;
  product_name: string | null;
  material_raw: string | null;
  design_name: string | null;
  size_w: number | null;
  size_h: number | null;
  size_unit: string | null;
  station: string | null;
  status: string;
  received_at: string | null;
  delivery_date: string | null;
  receiver: string | null;
};

export type WorkOrderListFilters = {
  q?: string | null;
  status?: string | null;
  station?: string | null;
  from?: string | null; // 接單日下限（YYYY-MM-DD，比對 received_at）
  to?: string | null; // 接單日上限（YYYY-MM-DD，比對 received_at）
  unmatched?: boolean | string | null; // 真值 → product_matched = false
  sort?: string | null;
  page?: number | string | null;
  includeDemo?: boolean;
};

export type WorkOrderListResult = {
  rows: WorkOrderListRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type WorkOrderSort = { column: string; ascending: boolean };

const SORT_PRESETS: Record<string, WorkOrderSort> = {
  received_desc: { column: "received_at", ascending: false },
  received_asc: { column: "received_at", ascending: true },
  delivery_asc: { column: "delivery_date", ascending: true },
  delivery_desc: { column: "delivery_date", ascending: false },
  order_no_desc: { column: "order_no", ascending: false },
};

const DEFAULT_SORT_KEY = "received_desc";
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 排序白名單：只接受固定 5 種 key，絕不把使用者字串直接餵進 .order()
 * （避免任意欄位排序被濫用來探測 schema／製造效能攻擊）。不在白名單內 → 用預設值。
 */
export function resolveWorkOrderSort(raw: string | null | undefined): WorkOrderSort {
  const key = String(raw ?? "");
  return SORT_PRESETS[key] ?? SORT_PRESETS[DEFAULT_SORT_KEY];
}

/**
 * 搜尋字串清洗：移除會弄壞 PostgREST or() 語法的結構字元（, . ( ) * \ % " ' 與控制字元），
 * 取代為空白、trim、裁到 40 字。這條清洗是必要的注入防護——listWorkOrders 走
 * service_role（繞過 RLS），使用者輸入若含 or() 的結構字元，理論上能拼出額外查詢條件。
 */
export function buildWorkOrderSearchTerm(raw: string | null | undefined): string {
  const cleaned = String(raw ?? "").replace(/[,.()*\\%"'\x00-\x1f]/g, " ").trim();
  return cleaned.slice(0, 40);
}

function isTruthyFlag(v: unknown): boolean {
  return v === true || v === "1" || v === "true" || v === "on";
}

// 型別故意用 any：supabase-js 的 PostgrestFilterBuilder 每個 chain method 都回傳
// 高度泛型化的 this 型別，宣告成精確型別在這個專案（未產生 Database 型別）下很容易
// 卡在無關的泛型不吻合，反而增加出錯面；這支只在模組內部用、範圍很小，風險可控。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildWorkOrderQuery(db: NonNullable<ReturnType<typeof createAdminSupabase>>, filters: WorkOrderListFilters): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = db.from("work_orders").select(LIST_COLUMNS, { count: "exact" });

  if (!filters.includeDemo) {
    const production = productionWorkOrderFilter();
    query = query.eq(production.column, production.value);
  }

  const term = buildWorkOrderSearchTerm(filters.q);
  if (term) {
    const pattern = `%${term}%`;
    const orParts = [
      `order_no.ilike.${pattern}`,
      `customer_name.ilike.${pattern}`,
      `customer_no.ilike.${pattern}`,
      `customer_phone.ilike.${pattern}`,
      `contact_person.ilike.${pattern}`,
      `design_name.ilike.${pattern}`,
      `file_name.ilike.${pattern}`,
      `product_name.ilike.${pattern}`,
    ];
    const digits = term.replace(/\D/g, "");
    if (digits) orParts.push(`customer_phone.ilike.%${digits}%`);
    query = query.or(orParts.join(","));
  }

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.station) query = query.eq("station", filters.station);
  if (filters.from && DATE_ONLY_RE.test(filters.from)) {
    query = query.gte("received_at", `${filters.from}T00:00:00+08:00`);
  }
  if (filters.to && DATE_ONLY_RE.test(filters.to)) {
    query = query.lte("received_at", `${filters.to}T23:59:59+08:00`);
  }
  if (isTruthyFlag(filters.unmatched)) {
    query = query.eq("product_matched", false);
  }

  return query;
}

async function fetchWorkOrderPage(
  db: NonNullable<ReturnType<typeof createAdminSupabase>>,
  filters: WorkOrderListFilters,
  sort: WorkOrderSort,
  pageNum: number,
  pageSize: number
) {
  const rangeFrom = (pageNum - 1) * pageSize;
  const query = buildWorkOrderQuery(db, filters)
    .order(sort.column, { ascending: sort.ascending })
    .order("created_at", { ascending: false })
    .range(rangeFrom, rangeFrom + pageSize - 1);
  return query as Promise<{ data: WorkOrderListRow[] | null; count: number | null; error: { message: string } | null }>;
}

/**
 * 工單列表查詢：搜尋＋篩選＋白名單排序＋分頁。
 * page 永遠夾在 [1, pageCount]（pageCount 至少為 1）——要求超出範圍的頁碼不會 404，
 * 而是安靜地退回有效範圍內（0 筆時等同回第 1 頁的空結果）。
 */
export async function listWorkOrders(filters: WorkOrderListFilters = {}): Promise<WorkOrderListResult> {
  const pageSize = PAGE_SIZE;
  const sort = resolveWorkOrderSort(filters.sort);

  const rawPageNum = Math.trunc(Number(filters.page));
  const rawPage = Number.isFinite(rawPageNum) && rawPageNum > 0 ? Math.min(rawPageNum, 100000) : 1;

  const db = createAdminSupabase();
  if (!db) return { rows: [], total: 0, page: 1, pageSize, pageCount: 1 };

  const first = await fetchWorkOrderPage(db, filters, sort, rawPage, pageSize);
  const total = first.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(rawPage, 1), pageCount);

  if (page === rawPage) {
    return { rows: first.data ?? [], total, page, pageSize, pageCount };
  }

  // 要求的頁碼超出範圍（例如 page=999）：用夾好的頁碼重查一次，換回真正的內容
  // （而不是回傳「這個不存在的頁碼」對應的空 range）。
  //
  // ⚠️ 這裡 total/pageCount 都要跟著用第二次查詢重算，不能只修 total：range 起點遠超出
  // 實際筆數時 PostgREST 回的是 416（count 也會是 null，不是「查到 0 筆」的 200），第一次
  // 查詢因此把 pageCount 算成 1；如果不重算，回傳的 pageCount 會卡在錯的 1，跟真正重查後
  // 拿到的 total 對不上（小資料量時剛好兩者都算出 1，巧合蓋掉這個問題，資料量一長大就會現形）。
  const second = await fetchWorkOrderPage(db, filters, sort, page, pageSize);
  const total2 = second.count ?? total;
  const pageCount2 = Math.max(1, Math.ceil(total2 / pageSize));
  return { rows: second.data ?? [], total: total2, page, pageSize, pageCount: pageCount2 };
}

// ── 貨物寄送預設值（編輯表單「帶入會員預設」按鈕用） ───────────────────────

export type ShippingDefaults = {
  name: string | null;
  phone: string | null;
  lastAddress: string | null;
};

/**
 * 會員的貨物寄送預設值：姓名／電話來自 members 表，地址取該會員「最近一張有填
 * ship_address 的工單」（比從 members 拉一個永遠不會更新的地址欄更貼近實際收貨處）。
 * 查不到會員或未帶 memberId → null，呼叫端應 fallback 成留白讓人工填。
 */
export async function getShippingDefaults(memberId: string | null | undefined): Promise<ShippingDefaults | null> {
  if (!memberId) return null;
  const db = createAdminSupabase();
  if (!db) return null;

  const { data: member } = await db
    .from("members")
    .select("name, phone, phone_display")
    .eq("id", memberId)
    .maybeSingle();
  if (!member) return null;

  const { data: lastOrder } = await db
    .from("work_orders")
    .select("ship_address")
    .eq("member_id", memberId)
    .not("ship_address", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    name: member.name ?? null,
    phone: member.phone_display ?? member.phone ?? null,
    lastAddress: lastOrder?.ship_address ?? null,
  };
}
