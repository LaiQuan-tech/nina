// 自動產縮圖的「搶佔 → 產圖 → 有條件寫回」流程。依賴全部由呼叫端注入（generate.ts 接真的 Supabase／sharp／PDFium，
// 單元測試接假的），所以這支檔案本身不 import 任何產圖模組。
//
// 為什麼要搶佔：收檔背景產圖（upload 路由 waitUntil）、同事開工單頁觸發、兩個分頁同開，都可能同時要產同一張。
// 做法不需要 DB schema 變更：租約存在 thumbnail_meta（jsonb），用 PostgREST 條件式 update 當 compare-and-swap——
// WHERE 條件是「縮圖三欄跟我讀到的快照完全一樣」（jsonb 用 eq 比對是語意相等，鍵順序無關）。
// Postgres 的 row lock 讓兩個同時的 update 只有一個條件成立，另一個更新 0 列 → 知道有人搶先了。
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  asThumbnailMeta,
  autoThumbnailPath,
  buildThumbnailClaimMeta,
  canClaimThumbnail,
  isThumbnailInProgress,
  isThumbnailSourceTooLarge,
  releaseThumbnailLease,
  truncateThumbnailError,
  THUMBNAIL_MAX_SOURCE_BYTES,
  type ThumbnailMeta,
} from "./policy";

export const THUMBNAIL_ROW_COLUMNS = "id, storage_path, thumbnail_path, thumbnail_status, thumbnail_meta";

export type ThumbnailRow = {
  id: string;
  storage_path: string;
  thumbnail_path: string | null;
  thumbnail_status: string | null;
  thumbnail_meta: unknown;
};

type ThumbnailPatch = {
  thumbnail_path?: string;
  thumbnail_status?: string;
  thumbnail_meta: ThumbnailMeta;
};

export type ThumbnailJobDeps = {
  db: SupabaseClient;
  printFileSize(storagePath: string): Promise<number | null>;
  downloadPrintFile(storagePath: string): Promise<ArrayBuffer | null>;
  /** 回 null = 格式不支援（終態 unsupported）；throw = 可重試的失敗（下載／引擎崩潰等）。 */
  renderJpeg(bytes: Uint8Array): Promise<Buffer | null>;
  /** 上傳到一個全新的路徑；已存在就失敗、絕不覆蓋。 */
  uploadNewThumbnail(path: string, jpeg: Buffer): Promise<boolean>;
  /** 刪掉這次嘗試自己上傳、但確定不會被 DB 參照的檔（盡力而為，失敗不影響結果）。 */
  removeThumbnail(path: string): Promise<void>;
  now?: () => number;
  newLeaseId?: () => string;
};

export type ThumbnailJobResult = {
  /** confirmed=true 時是 DB 的實際狀態；false 時是最後已知的狀態（寫回或重讀失敗，DB 現況不確定）。 */
  row: ThumbnailRow;
  /** 這次呼叫有沒有搶到租約、真的開工產圖。 */
  ran: boolean;
  /** 有別人正持有租約在產同一張（呼叫端應該稍後再看，不要自己再產一份）。 */
  inProgress: boolean;
  confirmed: boolean;
};

/** 依 id 讀縮圖相關欄位：undefined = 讀取失敗（網路／DB 錯）；null = 查無此工單。 */
export async function readThumbnailRow(db: SupabaseClient, id: string): Promise<ThumbnailRow | null | undefined> {
  const { data, error } = await db.from("work_orders").select(THUMBNAIL_ROW_COLUMNS).eq("id", id);
  if (error) return undefined;
  return ((data ?? []) as ThumbnailRow[])[0] ?? null;
}

/**
 * 條件式 update：只有當 DB 裡這張工單的縮圖三欄仍然等於 expected（沒有縮圖、狀態相同、meta 完全相同）才寫入 patch。
 * 回傳寫入後的列；條件不成立（被別人搶先／人工補了圖）→ row=null；請求失敗 → failed=true（不確定有沒有寫進去）。
 */
