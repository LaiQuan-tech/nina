import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server 端唯讀 client（用 anon key 讀公開資料）。
 * 未設定環境變數時回傳 null，呼叫端應有 fallback。
 */
export function createServerSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: { persistSession: false },
  });
}

// 每個請求都帶 cache:"no-store"。刻意在呼叫當下才取 globalThis 的 fetch（Next 會在請求期間替換成它的
// patched fetch），no-store 讓 Next 14 的 Data Cache 完全不存這些回應。
const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store" });

export type AdminSupabaseOptions = {
  /**
   * 預設 false：這個 client 的所有請求（PostgREST 查詢、Storage 簽名 URL…）一律 no-store、不進 Next 的 Data Cache。
   * 原因：Next 14 對「沒有動態訊號」的路由（例如只有 GET、沒讀 cookies/req 的 route handler）預設把 fetch 存一年，
   * 後台曾因此拿到舊資料、過期的簽名下載網址（見 app/api/admin/order/[id]/download/route.ts）。
   * 只有「刻意要吃 Next 快取」的消費端（靜態／ISR 頁在建置或 revalidate 時取資料）才傳 true，fetch 回到 Next 預設行為、
   * 跟著該路由的 revalidate 設定走。目前沒有任何呼叫端需要（建置路由表裡的 ○ 靜態頁都不查 Supabase，首頁 / 是 ƒ 動態頁）。
   */
  allowNextCache?: boolean;
};

/**
 * Server 端寫入 client（用 service_role key，僅限 API route / server action / server component）。
 * 繞過 RLS，務必只在 server 端使用，切勿暴露給瀏覽器。預設不進 Next Data Cache（見 AdminSupabaseOptions）。
 */
export function createAdminSupabase(options: AdminSupabaseOptions = {}): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
    ...(options.allowNextCache ? {} : { global: { fetch: noStoreFetch } }),
  });
}
