import SiteHeader from "@/components/mei/SiteHeader";
import SiteFooter from "@/components/mei/SiteFooter";
import ChatWidget from "@/components/mei/ChatWidget";
import ScrollFx from "@/components/mei/ScrollFx";

// 官網外殼：所有前台頁面共用 header / footer / AI 詢價視窗。
// `.mei` 是設計系統的作用域根，後台（.adm-*）與工單（.wo-*）完全不受影響。
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* 官網字型只在前台載入（原本在根 layout，連後台都擋渲染）。React 會把這幾個 <link> 提升到 <head>；
          stylesheet 帶 precedence 才會被提升，並跟原本一樣在 <head> 裡擋渲染，前台外觀不變。
          Google Fonts 對 CJK 有 unicode-range 分片，未用到的字重／字元不會下載。 */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@500;700;900&family=Noto+Sans+TC:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap"
        precedence="default"
      />
      <div className="mei">
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
        <ChatWidget />
        <ScrollFx />
      </div>
    </>
  );
}
