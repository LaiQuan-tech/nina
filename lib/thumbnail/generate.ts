// 印刷檔縮圖管線：lazy on-demand（工單詳情頁開啟時觸發一次），失敗只落狀態、絕不擋收檔／擋看單。
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabase } from "@/lib/supabase";
import { downloadPrintFile, uploadThumbnail } from "@/lib/storage";
import { getWorkOrder, type WorkOrder } from "@/lib/workOrders";
import { renderPdfFirstPageToRaw } from "./renderPdf";

const MAX_SOURCE_BYTES = 25 * 1024 * 1024; // >25MB 直接標 unsupported，不嘗試渲染
const MAX_TRIES = 3; // thumbnail_status='failed' 且已重試滿這個次數就不再自動重跑
const THUMB_SIZE = 1200; // resize 邊界（inside，不放大）
const JPEG_QUALITY = 78;

export type ThumbnailMeta = {
  tries?: number;
  last_error?: string;
  last_try_at?: string;
  reason?: string;
  [key: string]: unknown;
};

type SourceKind = "pdf" | "raster" | "unsupported";

/**
 * 看 magic bytes 分流（不信副檔名——延續 EXT_ALLOW 收檔時就已驗過的邏輯，這裡只管「怎麼渲染」）：
 *   %PDF          → pdf（PDFium 開第 1 頁；.ai 多半是 PDF 相容，走這條）
 *   %!PS / 8BPS   → unsupported（舊版 PostScript .ai／.psd，Phase 1 不硬修，graceful 留空）
 *   FFD8FF/8950.. /II*␀·MM␀* /RIFF..WEBP → raster（sharp 直通；png/webp 收檔規則本不收，這裡防禦性支援
 *                                           是因為手動補圖端點也共用這支渲染器）
 */
function detectSourceKind(bytes: Uint8Array): SourceKind {
  const b = bytes;
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "pdf"; // %PDF
  if (b.length >= 2 && b[0] === 0x25 && b[1] === 0x21) return "unsupported"; // %! (PostScript)
  if (b.length >= 4 && b[0] === 0x38 && b[1] === 0x42 && b[2] === 0x50 && b[3] === 0x53) return "unsupported"; // 8BPS (.psd)
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "raster"; // JPEG
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "raster"; // PNG
  if (
    b.length >= 4 &&
    ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00) || // II*\0 (little-endian TIFF)
      (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a)) // MM\0* (big-endian TIFF)
  )
    return "raster";
  if (
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 && // RIFF
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50 // WEBP
  )
    return "raster";
  return "unsupported";
}

