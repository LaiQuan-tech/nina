"use client";

export default function PrintButton({ className }: { className?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <button
        className={className}
        onClick={() => window.print()}
        style={{
          border: "none",
          borderRadius: 10,
          padding: "9px 18px",
          background: "var(--brand)",
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        🖨️ 列印工單
      </button>
      {/* A4 工單零邊界對版，列印對話框沒設對會跑版，所以每次都提醒。 */}
      <span style={{ fontSize: 11, color: "var(--muted)", textAlign: "right" }}>
        列印設定請選：縮放 100%／邊界「預設」／勾選「背景圖形」
      </span>
    </div>
  );
}
