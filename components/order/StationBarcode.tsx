// 明確 import React：專案的 Next.js build 用自動 JSX runtime（不需要這行也能跑），但
// components/order/StationBarcode.test.tsx 走 `tsx` CLI 直接執行（node --import tsx --test），
// 該路徑走的是 classic JSX transform（编译成 React.createElement），少了這行會在測試時
// 丟出 "ReferenceError: React is not defined"——两条路都要能跑，所以两边都兼顾。
import React from "react";
import { encodeBarcode, code128cSvg, type StationKey } from "@/lib/workOrder/barcode";

/**
 * 印在 A4 工單上的單一站別條碼（server component，無 state）。
 * encodeBarcode 對格式不符的 order_no 回 null 時印「條碼不可用」，不 throw
 * ——工單編號理論上一律合法（DB trigger 產生），這裡只是防禦性 fallback，
 * 不讓一個異常資料把整張 A4 版面炸掉。
 *
 * heightMm：輸出站框位（WorkOrderSheetA4.tsx 的 G13:I15）只有 3 列，比其餘 4 個站矮，
 * 需要縮小條碼高度＋搭配呼叫端那格的 `.wo-bc--sm` class 一起用（見 globals.css）。
 */
export default function StationBarcode({ orderNo, station }: { orderNo: string; station: StationKey }) {
  const encoded = encodeBarcode(orderNo, station);
  if (!encoded) {
    return <div className="wo-a4-bc-placeholder">條碼不可用</div>;
  }

  const heightMm = station === "output" ? 10 : 18;
  const svg = code128cSvg(encoded.payload, { heightMm });

  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <div dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="wo-bc-txt">{encoded.caption}</div>
    </>
  );
}
