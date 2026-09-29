// 收檔流程的「決策」：簽發上傳票券、直傳完成後的驗收、以及存檔後的建單（舊 /api/upload 與新 complete 共用）。
// 刻意把所有 I/O（Supabase、cookie、waitUntil）都做成注入的 deps：這支檔不碰網路也不碰 next/headers，
// 單元測試可以直接餵假的 deps。真正的接線在 lib/upload/server.ts 與 app/api/upload/ticket/route.ts。
//
// 直傳流程（檔案不經過 Vercel 函式——它的請求主體上限是 4.5MB，平台層擋、函式根本不會執行）：
//   1. POST /api/upload/ticket { fileName, size, contentType }
//        → 伺服器重驗檔名／副檔名／大小 → 分配 storage 路徑 → 回 { uploadUrl, ticket, contentType }
//   2. 瀏覽器 PUT 檔案到 uploadUrl（Supabase Storage 的一次性上傳網址，upsert:false，不能覆寫既有物件）
//   3. POST /api/upload/complete { ticket, sessionId }
//        → 驗票 → 冪等（同路徑已建單就直接回 ok）→ 確認物件真的在、大小對 → 建單＋背景縮圖／FTP

import { parseFilename } from "@/lib/filename/parser";
import { EXT_ALLOW } from "@/lib/filename/segments";
import type { ParseOk, Segments } from "@/lib/filename/types";
import type { ProductResolution } from "@/lib/workOrders";
import { MAX_UPLOAD_BYTES } from "./limits";
import { MAX_FILE_NAME_CHARS, signUploadTicket, UPLOAD_TICKET_TTL_MS, verifyUploadTicket } from "./ticket";

/** 路由直接照這個回：NextResponse.json(body, { status }) */
export type RouteResult = { status: number; body: Record<string, unknown> };

/** 以 storage_path 查既有工單。ok:false = 查詢本身失敗（不可當成「沒有」，否則會重複建單）。 */
export type OrderLookup = { ok: true; id: string | null } | { ok: false };
export type ObjectStat = { status: "found"; size: number } | { status: "missing" } | { status: "error" };

export type FinalizeArgs = { parsed: ParseOk; fileName: string; storagePath: string; sessionId: string | null };
export type FinalizeResult = { ok: true; orderId: string; created: boolean } | { ok: false; error: "db_failed" };

function fail(status: number, error: string, extra: Record<string, unknown> = {}): RouteResult {
  return { status, body: { ok: false, error, ...extra } };
}

function asRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

// ── 1) 簽發上傳票券 ──────────────────────────────────────────────────────────

export type TicketDeps = {
  ticketKey: Buffer | null;
  now: () => number;
  newPath: (fileName: string) => string;
  /** Supabase createSignedUploadUrl(path, { upsert:false })；失敗回 null。 */
  createUploadUrl: (path: string) => Promise<string | null>;
};

const MIME_RE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/;

/** 瀏覽器回報的檔案類型（.ai/.cdr/.psd 常是空字串）→ 直傳時 PUT 要帶的 Content-Type；不像 MIME 的一律 octet-stream。 */
export function normalizeContentType(value: unknown): string {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return MIME_RE.test(v) ? v : "application/octet-stream";
}

export async function issueUploadTicket(body: unknown, deps: TicketDeps): Promise<RouteResult> {
  const b = asRecord(body);
  const { fileName, size, contentType } = b;
  if (typeof fileName !== "string" || !fileName.trim() || fileName.length > MAX_FILE_NAME_CHARS) {
    return fail(400, "bad_request");
  }
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0) return fail(400, "bad_request");
  if (contentType !== undefined && contentType !== null && typeof contentType !== "string") {
    return fail(400, "bad_request");
  }

  // ★ 伺服器端重驗檔名 —— 收檔的唯一守門（前端的驗證只是體驗，永不信任）
  const parsed = parseFilename(fileName);
  if (!parsed.ok) return fail(422, "bad_filename", { result: parsed });
  if (!EXT_ALLOW.includes(parsed.segments.ext)) return fail(422, "bad_filename", { result: parsed });

  if (size === 0) return fail(400, "empty_file");
  if (size > MAX_UPLOAD_BYTES) return fail(413, "too_large");

  if (!deps.ticketKey) return fail(503, "not_configured");

  const path = deps.newPath(fileName);
  const uploadUrl = await deps.createUploadUrl(path);
  if (!uploadUrl) return fail(502, "storage_failed");

  const ticket = signUploadTicket({ path, fileName, size, exp: deps.now() + UPLOAD_TICKET_TTL_MS }, deps.ticketKey);
  return { status: 200, body: { ok: true, uploadUrl, ticket, contentType: normalizeContentType(contentType) } };
}

// ── 2) 直傳完成 ──────────────────────────────────────────────────────────────

export type CompleteDeps = {
  ticketKey: Buffer | null;
  now: () => number;
  findOrderIdByStoragePath: (path: string) => Promise<OrderLookup>;
  statObject: (path: string) => Promise<ObjectStat>;
  /** 只刪這次票券分配的路徑（大小不合時清掉，不留孤兒檔）。 */
  removeObject: (path: string) => Promise<boolean>;
  finalize: (args: FinalizeArgs) => Promise<FinalizeResult>;
};

