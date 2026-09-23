import { createAdminSupabase } from "@/lib/supabase";
import type { Segments } from "@/lib/filename/types";

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
export const EDITABLE_FIELDS = [
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

/** 更新工單（只接受白名單欄位；空字串轉 null）。 */
export async function updateWorkOrder(
  id: string,
  patch: Partial<Record<EditableField, unknown>>
): Promise<WorkOrder | null> {
  const db = createAdminSupabase();
  if (!db) return null;
  const existing = await getWorkOrder(id);
  if (!existing || isWorkOrderReadOnly(existing)) return null;
  const clean: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELDS) {
    if (key in patch) {
      const v = patch[key];
      clean[key] = v === "" || v === undefined ? null : v;
    }
  }
  if (Object.keys(clean).length === 0) return getWorkOrder(id);
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