// 刻意用結構型別描述 raw 點陣圖參數，不引用 sharp 的命名空間型別
// （`import sharp from "sharp"` 是 value import，`sharp.SharpInput`/`sharp.CreateRaw`
// 在這個專案的 TS 設定下解析不到型別命名空間，會直接編譯失敗）。
async function toThumbBuffer(
  buffer: Buffer,
  raw?: { width: number; height: number; channels: 1 | 2 | 3 | 4 }
): Promise<Buffer> {
  const pipeline = raw ? sharp(buffer, { raw }) : sharp(buffer);
  return pipeline
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#fff" })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}

/**
 * 把印刷檔原始 bytes 渲染成縮圖 JPEG。PDF 走 PDFium 開第 1 頁，其餘走 sharp 直通。
 * 開不了／不支援的格式 → 回 null（呼叫端標記 unsupported，不 throw）。
 * 同時給自動管線（.ai/.tif/.psd…）與手動補圖端點（jpeg/png/webp/pdf）共用，行為一致。
 */
export async function renderToThumbnailJpeg(bytes: Uint8Array): Promise<Buffer | null> {
  const kind = detectSourceKind(bytes);
  if (kind === "unsupported") return null;

  if (kind === "pdf") {
    const raw = await renderPdfFirstPageToRaw(bytes);
    if (!raw) return null;
    return toThumbBuffer(Buffer.from(raw.data), { width: raw.width, height: raw.height, channels: 4 });
  }

  // raster：sharp 自己認得出實際格式（jpg/png/tif/webp），不需要再告訴它 raw 參數。
  try {
    return await toThumbBuffer(Buffer.from(bytes));
  } catch (err) {
    console.error("[thumbnail] renderToThumbnailJpeg (raster) failed:", err);
    return null;
  }
}

function isManualPath(path: string | null | undefined): boolean {
  return !!path && path.includes("-manual-");
}

function asThumbnailMeta(value: unknown): ThumbnailMeta {
  return value && typeof value === "object" ? (value as ThumbnailMeta) : {};
}

async function persist(
  db: SupabaseClient,
  order: WorkOrder,
  patch: Partial<Pick<WorkOrder, "thumbnail_path" | "thumbnail_status" | "thumbnail_meta">>
): Promise<WorkOrder> {
  const { data, error } = await db.from("work_orders").update(patch).eq("id", order.id).select("*").single();
  if (error || !data) return { ...order, ...patch };
  return data as WorkOrder;
}

/**
 * Lazy on-demand 縮圖產製：工單詳情頁發現「還沒有縮圖、狀態允許重試」時呼叫一次。
 *
 * 不需要重跑的情況直接原樣回傳：已有 thumbnail_path、路徑含 "-manual-"（人工補過，
 * 自動管線一律跳過）、狀態是終態（ok/unsupported/manual）、或 failed 已達重試上限。
 * 任何錯誤都只落 DB 狀態（failed + tries/last_error/last_try_at），絕不 throw——
 * 縮圖從來不是收檔或看單的關卡。
 */
export async function ensureThumbnail(order: WorkOrder): Promise<WorkOrder> {
  if (order.thumbnail_path || isManualPath(order.thumbnail_path)) return order;
  if (order.thumbnail_status && order.thumbnail_status !== "pending" && order.thumbnail_status !== "failed") {
    return order; // ok / unsupported / manual：不重跑
  }

  const meta = asThumbnailMeta(order.thumbnail_meta);
  const tries = meta.tries ?? 0;
  if (order.thumbnail_status === "failed" && tries >= MAX_TRIES) return order;

  const db = createAdminSupabase();
  if (!db) return order;

  try {
    const source = await downloadPrintFile(order.storage_path);
    if (!source) throw new Error("download_failed");

    if (source.byteLength > MAX_SOURCE_BYTES) {
      return await persist(db, order, {
        thumbnail_status: "unsupported",
        thumbnail_meta: { ...meta, reason: "too_large" },
      });
    }

    const jpeg = await renderToThumbnailJpeg(new Uint8Array(source));
    if (!jpeg) {
      return await persist(db, order, {
        thumbnail_status: "unsupported",
        thumbnail_meta: { ...meta, reason: "unsupported_format" },
      });
    }

    const path = `thumbs/${order.id}.jpg`;
    const uploaded = await uploadThumbnail(path, jpeg);
    if (!uploaded) throw new Error("upload_failed");

    return await persist(db, order, {
      thumbnail_path: path,
      thumbnail_status: "ok",
      thumbnail_meta: meta,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return await persist(db, order, {
      thumbnail_status: "failed",
      thumbnail_meta: { ...meta, tries: tries + 1, last_error: message, last_try_at: new Date().toISOString() },
    });
  }
}

async function kickThumbnailAsync(orderId: string): Promise<void> {
  try {
    const order = await getWorkOrder(orderId);
    if (!order) return;
    await ensureThumbnail(order);
  } catch (err) {
    console.error("[thumbnail] kickThumbnail failed:", err);
  }
}

/**
 * 建單後「順手」觸發一次縮圖產製，不 await、失敗不 throw（收檔優先，縮圖是錦上添花）。
 * 呼叫端只需要 `void kickThumbnail(orderId)`。
 */
export function kickThumbnail(orderId: string): void {
  void kickThumbnailAsync(orderId);
}
