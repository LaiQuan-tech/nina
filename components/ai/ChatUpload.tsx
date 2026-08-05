"use client";

import { useEffect, useRef, useState } from "react";
import type { ParseResult } from "@/lib/filename/publicTypes";

type Msg = { role: "user" | "model"; text: string; tone?: "ok" | "err" };

const EXAMPLE = "069871_{(月匯)百陽廣告}_(78)20260625WG星雲AI地板90x100cmpvc+霧-1CCPVC720N10M.ai";

export default function ChatUpload({ sessionId, contactName }: { sessionId: string; contactName?: string }) {
  const greeting = `${contactName ? contactName + "您好 👋 " : "您好 👋 "}請把印刷檔拖進來、或點下方按鈕選檔。我會先幫您檢查檔名格式；格式正確才會收件，格式不對我會告訴您怎麼修改。可以一次上傳多個檔案。`;
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "model", text: greeting }]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  // 每次對話變動 → 記錄到後台案件（吞錯，不影響客戶）
  function syncLog(all: Msg[]) {
    void fetch("/api/session/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, messages: all.map((m) => ({ role: m.role, text: m.text })) }),
    }).catch(() => {});
  }

  function add(m: Msg) {
    setMsgs((prev) => {
      const next = [...prev, m];
      syncLog(next);
      return next;
    });
  }

  // 一批檔案依序處理（單一 busy 鎖，避免同時上傳互相打架）
  async function handleFiles(list: FileList | null) {
    if (busy || !list || list.length === 0) return;
    const files = Array.from(list);
    setBusy(true);
    try {
      if (files.length > 1) {
        add({ role: "model", text: `收到 ${files.length} 個檔案，我依序幫您檢查 👀` });
      }
      for (const f of files) {
        await processFile(f);
      }
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function processFile(file: File) {
    add({ role: "user", text: `📄 ${file.name}` });

    try {
      // 1) 只送檔名驗證（不傳 bytes）
      const v = (await fetch("/api/filename/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name }),
      }).then((r) => r.json())) as { ok: boolean; result?: ParseResult };

      if (!v.ok || !v.result || !v.result.ok) {
        // 2) 檔名錯 → 取 AI 引導（失敗自動 fallback），不上傳
        const g = (await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, result: v.result }),
        }).then((r) => r.json())) as { ok: boolean; reply?: string };
        add({ role: "model", tone: "err", text: g.reply || "檔名格式不正確，請調整後再上傳一次。" });
        return;
      }

      // 3) 檔名正確 → 真正上傳（帶 sessionId）
      add({ role: "model", tone: "ok", text: "檔名格式正確 ✅ 收件中…" });
      const fd = new FormData();
      fd.append("file", file);
      fd.append("sessionId", sessionId);
      const up = (await fetch("/api/upload", { method: "POST", body: fd }).then((r) => r.json())) as {
        ok: boolean;
        error?: string;
      };

      if (up.ok) {
        add({
          role: "model",
          tone: "ok",
          text: `✅ 送件成功！已收到您的檔案（${file.name}），我們會盡快為您處理。若還有其他檔案，可以繼續上傳。`,
        });
      } else {
        add({ role: "model", tone: "err", text: "收件失敗，請稍後再試一次。" });
      }
    } catch {
      add({ role: "model", tone: "err", text: "連線出了點問題，請稍後再試一次。" });
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    void handleFiles(e.dataTransfer.files);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      style={{ border: dragOver ? "2px dashed var(--s-red)" : "2px solid transparent", padding: dragOver ? 6 : 0, transition: "border-color .15s" }}
    >
      <div
        ref={scrollRef}
        style={{ maxHeight: 300, overflowY: "auto", marginBottom: 14, paddingRight: 2 }}
      >
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`s-bub${m.role === "user" ? " me" : ""}`}
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              ...(m.tone === "err"
                ? { background: "#fff", border: "2px solid var(--s-red)", color: "var(--s-red-deep)" }
                : m.tone === "ok"
                  ? { background: "var(--s-ink)", color: "var(--s-bg)" }
                  : {}),
            }}
          >
            {m.text}
          </div>
        ))}
        {busy && (
          <div className="s-bub" style={{ color: "var(--s-dim)" }}>
            處理中…
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        hidden
        multiple
        accept=".ai,.pdf,.eps,.psd,.tif,.tiff,.jpg,.jpeg,.png"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <button onClick={() => fileRef.current?.click()} disabled={busy} className="s-btn s-btn-primary" style={{ width: "100%" }}>
        📎 選擇印刷檔上傳（可多選，或拖曳到這裡）
      </button>
      <div className="s-mono" style={{ fontSize: 10, color: "var(--s-faint)", marginTop: 9, lineHeight: 1.6, wordBreak: "break-all" }}>
        正確檔名範例：{EXAMPLE}
      </div>
    </div>
  );
}
