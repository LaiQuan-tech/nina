import { createAdminSupabase } from "@/lib/supabase";

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
