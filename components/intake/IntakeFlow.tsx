"use client";

import { useCallback, useEffect, useState } from "react";
import ContactGate, { type Contact } from "@/components/intake/ContactGate";
import ChatUpload from "@/components/ai/ChatUpload";
import { SetPasswordCard } from "@/components/member/MemberActions";
import { clearLastPhone, loadLastPhone } from "@/components/intake/contactStorage";

type Member = { id: string; name: string; phone: string; phoneDisplay: string; email: string | null; status: string };

type Step =
  | { name: "loading" }
  | { name: "form"; initialPhone: string }
  | { name: "upload"; sessionId: string; who: string; status: string };

function newSessionId() {
  return globalThis.crypto?.randomUUID?.() ?? `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * 收稿流程：
 *   已登入（有 mei_member cookie）→ 完全跳過聯絡表單，直接進上傳
 *   未登入 → ContactGate（送出時順手完成無痛入會）
 * 第一次上傳成功後，guest 會看到「設定密碼」提示 —— 沒設密碼換裝置就進不來。
 */
export default function IntakeFlow() {
  const [step, setStep] = useState<Step>({ name: "loading" });
  const [uploaded, setUploaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = (await fetch("/api/member/session").then((r) => r.json())) as { member?: Member | null };
        if (!alive) return;
        if (d.member) {
          // 已登入：直接開一個新案件掛在這個會員底下
          const sessionId = newSessionId();
          await fetch("/api/member/quick-start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              name: d.member.name,
              email: d.member.email || `${d.member.phone}@no-email.local`,
              phone: d.member.phone,
              remember: true,
            }),
          }).catch(() => {});
          if (!alive) return;
          setStep({ name: "upload", sessionId, who: d.member.name, status: d.member.status });
        } else {
          setStep({ name: "form", initialPhone: loadLastPhone() });
        }
      } catch {
        if (alive) setStep({ name: "form", initialPhone: loadLastPhone() });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const switchContact = useCallback(async () => {
    clearLastPhone();
    await fetch("/api/member/login", { method: "DELETE" }).catch(() => {});
    setUploaded(false);
    setStep({ name: "form", initialPhone: "" });
  }, []);

  if (step.name === "loading") {
    return <div style={{ height: 240 }} aria-hidden="true" />;
  }

  if (step.name === "form") {
    return (
      <ContactGate
        initialPhone={step.initialPhone}
        onReady={(id, contact: Contact, status) =>
          setStep({ name: "upload", sessionId: id, who: contact.name, status })
        }
      />
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 8,
          fontSize: 13,
          color: "var(--mei-text-3)",
        }}
      >
        <span>
          目前以 <strong style={{ color: "var(--mei-ink)" }}>{step.who}</strong> 發稿
        </span>
        <button onClick={switchContact} className="mei-link">
          換一個聯絡人
        </button>
      </div>

      <ChatUpload sessionId={step.sessionId} contactName={step.who} onSubmitted={() => setUploaded(true)} />

      {uploaded && step.status === "guest" && (
        <div style={{ marginTop: 16 }}>
          <SetPasswordCard />
        </div>
      )}
    </div>
  );
}
