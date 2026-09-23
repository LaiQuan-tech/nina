import type { StationKey } from "./workOrder/barcode";

/**
 * 掃描事件 → 客戶看得到的進度。純函式、不碰 DB、不 mutate 傳入陣列。
 *
 * status 只回三個值（"open" | "in_progress" | "done"），對應 lib/members.ts
 * 的 PROGRESS 對照表（已收件／製作中／已完成），客戶端只認這三個，不要多加第四個。
 */
export function deriveOrderProgress(
  events: { station: StationKey; scanned_at: string }[]
): { station: StationKey | null; status: "open" | "in_progress" | "done" } {
  if (events.length === 0) {
    return { station: null, status: "open" };
  }

  // 取 scanned_at 最新的一筆（用 Date 比較，不直接信字串排序）。
  let latest = events[0];
  for (const e of events) {
    if (new Date(e.scanned_at).getTime() > new Date(latest.scanned_at).getTime()) {
      latest = e;
    }
  }

  // 任一筆掃到 delivered 就視為 done——即使它不是最新那筆；
  // 但 station 仍回「最新掃到」那筆，兩者刻意不對稱（工單可能送貨簽收後又被扣件回加工站）。
  const hasDelivered = events.some((e) => e.station === "delivered");

  return {
    station: latest.station,
    status: hasDelivered ? "done" : "in_progress",
  };
}
