"use client";

import { useState } from "react";
import ContactGate, { type Contact } from "@/components/intake/ContactGate";
import ChatUpload from "@/components/ai/ChatUpload";

// 兩段式：先聯絡表單 gate → 填完才顯示上傳聊天框。
export default function IntakeFlow() {
  const [session, setSession] = useState<{ id: string; contact: Contact } | null>(null);

  if (!session) {
    return <ContactGate onReady={(id, contact) => setSession({ id, contact })} />;
  }
  return <ChatUpload sessionId={session.id} contactName={session.contact.name} />;
}
