// 縮圖管線的「規則」：什麼時候該自動產、原始檔多大就放棄、PDF 要渲染成多大、產圖租約怎麼算。
// 刻意是純函式、不 import sharp／PDFium——工單詳情頁要用 canAutoGenerateThumbnail() 決定
// 要不要掛「縮圖產生中…」的 client 元件，頁面的 import 鏈不能因此把產圖模組拖進來。

export const THUMBNAIL_MAX_SOURCE_BYTES = 25 * 1024 * 1024; // >25MB 直接標 unsupported(too_large)，不嘗試渲染
export const THUMBNAIL_MAX_TRIES = 3; // 自動產圖最多「開工」這麼多次（含被平台逾時／OOM 砍掉的），滿了就不再自動跑
export const THUMBNAIL_EDGE = 1200; // 縮圖長邊上限（px）
// 產圖租約：開工前先搶（lib/thumbnail/job.ts），期限內別人不會再產同一張。必須長於任何會持有租約的函式的
// maxDuration——產圖端點與收檔路由（背景產圖跑在它的 waitUntil 裡）都是 60 秒，逾時被平台砍掉時租約自然過期、
// 下一個人才能接手；多出的 30 秒吸收各實例的時鐘誤差。
export const THUMBNAIL_LEASE_MS = 90_000;
const LAST_ERROR_MAX_CHARS = 300; // last_error 會進 CAS 條件的 URL，截短避免過長

export type ThumbnailMeta = {
  tries?: number;
  last_error?: string;
  last_try_at?: string;
  reason?: string;
  lease_until?: string; // 目前這次嘗試的租約到期時間（ISO）；完成（成功或失敗）就移除
  lease_id?: string; // 目前這次嘗試的識別碼；自動縮圖的 storage 路徑也用它，每次嘗試各寫各的檔
  [key: string]: unknown;
};

export type ThumbnailState = {
  thumbnail_path: string | null;
  thumbnail_status: string | null;
  thumbnail_meta: unknown;
};

export function asThumbnailMeta(value: unknown): ThumbnailMeta {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as ThumbnailMeta) : {};
}

export function thumbnailTries(meta: unknown): number {
  const tries = asThumbnailMeta(meta).tries;
  return typeof tries === "number" && Number.isFinite(tries) && tries > 0 ? tries : 0;
}

/** 租約是否還在期限內（有人正在產這張的縮圖）。lease_until 缺值／格式壞掉一律當沒有租約。 */
export function thumbnailLeaseActive(meta: unknown, now: number = Date.now()): boolean {
  const until = asThumbnailMeta(meta).lease_until;
  if (typeof until !== "string") return false;
  const ms = Date.parse(until);
  return Number.isFinite(ms) && ms > now;
}

/** 還沒有縮圖、狀態也不是終態（ok／unsupported／manual）→ 自動管線還有事可做。 */
function isOpenForAutoThumbnail(order: ThumbnailState): boolean {
  if (order.thumbnail_path) return false; // 已有縮圖（含人工補的 -manual- 圖）
  const status = order.thumbnail_status;
  return !status || status === "pending" || status === "failed";
}

/**
 * 現在可以「開工」產一次嗎（搶租約的前提）：
 *   已有縮圖／終態 → 不行；已開工滿 THUMBNAIL_MAX_TRIES 次（不論 pending 或 failed）→ 不行；
 *   別人的租約還沒過期 → 不行（等它做完或逾時）。其餘 → 可以。
 */
export function canClaimThumbnail(order: ThumbnailState, now: number = Date.now()): boolean {
  if (!isOpenForAutoThumbnail(order)) return false;
  if (thumbnailTries(order.thumbnail_meta) >= THUMBNAIL_MAX_TRIES) return false;
  return !thumbnailLeaseActive(order.thumbnail_meta, now);
}

/** 有人正持有租約、正在產這張的縮圖（呼叫端應等一下再看，而不是自己再產一份）。 */
export function isThumbnailInProgress(order: ThumbnailState, now: number = Date.now()): boolean {
  return isOpenForAutoThumbnail(order) && thumbnailLeaseActive(order.thumbnail_meta, now);
}

/** 之後還能再自動試（不看租約）：還沒有縮圖、不是終態、開工次數未滿。 */
export function isThumbnailRetryable(order: ThumbnailState): boolean {
  return isOpenForAutoThumbnail(order) && thumbnailTries(order.thumbnail_meta) < THUMBNAIL_MAX_TRIES;
}

