// 產圖端點（/api/admin/order/[id]/thumbnail/generate）與工單頁 ThumbnailAutoGenerate 元件之間的「協定」：
// 伺服器怎麼把結果變成回應、前端拿到回應後下一步做什麼。純函式、不 import 產圖模組，前後端都能用。
import { asThumbnailMeta, isThumbnailRetryable, THUMBNAIL_LEASE_MS, type ThumbnailState } from "./policy";

export type ThumbnailGenerateResponse = {
  ok: true;
  status: string | null;
  hasThumbnail: boolean;
  /** 別人正持有租約在產同一張：前端稍後再問，不是失敗。 */
  inProgress: boolean;
  /** false = 不會再自動重試（已成功、不支援、太大、或開工次數用完）。 */
  retryable: boolean;
  reason: string | null;
};

/**
 * 只回報「已確實寫進 DB」的狀態：寫回或重讀失敗（confirmed=false）時一律回「沒有縮圖、可重試」，
 * 不拿本地推測的結果騙前端 refresh（refresh 後伺服器讀 DB 仍沒有圖，元件就會卡住）。
 */
export function thumbnailGenerateResponse(result: {
  row: ThumbnailState;
  inProgress: boolean;
  confirmed: boolean;
}): ThumbnailGenerateResponse {
  const { row, inProgress, confirmed } = result;
  if (!confirmed) {
    return { ok: true, status: null, hasThumbnail: false, inProgress: false, retryable: true, reason: null };
  }
  const reason = asThumbnailMeta(row.thumbnail_meta).reason;
  return {
    ok: true,
    status: row.thumbnail_status,
    hasThumbnail: Boolean(row.thumbnail_path),
    inProgress: !row.thumbnail_path && inProgress,
    retryable: isThumbnailRetryable(row),
    reason: typeof reason === "string" ? reason : null,
  };
}

export type ThumbnailClientStep = "refresh" | "wait" | "failed";

/**
 * 前端拿到回應後的下一步：
 *   有縮圖，或確定不會再自動產（不支援／太大／次數用完）→ refresh（交給伺服器畫出圖或最終狀態）
 *   別人正在產 → wait（退避後再問一次）
 *   其餘（這次失敗但還能重試、HTTP 錯誤、回應壞掉）→ failed（顯示重試鈕，不自動連打）
 */
export function nextThumbnailClientStep(httpOk: boolean, body: unknown): ThumbnailClientStep {
  if (!httpOk || !body || typeof body !== "object") return "failed";
  const r = body as Partial<ThumbnailGenerateResponse> & { ok?: unknown };
  if (r.ok !== true) return "failed";
  if (r.hasThumbnail) return "refresh";
  if (r.inProgress) return "wait";
  if (r.retryable === false) return "refresh";
  return "failed";
}

const POLL_DELAYS_MS = [2_000, 3_000, 5_000, 8_000];
export const THUMBNAIL_POLL_MAX_DELAY_MS = 10_000;
/** refresh 後若元件仍在（伺服器仍判定要自動產，例如 refresh 請求失敗），等這麼久再問一次。 */
export const THUMBNAIL_REFRESH_GRACE_MS = 5_000;
/**
 * 一輪最多等多久就放棄、改顯示可重試：比租約長 30 秒——持有租約的人若被平台砍掉，租約過期後這邊的下一次
 * 詢問就會自己搶到租約接手產；一般情況（對方幾秒內產完）很早就結束。
 */
export const THUMBNAIL_POLL_BUDGET_MS = THUMBNAIL_LEASE_MS + 30_000;

/** 第 n 次（從 0 起算）「別人正在產」之後要等多久再問：2、3、5、8 秒，之後每 10 秒。 */
export function thumbnailPollDelayMs(attempt: number): number {
  return POLL_DELAYS_MS[attempt] ?? THUMBNAIL_POLL_MAX_DELAY_MS;
}