async function compareAndSwap(
  db: SupabaseClient,
  expected: ThumbnailRow,
  patch: ThumbnailPatch
): Promise<{ row: ThumbnailRow | null; failed: boolean }> {
  try {
    let query = db.from("work_orders").update(patch).eq("id", expected.id).is("thumbnail_path", null);
    query =
      expected.thumbnail_status === null
        ? query.is("thumbnail_status", null)
        : query.eq("thumbnail_status", expected.thumbnail_status);
    query =
      expected.thumbnail_meta === null || expected.thumbnail_meta === undefined
        ? query.is("thumbnail_meta", null)
        : query.eq("thumbnail_meta", JSON.stringify(expected.thumbnail_meta));
    const { data, error } = await query.select(THUMBNAIL_ROW_COLUMNS);
    if (error) return { row: null, failed: true };
    return { row: ((data ?? []) as ThumbnailRow[])[0] ?? null, failed: false };
  } catch (err) {
    console.error("[thumbnail] compareAndSwap failed:", err);
    return { row: null, failed: true };
  }
}

/** 鍵順序無關的 JSON 值比較（跟 Postgres jsonb 的相等語意一致，用來判斷「DB 現況是不是我寫的那份」）。 */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function sameThumbnailState(
  row: ThumbnailRow,
  state: { thumbnail_path: string | null; thumbnail_status: string | null; thumbnail_meta: unknown }
): boolean {
  return (
    (row.thumbnail_path ?? null) === (state.thumbnail_path ?? null) &&
    (row.thumbnail_status ?? null) === (state.thumbnail_status ?? null) &&
    canonicalJson(row.thumbnail_meta) === canonicalJson(state.thumbnail_meta)
  );
}

/** 搶到租約之後真正產圖；回傳要寫回 DB 的結果。可重試的失敗一律 throw（由呼叫端記 failed）。 */
async function produce(row: ThumbnailRow, leaseId: string, deps: ThumbnailJobDeps): Promise<ThumbnailPatch> {
  const released = releaseThumbnailLease(row.thumbnail_meta);
  const tooLarge: ThumbnailPatch = { thumbnail_status: "unsupported", thumbnail_meta: { ...released, reason: "too_large" } };

  // 先向 Storage 問大小（不下載）；問不到才退回「下載後再看大小」
  if (isThumbnailSourceTooLarge(await deps.printFileSize(row.storage_path))) return tooLarge;

  const source = await deps.downloadPrintFile(row.storage_path);
  if (!source) throw new Error("download_failed");
  if (source.byteLength > THUMBNAIL_MAX_SOURCE_BYTES) return tooLarge;

  const jpeg = await deps.renderJpeg(new Uint8Array(source));
  if (!jpeg) {
    return { thumbnail_status: "unsupported", thumbnail_meta: { ...released, reason: "unsupported_format" } };
  }

  const path = autoThumbnailPath(row.id, leaseId);
  if (!(await deps.uploadNewThumbnail(path, jpeg))) throw new Error("upload_failed");
  return { thumbnail_path: path, thumbnail_status: "ok", thumbnail_meta: released };
}

/**
 * 產一次縮圖（收檔後的背景觸發，或工單詳情頁的產圖端點）。流程：
 *   1. 搶租約：用 compare-and-swap 把 tries+1、lease_until、lease_id 寫進 thumbnail_meta（被平台逾時／OOM
 *      砍掉的嘗試也因此算一次）。不符合開工條件（已有縮圖／終態／開工滿上限／別人的租約還沒過期）或搶輸 →
 *      不產，回報目前狀態（inProgress=別人正在產）。
 *   2. 產圖：>25MB → unsupported(too_large)；打不開 → unsupported(unsupported_format)；其餘錯誤 → failed（不再 +1）。
 *      自動縮圖每次嘗試各寫各的 storage 路徑（-auto-<lease_id>），跟人工補圖（-manual-）永不共用、也不覆蓋別人。
 *   3. 有條件寫回：DB 仍是「我搶到租約時的樣子」才寫入。人工補了圖、或租約逾時被別人接手 → 我的結果作廢
 *      （刪掉我自己剛上傳、確定不會被參照的檔），回報 DB 的實際狀態。
 * 絕不 throw——縮圖從來不是收檔或看單的關卡。
 */
