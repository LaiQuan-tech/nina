import type { IntakeMessage } from "@/lib/intakeSessions";

// 對話泡泡（後台檢視客戶對話）：user 靠右藍底、model 靠左白底。
export default function TranscriptView({ messages }: { messages: IntakeMessage[] }) {
  if (!messages || messages.length === 0) {
    return <div style={{ color: "#9aa3b0", fontSize: 14 }}>（尚無對話）</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {messages.map((m, i) => (
        <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
          <div
            style={{
              maxWidth: "80%",
              padding: "10px 14px",
              borderRadius: 14,
              fontSize: 14,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: m.role === "user" ? "#2563eb" : "#fff",
              color: m.role === "user" ? "#fff" : "#1c1c1e",
              border: m.role === "user" ? "none" : "1px solid #eef0f3",
            }}
          >
            {m.text}
          </div>
        </div>
      ))}
    </div>
  );
}
