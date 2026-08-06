"use client";

import { CHAT_OPEN_EVENT } from "@/lib/site/content";

// 讓 server component 裡的按鈕也能開啟 AI 詢價視窗：
// 走全域 CustomEvent，不必為此把整棵樹變成 client 或加 context provider。
export function openChat(prefill?: string) {
  window.dispatchEvent(new CustomEvent(CHAT_OPEN_EVENT, { detail: { prefill } }));
}

export default function OpenChatButton({
  children,
  className = "mei-btn mei-btn-primary",
  prefill,
}: {
  children: React.ReactNode;
  className?: string;
  prefill?: string;
}) {
  return (
    <button type="button" className={className} onClick={() => openChat(prefill)}>
      {children}
    </button>
  );
}