export async function runThumbnailJob(initial: ThumbnailRow, deps: ThumbnailJobDeps): Promise<ThumbnailJobResult> {
  const now = deps.now ?? Date.now;
  const newLeaseId = deps.newLeaseId ?? (() => globalThis.crypto.randomUUID());
  const { db } = deps;

  // 1) 搶租約。搶輸時重讀一次：若只是快照舊了（別人剛結束一次失敗的嘗試）而現在仍可開工，就再搶一次。
  let snapshot = initial;
  let claimed: ThumbnailRow | null = null;
  let leaseId = "";
  for (let attempt = 0; attempt < 2 && !claimed; attempt++) {
    if (!canClaimThumbnail(snapshot, now())) break;
    leaseId = newLeaseId();
    const res = await compareAndSwap(db, snapshot, {
      thumbnail_meta: buildThumbnailClaimMeta(snapshot.thumbnail_meta, leaseId, now()),
    });
    if (res.row) {
      claimed = res.row;
      break;
    }
    const fresh = await readThumbnailRow(db, snapshot.id);
    if (!fresh) return { row: snapshot, ran: false, inProgress: false, confirmed: false };
    if (res.failed && asThumbnailMeta(fresh.thumbnail_meta).lease_id === leaseId) {
      claimed = fresh; // 請求回報失敗，但其實已經寫進去了
      break;
    }
    snapshot = fresh;
  }
  if (!claimed) {
    return { row: snapshot, ran: false, inProgress: isThumbnailInProgress(snapshot, now()), confirmed: true };
  }

  // 2) 產圖
  let outcome: ThumbnailPatch;
  try {
    outcome = await produce(claimed, leaseId, deps);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    outcome = {
      thumbnail_status: "failed",
      // tries 已在搶租約時 +1，這裡不再加
      thumbnail_meta: { ...releaseThumbnailLease(claimed.thumbnail_meta), last_error: truncateThumbnailError(message) },
    };
  }
  const uploadedPath = outcome.thumbnail_path ?? null; // 只有成功上傳的結果才帶路徑（上傳是 produce 的最後一步）
  const outcomeState = {
    thumbnail_path: outcome.thumbnail_path ?? null,
    thumbnail_status: outcome.thumbnail_status ?? claimed.thumbnail_status,
    thumbnail_meta: outcome.thumbnail_meta,
  };

  // 3) 有條件寫回（請求失敗時重讀確認；仍是我搶到時的樣子才重試一次）
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await compareAndSwap(db, claimed, outcome);
    if (res.row) return { row: res.row, ran: true, inProgress: false, confirmed: true };

    const fresh = await readThumbnailRow(db, claimed.id);
    if (!fresh) break;
    if (sameThumbnailState(fresh, outcomeState)) {
      return { row: fresh, ran: true, inProgress: false, confirmed: true }; // 請求回報失敗，但其實已寫入
    }
    if (!sameThumbnailState(fresh, claimed)) {
      // 人工補了圖、或租約逾時被別人接手：我的結果作廢。DB 已經不是我搶到時的樣子，我的條件式寫入永遠不會成立，
      // 剛上傳的檔確定不會被參照 → 刪掉，避免留下孤兒檔。
      if (uploadedPath) {
        await deps.removeThumbnail(uploadedPath).catch((err) => console.error("[thumbnail] remove orphan failed:", err));
      }
      return { row: fresh, ran: true, inProgress: isThumbnailInProgress(fresh, now()), confirmed: true };
    }
    // DB 仍是我搶到時的樣子 → 寫回沒生效（暫時性錯誤），再試一次
  }

  // 寫回失敗、也確認不了：回報「不確定」，端點會當成可重試的失敗，不謊報已有縮圖。租約會自然過期，
  // 已上傳的檔保留（寫入請求可能還在途，刪了反而可能讓 DB 參照到不存在的檔）。
  return { row: claimed, ran: true, inProgress: false, confirmed: false };
}
