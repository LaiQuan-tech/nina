"use client";

import { useEffect, useRef, useState } from "react";
import type { ParseResult } from "@/lib/filename/publicTypes";
import { EXT_ALLOW, EXT_ALLOW_LABEL } from "@/lib/filename/segments";
import { summarizeUploadBatch, type UploadBatchSummary } from "@/lib/upload/completion";
import { tooLargeMessage, uploadViaTicket, type MsgLink } from "@/lib/upload/client";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/upload/limits";

// id：需要原地更新的訊息（「收件中…」的上傳進度）才有；links：訊息下方可點的聯絡管道（不進後台對話紀錄）。
type Msg = { role: "user" | "model"; text: string; tone?: "ok" | "err"; id?: string; links?: MsgLink[] };

const RECEIVING_TEXT = "檔名格式正確 ✅ 收件中…";

const EXAMPLE = "069871_{(月匯)百陽廣告}_(78)20260625WG星雲AI地板90x100cmpvc+霧-1CCPVC720N10M.ai";

export default function ChatUpload({
  sessionId,
  contactName,
  focusRequest = 0,
  onBatchStart,
  onBatchComplete,
}: {
  sessionId: string;
  contactName?: string;
  focusRequest?: number;
  onBatchStart?: () => void;
  onBatchComplete?: (summary: UploadBatchSummary) => void;
}) {
  const greeting = `${contactName ? contactName + "您好 👋 " : "您好 👋 "}請把印刷檔拖進來、或點下方按鈕選檔。我會先幫您檢查檔名格式；格式正確才會收件，格式不對我會告訴您怎麼修改。可以一次上傳多個檔案。`;
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "model", text: greeting }]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadButtonRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  useEffect(() => {
    if (focusRequest > 0) uploadButtonRef.current?.focus();
  }, [focusRequest]);

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
    onBatchStart?.();
    setBusy(true);
    try {
      if (files.length > 1) {
        add({ role: "model", text: `收到 ${files.length} 個檔案，我依序幫您檢查 👀` });
      }
      const results: boolean[] = [];
      for (const f of files) results.push(await processFile(f));
      onBatchComplete?.(summarizeUploadBatch(results));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function processFile(file: File): Promise<boolean> {
    add({ role: "user", text: `📄 ${file.name}` });

    // 0) 先擋檔案格式：只接受 TIF/AI/PSD/JPG/PDF。格式不對就請客人重傳，
    //    不進檔名引導、不上傳（拖拉會繞過 <input accept>，所以這裡才是真正的關卡）。
    const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
    if (!EXT_ALLOW.includes(ext)) {
      add({
        role: "model",
        tone: "err",
        text: `這個檔案格式不支援。我們只接受 ${EXT_ALLOW_LABEL} 檔，請換成正確的格式再上傳一次。`,
      });
      return false;
    }

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
        return false;
      }

      // 3) 檔名正確 → 先看大小：超過上限就不上傳，告訴客人實際大小、上限與替代管道
      if (file.size > MAX_UPLOAD_BYTES) {
        const tooLarge = tooLargeMessage(file.size);
        add({ role: "model", tone: "err", text: tooLarge.text, links: tooLarge.links });
        return false;
      }

      // 4) 直傳：票券 → 瀏覽器直接 PUT 到 Supabase Storage（進度更新在「收件中…」這則）→ 通知伺服器建單。
      //    檔案不經過 Vercel 函式（請求主體上限 4.5MB），伺服器只負責簽發與建單，並在兩端都再驗一次檔名與大小。
      const progressId = `recv-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      add({ role: "model", tone: "ok", text: RECEIVING_TEXT, id: progressId });
      let lastPct = -1;
      const outcome = await uploadViaTicket(file, sessionId, (fraction) => {
        const pct = Math.min(100, Math.max(0, Math.floor(fraction * 100)));
        if (pct === lastPct) return;
        lastPct = pct;
        // 只改畫面、不同步對話紀錄（進度事件很密）；下一則訊息 add() 時會連同最後的百分比一起記錄
        setMsgs((prev) => prev.map((m) => (m.id === progressId ? { ...m, text: `${RECEIVING_TEXT} ${pct}%` } : m)));
      });

      if (outcome.kind === "ok") {
        add({
          role: "model",
          tone: "ok",
          text: `✅ 送件成功！已收到您的檔案（${file.name}），我們會盡快為您處理。若還有其他檔案，可以繼續上傳。`,
        });
        return true;
      }
      if (outcome.kind === "too_large") {
        const tooLarge = tooLargeMessage(file.size);
        add({ role: "model", tone: "err", text: tooLarge.text, links: tooLarge.links });
        return false;
      }
      add({ role: "model", tone: "err", text: "收件失敗，請稍後再試一次。" });
      return false;
    } catch {
      add({ role: "model", tone: "err", text: "連線出了點問題，請稍後再試一次。" });
      return false;
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    void handleFiles(e.dataTransfer.files);
  }

  return (
    <div
      className="mei-drop"
      data-over={dragOver ? "true" : "false"}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="mei-log" ref={scrollRef} aria-live="polite">
        {msgs.map((m, i) => (
          <p
            key={i}
            className={`mei-bub ${
              m.role === "user" ? "mei-bub-me" : m.tone === "err" ? "mei-bub-err" : "mei-bub-ai"
            }`}
            style={{ margin: 0, ...(m.tone === "ok" ? { background: "var(--mei-ink)", color: "var(--mei-paper)" } : {}) }}
          >
            {m.text}
            {m.links && m.links.length > 0 && (
              <span style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", marginTop: 6 }}>
                {m.links.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    target={l.href.startsWith("http") ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    style={{ color: "inherit", fontWeight: 600, textDecoration: "underline" }}
                  >
                    {l.label}
                  </a>
                ))}
              </span>
            )}
          </p>
        ))}
        {busy && (
          <p className="mei-bub mei-bub-ai" style={{ margin: 0, color: "var(--mei-text-3)" }}>
            <span className="mei-typing" aria-label="處理中">
              <i />
              <i />
              <i />
            </span>
          </p>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        hidden
        multiple
        accept={EXT_ALLOW.map((e) => "." + e).join(",")}
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <button
        ref={uploadButtonRef}
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="mei-btn mei-btn-primary"
        style={{ width: "100%", minHeight: 48 }}
      >
        選擇印刷檔上傳（可多選，或拖曳到這裡）
      </button>
      <p className="mei-mono-s" style={{ marginTop: 9 }}>
        單檔上限 {MAX_UPLOAD_LABEL}
        <br />
        正確檔名範例：{EXAMPLE}
      </p>
    </div>
  );
}