/**
 * 驗票 → 冪等 → 確認物件 → 建單。回應內容與舊 /api/upload 相同：成功只回 { ok, fileName }，不回任何工單資訊。
 *
 * 冪等刻意排在「確認物件」之前：同一張票重送（網路斷線重試、使用者重按）直接回 ok，不再碰 Storage，
 * 也就不可能去刪到一個已經建了工單的檔。物件的大小在第一次建單前已驗過，且 upsert:false 的上傳網址
 * 不能覆寫既有物件，所以重送時不必再驗。
 *
 * ⚠️ 同一張票「同時」送兩次：兩邊都可能在對方建單前通過冪等檢查。沒有 DB 唯一索引時這個極窄的時間窗
 * 擋不住（會多一張重複工單）；加了 work_orders(storage_path) 唯一索引後，後到的那邊 insert 會撞 23505，
 * finalizeUploadWith 會把它當成「已建過」回 ok。
 */
export async function completeDirectUpload(body: unknown, deps: CompleteDeps): Promise<RouteResult> {
  const b = asRecord(body);
  if (typeof b.ticket !== "string") return fail(400, "bad_request");
  if (b.sessionId !== undefined && b.sessionId !== null && typeof b.sessionId !== "string") {
    return fail(400, "bad_request");
  }
  const sessionId = typeof b.sessionId === "string" ? b.sessionId.trim() || null : null;

  if (!deps.ticketKey) return fail(503, "not_configured");
  const check = verifyUploadTicket(b.ticket, deps.ticketKey, deps.now());
  if (!check.ok) return fail(403, check.reason === "expired" ? "ticket_expired" : "bad_ticket");
  const { path, fileName, size } = check.ticket;

  // 冪等：這個路徑已經建過工單 → 什麼都不做、照樣回成功
  const existing = await deps.findOrderIdByStoragePath(path);
  if (!existing.ok) return fail(502, "db_failed");
  if (existing.id) return { status: 200, body: { ok: true, fileName } };

  // 票券裡的檔名在簽發時已驗過；這裡再跑一次拿 segments（也擋住兩次部署之間規則改了的情況）
  const parsed = parseFilename(fileName);
  if (!parsed.ok) return fail(422, "bad_filename", { result: parsed });

  const stat = await deps.statObject(path);
  if (stat.status === "missing") return fail(404, "not_uploaded");
  if (stat.status === "error") return fail(502, "storage_failed");
  if (stat.size > MAX_UPLOAD_BYTES) {
    await deps.removeObject(path);
    return fail(413, "too_large");
  }
  if (stat.size !== size) {
    // 傳上來的不是票券核准的那個檔（被竄改或截斷）：清掉，不建單
    await deps.removeObject(path);
    return fail(422, "size_mismatch");
  }

  const done = await deps.finalize({ parsed, fileName, storagePath: path, sessionId });
  if (!done.ok) return fail(502, done.error);
  return { status: 200, body: { ok: true, fileName } };
}

// ── 3) 存檔後：建單＋背景工作（舊 /api/upload 與 complete 共用）───────────────────────

export type FinalizeDeps = {
  resolveProduct: (spec: string, fallbackProductName: string) => Promise<ProductResolution>;
  /** 會員身分一律從 cookie 取，不接受前端傳進來的 memberId。 */
  currentMemberId: () => Promise<string | null>;
  createOrder: (
    segments: Segments,
    fileName: string,
    storagePath: string,
    product: ProductResolution,
    sessionId: string | null,
    memberId: string | null
  ) => Promise<{ id: string }>;
  findOrderIdByStoragePath: (path: string) => Promise<OrderLookup>;
  /** 縮圖與 FTP 推檔：回應送出後在背景可靠執行（waitUntil），永不 throw、不擋收檔。 */
  startBackgroundJobs: (orderId: string) => void;
  markSubmitted: (sessionId: string, fileName: string) => Promise<void>;
  logError?: (message: string, err: unknown) => void;
};

/** Postgres unique_violation。 */
export function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { code?: unknown }).code === "23505";
}

export async function finalizeUploadWith(args: FinalizeArgs, deps: FinalizeDeps): Promise<FinalizeResult> {
  const { parsed, fileName, storagePath, sessionId } = args;
  // 用檔名末段商品碼查 ERP 商品主檔，一次帶出護貝膜/油墨類別/列印方式/版材（soft：查不到仍收檔）
  const product = await deps.resolveProduct(parsed.segments.spec, parsed.segments.productName);
  const memberId = await deps.currentMemberId();

  let orderId: string;
  try {
    const created = await deps.createOrder(parsed.segments, fileName, storagePath, product, sessionId, memberId);
    orderId = created.id;
  } catch (err) {
    // 撞唯一鍵：只有在「同一個 storage_path 已有工單」時才算冪等成功。撞到的若是別的唯一鍵（例如工單編號），
    // 查不到同路徑的單 → 照樣當失敗，絕不回客人「送件成功」卻沒有工單。
    if (isUniqueViolation(err)) {
      const existing = await deps.findOrderIdByStoragePath(storagePath);
      if (existing.ok && existing.id) return { ok: true, orderId: existing.id, created: false };
    }
    (deps.logError ?? console.error)("[upload] createWorkOrder failed:", err);
    return { ok: false, error: "db_failed" };
  }

  deps.startBackgroundJobs(orderId);

  // 更新案件狀態（成功件數 +1）
  if (sessionId) await deps.markSubmitted(sessionId, fileName);
  return { ok: true, orderId, created: true };
}
