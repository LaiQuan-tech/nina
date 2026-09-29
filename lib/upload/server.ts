// lib/upload/flow.ts 的真實接線（Supabase、cookie、waitUntil）。只給 Node route handler 用：
// 會經由 lib/memberSession 引到 next/headers，不可被 client 元件或 middleware import。

import { waitUntil } from "@vercel/functions";
import { pushAndRecordByOrderId } from "@/lib/ftp/push";
import { markSessionSubmitted } from "@/lib/intakeSessions";
import { getSessionMember } from "@/lib/memberSession";
import { resolveProductForOrder } from "@/lib/productLookup";
import { removeUploadedPrintFile, statPrintFile } from "@/lib/storage";
import { kickThumbnail } from "@/lib/thumbnail/kick";
import { createWorkOrder, findWorkOrderIdByStoragePath } from "@/lib/workOrders";
import {
  finalizeUploadWith,
  type CompleteDeps,
  type FinalizeArgs,
  type FinalizeDeps,
  type FinalizeResult,
} from "./flow";
import { uploadTicketKeyFromEnv } from "./ticket";

const finalizeDeps: FinalizeDeps = {
  resolveProduct: resolveProductForOrder,
  currentMemberId: async () => (await getSessionMember())?.id ?? null,
  createOrder: (segments, fileName, storagePath, product, sessionId, memberId) =>
    createWorkOrder(segments, fileName, storagePath, product, sessionId, memberId),
  findOrderIdByStoragePath: findWorkOrderIdByStoragePath,
  startBackgroundJobs: (orderId) => {
    // 縮圖與 FTP 是兩個獨立的背景工作：各自一個 waitUntil、同時起跑，誰都不等誰，任一方失敗都只記 log，
    // 不影響另一方、也不影響給客人的回應。
    //
    // 縮圖產製不擋收檔：用 waitUntil 在回應後於背景可靠執行（以前是 `void kickThumbnail()`，
    // 回應一送出就被 Vercel 砍掉，縮圖幾乎都沒產出，全堆到後台第一次開工單時同步產）。
    // kickThumbnail 永不 reject；開工前會先搶產圖租約，同事同時開工單頁也只會有一邊真的產。
    // 沒產成的，工單詳情頁會掛 client 元件補產。
    waitUntil(kickThumbnail(orderId));

    // FTP 推檔不擋收檔：用 waitUntil 在回應後於背景可靠執行（Vercel 不會像一般 fire-and-forget
    // 那樣把它砍掉），客人立刻看到「送件成功」、檔案背景推上 NAS。pushAndRecordByOrderId 設計上永不
    // throw（這裡再包一層 catch 保險），任何失敗都只落 ftp_status 供每日 Cron 與後台「重推」補。
    // Hobby 方案 Cron 只能每日，所以即時推主要靠這裡；Cron 是補漏網。
    waitUntil(
      pushAndRecordByOrderId(orderId).catch((err) => {
        console.error("[upload] background ftp push failed:", err);
      })
    );
  },
  markSubmitted: markSessionSubmitted,
};

/**
 * 印刷檔已經在 Storage 之後的共用收尾：查 ERP 商品 → 取 cookie 會員 → 建工單 → 背景縮圖／FTP → 案件成功件數 +1。
 * ⚠️ 呼叫它的路由都要 `export const maxDuration = 60`：背景縮圖與 FTP 跑在這次呼叫的 waitUntil 裡，
 * 且縮圖產圖租約（lib/thumbnail/policy.ts THUMBNAIL_LEASE_MS=90 秒）必須長於它（policy.test.ts 會檢查）。
 */
export function finalizeUpload(args: FinalizeArgs): Promise<FinalizeResult> {
  return finalizeUploadWith(args, finalizeDeps);
}

export function completeDeps(): CompleteDeps {
  return {
    ticketKey: uploadTicketKeyFromEnv(),
    now: Date.now,
    findOrderIdByStoragePath: findWorkOrderIdByStoragePath,
    statObject: statPrintFile,
    removeObject: removeUploadedPrintFile,
    finalize: finalizeUpload,
  };
}
