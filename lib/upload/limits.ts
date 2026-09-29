// 客人上傳印刷檔的單檔大小上限：前端（ChatUpload 先擋）與後端（/api/upload/ticket、/api/upload/complete、
// 舊的 /api/upload）共用這一處定義。print-files 儲存桶的 file_size_limit 也設成同一個值（10485760），
// 讓外流的上傳網址同樣傳不了更大的檔。要調整上限時三處一起改：這裡、儲存桶設定、supabase/schema.sql 的註記。
// ⚠️ 這個檔會被打包進瀏覽器，不可 import 任何 server-only 模組。

const MB = 1024 * 1024;

export const MAX_UPLOAD_BYTES = 10 * MB;

/** 給客人看的上限字樣，例「10 MB」。 */
export const MAX_UPLOAD_LABEL = `${MAX_UPLOAD_BYTES / MB} MB`;

/** 合法的檔案大小：正整數位元組、且不超過上限（剛好等於上限可以）。 */
export function isUploadSizeAllowed(size: unknown): size is number {
  return typeof size === "number" && Number.isSafeInteger(size) && size > 0 && size <= MAX_UPLOAD_BYTES;
}

/**
 * 位元組 → 「12.4 MB」。一律無條件進位到小數第一位：超過上限 1 byte 的檔要顯示成「10.1 MB」，
 * 不能四捨五入成「10.0 MB」讓客人以為沒超過。
 */
export function formatMegabytes(bytes: number): string {
  const mb = Math.ceil((Math.max(0, bytes) / MB) * 10) / 10;
  return `${mb.toFixed(1)} MB`;
}
