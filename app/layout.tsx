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
    // Google Fonts 只給前台用，放在 app/(site)/layout.tsx；後台不載（工單 A4 另見 components/order/A4FontLoader.tsx）。
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
