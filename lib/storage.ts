import { createAdminSupabase } from "@/lib/supabase";
import { isGeneratedPrintFilePath, newPrintFilePath } from "@/lib/upload/path";

// 印刷檔：私有 Supabase Storage bucket "print-files"。
// 上傳走 service_role（舊 /api/upload）或伺服器簽發的一次性上傳網址（直傳，見 lib/upload/flow.ts）；
// 下載一律簽名 URL（bucket 不公開）。bucket 的 file_size_limit = 10MB（= lib/upload/limits.ts MAX_UPLOAD_BYTES）。

const BUCKET = "print-files";

/**
 * 上傳印刷檔到私有 bucket，路徑 `orders/<yyyymm>/<rand>-<safe fileName>`。
 * 成功回 storage_path（存 work_orders.storage_path），失敗回 null。
 */
export async function uploadPrintFile(
  fileName: string,
  bytes: ArrayBuffer | Buffer,
  contentType: string
): Promise<string | null> {
  const supabase = createAdminSupabase();
  if (!supabase) return null;
  const size = bytes instanceof ArrayBuffer ? bytes.byteLength : bytes.length;
  if (!bytes || size === 0) return null;

  const path = newPrintFilePath(fileName);

  try {
    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: contentType || "application/octet-stream",
      upsert: false,
    });
    if (error) {
      console.error("[storage] uploadPrintFile failed:", error.message);
      return null;
    }
    return path;
  } catch (err) {
    console.error("[storage] uploadPrintFile failed:", err);
    return null;
  }
}

/**
 * 從私有 bucket 下載印刷檔原始 bytes（縮圖產製管線用）。
 * 路徑不存在／bucket 出錯 → 回 null，呼叫端應 graceful 標記失敗，不要 throw 擋收檔。
 */
export async function downloadPrintFile(storagePath: string): Promise<ArrayBuffer | null> {
  const supabase = createAdminSupabase();
  if (!supabase || !storagePath) return null;
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
    if (error || !data) return null;
    return await data.arrayBuffer();
  } catch (err) {
    console.error("[storage] downloadPrintFile failed:", err);
    return null;
  }
}

/**
 * 只查印刷檔大小、不下載（GET /object/info，縮圖管線判斷 >25MB 就不下載用）。
 * 查不到／Storage 不支援 info → 回 null，呼叫端退回「下載後再看大小」的舊流程。
 */
export async function printFileSize(storagePath: string): Promise<number | null> {
  const supabase = createAdminSupabase();
  if (!supabase || !storagePath) return null;
  try {
    const { data, error } = await supabase.storage.from(BUCKET).info(storagePath);
    if (error || !data) return null;
    return typeof data.size === "number" && Number.isFinite(data.size) ? data.size : null;
  } catch (err) {
    console.error("[storage] printFileSize failed:", err);
    return null;
  }
}

/**
 * 直傳用：替伺服器分配好的路徑簽一次性上傳網址（Supabase 預設效期 2 小時），瀏覽器直接 PUT 檔案上去，
 * 檔案不經過 Vercel 函式。upsert:false → 這個網址不能覆寫已存在的物件。
 * 只接受 newPrintFilePath 產生的路徑（orders/…），縮圖等其他路徑一律不簽。成功回絕對網址，失敗回 null。
 */
export async function createPrintFileUploadUrl(storagePath: string): Promise<string | null> {
  if (!isGeneratedPrintFilePath(storagePath)) return null;
  const supabase = createAdminSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(storagePath, { upsert: false });
    if (error || !data?.signedUrl) {
      console.error("[storage] createPrintFileUploadUrl failed:", error?.message ?? "no signedUrl");
      return null;
    }
    return data.signedUrl;
  } catch (err) {
    console.error("[storage] createPrintFileUploadUrl failed:", err);
    return null;
  }
}

export type PrintFileStat = { status: "found"; size: number } | { status: "missing" } | { status: "error" };

// Storage 找不到物件時回 HTTP 400、body 的 statusCode 才是 "404"（2026-09-29 實測）；新版可能直接回 404，兩種都認。
function isStorageNotFound(error: unknown): boolean {
  const e = (error ?? {}) as { status?: unknown; statusCode?: unknown };
  return e.status === 404 || e.statusCode === "404" || e.statusCode === 404;
}

/**
 * 直傳完成時確認物件真的在、以及實際大小（GET /object/info，不下載）。
 * 跟 printFileSize 不同：要分得出「不存在」與「Storage 出錯」——前者是客人沒傳成，後者要讓客人重試。
 */
export async function statPrintFile(storagePath: string): Promise<PrintFileStat> {
  const supabase = createAdminSupabase();
  if (!supabase || !storagePath) return { status: "error" };
  try {
    const { data, error } = await supabase.storage.from(BUCKET).info(storagePath);
    if (error) return isStorageNotFound(error) ? { status: "missing" } : { status: "error" };
    const size = data?.size;
    return typeof size === "number" && Number.isFinite(size) ? { status: "found", size } : { status: "error" };
  } catch (err) {
    console.error("[storage] statPrintFile failed:", err);
    return { status: "error" };
  }
}

