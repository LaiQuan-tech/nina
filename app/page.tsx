import ChatUpload from "@/components/ai/ChatUpload";

export default function HomePage() {
  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px 60px" }}>
      <div style={{ width: "100%", maxWidth: 560, textAlign: "center", marginBottom: 26 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 10px", letterSpacing: 0.5 }}>印刷檔線上收稿</h1>
        <p style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.7, margin: 0 }}>
          上傳前系統會自動檢查檔名格式。若格式不對，小幫手會引導你修正；
          <br />
          格式正確才收檔，並自動幫你建立一張工單。
        </p>
      </div>
      <div style={{ width: "100%", maxWidth: 560 }}>
        <ChatUpload />
      </div>
    </main>
  );
}
