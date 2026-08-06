"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CHAT_OPEN_EVENT, CONTACT } from "@/lib/site/content";

// 這些頁面本身就有主要動作（上傳、登入、註冊、查紀錄），
// 右下角的浮動鈕會壓在滿版按鈕上，所以不顯示。
const HIDE_ON = ["/upload", "/login", "/register", "/member"];

type Msg = { role: "ai" | "me"; text: string };

const GREETING = "您好！要做什麼尺寸的輸出？也可以直接把檔案丟給我。";

// AI 詢價視窗（Stage 1：版面與開合行為）。
// 對話後端（規格問答 → 報價 → 下單 → 收稿）在 Stage 4b 接上，
// 在那之前輸入列停用，改以「上傳稿件／LINE／來電」三個真的能用的出口承接客戶。
export default function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "ai", text: GREETING }]);
  const [quick, setQuick] = useState<string[]>(["我要報價", "我要傳檔案", "找專員"]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // 由 header CTA / hero 按鈕 / 服務卡 觸發開啟
  useEffect(() => {
    const onOpen = (e: Event) => {
      const prefill = (e as CustomEvent<{ prefill?: string }>).detail?.prefill;
      setOpen(true);
      if (prefill) {
        setMsgs((m) => [
          ...m,
          { role: "me", text: prefill },
          {
            role: "ai",
            text: "收到。線上即時報價整備中，請先上傳稿件或聯繫專員，我們會依規格回覆正式報價。",
          },
        ]);
        setQuick(["我要傳檔案", "找專員"]);
      }
    };
    window.addEventListener(CHAT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CHAT_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, open]);

  // 手機是全螢幕 sheet → 開啟時鎖背景捲動；Esc 關閉
  useEffect(() => {
    if (!open) return;
    const mobile = window.matchMedia("(max-width: 639px)").matches;
    const prev = document.body.style.overflow;
    if (mobile) document.body.style.overflow = "hidden";
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

  function pick(q: string) {
    if (q === "我要傳檔案") {
      window.location.href = "/upload";
      return;
    }
    if (q === "找專員") {
      window.open(CONTACT.line, "_blank", "noopener");
      return;
    }
    setMsgs((m) => [
      ...m,
      { role: "me", text: q },
      {
        role: "ai",
        text: `線上即時報價整備中。您可以先把稿件傳過來（我們會自動檢查檔名格式），或直接聯繫專員：${CONTACT.phone}。營業時間 ${CONTACT.hours}。`,
      },
    ]);
    setQuick(["我要傳檔案", "找專員"]);
  }

  if (HIDE_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  return (
    <>
      {!open && (
        <button type="button" className="mei-fab" aria-label="開啟 AI 詢價" onClick={() => setOpen(true)}>
          <span className="mei-bars" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </button>
      )}

      {/* 關閉時由 CSS visibility:hidden 移出 tab 序 */}
      <section className="mei-chat" data-open={open ? "true" : "false"} aria-label="美強光 AI 詢價" aria-hidden={!open}>
        <header className="mei-chat-head">
          <span className="mei-bars" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="t">美強光 AI 詢價</span>
          <span className="st" aria-hidden="true">
            ONLINE
          </span>
          <button ref={closeRef} type="button" className="mei-chat-close" aria-label="關閉" onClick={() => setOpen(false)}>
            ✕
          </button>
        </header>

        <div className="mei-chat-body" ref={bodyRef}>
          {msgs.map((m, i) => (
            <p key={i} className={`mei-bub ${m.role === "me" ? "mei-bub-me" : "mei-bub-ai"}`} style={{ margin: 0 }}>
              {m.text}
            </p>
          ))}
          {quick.length > 0 && (
            <div className="mei-quick">
              {quick.map((q) => (
                <button key={q} type="button" className="mei-chip" onClick={() => pick(q)}>
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mei-chat-foot">
          <label htmlFor="mei-chat-input" className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
            輸入訊息
          </label>
          <input id="mei-chat-input" type="text" placeholder="線上對話整備中，請用上方選項" disabled />
          <button type="button" className="mei-send" aria-label="送出" disabled>
            ↑
          </button>
        </div>
      </section>
    </>
  );
}
