/**
 * 建單後背景產一次縮圖：upload 路由用 `waitUntil(kickThumbnail(orderId))` 在回應後可靠執行
 * （Vercel 會砍掉沒包 waitUntil 的 fire-and-forget，以前縮圖因此幾乎都沒在收檔時產出）。
 *
 * 產圖模組（sharp／PDFium）在這裡才 dynamic import：收檔路由冷啟動不必先載它們、客人的
 * 「送件成功」不被拖慢。回傳的 Promise 永不 reject——任何錯誤（含模組載入失敗）都只記 log，
 * 縮圖狀態由 ensureThumbnail 自己落 DB；沒產成的，工單詳情頁會再補產。
 * 跟工單頁的產圖端點同時觸發也沒關係：兩邊開工前都要先搶同一張工單的產圖租約（lib/thumbnail/job.ts），只有一邊會真的產。
 */
export function kickThumbnail(orderId: string): Promise<void> {
  return (async () => {
    try {
      const { ensureThumbnailById } = await import("./generate");
      await ensureThumbnailById(orderId);
    } catch (err) {
      console.error("[thumbnail] kickThumbnail failed:", err);
    }
  })();
}
