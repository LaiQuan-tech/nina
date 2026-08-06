import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "美強光廣告科技｜大圖輸出・廣告帆布・UV 直噴・招牌燈箱・立體字",
  description:
    "新北三重大圖輸出廠。廣告帆布無接縫 3米／5米、大圖輸出、UV 直噴、車體廣告、招牌燈箱、立體字、團體服、旗幟布條。FTP 24 小時收檔，線上詢價、線上發稿。",
  icons: { icon: "/logo-mei.png", apple: "/logo-mei.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Google Fonts 對 CJK 有 unicode-range 分片，未用到的字重／字元不會下載 */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@500;700;900&family=Noto+Sans+TC:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
