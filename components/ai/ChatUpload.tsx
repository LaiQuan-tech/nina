"use client";

import { useEffect, useRef, useState } from "react";
import type { ParseResult, ChatTurn } from "@/lib/filename/publicTypes";

type Msg = {
  role: "user" | "model";
  text: string;
  link?: { href: string; label: string };
  tone?: "ok" | "err";
};

const GREETING =
  "嗨 👋 我是收稿小幫手。請把你的印刷檔拖進來、或點下方按鈕選檔，我會先幫你檢查檔名格式；格式對了才會收檔並自動幫你開工單。";

const EXAMPLE = "069871_{(月匯)百陽廣告}_(78)20260625WG星雲AI地板90x100cmpvc+霧-1CCPVC720N10M.ai";

export default function ChatUpload() {
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "model", text: GREETING }]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  function add(m: Msg) {
    setMsgs((prev) => [...prev, m]);
  }

  async function handleFile(file: File) {
    if (busy) return;
    setBusy(true);
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
        add({
          role: "model",
          tone: "err",
          text: g.reply || "檔名格式不正確，請調整後再上傳一次。",
        });
        return;
      }

      // 3) 檔名正確 → 真正上傳
      add({ role: "model", tone: "ok", text: "檔名格式正確 ✅ 收檔中…" });
      const fd = new FormData();
      fd.append("file", file);
      const up = (await fetch("/api/upload", { method: "POST", body: fd }).then((r) =>
        r.json()
      )) as {
        ok: boolean;
        orderId?: string;
        orderNo?: string;
        error?: string;
        productMatched?: boolean;
        productName?: string;
      };

      if (up.ok && up.orderId) {
        const productLine = up.productName
          ? up.productMatched
            ? `\n商品：${up.productName}`
            : `\n商品：${up.productName}（⚠ 非標準商品，已標記待人工確認）`
          : "";
        add({
          role: "model",
          tone: "ok",
          text: `收檔完成，已建立工單 ${up.orderNo} 🎉${productLine}`,
          link: { href: `/order/${up.orderId}`, label: "檢視 / 列印工單 →" },
        });
      } else {
        add({ role: "model", tone: "err", text: `收檔失敗（${up.error ?? "unknown"}），請稍後再試。` });
      }
    } catch {
      add({ role: "model", tone: "err", text: "連線出了點問題，請稍後再試一次。" });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "min(72vh, 640px)",
        background: "var(--panel)",
        borderRadius: 18,
        boxShadow: "0 12px 40px rgba(20,40,80,.10)",
        overflow: "hidden",
        border: dragOver ? "2px dashed var(--brand)" : "2px solid transparent",
        transition: "border-color .15s",
      }}
    >
      {/* header */}
      <div style={{ padding: "16px 20px", background: "#1c1c1e", color: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#2563eb,#06b6d4)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
          N
        </span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>印刷檔收稿小幫手</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.66)", marginTop: 2 }}>檔名檢查 · 自動建工單</div>
        </div>
      </div>

      {/* messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 18 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 12 }}>
            <div
              style={{
                maxWidth: "86%",
                padding: "11px 15px",
                borderRadius: 15,
                fontSize: 14.5,
                lineHeight: 1.65,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                background: m.role === "user" ? "var(--brand)" : m.tone === "err" ? "#fff4f4" : m.tone === "ok" ? "#f0fdf4" : "#f2f4f7",
                color: m.role === "user" ? "#fff" : "var(--ink)",
                border: m.tone === "err" ? "1px solid #fbd0d0" : m.tone === "ok" ? "1px solid #bbf7d0" : "none",
              }}
            >
              {m.text}
              {m.link && (
                <div style={{ marginTop: 8 }}>
                  <a href={m.link.href} style={{ fontWeight: 600 }}>
                    {m.link.label}
                  </a>
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 12 }}>
            <div style={{ padding: "11px 15px", borderRadius: 15, background: "#f2f4f7", color: "var(--muted)", fontSize: 14 }}>處理中…</div>
          </div>
        )}
      </div>

      {/* uploader */}
      <div style={{ borderTop: "1px solid rgba(0,0,0,.08)", padding: 14, background: "#fff" }}>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept=".ai,.pdf,.eps,.psd,.tif,.tiff,.jpg,.jpeg,.png"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          style={{
            width: "100%",
            border: "none",
            borderRadius: 12,
            padding: "13px 16px",
            background: busy ? "#9db4e8" : "var(--brand)",
            color: "#fff",
            fontSize: 15,
            fontWeight: 600,
            cursor: busy ? "default" : "pointer",
          }}
        >
          📎 選擇印刷檔上傳（或拖曳檔案到這裡）
        </button>
        <div style={{ fontSize: 11.5, color: "var(--muted)", textAlign: "center", marginTop: 9, lineHeight: 1.6 }}>
          正確檔名範例：
          <br />
          <code style={{ fontSize: 11, wordBreak: "break-all" }}>{EXAMPLE}</code>
        </div>
      </div>
    </div>
  );
}
