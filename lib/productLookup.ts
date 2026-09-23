import { createAdminSupabase } from "@/lib/supabase";
import {
  deriveLamination,
  deriveInkType,
  derivePrintMethod,
  derivePlateMaterial,
} from "@/lib/erp/productName";
import type { ProductResolution } from "@/lib/workOrders";

export type ProductMatch = {
  code: string; // 命中的商品編號，例 CCPVC720N
  name: string; // 商品名稱，例 高遮PVC+霧
  exact: boolean; // true=完全相符；false=最長前綴相符
};

/**
 * 用檔名末段的商品碼（例 CCPVC720N10M）查 ERP 商品主檔（走 match_product RPC）。
 * RPC 先找完全相符，否則找「最長前綴相符」的商品碼（例 CCPVC720N）。
 * 查無 → 回 null（呼叫端 soft 處理：仍收檔，工單標「非標準商品」）。
 */
export async function lookupProduct(spec: string): Promise<ProductMatch | null> {
  const db = createAdminSupabase();
  if (!db || !spec) return null;
  const { data, error } = await db.rpc("match_product", { p_spec: spec.trim() });
  if (error || !data || (Array.isArray(data) && data.length === 0)) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return { code: row.code, name: row.name, exact: Boolean(row.exact) };
}

// match_product_v2 RPC 的回傳列（見 supabase/work_order_v2_schema.sql）。
type MatchProductV2Row = {
  code: string;
  name: string;
  exact: boolean;
  subcategory_code: string | null;
  sub_name: string | null;
  main_product_name: string | null;
  unit: string | null;
  note: string | null;
  work_days: number | null;
  sides: string | null;
};

/**
 * 建單用的 ERP 補值：走 match_product_v2（一次拿回主檔＋join 出的子商品資訊），
 * 內部再用 lib/erp/productName.ts 的規則推 護貝膜／油墨類別／列印方式／版材。
 *
 * 查不到（RPC 無資料或出錯）→ soft：回 matched:false + fallbackProductName，
 * 呼叫端仍應照常收檔、只把工單標「非標準商品」，絕不 throw 擋單。
 * 低信心或未過白名單的欄位一律不寫進主要欄位，只塞進 erpEnrich 給 Phase 2 下拉建議參考
 * （尤其 ink_type：sub_name 沒中白名單就絕對不能塞，否則會印出「馬克杯」這種非油墨類別字樣）。
 *
 * 注意：既有的 lookupProduct() 完全不動（既有呼叫端沿用），這是另一條新路徑。
 */
export async function resolveProductForOrder(
  spec: string,
  fallbackProductName: string
): Promise<ProductResolution> {
  const db = createAdminSupabase();
  if (!db || !spec) {
    return { productName: fallbackProductName, productCode: null, matched: false };
  }

  let row: MatchProductV2Row | null = null;
  try {
    const { data, error } = await db.rpc("match_product_v2", { p_spec: spec.trim() });
    if (!error && data) {
      row = (Array.isArray(data) ? data[0] : data) as MatchProductV2Row | undefined ?? null;
    }
  } catch {
    row = null;
  }

  if (!row || !row.code) {
    return { productName: fallbackProductName, productCode: null, matched: false };
  }

  const name = row.name ?? "";
  const lamination = deriveLamination(name, row.code);
  const ink = deriveInkType(row.sub_name);
  const method = derivePrintMethod(name);
  const plate = derivePlateMaterial(name);

  const erpEnrich: Record<string, unknown> = {
    exact: Boolean(row.exact),
    subcategory_code: row.subcategory_code ?? null,
    family: row.sub_name ?? null, // Phase 2 下拉建議用；白名單沒中的 sub_name 只放這裡
    main_product_name: row.main_product_name ?? null,
    unit: row.unit ?? null,
    note: row.note ?? null,
    sides: row.sides ?? null,
    guesses: { lamination, ink, printMethod: method, plateMaterial: plate },
  };

  return {
    productName: name,
    productCode: row.code,
    matched: true,
    lamination: lamination?.value ?? null,
    inkType: ink?.value ?? null,
    printMethod: method?.value ?? null,
    plateMaterial: plate?.value ?? null,
    erpEnrich,
  };
}
