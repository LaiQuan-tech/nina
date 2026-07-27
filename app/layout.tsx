import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "美強光印刷 · AI 收稿系統",
  description: "上傳印刷檔，系統自動檢查檔名格式並引導修正，格式正確才收檔並產生工單。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
