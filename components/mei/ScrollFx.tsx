"use client";

import { useEffect } from "react";

// 全站捲動微動畫（交接包 README「Interactions」規格）：
//   區塊首次進入視窗 → opacity 0→1 / translateY 12px→0，320ms ease-out，只播一次。
//
// 設計要點：
// 1) 只掛一個 IntersectionObserver 掃 [data-reveal]，server component 加屬性即可，不必變 client。
// 2) ★失敗安全：初始隱藏狀態寫在 `.mei[data-fx="on"]` 之下，而 data-fx 是這支元件掛載後才設的。
//    沒有 JS、JS 出錯、或 hydration 失敗時，內容照常顯示 —— 不會整站空白。
// 3) prefers-reduced-motion: reduce → 完全不設 data-fx，等於整組停用。
export default function ScrollFx() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".mei");
    if (!root) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      // 直接把數字補到終值，其餘維持靜態
      document.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
        el.textContent = el.dataset.count ?? el.textContent;
      });
      return;
    }

    root.dataset.fx = "on";

    // 數字 count-up：0 → data-count，600ms easeOutCubic，只跑一次
    function countUp(el: HTMLElement) {
      if (el.dataset.counted === "1") return;
      el.dataset.counted = "1";
      const target = Number(el.dataset.count ?? "0");
      if (!Number.isFinite(target) || target <= 0) return;
      const dur = 600;
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min((now - t0) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = String(Math.round(target * eased));
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = String(target);
      };
      el.textContent = "0";
      requestAnimationFrame(step);
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          el.dataset.shown = "true";
          el.querySelectorAll<HTMLElement>("[data-count]").forEach(countUp);
          io.unobserve(el);
        }
      },
      // 進視窗一點點就播，底部留 8% 讓動畫在使用者看到之前就起跑
      { rootMargin: "0px 0px -8% 0px", threshold: 0 }
    );

    const observeAll = (scope: ParentNode) => {
      scope.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
        if (el.dataset.shown !== "true") io.observe(el);
      });
    };
    observeAll(document);

    // 篩選作品分類、切換服務軸時會長出新節點；沒接上 observer 的話會永遠停在 opacity:0。
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        r.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          if (n.hasAttribute("data-reveal") && n.dataset.shown !== "true") io.observe(n);
          observeAll(n);
        });
      }
    });
    mo.observe(root, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);

  return null;
}
