import { createAdminSupabase } from "@/lib/supabase";

// 加工／配件共用選項（工作單編輯表單的多列編輯器用）。
// 兩種編輯器（加工說明／配件）共用同一份 erp_processing_items 主檔——
// kind 是由使用者用哪個編輯器決定，不靠 subcategory_code 自動分類
// （同一批 subcategory 混了加工跟配件兩類，分不開）。
export type ProcessingItemOption = {
  code: string;
  name: string;
  unit: string | null; // 149 筆裡有 14 筆是 null，前端單位欄要能手改、不能唯讀
  group: string; // 中文分類，來自 subcategory_code 對照
};

// subcategory_code → 中文分類（erp_processing_items 目前只出現這 9 種）。
const SUBCATEGORY_LABELS: Record<string, string> = {
  Z001: "海報加工",
  Z002: "帆布加工",
  Z003: "旗幟加工",
  Z004: "背心加工",
  Z005: "施工費",
  Z006: "無接縫加工",
  Z007: "UV加工",
  Z999: "其他加工",
  MA201: "帆布加工",
};

function labelForSubcategory(code: string | null | undefined): string {
  if (!code) return "其他加工";
  return SUBCATEGORY_LABELS[code] ?? "其他加工";
}

type CacheEntry = { at: number; items: ProcessingItemOption[] };
let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分鐘：編輯表單常開，不必每次都查 DB

/**
 * 加工／配件下拉選項（erp_processing_items，active=1）。模組內 5 分鐘快取。
 * db 未設定或查詢失敗 → 回舊快取（若有）或空陣列，不 throw（下拉選單查不到就是空的，
 * 不該讓整個工單編輯頁掛掉）。
 */
export async function listProcessingItems(): Promise<ProcessingItemOption[]> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.items;

  const db = createAdminSupabase();
  if (!db) return cache?.items ?? [];

  const { data, error } = await db
    .from("erp_processing_items")
    .select("code, name, subcategory_code, unit")
    .eq("active", 1)
    .order("subcategory_code", { ascending: true })
    .order("name", { ascending: true });

  if (error || !data) return cache?.items ?? [];

  const items: ProcessingItemOption[] = data.map((row) => ({
    code: String(row.code),
    name: String(row.name ?? ""),
    unit: (row.unit as string | null) ?? null,
    group: labelForSubcategory(row.subcategory_code as string | null),
  }));

  cache = { at: now, items };
  return items;
}
