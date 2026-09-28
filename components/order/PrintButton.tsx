"use client";

import { useEffect, useRef, useState } from "react";
import { waitForA4FontCss } from "./A4FontLoader";

export default function PrintButton({ className }: { className?: string }) {
  const [preparing, setPreparing] = useState(false);
  // 等字型期間若已換到別頁（client 換頁不會整頁重載），就不要在別頁跳出列印視窗
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // A4 版面以 Noto Sans TC 校準，字型是進頁後才非同步載入（不擋渲染）；
  // 列印前先等字型 CSS 與用到的字檔都到位，避免印成備援字型而跑版。
  async function handlePrint() {
    if (preparing) return;
    setPreparing(true);
    try {
      await waitForA4FontCss();
      void document.body.offsetHeight; // 強制排版一次，讓瀏覽器確定 A4 要用哪些字重／字元切片並開始下載
      // 等字檔下載完；網路卡住時最多等 5 秒就照印，不讓列印按鈕一直轉圈
      await Promise.race([document.fonts.ready, new Promise((resolve) => window.setTimeout(resolve, 5000))]);
      if (mountedRef.current) window.print();
    } finally {
      setPreparing(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <button
        className={className}
        onClick={handlePrint}
        disabled={preparing}
        aria-busy={preparing}
        style={{
          border: "none",
          borderRadius: 10,
          padding: "9px 18px",
          background: "var(--brand)",
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          cursor: preparing ? "progress" : "pointer",
        }}
      >
        🖨️ 列印工單
      </button>
      {/* A4 工單零邊界對版，列印對話框沒設對會跑版，所以每次都提醒。 */}
      <span style={{ fontSize: 11, color: "var(--muted)", textAlign: "right" }}>
        列印設定請選：縮放 100%／邊界「預設」／勾選「背景圖形」
      </span>
    </div>
  );
}
