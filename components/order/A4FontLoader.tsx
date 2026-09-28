"use client";

import { useEffect } from "react";

// A4 工單（globals.css 的 .wo-a4）是以 Noto Sans TC 的字寬校準列印版面的，但後台已不再全站載 Google Fonts。
// 這個元件只放在工單詳情頁：掛載後才插入字型 CSS，不擋首次渲染；離開頁面就移除，
// 免得後台其他頁的中文（body 字體堆疊裡也有 Noto Sans TC）跟著換字型、下載字檔。
// 列印前由 PrintButton 呼叫 waitForA4FontCss() 再等 document.fonts.ready。
const A4_FONT_HREF = "https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap";
const LINK_ID = "wo-a4-font";

export default function A4FontLoader() {
  useEffect(() => {
    if (document.getElementById(LINK_ID)) return;
    const link = document.createElement("link");
    link.id = LINK_ID;
    link.rel = "stylesheet";
    link.href = A4_FONT_HREF;
    document.head.appendChild(link);
    return () => link.remove();
  }, []);
  return null;
}

/** 字型 CSS 若還在下載（剛進頁就按列印），等它載完或失敗；網路異常最多等 timeoutMs，不讓列印卡死。 */
export function waitForA4FontCss(timeoutMs = 4000): Promise<void> {
  const link = document.getElementById(LINK_ID) as HTMLLinkElement | null;
  if (!link || link.sheet) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => resolve();
    link.addEventListener("load", done, { once: true });
    link.addEventListener("error", done, { once: true });
    window.setTimeout(done, timeoutMs);
  });
}
