"use client";

import { useEffect, useRef, useState } from "react";
import { CONTACT, NAV } from "@/lib/site/content";
import { openChat } from "@/components/mei/OpenChatButton";

// sticky header：桌機五項 nav，手機收成右滑抽屜。
// 捲動 >80px 時加一條底線陰影（設計稿 Interactions）。
export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  // data-stuck 純粹是視覺旗標，直接寫 DOM 而不進 React state：
  // 走 state 的話每次跨過 80px 門檻都要重繪整個 header 與抽屜。
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    let last = "";
    const onScroll = () => {
      const v = window.scrollY > 80 ? "true" : "false";
      if (v !== last) {
        last = v;
        el.dataset.stuck = v;
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // 抽屜開啟時鎖背景捲動 + Esc 關閉 + 焦點移到關閉鈕
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <header ref={headerRef} className="mei-header" data-stuck="false">
        <div className="mei-page mei-pad mei-header-in">
          <a className="mei-brand" href="/" aria-label={`${CONTACT.company} 首頁`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mei.png" alt="" width={30} height={30} aria-hidden="true" />
            <span className="nm">美強光廣告科技</span>
          </a>

          <nav className="mei-nav" aria-label="主要導覽">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className={n.primary ? undefined : "mei-nav-more"}>
                {n.label}
              </a>
            ))}
          </nav>

          <div className="mei-head-right">
            {/* 熟客最常做的動作是直接發稿；詢價入口在 hero 按鈕與右下角 AI 視窗 */}
            <a className="mei-cta" href="/upload">
              上傳稿件
            </a>
            <button
              type="button"
              className="mei-burger"
              aria-label="開啟選單"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <span />
            </button>
          </div>
        </div>
      </header>

      <div
        className="mei-scrim"
        data-open={open ? "true" : "false"}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      {/* 關閉時由 CSS visibility:hidden 移出 tab 序，不需 inert */}
      <aside className="mei-drawer" data-open={open ? "true" : "false"} aria-hidden={!open}>
        <div className="mei-drawer-top">
          <span className="mei-bars" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <button
            ref={closeRef}
            type="button"
            className="mei-drawer-close"
            aria-label="關閉選單"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
        </div>

        <nav aria-label="行動版導覽">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} onClick={() => setOpen(false)}>
              {n.label}
            </a>
          ))}
        </nav>

        <div className="mei-drawer-foot">
          <button
            type="button"
            className="mei-btn mei-btn-primary"
            style={{ width: "100%", minHeight: 48 }}
            onClick={() => {
              setOpen(false);
              openChat();
            }}
          >
            找 AI 幫我報價
          </button>
          <a className="tel" href={CONTACT.phoneHref}>
            {CONTACT.phone}
          </a>
        </div>
      </aside>
    </>
  );
}
