"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  nextThumbnailClientStep,
  thumbnailPollDelayMs,
  THUMBNAIL_POLL_BUDGET_MS,
  THUMBNAIL_REFRESH_GRACE_MS,
  type ThumbnailClientStep,
} from "@/lib/thumbnail/response";

type Phase = "working" | "failed" | "timeout";

/**
 * 工單還沒有縮圖、而且規則允許自動產時（見 lib/thumbnail/policy.ts），A4 縮圖格改放這個元件：
 * 頁面不等縮圖、先把工單畫出來；元件掛載後才打產圖端點，期間顯示「縮圖產生中…」。
 *   產好／確定產不了（不支援、太大、次數用完）→ router.refresh()，由伺服器端畫出圖或最終狀態
 *   別人正在產（例如收檔的背景產圖、另一個分頁）→ 退避輪詢（2、3、5、8、10…秒），一輪最多 THUMBNAIL_POLL_BUDGET_MS
 *   refresh 後伺服器仍判定要自動產（元件沒被換掉）→ 等一下再問，同樣算在這一輪的時間內，不會永遠卡在「產生中」
 *   這次失敗但還能重試、或一輪時間用完 → 顯示「重試」鈕，不自動連打（開工次數由伺服器端累計、滿 3 次就停）
 * 提示文字都帶 wo-img--hint：列印時隱藏，A4 縮圖格印出來是空白框（見 globals.css @media print）。
 */
export default function ThumbnailAutoGenerate({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("working");
  const started = useRef(false);
  const mounted = useRef(true);
  const runId = useRef(0);

  const run = useCallback(async () => {
    const id = ++runId.current;
    const alive = () => mounted.current && runId.current === id;
    setPhase("working");
    const startedAt = Date.now();
    let waits = 0;
    while (alive()) {
      let step: ThumbnailClientStep;
      try {
        const res = await fetch(`/api/admin/order/${orderId}/thumbnail/generate`, { method: "POST" });
        const body: unknown = await res.json().catch(() => null);
        step = nextThumbnailClientStep(res.ok, body);
      } catch {
        step = "failed";
      }
      if (!alive()) return;
      if (step === "failed") {
        setPhase("failed");
        return;
      }
      let delay: number;
      if (step === "refresh") {
        router.refresh(); // 伺服器畫出圖或最終狀態後，這個元件會被換掉（卸載），迴圈自然結束
        delay = THUMBNAIL_REFRESH_GRACE_MS;
      } else {
        delay = thumbnailPollDelayMs(waits++);
      }
      if (Date.now() - startedAt + delay > THUMBNAIL_POLL_BUDGET_MS) {
        setPhase("timeout");
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, delay));
    }
  }, [orderId, router]);

  useEffect(() => {
    mounted.current = true;
    // StrictMode（開發模式）會把 effect 跑兩次；ref 擋住，保證每次開頁只啟動一輪。
    if (!started.current) {
      started.current = true;
      void run();
    }
    return () => {
      mounted.current = false;
    };
  }, [run]);

  if (phase === "working") {
    return (
      <span className="wo-img--empty wo-img--hint" role="status">
        縮圖產生中…
      </span>
    );
  }
  return (
    <span className="wo-img--empty wo-img--hint" role="status">
      {phase === "timeout" ? "縮圖尚未產生完成" : "縮圖產生失敗"}
      <button
        type="button"
        className="no-print"
        onClick={() => void run()}
        style={{ marginLeft: "2mm", font: "inherit", padding: "0.5mm 2mm", border: "1px solid #9ca3af", borderRadius: 4, background: "#fff", color: "#374151", cursor: "pointer" }}
      >
        重試
      </button>
    </span>
  );
}