/**
 * 刪掉一個直傳進來、但驗收沒過（超過上限／大小與票券不符）的印刷檔，不留孤兒。
 * 只刪 newPrintFilePath 格式的路徑；縮圖（thumbs/）與其他路徑永遠不經過這支。失敗只記 log、回 false。
 */
export async function removeUploadedPrintFile(storagePath: string): Promise<boolean> {
  if (!isGeneratedPrintFilePath(storagePath)) return false;
  const supabase = createAdminSupabase();
  if (!supabase) return false;
  try {
    const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
    if (error) {
      console.error("[storage] removeUploadedPrintFile failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[storage] removeUploadedPrintFile failed:", err);
    return false;
  }
}

/**
 * 上傳縮圖（JPEG bytes）到私有 bucket 的 `thumbs/` 底下。
 * 自動管線每次嘗試用一個新路徑（`thumbs/<id>-auto-<lease_id>.jpg`）並傳 upsert:false——物件已存在就失敗，
 * 絕不覆蓋別人已寫好的圖；人工補圖（`thumbs/<id>-manual-<kind>-<ts>.jpg`）維持預設 upsert。
 * 顯示一律走 signedPrintUrl，bucket 維持私有。成功回 true，失敗回 false（不 throw）。
 */
export async function uploadThumbnail(
  path: string,
  bytes: Buffer | Uint8Array,
  options: { upsert?: boolean } = {}
): Promise<boolean> {
  const supabase = createAdminSupabase();
  if (!supabase || !path || !bytes || bytes.length === 0) return false;
  try {
    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: "image/jpeg",
      upsert: options.upsert ?? true,
    });
    if (error) {
      console.error("[storage] uploadThumbnail failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[storage] uploadThumbnail failed:", err);
    return false;
  }
}

// 只允許刪「自動縮圖」這種路徑（thumbs/<uuid>-auto-<lease>.jpg）：印刷檔原檔與人工補圖永遠不經過這支。
const AUTO_THUMBNAIL_PATH_RE = /^thumbs\/[0-9a-f-]{36}-auto-[0-9A-Za-z-]+\.jpg$/;

/**
 * 刪掉一張自動縮圖（產圖結果作廢時清掉自己剛上傳、確定沒被 DB 參照的檔）。盡力而為：失敗只記 log、不 throw。
 * 路徑不是自動縮圖格式就什麼都不做。
 */
export async function removeAutoThumbnail(path: string): Promise<void> {
  if (!AUTO_THUMBNAIL_PATH_RE.test(path)) return;
  const supabase = createAdminSupabase();
  if (!supabase) return;
  try {
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) console.error("[storage] removeAutoThumbnail failed:", error.message);
  } catch (err) {
    console.error("[storage] removeAutoThumbnail failed:", err);
  }
}

/**
 * 產印刷檔下載用簽名 URL（限時，預設 600 秒）。
 * downloadName 有給時，瀏覽器會以該檔名下載（用來還原含中文的原始檔名，
 * 因為 storage 內的路徑是淨化過的安全檔名）。
 * 路徑不存在／bucket 出錯 → 回 null 不 throw。
 */
export async function signedPrintUrl(
  storagePath: string,
  expiresInSec?: number,
  downloadName?: string
): Promise<string | null> {
  const supabase = createAdminSupabase();
  if (!supabase || !storagePath) return null;
  const expires =
    expiresInSec !== undefined && Number.isFinite(expiresInSec) && expiresInSec > 0
      ? Math.floor(expiresInSec)
      : 600;
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expires);
    if (error || !data?.signedUrl) return null;
    if (!downloadName) return data.signedUrl;
    // 注意：不要用 SDK 的 { download } 選項——它會把檔名多編碼一次，
    // 瀏覽器最後拿到的是 %257B 這種雙重編碼亂碼。手動附加才會正確還原中文檔名。
    const sep = data.signedUrl.includes("?") ? "&" : "?";
    return `${data.signedUrl}${sep}download=${encodeURIComponent(downloadName)}`;
  } catch {
    return null;
  }
}

/**
 * 一次替多個路徑簽顯示用 URL（一個 POST，工單詳情頁的縮圖＋示意圖用）。
 * 回傳陣列與輸入逐一對齊：空路徑、不存在的物件、或整批失敗 → 該位置為 null，不 throw。
 * 同一次渲染只簽一次，A4 與編輯表單拿同一組 URL，瀏覽器同一張圖只下載一次。
 */
export async function signedPrintUrls(
  storagePaths: Array<string | null | undefined>,
  expiresInSec = 600
): Promise<Array<string | null>> {
  const result: Array<string | null> = storagePaths.map(() => null);
  const wanted = [...new Set(storagePaths.filter((p): p is string => typeof p === "string" && p.length > 0))];
  if (wanted.length === 0) return result;
  const supabase = createAdminSupabase();
  if (!supabase) return result;
  const expires = Number.isFinite(expiresInSec) && expiresInSec > 0 ? Math.floor(expiresInSec) : 600;
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(wanted, expires);
    if (error || !data) return result;
    const byPath = new Map<string, string>();
    for (const item of data) {
      if (item.path && item.signedUrl && !item.error) byPath.set(item.path, item.signedUrl);
    }
    return storagePaths.map((p) => (p ? byPath.get(p) ?? null : null));
  } catch {
    return result;
  }
}
