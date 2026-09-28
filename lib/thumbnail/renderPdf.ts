// PDF 第一頁 → 原始點陣圖，包一層 @hyzyla/pdfium（之後要換 pdfjs 只改這支檔案）。
//
// 實測（見任務驗收）：預設 render:"bitmap" 模式下，PDFium 內部已對非 Gray 色彩空間
// 加上 REVERSE_BYTE_ORDER 旗標，回傳的 Uint8Array 就是可以直接丟給 sharp 當
// { raw: { channels: 4 } } 讀的 RGBA 排列（手刻一份紅色矩形測試 PDF 實測中心像素
// 為 (254,0,0)，不是 BGR 對調的 (0,0,254)），因此這裡刻意不做任何色版對調。
import { PDFiumLibrary } from "@hyzyla/pdfium";
import { computePdfRenderSize, THUMBNAIL_EDGE } from "./policy";
import { createSerialQueue } from "./serial";

export type RawBitmap = {
  data: Uint8Array;
  width: number;
  height: number;
};

/**
 * PDFium 引擎本身出問題（init 失敗、wasm 崩潰／abort、配置不到點陣圖記憶體…）——跟「這份檔案打不開」不同：
 * 換一個乾淨的實例多半就好，所以是「可重試的失敗」（呼叫端記 failed、計入 tries），不可以標成 unsupported 終態。
 */
export class PdfEngineError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "PdfEngineError";
  }
}

// DB 只記得到 message（last_error），真正的原因（wasm 找不到、abort 訊息…）留在函式 log 裡查。
function engineError(message: string, cause: unknown): PdfEngineError {
  console.error(`[thumbnail] ${message}:`, cause);
  return new PdfEngineError(message, cause);
}

// 只描述這支檔案用到的 PDFium 介面（測試可以換成假的 library）。
type PdfPage = {
  getOriginalSize(): { originalWidth: number; originalHeight: number };
  render(options: { width: number; height: number }): Promise<{ data: Uint8Array; width: number; height: number }>;
};
type PdfDocument = { pages(): Iterable<PdfPage>; destroy(): void };
export type PdfLibrary = { loadDocument(buff: Uint8Array): Promise<PdfDocument>; destroy(): void };

function isWasmCrash(err: unknown): boolean {
  return err instanceof WebAssembly.RuntimeError || (err instanceof Error && err.name === "RuntimeError");
}

/**
 * 建一個「PDF 第一頁 → RGBA 點陣圖」渲染器（模組層單例見下方 renderPdfFirstPageToRaw）。
 *
 * - PDFium 的 wasm（約 4MB）只在第一次用到時 init，之後同一個函式實例共用。
 * - 一次只處理一份文件（createSerialQueue）：@hyzyla/pdfium 的 loadDocument／render 在 malloc 之後都會 await，
 *   併發呼叫會讓所有在途文件＋點陣圖同時常駐在同一個只增不減的 wasm heap（實測 50 張併發 RSS 漲到 500MB+）。
 * - 文件一律在 finally 釋放。
 * - 引擎出錯（init 失敗、wasm RuntimeError、文件載入後渲染途中的任何錯誤）→ 丟掉這個實例（下一份重新 init），
 *   只把「當下這一份」以 PdfEngineError 丟回去；排在後面的文件拿到的是新實例，不會被連坐。
 * - 文件本身打不開（毀損、加密、其實是舊版 PostScript .ai 被誤判成 PDF）、沒有頁面、頁面尺寸無效 → 回 null，
 *   呼叫端 graceful 標記 unsupported。
 */
export function createPdfFirstPageRenderer(init: () => Promise<PdfLibrary>) {
  const runExclusive = createSerialQueue();
  let libraryPromise: Promise<PdfLibrary> | null = null;

  function getLibrary(): Promise<PdfLibrary> {
    if (!libraryPromise) {
      libraryPromise = init().catch((err) => {
        libraryPromise = null; // init 失敗不快取，下一份再試
        throw err;
      });
    }
    return libraryPromise;
  }

  function discard(library: PdfLibrary): void {
    libraryPromise = null; // 串行執行，這時不會有別人正在用這個實例
    try {
      library.destroy();
    } catch {
      /* 已崩潰的實例 destroy 也可能丟錯；反正整個實例都不要了 */
    }
  }

  async function renderOne(bytes: Uint8Array | Buffer, maxEdge: number): Promise<RawBitmap | null> {
    let library: PdfLibrary;
    try {
      library = await getLibrary();
    } catch (err) {
      throw engineError("pdfium_init_failed", err);
    }

    const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    let document: PdfDocument;
    try {
      document = await library.loadDocument(buf);
    } catch (err) {
      if (isWasmCrash(err)) {
        discard(library);
        throw engineError("pdfium_crashed", err);
      }
      return null; // 檔案本身打不開 → unsupported
    }

    let broken = false;
    try {
      let firstPage: PdfPage | null = null;
      for (const page of document.pages()) {
        firstPage = page;
        break;
      }
      if (!firstPage) return null;

      const { originalWidth, originalHeight } = firstPage.getOriginalSize();
      const size = computePdfRenderSize(originalWidth, originalHeight, maxEdge);
      if (!size) return null;

      const image = await firstPage.render({ width: size.width, height: size.height });
      if (!image?.data?.length || !image.width || !image.height) return null;
      // image.data 是 PDFium 從 wasm heap slice 出來的複本，釋放文件後仍然有效。
      return { data: image.data, width: image.width, height: image.height };
    } catch (err) {
      // 文件已經開得起來，渲染途中才出錯（wasm abort、點陣圖配置不到記憶體…）：當成引擎問題，換新實例、可重試
      broken = true;
      throw engineError(isWasmCrash(err) ? "pdfium_crashed" : "pdfium_render_failed", err);
    } finally {
      try {
        document.destroy();
      } catch {
        broken = true;
      }
      if (broken) discard(library);
    }
  }

  return function renderPdfFirstPage(bytes: Uint8Array | Buffer, maxEdge: number = THUMBNAIL_EDGE): Promise<RawBitmap | null> {
    return runExclusive(() => renderOne(bytes, maxEdge));
  };
}

/**
 * 渲染 PDF 第一頁成原始 RGBA 點陣圖，依頁面尺寸直接渲到長邊約 maxEdge px（見 computePdfRenderSize；
 * 不再固定 scale=2——90×180cm 的大圖以前會先渲出上百 MB 的點陣再交給 sharp 縮）。
 * 轉 JPEG、補白底是 generate.ts 的 sharp pipeline 的事。
 * 回 null = 檔案本身不支援（呼叫端標 unsupported）；丟 PdfEngineError = 引擎問題（呼叫端記可重試的 failed）。
 */
export const renderPdfFirstPageToRaw = createPdfFirstPageRenderer(() => PDFiumLibrary.init());
