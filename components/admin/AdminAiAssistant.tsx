"use client";

import { useEffect, useRef, useState } from "react";

type AssistantLink = { label: string; href: string };
type Message = {
  role: "user" | "model";
  text: string;
  source?: "gemini" | "safe_report";
  links?: AssistantLink[];
  error?: boolean;
};

const QUICK_PROMPTS = ["整理目前營運概況", "今天有哪些逾期回訪？", "列出 VIP 客戶", "最常使用的材質"];

const WELCOME: Message = {
  role: "model",
  text: "我是後台 AI 小幫手。您可以直接問客戶、報價、工單與回訪狀況，或請我整理一份 Demo 營運報表。",
  source: "safe_report",
};

export default function AdminAiAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  function close() {
    setOpen(false);
    requestAnimationFrame(() => buttonRef.current?.focus());
  }

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const nextUser: Message = { role: "user", text: trimmed };
    const nextMessages = [...messages, nextUser];
    setMessages(nextMessages);
    setQuery("");
    setBusy(true);
    try {
      const history = messages
        .filter((message) => !message.error)
        .slice(-8)
        .map(({ role, text: content }) => ({ role, text: content.slice(0, 1000) }));
      const response = await fetch("/api/admin/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, history }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        reply?: string;
        source?: "gemini" | "safe_report";
        links?: AssistantLink[];
      };
      if (!response.ok || !data.ok || !data.reply) throw new Error("assistant_failed");
      setMessages((current) => [
        ...current,
        { role: "model", text: data.reply!, source: data.source ?? "safe_report", links: data.links ?? [] },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        { role: "model", text: "目前無法取得報表，請稍後再試一次。既有資料不會受到影響。", error: true },
      ]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="adm-ai-fab no-print"
        aria-label={open ? "關閉 AI 小幫手" : "開啟 AI 小幫手"}
        aria-expanded={open}
        aria-controls="admin-ai-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">AI</span>
        <i aria-hidden="true" />
      </button>

      <section
        id="admin-ai-panel"
        className="adm-ai-panel no-print"
        data-open={open ? "true" : "false"}
        role="dialog"
        aria-modal="false"
        aria-labelledby="admin-ai-title"
        aria-hidden={!open}
      >
        <header className="adm-ai-head">
          <span className="adm-ai-mark" aria-hidden="true">AI</span>
          <div>
            <h2 id="admin-ai-title">AI 資料小幫手</h2>
            <p>Demo 資料 · 只讀分析</p>
          </div>
          <button type="button" onClick={close} aria-label="關閉 AI 小幫手">×</button>
        </header>

        <div className="adm-ai-log" ref={logRef} aria-live="polite">
          {messages.map((message, index) => (
            <article key={index} className="adm-ai-message" data-role={message.role} data-error={message.error ? "true" : "false"}>
              <p>{message.text}</p>
              {message.role === "model" && message.source && index > 0 && (
                <small>{message.source === "gemini" ? "AI 分析 · 依 Demo 資料" : "安全報表 · AI 備援"}</small>
              )}
              {!!message.links?.length && (
                <nav aria-label="相關資料">
                  {message.links.map((link) => <a key={link.href + link.label} href={link.href}>{link.label}</a>)}
                </nav>
              )}
            </article>
          ))}
          {busy && (
            <div className="adm-ai-loading" role="status">
              <i /><i /><i /> 正在整理安全報表
            </div>
          )}
        </div>

        {messages.length === 1 && (
          <div className="adm-ai-quick" aria-label="快速提問">
            {QUICK_PROMPTS.map((prompt) => (
              <button key={prompt} type="button" onClick={() => void ask(prompt)} disabled={busy}>{prompt}</button>
            ))}
          </div>
        )}

        <form
          className="adm-ai-form"
          onSubmit={(event) => {
            event.preventDefault();
            void ask(query);
          }}
        >
          <label htmlFor="admin-ai-query">詢問 Demo 營運資料</label>
          <div>
            <input
              ref={inputRef}
              id="admin-ai-query"
              value={query}
              maxLength={600}
              autoComplete="off"
              placeholder="例如：列出本週要追蹤的客戶"
              onChange={(event) => setQuery(event.target.value)}
              disabled={busy}
            />
            <button type="submit" disabled={busy || !query.trim()} aria-label="送出問題">送出</button>
          </div>
          <p>只會查詢與整理資料，不會直接修改資料。</p>
        </form>
      </section>
    </>
  );
}
