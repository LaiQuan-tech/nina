// 印刷檔縮圖管線：收檔後由 upload 路由 waitUntil 背景產一次（lib/thumbnail/kick.ts）；沒產成的，
// 工單詳情頁掛的 client 元件會打 /api/admin/order/[id]/thumbnail/generate 補產。失敗只落狀態、絕不擋收檔／擋看單。
// ⚠️ 這支會載入 sharp 與 PDFium：只准在 API 路由裡用（而且盡量 dynamic import），頁面的 import 鏈不能碰它；
// 頁面要判斷「該不該產」請用 ./policy。
import sharp from "sharp";
import { createAdminSupabase } from "@/lib/supabase";
import { downloadPrintFile, printFileSize, removeAutoThumbnail, uploadThumbnail } from "@/lib/storage";
import { renderPdfFirstPageToRaw } from "./renderPdf";
import { readThumbnailRow, runThumbnailJob, type ThumbnailJobResult, type ThumbnailRow } from "./job";
import { THUMBNAIL_EDGE } from "./policy";

export type { ThumbnailMeta } from "./policy";

const JPEG_QUALITY = 78;

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
    .resize(THUMBNAIL_EDGE, THUMBNAIL_EDGE, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#fff" })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}

/**
 * 把印刷檔原始 bytes 渲染成縮圖 JPEG。PDF 走 PDFium 開第 1 頁，其餘走 sharp 直通。
 * 開不了／不支援的格式 → 回 null（呼叫端標記 unsupported）。
 * PDFium 引擎本身出錯（init 失敗、wasm 崩潰…）→ 丟 PdfEngineError：那是可重試的失敗，不是格式不支援。
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

/**
 * 產一次縮圖（收檔後的背景觸發，或工單詳情頁 client 元件打產圖端點時）。
 * 搶租約、產圖、有條件寫回的規則都在 ./job.ts（runThumbnailJob）；這裡只負責接上真的 Supabase／Storage／渲染器。
 * 不符合開工條件（已有縮圖／終態／開工滿上限／別人正在產）時不會產，只回報目前狀態。絕不 throw。
 */
export async function ensureThumbnail(order: ThumbnailRow): Promise<ThumbnailJobResult> {
  const db = createAdminSupabase();
  if (!db) return { row: order, ran: false, inProgress: false, confirmed: false };
  return runThumbnailJob(order, {
    db,
    printFileSize,
    downloadPrintFile,
    renderJpeg: renderToThumbnailJpeg,
    uploadNewThumbnail: (path, jpeg) => uploadThumbnail(path, jpeg, { upsert: false }),
    removeThumbnail: removeAutoThumbnail,
  });
}

/** 依工單 id 產縮圖（收檔後的背景觸發用）：查不到工單就什麼都不做。錯誤由呼叫端（kick.ts）接住。 */
export async function ensureThumbnailById(orderId: string): Promise<void> {
  const db = createAdminSupabase();
  if (!db) return;
  const row = await readThumbnailRow(db, orderId);
  if (!row) return;
  await ensureThumbnail(row);
}