/**
 * 自動管線還會（或正在）產這張的縮圖嗎：可以再開工，或有人正持有租約在產。
 *   已有 thumbnail_path（含人工補的 -manual- 圖）、終態 ok／unsupported／manual → 不會
 *   已開工滿 THUMBNAIL_MAX_TRIES 次、而且沒有人正在產 → 不會（改人工補圖）
 *   其餘（pending、failed 未滿、舊單的 null、別人正在產）→ 會
 * 工單詳情頁用它決定要不要掛自動產生元件，產圖端點也用同一套規則（canClaimThumbnail／isThumbnailInProgress）。
 */
export function canAutoGenerateThumbnail(order: ThumbnailState, now: number = Date.now()): boolean {
  return isThumbnailRetryable(order) || isThumbnailInProgress(order, now);
}

/** 沒有縮圖、也不會再自動產時，縮圖格要顯示哪一種說明。 */
export function thumbnailPlaceholderKind(
  order: ThumbnailState,
  now: number = Date.now()
): "failed" | "unsupported" | "pending" {
  if (order.thumbnail_status === "unsupported") return "unsupported";
  if (order.thumbnail_status === "failed") return "failed";
  // pending／舊單 null，但已開工滿上限又沒人在產（例如三次都被平台逾時砍掉）→ 其實就是失敗了
  if (isOpenForAutoThumbnail(order) && !canAutoGenerateThumbnail(order, now)) return "failed";
  return "pending";
}

/** 搶租約時要寫進 DB 的 meta：開工次數先 +1（被平台砍掉也算一次）、記開工時間、掛上這次的租約。 */
export function buildThumbnailClaimMeta(meta: unknown, leaseId: string, now: number): ThumbnailMeta {
  const base = asThumbnailMeta(meta);
  return {
    ...base,
    tries: thumbnailTries(base) + 1,
    last_try_at: new Date(now).toISOString(),
    lease_until: new Date(now + THUMBNAIL_LEASE_MS).toISOString(),
    lease_id: leaseId,
  };
}

/** 這次嘗試結束（成功或失敗）時寫回的 meta：拿掉租約欄位，其餘照舊。 */
export function releaseThumbnailLease(meta: unknown): ThumbnailMeta {
  const rest: ThumbnailMeta = { ...asThumbnailMeta(meta) };
  delete rest.lease_until;
  delete rest.lease_id;
  return rest;
}

export function truncateThumbnailError(message: string): string {
  return message.length > LAST_ERROR_MAX_CHARS ? `${message.slice(0, LAST_ERROR_MAX_CHARS)}…` : message;
}

/** 自動縮圖的 storage 路徑：每次嘗試（租約）各一個檔，晚到的自動結果不會蓋掉別人已寫好的圖；人工補圖是 -manual-，兩者不共用路徑。 */
export function autoThumbnailPath(orderId: string, leaseId: string): string {
  return `thumbs/${orderId}-auto-${leaseId}.jpg`;
}

/** Storage 回報的原始檔大小是否超過自動縮圖上限（大小未知 → false，交給下載後再判斷）。 */
export function isThumbnailSourceTooLarge(bytes: number | null | undefined): boolean {
  return typeof bytes === "number" && Number.isFinite(bytes) && bytes > THUMBNAIL_MAX_SOURCE_BYTES;
}

/**
 * PDF 頁面（單位：point，1/72 inch）要直接渲染成多大的點陣圖：長邊縮到 maxEdge px、維持比例。
 * 放大倍率另外夾在 maxScale（預設 2，等於舊版固定 scale=2 的上限）：小頁面（名片、貼紙）
 * 輸出尺寸跟以前一樣、不會為了湊 1200px 反而放大；大頁面（90×180cm 布條）不再先渲出數百 MB 的
 * 點陣再縮，而是一次渲到約 1200px。回傳 null 代表頁面尺寸無效（交呼叫端標記 unsupported）。
 */
export function computePdfRenderSize(
  pageWidthPt: number,
  pageHeightPt: number,
  maxEdge = THUMBNAIL_EDGE,
  maxScale = 2
): { width: number; height: number; scale: number } | null {
  if (!Number.isFinite(pageWidthPt) || !Number.isFinite(pageHeightPt) || pageWidthPt <= 0 || pageHeightPt <= 0) {
    return null;
  }
  const longEdge = Math.max(pageWidthPt, pageHeightPt);
  const scale = Math.min(maxEdge / longEdge, maxScale);
  return {
    width: Math.max(1, Math.min(maxEdge, Math.round(pageWidthPt * scale))),
    height: Math.max(1, Math.min(maxEdge, Math.round(pageHeightPt * scale))),
    scale,
  };
}
