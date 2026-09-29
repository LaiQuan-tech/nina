// 印刷檔在私有 bucket "print-files" 裡的物件路徑：`orders/<yyyymm>/<10 碼隨機 hex>-<安全檔名>`。
// 舊的 /api/upload（lib/storage.ts uploadPrintFile）與直傳的 /api/upload/ticket 共用同一套規則，
// 路徑一律由伺服器產生，瀏覽器指定不了要寫到哪裡。純函式、零依賴，可單元測試。

/**
 * 檔名淨化（路徑穿越防護）：先去掉任何路徑段（/ 與 \），再只留安全字元
 * [A-Za-z0-9._-]、折疊連續點、去掉開頭的 . _ -；保尾端 80 字（副檔名在尾端）。
 * 全部被濾掉（如純中文檔名）→ 退為 "file"，唯一性由呼叫端的隨機前綴保證。
 * 註：完整原始檔名（含中文）另存 work_orders.file_name，工單顯示用。
 */
export function safeFileName(fileName: string): string {
  const base = String(fileName ?? "").split(/[/\\]/).pop() ?? "";
  const cleaned = base
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^[._-]+/, "");
  const trimmed = cleaned.slice(-80);
  return trimmed || "file";
}

function randomPrefix(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

/** 產生一個新的印刷檔物件路徑（月份用 UTC，沿用既有規則）。now／rand 只給測試注入。 */
export function newPrintFilePath(fileName: string, now: Date = new Date(), rand: string = randomPrefix()): string {
  const yyyymm = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `orders/${yyyymm}/${rand}-${safeFileName(fileName)}`;
}

const PRINT_FILE_PATH_RE = /^orders\/\d{6}\/[0-9a-f]{10}-([A-Za-z0-9._-]{1,80})$/;

/** 是不是 newPrintFilePath 產得出來的路徑（刪檔前的守門：縮圖 thumbs/ 等其他路徑一律不是）。 */
export function isGeneratedPrintFilePath(path: string): boolean {
  return typeof path === "string" && PRINT_FILE_PATH_RE.test(path);
}

/** 路徑的檔名段是否正是 safeFileName(fileName)——上傳票券驗證「路徑與檔名是同一組」用。 */
export function printFilePathMatchesName(path: string, fileName: string): boolean {
  if (typeof path !== "string" || typeof fileName !== "string") return false;
  const m = PRINT_FILE_PATH_RE.exec(path);
  return m !== null && m[1] === safeFileName(fileName);
}
