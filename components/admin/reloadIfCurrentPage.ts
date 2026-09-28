import type { MouseEvent } from "react";

/**
 * 後台連結（next/link）的 onClick 共用：點到「目前所在的頁面」時照舊整頁重載。
 * client 換頁到同一個網址時頁面元件不會重掛，用 useState(initial) 的元件（回訪看板、管理員、網站圖片）
 * 會停在舊資料；改版前這些都是 <a>，點了會整頁重載拿到最新資料。
 * ⌘／Ctrl／Shift／Alt 點擊與非左鍵維持瀏覽器預設（開新分頁等）。
 */
export function reloadIfCurrentPage(e: MouseEvent<HTMLAnchorElement>, href: string, pathname: string) {
  const plainClick = e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
  if (!plainClick) return;
  const target = new URL(href, window.location.href);
  if (target.origin !== window.location.origin || target.pathname !== pathname) return;
  e.preventDefault();
  window.location.assign(target.pathname + target.search + target.hash);
}
