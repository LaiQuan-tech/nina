import { createAdminSupabase } from "@/lib/supabase";

// 印刷檔：私有 Supabase Storage bucket "print-files"。
// 上傳走 service_role、下載一律簽名 URL（bucket 不公開）。

const BUCKET = "print-files";

/**
 * 檔名淨化（路徑穿越防護）：先去掉任何路徑段（/ 與 \），再只留安全字元
 * [A-Za-z0-9._-]、折疊連續點、去掉開頭的 . _ -；保尾端 80 字（副檔名在尾端）。
 * 全部被濾掉（如純中文檔名）→ 退為 "file"，唯一性由呼叫端的隨機前綴保證。
 * 註：完整原始檔名（含中文）另存 work_orders.file_name，工單顯示用。
 */
function safeFileName(fileName: string): string {
  const base = String(fileName ?? "").split(/[/\\]/).pop() ?? "";
  const cleaned = base
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^[._-]+/, "");
  const trimmed = cleaned.slice(-80);
  return trimmed || "file";
}

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

  const now = new Date();
  const yyyymm = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const rand = globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  const path = `orders/${yyyymm}/${rand}-${safeFileName(fileName)}`;

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
