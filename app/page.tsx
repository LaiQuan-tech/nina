import IntakeFlow from "@/components/intake/IntakeFlow";

export default function HomePage() {
  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px 60px" }}>
      <div style={{ width: "100%", maxWidth: 560, textAlign: "center", marginBottom: 26 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--brand)", letterSpacing: 2, marginBottom: 6 }}>美強光廣告科技</div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 10px", letterSpacing: 0.5 }}>AI 線上收稿</h1>
        <p style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.7, margin: 0 }}>
          留下聯絡方式後即可上傳印刷檔。系統會自動檢查檔名格式，
          <br />
          若格式不對會引導您修正，格式正確才收件。
        </p>
      </div>
      <div style={{ width: "100%", maxWidth: 560 }}>
        <IntakeFlow />
      </div>
    </main>
  );
}
