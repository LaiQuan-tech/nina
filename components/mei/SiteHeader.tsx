"use client";

import { useEffect, useRef, useState } from "react";
import { CONTACT, NAV } from "@/lib/site/content";
import { openChat } from "@/components/mei/OpenChatButton";

// sticky header：桌機五項 nav，手機收成右滑抽屜。
// 捲動 >80px 時加一條底線陰影（設計稿 Interactions）。
export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [stuck, setStuck] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 80);
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
      <header className="mei-header" data-stuck={stuck ? "true" : "false"}>
        <div className="mei-page mei-pad mei-header-in">
          <a className="mei-brand" href="/" aria-label={`${CONTACT.company} 首頁`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mei.png" alt="" width={30} height={30} aria-hidden="true" />
            <span>
              <span className="nm" style={{ display: "block" }}>
                美強光
              </span>
              <span className="sub" aria-hidden="true">
                MEI5899 · 廣告科技
              </span>
            </span>
          </a>

          <nav className="mei-nav" aria-label="主要導覽">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className={n.primary ? undefined : "mei-nav-more"}>
                {n.label}
              </a>
            ))}
          </nav>

          <div className="mei-head-right">
            <button type="button" className="mei-cta" onClick={() => openChat()}>
              線上詢價
            </button>
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
