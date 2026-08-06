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

// 商品命中 ERP 主檔的結果（由 lib/productLookup 提供）。
export type ProductResolution = {
  productName: string; // 最終商品名稱（命中→主檔名稱；未命中→材質對照 fallback）
  productCode: string | null; // 命中的商品編號
  matched: boolean;
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
      single_qty: s.totalQty,
      material_spec: s.spec,
      file_ext: s.ext,
    })
    .select("id, order_no")
    .single();
  if (error) throw error;
  return data as { id: string; order_no: string };
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
  const { data } = await db
    .from("work_orders")
    .select("*")
    .eq("session_id", sessionId)
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
  const clean: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELDS) {
    if (key in patch) {
      const v = patch[key];
      clean[key] = v === "" || v === undefined ? null : v;
    }
  }
  if (Object.keys(clean).length === 0) return getWorkOrder(id);
  const { data, error } = await db.from("work_orders").update(clean).eq("id", id).select("*").single();
  if (error) return null;
  return data as WorkOrder;
}
