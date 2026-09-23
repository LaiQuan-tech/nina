// PDF 第一頁 → 原始點陣圖，包一層 @hyzyla/pdfium（之後要換 pdfjs 只改這支檔案）。
//
// 實測（見任務驗收）：預設 render:"bitmap" 模式下，PDFium 內部已對非 Gray 色彩空間
// 加上 REVERSE_BYTE_ORDER 旗標，回傳的 Uint8Array 就是可以直接丟給 sharp 當
// { raw: { channels: 4 } } 讀的 RGBA 排列（手刻一份紅色矩形測試 PDF 實測中心像素
// 為 (254,0,0)，不是 BGR 對調的 (0,0,254)），因此這裡刻意不做任何色版對調。
import { PDFiumLibrary } from "@hyzyla/pdfium";

export type RawBitmap = {
  data: Uint8Array;
  width: number;
  height: number;
};

/**
 * 渲染 PDF 第一頁成原始 RGBA 點陣圖（不縮放、不轉檔——那是 generate.ts 的 sharp pipeline 的事）。
 * 開不了（檔案毀損、加密、或其實是舊版 PostScript .ai 被誤判成 PDF）→ 回 null，
 * 呼叫端一律 graceful 標記 unsupported，絕不 throw、絕不擋收檔。
 */
export async function renderPdfFirstPageToRaw(
  bytes: Uint8Array | Buffer,
  scale = 2
): Promise<RawBitmap | null> {
  let library: Awaited<ReturnType<typeof PDFiumLibrary.init>> | undefined;
  try {
    library = await PDFiumLibrary.init();
    const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    const document = await library.loadDocument(buf);
    try {
      let firstPage: ReturnType<typeof document.getPage> | null = null;
      for (const page of document.pages()) {
        firstPage = page;
        break;
      }
      if (!firstPage) return null;

      const image = await firstPage.render({ scale });
      if (!image?.data?.length || !image.width || !image.height) return null;
      return { data: image.data, width: image.width, height: image.height };
    } finally {
      document.destroy();
    }
  } catch (err) {
    console.error("[thumbnail] renderPdfFirstPageToRaw failed:", err);
    return null;
  } finally {
    library?.destroy();
  }
}
