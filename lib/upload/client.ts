// 瀏覽器端的直傳流程（ChatUpload 用）：ticket → PUT 檔案到 Supabase Storage（帶進度）→ complete。
// 檔案完全不經過 Vercel 函式（請求主體上限 4.5MB），所以上限可以是 10MB。
// 網路與 XHR 做成可注入的 deps，流程判斷（錯誤對應、complete 重試）可在 node 單元測試。

import { CONTACT } from "@/lib/site/content";
import { MAX_UPLOAD_LABEL, formatMegabytes } from "./limits";

export type MsgLink = { href: string; label: string };

/** 檔案超過上限時給客人的訊息：說出實際大小與上限，建議壓縮或改用 LINE／Email（聯絡資訊取自網站設定，不寫死）。 */
export function tooLargeMessage(bytes: number): { text: string; links: MsgLink[] } {
  return {
    text:
      `這個檔案有 ${formatMegabytes(bytes)}，超過單檔上限 ${MAX_UPLOAD_LABEL}，這次沒有收件。` +
      `建議先壓縮（例如降低圖片解析度、另存成較小的 PDF）後再重新上傳；` +
      `如果無法縮小，請改用 LINE 或 Email 與我們聯絡，我們會協助您收件。`,
    links: [
      { href: CONTACT.line, label: "LINE 專員" },
      { href: `mailto:${CONTACT.email}`, label: `Email：${CONTACT.email}` },
    ],
  };
}

type JsonReply = { status: number; data: Record<string, unknown> | null };

export type DirectUploadDeps = {
  /** POST JSON；網路層失敗（fetch 丟錯）回 null。回應不是 JSON 時 data 為 null。 */
  postJson: (url: string, body: unknown) => Promise<JsonReply | null>;
  /** PUT 檔案到上傳網址並回報進度（0–1）；網路層失敗回 null。 */
  put: (url: string, file: Blob, contentType: string, onProgress: (fraction: number) => void) => Promise<{ status: number; body: string } | null>;
  sleep: (ms: number) => Promise<void>;
};

export type DirectUploadOutcome =
  | { kind: "ok" }
  | { kind: "too_large" }
  | { kind: "failed"; stage: "ticket" | "put" | "complete"; status?: number; error?: string };

const COMPLETE_ATTEMPTS = 2;
const COMPLETE_RETRY_DELAY_MS = 1500;

async function browserPostJson(url: string, body: unknown): Promise<JsonReply | null> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    return null;
  }
  // 回應不一定是 JSON（例如平台層的 413 是純文字）：解析失敗不當成網路錯，交給狀態碼判斷
  const data: unknown = await res.json().catch(() => null);
  return { status: res.status, data: data && typeof data === "object" ? (data as Record<string, unknown>) : null };
}

function browserPut(
  url: string,
  file: Blob,
  contentType: string,
  onProgress: (fraction: number) => void
): Promise<{ status: number; body: string } | null> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => resolve({ status: xhr.status, body: typeof xhr.responseText === "string" ? xhr.responseText : "" });
    xhr.onerror = () => resolve(null);
    xhr.onabort = () => resolve(null);
    xhr.ontimeout = () => resolve(null);
    xhr.send(file);
  });
}

export const browserUploadDeps: DirectUploadDeps = {
  postJson: browserPostJson,
  put: browserPut,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

/** Storage 回的錯誤 body 形如 {"statusCode":"413","error":"Payload too large",...}（HTTP 狀態可能是 400）。 */
function storageSaysTooLarge(status: number, body: string): boolean {
  if (status === 413) return true;
  try {
    const parsed = JSON.parse(body) as { statusCode?: unknown };
    return String(parsed?.statusCode) === "413";
  } catch {
    return false;
  }
}

/**
 * 直傳一個檔（檔名與大小已在前端預檢過；伺服器會再驗一次）。永不 throw，結果一律用 outcome 表示：
 *   ok        → 已建單
 *   too_large → 伺服器或儲存桶判定超過上限
 *   failed    → 其他失敗（網路、Storage、DB…），客人可稍後重試
 * complete 是冪等的（同一張票重送不會重複建單），所以網路錯或 5xx 時自動再送一次。
 */
export async function uploadViaTicket(
  file: Blob & { name: string },
  sessionId: string,
  onProgress: (fraction: number) => void,
  deps: DirectUploadDeps = browserUploadDeps
): Promise<DirectUploadOutcome> {
  // 1) 票券
  const t = await deps.postJson("/api/upload/ticket", { fileName: file.name, size: file.size, contentType: file.type });
  if (!t) return { kind: "failed", stage: "ticket" };
  if (t.status === 413 || t.data?.error === "too_large") return { kind: "too_large" };
  const uploadUrl = t.data?.uploadUrl;
  const ticket = t.data?.ticket;
  if (t.status !== 200 || t.data?.ok !== true || typeof uploadUrl !== "string" || typeof ticket !== "string") {
    return { kind: "failed", stage: "ticket", status: t.status, error: String(t.data?.error ?? "") };
  }
  const contentType =
    typeof t.data?.contentType === "string" && t.data.contentType ? t.data.contentType : file.type || "application/octet-stream";

  // 2) 直傳到 Supabase Storage
  const put = await deps.put(uploadUrl, file, contentType, onProgress);
  if (!put) return { kind: "failed", stage: "put" };
  if (storageSaysTooLarge(put.status, put.body)) return { kind: "too_large" };
  if (put.status < 200 || put.status >= 300) return { kind: "failed", stage: "put", status: put.status };
  onProgress(1);

  // 3) 建單（冪等，可安全重送）
  let last: JsonReply | null = null;
  for (let attempt = 1; attempt <= COMPLETE_ATTEMPTS; attempt++) {
    if (attempt > 1) await deps.sleep(COMPLETE_RETRY_DELAY_MS);
    last = await deps.postJson("/api/upload/complete", { ticket, sessionId });
    if (last && last.status < 500) break;
  }
  if (!last) return { kind: "failed", stage: "complete" };
  if (last.status === 413 || last.data?.error === "too_large") return { kind: "too_large" };
  if (last.status === 200 && last.data?.ok === true) return { kind: "ok" };
  return { kind: "failed", stage: "complete", status: last.status, error: String(last.data?.error ?? "") };
}
