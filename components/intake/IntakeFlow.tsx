"use client";

import { useEffect, useState } from "react";
import ContactGate, { type Contact } from "@/components/intake/ContactGate";
import WelcomeBack from "@/components/intake/WelcomeBack";
import ChatUpload from "@/components/ai/ChatUpload";
import { loadContact, clearContact } from "@/components/intake/contactStorage";

type Step =
  | { name: "loading" }
  | { name: "welcome"; contact: Contact }
  | { name: "form"; initial: Contact | null }
  | { name: "upload"; sessionId: string; contact: Contact };

// 客戶流程：
// 有記住的聯絡資訊 → WelcomeBack（一鍵開始，免再填）
// 沒有 → ContactGate（可勾「記住我」）
// 進入 upload 後可「換一個聯絡人」回到表單。
export default function IntakeFlow() {
  const [step, setStep] = useState<Step>({ name: "loading" });

  // client 掛載後才讀 localStorage（避免 SSR 不一致）
  useEffect(() => {
    const saved = loadContact();
    setStep(saved ? { name: "welcome", contact: saved } : { name: "form", initial: null });
  }, []);

  // 用記住的聯絡資訊建立案件 → 進上傳
  async function continueWithSaved(contact: Contact) {
    const sessionId =
      globalThis.crypto?.randomUUID?.() ?? `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, ...contact }),
      });
      const data = await res.json();
      if (data.ok) {
        setStep({ name: "upload", sessionId, contact });
      } else {
        // 記住的資料失效 → 退回表單、預填
        setStep({ name: "form", initial: contact });
      }
    } catch {
      setStep({ name: "form", initial: contact });
    }
  }

  function switchContact(prefill: Contact | null) {
    clearContact();
    setStep({ name: "form", initial: prefill });
  }

  if (step.name === "loading") {
    return <div style={{ height: 260, borderRadius: 18, background: "var(--panel)", boxShadow: "0 12px 40px rgba(20,40,80,.10)" }} />;
  }

  if (step.name === "welcome") {
    return (
      <WelcomeBack
        contact={step.contact}
        onContinue={() => continueWithSaved(step.contact)}
        onSwitch={() => switchContact(step.contact)}
      />
    );
  }

  if (step.name === "form") {
    return <ContactGate initial={step.initial} onReady={(id, contact) => setStep({ name: "upload", sessionId: id, contact })} />;
  }

  // upload
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, fontSize: 13, color: "var(--muted)" }}>
        <span>
          目前以 <strong style={{ color: "var(--ink)" }}>{step.contact.name}</strong> 收稿
        </span>
        <button
          onClick={() => switchContact(step.contact)}
          style={{ border: "none", background: "transparent", color: "var(--brand)", fontSize: 13, cursor: "pointer" }}
        >
          換一個聯絡人
        </button>
      </div>
      <ChatUpload sessionId={step.sessionId} contactName={step.contact.name} />
    </div>
  );
}
