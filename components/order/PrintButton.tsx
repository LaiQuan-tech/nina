"use client";

export default function PrintButton({ className }: { className?: string }) {
  return (
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
  );
}
